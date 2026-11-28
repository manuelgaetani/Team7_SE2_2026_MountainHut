import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role, StaffHike } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { DomainExceptionFilter } from '../../presentation/domain-exception.filter.js';
import { ListHikesForStaff } from '../application/list-hikes-for-staff.js';
import { StaffHikesController } from './staff-hikes.controller.js';

// MH-20 black box: GET /staff/hikes, the hikes of the hikers for the hut staff.

const hikes: StaffHike[] = [
  {
    id: 4,
    destination: 'Monte Vettore',
    route: 'From Forca di Presta',
    passagePoints: [],
    departureDate: '2026-11-27',
    departureTime: '08:00',
    returnDate: '2026-11-27',
    returnTime: '17:00',
    predefinedHikeId: null,
    hiker: {
      id: 7,
      fullName: 'Anna Bianchi',
      email: 'anna@example.test',
      phone: '+39 333 111 2222',
      emergencyContact: null,
    },
  },
];

describe('StaffHikesController', () => {
  let app: INestApplication<App>;
  let role: Role;
  const listHikes = { execute: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    role = 'EMPLOYEE';
    const module = await Test.createTestingModule({
      controllers: [StaffHikesController],
      providers: [{ provide: ListHikesForStaff, useValue: listHikes }],
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
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = () => request(app.getHttpServer()).get('/staff/hikes');

  it('protects the route with the auth guard and the roles guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, StaffHikesController) as unknown[];
    expect(guards).toEqual([AuthGuard, RolesGuard]);
  });

  it.each<Role>(['EMPLOYEE', 'WARDEN'])('lists the hikes for the %s (200)', async (staff) => {
    role = staff;
    listHikes.execute.mockResolvedValue(hikes);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual(hikes);
  });

  it('refuses a hiker (403) without reading the hikes', async () => {
    role = 'HIKER';
    const res = await get();
    expect(res.status).toBe(403);
    expect(listHikes.execute).not.toHaveBeenCalled();
  });
});
