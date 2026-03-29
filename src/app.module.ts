import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { CachePolicyInterceptor } from './common/interceptors/cache-policy.interceptor';
import { RedisThrottlerStorageService } from './common/throttling/redis-throttler.storage';
import appConfig from './config/app.config';
import { RedisModule } from './redis/redis.module';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      expandVariables: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('database.url');
        const enableChannelBinding =
          configService.get<boolean>('database.enableChannelBinding') ?? false;

        const baseOptions = {
          type: 'postgres' as const,
          autoLoadEntities: true,
          synchronize:
            configService.get<boolean>('database.synchronize') ?? true,
          logging: configService.get<boolean>('database.logging') ?? false,
          ssl:
            configService.get<boolean | { rejectUnauthorized: boolean }>(
              'database.ssl',
            ) ?? false,
          extra: enableChannelBinding
            ? {
                enableChannelBinding: true,
              }
            : undefined,
        };

        if (databaseUrl) {
          return {
            ...baseOptions,
            url: databaseUrl,
          };
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
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CachePolicyInterceptor,
    },
  ],
})
export class AppModule {}
