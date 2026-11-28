import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { DefineMenuInput, PreviousMenu, SlotMenu } from '@mountain-hut/shared';
import { defineMenuSchema } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { Roles } from '../../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { ApiZodBody } from '../../presentation/api-zod-body.decorator.js';
import { ZodValidationPipe } from '../../presentation/zod-validation.pipe.js';
import { MenusService } from '../application/menus.service.js';

// MH-10: the staff write the menus of the slots; every logged-in user can read them.
// Staff only unless a method says otherwise: the warden can do everything an employee can.
@ApiTags('menus')
@ApiCookieAuth()
@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles('EMPLOYEE', 'WARDEN')
export class MenusController {
  constructor(private readonly menus: MenusService) {}

  // Creates or replaces the menu of a slot, before the slot starts.
  @Put('slots/:id/menu')
  @HttpCode(200)
  @ApiZodBody(defineMenuSchema)
  define(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(defineMenuSchema)) body: DefineMenuInput,
  ): Promise<SlotMenu> {
    return this.menus.define(id, body);
  }

  // Hikers too: "so that hikers know when the hut is providing the service".
  @Get('slots/:id/menu')
  @Roles('HIKER', 'EMPLOYEE', 'WARDEN')
  findBySlot(@Param('id', ParseIntPipe) id: number): Promise<SlotMenu> {
    return this.menus.findBySlot(id);
  }

  // Deletes the menu of a slot that has not started yet.
  @Delete('slots/:id/menu')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.menus.remove(id);
  }

  // The menus already written, to reuse (and change) one of them for another slot.
  @Get('menus')
  listPrevious(): Promise<PreviousMenu[]> {
    return this.menus.listPrevious();
  }
}
