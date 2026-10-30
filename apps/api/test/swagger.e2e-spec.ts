import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupSwagger } from '../src/swagger.js';

describe('Swagger (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    setupSwagger(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('serves the OpenAPI document with the health endpoint', async () => {
    if (!app) throw new Error('App non inizializzata');
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(response.body.info.title).toBe('Mountain Hut API');
    expect(response.body.paths).toHaveProperty('/api/health');
  });

  it('declares the session cookie as the authentication scheme', async () => {
    if (!app) throw new Error('App non inizializzata');
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(response.body.components.securitySchemes).toEqual({
      cookie: { type: 'apiKey', in: 'cookie', name: 'token' },
    });
  });

  it('documents the request body of register and login', async () => {
    if (!app) throw new Error('App non inizializzata');
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const bodySchema = (path: string) =>
      response.body.paths[path].post.requestBody?.content['application/json'].schema;
    expect(bodySchema('/api/auth/register')).toMatchObject({
      type: 'object',
      required: ['email', 'password', 'fullName', 'phone'],
    });
    expect(bodySchema('/api/auth/login')).toMatchObject({
      type: 'object',
      required: ['email', 'password'],
    });
  });

  it('marks the current user endpoint as protected by the session cookie', async () => {
    if (!app) throw new Error('App non inizializzata');
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(response.body.paths['/api/auth/me'].get.security).toEqual([{ cookie: [] }]);
  });

  it('serves the Swagger UI', () => {
    if (!app) throw new Error('App non inizializzata');
    return request(app.getHttpServer()).get('/api/docs').expect(200).expect('Content-Type', /html/);
  });
});
