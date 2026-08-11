import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/** Credentials included in the demo-access welcome email. */
export interface WelcomeCredentials {
  username: string;
  email: string;
  password: string;
}

/**
 * Transactional email via Resend.
 *
 * Reads RESEND_API_KEY / RESEND_FROM / LANDING_APP_URL from config. When the API
 * key is missing the service is disabled (welcome emails are skipped) — the
 * landing signup refuses to create orphan accounts in that case.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY', '');
    this.from = this.configService.get<string>(
      'RESEND_FROM',
      'onboarding@resend.dev',
    );
    this.appUrl = this.configService.get<string>(
      'LANDING_APP_URL',
      'http://localhost:5173',
    );

    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY not set — welcome emails disabled. Landing signup will refuse to create users.',
      );
    }
  }

  /** Whether email sending is configured. */
  get enabled(): boolean {
    return this.resend !== null;
  }

  /**
   * Send the demo-access welcome email with the account credentials.
   * Returns false (without throwing) when Resend is not configured or the API
   * rejects the request; API errors are logged.
   */
  async sendWelcomeEmail(
    to: string,
    creds: WelcomeCredentials,
  ): Promise<boolean> {
    if (!this.resend) {
      return false;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject:
          'Bienvenido a Telemetry IoT Platform — tus credenciales de acceso',
        html: this.buildWelcomeHtml(creds),
      });

      if (error) {
        this.logger.error(
          `Resend rejected welcome email to ${to}: ${error.message}`,
        );
        return false;
      }

      this.logger.log(`Welcome email sent to ${to} (id=${data?.id ?? 'n/a'})`);
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send welcome email to ${to}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Send a password-reset email with a single-use link.
   * Returns false (without throwing) when Resend is not configured or the API
   * rejects the request; API errors are logged.
   */
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
    if (!this.resend) {
      return false;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject: 'Restablecé tu contraseña — Telemetry IoT Platform',
        html: this.buildPasswordResetHtml(resetUrl),
      });

      if (error) {
        this.logger.error(
          `Resend rejected password reset email to ${to}: ${error.message}`,
        );
        return false;
      }

      this.logger.log(
        `Password reset email sent to ${to} (id=${data?.id ?? 'n/a'})`,
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send password reset email to ${to}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /** Inline-styled HTML using the platform brand colors (no external images). */
  private buildWelcomeHtml({
    username,
    email,
    password,
  }: WelcomeCredentials): string {
    const appUrl = this.appUrl;
    return `
<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:Inter,Arial,Helvetica,sans-serif;color:#374151;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:#3b82f6;padding:24px 32px;">
              <p style="margin:0;font-size:18px;font-weight:600;color:#ffffff;">Telemetry IoT Platform</p>
              <p style="margin:4px 0 0;font-size:13px;color:#dbeafe;">Monitoreo predictivo de motores industriales</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">¡Bienvenido a la plataforma!</h1>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">Te creamos una cuenta de acceso a la demo. Estas son tus credenciales:</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px;">
                <tr>
                  <td style="padding:12px 16px;background-color:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb;width:130px;">Correo</td>
                  <td style="padding:12px 16px;font-size:14px;border-bottom:1px solid #e5e7eb;">${email}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;background-color:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb;width:130px;">Usuario</td>
                  <td style="padding:12px 16px;font-size:14px;border-bottom:1px solid #e5e7eb;">${username}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;background-color:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;width:130px;">Contraseña</td>
                  <td style="padding:12px 16px;font-size:14px;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:600;color:#111827;">${password}</td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td style="border-radius:6px;">
                    <a href="${appUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:500;color:#ffffff;background-color:#3b82f6;text-decoration:none;border-radius:6px;">Ingresar a la plataforma</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:12px;color:#6b7280;line-height:1.6;">Ingresá con tu correo y esta contraseña desde el botón "Ingresar" de la página. Te recomendamos cambiarla apenas entres.</p>
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">Si no ves este mensaje en tu bandeja de entrada, revisá la carpeta de <strong>spam o no deseado</strong>.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e5e7eb;background-color:#f9fafb;">
              <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">Telemetry IoT Platform — no responder este correo</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /** Inline-styled HTML for the password reset link (no external images). */
  private buildPasswordResetHtml(resetUrl: string): string {
    return `
<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:Inter,Arial,Helvetica,sans-serif;color:#374151;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:#3b82f6;padding:24px 32px;">
              <p style="margin:0;font-size:18px;font-weight:600;color:#ffffff;">Telemetry IoT Platform</p>
              <p style="margin:4px 0 0;font-size:13px;color:#dbeafe;">Monitoreo predictivo de motores industriales</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">Restablecé tu contraseña</h1>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">Recibimos una solicitud para restablecer tu contraseña. El enlace es de <strong>uso único</strong> y vence en <strong>30 minutos</strong>.</p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td style="border-radius:6px;">
                    <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:500;color:#ffffff;background-color:#3b82f6;text-decoration:none;border-radius:6px;">Restablecer contraseña</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:12px;color:#6b7280;line-height:1.6;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:</p>
              <p style="margin:0 0 20px;font-size:12px;color:#3b82f6;word-break:break-all;line-height:1.6;">${resetUrl}</p>

              <p style="margin:0 0 8px;font-size:12px;color:#6b7280;line-height:1.6;">Si no solicitaste el cambio, ignorá este correo y tu contraseña seguirá igual.</p>
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">Si no ves este mensaje en tu bandeja de entrada, revisá la carpeta de <strong>spam o no deseado</strong>.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e5e7eb;background-color:#f9fafb;">
              <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">Telemetry IoT Platform — no responder este correo</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
