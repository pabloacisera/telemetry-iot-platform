import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { PrismaService } from '../prisma';
import type { JwtService } from '@nestjs/jwt';
import type { EmailService } from '../landing/email.service';
import type { ConfigService } from '@nestjs/config';

describe('AuthService — refresh token rotation and reuse detection', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    passwordResetToken: {
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let jwtService: { sign: jest.Mock };
  let emailService: { sendPasswordResetEmail: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      refreshToken: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 99 }),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('mock-access-token'),
    };
    emailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    };
    configService = {
      get: jest.fn().mockReturnValue('http://localhost:5173'),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      emailService as unknown as EmailService,
      configService as unknown as ConfigService,
    );
  });

  describe('refresh with jti format', () => {
    it('should rotate token successfully with valid jti:secret', async () => {
      const secret = 'test-secret-uuid';
      const hash = await bcrypt.hash(secret, 10);

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
        jti: 'test-jti',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60000),
        revoked: false,
        user: { id: 42, email: 'admin@test.com', role: 'admin' },
      });

      const result = await service.refresh(`test-jti:${secret}`);

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toContain(':'); // new jti:secret format
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { revoked: true },
      });
    });

    it('should throw if token is expired', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
        jti: 'expired-jti',
        tokenHash: 'doesnt-matter',
        expiresAt: new Date(Date.now() - 1000), // expired
        revoked: false,
        user: { id: 42, email: 'admin@test.com', role: 'admin' },
      });

      await expect(service.refresh('expired-jti:some-secret')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw if jti not found', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('unknown-jti:some-secret')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw if secret does not match hash', async () => {
      const hash = await bcrypt.hash('correct-secret', 10);

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
        jti: 'test-jti',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60000),
        revoked: false,
        user: { id: 42, email: 'admin@test.com', role: 'admin' },
      });

      await expect(service.refresh('test-jti:wrong-secret')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('reuse detection with cascade revocation', () => {
    it('should revoke ALL user tokens when a revoked token is reused', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
        jti: 'stolen-jti',
        tokenHash: 'doesnt-matter',
        expiresAt: new Date(Date.now() + 60000),
        revoked: true, // Already revoked — reuse attempt!
        user: { id: 42, email: 'victim@test.com', role: 'operator' },
      });

      await expect(service.refresh('stolen-jti:any-secret')).rejects.toThrow(
        'Token reuse detected',
      );

      // Should cascade revoke all tokens for that user
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 42, revoked: false },
        data: { revoked: true },
      });
    });
  });

  describe('logout', () => {
    it('should revoke token by jti', async () => {
      await service.logout('some-jti:some-secret');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { jti: 'some-jti', revoked: false },
        data: { revoked: true },
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('should create a token and email a reset link for an existing user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 7,
        email: 'user@test.com',
      });

      await service.requestPasswordReset('user@test.com');

      const createCalls = prisma.passwordResetToken.create.mock
        .calls as unknown as [
        { data: { userId: number; tokenHash: string; expiresAt: Date } },
      ][];
      const createdData = createCalls[0][0].data;
      expect(createdData.userId).toBe(7);
      expect(createdData.expiresAt).toBeInstanceOf(Date);
      expect(createdData.tokenHash).not.toBe('');
      expect(createdData.tokenHash.startsWith('$2')).toBe(true); // bcrypt

      const emailCalls = emailService.sendPasswordResetEmail.mock
        .calls as unknown as [string, string][];
      const resetUrl = emailCalls[0][1];
      expect(resetUrl).toMatch(
        /^http:\/\/localhost:5173\/reset-password\?token=[0-9a-f-]+$/,
      );
    });

    it('should not create a token or send an email for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.requestPasswordReset('ghost@test.com');

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should update the password, mark the token used and revoke sessions', async () => {
      const token = 'single-use-token';
      const hash = await bcrypt.hash(token, 10);
      prisma.passwordResetToken.findMany.mockResolvedValue([
        {
          id: 5,
          userId: 7,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
        },
      ]);
      prisma.user.findUnique.mockResolvedValue({
        id: 7,
        email: 'user@test.com',
        passwordHash: 'old-hash',
      });

      await service.resetPassword(token, 'NewPassword123');

      const resetUpdateCalls = prisma.passwordResetToken.update.mock
        .calls as unknown as [
        { where: { id: number }; data: { usedAt: Date } },
      ][];
      expect(resetUpdateCalls[0][0].where.id).toBe(5);
      expect(resetUpdateCalls[0][0].data.usedAt).toBeInstanceOf(Date);

      const updateCalls = prisma.user.update.mock.calls as unknown as [
        { data: { passwordHash: string } },
      ][];
      const userUpdate = updateCalls[0][0];
      expect(userUpdate.data.passwordHash.startsWith('$2')).toBe(true);
      expect(userUpdate.data.passwordHash).not.toBe('old-hash');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 7, revoked: false },
        data: { revoked: true },
      });
    });

    it('should throw when no matching unused token exists', async () => {
      prisma.passwordResetToken.findMany.mockResolvedValue([]);

      await expect(
        service.resetPassword('nope', 'NewPassword123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when the token is expired', async () => {
      prisma.passwordResetToken.findMany.mockResolvedValue([]); // query excludes expired

      await expect(
        service.resetPassword('nope', 'NewPassword123'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
