import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const incomingRequestId = req.headers['x-request-id'];
    const requestId =
      typeof incomingRequestId === 'string' && incomingRequestId.trim()
        ? incomingRequestId
        : Array.isArray(incomingRequestId) && incomingRequestId[0]?.trim()
          ? incomingRequestId[0]
          : randomUUID();

    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  app.use(cookieParser());
  app.enableCors({
    origin: configService.get<string[]>('app.frontendOrigins') ?? true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();
  //configService.get<string>('app.globalPrefix') && app.setGlobalPrefix(configService.get<string>('app.globalPrefix')!);
  const accessCookieName =
    configService.get<string>('auth.accessCookieName') ?? 'sms_access_token';
  const refreshCookieName =
    configService.get<string>('auth.refreshCookieName') ?? 'sms_refresh_token';

  const swaggerConfig = new DocumentBuilder()
    .setTitle('School Management System API')
    .setDescription(
      'API documentation for the school management backend. Authentication uses HttpOnly cookie-based JWT access and refresh tokens.',
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
}

void bootstrap();
