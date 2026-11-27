import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { z } from 'zod';

export const DEFAULT_MAIL_FROM = 'Mountain Hut <no-reply@mountain-hut.test>';

// Time zone of the hut: slot dates and times are local times there.
export const DEFAULT_BOOKING_TIMEZONE = 'Europe/Rome';

const DAY_MS = 24 * 60 * 60 * 1000;

// Injection token and type of the validated configuration. It is the only place that
// interprets environment variables, so the rest of the API never reads process.env.
export abstract class AppConfig {
  abstract readonly jwtSecret: string;
  abstract readonly jwtExpiresIn: string;
  abstract readonly refreshTtlMs: number;
  abstract readonly secureCookies: boolean;
  abstract readonly bookingTimeZone: string;
  abstract readonly databaseUrl: string;
  abstract readonly smtp: SMTPTransport.Options;
  abstract readonly mailFrom: string;
  // Address of the web app, used in the links sent by email (MH-07 password reset).
  abstract readonly webUrl: string;
}

type Env = Record<string, string | undefined>;

// Removes the final slashes without a regex (a /\/+$/ backtracks on long runs of '/').
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}

const configSchema = z.object({
  jwtSecret: z.string().min(1, 'JWT_SECRET is not defined'),
  jwtExpiresIn: z.string(),
  // An invalid duration would otherwise fail on every login, not at startup.
  refreshTtlMs: z.custom<number>(
    (ttl) => typeof ttl === 'number' && ttl > 0 && !Number.isNaN(new Date(ttl).getTime()),
    'REFRESH_TOKEN_TTL_DAYS must be a positive number of days',
  ),
  secureCookies: z.boolean(),
  bookingTimeZone: z.string(),
  databaseUrl: z.string().min(1, 'DATABASE_URL is not defined'),
  mailFrom: z.string(),
  webUrl: z.url('WEB_URL must be a URL').transform(trimTrailingSlashes),
});

// SMTP connection read from the environment. Without configuration every email goes to
// Mailpit on localhost (in Docker, docker-compose.yml points SMTP_HOST to the mailpit service).
function smtpOptions(env: Env): SMTPTransport.Options {
  const port = Number(env.SMTP_PORT || '1025');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SMTP_PORT is not a valid port: ${env.SMTP_PORT}`);
  }

  const options: SMTPTransport.Options = {
    host: env.SMTP_HOST || 'localhost',
    port,
    // Port 465 uses implicit TLS; the other ports upgrade with STARTTLS.
    secure: port === 465,
  };
  if (env.SMTP_USER) {
    options.auth = { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' };
    // A real server (it has credentials) must encrypt: if it does not offer STARTTLS the email
    // fails instead of sending password and content in clear text. Mailpit has no credentials
    // and no certificate, so it keeps working without TLS.
    options.requireTLS = true;
  }
  return options;
}

// Throws on invalid configuration, so a bad environment stops the API at startup.
export function loadAppConfig(env: Env): AppConfig {
  const parsed = configSchema.safeParse({
    jwtSecret: env.JWT_SECRET ?? '',
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '15m',
    refreshTtlMs: Number(env.REFRESH_TOKEN_TTL_DAYS ?? '1') * DAY_MS,
    secureCookies: env.NODE_ENV === 'production',
    bookingTimeZone: env.BOOKING_TIMEZONE ?? DEFAULT_BOOKING_TIMEZONE,
    databaseUrl: env.DATABASE_URL ?? '',
    mailFrom: env.MAIL_FROM || DEFAULT_MAIL_FROM,
    // The API serves the web app on the same address (docker compose up).
    webUrl: env.WEB_URL || 'http://localhost:3000',
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return { ...parsed.data, smtp: smtpOptions(env) };
}
