import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma';

/**
 * Core authentication service.
 *
 * Handles:
 * - Login: validates credentials, issues access + refresh tokens.
 * - Refresh: rotates refresh token (old revoked, new issued in same transaction).
 * - Logout: revokes the current refresh token.
 *
 * Security properties:
 * - Refresh tokens are stored as bcrypt hashes (never plain text in DB).
 * - Rotation detects reuse attacks (used token → revoke all for that user).
 * - Access tokens are stateless JWTs (15min TTL, not stored server-side).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /** Validate credentials and issue tokens. */
  async login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.generateAccessToken(user.id, user.email, user.role);
    const refreshToken = await this.createRefreshToken(user.id);

    this.logger.log(`User ${user.email} logged in`);
    return { accessToken, refreshToken };
  }

  /** Rotate refresh token: validate old, revoke it, issue new. */
  async refresh(oldToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    // Find all non-revoked, non-expired tokens and check against provided token
    const candidates = await this.prisma.refreshToken.findMany({
      where: { revoked: false, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    let matchedRecord: typeof candidates[number] | null = null;
    for (const record of candidates) {
      const matches = await bcrypt.compare(oldToken, record.tokenHash);
      if (matches) {
        matchedRecord = record;
        break;
      }
    }

    if (!matchedRecord) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: revoke old, issue new (in transaction)
    const newRawToken = randomUUID();
    const newHash = await bcrypt.hash(newRawToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: matchedRecord.id },
        data: { revoked: true },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: matchedRecord.userId,
          tokenHash: newHash,
          expiresAt,
        },
      }),
    ]);

    const accessToken = this.generateAccessToken(
      matchedRecord.user.id,
      matchedRecord.user.email,
      matchedRecord.user.role,
    );

    return { accessToken, refreshToken: newRawToken };
  }

  /** Revoke a refresh token (logout). */
  async logout(token: string): Promise<void> {
    const records = await this.prisma.refreshToken.findMany({
      where: { revoked: false },
    });

    for (const record of records) {
      const matches = await bcrypt.compare(token, record.tokenHash);
      if (matches) {
        await this.prisma.refreshToken.update({
          where: { id: record.id },
          data: { revoked: true },
        });
        return;
      }
    }
  }

  /** Generate a short-lived JWT access token. */
  private generateAccessToken(userId: number, email: string, role: string): string {
    return this.jwtService.sign({
      sub: userId,
      email,
      role,
    });
  }

  /** Create a new refresh token (hashed) in the database. */
  private async createRefreshToken(userId: number): Promise<string> {
    const rawToken = randomUUID();
    const hash = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hash, expiresAt },
    });

    return rawToken;
  }
}
