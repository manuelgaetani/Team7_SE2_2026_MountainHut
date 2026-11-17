import { Injectable } from '@nestjs/common';
import type { HikerProfile } from '@mountain-hut/shared';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { HikersRepository } from '../application/hikers.repository.port.js';

const profileFields = {
  id: true,
  fullName: true,
  phone: true,
  notes: true,
  emergencyContact: true,
  user: { select: { email: true } },
} as const;

interface HikerRow {
  id: number;
  fullName: string;
  phone: string | null;
  notes: string | null;
  emergencyContact: string | null;
  user: { email: string } | null;
}

// A hiker without an account is temporary: no email, no login.
const toProfile = (row: HikerRow): HikerProfile => ({
  id: row.id,
  fullName: row.fullName,
  email: row.user?.email ?? null,
  phone: row.phone,
  notes: row.notes,
  emergencyContact: row.emergencyContact,
  temporary: row.user === null,
});

// Uses the transaction of the current unit of work, or the plain client outside one.
@Injectable()
export class PrismaHikersRepository extends HikersRepository {
  constructor(private readonly context: TransactionContext) {
    super();
  }

  private db() {
    return this.context.client();
  }

  async search(text: string, limit: number): Promise<HikerProfile[]> {
    const rows = await this.db().hiker.findMany({
      where: {
        OR: [
          { fullName: { contains: text, mode: 'insensitive' } },
          { phone: { contains: text } },
          { user: { email: { contains: text, mode: 'insensitive' } } },
        ],
      },
      select: profileFields,
      // The id keeps the order stable between people with the same name.
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toProfile);
  }
}
