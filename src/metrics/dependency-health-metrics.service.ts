import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { MetricsService } from './metrics.service';

@Injectable()
export class DependencyHealthMetricsService
  implements OnModuleInit, OnModuleDestroy
{
  private databaseTimer?: NodeJS.Timeout;
  private redisTimer?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit(): void {
    void this.measureDatabaseHealth();
    void this.measureRedisHealth();

    const dbPingIntervalMs =
      this.configService.get<number>('metrics.dbPingIntervalMs') ?? 30000;
    const redisPingIntervalMs =
      this.configService.get<number>('metrics.redisPingIntervalMs') ?? 30000;

    this.databaseTimer = setInterval(() => {
      void this.measureDatabaseHealth();
    }, dbPingIntervalMs);
    this.databaseTimer.unref?.();

    this.redisTimer = setInterval(() => {
      void this.measureRedisHealth();
    }, redisPingIntervalMs);
    this.redisTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.databaseTimer) {
      clearInterval(this.databaseTimer);
    }

    if (this.redisTimer) {
      clearInterval(this.redisTimer);
    }
  }

  private async measureDatabaseHealth(): Promise<void> {
    const startedAt = process.hrtime.bigint();

    try {
      await this.dataSource.query('SELECT 1');
      this.metricsService.setDatabaseUp(true);
    } catch {
      this.metricsService.setDatabaseUp(false);
      return;
    } finally {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      this.metricsService.observeDatabasePing(durationMs);
    }
  }

  private async measureRedisHealth(): Promise<void> {
    const startedAt = process.hrtime.bigint();

    try {
      await this.redisService.ping();
      this.metricsService.setRedisUp(true);
    } catch {
      this.metricsService.setRedisUp(false);
      return;
    } finally {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      this.metricsService.observeRedisPing(durationMs);
    }
  }
}
