import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthResponse } from './common/types/health-response.type';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  // FIXED: explicit return type — satisfies strict mode, enables @SkipResponseWrap
  getHealth(): HealthResponse {
    return {
      service: 'school-management-system',
      status: 'ok',
      environment:
        this.configService.get<string>('app.nodeEnv') ?? 'development',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
