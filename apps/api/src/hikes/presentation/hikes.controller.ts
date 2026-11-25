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
  ) {}

  // The hut's list of hikes, to fill the registration from one of them.
  @Get('predefined')
  listPredefined(): Promise<PredefinedHike[]> {
    return this.predefinedHikes.execute();
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
