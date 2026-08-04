import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma';

/**
 * Authentication service — login, token rotation, and logout.
 *
 * Refresh token format: "jti:secret"
 * - jti (UUID) is stored in plaintext for O(1) lookup via unique index.
 * - secret is hashed with bcrypt for validation.
 *
 * Revocation policy (token reuse detection):
 * - On valid refresh: revoke the old token, issue a new one.
 * - If the presented token is already revoked (reuse detected): revoke ALL tokens
 *   for that user as a security measure.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /** Validate credentials and issue tokens. */
  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.generateAccessToken(
      user.id,
      user.email,
      user.role,
    );
    const refreshToken = await this.createRefreshToken(user.id);

    this.logger.log(`User ${user.email} logged in`);
    return { accessToken, refreshToken };
  }

  /**
   * Rotate refresh token: validate old, revoke it, issue new.
   * Implements reuse detection with cascade revocation.
   */
  async refresh(
    oldToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { jti, secret } = this.parseToken(oldToken);

    // Fast O(1) lookup by jti if available
    if (jti) {
      return this.refreshByJti(jti, secret);
    }

    // Fallback for legacy tokens without jti (old format)
    return this.refreshLegacy(oldToken);
  }

  /** Refresh using jti-based O(1) lookup. */
  private async refreshByJti(
    jti: string,
    secret: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { jti },
      include: { user: true },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Reuse detection: if already revoked, someone is trying to use a stolen token
    if (record.revoked) {
      // Cascade: revoke ALL tokens for this user
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revoked: false },
        data: { revoked: true },
      });
      this.logger.warn(
        `Refresh token reuse detected for user ${record.user.email} — all tokens revoked`,
      );
      throw new UnauthorizedException(
        'Token reuse detected. All sessions revoked.',
      );
    }

    // Validate secret
    const valid = await bcrypt.compare(secret, record.tokenHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotate: revoke old, issue new
    const newRawToken = await this.createRefreshToken(record.userId);

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revoked: true },
    });

    const accessToken = this.generateAccessToken(
      record.user.id,
      record.user.email,
      record.user.role,
    );

    return { accessToken, refreshToken: newRawToken };
  }

  /** Fallback refresh for tokens created before jti migration. O(n) with bcrypt. */
  private async refreshLegacy(
    oldToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const candidates = await this.prisma.refreshToken.findMany({
      where: { revoked: false, expiresAt: { gt: new Date() }, jti: null },
      include: { user: true },
    });

    let matchedRecord: (typeof candidates)[number] | null = null;
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

    // Rotate: revoke old, issue new (with jti this time)
    await this.prisma.refreshToken.update({
      where: { id: matchedRecord.id },
      data: { revoked: true },
    });

    const newRawToken = await this.createRefreshToken(matchedRecord.userId);

    const accessToken = this.generateAccessToken(
      matchedRecord.user.id,
      matchedRecord.user.email,
      matchedRecord.user.role,
    );

    return { accessToken, refreshToken: newRawToken };
  }

  /** Revoke a refresh token (logout). */
  async logout(token: string): Promise<void> {
    const { jti } = this.parseToken(token);

    if (jti) {
      await this.prisma.refreshToken.updateMany({
        where: { jti, revoked: false },
        data: { revoked: true },
      });
      return;
    }

    // Legacy fallback
    const records = await this.prisma.refreshToken.findMany({
      where: { revoked: false, jti: null },
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
  private generateAccessToken(
    userId: number,
    email: string,
    role: string,
  ): string {
    return this.jwtService.sign({
      sub: userId,
      email,
      role,
    });
  }

  /** Create a new refresh token with jti for O(1) lookup. Returns "jti:secret". */
  private async createRefreshToken(userId: number): Promise<string> {
    const jti = randomUUID();
    const secret = randomUUID();
    const hash = await bcrypt.hash(secret, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.refreshToken.create({
      data: { userId, jti, tokenHash: hash, expiresAt },
    });

    return `${jti}:${secret}`;
  }

  /** Parse a token into jti and secret. Handles both new ("jti:secret") and legacy (plain UUID) formats. */
  private parseToken(token: string): { jti: string | null; secret: string } {
    const colonIndex = token.indexOf(':');
    if (colonIndex > 0 && colonIndex < token.length - 1) {
      return {
        jti: token.slice(0, colonIndex),
        secret: token.slice(colonIndex + 1),
      };
    }
    // Legacy token (plain UUID without jti prefix)
    return { jti: null, secret: token };
  }
}
