import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UsersRepository } from './ports.js';

// The account of the logged in user, read again so a deleted account loses access.
@Injectable()
export class GetCurrentUser {
  constructor(private readonly users: UsersRepository) {}

  async execute(userId: number): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new DomainError('UNAUTHORIZED', 'Not authenticated');
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
