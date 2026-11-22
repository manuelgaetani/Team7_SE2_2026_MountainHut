import { Injectable } from '@nestjs/common';
import { PasswordResetNotifier } from '../../auth/application/ports.js';
import { AppConfig } from '../../config/app-config.js';
import { NotificationService } from '../notification.service.js';

// Builds the link to the web app page and sends the reset email.
@Injectable()
export class PasswordResetAdapter extends PasswordResetNotifier {
  constructor(
    private readonly config: AppConfig,
    private readonly notifications: NotificationService,
  ) {
    super();
  }

  async send(user: { id: number; email: string }, token: string, expiresAt: Date): Promise<void> {
    const link = `${this.config.webUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.notifications.sendPasswordReset(
      { userId: user.id, email: user.email },
      { link, expiresAt },
    );
  }
}
