import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ApiSuccessResponse } from '../api-response/api-response.types';

// ── Skip decorator ────────────────────────────────────────────────────────────
/**
 * Apply to any controller handler whose return value should NOT be wrapped in
 * the ApiSuccessResponse envelope (e.g. health checks, raw text responses).
 */
export const SKIP_RESPONSE_WRAP = 'skip:response:wrap';
export const SkipResponseWrap = () => SetMetadata(SKIP_RESPONSE_WRAP, true);

// ── ResponseMessage decorator ─────────────────────────────────────────────────
/**
 * Attach @ResponseMessage('Your message here') to a controller method to
 * control the human-readable message in the success envelope.
 * Falls back to the default per HTTP method when omitted.
 *
 * FIXED: Removed TypedPropertyDescriptor<any> and unsafe descriptor.value cast.
 * Properly typed as a MethodDecorator with a guard before Reflect.defineMetadata.
 */
export const RESPONSE_MESSAGE_METADATA = 'response:message';

export const ResponseMessage =
  (message: string): MethodDecorator =>
  (_target, _key, descriptor) => {
    if (descriptor.value !== undefined) {
      // descriptor.value is the method function — safe to use as metadata target
      Reflect.defineMetadata(
        RESPONSE_MESSAGE_METADATA,
        message,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        descriptor.value as Function,
      );
    }
    return descriptor;
  };

const DEFAULT_MESSAGES: Record<string, string> = {
  GET: 'Data fetched successfully',
  POST: 'Record created successfully',
  PUT: 'Record updated successfully',
  PATCH: 'Record updated successfully',
  DELETE: 'Record deleted successfully',
};

/**
 * Globally applied interceptor. Wraps every successful response in:
 * { success, message, data, error: null, meta }
 *
 * Skip wrapping with @SkipResponseWrap() — replaces the fragile shape heuristic.
 */
@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const handler = context.getHandler();
    const controller = context.getClass();

    // FIXED: explicit opt-out decorator instead of fragile shape sniffing
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAP, [
      handler,
      controller,
    ]);

    if (skip) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();

    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_METADATA, [
        handler,
        controller,
      ]) ?? this.defaultMessage(req.method);

    return next.handle().pipe(
      map((data: unknown): unknown => {
        const pagination = this.extractPagination(data);
        const responseData = pagination
          ? (data as { data: unknown }).data
          : data;

        const envelope: ApiSuccessResponse<unknown> = {
          success: true,
          message,
          data: responseData ?? null,
          error: null,
          meta: {
            timestamp: new Date().toISOString(),
            path: req.originalUrl || req.url,
            method: req.method.toUpperCase(),
            requestId: (req as { requestId?: string }).requestId,
            ...(pagination ? { pagination } : {}),
          },
        };

        return envelope;
      }),
    );
  }

  /**
   * Detect paginated payloads shaped as PaginatedResult<T>:
   * { data: T[], total: number, page: number, limit: number }
   */
  private extractPagination(
    data: unknown,
  ): { page: number; limit: number; total: number } | undefined {
    if (
      data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      'data' in data &&
      'total' in data &&
      'page' in data &&
      'limit' in data
    ) {
      const d = data as { page: unknown; limit: unknown; total: unknown };
      if (
        typeof d.page === 'number' &&
        typeof d.limit === 'number' &&
        typeof d.total === 'number'
      ) {
        return { page: d.page, limit: d.limit, total: d.total };
      }
    }
    return undefined;
  }

  private defaultMessage(method: string | undefined): string {
    return (
      DEFAULT_MESSAGES[method?.toUpperCase() ?? ''] ??
      'Operation completed successfully'
    );
  }
}
