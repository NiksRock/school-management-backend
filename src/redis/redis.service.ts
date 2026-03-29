import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

type UpstashRestResponse<T> = {
  result?: T;
  error?: string;
};

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client?: Redis;
  private readonly restUrl?: string;
  private readonly restToken?: string;

  constructor(private readonly configService: ConfigService) {
    this.restUrl = this.configService.get<string>('redis.restUrl');
    this.restToken = this.configService.get<string>('redis.restToken');

    if (this.restUrl && this.restToken) {
      return;
    }

    const redisUrl = this.configService.get<string>('redis.url');
    const tls = this.configService.get<{ rejectUnauthorized: boolean }>(
      'redis.tls',
    );
    const baseOptions = {
      ...(tls ? { tls } : {}),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    };

    this.client = redisUrl
      ? new Redis(redisUrl, baseOptions)
      : new Redis({
          ...baseOptions,
          host: this.configService.get<string>('redis.host') ?? 'localhost',
          port: this.configService.get<number>('redis.port') ?? 6379,
          password:
            this.configService.get<string>('redis.password') || undefined,
          db: this.configService.get<number>('redis.db') ?? 0,
        });
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    const payload = JSON.stringify(value);

    await this.set(key, payload, ttlSeconds);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const command: Array<string | number> = ['SET', key, value];

    if (ttlSeconds && ttlSeconds > 0) {
      command.push('EX', ttlSeconds);
    }

    await this.executeCommand(command);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const payload = await this.get(key);

    if (!payload) {
      return null;
    }

    return JSON.parse(payload) as T;
  }

  async get(key: string): Promise<string | null> {
    const payload = await this.executeCommand<string | null>(['GET', key]);
    return payload;
  }

  async delete(key: string): Promise<void> {
    await this.executeCommand(['DEL', key]);
  }

  async increment(key: string): Promise<number> {
    const result = await this.executeCommand<number | string>(['INCR', key]);
    return Number(result);
  }

  async pexpire(key: string, ttlMilliseconds: number): Promise<void> {
    await this.executeCommand(['PEXPIRE', key, ttlMilliseconds]);
  }

  async pttl(key: string): Promise<number> {
    const result = await this.executeCommand<number | string>(['PTTL', key]);
    return Number(result);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }

  private getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client is not configured');
    }

    return this.client;
  }

  private async executeCommand<T>(command: Array<string | number>): Promise<T> {
    if (this.restUrl && this.restToken) {
      return this.executeRestCommand(command);
    }

    const [name, ...args] = command;
    return this.getClient().call(
      String(name),
      ...args.map((arg) => (typeof arg === 'string' ? arg : String(arg))),
    ) as Promise<T>;
  }

  private async executeRestCommand<T>(
    command: Array<string | number>,
  ): Promise<T> {
    if (!this.restUrl || !this.restToken) {
      throw new Error('Upstash REST Redis is not configured');
    }

    const response = await fetch(this.restUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    const payload = (await response.json()) as UpstashRestResponse<T>;

    if (!response.ok || payload.error) {
      throw new Error(
        payload.error ?? `Upstash Redis request failed with ${response.status}`,
      );
    }

    return payload.result as T;
  }
}
