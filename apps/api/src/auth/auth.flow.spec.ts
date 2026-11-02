import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthModule } from './auth.module.js';

const SECRET = 'flow-test-secret';

interface StoredUser {
  id: number;
  email: string;
  password: string;
  role: string;
}

interface StoredToken {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

// Behaves like the database for the queries of AuthService, unique constraints included.
function createDatabase() {
  const users: StoredUser[] = [];
  const tokens: StoredToken[] = [];

  const matches = (token: StoredToken, where: Partial<StoredToken>) =>
    Object.entries(where).every(([key, value]) => token[key as keyof StoredToken] === value);

  return {
    users,
    tokens,
    user: {
      findUnique: ({ where }: { where: Partial<StoredUser> }) =>
        Promise.resolve(
          users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
        ),
      create: ({ data }: { data: { email: string; password: string } }) => {
        if (users.some((u) => u.email === data.email)) {
          throw new Prisma.PrismaClientKnownRequestError('Duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const user = {
          id: users.length + 1,
          email: data.email,
          password: data.password,
          role: 'HIKER',
        };
        users.push(user);
        return Promise.resolve(user);
      },
    },
    refreshToken: {
      create: ({ data }: { data: Omit<StoredToken, 'id' | 'revokedAt'> }) => {
        tokens.push({ ...data, id: tokens.length + 1, revokedAt: null });
        return Promise.resolve();
      },
      findUnique: ({ where }: { where: { tokenHash: string } }) => {
        const stored = tokens.find((t) => t.tokenHash === where.tokenHash);
        return Promise.resolve(
          stored ? { ...stored, user: users.find((u) => u.id === stored.userId) } : null,
        );
      },
      updateMany: ({ where, data }: { where: Partial<StoredToken>; data: { revokedAt: Date } }) => {
        const found = tokens.filter((t) => matches(t, where));
        found.forEach((t) => {
          t.revokedAt = data.revokedAt;
        });
        return Promise.resolve({ count: found.length });
      },
    },
  };
}

describe('Authentication flow over HTTP', () => {
  let app: INestApplication<App>;
  let db: ReturnType<typeof createDatabase>;

  const account = {
    email: 'anna@example.it',
    password: 'password123',
    fullName: 'Anna Rossi',
    phone: '3331234567',
  };
  const credentials = { email: account.email, password: account.password };

  const http = () => request(app.getHttpServer());
  const register = () => http().post('/auth/register').send(account);
  const login = (body: object = credentials) => http().post('/auth/login').send(body);

  const setCookies = (response: request.Response) =>
    ([response.headers['set-cookie'] ?? []] as (string | string[])[]).flat();
  const cookie = (response: request.Response, name: string) => {
    const header = setCookies(response).find((c) => c.startsWith(`${name}=`));
    return header?.split(';')[0] ?? '';
  };
  const session = async () => {
    await register();
    const response = await login();
    return {
      access: cookie(response, 'token'),
      refresh: cookie(response, 'refresh_token'),
    };
  };

  const me = (access: string) => http().get('/auth/me').set('Cookie', access);
  const refresh = (token: string) => http().post('/auth/refresh').set('Cookie', token);

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', SECRET);
    db = createDatabase();
    const module = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .useMocker((token) => (token === PrismaService ? db : undefined))
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('registration', () => {
    it('creates the account and never returns the password', async () => {
      const response = await register();
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ id: 1, email: account.email, role: 'HIKER' });
      expect(JSON.stringify(response.body)).not.toContain('password');
    });

    it('stores a hash, not the password', async () => {
      await register();
      expect(db.users[0]?.password).toMatch(/^\$2[aby]\$10\$/);
      expect(db.users[0]?.password).not.toContain(account.password);
    });

    it('does not open a session', async () => {
      expect(setCookies(await register())).toEqual([]);
    });

    it('treats an email in another case as the same account', async () => {
      await register();
      const response = await http()
        .post('/auth/register')
        .send({ ...account, email: ' ANNA@Example.IT ' });
      expect(response.status).toBe(409);
      expect(db.users).toHaveLength(1);
    });

    it('creates one account when the same email is registered twice at once', async () => {
      const statuses = (await Promise.all([register(), register()])).map((r) => r.status);
      expect(statuses.sort()).toEqual([201, 409]);
      expect(db.users).toHaveLength(1);
    });

    it('ignores a role sent by the client', async () => {
      const response = await http()
        .post('/auth/register')
        .send({ ...account, role: 'WARDEN' });
      expect(response.body.role).toBe('HIKER');
    });

    it.each([
      ['a NUL byte in the full name', { fullName: 'Anna\u0000Rossi' }],
      ['a NUL byte in the notes', { notes: 'a\u0000b' }],
      ['a NUL byte in the emergency contact', { emergencyContact: 'a\u0000b' }],
    ])('answers 400 to %s, which the database cannot store', async (_name, fields) => {
      const response = await http()
        .post('/auth/register')
        .send({ ...account, ...fields });
      expect(response.status).toBe(400);
    });

    it.each([
      ['an array', []],
      ['a string', '"text"'],
      ['no body', undefined],
    ])('answers 400 to %s', async (_name, body) => {
      const response = await http()
        .post('/auth/register')
        .set('Content-Type', 'application/json')
        .send(body as object);
      expect(response.status).toBe(400);
    });

    it('answers 400 and not 500 to malformed JSON', async () => {
      const response = await http()
        .post('/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"email":');
      expect(response.status).toBe(400);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await register();
    });

    it('accepts the email in another case', async () => {
      const response = await login({ ...credentials, email: 'ANNA@EXAMPLE.IT' });
      expect(response.status).toBe(200);
    });

    it('sets hardened cookies and keeps the tokens out of the body', async () => {
      const response = await login();
      const [access, refreshCookie] = [
        setCookies(response).find((c) => c.startsWith('token=')),
        setCookies(response).find((c) => c.startsWith('refresh_token=')),
      ];
      expect(access).toMatch(/HttpOnly/i);
      expect(access).toMatch(/SameSite=Lax/i);
      expect(refreshCookie).toMatch(/HttpOnly/i);
      expect(refreshCookie).toMatch(/Path=\/api\/auth/);
      expect(JSON.stringify(response.body)).not.toMatch(/eyJ/);
      expect(Object.keys(response.body as object).sort()).toEqual(['email', 'id', 'role']);
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const wrongPassword = await login({ ...credentials, password: 'wrong-password1' });
      const unknownEmail = await login({ ...credentials, email: 'nobody@example.it' });
      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });

    it('rejects a password that is the right one plus extra characters past 72 bytes', async () => {
      await http()
        .post('/auth/register')
        .send({ ...account, email: 'long@example.it', password: `1${'a'.repeat(71)}` });
      const response = await login({
        email: 'long@example.it',
        password: `1${'a'.repeat(71)}extra`,
      });
      expect(response.status).not.toBe(200);
    });

    it('does not treat a NoSQL style object as a password', async () => {
      const response = await login({ ...credentials, password: { $ne: null } });
      expect(response.status).toBe(400);
    });

    it('stores only the hash of the refresh token', async () => {
      const response = await login();
      const raw = cookie(response, 'refresh_token').split('=')[1] ?? '';
      expect(raw).not.toBe('');
      expect(db.tokens[0]?.tokenHash).not.toContain(raw);
    });
  });

  describe('session', () => {
    it('returns the logged in user', async () => {
      const { access } = await session();
      const response = await me(access);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: 1, email: account.email, role: 'HIKER' });
    });

    it('rejects a valid token of a user who no longer exists', async () => {
      const { access } = await session();
      db.users.length = 0;
      expect((await me(access)).status).toBe(401);
    });

    it('rejects the refresh token used as access token', async () => {
      const { refresh: token } = await session();
      expect((await me(`token=${token.split('=')[1]}`)).status).toBe(401);
    });

    it('rejects an access token signed with another secret', async () => {
      const forged = new JwtService({ secret: 'other-secret' }).sign({ sub: 1 });
      expect((await me(`token=${forged}`)).status).toBe(401);
    });

    it('rejects an expired access token', async () => {
      const expired = new JwtService({ secret: SECRET }).sign({ sub: 1 }, { expiresIn: -1 });
      expect((await me(`token=${expired}`)).status).toBe(401);
    });

    it('takes the role from the database, not from the token', async () => {
      const { access } = await session();
      db.users[0]!.role = 'WARDEN';
      expect((await me(access)).body.role).toBe('WARDEN');
    });
  });

  describe('refresh', () => {
    it('rotates the tokens', async () => {
      const { refresh: first } = await session();
      const response = await refresh(first);
      expect(response.status).toBe(200);
      const next = cookie(response, 'refresh_token');
      expect(next).not.toBe('');
      expect(next).not.toBe(first);
      expect((await refresh(next)).status).toBe(200);
    });

    it('revokes every session when a used token is replayed', async () => {
      const { refresh: stolen } = await session();
      const other = cookie(await login(), 'refresh_token');
      const current = cookie(await refresh(stolen), 'refresh_token');

      expect((await refresh(stolen)).status).toBe(401);

      expect((await refresh(current)).status).toBe(401);
      expect((await refresh(other)).status).toBe(401);
    });

    it('does not touch the sessions of other users on a replay', async () => {
      const { refresh: stolen } = await session();
      await http()
        .post('/auth/register')
        .send({ ...account, email: 'other@example.it' });
      const other = await login({ ...credentials, email: 'other@example.it' });
      await refresh(stolen);
      await refresh(stolen);
      expect((await refresh(cookie(other, 'refresh_token'))).status).toBe(200);
    });

    it('lets only one of two simultaneous requests use a token', async () => {
      const { refresh: token } = await session();
      const statuses = (await Promise.all([refresh(token), refresh(token)])).map((r) => r.status);
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    });

    it('rejects an expired token', async () => {
      const { refresh: token } = await session();
      db.tokens[0]!.expiresAt = new Date(Date.now() - 1);
      expect((await refresh(token)).status).toBe(401);
    });

    it('rejects a token that was never issued', async () => {
      expect((await refresh('refresh_token=made-up')).status).toBe(401);
    });

    it('rejects the access token used as refresh token', async () => {
      const { access } = await session();
      expect((await refresh(`refresh_token=${access.split('=')[1]}`)).status).toBe(401);
    });

    it.each(['j:{"a":1}', 'j:[1]', 'j:null', 'j:1', 'j:"text"'])(
      'answers 401 and not 500 to the cookie value %s',
      async (value) => {
        expect((await refresh(`refresh_token=${value}`)).status).toBe(401);
      },
    );
  });

  describe('logout', () => {
    it('makes the refresh token useless and clears the cookies', async () => {
      const { refresh: token } = await session();
      const response = await http().post('/auth/logout').set('Cookie', token);
      expect(response.status).toBe(200);
      expect(cookie(response, 'token')).toBe('token=');
      expect(cookie(response, 'refresh_token')).toBe('refresh_token=');
      expect((await refresh(token)).status).toBe(401);
    });

    it('keeps the other sessions of the user', async () => {
      const { refresh: first } = await session();
      const second = cookie(await login(), 'refresh_token');
      await http().post('/auth/logout').set('Cookie', first);
      expect((await refresh(second)).status).toBe(200);
    });

    it('works without a session and for an unknown token', async () => {
      expect((await http().post('/auth/logout')).status).toBe(200);
      const response = await http().post('/auth/logout').set('Cookie', 'refresh_token=made-up');
      expect(response.status).toBe(200);
    });

    it.each(['j:{"a":1}', 'j:[1]'])(
      'answers 200 and not 500 to the cookie value %s',
      async (value) => {
        const response = await http().post('/auth/logout').set('Cookie', `refresh_token=${value}`);
        expect(response.status).toBe(200);
      },
    );
  });

  describe('configuration', () => {
    it('refuses to start without JWT_SECRET', async () => {
      vi.stubEnv('JWT_SECRET', undefined);
      const compile = Test.createTestingModule({ imports: [AuthModule] })
        .useMocker((token) => (token === PrismaService ? db : undefined))
        .compile();
      await expect(compile).rejects.toThrow('JWT_SECRET is not defined');
    });
  });

  describe('protected routes', () => {
    it.each(['j:{"a":1}', 'j:[1]', 'j:null'])(
      'answers 401 to the cookie value %s',
      async (value) => {
        expect((await me(`token=${value}`)).status).toBe(401);
      },
    );

    it('answers 401 without cookies', async () => {
      expect((await http().get('/auth/me')).status).toBe(401);
    });
  });
});
