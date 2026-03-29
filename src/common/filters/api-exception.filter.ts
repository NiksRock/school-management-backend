import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../auth/guards/jwt.guard';
import { AppLogger } from '../../logging/app-logger.service';

type ErrorResponseBody = {
  code: string;
  details?: unknown;
  message: string;
  path: string;
  requestId?: string;
  statusCode: number;
  timestamp: string;
};

type RequestWithContext = AuthenticatedRequest &
  Request & {
    requestId?: string;
  };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly appLogger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();
    const statusCode = this.getStatusCode(exception);
    const error = this.buildErrorResponse(exception, request, statusCode);

    if (statusCode >= 500) {
      this.appLogger.errorWithMetadata(
        'Unhandled exception',
        {
          event: 'http_exception',
          method: request.method,
          path: request.originalUrl || request.url,
          route: this.resolveRoute(request),
          statusCode,
          code: error.code,
          details: error.details,
        },
        ApiExceptionFilter.name,
        exception,
      );
    } else {
      this.appLogger.warnWithMetadata(
        'HTTP exception',
        {
          event: 'http_exception',
          method: request.method,
          path: request.originalUrl || request.url,
          route: this.resolveRoute(request),
          statusCode,
          code: error.code,
          details: error.details,
        },
        ApiExceptionFilter.name,
      );
    }

    response.status(statusCode).json({
      success: false,
      error,
    });
  }

  private buildErrorResponse(
    exception: unknown,
    request: RequestWithContext,
    statusCode: number,
  ): ErrorResponseBody {
    const baseResponse: ErrorResponseBody = {
      code: this.getErrorCode(exception, statusCode),
      message: this.getMessage(exception, statusCode),
      path: request.originalUrl || request.url,
      requestId: request.requestId,
      statusCode,
      timestamp: new Date().toISOString(),
    };
    const details = this.getDetails(exception);

    return details === undefined
      ? baseResponse
      : {
          ...baseResponse,
          details,
        };
  }

  private getStatusCode(exception: unknown): number {
    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getMessage(exception: unknown, statusCode: number): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return response;
      }

      if (response && typeof response === 'object') {
        const message = (response as { message?: unknown }).message;

        if (Array.isArray(message)) {
          return 'Validation failed';
        }

        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }

      if (exception.message) {
        return exception.message;
      }
    }

    if (statusCode >= 500) {
      return 'Internal server error';
    }

    if (exception instanceof Error && exception.message) {
      return exception.message;
    }

    return 'Request failed';
  }

  private getDetails(exception: unknown): unknown {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }

    const response = exception.getResponse();

    if (!response || typeof response === 'string') {
      return undefined;
    }

    const message = (response as { message?: unknown }).message;

    if (Array.isArray(message)) {
      return message;
    }

    if (typeof message === 'object' && message !== null) {
      return message;
    }

    return undefined;
  }

  private getErrorCode(exception: unknown, statusCode: number): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (response && typeof response === 'object') {
        const error = (response as { error?: unknown }).error;

        if (typeof error === 'string' && error.trim()) {
          return this.normalizeCode(error);
        }
      }

      if (exception.name) {
        return this.normalizeCode(exception.name);
      }
    }

    if (statusCode === 500) {
      return 'INTERNAL_SERVER_ERROR';
    }

    return `HTTP_${statusCode}`;
  }

  private normalizeCode(value: string): string {
    return value
      .replace(/Exception$/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
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
