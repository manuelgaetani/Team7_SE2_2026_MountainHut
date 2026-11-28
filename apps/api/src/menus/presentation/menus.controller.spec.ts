import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MENU_LENGTH, MENU_ERRORS, type Role } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { DomainExceptionFilter } from '../../presentation/domain-exception.filter.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { MenusService } from '../application/menus.service.js';
import { MenusController } from './menus.controller.js';

// MH-10: the HTTP interface of the menus. Roles: PUT and DELETE /slots/:id/menu and GET /menus
// for the staff (EMPLOYEE, WARDEN); GET /slots/:id/menu also for hikers. The body is checked with
// defineMenuSchema before the service is called; DomainErrors become 404s and 422s.

const menu = {
  slotId: 12,
  text: '## Primi\n\n### Polenta concia · € 12\n*Polenta with cheese*\nMarks: Dairy',
  updatedAt: '2026-11-26T09:30:00.000Z',
};

describe('MenusController', () => {
  let app: INestApplication<App>;
  let role: Role;
  const menus = { define: vi.fn(), findBySlot: vi.fn(), remove: vi.fn(), listPrevious: vi.fn() };

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
      'lets a %s define the menu: 200 with the menu',
      async (staffRole) => {
        role = staffRole;
        menus.define.mockResolvedValue(menu);
        const res = await request(app.getHttpServer())
          .put('/slots/12/menu')
          .send({ text: menu.text })
          .expect(200);
        expect(res.body).toEqual(menu);
        expect(menus.define).toHaveBeenCalledWith(12, { text: menu.text });
      },
    );

    it('answers 403 to a hiker without calling the service', async () => {
      role = 'HIKER';
      await request(app.getHttpServer()).put('/slots/12/menu').send({ text: 'Soup' }).expect(403);
      expect(menus.define).not.toHaveBeenCalled();
    });

    it('passes the text to the service exactly as written', async () => {
      const text = '  - **Polenta**\r\n\t- *with cheese*  ';
      menus.define.mockResolvedValue({ ...menu, text });
      await request(app.getHttpServer()).put('/slots/12/menu').send({ text }).expect(200);
      expect(menus.define).toHaveBeenCalledWith(12, { text });
    });

    it('drops unknown fields of the body', async () => {
      menus.define.mockResolvedValue(menu);
      await request(app.getHttpServer())
        .put('/slots/12/menu')
        .send({ text: 'Soup', slotId: 99 })
        .expect(200);
      expect(menus.define).toHaveBeenCalledWith(12, { text: 'Soup' });
    });

    it('accepts a text of exactly MAX_MENU_LENGTH characters', async () => {
      menus.define.mockResolvedValue(menu);
      await request(app.getHttpServer())
        .put('/slots/12/menu')
        .send({ text: 'a'.repeat(MAX_MENU_LENGTH) })
        .expect(200);
      expect(menus.define).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['no body', undefined],
      ['no text', {}],
      ['an empty text', { text: '' }],
      ['a text of only spaces', { text: '  \n\t ' }],
      ['a text too long', { text: 'a'.repeat(MAX_MENU_LENGTH + 1) }],
      ['a text with a NUL character', { text: 'Soup\u0000' }],
      ['a number as text', { text: 42 }],
    ])('answers 400 "Invalid data" to %s without calling the service', async (_label, body) => {
      const res = await request(app.getHttpServer()).put('/slots/12/menu').send(body).expect(400);
      expect(res.body).toMatchObject({ message: 'Invalid data' });
      expect(menus.define).not.toHaveBeenCalled();
    });

    it('answers 400 when the slot id is not a number, without calling the service', async () => {
      await request(app.getHttpServer()).put('/slots/abc/menu').send({ text: 'Soup' }).expect(400);
      expect(menus.define).not.toHaveBeenCalled();
    });

    it('answers 404 "Slot not found" when the slot does not exist', async () => {
      menus.define.mockRejectedValue(new DomainError('NOT_FOUND', MENU_ERRORS.slotNotFound));
      const res = await request(app.getHttpServer())
        .put('/slots/999/menu')
        .send({ text: 'Soup' })
        .expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, message: 'Slot not found' });
    });

    it('answers 422 with the message of the service once the slot has started', async () => {
      menus.define.mockRejectedValue(new DomainError('UNPROCESSABLE', MENU_ERRORS.startedChange));
      const res = await request(app.getHttpServer())
        .put('/slots/12/menu')
        .send({ text: 'Soup' })
        .expect(422);
      expect(res.body).toMatchObject({
        statusCode: 422,
        message: 'The slot has already started: its menu cannot be changed',
      });
    });
  });

  describe('DELETE /slots/:id/menu', () => {
    it.each(['EMPLOYEE', 'WARDEN'] as const)(
      'lets a %s delete the menu: 204 with no body',
      async (staffRole) => {
        role = staffRole;
        menus.remove.mockResolvedValue(undefined);
        const res = await request(app.getHttpServer()).delete('/slots/12/menu').expect(204);
        expect(res.text).toBe('');
        expect(menus.remove).toHaveBeenCalledTimes(1);
        expect(menus.remove).toHaveBeenCalledWith(12);
      },
    );

    it('answers 403 to a hiker without calling the service', async () => {
      role = 'HIKER';
      await request(app.getHttpServer()).delete('/slots/12/menu').expect(403);
      expect(menus.remove).not.toHaveBeenCalled();
    });

    it.each(['abc', '1.5'])(
      'answers 400 when the slot id is "%s", without calling the service',
      async (id) => {
        await request(app.getHttpServer()).delete(`/slots/${id}/menu`).expect(400);
        expect(menus.remove).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['NOT_FOUND', MENU_ERRORS.noMenu, 404],
      ['NOT_FOUND', MENU_ERRORS.slotNotFound, 404],
      ['UNPROCESSABLE', MENU_ERRORS.startedDelete, 422],
    ] as const)('passes a %s "%s" through as %d', async (code, message, status) => {
      menus.remove.mockRejectedValue(new DomainError(code, message));
      const res = await request(app.getHttpServer()).delete('/slots/12/menu').expect(status);
      expect(res.body).toMatchObject({ statusCode: status, message });
    });
  });

  describe('GET /slots/:id/menu', () => {
    it.each(['HIKER', 'EMPLOYEE', 'WARDEN'] as const)(
      'lets a %s read the menu of a slot',
      async (anyRole) => {
        role = anyRole;
        menus.findBySlot.mockResolvedValue(menu);
        const res = await request(app.getHttpServer()).get('/slots/12/menu').expect(200);
        expect(res.body).toEqual(menu);
        expect(menus.findBySlot).toHaveBeenCalledWith(12);
      },
    );

    it.each([MENU_ERRORS.noMenu, MENU_ERRORS.slotNotFound])(
      'answers 404 with the message "%s" of the service',
      async (message) => {
        menus.findBySlot.mockRejectedValue(new DomainError('NOT_FOUND', message));
        const res = await request(app.getHttpServer()).get('/slots/12/menu').expect(404);
        expect(res.body).toMatchObject({ statusCode: 404, message });
      },
    );

    it('answers 400 when the slot id is not a number, without calling the service', async () => {
      await request(app.getHttpServer()).get('/slots/abc/menu').expect(400);
      expect(menus.findBySlot).not.toHaveBeenCalled();
    });
  });

  describe('GET /menus', () => {
    it.each(['EMPLOYEE', 'WARDEN'] as const)('lets a %s list the previous menus', async (r) => {
      role = r;
      const previous = [{ ...menu, date: '2026-11-28', startTime: '12:00', endTime: '14:00' }];
      menus.listPrevious.mockResolvedValue(previous);
      const res = await request(app.getHttpServer()).get('/menus').expect(200);
      expect(res.body).toEqual(previous);
    });

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
