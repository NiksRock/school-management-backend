import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../auth/guards/jwt.guard';
import { AppLogger } from '../../logging/app-logger.service';
import type {
  ApiErrorResponse,
  ValidationErrorDetail,
} from '../api-response/api-response.types';

type RequestWithContext = AuthenticatedRequest &
  Request & {
    requestId?: string;
  };

/**
 * Global exception filter.
 *
 * All errors — validation failures, HTTP exceptions, unknown errors — are
 * normalised into the standard ApiErrorResponse envelope:
 * { success, message, data: null, error: { code, details? }, meta }
 *
 * FIXED: resolveDetails() now accepts pre-structured { field, message }[] from
 * the exceptionFactory in main.ts. The fragile string-parsing path is kept as
 * a fallback for edge cases but is no longer the primary path.
 *
 * Rules:
 * - 5xx → generic message, full error logged internally (never exposed)
 * - 4xx → specific message from exception, structured validation details
 * - Validation errors → converted to { field, message }[] via exceptionFactory
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly appLogger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();

    const statusCode = this.resolveStatusCode(exception);
    const message = this.resolveMessage(exception, statusCode);
    const errorCode = this.resolveErrorCode(exception, statusCode);
    const details = this.resolveDetails(exception);

    if (statusCode >= 500) {
      this.appLogger.errorWithMetadata(
        'Unhandled exception',
        {
          event: 'http_exception',
          method: request.method,
          path: request.originalUrl || request.url,
          route: this.resolveRoute(request),
          statusCode,
          errorCode,
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
          errorCode,
          ...(details ? { details } : {}),
        },
        ApiExceptionFilter.name,
      );
    }

    const body: ApiErrorResponse = {
      success: false,
      message,
      data: null,
      error: {
        code: errorCode,
        ...(details !== undefined ? { details } : {}),
      },
      meta: {
        timestamp: new Date().toISOString(),
        path: request.originalUrl || request.url,
        method: request.method.toUpperCase(),
        requestId: request.requestId,
      },
    };

    response.status(statusCode).json(body);
  }

  private resolveStatusCode(exception: unknown): number {
    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveMessage(exception: unknown, statusCode: number): string {
    if (statusCode >= 500) {
      return 'Something went wrong. Please try again later.';
    }

    if (exception instanceof BadRequestException) {
      const details = this.resolveDetails(exception);
      if (Array.isArray(details) && details.length > 0) {
        const first = details[0];
        return (
          first?.message ??
          'Invalid input. Please check your request and try again.'
        );
      }
      return 'Invalid input. Please check your request and try again.';
    }

    if (exception instanceof HttpException) {
      const raw = exception.getResponse();

      if (typeof raw === 'string' && raw.trim()) {
        return raw;
      }

      if (raw && typeof raw === 'object') {
        const msg = (raw as { message?: unknown }).message;
        if (typeof msg === 'string' && msg.trim()) {
          return msg;
        }
      }

      return exception.message || 'Request could not be processed.';
    }

    if (exception instanceof Error && exception.message) {
      return exception.message;
    }

    return 'Request could not be processed.';
  }

  private resolveErrorCode(exception: unknown, statusCode: number): string {
    if (statusCode >= 500) {
      return 'INTERNAL_SERVER_ERROR';
    }

    if (exception instanceof HttpException) {
      const raw = exception.getResponse();

      if (raw && typeof raw === 'object') {
        const error = (raw as { error?: unknown }).error;
        if (typeof error === 'string' && error.trim()) {
          return this.toScreamingSnake(error);
        }
      }

      if (exception.name) {
        return this.toScreamingSnake(exception.name);
      }
    }

    return `HTTP_${statusCode}`;
  }

  /**
   * FIXED: Primary path now handles pre-structured { field, message }[] items
   * produced by the exceptionFactory in main.ts.
   * String fallback kept for edge cases only.
   */
  private resolveDetails(
    exception: unknown,
  ): ValidationErrorDetail[] | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }

    const raw = exception.getResponse();

    if (!raw || typeof raw === 'string') {
      return undefined;
    }

    const message = (raw as { message?: unknown }).message;

    if (!Array.isArray(message) || message.length === 0) {
      return undefined;
    }

    return message
      .map((item) => {
        // Primary path: exceptionFactory already structured the item
        if (item && typeof item === 'object') {
          const asObj = item as {
            field?: unknown;
            message?: unknown;
            property?: unknown;
            constraints?: unknown;
          };

          if (
            typeof asObj.field === 'string' &&
            typeof asObj.message === 'string'
          ) {
            return { field: asObj.field, message: asObj.message };
          }

          // class-validator ValidationError shape (fallback for direct pipe usage)
          if (
            typeof asObj.property === 'string' &&
            asObj.constraints &&
            typeof asObj.constraints === 'object'
          ) {
            const firstConstraint =
              Object.values(asObj.constraints as Record<string, string>)[0] ??
              'Invalid value';
            return { field: asObj.property, message: firstConstraint };
          }
        }

        // Fallback: string from old-style pipe
        if (typeof item === 'string') {
          return this.parseValidationString(item);
        }

        return { field: 'unknown', message: String(item) };
      })
      .filter((d): d is ValidationErrorDetail => Boolean(d));
  }

  /**
   * Fallback only: class-validator default pipe produces strings like:
   *   "email must be a valid email address"
   * The exceptionFactory in main.ts should prevent this path for normal validation.
   */
  private parseValidationString(message: string): ValidationErrorDetail {
    const spaceIndex = message.indexOf(' ');
    if (spaceIndex === -1) {
      return { field: 'unknown', message };
    }
    const field = message.substring(0, spaceIndex);
    const constraint = message.substring(spaceIndex + 1);
    const displayMessage =
      constraint.charAt(0).toUpperCase() + constraint.slice(1);
    return { field, message: displayMessage };
  }

  private toScreamingSnake(value: string): string {
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

    if (!routePath) return 'unmatched';
    return request.baseUrl ? `${request.baseUrl}${routePath}` : routePath;
  }
}
