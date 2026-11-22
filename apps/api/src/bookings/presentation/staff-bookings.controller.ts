import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { CreateStaffBookingInput, StaffBookingResult } from '@mountain-hut/shared';
import { createStaffBookingSchema } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { Roles } from '../../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { ApiZodBody } from '../../presentation/api-zod-body.decorator.js';
import { ZodValidationPipe } from '../../presentation/zod-validation.pipe.js';
import { CreateStaffBooking } from '../application/create-staff-booking.js';

// Staff only, the warden can do everything an employee can (from context.md).
@ApiTags('bookings')
@ApiCookieAuth()
@Controller('staff/bookings')
@UseGuards(AuthGuard, RolesGuard)
@Roles('EMPLOYEE', 'WARDEN')
export class StaffBookingsController {
  constructor(private readonly createStaffBooking: CreateStaffBooking) {}

  // POST /api/staff/bookings
  @Post()
  @HttpCode(201)
  @ApiZodBody(createStaffBookingSchema)
  create(
    @Body(new ZodValidationPipe(createStaffBookingSchema)) body: CreateStaffBookingInput,
  ): Promise<StaffBookingResult> {
    return this.createStaffBooking.execute(body);
  }
}
