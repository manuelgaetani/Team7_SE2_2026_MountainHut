import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { HikerProfile, HikerSearchQuery } from '@mountain-hut/shared';
import { hikerSearchQuerySchema } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { Roles } from '../../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { CurrentUser } from '../../presentation/current-user.decorator.js';
import type { AuthenticatedUser } from '../../presentation/current-user.decorator.js';
import { ZodValidationPipe } from '../../presentation/zod-validation.pipe.js';
import { GetMyProfile } from '../application/get-my-profile.js';
import { SearchHikers } from '../application/search-hikers.js';

// Staff only, except the profile of the logged-in hiker:
// the warden can do everything an employee can (from context.md).
@ApiTags('hikers')
@ApiCookieAuth()
@Controller('hikers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('EMPLOYEE', 'WARDEN')
export class HikersController {
  constructor(
    private readonly searchHikers: SearchHikers,
    private readonly myProfile: GetMyProfile,
  ) {}

  // GET /api/hikers/me: the hiker sees their own profile. The method role replaces the staff ones.
  @Get('me')
  @Roles('HIKER')
  me(@CurrentUser() user: AuthenticatedUser): Promise<HikerProfile> {
    return this.myProfile.execute(user.id);
  }

  // GET /api/hikers?search=rossi
  @Get()
  @ApiQuery({ name: 'search', example: 'rossi' })
  search(
    @Query(new ZodValidationPipe(hikerSearchQuerySchema)) query: HikerSearchQuery,
  ): Promise<HikerProfile[]> {
    return this.searchHikers.execute(query.search);
  }
}
