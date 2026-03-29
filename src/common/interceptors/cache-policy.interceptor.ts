import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import {
  CACHE_POLICY_METADATA,
  type CachePolicyOptions,
} from '../decorators/cache-policy.decorator';

@Injectable()
export class CachePolicyInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();
    const policy = this.reflector.getAllAndOverride<CachePolicyOptions>(
      CACHE_POLICY_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const cacheControl = policy?.value ?? 'no-store';

    response.setHeader('Cache-Control', cacheControl);

    if (policy?.vary?.length) {
      response.setHeader('Vary', policy.vary.join(', '));
    }

    // FIXED: Removed HTTP/1.0 Pragma and Expires headers — Cache-Control is sufficient
    // for all modern HTTP/1.1+ clients and API consumers.

    return next.handle();
  }
}
