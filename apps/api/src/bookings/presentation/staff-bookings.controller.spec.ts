import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role, StaffBookingResult } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { DomainExceptionFilter } from '../../presentation/domain-exception.filter.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import type { DomainErrorCode } from '../../shared-kernel/domain-error.js';
import { CreateStaffBooking } from '../application/create-staff-booking.js';
import { StaffBookingsController } from './staff-bookings.controller.js';

// MH-07 black box: POST /staff/bookings, the HTTP contract of the story (API and Errors).

const result: StaffBookingResult = {
  id: 42,
  slotId: 7,
  partySize: 2,
  status: 'CONFIRMED',
  requirements: [],
  tables: [{ tableNumber: 1, assignedSeats: 2 }],
  hiker: {
    id: 15,
    fullName: 'Mario Rossi',
    email: 'mario.rossi@example.com',
    phone: '+39 333 1234567',
    notes: null,
    emergencyContact: null,
    temporary: false,
  },
  generatedPassword: 'k7mq-x3tz-9pwa',
};

const quickEntry = {
  slotId: 7,
  partySize: 4,
  hiker: { kind: 'TEMPORARY', fullName: 'Luca Bianchi', phone: '+39 320 1112233' },
};

describe('StaffBookingsController', () => {
  let app: INestApplication<App>;
  let role: Role;
  const createStaffBooking = { execute: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    role = 'EMPLOYEE';
    const module = await Test.createTestingModule({
      controllers: [StaffBookingsController],
      providers: [{ provide: CreateStaffBooking, useValue: createStaffBooking }],
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
    // As in AppModule: domain errors become HTTP answers.
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (body: unknown) =>
    request(app.getHttpServer())
      .post('/staff/bookings')
      .send(body as object);

  it('protects the route with the auth guard and the roles guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, StaffBookingsController) as unknown[];
    expect(guards).toEqual([AuthGuard, RolesGuard]);
  });

  describe('roles (R1)', () => {
    it.each(['EMPLOYEE', 'WARDEN'] as const)('answers 201 to a %s', async (staffRole) => {
      role = staffRole;
      createStaffBooking.execute.mockResolvedValue(result);
      await post(quickEntry).expect(201);
      expect(createStaffBooking.execute).toHaveBeenCalledOnce();
    });

    it('answers 403 to a hiker without entering the reservation', async () => {
      role = 'HIKER';
      const res = await post(quickEntry).expect(403);
      expect(res.body.message).toBe('Operation not allowed for your role');
      expect(createStaffBooking.execute).not.toHaveBeenCalled();
    });
  });

  describe('valid requests', () => {
    it('returns the booking, the hiker and the generated password', async () => {
      createStaffBooking.execute.mockResolvedValue(result);
      const res = await post(quickEntry).expect(201);
      expect(res.body).toEqual(result);
    });

    it('passes the validated body, with the phone trimmed', async () => {
      createStaffBooking.execute.mockResolvedValue(result);
      await post({ ...quickEntry, hiker: { ...quickEntry.hiker, phone: ' 3201112233 ' } });
      expect(createStaffBooking.execute).toHaveBeenCalledWith({
        slotId: 7,
        partySize: 4,
        hiker: { kind: 'TEMPORARY', fullName: 'Luca Bianchi', phone: '3201112233' },
      });
    });

    it.each([
      ['an existing hiker', { kind: 'EXISTING', hikerId: 15 }],
      ['a quick entry without phone', { kind: 'TEMPORARY', fullName: 'Luca Bianchi' }],
      [
        'a full profile',
        {
          kind: 'ACCOUNT',
          email: 'mario.rossi@example.com',
          fullName: 'Mario Rossi',
          phone: '+39 333 1234567',
        },
      ],
    ])('accepts %s', async (_case, hiker) => {
      createStaffBooking.execute.mockResolvedValue(result);
      await post({ slotId: 7, partySize: 2, hiker }).expect(201);
    });

    it('accepts the MH-05 requirements', async () => {
      createStaffBooking.execute.mockResolvedValue(result);
      const requirements = [{ allergies: true, description: '1 nut allergy' }];
      await post({ ...quickEntry, requirements }).expect(201);
      expect(createStaffBooking.execute).toHaveBeenCalledWith(
        expect.objectContaining({ requirements }),
      );
    });
  });

  describe('invalid body: 400 without entering the reservation', () => {
    it.each([
      ['no hiker', { slotId: 7, partySize: 2 }],
      ['an unknown kind', { ...quickEntry, hiker: { kind: 'GUEST', fullName: 'Luca' } }],
      ['a quick entry without name', { ...quickEntry, hiker: { kind: 'TEMPORARY' } }],
      ['a hiker id of 0', { ...quickEntry, hiker: { kind: 'EXISTING', hikerId: 0 } }],
      [
        'a full profile without phone',
        { ...quickEntry, hiker: { kind: 'ACCOUNT', email: 'a@b.it', fullName: 'Anna' } },
      ],
      ['a party of 0', { ...quickEntry, partySize: 0 }],
      ['a slot id that is not a number', { ...quickEntry, slotId: 'seven' }],
      ['requirements as free text', { ...quickEntry, requirements: 'no nuts' }],
    ])('%s', async (_case, body) => {
      const res = await post(body).expect(400);
      expect(res.body.message).toBe('Invalid data');
      expect(createStaffBooking.execute).not.toHaveBeenCalled();
    });
  });

  describe('refused reservations: the errors of the story', () => {
    it.each<[number, DomainErrorCode, string]>([
      [404, 'NOT_FOUND', 'Slot not found'],
      [404, 'NOT_FOUND', 'Hiker not found'],
      [409, 'CONFLICT', 'Insufficient seats available for this slot'],
      [409, 'CONFLICT', 'The hiker already has a booking for this slot'],
      [409, 'CONFLICT', 'Email already registered'],
      [422, 'UNPROCESSABLE', 'The slot has already started'],
    ])('answers %i "%s: %s"', async (status, code, message) => {
      createStaffBooking.execute.mockRejectedValue(new DomainError(code, message));
      const res = await post(quickEntry).expect(status);
      expect(res.body.message).toBe(message);
    });
  });
});
