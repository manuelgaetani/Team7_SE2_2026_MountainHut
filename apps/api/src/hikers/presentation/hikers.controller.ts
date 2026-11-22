import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { HikerProfile, HikerSearchQuery } from '@mountain-hut/shared';
import { hikerSearchQuerySchema } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { Roles } from '../../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { ZodValidationPipe } from '../../presentation/zod-validation.pipe.js';
import { SearchHikers } from '../application/search-hikers.js';

// Staff only: the warden can do everything an employee can (from context.md).
@ApiTags('hikers')
@ApiCookieAuth()
@Controller('hikers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('EMPLOYEE', 'WARDEN')
export class HikersController {
  constructor(private readonly searchHikers: SearchHikers) {}

  // GET /api/hikers?search=rossi
  @Get()
  @ApiQuery({ name: 'search', example: 'rossi' })
  search(
    @Query(new ZodValidationPipe(hikerSearchQuerySchema)) query: HikerSearchQuery,
  ): Promise<HikerProfile[]> {
    return this.searchHikers.execute(query.search);
  }
}
