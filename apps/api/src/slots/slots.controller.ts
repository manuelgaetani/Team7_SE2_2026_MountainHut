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
  SlotDetails,
} from '@mountain-hut/shared';
import {
  createSlotSchema,
  defineSlotTablesSchema,
  listSlotsQuerySchema,
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

  @Get()
  @ApiQuery({ name: 'date', example: '2026-11-02' })
  list(
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
