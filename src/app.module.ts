import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
// FIXED: APP_GUARD added to imports
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { LogLevel } from 'typeorm';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { CachePolicyInterceptor } from './common/interceptors/cache-policy.interceptor';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { RedisThrottlerStorageService } from './common/throttling/redis-throttler.storage';
import appConfig from './config/app.config';
import { LoggingModule } from './logging/logging.module';
import { RequestLoggingInterceptor } from './logging/request-logging.interceptor';
import { TypeOrmLogger } from './logging/typeorm.logger';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { MetricsModule } from './metrics/metrics.module';
import { RedisModule } from './redis/redis.module';

// AppService is provided by root — import it here
import { AppService } from './app.service';

@Module({
  controllers: [AppController],
  providers: [
    AppService,

    // ── Guards (run before interceptors) ──────────────────────────────────────
    // FIXED: ThrottlerGuard globally registered — rate limiting now enforced
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },

    // ── Interceptors (execution order: registration order on request,
    //                  reverse on response) ───────────────────────────────────
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor, // 1st in, last out → measures total wall time
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor, // logs request start/end with status
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CachePolicyInterceptor, // sets Cache-Control headers
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor, // wraps success payload in envelope
    },

    // ── Filters ───────────────────────────────────────────────────────────────
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter, // normalises all errors into error envelope
    },
  ],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      expandVariables: true,
    }),
    MetricsModule,
    LoggingModule,
    TypeOrmModule.forRootAsync({
      imports: [LoggingModule, MetricsModule],
      inject: [ConfigService, TypeOrmLogger],
      useFactory: (
        configService: ConfigService,
        typeOrmLogger: TypeOrmLogger,
      ) => {
        const databaseUrl = configService.get<string>('database.url');
        const enableChannelBinding =
          configService.get<boolean>('database.enableChannelBinding') ?? false;
        const enableDatabaseQueryLogging =
          configService.get<boolean>('database.logging') ?? false;
        const maxQueryExecutionTime =
          configService.get<number>('metrics.slowDbQueryThresholdMs') ?? 500;
        const typeOrmLogging: LogLevel[] = enableDatabaseQueryLogging
          ? ['query', 'error', 'warn', 'schema']
          : ['error', 'warn'];

        const baseOptions = {
          type: 'postgres' as const,
          autoLoadEntities: true,
          synchronize:
            configService.get<boolean>('database.synchronize') ?? false,
          logging: typeOrmLogging,
          logger: typeOrmLogger,
          maxQueryExecutionTime,
          ssl:
            configService.get<boolean | { rejectUnauthorized: boolean }>(
              'database.ssl',
            ) ?? false,
          extra: enableChannelBinding
            ? { enableChannelBinding: true }
            : undefined,
        };

        if (databaseUrl) {
          return { ...baseOptions, url: databaseUrl };
        }

        return {
          ...baseOptions,
          host: configService.get<string>('database.host') ?? 'localhost',
          port: configService.get<number>('database.port') ?? 5432,
          username:
            configService.get<string>('database.username') ?? 'postgres',
          password:
            configService.get<string>('database.password') ?? 'postgres',
          database:
            configService.get<string>('database.name') ?? 'school_management',
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, RedisThrottlerStorageService],
      useFactory: (
        configService: ConfigService,
        throttlerStorage: RedisThrottlerStorageService,
      ) => ({
        errorMessage: 'Too many requests. Please try again later.',
        storage: throttlerStorage,
        throttlers: [
          {
            name: 'default',
            limit:
              configService.get<number>('api.rateLimit.defaultLimit') ?? 120,
            ttl:
              configService.get<number>('api.rateLimit.defaultTtlMs') ?? 60000,
            blockDuration:
              configService.get<number>(
                'api.rateLimit.defaultBlockDurationMs',
              ) ?? 60000,
            setHeaders: true,
          },
          {
            name: 'auth',
            limit: configService.get<number>('api.rateLimit.authLimit') ?? 10,
            ttl: configService.get<number>('api.rateLimit.authTtlMs') ?? 60000,
            blockDuration:
              configService.get<number>('api.rateLimit.authBlockDurationMs') ??
              300000,
            setHeaders: true,
          },
        ],
      }),
    }),
    RedisModule,
    AuthModule,
  ],
})
export class AppModule {}
