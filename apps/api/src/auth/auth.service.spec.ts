import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  describe('register', () => {
    it('lancia Conflict se l’email esiste già', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      await expect(
        service.register({ email: 'a@b.it', password: 'password123', firstName: 'Anna' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('crea l’utente con ruolo di default e senza esporre la password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 2, firstName: 'Anna', role: 'HIKER' });
      const result = await service.register({
        email: 'a@b.it',
        password: 'password123',
        firstName: 'Anna',
      });
      expect(result).toEqual({ id: 2, email: 'a@b.it', firstName: 'Anna', role: 'HIKER' });
    });

    it('traduce l’errore unique P2002 in Conflict', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.register({ email: 'a@b.it', password: 'password123', firstName: 'Anna' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('lancia Unauthorized con password sbagliata', async () => {
      const password = await bcrypt.hash('giusta123', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        firstName: 'Anna',
        role: 'HIKER',
        password,
      });
      await expect(
        service.login({ email: 'a@b.it', password: 'sbagliata' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lancia Unauthorized se l’utente non ha password (temporaneo)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        firstName: 'Anna',
        role: 'HIKER',
        password: null,
      });
      await expect(
        service.login({ email: 'a@b.it', password: 'qualsiasi' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lancia Unauthorized se l’utente non esiste', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'x@y.it', password: 'qualsiasi' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('restituisce access token, refresh token e utente', async () => {
      const password = await bcrypt.hash('giusta123', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        firstName: 'Anna',
        role: 'HIKER',
        password,
      });
      jwt.signAsync.mockResolvedValue('token-finto');
      prisma.refreshToken.create.mockResolvedValue({});
      const result = await service.login({ email: 'a@b.it', password: 'giusta123' });
      expect(result.token).toBe('token-finto');
      expect(result.refreshToken.length).toBeGreaterThan(20);
      expect(result.user).toEqual({ id: 1, email: 'a@b.it', firstName: 'Anna', role: 'HIKER' });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 1, tokenHash: expect.any(String) }),
      });
    });
  });

  describe('refresh', () => {
    const user = { id: 1, email: 'a@b.it', firstName: 'Anna', role: 'HIKER' };
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
  });

  describe('logout', () => {
    it('revoca il refresh token ricevuto', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await service.logout('qualcosa');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    });

    it('senza token non tocca il DB', async () => {
      await service.logout(undefined);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('restituisce l’utente completo', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'a@b.it',
        firstName: 'Anna',
        role: 'HIKER',
      });
      await expect(service.me(1)).resolves.toEqual({
        id: 1,
        email: 'a@b.it',
        firstName: 'Anna',
        role: 'HIKER',
      });
    });

    it('lancia Unauthorized se l’utente non esiste più', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.me(99)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
