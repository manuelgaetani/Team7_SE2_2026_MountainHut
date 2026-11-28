import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { PredefinedHike, RegisterHikeData, RegisteredHike } from '@mountain-hut/shared';
import { registerHikeSchema } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { Roles } from '../../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { ApiZodBody } from '../../presentation/api-zod-body.decorator.js';
import { CurrentUser } from '../../presentation/current-user.decorator.js';
import type { AuthenticatedUser } from '../../presentation/current-user.decorator.js';
import { ZodValidationPipe } from '../../presentation/zod-validation.pipe.js';
import { ListMyHikes } from '../application/list-my-hikes.js';
import { ListPredefinedHikes } from '../application/list-predefined-hikes.js';
import { RegisterHike } from '../application/register-hike.js';

// MH-20: hikers register their planned hikes.
@ApiTags('hikes')
@ApiCookieAuth()
@Controller('hikes')
@UseGuards(AuthGuard, RolesGuard)
@Roles('HIKER')
export class HikesController {
  constructor(
    private readonly registerHike: RegisterHike,
    private readonly predefinedHikes: ListPredefinedHikes,
    private readonly myHikes: ListMyHikes,
  ) {}

  // The hut's list of hikes, to fill the registration from one of them.
  @Get('predefined')
  listPredefined(): Promise<PredefinedHike[]> {
    return this.predefinedHikes.execute();
  }

  // The hikes of the logged-in hiker, for the personal area.
  @Get('mine')
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<RegisteredHike[]> {
    return this.myHikes.execute(user.id);
  }

  @Post()
  @HttpCode(201)
  @ApiZodBody(registerHikeSchema)
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registerHikeSchema)) body: RegisterHikeData,
  ): Promise<RegisteredHike> {
    return this.registerHike.execute(user.id, body, new Date());
  }
}
