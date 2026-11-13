import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type {
  CreateSlotInput,
  DefineSlotTablesInput,
  ListSlotsQuery,
  RepeatWeeklyScheduleInput,
  RepeatWeeklyScheduleResult,
  SlotDetails,
} from '@mountain-hut/shared';
import {
  createSlotSchema,
  defineSlotTablesSchema,
  listSlotsQuerySchema,
  repeatWeeklyScheduleSchema,
} from '@mountain-hut/shared';
import { AuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ApiZodBody } from '../common/api-zod-body.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SlotsService } from './slots.service.js';

// Staff only: the warden can do everything an employee can (context.md).
@ApiTags('slots')
@ApiCookieAuth()
@Controller('slots')
@UseGuards(AuthGuard, RolesGuard)
@Roles('EMPLOYEE', 'WARDEN')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Post()
  @HttpCode(201)
  @ApiZodBody(createSlotSchema)
  create(
    @Body(new ZodValidationPipe(createSlotSchema)) body: CreateSlotInput,
  ): Promise<SlotDetails> {
    return this.slots.create(body);
  }

  // MH-09: copies the slots of a week into the next weeks, replacing the slots already there.
  @Post('repeat-weekly')
  @HttpCode(201)
  @ApiZodBody(repeatWeeklyScheduleSchema)
  repeatWeekly(
    @Body(new ZodValidationPipe(repeatWeeklyScheduleSchema)) body: RepeatWeeklyScheduleInput,
  ): Promise<RepeatWeeklyScheduleResult> {
    return this.slots.repeatWeekly(body);
  }

  // Not GET /slots: that route lists the bookable slots for hikers (MH-01).
  @Get('schedule')
  @ApiQuery({ name: 'date', example: '2026-11-02' })
  schedule(
    @Query(new ZodValidationPipe(listSlotsQuerySchema)) query: ListSlotsQuery,
  ): Promise<SlotDetails[]> {
    return this.slots.listByDate(query.date);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<SlotDetails> {
    return this.slots.findOne(id);
  }

  @Put(':id/tables')
  @ApiZodBody(defineSlotTablesSchema)
  defineTables(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(defineSlotTablesSchema)) body: DefineSlotTablesInput,
  ): Promise<SlotDetails> {
    return this.slots.defineTables(id, body);
  }
}
