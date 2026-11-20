import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { BookingResult, ChangeBookingInput, CreateBookingInput } from '@mountain-hut/shared';
import { changeBookingSchema, createBookingSchema } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { Roles } from '../../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { ApiZodBody } from '../../presentation/api-zod-body.decorator.js';
import { ZodValidationPipe } from '../../presentation/zod-validation.pipe.js';
import { CurrentUser } from '../../presentation/current-user.decorator.js';
import type { AuthenticatedUser } from '../../presentation/current-user.decorator.js';
import { BookingsService } from '../application/bookings.service.js';

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
