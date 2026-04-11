import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

class EmailService {
  private transporter: nodemailer.Transporter

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    })
  }

  async sendVerificationEmail(to: string, token: string, firstName?: string): Promise<void> {
    const verifyUrl = `${env.CLIENT_URL}/verify-email?token=${token}`
    const name = firstName ?? 'there'

    await this.transporter.sendMail({
      from: `"Auth App" <no-reply@authapp.dev>`,
      to,
      subject: 'Verify your email address',
      text: `Hi ${name}, verify your email: ${verifyUrl} (expires in 24 hours)`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verify your email</h2>
          <p>Hi ${name},</p>
          <p>Click the button below to verify your email address. 
             This link expires in <strong>24 hours</strong>.</p>
          <a href="${verifyUrl}" 
             style="display:inline-block;padding:12px 24px;
                    background:#2563eb;color:#fff;
                    text-decoration:none;border-radius:6px;margin:16px 0">
            Verify email
          </a>
          <p style="color:#666;font-size:14px">
            If you didn't create an account, ignore this email.
          </p>
          <p style="color:#999;font-size:12px">
            Or copy this URL: ${verifyUrl}
          </p>
        </div>
      `,
    })
  }

  async sendPasswordResetEmail(to: string, token: string, firstName?: string): Promise<void> {
    const resetUrl = `${env.CLIENT_URL}/reset-password?token=${token}`
    const name = firstName ?? 'there'

    await this.transporter.sendMail({
      from: `"Auth App" <no-reply@authapp.dev>`,
      to,
      subject: 'Reset your password',
      text: `Hi ${name}, reset your password: ${resetUrl} (expires in 1 hour)`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>Hi ${name},</p>
          <p>Click below to reset your password. 
             This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 24px;
                    background:#dc2626;color:#fff;
                    text-decoration:none;border-radius:6px;margin:16px 0">
            Reset password
          </a>
          <p style="color:#666;font-size:14px">
            If you didn't request this, ignore this email. 
            Your password won't change.
          </p>
        </div>
      `,
    })
  }
}

export const emailService = new EmailService()
