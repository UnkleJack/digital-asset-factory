import nodemailer from 'nodemailer';
import type { AppContext } from '../../app/context.ts';
import { AppError } from '../../core/errors.ts';

/*
 * Sends mail through an SMTP account — by default a Gmail address with an app password
 * (Google Account → Security → 2-Step Verification → App passwords). Free Gmail allows about
 * 500 recipients a day, far more than a digest needs. The address lives in Settings → Email,
 * the app password in the smtp_password secret.
 */

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<{ messageId: string }>;
}

export function smtpMailer(app: AppContext): Mailer {
  return {
    async send(msg) {
      const cfg = app.settings.get('email');
      const pass = await app.secrets.get('smtp_password');
      if (!cfg.smtpUser || !pass) throw new AppError('email_unconfigured', 'Email is not set up: add the sending Gmail address in Settings → Email and its app password in Settings → Integrations.', { httpStatus: 424, errorClass: 'permanent' });
      const transport = nodemailer.createTransport({ host: cfg.smtpHost, port: cfg.smtpPort, secure: cfg.smtpPort === 465, auth: { user: cfg.smtpUser, pass }, connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 60_000 });
      try {
        const info = await transport.sendMail({ from: { name: cfg.fromName, address: cfg.smtpUser }, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
        return { messageId: String(info.messageId ?? '') };
      } catch (err) {
        const e = err as { code?: string; responseCode?: number; message?: string };
        const auth = e.code === 'EAUTH' || e.responseCode === 535;
        throw new AppError('email_failed', auth
          ? 'Gmail refused the login. Use an app password (not your normal password) and check the sending address in Settings → Email.'
          : `Sending the email failed: ${e.message ?? String(err)}`, { httpStatus: 502, errorClass: auth ? 'permanent' : 'transient' });
      } finally {
        transport.close();
      }
    },
  };
}
