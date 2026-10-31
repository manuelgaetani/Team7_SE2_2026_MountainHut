import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AppModule', () => {
  let app: INestApplication<App> | undefined;
  let webDist: string;

  // The static module is chosen when app.module.ts is evaluated, so each test imports it again.
  // NestFactory like main.ts: a testing module picks the static loader before the HTTP adapter
  // exists, so it would never serve the SPA.
  const startApp = async () => {
    vi.resetModules();
    const { AppModule } = await import('./app.module.js');
    const { PrismaService } = await import('./prisma/prisma.service.js');
    vi.spyOn(PrismaService.prototype, 'onModuleInit').mockResolvedValue();
    vi.spyOn(PrismaService.prototype, 'onModuleDestroy').mockResolvedValue();
    app = await NestFactory.create<INestApplication<App>>(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.init();
    return request(app.getHttpServer());
  };

  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'unit-test-secret');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:password@localhost:5432/test');
    webDist = mkdtempSync(join(tmpdir(), 'web-dist-'));
    writeFileSync(join(webDist, 'index.html'), '<title>Mountain Hut</title>');
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(webDist, { recursive: true });
  });

  it('serves the SPA when the built web app exists', async () => {
    vi.stubEnv('WEB_DIST_PATH', webDist);
    const http = await startApp();
    const response = await http.get('/').expect(200);
    expect(response.text).toContain('Mountain Hut');
  });

  it('keeps the API reachable next to the SPA', async () => {
    vi.stubEnv('WEB_DIST_PATH', webDist);
    const http = await startApp();
    await http.get('/api/health').expect(200, { status: 'ok' });
  });

  it('serves only the API when the built web app is missing', async () => {
    vi.stubEnv('WEB_DIST_PATH', join(webDist, 'missing'));
    const http = await startApp();
    await http.get('/').expect(404);
    await http.get('/api/health').expect(200);
  });

  it('starts with the default web path', async () => {
    vi.stubEnv('WEB_DIST_PATH', undefined);
    const http = await startApp();
    await http.get('/api/health').expect(200);
  });
});
