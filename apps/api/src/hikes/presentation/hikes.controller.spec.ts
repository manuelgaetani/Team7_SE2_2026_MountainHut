import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PredefinedHike, RegisteredHike, Role } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { DomainExceptionFilter } from '../../presentation/domain-exception.filter.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { ListMyHikes } from '../application/list-my-hikes.js';
import { ListPredefinedHikes } from '../application/list-predefined-hikes.js';
import { RegisterHike } from '../application/register-hike.js';
import { HikesController } from './hikes.controller.js';

// MH-20 black box: POST /hikes, GET /hikes/predefined and GET /hikes/mine are for hikers only
// (R1, R7, R10). The hiker comes from the session, never from the body.

const body = {
  destination: 'Monte Vettore',
  route: 'From Forca di Presta',
  passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  departureDate: '2035-06-01',
  departureTime: '08:00',
  returnDate: '2035-06-01',
  returnTime: '17:00',
  predefinedHikeId: 2,
};

const registered: RegisteredHike = {
  id: 1,
  destination: 'Monte Vettore',
  route: 'From Forca di Presta',
  passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  departureDate: '2035-06-01',
  departureTime: '08:00',
  returnDate: '2035-06-01',
  returnTime: '17:00',
  predefinedHikeId: 2,
};

const predefined: PredefinedHike[] = [
  {
    id: 2,
    destination: 'Monte Vettore',
    route: 'From Forca di Presta via Rifugio Zilioli',
    passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  },
];

