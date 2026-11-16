import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigModule } from '../config/config.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Mailer, SmtpMailer } from './mailer.js';
import { NotificationService } from './notification.service.js';
import { NotificationsModule } from './notifications.module.js';

describe('NotificationsModule', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'unit-test-secret');
    vi.stubEnv('DATABASE_URL', 'postgresql://x');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('provides NotificationService backed by the SMTP mailer', async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule, NotificationsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(NotificationService)).toBeInstanceOf(NotificationService);
    expect(module.get(Mailer)).toBeInstanceOf(SmtpMailer);
  });
});
