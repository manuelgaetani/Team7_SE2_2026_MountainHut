import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HikerProfile, Role } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { GetMyProfile } from '../application/get-my-profile.js';
import { SearchHikers } from '../application/search-hikers.js';
import { HikersController } from './hikers.controller.js';

// MH-07 black box: GET /hikers?search=... is for the staff only.
// GET /hikers/me is the own profile of the logged-in hiker.

const anna: HikerProfile = {
  id: 1,
  fullName: 'Anna Rossi',
  email: 'anna@example.it',
  phone: '3331234567',
  notes: null,
  emergencyContact: null,
  temporary: false,
};

describe('HikersController', () => {
  let app: INestApplication<App>;
  let role: Role;
  const searchHikers = { execute: vi.fn() };
  const getMyProfile = { execute: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    role = 'EMPLOYEE';
    const module = await Test.createTestingModule({
      controllers: [HikersController],
      providers: [
        { provide: SearchHikers, useValue: searchHikers },
        { provide: GetMyProfile, useValue: getMyProfile },
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('own profile', () => {
    it('returns the profile of the logged-in hiker', async () => {
      role = 'HIKER';
      getMyProfile.execute.mockResolvedValue(anna);
      const res = await request(app.getHttpServer()).get('/hikers/me').expect(200);
      expect(res.body).toEqual(anna);
      expect(getMyProfile.execute).toHaveBeenCalledWith(1);
    });

    it.each(['EMPLOYEE', 'WARDEN'] as const)(
      'answers 403 to a %s without reading a profile',
      async (staffRole) => {
        role = staffRole;
        await request(app.getHttpServer()).get('/hikers/me').expect(403);
        expect(getMyProfile.execute).not.toHaveBeenCalled();
      },
    );
  });

  describe('roles', () => {
    it.each(['EMPLOYEE', 'WARDEN'] as const)('lets a %s search the hikers', async (staffRole) => {
      role = staffRole;
      searchHikers.execute.mockResolvedValue([anna]);
      await request(app.getHttpServer()).get('/hikers').query({ search: 'rossi' }).expect(200);
      expect(searchHikers.execute).toHaveBeenCalledWith('rossi');
    });

    it('answers 403 to a hiker without searching', async () => {
      role = 'HIKER';
      await request(app.getHttpServer()).get('/hikers').query({ search: 'rossi' }).expect(403);
      expect(searchHikers.execute).not.toHaveBeenCalled();
    });
  });

  describe('search text', () => {
    it('returns the profiles found, as JSON', async () => {
      const temporary: HikerProfile = { ...anna, id: 2, email: null, temporary: true };
      searchHikers.execute.mockResolvedValue([anna, temporary]);
      const res = await request(app.getHttpServer())
        .get('/hikers')
        .query({ search: 'anna' })
        .expect(200);
      expect(res.body).toEqual([anna, temporary]);
    });

    it('returns an empty list when nobody matches', async () => {
      searchHikers.execute.mockResolvedValue([]);
      const res = await request(app.getHttpServer())
        .get('/hikers')
        .query({ search: 'zz' })
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('searches the text without the spaces around it', async () => {
      searchHikers.execute.mockResolvedValue([]);
      await request(app.getHttpServer()).get('/hikers').query({ search: '  rossi  ' }).expect(200);
      expect(searchHikers.execute).toHaveBeenCalledWith('rossi');
    });

    it('accepts a text of exactly two characters', async () => {
      searchHikers.execute.mockResolvedValue([]);
      await request(app.getHttpServer()).get('/hikers').query({ search: 'ro' }).expect(200);
      expect(searchHikers.execute).toHaveBeenCalledWith('ro');
    });

    it.each([
      ['one character', { search: 'r' }],
      ['only spaces', { search: '    ' }],
      ['an empty text', { search: '' }],
      ['no search parameter', {}],
    ])('answers 400 without searching for %s', async (_case, query) => {
      await request(app.getHttpServer()).get('/hikers').query(query).expect(400);
      expect(searchHikers.execute).not.toHaveBeenCalled();
    });
  });
});
