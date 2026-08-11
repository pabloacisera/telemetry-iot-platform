import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma';
import { CacheService } from '../cache';
import { EmailService } from './email.service';

/**
 * Alphabet without ambiguous characters (0/O, 1/l/I). Still alphanumeric
 * (letters A-Z/a-z + digits 2-9) as required for demo credentials.
 */
const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Random 8-char alphanumeric password guaranteed to contain at least one
 * uppercase and one lowercase letter. Cryptographic source (randomBytes).
 */
export function generateTemporaryPassword(length = 8): string {
  const chars = PASSWORD_ALPHABET.split('');

  // Retry until both cases are present (probabilistically ~always first try).
  while (true) {
    const bytes = randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars[bytes[i] % chars.length];
    }
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) {
      return password;
    }
  }
}

/**
 * Self-service demo signup from the public landing page.
 *
 * Flow: validate/normalize email → reject if already registered → generate a
 * temporary password → create the user (role from LANDING_DEMO_ROLE) → audit
 * the lead in Redis → send the welcome email with credentials.
 *
 * The password is never logged and never returned by the API.
 */
@Injectable()
export class LandingService {
  private readonly logger = new Logger(LandingService.name);
  private readonly demoRole: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly emailService: EmailService,
    configService: ConfigService,
  ) {
    this.demoRole = configService.get<string>('LANDING_DEMO_ROLE', 'viewer');
  }

  async subscribe(email: string): Promise<{ granted: boolean; email: string }> {
    const normalized = email.trim().toLowerCase();

    // Refuse to create orphan accounts when welcome emails cannot be delivered.
    if (!this.emailService.enabled) {
      throw new ServiceUnavailableException(
        'El servicio de correo no está configurado',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con este correo');
    }

    const password = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const username = normalized.split('@')[0];

    const user = await this.prisma.user.create({
      data: { email: normalized, passwordHash, role: this.demoRole },
    });
    this.logger.log(
      `Created demo account ${user.id} (role=${this.demoRole}) for ${normalized}`,
    );

    // Audit lead in Redis — must never fail the signup.
    try {
      await this.cacheService.saveLead(normalized);
    } catch (err) {
      this.logger.warn(
        `Redis lead save failed for ${normalized}: ${(err as Error).message}`,
      );
    }

    await this.emailService.sendWelcomeEmail(normalized, {
      username,
      email: normalized,
      password,
    });

    return { granted: true, email: normalized };
  }
}
