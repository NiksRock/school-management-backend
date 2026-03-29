import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import type { AuthenticatedRequest } from '../auth/guards/jwt.guard';
import { AppLogger } from './app-logger.service';

type RequestWithContext = AuthenticatedRequest &
  Request & {
    requestId?: string;
  };

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly appLogger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();
    const path = request.originalUrl || request.url;

    return next.handle().pipe(
      finalize(() => {
        if (path === '/metrics') {
          return;
        }

        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        const statusCode = response.statusCode;
        const metadata = {
          event: 'http_request',
          authenticated: Boolean(request.user?.id),
          contentLength: response.getHeader('content-length'),
          method: request.method,
          path,
          route: this.resolveRoute(request),
          statusCode,
          responseTimeMs: Number(durationMs.toFixed(2)),
          ip: request.ip,
          userAgent: request.get('user-agent'),
        };

        if (statusCode >= 400) {
          this.appLogger.warnWithMetadata(
            'HTTP request completed with client or server error',
            metadata,
            RequestLoggingInterceptor.name,
          );
          return;
        }

        this.appLogger.infoWithMetadata(
          'HTTP request completed',
          metadata,
          RequestLoggingInterceptor.name,
        );
      }),
    );
  }

  private resolveRoute(request: RequestWithContext): string {
    const route = request.route as { path?: unknown } | undefined;
    const routePath = typeof route?.path === 'string' ? route.path : undefined;

    if (!routePath) {
      return 'unmatched';
    }

    if (request.baseUrl) {
      return `${request.baseUrl}${routePath}`;
    }

    return routePath;
  }
}
