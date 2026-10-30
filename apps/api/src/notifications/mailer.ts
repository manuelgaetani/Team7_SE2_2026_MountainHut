import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { mailFromEnv, smtpOptionsFromEnv } from './mail.config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Sends an email. It is an abstract class so it can be used as an injection token:
// tests replace it with a fake, and another transport can be added without touching callers.
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

@Injectable()
export class SmtpMailer extends Mailer {
  // Nodemailer connects only when the first email is sent, so a missing SMTP server
  // does not stop the application from starting.
  private readonly transporter: Transporter = nodemailer.createTransport(
    smtpOptionsFromEnv(process.env),
  );
  private readonly from = mailFromEnv(process.env);

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
