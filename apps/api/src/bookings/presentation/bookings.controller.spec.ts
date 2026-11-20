import { ConflictException } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { ROLES_KEY } from '../../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { DomainExceptionFilter } from '../../presentation/domain-exception.filter.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from '../application/bookings.service.js';
import { ListMyBookings } from '../application/list-my-bookings.js';

const result = {
  id: 9,
  slotId: 3,
  partySize: 2,
  status: 'CONFIRMED',
  tables: [{ tableNumber: 1, assignedSeats: 2 }],
};

describe('BookingsController', () => {
  let app: INestApplication<App>;
  const bookings = { create: vi.fn(), change: vi.fn() };
  const myBookings = { execute: vi.fn() };
  // Role of the fake authenticated user: each test can change it.
  let role: Role;

  beforeEach(async () => {
    vi.resetAllMocks();
    role = 'HIKER';
    const module = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: bookings },
        { provide: ListMyBookings, useValue: myBookings },
      ],
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
    app.useGlobalFilters(new DomainExceptionFilter());
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

  describe('party requirements (MH-05)', () => {
    const requirement = { allergies: true, description: 'no nuts' };

    it('passes the requirements to the service trimmed and without unknown fields', async () => {
      bookings.create.mockResolvedValue(result);
      await post({
        slotId: 3,
        partySize: 3,
        requirements: [
          { ...requirement, description: '  1 vegan, peanut allergy ', bookingId: 99 },
          { allergies: false, description: '2 vegetarians' },
        ],
      }).expect(201);
      expect(bookings.create).toHaveBeenCalledWith(1, {
        slotId: 3,
        partySize: 3,
        requirements: [
          { allergies: true, description: '1 vegan, peanut allergy' },
          { allergies: false, description: '2 vegetarians' },
        ],
      });
    });

    it.each([
      ['an allergies flag that is not a boolean', [{ ...requirement, allergies: 'yes' }]],
      ['a requirement without allergies flag', [{ description: 'no nuts' }]],
      ['an empty description', [{ ...requirement, description: '   ' }]],
      ['a description over 500 characters', [{ ...requirement, description: 'a'.repeat(501) }]],
      ['more than 20 requirements', Array.from({ length: 21 }, () => requirement)],
      ['requirements that are not a list', 'no nuts'],
    ])('answers 400 without calling the service for %s', async (_case, requirements) => {
      await post({ slotId: 3, partySize: 2, requirements }).expect(400);
      expect(bookings.create).not.toHaveBeenCalled();
    });
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

  // GET /bookings/me: the upcoming bookings of the logged hiker.
  describe('listMine', () => {
    it('allows only hikers', () => {
      expect(Reflect.getMetadata(ROLES_KEY, BookingsController.prototype.listMine)).toEqual([
        'HIKER',
      ]);
    });

    it('answers 200 with the bookings of the authenticated user', async () => {
      const mine = [{ id: 9, slotId: 3, date: '2026-11-21', status: 'CONFIRMED' }];
      myBookings.execute.mockResolvedValue(mine);
      const response = await request(app.getHttpServer()).get('/bookings/me').expect(200);
      expect(response.body).toEqual(mine);
      expect(myBookings.execute).toHaveBeenCalledWith(1, expect.any(Date));
    });

    it.each(['EMPLOYEE', 'WARDEN'] as const)('answers 403 for a %s', async (staffRole) => {
      role = staffRole;
      await request(app.getHttpServer()).get('/bookings/me').expect(403);
      expect(myBookings.execute).not.toHaveBeenCalled();
    });
  });

  // MH-06: PATCH /bookings/:id changes a booking.
  describe('change', () => {
    const changed = {
      ...result,
      partySize: 4,
      requirements: [{ allergies: false, description: '2 vegans' }],
    };
    const patch = (id: string, body: object) =>
      request(app.getHttpServer()).patch(`/bookings/${id}`).send(body);

    it('allows only hikers to change a booking', () => {
      expect(Reflect.getMetadata(ROLES_KEY, BookingsController.prototype.change)).toEqual([
        'HIKER',
      ]);
    });

    it('answers 200 with the changed booking', async () => {
      bookings.change.mockResolvedValue(changed);
      const response = await patch('9', { partySize: 4 }).expect(200);
      expect(response.body).toEqual(changed);
    });

    it('changes for the authenticated user, with the id of the path as a number', async () => {
      bookings.change.mockResolvedValue(changed);
      await patch('9', {
        slotId: 5,
        partySize: 4,
        requirements: [{ allergies: false, description: '  2 vegans  ' }],
      });
      expect(bookings.change).toHaveBeenCalledWith(1, 9, {
        slotId: 5,
        partySize: 4,
        requirements: [{ allergies: false, description: '2 vegans' }],
      });
    });

    it('allows clearing requirements with an empty list', async () => {
      bookings.change.mockResolvedValue({ ...changed, requirements: [] });
      await patch('9', { requirements: [] }).expect(200);
      expect(bookings.change).toHaveBeenCalledWith(1, 9, { requirements: [] });
    });

    it('ignores a hiker or user id sent in the body', async () => {
      bookings.change.mockResolvedValue(changed);
      await patch('9', { partySize: 4, hikerId: 99, userId: 99 });
      expect(bookings.change).toHaveBeenCalledWith(1, 9, { partySize: 4 });
    });

    it.each([
      ['an empty change', {}],
      ['a party of 0', { partySize: 0 }],
      ['a party above Postgres int max', { partySize: 2_147_483_648 }],
      ['a slot id of 0', { slotId: 0 }],
      ['a slot id above Postgres int max', { slotId: 2_147_483_648 }],
      ['requirements that are not a list', { requirements: 'no nuts' }],
      [
        'a requirement description longer than 500 characters',
        { requirements: [{ allergies: false, description: 'A'.repeat(501) }] },
      ],
      [
        'an empty requirement description',
        { requirements: [{ allergies: false, description: '   ' }] },
      ],
      [
        'a requirement with a non-boolean allergies flag',
        { requirements: [{ allergies: 'yes', description: 'no nuts' }] },
      ],
      ['a requirement without an allergies flag', { requirements: [{ description: 'no nuts' }] }],
      [
        'more than 20 requirements',
        {
          requirements: Array.from({ length: 21 }, () => ({
            allergies: false,
            description: 'vegan',
          })),
        },
      ],
      [
        'a requirement containing a NUL byte',
        { requirements: [{ allergies: true, description: 'no\u0000nuts' }] },
      ],
    ])('answers 400 without calling the service for %s', async (_name, body) => {
      await patch('9', body).expect(400);
      expect(bookings.change).not.toHaveBeenCalled();
    });

    it('answers 400 without calling the service when the id is not a number', async () => {
      await patch('abc', { partySize: 4 }).expect(400);
      expect(bookings.change).not.toHaveBeenCalled();
    });

    it('checks the role before validating the change body', async () => {
      role = 'EMPLOYEE';
      await patch('9', {}).expect(403);
      expect(bookings.change).not.toHaveBeenCalled();
    });

    it.each(['EMPLOYEE', 'WARDEN'] as const)(
      'answers 403 for a %s without calling the service',
      async (staffRole) => {
        role = staffRole;
        await patch('9', { partySize: 4 }).expect(403);
        expect(bookings.change).not.toHaveBeenCalled();
      },
    );

    it.each([
      [new DomainError('CONFLICT', 'Insufficient seats available for the updated booking'), 409],
      [new DomainError('UNPROCESSABLE', 'Changes are only admitted up to 48 hours'), 422],
      [new DomainError('NOT_FOUND', 'Booking not found'), 404],
      [new DomainError('FORBIDDEN', 'You can only change your own bookings'), 403],
    ])('maps %s from the service', async (error, status) => {
      bookings.change.mockRejectedValue(error);
      await patch('9', { partySize: 4 }).expect(status);
    });
  });
});