describe('HikesController', () => {
  let app: INestApplication<App>;
  let role: Role;
  const registerHike = { execute: vi.fn() };
  const listPredefined = { execute: vi.fn() };
  const listMine = { execute: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    role = 'HIKER';
    const module = await Test.createTestingModule({
      controllers: [HikesController],
      providers: [
        { provide: RegisterHike, useValue: registerHike },
        { provide: ListPredefinedHikes, useValue: listPredefined },
        { provide: ListMyHikes, useValue: listMine },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        // The real RolesGuard runs after this one and reads the role from the request.
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: object }>().user = { id: 5, role };
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

  const server = () => request(app.getHttpServer());
  const post = (payload: object) => server().post('/hikes').send(payload);

  it('protects every route with the auth guard and the roles guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, HikesController) as unknown[];
    expect(guards).toEqual([AuthGuard, RolesGuard]);
  });

  describe('POST /hikes', () => {
    it('registers the hike of the logged-in hiker (201)', async () => {
      registerHike.execute.mockResolvedValue(registered);
      const res = await post(body);
      expect(res.status).toBe(201);
      expect(res.body).toEqual(registered);
      expect(registerHike.execute).toHaveBeenCalledWith(5, body, expect.any(Date));
    });

    it('passes the current time to the use case', async () => {
      registerHike.execute.mockResolvedValue(registered);
      const before = Date.now();
      await post(body);
      const now = (registerHike.execute.mock.calls[0] as [number, object, Date])[2];
      expect(now.getTime()).toBeGreaterThanOrEqual(before);
      expect(now.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('passes the parsed body: trimmed text and default passage points', async () => {
      registerHike.execute.mockResolvedValue(registered);
      // No passage points and no predefined hike.
      const rest = {
        destination: body.destination,
        route: body.route,
        departureDate: body.departureDate,
        departureTime: body.departureTime,
        returnDate: body.returnDate,
        returnTime: body.returnTime,
      };
      await post({ ...rest, destination: '  Monte Vettore  ' }).expect(201);
      expect(registerHike.execute).toHaveBeenCalledWith(
        5,
        { ...rest, destination: 'Monte Vettore', passagePoints: [] },
        expect.any(Date),
      );
    });

    it('ignores a hiker sent in the body: the hiker is the one of the session', async () => {
      registerHike.execute.mockResolvedValue(registered);
      await post({ ...body, hikerId: 99, userId: 99 }).expect(201);
      const [userId, input] = registerHike.execute.mock.calls[0] as [number, object];
      expect(userId).toBe(5);
      expect(input).not.toHaveProperty('hikerId');
      expect(input).not.toHaveProperty('userId');
    });

    it.each<Role>(['EMPLOYEE', 'WARDEN'])(
      'refuses the %s (403) without registering',
      async (staff) => {
        role = staff;
        const res = await post(body);
        expect(res.status).toBe(403);
        expect(registerHike.execute).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['without a destination', { destination: undefined }],
      ['with an empty route', { route: '   ' }],
      ['with an impossible date', { departureDate: '2035-02-30' }],
      ['with a time out of format', { returnTime: '25:00' }],
      ['with 11 passage points', { passagePoints: Array.from({ length: 11 }, () => 'Point') }],
      ['with a predefined hike id of 0', { predefinedHikeId: 0 }],
      ['with the return at the departure', { returnTime: '08:00' }],
      ['with the return before the departure', { returnDate: '2035-05-31' }],
    ])('refuses a body %s (400) without registering', async (_c, patch) => {
      const res = await post({ ...body, ...patch });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid data');
      expect(Array.isArray(res.body.issues)).toBe(true);
      expect(registerHike.execute).not.toHaveBeenCalled();
    });

    it('refuses an empty body (400)', async () => {
      await post({}).expect(400);
      expect(registerHike.execute).not.toHaveBeenCalled();
    });

    it('reports the return before the departure on returnTime', async () => {
      const res = await post({ ...body, returnTime: '07:00' });
      expect(res.body.issues).toEqual([
        expect.objectContaining({
          path: ['returnTime'],
          message: 'The expected return must be after the planned departure',
        }),
      ]);
    });

    it.each([
      ['FORBIDDEN', 403, 'A hiker profile is required to register a hike'],
      ['NOT_FOUND', 404, 'Predefined hike not found'],
      [
        'CONFLICT',
        409,
        'This hike overlaps your hike to Monte Vettore (2035-06-01 08:00 – 2035-06-01 17:00)',
      ],
      ['UNPROCESSABLE', 422, 'The planned departure must be in the future'],
    ] as const)('maps a %s of the use case to %i', async (code, status, message) => {
      registerHike.execute.mockRejectedValue(new DomainError(code, message));
      const res = await post(body);
      expect(res.status).toBe(status);
      expect(res.body.message).toBe(message);
    });
  });

  describe('GET /hikes/predefined', () => {
    it('lists the predefined hikes for a hiker (200)', async () => {
      listPredefined.execute.mockResolvedValue(predefined);
      const res = await server().get('/hikes/predefined');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(predefined);
    });

    it('returns an empty list (200)', async () => {
      listPredefined.execute.mockResolvedValue([]);
      const res = await server().get('/hikes/predefined');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('refuses the staff (403) without reading the list', async () => {
      role = 'EMPLOYEE';
      await server().get('/hikes/predefined').expect(403);
      expect(listPredefined.execute).not.toHaveBeenCalled();
    });
  });

  describe('GET /hikes/mine', () => {
    it('lists the hikes of the logged-in hiker (200)', async () => {
      listMine.execute.mockResolvedValue([registered]);
      const res = await server().get('/hikes/mine');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([registered]);
      expect(listMine.execute).toHaveBeenCalledWith(5);
    });

    it('maps a user without a hiker profile to 403', async () => {
      listMine.execute.mockRejectedValue(
        new DomainError('FORBIDDEN', 'A hiker profile is required to see your hikes'),
      );
      const res = await server().get('/hikes/mine');
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('A hiker profile is required to see your hikes');
    });

    it('refuses the staff (403) without reading the hikes', async () => {
      role = 'WARDEN';
      await server().get('/hikes/mine').expect(403);
      expect(listMine.execute).not.toHaveBeenCalled();
    });
  });

  // TODO(MH-20-e2e): add Playwright E2E tests of the registration
});
