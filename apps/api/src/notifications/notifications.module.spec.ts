import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Mailer, SmtpMailer } from './mailer.js';
import { NotificationService } from './notification.service.js';
import { NotificationsModule } from './notifications.module.js';

describe('NotificationsModule', () => {
  it('provides NotificationService backed by the SMTP mailer', async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, NotificationsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(module.get(NotificationService)).toBeInstanceOf(NotificationService);
    expect(module.get(Mailer)).toBeInstanceOf(SmtpMailer);
  });
});
