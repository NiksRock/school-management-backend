import { Global, Module } from '@nestjs/common';
import { RedisThrottlerStorageService } from '../common/throttling/redis-throttler.storage';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, RedisThrottlerStorageService],
  exports: [RedisService, RedisThrottlerStorageService],
})
export class RedisModule {}
