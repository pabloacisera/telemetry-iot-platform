import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    refreshToken: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      refreshToken: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('mock-access-token'),
    };

    service = new AuthService(prisma as any, jwtService as any);
  });

  describe('login', () => {
    it('should throw UnauthorizedException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('ghost@test.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('correct_password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'user@test.com',
        passwordHash: hash,
        role: 'operator',
      });

      await expect(
        service.login('user@test.com', 'wrong_password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens for valid credentials', async () => {
      const hash = await bcrypt.hash('correct_password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'user@test.com',
        passwordHash: hash,
        role: 'operator',
      });
      prisma.refreshToken.create.mockResolvedValue({ id: 1 });

      const result = await service.login('user@test.com', 'correct_password');

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('should sign JWT with correct payload (sub, email, role)', async () => {
      const hash = await bcrypt.hash('password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 42,
        email: 'admin@test.com',
        passwordHash: hash,
        role: 'admin',
      });
      prisma.refreshToken.create.mockResolvedValue({ id: 1 });

      await service.login('admin@test.com', 'password');

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 42,
        email: 'admin@test.com',
        role: 'admin',
      });
    });
  });

  describe('refresh (token rotation)', () => {
    it('should throw UnauthorizedException for invalid refresh token', async () => {
      prisma.refreshToken.findMany.mockResolvedValue([]);

      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should revoke old token and issue new one on valid refresh', async () => {
      const rawToken = 'valid-refresh-token';
      const hash = await bcrypt.hash(rawToken, 10);

      prisma.refreshToken.findMany.mockResolvedValue([
        {
          id: 5,
          userId: 1,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + 86400000),
          revoked: false,
          user: { id: 1, email: 'user@test.com', role: 'operator' },
        },
      ]);

      const result = await service.refresh(rawToken);

      // Should call $transaction to revoke old + create new
      expect(prisma.$transaction).toHaveBeenCalled();
      const txArgs = prisma.$transaction.mock.calls[0][0];
      expect(txArgs).toHaveLength(2); // revoke old + create new

      // Should return new tokens
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(rawToken); // New token, not the old one
    });

    it('should not accept expired tokens', async () => {
      // findMany returns empty because query filters by expiresAt > now
      prisma.refreshToken.findMany.mockResolvedValue([]);

      await expect(service.refresh('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
