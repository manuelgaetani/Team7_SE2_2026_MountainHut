import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';

const result = {
  available: true,
  date: '2026-11-02',
  time: '12:00',
  partySize: 6,
  totalFreeSeats: 6,
  tables: [{ tableNumber: 1, seats: 6 }],
  breakdown: [6],
  breakdownText: '6 seats',
};
const validQuery = { date: '2026-11-02', time: '12:00', partySize: '6' };

describe('AvailabilityController', () => {
  let app: INestApplication<App>;
  const availability = { check: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    // No guard is overridden: the route is public, so it must work without a session.
    const module = await Test.createTestingModule({
      controllers: [AvailabilityController],
      providers: [{ provide: AvailabilityService, useValue: availability }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (query: Record<string, string>) =>
    request(app.getHttpServer()).get('/availability').query(query);

  it('is public: no auth guard on the controller or on the route', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AvailabilityController)).toBeUndefined();
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AvailabilityController.prototype.check),
    ).toBeUndefined();
  });

  it('answers 200 with the result of the service, without any login', async () => {
    availability.check.mockResolvedValue(result);
    const response = await get(validQuery).expect(200);
    expect(response.body).toEqual(result);
  });

  it('gives the service the party size as a number', async () => {
    availability.check.mockResolvedValue(result);
    await get(validQuery);
    expect(availability.check).toHaveBeenCalledWith({
      date: '2026-11-02',
      time: '12:00',
      partySize: 6,
    });
  });

  it('removes the query parameters it does not know', async () => {
    availability.check.mockResolvedValue(result);
    await get({ ...validQuery, slotId: '3' });
    expect(availability.check).toHaveBeenCalledWith({
      date: '2026-11-02',
      time: '12:00',
      partySize: 6,
    });
  });

  it.each([
    ['without date', { time: '12:00', partySize: '6' }],
    ['without time', { date: '2026-11-02', partySize: '6' }],
    ['without partySize', { date: '2026-11-02', time: '12:00' }],
    ['with a party of 0', { ...validQuery, partySize: '0' }],
    ['with a negative party', { ...validQuery, partySize: '-1' }],
    ['with a decimal party', { ...validQuery, partySize: '1.5' }],
    ['with a party that is not a number', { ...validQuery, partySize: 'six' }],
    ['with a date that does not exist', { ...validQuery, date: '2026-02-30' }],
    ['with a date in the wrong format', { ...validQuery, date: '02/11/2026' }],
    ['with an hour that does not exist', { ...validQuery, time: '24:00' }],
    ['with a time in the wrong format', { ...validQuery, time: '9:00' }],
  ])('answers 400 without calling the service %s', async (_name, query) => {
    await get(query).expect(400);
    expect(availability.check).not.toHaveBeenCalled();
  });

  it('answers 500 when the service fails unexpectedly', async () => {
    availability.check.mockRejectedValue(new Error('database down'));
    await get(validQuery).expect(500);
  });
});
