import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

// FIXME: this suite fails with "Cannot find package '@nestjs/mapped-types'". @nestjs/swagger
// depends on it, but package-lock.json has no entry for it, so npm ci does not install it.
// Fix: npm install @nestjs/mapped-types@12.0.0 -w @mountain-hut/api
describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get(HealthController);
  });

  it('reports the service as up', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
