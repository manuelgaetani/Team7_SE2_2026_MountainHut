import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { BookingResult, CreateBookingInput } from '@mountain-hut/shared';
import { createBookingSchema } from '@mountain-hut/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { ApiZodBody } from '../common/api-zod-body.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BookingsService } from './bookings.service.js';

@ApiTags('bookings')
@ApiCookieAuth()
@Controller('bookings')
@UseGuards(AuthGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @HttpCode(201)
  @ApiZodBody(createBookingSchema)
  create(
    @Req() req: Request & { user: { id: number } },
    @Body(new ZodValidationPipe(createBookingSchema)) body: CreateBookingInput,
  ): Promise<BookingResult> {
    return this.bookings.create(req.user.id, body);
  }
}