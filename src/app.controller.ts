import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';
import { SkipResponseWrap } from './common/interceptors/transform-response.interceptor';
import type { HealthResponse } from './common/types/health-response.type';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @SkipThrottle({ default: true, auth: true })
  // FIXED: explicit opt-out replaces fragile { status, service } shape heuristic
  @SkipResponseWrap()
  @ApiOperation({
    summary: 'Health check endpoint',
    description:
      'Returns a lightweight service status payload for load balancers and uptime checks.',
  })
  @ApiOkResponse({
    description: 'Service is healthy.',
    schema: {
      properties: {
        service: { type: 'string' },
        status: { type: 'string', enum: ['ok', 'degraded'] },
        environment: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
        uptimeSeconds: { type: 'number' },
      },
    },
  })
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }
}
