import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { DomainExceptionFilter } from '../../presentation/domain-exception.filter.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { MenusService } from '../application/menus.service.js';
import { MenusController } from './menus.controller.js';

// Spec MH-10: Define menus, the HTTP contract.
// - PUT /slots/:id/menu   staff (EMPLOYEE, WARDEN): creates or replaces the menu of a slot.
//                         Body defineMenuSchema { text }. 200 with the menu. 404 if the slot
//                         does not exist.
// - GET /slots/:id/menu   any logged-in role (HIKER too: "so that hikers know when the hut is
//                         providing the service"). 200 with the menu, 404 if there is none.
// - GET /menus            staff: the menus already written, to reuse (and change) one of them.
// The service owns the order of the list and the 404s; the controller passes them through.
// TODO(MH-10-whitebox): add white-box unit tests for MenusService once it is implemented
describe('MenusController (Black-box)', () => {
  let app: INestApplication<App>;
  let role: Role;
  const menus = {
    define: vi.fn(),
    findBySlot: vi.fn(),
    listPrevious: vi.fn(),
  };
  const menu = { slotId: 7, text: '- Soup\n  - *Barley*', updatedAt: '2026-11-24T18:00:00.000Z' };

  beforeEach(async () => {
    vi.resetAllMocks();
    role = 'EMPLOYEE';
    const module = await Test.createTestingModule({
      controllers: [MenusController],
      providers: [{ provide: MenusService, useValue: menus }],
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

  describe('PUT /slots/:id/menu', () => {
    it.each(['EMPLOYEE', 'WARDEN'] as const)(
      'lets a %s define the menu of a slot',
      async (staff) => {
        role = staff;
        menus.define.mockResolvedValue(menu);
        const res = await request(app.getHttpServer())
          .put('/slots/7/menu')
          .send({ text: menu.text })
          .expect(200);
        expect(res.body).toEqual(menu);
        expect(menus.define).toHaveBeenCalledWith(7, { text: menu.text });
      },
    );

    it('replaces a menu with a changed copy of a previous one', async () => {
      const reused = '**Lunch**\n- Soup\n- Stew with polenta';
      menus.define.mockResolvedValue({ ...menu, text: reused });
      const res = await request(app.getHttpServer())
        .put('/slots/7/menu')
        .send({ text: reused })
        .expect(200);
      expect(res.body.text).toBe(reused);
      expect(menus.define).toHaveBeenCalledWith(7, { text: reused });
    });

    it('passes only the text to the service', async () => {
      menus.define.mockResolvedValue(menu);
      await request(app.getHttpServer())
        .put('/slots/7/menu')
        .send({ text: 'Soup', slotId: 99, updatedAt: 'x' })
        .expect(200);
      expect(menus.define).toHaveBeenCalledWith(7, { text: 'Soup' });
    });

    it('answers 403 to a hiker without calling the service', async () => {
      role = 'HIKER';
      await request(app.getHttpServer()).put('/slots/7/menu').send({ text: 'Soup' }).expect(403);
      expect(menus.define).not.toHaveBeenCalled();
    });

    it.each([
      ['no body', undefined],
      ['no text', {}],
      ['an empty text', { text: '' }],
      ['a blank text', { text: ' \n\t ' }],
      ['a text that is not a string', { text: 3 }],
      ['a text longer than 5000 characters', { text: 'a'.repeat(5001) }],
    ])('answers 400 without calling the service for %s', async (_label, body) => {
      await request(app.getHttpServer()).put('/slots/7/menu').send(body).expect(400);
      expect(menus.define).not.toHaveBeenCalled();
    });

    it('accepts a text of exactly 5000 characters', async () => {
      menus.define.mockResolvedValue(menu);
      await request(app.getHttpServer())
        .put('/slots/7/menu')
        .send({ text: 'a'.repeat(5000) })
        .expect(200);
      expect(menus.define).toHaveBeenCalledTimes(1);
    });

    it('answers 400 without calling the service when the slot id is not a number', async () => {
      await request(app.getHttpServer()).put('/slots/abc/menu').send({ text: 'Soup' }).expect(400);
      expect(menus.define).not.toHaveBeenCalled();
    });

    it('propagates the 404 of a slot that does not exist', async () => {
      menus.define.mockRejectedValue(new DomainError('NOT_FOUND', 'Slot not found'));
      const res = await request(app.getHttpServer())
        .put('/slots/99/menu')
        .send({ text: 'Soup' })
        .expect(404);
      expect(res.body.message).toBe('Slot not found');
    });
  });

  describe('GET /slots/:id/menu', () => {
    it.each(['HIKER', 'EMPLOYEE', 'WARDEN'] as const)(
      'lets a %s read the menu of a slot',
      async (anyRole) => {
        role = anyRole;
        menus.findBySlot.mockResolvedValue(menu);
        const res = await request(app.getHttpServer()).get('/slots/7/menu').expect(200);
        expect(res.body).toEqual(menu);
        expect(menus.findBySlot).toHaveBeenCalledWith(7);
      },
    );

    it('returns the formatting markers unchanged, for the page to render', async () => {
      role = 'HIKER';
      menus.findBySlot.mockResolvedValue(menu);
      const res = await request(app.getHttpServer()).get('/slots/7/menu').expect(200);
      expect(res.body.text).toBe('- Soup\n  - *Barley*');
    });

    it('propagates the 404 of a slot without a menu', async () => {
      role = 'HIKER';
      menus.findBySlot.mockRejectedValue(new DomainError('NOT_FOUND', 'This slot has no menu'));
      const res = await request(app.getHttpServer()).get('/slots/7/menu').expect(404);
      expect(res.body.message).toBe('This slot has no menu');
    });

    it('answers 400 without calling the service when the slot id is not a number', async () => {
      await request(app.getHttpServer()).get('/slots/abc/menu').expect(400);
      expect(menus.findBySlot).not.toHaveBeenCalled();
    });
  });

  describe('GET /menus', () => {
    it.each(['EMPLOYEE', 'WARDEN'] as const)(
      'lets a %s list the previous menus to reuse one',
      async (staff) => {
        role = staff;
        const previous = [
          { ...menu, slotId: 9, date: '2026-11-20', startTime: '12:00', endTime: '14:00' },
          { ...menu, slotId: 4, date: '2026-11-13', startTime: '19:00', endTime: '21:00' },
        ];
        menus.listPrevious.mockResolvedValue(previous);
        const res = await request(app.getHttpServer()).get('/menus').expect(200);
        expect(res.body).toEqual(previous);
        expect(menus.listPrevious).toHaveBeenCalledTimes(1);
      },
    );

    it('answers 200 with an empty list when no menu was written yet', async () => {
      menus.listPrevious.mockResolvedValue([]);
      const res = await request(app.getHttpServer()).get('/menus').expect(200);
      expect(res.body).toEqual([]);
    });

    it('answers 403 to a hiker without calling the service', async () => {
      role = 'HIKER';
      await request(app.getHttpServer()).get('/menus').expect(403);
      expect(menus.listPrevious).not.toHaveBeenCalled();
    });
  });
});