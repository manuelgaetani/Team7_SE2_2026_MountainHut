import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainExceptionFilter } from '../../presentation/domain-exception.filter.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { ConfirmPasswordReset } from '../application/confirm-password-reset.js';
import { RequestPasswordReset } from '../application/request-password-reset.js';
import { PasswordResetController } from './password-reset.controller.js';

// MH-07 black box: password recovery by email. Both endpoints are public.

const SENT = { message: 'If the email is registered, a reset link has been sent' };

describe('PasswordResetController', () => {
  let app: INestApplication<App>;
  const requestReset = { execute: vi.fn() };
  const confirmReset = { execute: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    // No guard is overridden: the endpoints must work without a session.
    const module = await Test.createTestingModule({
      controllers: [PasswordResetController],
      providers: [
        { provide: RequestPasswordReset, useValue: requestReset },
        { provide: ConfirmPasswordReset, useValue: confirmReset },
      ],
    }).compile();
    app = module.createNestApplication();
    // As in AppModule: domain errors become HTTP answers.
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/password-reset/request', () => {
    it('answers 200 with a neutral message, without a session', async () => {
      requestReset.execute.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'anna@example.it' })
        .expect(200);
      expect(res.body).toEqual(SENT);
    });

    it('passes the normalized email to the use case', async () => {
      requestReset.execute.mockResolvedValue(undefined);
      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: ' Anna@Example.IT ' })
        .expect(200);
      expect(requestReset.execute).toHaveBeenCalledWith({ email: 'anna@example.it' });
    });

    it('gives the same answer for a registered and an unknown email', async () => {
      requestReset.execute.mockResolvedValue(undefined);
      const known = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'anna@example.it' });
      const unknown = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'nobody@example.it' });
      expect(unknown.status).toBe(known.status);
      expect(unknown.body).toEqual(known.body);
    });

    it.each([{}, { email: '' }, { email: 'anna' }])(
      'answers 400 without calling the use case for %j',
      async (body) => {
        await request(app.getHttpServer())
          .post('/auth/password-reset/request')
          .send(body)
          .expect(400);
        expect(requestReset.execute).not.toHaveBeenCalled();
      },
    );
  });

  describe('POST /auth/password-reset/confirm', () => {
    const body = { token: 'code-from-the-link', password: 'MyOwnPass1' };

    it('answers 200 when the password is changed, without a session', async () => {
      confirmReset.execute.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send(body)
        .expect(200);
      expect(res.body).toEqual({ message: 'Password changed' });
      expect(confirmReset.execute).toHaveBeenCalledWith(body);
    });

    it('sets no session cookie: the user logs in with the new password', async () => {
      confirmReset.execute.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send(body)
        .expect(200);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('answers 422 when the link is invalid, expired or already used', async () => {
      confirmReset.execute.mockRejectedValue(
        new DomainError('UNPROCESSABLE', 'The link is invalid or has expired'),
      );
      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send(body)
        .expect(422);
      expect(res.body.message).toBe('The link is invalid or has expired');
    });

    it.each([
      ['a password too short', { ...body, password: 'abc1' }],
      ['a password without digits', { ...body, password: 'abcdefgh' }],
      ['an empty code', { ...body, token: '' }],
      ['a code longer than 200 characters', { ...body, token: 'a'.repeat(201) }],
      ['no code', { password: body.password }],
      ['no password', { token: body.token }],
    ])('answers 400 without calling the use case for %s', async (_case, invalid) => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send(invalid)
        .expect(400);
      expect(confirmReset.execute).not.toHaveBeenCalled();
    });
  });
});
