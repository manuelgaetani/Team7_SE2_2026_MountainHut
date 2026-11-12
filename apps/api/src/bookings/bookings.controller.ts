import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type {
  BookingResult,
  ChangeBookingInput,
  ChangedBookingResult,
  CreateBookingInput,
} from '@mountain-hut/shared';
import { changeBookingSchema, createBookingSchema } from '@mountain-hut/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ApiZodBody } from '../common/api-zod-body.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BookingsService } from './bookings.service.js';

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
    @Req() req: Request & { user: { id: number } },
    @Body(new ZodValidationPipe(createBookingSchema)) body: CreateBookingInput,
  ): Promise<BookingResult> {
    return this.bookings.create(req.user.id, body);
  }

  @Patch(':id')
  @Roles('HIKER')
  @ApiZodBody(changeBookingSchema)
  change(
    @Req() req: Request & { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(changeBookingSchema)) body: ChangeBookingInput,
  ): Promise<ChangedBookingResult> {
    return this.bookings.change(req.user.id, id, body);
  }
}
