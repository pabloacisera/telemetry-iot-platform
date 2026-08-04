import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { PrismaService } from '../prisma';
import type { JwtService } from '@nestjs/jwt';

describe('AuthService — refresh token rotation and reuse detection', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwtService: { sign: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 99 }),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('mock-access-token'),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
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
});
