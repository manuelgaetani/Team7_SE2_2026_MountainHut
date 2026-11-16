import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { PrismaUsersRepository } from './prisma-users.repository.js';

const row = { id: 1, email: 'a@b.it', role: 'HIKER', password: 'stored-hash' };
const input = {
  email: 'a@b.it',
  password: 'password123',
  fullName: 'Anna Rossi',
  phone: '3331234567',
};

describe('PrismaUsersRepository', () => {
  const client = { user: { findUnique: vi.fn(), create: vi.fn() } };
  const repository = new PrismaUsersRepository(
    new TransactionContext(client as unknown as PrismaService),
  );

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('findByEmail', () => {
    it('returns the account with its password hash', async () => {
      client.user.findUnique.mockResolvedValue(row);
      await expect(repository.findByEmail('a@b.it')).resolves.toEqual({
        id: 1,
        email: 'a@b.it',
        role: 'HIKER',
        passwordHash: 'stored-hash',
      });
      expect(client.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.it' } });
    });

    it('returns null for an unknown email', async () => {
      client.user.findUnique.mockResolvedValue(null);
      await expect(repository.findByEmail('x@y.it')).resolves.toBeNull();
    });
  });

  describe('findById', () => {
    it('returns the account', async () => {
      client.user.findUnique.mockResolvedValue(row);
      await expect(repository.findById(1)).resolves.toMatchObject({ id: 1, role: 'HIKER' });
      expect(client.user.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('returns null for an unknown id', async () => {
      client.user.findUnique.mockResolvedValue(null);
      await expect(repository.findById(99)).resolves.toBeNull();
    });
  });

  describe('createWithHiker', () => {
    it('crea l’utente con ruolo di default e senza esporre la password', async () => {
      client.user.create.mockResolvedValue({ ...row, id: 2 });
      await expect(repository.createWithHiker(input, 'bcrypt-hash')).resolves.toEqual({
        id: 2,
        email: 'a@b.it',
        role: 'HIKER',
      });
    });

    it('creates the hiker profile together with the user, storing the given hash', async () => {
      client.user.create.mockResolvedValue(row);
      await repository.createWithHiker(
        {
          ...input,
          notes: 'registered mountain guide',
          emergencyContact: 'Marco Rossi 3339876543',
        },
        'bcrypt-hash',
      );
      expect(client.user.create).toHaveBeenCalledWith({
        data: {
          email: 'a@b.it',
          password: 'bcrypt-hash',
          hiker: {
            create: {
              fullName: 'Anna Rossi',
              phone: '3331234567',
              notes: 'registered mountain guide',
              emergencyContact: 'Marco Rossi 3339876543',
            },
          },
        },
      });
    });

    it('never sets the role, so the database default applies', async () => {
      client.user.create.mockResolvedValue(row);
      await repository.createWithHiker(input, 'bcrypt-hash');
      const data = client.user.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data).not.toHaveProperty('role');
    });

    it('traduce l’errore unique P2002 in Conflict', async () => {
      client.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(repository.createWithHiker(input, 'bcrypt-hash')).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Email already registered',
      });
    });

    it('rethrows database errors other than a duplicate email', async () => {
      const failure = new Error('database unreachable');
      client.user.create.mockRejectedValue(failure);
      await expect(repository.createWithHiker(input, 'bcrypt-hash')).rejects.toBe(failure);
    });
  });
});
