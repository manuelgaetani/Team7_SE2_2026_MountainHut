import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthModule } from './auth.module.js';
import { AuthService } from './auth.service.js';

describe('AuthModule', () => {
  const user = { id: 1, email: 'anna@example.it', role: 'HIKER' };
  const auth = { me: vi.fn() };

  const compile = () =>
    Test.createTestingModule({ imports: [PrismaModule, AuthModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue(auth)
      .compile();

  const tokenLifetime = async () => {
    const module = await compile();
    const jwt = module.get(JwtService);
    const { iat, exp } = jwt.decode<{ iat: number; exp: number }>(jwt.sign({ sub: 1 }));
    return exp - iat;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('JWT_SECRET', 'unit-test-secret');
    vi.stubEnv('JWT_EXPIRES_IN', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses to start without JWT_SECRET', async () => {
    vi.stubEnv('JWT_SECRET', '');
    await expect(compile()).rejects.toThrow('JWT_SECRET is not defined');
  });

  it('signs tokens valid for 15 minutes by default', async () => {
    await expect(tokenLifetime()).resolves.toBe(15 * 60);
  });

  it('signs tokens valid for the configured duration', async () => {
    vi.stubEnv('JWT_EXPIRES_IN', '1h');
    await expect(tokenLifetime()).resolves.toBe(60 * 60);
  });

  it('signs tokens with HS256', async () => {
    const module = await compile();
    const jwt = module.get(JwtService);
    expect(jwt.decode(jwt.sign({ sub: 1 }), { complete: true }).header.alg).toBe('HS256');
  });

  describe('cookie parsing', () => {
    const startApp = async () => {
      const module = await compile();
      const app = module.createNestApplication<import('@nestjs/common').INestApplication<App>>();
      await app.init();
      return { app, jwt: module.get(JwtService) };
    };

    it('reads the session from the token cookie', async () => {
      const { app, jwt } = await startApp();
      auth.me.mockResolvedValue(user);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `token=${jwt.sign({ sub: 1 })}`)
        .expect(200, user);
      await app.close();
    });

    it('answers 401 without the cookie', async () => {
      const { app } = await startApp();
      await request(app.getHttpServer()).get('/auth/me').expect(401);
      await app.close();
    });
  });
});
