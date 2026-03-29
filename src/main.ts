import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AppLogger } from './logging/app-logger.service';
import { RequestContextService } from './logging/request-context.service';
import { RedisService } from './redis/redis.service';

// ── CRIT-01: Flatten class-validator errors into { field, message }[] ────────
// This ensures parseValidationString() in the filter is never needed for the
// primary path. Nested DTOs produce "parent.child" field names correctly.
function flattenValidationErrors(
  errors: ValidationError[],
  parentField = '',
): { field: string; message: string }[] {
  const result: { field: string; message: string }[] = [];
  for (const error of errors) {
    const field = parentField
      ? `${parentField}.${error.property}`
      : error.property;
    if (error.constraints) {
      const message = Object.values(error.constraints)[0] ?? 'Invalid value';
      result.push({ field, message });
    }
    if (error.children?.length) {
      result.push(...flattenValidationErrors(error.children, field));
    }
  }
  return result;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const appLogger = app.get(AppLogger);
  const configService = app.get(ConfigService);
  const requestContextService = app.get(RequestContextService);

  app.useLogger(appLogger);
  app.flushLogs();

  // ── Request ID middleware ────────────────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incomingRequestId = req.headers['x-request-id'];
    const requestId =
      typeof incomingRequestId === 'string' && incomingRequestId.trim()
        ? incomingRequestId
        : Array.isArray(incomingRequestId) && incomingRequestId[0]?.trim()
          ? incomingRequestId[0]
          : randomUUID();

    requestContextService.run({ requestId }, () => {
      (req as Request & { requestId?: string }).requestId = requestId;
      res.setHeader('X-Request-Id', requestId);
      next();
    });
  });

  app.use(cookieParser());

  app.enableCors({
    origin: configService.get<string[]>('app.frontendOrigins') ?? true,
    credentials: true,
  });

  // ── CRIT-01: ValidationPipe with custom exceptionFactory ─────────────────────
  // exceptionFactory converts ValidationError[] → { field, message }[] so the
  // filter receives already-structured items — no string parsing needed.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const details = flattenValidationErrors(errors);
        return new BadRequestException({
          message: details,
          error: 'Validation Error',
        });
      },
    }),
  );

  app.enableShutdownHooks();

  // ── Swagger ──────────────────────────────────────────────────────────────────
  const accessCookieName =
    configService.get<string>('auth.accessCookieName') ?? 'sms_access_token';
  const refreshCookieName =
    configService.get<string>('auth.refreshCookieName') ?? 'sms_refresh_token';

  const swaggerConfig = new DocumentBuilder()
    .setTitle('School Management System API')
    .setDescription(
      'API documentation for the school management backend. ' +
        'Authentication uses HttpOnly cookie-based JWT access and refresh tokens. ' +
        'All success responses are wrapped in { success, message, data, error: null, meta }.',
    )
    .setVersion('1.0.0')
    .addCookieAuth(
      accessCookieName,
      { type: 'apiKey', in: 'cookie' },
      'access-cookie',
    )
    .addCookieAuth(
      refreshCookieName,
      { type: 'apiKey', in: 'cookie' },
      'refresh-cookie',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument, {
    customSiteTitle: 'School Management System Docs',
    swaggerOptions: {
      persistAuthorization: true,
      withCredentials: true,
    },
  });

  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port);

  // ── CRIT-02: Redis startup connectivity check ─────────────────────────────────
  // Performs a PING after the server is listening so the log is visible in Render.
  // Logs a warning (not a crash) so the app stays up even if Redis is temporarily
  // unavailable — auth and rate limiting will degrade gracefully.
  const redisService = app.get(RedisService);
  try {
    await redisService.ping();
    appLogger.infoWithMetadata(
      'Redis connectivity confirmed on startup',
      { backend: 'startup' },
      'Bootstrap',
    );
  } catch (error) {
    appLogger.warnWithMetadata(
      'Redis ping failed on startup — auth sessions and rate limiting will be degraded. ' +
        'Check UPSTASH_REDIS_REST_TOKEN or REDIS_* environment variables.',
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Bootstrap',
    );
  }

  appLogger.infoWithMetadata(
    `Application started on port ${port}`,
    { port, nodeEnv: configService.get<string>('app.nodeEnv') },
    'Bootstrap',
  );
}

void bootstrap();
