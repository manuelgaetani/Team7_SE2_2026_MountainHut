import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';
import { AuthGuard } from '../auth/auth.guard.js';
import type { BookingsService } from './bookings.service.js';
import { SlotsController } from './slots.controller.js';

describe('SlotsController', () => {
  it('protects every route with the auth guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SlotsController)).toContain(AuthGuard);
  });

  it('returns the slots of the service', async () => {
    const slots = [{ id: 1 }];
    const service = { listSlots: vi.fn().mockResolvedValue(slots) };
    const controller = new SlotsController(service as unknown as BookingsService);
    await expect(controller.list()).resolves.toBe(slots);
  });
});
