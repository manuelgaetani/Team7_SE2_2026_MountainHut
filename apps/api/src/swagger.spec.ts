import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HealthController } from './health/health.controller.js';
import { ACCESS_TOKEN_COOKIE, SWAGGER_PATH, setupSwagger } from './swagger.js';

describe('setupSwagger', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    app = module.createNestApplication();
    setupSwagger(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('publishes the OpenAPI document with the API title', async () => {
    const response = await request(app.getHttpServer()).get(`/${SWAGGER_PATH}-json`).expect(200);
    expect(response.body.info).toMatchObject({ title: 'Mountain Hut API', version: '0.0.1' });
  });

  it('documents the cookie that carries the session', async () => {
    const response = await request(app.getHttpServer()).get(`/${SWAGGER_PATH}-json`);
    expect(Object.values(response.body.components.securitySchemes)).toContainEqual(
      expect.objectContaining({ in: 'cookie', name: ACCESS_TOKEN_COOKIE }),
    );
  });

  it('serves the interactive documentation', async () => {
    await request(app.getHttpServer()).get(`/${SWAGGER_PATH}/`).expect(200);
  });
});
