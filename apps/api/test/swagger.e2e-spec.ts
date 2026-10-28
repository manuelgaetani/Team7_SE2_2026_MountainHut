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

  it('serves the Swagger UI', () => {
    if (!app) throw new Error('App non inizializzata');
    return request(app.getHttpServer()).get('/api/docs').expect(200).expect('Content-Type', /html/);
  });
});
