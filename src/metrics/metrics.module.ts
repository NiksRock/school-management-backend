import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { MetricsController } from './metrics.controller';
import { DependencyHealthMetricsService } from './dependency-health-metrics.service';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  imports: [ConfigModule, RedisModule],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MetricsInterceptor,
    DependencyHealthMetricsService,
  ],
  exports: [MetricsService, MetricsInterceptor],
})
export class MetricsModule {}
