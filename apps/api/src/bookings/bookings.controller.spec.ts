import { ConflictException } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from '../auth/auth.guard.js';
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
  const bookings = { create: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [{ provide: BookingsService, useValue: bookings }],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: { id: number } }>().user = { id: 1 };
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

  it('protects every route with the auth guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, BookingsController)).toContain(AuthGuard);
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
});
