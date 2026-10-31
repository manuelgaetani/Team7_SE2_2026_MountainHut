import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { SlotSummary } from '@mountain-hut/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { BookingsService } from './bookings.service.js';

@ApiTags('bookings')
@ApiCookieAuth()
@Controller('slots')
@UseGuards(AuthGuard)
export class SlotsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(): Promise<SlotSummary[]> {
    return this.bookings.listSlots();
  }
}
