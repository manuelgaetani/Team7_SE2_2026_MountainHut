import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { PrismaHikersRepository } from './prisma-hikers.repository.js';

// MH-07 white box: the Prisma queries of the hiker search (R2) and of the new hikers (R4, R5).

const select = {
  id: true,
  fullName: true,
  phone: true,
  notes: true,
  emergencyContact: true,
  user: { select: { email: true } },
};

const withAccount = {
  id: 15,
  fullName: 'Mario Rossi',
  phone: '3331234567',
  notes: 'vegetarian',
  emergencyContact: 'Anna 3339876543',
  user: { email: 'mario@example.it' },
};
const temporaryRow = {
  id: 21,
  fullName: 'Luca Bianchi',
  phone: null,
  notes: null,
  emergencyContact: null,
  user: null,
};

describe('PrismaHikersRepository', () => {
  const client = { hiker: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() } };
  const repository = new PrismaHikersRepository(
    new TransactionContext(client as unknown as PrismaService),
  );

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('search', () => {
    const whereFor = (pattern: string) => ({
      OR: [
        { fullName: { contains: pattern, mode: 'insensitive' } },
        { phone: { contains: pattern } },
        { user: { email: { contains: pattern, mode: 'insensitive' } } },
      ],
    });

    it('matches name and email ignoring case, and any part of the phone', async () => {
      client.hiker.findMany.mockResolvedValue([]);
      await repository.search('rossi', 20);
      expect(client.hiker.findMany).toHaveBeenCalledWith({
        where: whereFor('rossi'),
        select,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        take: 20,
      });
    });

    it('passes the limit it is given', async () => {
      client.hiker.findMany.mockResolvedValue([]);
      await repository.search('rossi', 5);
      expect(client.hiker.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });

    it.each([
      ['%', '50%', '50\\%'],
      ['_', 'a_b', 'a\\_b'],
      ['the backslash', 'a\\b', 'a\\\\b'],
      ['every wildcard', '%_\\', '\\%\\_\\\\'],
    ])(
      'escapes %s, so it is a plain character and not a LIKE wildcard',
      async (_c, text, pattern) => {
        client.hiker.findMany.mockResolvedValue([]);
        await repository.search(text, 20);
        expect(client.hiker.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: whereFor(pattern) }),
        );
      },
    );

    it('leaves a text without wildcards as it is', async () => {
      client.hiker.findMany.mockResolvedValue([]);
      await repository.search('mario@example.it', 20);
      expect(client.hiker.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: whereFor('mario@example.it') }),
      );
    });

    it('maps the rows to profiles: with the email of the account, or temporary without', async () => {
      client.hiker.findMany.mockResolvedValue([withAccount, temporaryRow]);
      await expect(repository.search('ro', 20)).resolves.toEqual([
        {
          id: 15,
          fullName: 'Mario Rossi',
          email: 'mario@example.it',
          phone: '3331234567',
          notes: 'vegetarian',
          emergencyContact: 'Anna 3339876543',
          temporary: false,
        },
        {
          id: 21,
          fullName: 'Luca Bianchi',
          email: null,
          phone: null,
          notes: null,
          emergencyContact: null,
          temporary: true,
        },
      ]);
    });

    it('returns an empty list when nobody matches', async () => {
      client.hiker.findMany.mockResolvedValue([]);
      await expect(repository.search('zz', 20)).resolves.toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns the profile of the hiker', async () => {
      client.hiker.findUnique.mockResolvedValue(withAccount);
      await expect(repository.findById(15)).resolves.toMatchObject({ id: 15, temporary: false });
      expect(client.hiker.findUnique).toHaveBeenCalledWith({ where: { id: 15 }, select });
    });

    it('returns null for an unknown id', async () => {
      client.hiker.findUnique.mockResolvedValue(null);
      await expect(repository.findById(99)).resolves.toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('returns the profile linked to the account', async () => {
      client.hiker.findUnique.mockResolvedValue(withAccount);
      await expect(repository.findByUserId(7)).resolves.toEqual({
        id: 15,
        fullName: 'Mario Rossi',
        email: 'mario@example.it',
        phone: '3331234567',
        notes: 'vegetarian',
        emergencyContact: 'Anna 3339876543',
        temporary: false,
      });
      expect(client.hiker.findUnique).toHaveBeenCalledWith({ where: { userId: 7 }, select });
    });

    it('returns null for an account without a hiker profile', async () => {
      client.hiker.findUnique.mockResolvedValue(null);
      await expect(repository.findByUserId(1)).resolves.toBeNull();
    });
  });

  describe('createTemporary', () => {
    it('creates a hiker without a user, so without email and login', async () => {
      client.hiker.create.mockResolvedValue({ ...temporaryRow, phone: '3201112233' });
      await expect(
        repository.createTemporary({ fullName: 'Luca Bianchi', phone: '3201112233' }),
      ).resolves.toMatchObject({ id: 21, email: null, phone: '3201112233', temporary: true });
      expect(client.hiker.create).toHaveBeenCalledWith({
        data: { fullName: 'Luca Bianchi', phone: '3201112233' },
        select,
      });
    });

    it('creates it also without a phone', async () => {
      client.hiker.create.mockResolvedValue(temporaryRow);
      await repository.createTemporary({ fullName: 'Luca Bianchi' });
      expect(client.hiker.create).toHaveBeenCalledWith({
        data: { fullName: 'Luca Bianchi', phone: undefined },
        select,
      });
    });
  });

  describe('createAccount', () => {
    const input = {
      email: 'mario@example.it',
      fullName: 'Mario Rossi',
      phone: '3331234567',
      notes: 'vegetarian',
      emergencyContact: 'Anna 3339876543',
    };

    it('creates the hiker and its user, which must change the password', async () => {
      client.hiker.create.mockResolvedValue(withAccount);
      await expect(repository.createAccount(input, 'bcrypt-hash')).resolves.toMatchObject({
        id: 15,
        email: 'mario@example.it',
        temporary: false,
      });
      expect(client.hiker.create).toHaveBeenCalledWith({
        data: {
          fullName: 'Mario Rossi',
          phone: '3331234567',
          notes: 'vegetarian',
          emergencyContact: 'Anna 3339876543',
          user: {
            create: {
              email: 'mario@example.it',
              password: 'bcrypt-hash',
              mustChangePassword: true,
            },
          },
        },
        select,
      });
    });

    it('translates the unique violation P2002 of the email into CONFLICT', async () => {
      client.hiker.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(repository.createAccount(input, 'bcrypt-hash')).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Email already registered',
      });
    });

    it('rethrows the other Prisma errors as they are', async () => {
      const failure = new Prisma.PrismaClientKnownRequestError('check', {
        code: 'P2004',
        clientVersion: 'test',
      });
      client.hiker.create.mockRejectedValue(failure);
      await expect(repository.createAccount(input, 'bcrypt-hash')).rejects.toBe(failure);
    });

    it('rethrows an error that does not come from Prisma', async () => {
      const failure = new Error('database unreachable');
      client.hiker.create.mockRejectedValue(failure);
      await expect(repository.createAccount(input, 'bcrypt-hash')).rejects.toBe(failure);
    });
  });
});
