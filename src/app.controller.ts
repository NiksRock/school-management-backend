import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @SkipThrottle({
    default: true,
    auth: true,
  })
  @ApiOperation({
    summary: 'Health check endpoint',
    description:
      'Returns a lightweight service status payload for load balancers and uptime checks.',
  })
  @ApiOkResponse({
    description: 'Service is healthy.',
  })
  getHealth() {
    return this.appService.getHealth();
  }
}
