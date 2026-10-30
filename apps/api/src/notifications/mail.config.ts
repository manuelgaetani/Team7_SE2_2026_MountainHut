import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

export const DEFAULT_MAIL_FROM = 'Mountain Hut <no-reply@mountain-hut.test>';

type Env = Record<string, string | undefined>;

// SMTP connection read from the environment. Without configuration every email goes to
// Mailpit on localhost (in Docker, docker-compose.yml points SMTP_HOST to the mailpit service).
export function smtpOptionsFromEnv(env: Env): SMTPTransport.Options {
  const port = Number(env.SMTP_PORT || '1025');
  if (!Number.isInteger(port)) throw new Error(`SMTP_PORT is not a valid port: ${env.SMTP_PORT}`);

  const options: SMTPTransport.Options = {
    host: env.SMTP_HOST || 'localhost',
    port,
    // Port 465 uses implicit TLS; the other ports upgrade with STARTTLS when the server offers it.
    secure: port === 465,
  };
  if (env.SMTP_USER) options.auth = { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' };
  return options;
}

export function mailFromEnv(env: Env): string {
  return env.MAIL_FROM || DEFAULT_MAIL_FROM;
}
