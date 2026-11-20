import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { DomainExceptionFilter } from '../../presentation/domain-exception.filter.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { SlotsController } from './slots.controller.js';
import { ListBookableSlots } from '../../bookings/application/list-bookable-slots.js';
import { SlotsService } from '../application/slots.service.js';

describe('SlotsController', () => {
  let app: INestApplication<App>;
  let role: Role;
  const slots = {
    create: vi.fn(),
    listByDate: vi.fn(),
    findOne: vi.fn(),
    defineTables: vi.fn(),
    floorPlan: vi.fn(),
    repeatWeekly: vi.fn(),
  };
  const bookable = { execute: vi.fn() };
  const body = { date: '2026-11-02', startTime: '12:00', endTime: '13:00' };

  beforeEach(async () => {
    vi.resetAllMocks();
    role = 'EMPLOYEE';
    const module = await Test.createTestingModule({
      controllers: [SlotsController],
      providers: [
        { provide: SlotsService, useValue: slots },
        { provide: ListBookableSlots, useValue: bookable },
      ],
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
    // Registered globally by AppModule (APP_FILTER): maps DomainError to its HTTP status.
    app.useGlobalFilters(new DomainExceptionFilter());
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

  it.each(['HIKER', 'EMPLOYEE', 'WARDEN'] as const)(
    'lets a %s list the bookable slots',
    async (anyRole) => {
      role = anyRole;
      bookable.execute.mockResolvedValue([{ id: 1 }]);
      const res = await request(app.getHttpServer()).get('/slots').expect(200);
      expect(res.body).toEqual([{ id: 1 }]);
      expect(bookable.execute).toHaveBeenCalledWith(expect.any(Date));
    },
  );

  it('keeps the staff routes closed to a hiker next to the open listing', async () => {
    role = 'HIKER';
    await request(app.getHttpServer()).get('/slots/1').expect(403);
    await request(app.getHttpServer()).put('/slots/1/tables').send({}).expect(403);
    expect(slots.findOne).not.toHaveBeenCalled();
    expect(slots.defineTables).not.toHaveBeenCalled();
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
      slots.floorPlan.mockRejectedValue(new DomainError('NOT_FOUND', 'Slot not found'));
      await request(app.getHttpServer()).get('/slots/99/floor').expect(404);
    });
  });

  describe('GET /slots/:id', () => {
    it.each(['EMPLOYEE', 'WARDEN'] as const)('lets a %s read a slot by id', async (staffRole) => {
      role = staffRole;
      const details = { id: 5, ...body, tables: [], totalSeats: 0 };
      slots.findOne.mockResolvedValue(details);
      const response = await request(app.getHttpServer()).get('/slots/5').expect(200);
      expect(response.body).toEqual(details);
      expect(slots.findOne).toHaveBeenCalledWith(5);
    });

    it('answers 400 without calling the service when the id is not a number', async () => {
      await request(app.getHttpServer()).get('/slots/abc').expect(400);
      expect(slots.findOne).not.toHaveBeenCalled();
    });

    it('propagates 404 when the slot does not exist', async () => {
      slots.findOne.mockRejectedValue(new DomainError('NOT_FOUND', 'Slot not found'));
      await request(app.getHttpServer()).get('/slots/99').expect(404);
    });
  });

  describe('PUT /slots/:id/tables', () => {
    const tablesInput = { tables: [{ tableNumber: 1, seats: 4 }] };

    it.each(['EMPLOYEE', 'WARDEN'] as const)(
      'lets a %s define tables on an existing slot',
      async (staffRole) => {
        role = staffRole;
        const updated = { id: 5, ...body, ...tablesInput, totalSeats: 4 };
        slots.defineTables.mockResolvedValue(updated);
        const response = await request(app.getHttpServer())
          .put('/slots/5/tables')
          .send(tablesInput)
          .expect(200);
        expect(response.body).toEqual(updated);
        expect(slots.defineTables).toHaveBeenCalledWith(5, tablesInput);
      },
    );

    it('answers 400 without calling the service when the body or id is invalid', async () => {
      await request(app.getHttpServer()).put('/slots/5/tables').send({}).expect(400);
      await request(app.getHttpServer()).put('/slots/abc/tables').send(tablesInput).expect(400);
      expect(slots.defineTables).not.toHaveBeenCalled();
    });

    it('propagates 409 when the slot already has tables', async () => {
      slots.defineTables.mockRejectedValue(
        new DomainError('CONFLICT', 'This slot already has tables: changing them is MH-19'),
      );
      await request(app.getHttpServer()).put('/slots/5/tables').send(tablesInput).expect(409);
    });
  });
});
