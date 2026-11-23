import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type {
  BookingResult,
  CancelledBooking,
  ChangeBookingInput,
  CreateBookingInput,
  MyBooking,
} from '@mountain-hut/shared';
import { changeBookingSchema, createBookingSchema } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { Roles } from '../../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { ApiZodBody } from '../../presentation/api-zod-body.decorator.js';
import { ZodValidationPipe } from '../../presentation/zod-validation.pipe.js';
import { CurrentUser } from '../../presentation/current-user.decorator.js';
import type { AuthenticatedUser } from '../../presentation/current-user.decorator.js';
import { BookingsService } from '../application/bookings.service.js';
import { ListMyBookings } from '../application/list-my-bookings.js';

@ApiTags('bookings')
@ApiCookieAuth()
@Controller('bookings')
@UseGuards(AuthGuard, RolesGuard)
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly myBookings: ListMyBookings,
  ) {}

  // The upcoming bookings of the logged hiker.
  @Get('me')
  @Roles('HIKER')
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<MyBooking[]> {
    return this.myBookings.execute(user.id, new Date());
  }

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

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('HIKER')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CancelledBooking> {
    return this.bookings.cancel(user.id, id);
  }

  @Patch(':id')
  @Roles('HIKER')
  @ApiZodBody(changeBookingSchema)
  change(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(changeBookingSchema)) body: ChangeBookingInput,
  ): Promise<BookingResult> {
    return this.bookings.change(user.id, id, body);
  }
}
