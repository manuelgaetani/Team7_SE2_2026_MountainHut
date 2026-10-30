import { createHash } from 'node:crypto';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: { findUnique: vi.fn(), create: vi.fn() },
    refreshToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  };
  const jwt = { signAsync: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const registerInput = {
    email: 'a@b.it',
    password: 'password123',
    fullName: 'Anna Rossi',
    phone: '3331234567',
  };

  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
  const registeredUser = async (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    email: 'a@b.it',
    role: 'HIKER',
    password: await bcrypt.hash('giusta123', 4),
    ...overrides,
  });

  describe('register', () => {
    const createdUser = { id: 2, email: 'a@b.it', role: 'HIKER' };

    it('lancia Conflict se l’email esiste già', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      await expect(service.register(registerInput)).rejects.toBeInstanceOf(ConflictException);
    });

    it('crea l’utente con ruolo di default e senza esporre la password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdUser);
      const result = await service.register(registerInput);
      expect(result).toEqual({ id: 2, email: 'a@b.it', role: 'HIKER' });
    });

    it('traduce l’errore unique P2002 in Conflict', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(service.register(registerInput)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows database errors other than a duplicate email', async () => {
      const failure = new Error('database unreachable');
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(failure);
      await expect(service.register(registerInput)).rejects.toBe(failure);
    });

    it('stores a bcrypt hash, never the plain password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdUser);
      await service.register(registerInput);
      const stored = prisma.user.create.mock.calls[0][0].data.password as string;
      expect(stored).not.toBe('password123');
      await expect(bcrypt.compare('password123', stored)).resolves.toBe(true);
    });

    it('creates the hiker profile together with the user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdUser);
      await service.register({
        ...registerInput,
        notes: 'registered mountain guide',
        emergencyContact: 'Marco Rossi 3339876543',
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'a@b.it',
          password: expect.any(String),
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
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdUser);
      await service.register(registerInput);
      const data = prisma.user.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data).not.toHaveProperty('role');
    });
  });

  describe('login', () => {
    it('lancia Unauthorized con password sbagliata', async () => {
      prisma.user.findUnique.mockResolvedValue(await registeredUser());
      await expect(
        service.login({ email: 'a@b.it', password: 'sbagliata' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lancia Unauthorized se l’utente non esiste', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'x@y.it', password: 'qualsiasi' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('restituisce access token, refresh token e utente', async () => {
      prisma.user.findUnique.mockResolvedValue(await registeredUser());
      jwt.signAsync.mockResolvedValue('token-finto');
      prisma.refreshToken.create.mockResolvedValue({});
      const result = await service.login({ email: 'a@b.it', password: 'giusta123' });
      expect(result.token).toBe('token-finto');
      expect(result.refreshToken.length).toBeGreaterThan(20);
      expect(result.user).toEqual({ id: 1, email: 'a@b.it', role: 'HIKER' });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 1, tokenHash: expect.any(String) }),
      });
    });

    it('puts the user id, email and role in the access token', async () => {
      prisma.user.findUnique.mockResolvedValue(await registeredUser({ id: 3, role: 'WARDEN' }));
      jwt.signAsync.mockResolvedValue('token-finto');
      await service.login({ email: 'a@b.it', password: 'giusta123' });
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 3, email: 'a@b.it', role: 'WARDEN' });
    });

    it('stores only the SHA-256 hash of the refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(await registeredUser());
      jwt.signAsync.mockResolvedValue('token-finto');
      const result = await service.login({ email: 'a@b.it', password: 'giusta123' });
      const { tokenHash } = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(tokenHash).toBe(sha256(result.refreshToken));
      expect(tokenHash).not.toBe(result.refreshToken);
    });

    it('issues a different refresh token on every login', async () => {
      prisma.user.findUnique.mockResolvedValue(await registeredUser());
      jwt.signAsync.mockResolvedValue('token-finto');
      const first = await service.login({ email: 'a@b.it', password: 'giusta123' });
      const second = await service.login({ email: 'a@b.it', password: 'giusta123' });
      expect(first.refreshToken).not.toBe(second.refreshToken);
    });

    it('issues no session when the credentials are rejected', async () => {
      prisma.user.findUnique.mockResolvedValue(await registeredUser());
      await expect(
        service.login({ email: 'a@b.it', password: 'sbagliata' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('still runs a password comparison when the email is unknown', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const compare = vi.spyOn(bcrypt, 'compare');
      try {
        await expect(
          service.login({ email: 'x@y.it', password: 'qualsiasi' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(compare).toHaveBeenCalledTimes(1);
      } finally {
        compare.mockRestore();
      }
    });
  });

  describe('refresh token lifetime', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    const DAY_MS = 24 * 60 * 60 * 1000;

    const loginAt = async (svc: AuthService) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
      prisma.user.findUnique.mockResolvedValue(await registeredUser());
      jwt.signAsync.mockResolvedValue('token-finto');
      return svc.login({ email: 'a@b.it', password: 'giusta123' });
    };

    it('lasts 1 day by default', async () => {
      vi.stubEnv('REFRESH_TOKEN_TTL_DAYS', undefined);
      const svc = new AuthService(prisma as unknown as PrismaService, jwt as unknown as JwtService);
      const result = await loginAt(svc);
      expect(result.refreshExpiresAt).toEqual(new Date(now.getTime() + DAY_MS));
    });

    it('follows REFRESH_TOKEN_TTL_DAYS', async () => {
      vi.stubEnv('REFRESH_TOKEN_TTL_DAYS', '7');
      const svc = new AuthService(prisma as unknown as PrismaService, jwt as unknown as JwtService);
      const result = await loginAt(svc);
      expect(result.refreshExpiresAt).toEqual(new Date(now.getTime() + 7 * DAY_MS));
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ expiresAt: result.refreshExpiresAt }),
      });
    });
  });

  describe('refresh', () => {
    const user = { id: 1, email: 'a@b.it', role: 'HIKER' };
    const valid = {
      id: 5,
      userId: 1,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
    };

    it('lancia Unauthorized se il token non esiste', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('sconosciuto')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lancia Unauthorized se il token è scaduto', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...valid,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refresh('scaduto')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('token già revocato: revoca tutte le sessioni dell’utente e lancia Unauthorized', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ ...valid, revokedAt: new Date() });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
      await expect(service.refresh('riusato')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('lancia Unauthorized se un’altra richiesta ha già usato il token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(valid);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.refresh('gara')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('token valido: revoca il vecchio ed emette una nuova coppia di token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(valid);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({});
      jwt.signAsync.mockResolvedValue('nuovo-access');
      const result = await service.refresh('valido');
      expect(result.token).toBe('nuovo-access');
      expect(result.refreshToken).not.toBe('valido');
      expect(result.user).toEqual(user);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 5, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('looks the token up by its SHA-256 hash', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256('raw-token') },
        include: { user: true },
      });
    });

    it('rejects a token that expires exactly now', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const now = new Date('2026-10-28T12:00:00Z');
      vi.setSystemTime(now);
      prisma.refreshToken.findUnique.mockResolvedValue({ ...valid, expiresAt: now });
      await expect(service.refresh('al-limite')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('issues no new session when a revoked token is reused', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ ...valid, revokedAt: new Date() });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.refresh('riusato')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('keeps the current role in the new access token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...valid,
        user: { ...user, role: 'EMPLOYEE' },
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      jwt.signAsync.mockResolvedValue('nuovo-access');
      await service.refresh('valido');
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 1, email: 'a@b.it', role: 'EMPLOYEE' });
    });
  });

  describe('logout', () => {
    it('revoca il refresh token ricevuto', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await service.logout('qualcosa');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    });

    it('revokes only the matching token, by hash, if not already revoked', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await service.logout('qualcosa');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256('qualcosa'), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('senza token non tocca il DB', async () => {
      await service.logout(undefined);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('restituisce l’utente completo', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'a@b.it', role: 'HIKER' });
      await expect(service.me(1)).resolves.toEqual({ id: 1, email: 'a@b.it', role: 'HIKER' });
    });

    it('lancia Unauthorized se l’utente non esiste più', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.me(99)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('never returns the password hash', async () => {
      prisma.user.findUnique.mockResolvedValue(await registeredUser());
      const result = await service.me(1);
      expect(result).not.toHaveProperty('password');
    });
  });
});
