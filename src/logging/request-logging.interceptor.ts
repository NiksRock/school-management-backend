import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AppLogger } from './app-logger.service';

type RequestWithContext = Request & {
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

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        const statusCode = response.statusCode;
        const metadata = {
          event: 'http_request',
          method: request.method,
          path: request.originalUrl || request.url,
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
}
