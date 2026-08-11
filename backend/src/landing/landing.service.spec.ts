import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { generateTemporaryPassword, LandingService } from './landing.service';
import type { PrismaService } from '../prisma';
import type { CacheService } from '../cache';
import type { EmailService } from './email.service';

interface CreateUserArg {
  data: { email: string; role: string; passwordHash: string };
}

interface WelcomeEmailCreds {
  username: string;
  email: string;
  password: string;
}

function createArg(calls: unknown[][]): CreateUserArg {
  return calls[0][0] as CreateUserArg;
}

function welcomeCreds(calls: unknown[][]): WelcomeEmailCreds {
  return calls[0][1] as WelcomeEmailCreds;
}

describe('LandingService', () => {
  let service: LandingService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
  };
  let cache: { saveLead: jest.Mock; removeLead: jest.Mock };
  let email: { enabled: boolean; sendWelcomeEmail: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 7,
          email: 'user@example.com',
          role: 'viewer',
        }),
        delete: jest.fn().mockResolvedValue({ id: 7 }),
      },
    };
    cache = {
      saveLead: jest.fn().mockResolvedValue(true),
      removeLead: jest.fn().mockResolvedValue(undefined),
    };
    email = {
      enabled: true,
      sendWelcomeEmail: jest.fn().mockResolvedValue(true),
    };
    config = { get: jest.fn().mockReturnValue('viewer') };
    service = new LandingService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
      email as unknown as EmailService,
      config as unknown as ConfigService,
    );
  });

  describe('generateTemporaryPassword', () => {
    it('generates an 8-char alphanumeric password with upper and lower case', () => {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(8);
      expect(/^[A-Za-z0-9]+$/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[a-z]/.test(password)).toBe(true);
    });

    it('always generates a different password on each call', () => {
      const a = generateTemporaryPassword();
      const b = generateTemporaryPassword();
      expect(a).not.toBe(b);
    });
  });

  describe('subscribe', () => {
    it('normalizes the email, creates a viewer user with a hashed password and sends the welcome email', async () => {
      const result = await service.subscribe('  User@Example.COM  ');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });

      const createData = createArg(
        prisma.user.create.mock.calls as unknown[][],
      ).data;
      expect(createData.email).toBe('user@example.com');
      expect(createData.role).toBe('viewer');
      expect(createData.passwordHash).toMatch(/^\$2[aby]\$/);

      expect(email.sendWelcomeEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.objectContaining({
          username: 'user',
          email: 'user@example.com',
        }),
      );
      expect(
        welcomeCreds(email.sendWelcomeEmail.mock.calls as unknown[][]).password,
      ).toHaveLength(8);
      expect(result).toEqual({ granted: true, email: 'user@example.com' });
    });

    it('hashes the exact password that is sent in the email', async () => {
      await service.subscribe('user@example.com');

      const createData = createArg(
        prisma.user.create.mock.calls as unknown[][],
      ).data;
      const sent = welcomeCreds(
        email.sendWelcomeEmail.mock.calls as unknown[][],
      );
      await expect(
        bcrypt.compare(sent.password, createData.passwordHash),
      ).resolves.toBe(true);
    });

    it('uses the role from LANDING_DEMO_ROLE', async () => {
      config.get.mockReturnValue('operator');
      const svc = new LandingService(
        prisma as unknown as PrismaService,
        cache as unknown as CacheService,
        email as unknown as EmailService,
        config as unknown as ConfigService,
      );

      await svc.subscribe('x@example.com');

      expect(
        createArg(prisma.user.create.mock.calls as unknown[][]).data.role,
      ).toBe('operator');
    });

    it('throws ConflictException when the email already has a user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'user@example.com',
      });

      await expect(service.subscribe('user@example.com')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(email.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException when email sending is not configured', async () => {
      email.enabled = false;

      await expect(service.subscribe('user@example.com')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('still signs up when the Redis lead audit fails', async () => {
      cache.saveLead.mockRejectedValue(new Error('redis down'));

      const result = await service.subscribe('user@example.com');

      expect(result.granted).toBe(true);
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('rolls back the account when the welcome email fails to send', async () => {
      email.sendWelcomeEmail.mockResolvedValue(false);

      await expect(service.subscribe('user@example.com')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 7 },
      });
      expect(cache.removeLead).toHaveBeenCalledWith('user@example.com');
    });
  });
});
