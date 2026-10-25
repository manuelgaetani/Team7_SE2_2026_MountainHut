import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from '@mountain-hut/shared';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok' };
  }
}
