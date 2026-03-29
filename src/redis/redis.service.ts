import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppLogger } from '../logging/app-logger.service';
import { MetricsService } from '../metrics/metrics.service';

type UpstashRestResponse<T> = {
  result?: T;
  error?: string;
};

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client?: Redis;
  private readonly enableRedisOperationLogs: boolean;
  private readonly restUrl?: string;
  private readonly restToken?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly appLogger: AppLogger,
    private readonly metricsService: MetricsService,
  ) {
    this.restUrl = this.configService.get<string>('redis.restUrl');
    this.restToken = this.configService.get<string>('redis.restToken');
    this.enableRedisOperationLogs =
      this.configService.get<boolean>('logging.redisOperations') ?? false;

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

    this.client.on('error', (error) => {
      this.appLogger.errorWithMetadata(
        'Redis client connection error',
        {
          backend: 'socket',
          host: this.configService.get<string>('redis.host') ?? 'localhost',
          port: this.configService.get<number>('redis.port') ?? 6379,
        },
        RedisService.name,
        error,
      );
    });

    this.client.on('reconnecting', () => {
      this.appLogger.warnWithMetadata(
        'Redis client reconnecting',
        {
          backend: 'socket',
          host: this.configService.get<string>('redis.host') ?? 'localhost',
          port: this.configService.get<number>('redis.port') ?? 6379,
        },
        RedisService.name,
      );
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

  /**
   * FIXED HIGH-03: Optional `validate` parameter lets callers enforce a runtime
   * type guard. On guard failure the entry is treated as a cache miss (null),
   * preventing corrupted/stale data from being silently cast to T.
   */
  async getJson<T>(
    key: string,
    validate?: (value: unknown) => value is T,
  ): Promise<T | null> {
    const payload = await this.get(key);
    if (!payload) {
      return null;
    }

    const parsed: unknown = JSON.parse(payload);

    if (validate !== undefined && !validate(parsed)) {
      this.appLogger.warnWithMetadata(
        'Redis cache entry failed validation — treating as cache miss',
        { key },
        RedisService.name,
      );
      return null;
    }

    return parsed as T;
  }

  async get(key: string): Promise<string | null> {
    return this.executeCommand<string | null>(['GET', key]);
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

  async ping(): Promise<string> {
    return this.executeCommand<string>(['PING']);
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
    const [name] = command;

    if (this.restUrl && this.restToken) {
      return this.executeRestCommand(command, String(name));
    }

    const [, ...args] = command;

    try {
      const result = (await this.getClient().call(
        String(name),
        ...args.map((arg) => (typeof arg === 'string' ? arg : String(arg))),
      )) as T;

      this.metricsService.recordRedisOperation(String(name), 'socket');
      this.logRedisOperation('Redis socket command executed', String(name), {
        backend: 'socket',
      });

      return result;
    } catch (error) {
      this.metricsService.recordRedisOperationError(String(name), 'socket');
      this.appLogger.errorWithMetadata(
        'Redis socket command failed',
        { backend: 'socket', command: String(name) },
        RedisService.name,
        error,
      );
      throw error;
    }
  }

  private async executeRestCommand<T>(
    command: Array<string | number>,
    commandName: string,
  ): Promise<T> {
    if (!this.restUrl || !this.restToken) {
      throw new Error('Upstash REST Redis is not configured');
    }

    try {
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
          payload.error ??
            `Upstash Redis request failed with ${response.status}`,
        );
      }

      this.metricsService.recordRedisOperation(commandName, 'upstash_rest');
      this.logRedisOperation('Upstash REST command executed', commandName, {
        backend: 'upstash_rest',
      });

      // payload.result is T from the Upstash response shape
      return payload.result as T;
    } catch (error) {
      this.metricsService.recordRedisOperationError(
        commandName,
        'upstash_rest',
      );
      this.appLogger.errorWithMetadata(
        'Upstash REST command failed',
        { backend: 'upstash_rest', command: commandName },
        RedisService.name,
        error,
      );
      throw error;
    }
  }

  private logRedisOperation(
    message: string,
    commandName: string,
    metadata: Record<string, unknown>,
  ): void {
    if (!this.enableRedisOperationLogs) {
      return;
    }
    this.appLogger.debugWithMetadata(
      message,
      { command: commandName, ...metadata },
      RedisService.name,
    );
  }
}
