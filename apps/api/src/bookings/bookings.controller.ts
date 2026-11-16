import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { BookingResult, CreateBookingInput } from '@mountain-hut/shared';
import { createBookingSchema } from '@mountain-hut/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ApiZodBody } from '../common/api-zod-body.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from '../presentation/current-user.decorator.js';
import type { AuthenticatedUser } from '../presentation/current-user.decorator.js';
import { BookingsService } from './application/bookings.service.js';

@ApiTags('bookings')
@ApiCookieAuth()
@Controller('bookings')
@UseGuards(AuthGuard, RolesGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @HttpCode(201)
  @Roles('HIKER')
  @ApiZodBody(createBookingSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBookingSchema)) body: CreateBookingInput,
  ): Promise<BookingResult> {
    return this.bookings.create(user.id, body);
  }
}
