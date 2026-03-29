import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

type RequestWithRoute = Request & {
  route?: {
    path?: string;
  };
};

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithRoute>();
    const response = http.getResponse<Response>();
    const route = this.resolveRoute(request);

    if (route === '/metrics') {
      return next.handle();
    }

    const startedAt = process.hrtime.bigint();
    this.metricsService.incrementInflightRequests();

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

        this.metricsService.recordHttpRequest(
          request.method,
          route,
          response.statusCode,
          durationMs,
        );
        this.metricsService.decrementInflightRequests();
      }),
    );
  }

  private resolveRoute(request: RequestWithRoute): string {
    const route = request.route as { path?: unknown } | undefined;
    const routePath = typeof route?.path === 'string' ? route.path : undefined;

    if (!routePath) {
      return request.path === '/metrics' ? '/metrics' : 'unmatched';
    }

    if (request.baseUrl) {
      return `${request.baseUrl}${routePath}`;
    }

    return routePath;
  }
}
