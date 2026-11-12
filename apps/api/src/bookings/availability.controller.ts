import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AvailabilityResult, CheckAvailabilityQuery } from '@mountain-hut/shared';
import { checkAvailabilityQuerySchema } from '@mountain-hut/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AvailabilityService } from './availability.service.js';

@ApiTags('bookings')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @ApiQuery({ name: 'date', example: '2035-06-15' })
  @ApiQuery({ name: 'time', example: '12:00', description: 'Start time of the slot' })
  @ApiQuery({ name: 'partySize', example: '6' })
  check(
    @Query(new ZodValidationPipe(checkAvailabilityQuerySchema)) query: CheckAvailabilityQuery,
  ): Promise<AvailabilityResult> {
    return this.availability.check(query);
  }
}
