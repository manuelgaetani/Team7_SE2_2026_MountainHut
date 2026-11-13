import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@mountain-hut/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { ROLES_KEY } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

const result = {
  id: 9,
  slotId: 3,
  partySize: 2,
  status: 'CONFIRMED',
  tables: [{ tableNumber: 1, assignedSeats: 2 }],
};

describe('BookingsController', () => {
  let app: INestApplication<App>;
  const bookings = { create: vi.fn(), cancel: vi.fn() };
  // Role of the fake authenticated user: each test can change it.
  let role: Role;

  beforeEach(async () => {
    vi.resetAllMocks();
    role = 'HIKER';
    const module = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [{ provide: BookingsService, useValue: bookings }],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: { id: number; role: Role } }>().user = {
            id: 1,
            role,
          };
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

  const post = (body: object) => request(app.getHttpServer()).post('/bookings').send(body);

  it('protects every route with the auth guard and the roles guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BookingsController) as unknown[];
    expect(guards).toContain(AuthGuard);
    expect(guards).toContain(RolesGuard);
  });

  it('allows only hikers to book', () => {
    expect(Reflect.getMetadata(ROLES_KEY, BookingsController.prototype.create)).toEqual(['HIKER']);
  });

  it('answers 201 with the created booking', async () => {
    bookings.create.mockResolvedValue(result);
    const response = await post({ slotId: 3, partySize: 2 }).expect(201);
    expect(response.body).toEqual(result);
  });

  it('books for the authenticated user', async () => {
    bookings.create.mockResolvedValue(result);
    await post({ slotId: 3, partySize: 2 });
    expect(bookings.create).toHaveBeenCalledWith(1, { slotId: 3, partySize: 2 });
  });

  it('ignores a hiker or user id sent in the body', async () => {
    bookings.create.mockResolvedValue(result);
    await post({ slotId: 3, partySize: 2, hikerId: 99, userId: 99 });
    expect(bookings.create).toHaveBeenCalledWith(1, { slotId: 3, partySize: 2 });
  });

  it('answers 400 without calling the service when the body is invalid', async () => {
    await post({ slotId: 3, partySize: 0 }).expect(400);
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it('propagates the errors of the service', async () => {
    bookings.create.mockRejectedValue(new ConflictException('No seats'));
    const response = await post({ slotId: 3, partySize: 2 });
    expect(response.status).toBe(409);
  });

  describe('staff accounts', () => {
    it.each(['EMPLOYEE', 'WARDEN'] as const)(
      'answers 403 for a %s without calling the service',
      async (staffRole) => {
        role = staffRole;
        const response = await post({ slotId: 3, partySize: 2 }).expect(403);
        expect(response.body).toMatchObject({ message: 'Operation not allowed for your role' });
        expect(bookings.create).not.toHaveBeenCalled();
      },
    );

    it('checks the role before validating the body', async () => {
      role = 'EMPLOYEE';
      await post({ slotId: 3, partySize: 0 }).expect(403);
      expect(bookings.create).not.toHaveBeenCalled();
    });
  });

  // MH-08: POST /bookings/:id/cancel.
  describe('cancel', () => {
    const cancelled = { id: 9, slotId: 3, partySize: 2, status: 'CANCELLED' };
    const cancel = (id: string) =>
      request(app.getHttpServer()).post(`/bookings/${id}/cancel`).send();

    it('allows only hikers to cancel', () => {
      expect(Reflect.getMetadata(ROLES_KEY, BookingsController.prototype.cancel)).toEqual([
        'HIKER',
      ]);
    });

    it('answers 200 with the cancelled booking', async () => {
      bookings.cancel.mockResolvedValue(cancelled);
      const response = await cancel('9').expect(200);
      expect(response.body).toEqual(cancelled);
    });

    it('cancels for the authenticated user, with the id of the path as a number', async () => {
      bookings.cancel.mockResolvedValue(cancelled);
      await cancel('9');
      expect(bookings.cancel).toHaveBeenCalledWith(1, 9);
    });

    it.each(['abc', '1.5'])(
      'answers 400 without calling the service for the id "%s"',
      async (id) => {
        await cancel(id).expect(400);
        expect(bookings.cancel).not.toHaveBeenCalled();
      },
    );

    it.each(['EMPLOYEE', 'WARDEN'] as const)(
      'answers 403 for a %s without calling the service',
      async (staffRole) => {
        role = staffRole;
        await cancel('9').expect(403);
        expect(bookings.cancel).not.toHaveBeenCalled();
      },
    );

    it.each([
      [new NotFoundException('Booking not found'), 404],
      [new ConflictException('This booking is already cancelled'), 409],
      [new ForbiddenException('A hiker profile is required to cancel a booking'), 403],
    ])('propagates %s from the service', async (error, status) => {
      bookings.cancel.mockRejectedValue(error);
      await cancel('9').expect(status);
    });
  });
});
