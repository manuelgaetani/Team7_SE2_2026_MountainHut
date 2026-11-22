import { Injectable } from '@nestjs/common';
import type { AuthUser, RegisterInput } from '@mountain-hut/shared';
import { isUniqueViolation } from '../../infrastructure/prisma/prisma-errors.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UsersRepository } from '../application/ports.js';
import type { UserRecord } from '../application/ports.js';

interface UserRow {
  id: number;
  email: string;
  role: UserRecord['role'];
  password: string;
  mustChangePassword: boolean;
}

const toRecord = (row: UserRow): UserRecord => ({
  id: row.id,
  email: row.email,
  role: row.role,
  passwordHash: row.password,
  mustChangePassword: row.mustChangePassword,
});

@Injectable()
export class PrismaUsersRepository extends UsersRepository {
  constructor(private readonly context: TransactionContext) {
    super();
  }

  private db() {
    return this.context.client();
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.db().user.findUnique({ where: { email } });
    return row ? toRecord(row) : null;
  }

  async findById(id: number): Promise<UserRecord | null> {
    const row = await this.db().user.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async createWithHiker(input: RegisterInput, passwordHash: string): Promise<AuthUser> {
    try {
      const user = await this.db().user.create({
        data: {
          email: input.email,
          password: passwordHash,
          hiker: {
            create: {
              fullName: input.fullName,
              phone: input.phone,
              notes: input.notes,
              emergencyContact: input.emergencyContact,
            },
          },
        },
      });
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      };
    } catch (e) {
      // Due registrazioni concorrenti con la stessa email: vince il vincolo unique del DB.
      if (isUniqueViolation(e)) {
        throw new DomainError('CONFLICT', 'Email already registered');
      }
      throw e;
    }
  }

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    await this.db().user.update({
      where: { id },
      data: { password: passwordHash, mustChangePassword: false },
    });
  }
}
