import { SetMetadata } from '@nestjs/common';

export type CachePolicyOptions = {
  value: string;
  vary?: string[];
};

export const CACHE_POLICY_METADATA = 'cache-policy';

export const CachePolicy = (policy: CachePolicyOptions): MethodDecorator =>
  SetMetadata('cache-policy', policy);
