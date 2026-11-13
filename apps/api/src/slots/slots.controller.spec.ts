import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@mountain-hut/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { SlotsController } from './slots.controller.js';
import { SlotsService } from './slots.service.js';

describe('SlotsController', () => {
  let app: INestApplication<App>;
  let role: Role;
  const slots = {
    create: vi.fn(),
    listByDate: vi.fn(),
    findOne: vi.fn(),
    defineTables: vi.fn(),
    floorPlan: vi.fn(),
  };
  const body = { date: '2026-11-02', startTime: '12:00', endTime: '13:00' };

  beforeEach(async () => {
    vi.resetAllMocks();
    role = 'EMPLOYEE';
    const module = await Test.createTestingModule({
      controllers: [SlotsController],
      providers: [{ provide: SlotsService, useValue: slots }],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        // The real RolesGuard runs after this one and reads the role from the request.
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: object }>().user = { id: 1, role };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(['EMPLOYEE', 'WARDEN'] as const)('lets a %s create a slot', async (staffRole) => {
    role = staffRole;
    slots.create.mockResolvedValue({ id: 1 });
    await request(app.getHttpServer()).post('/slots').send(body).expect(201);
    expect(slots.create).toHaveBeenCalledWith(body);
  });

  it('answers 403 to a hiker without calling the service', async () => {
    role = 'HIKER';
    await request(app.getHttpServer()).post('/slots').send(body).expect(403);
    await request(app.getHttpServer())
      .get('/slots/schedule')
      .query({ date: '2026-11-02' })
      .expect(403);
    expect(slots.create).not.toHaveBeenCalled();
    expect(slots.listByDate).not.toHaveBeenCalled();
  });

  it('answers 400 without calling the service when the slot ends before it starts', async () => {
    await request(app.getHttpServer())
      .post('/slots')
      .send({ ...body, startTime: '13:00', endTime: '12:00' })
      .expect(400);
    expect(slots.create).not.toHaveBeenCalled();
  });

  it('lists the slots of the requested day', async () => {
    slots.listByDate.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/slots/schedule')
      .query({ date: '2026-11-02' })
      .expect(200);
    expect(slots.listByDate).toHaveBeenCalledWith('2026-11-02');
  });

  describe('GET /slots/:id/floor', () => {
    it.each(['EMPLOYEE', 'WARDEN'] as const)(
      'lets a %s see the plan of a slot',
      async (staffRole) => {
        role = staffRole;
        const plan = { slot: { id: 5 }, tables: [], groups: [] };
        slots.floorPlan.mockResolvedValue(plan);
        const response = await request(app.getHttpServer()).get('/slots/5/floor').expect(200);
        expect(response.body).toEqual(plan);
        expect(slots.floorPlan).toHaveBeenCalledWith(5);
      },
    );

    it('answers 403 to a hiker without calling the service', async () => {
      role = 'HIKER';
      await request(app.getHttpServer()).get('/slots/5/floor').expect(403);
      expect(slots.floorPlan).not.toHaveBeenCalled();
    });

    it('answers 400 without calling the service when the id is not a number', async () => {
      await request(app.getHttpServer()).get('/slots/abc/floor').expect(400);
      expect(slots.floorPlan).not.toHaveBeenCalled();
    });

    it('propagates the 404 of a slot that does not exist', async () => {
      slots.floorPlan.mockRejectedValue(new NotFoundException('Slot not found'));
      await request(app.getHttpServer()).get('/slots/99/floor').expect(404);
    });
  });
});
