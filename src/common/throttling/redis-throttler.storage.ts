import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../../redis/redis.service';

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = this.getHitKey(key, throttlerName);
    const blockKey = this.getBlockKey(key, throttlerName);
    const currentBlockTtl = await this.redisService.pttl(blockKey);

    if (currentBlockTtl > 0) {
      return {
        totalHits: await this.getTotalHits(hitKey),
        timeToExpire: this.toSeconds(await this.redisService.pttl(hitKey)),
        isBlocked: true,
        timeToBlockExpire: this.toSeconds(currentBlockTtl),
      };
    }

    const totalHits = await this.redisService.increment(hitKey);

    if (totalHits === 1) {
      await this.redisService.pexpire(hitKey, ttl);
    }

    const timeToExpire = this.toSeconds(await this.redisService.pttl(hitKey));

    if (totalHits > limit) {
      await this.redisService.set(
        blockKey,
        '1',
        Math.max(Math.ceil(blockDuration / 1000), 1),
      );

      return {
        totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: this.toSeconds(
          await this.redisService.pttl(blockKey),
        ),
      };
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  private async getTotalHits(hitKey: string): Promise<number> {
    const totalHits = await this.redisService.get(hitKey);
    return Number(totalHits ?? 0);
  }

  private getHitKey(key: string, throttlerName: string): string {
    return `throttle:${throttlerName}:${key}:hits`;
  }

  private getBlockKey(key: string, throttlerName: string): string {
    return `throttle:${throttlerName}:${key}:block`;
  }

  private toSeconds(ttlMilliseconds: number): number {
    return ttlMilliseconds > 0 ? Math.ceil(ttlMilliseconds / 1000) : 0;
  }
}
