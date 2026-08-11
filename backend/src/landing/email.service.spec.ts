import type { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}

function emailPayload(calls: unknown[][]): EmailPayload {
  return calls[0][0] as EmailPayload;
}

function makeConfig(env: Record<string, string>) {
  return {
    get: jest.fn(
      (key: string, fallback?: string) => env[key] ?? fallback ?? '',
    ),
  } as unknown as ConfigService;
}

describe('EmailService', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('is disabled when RESEND_API_KEY is not set', () => {
    const service = new EmailService(makeConfig({}));
    expect(service.enabled).toBe(false);
  });

  it('is enabled when RESEND_API_KEY is set', () => {
    const service = new EmailService(makeConfig({ RESEND_API_KEY: 're_test' }));
    expect(service.enabled).toBe(true);
  });

  it('sends the welcome email with the credentials and returns true', async () => {
    mockSend.mockResolvedValue({ data: { id: 'mail-1' }, error: null });
    const service = new EmailService(
      makeConfig({
        RESEND_API_KEY: 're_test',
        RESEND_FROM: 'no-reply@telemetry.app',
        LANDING_APP_URL: 'http://app.test',
      }),
    );

    const sent = await service.sendWelcomeEmail('user@example.com', {
      username: 'user',
      email: 'user@example.com',
      password: 'Secret12',
    });

    expect(sent).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const payload = emailPayload(mockSend.mock.calls as unknown[][]);
    expect(payload.from).toBe('no-reply@telemetry.app');
    expect(payload.to).toBe('user@example.com');
    expect(payload.subject).toContain('credenciales');
    expect(payload.html).toContain('user@example.com');
    expect(payload.html).toContain('user');
    expect(payload.html).toContain('Secret12');
    expect(payload.html).toContain('Ingresar a la plataforma');
    expect(payload.html).toContain('http://app.test');
    expect(payload.html).toContain('spam');
  });

  it('returns false when Resend rejects the email (API error)', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Daily quota exceeded', statusCode: 429 },
    });
    const service = new EmailService(makeConfig({ RESEND_API_KEY: 're_test' }));

    const sent = await service.sendWelcomeEmail('user@example.com', {
      username: 'user',
      email: 'user@example.com',
      password: 'Secret12',
    });

    expect(sent).toBe(false);
  });

  it('returns false when Resend throws', async () => {
    mockSend.mockRejectedValue(new Error('network down'));
    const service = new EmailService(makeConfig({ RESEND_API_KEY: 're_test' }));

    const sent = await service.sendWelcomeEmail('user@example.com', {
      username: 'user',
      email: 'user@example.com',
      password: 'Secret12',
    });

    expect(sent).toBe(false);
  });

  it('sends the password reset email with the reset link and returns true', async () => {
    mockSend.mockResolvedValue({ data: { id: 'mail-2' }, error: null });
    const service = new EmailService(
      makeConfig({
        RESEND_API_KEY: 're_test',
        RESEND_FROM: 'no-reply@telemetry.app',
        LANDING_APP_URL: 'http://app.test',
      }),
    );

    const sent = await service.sendPasswordResetEmail(
      'user@example.com',
      'http://app.test/reset-password?token=abc-123',
    );

    expect(sent).toBe(true);
    const payload = emailPayload(mockSend.mock.calls as unknown[][]);
    expect(payload.from).toBe('no-reply@telemetry.app');
    expect(payload.to).toBe('user@example.com');
    expect(payload.subject).toContain('Restablecé tu contraseña');
    expect(payload.html).toContain(
      'http://app.test/reset-password?token=abc-123',
    );
    expect(payload.html).toContain('Restablecer contraseña');
    expect(payload.html).toContain('uso único');
    expect(payload.html).toContain('30 minutos');
  });

  it('returns false for the reset email when Resend is not configured', async () => {
    const service = new EmailService(makeConfig({}));

    const sent = await service.sendPasswordResetEmail(
      'user@example.com',
      'http://app.test/reset-password?token=abc',
    );

    expect(sent).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
