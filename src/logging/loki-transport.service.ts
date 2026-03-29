import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type LokiQueueEntry = {
  labels: Record<string, string>;
  line: string;
  timestampNs: string;
};

type LokiPushPayload = {
  streams: Array<{
    stream: Record<string, string>;
    values: string[][];
  }>;
};

@Injectable()
export class LokiTransportService implements OnModuleDestroy {
  private readonly environment: string;
  private readonly serviceName: string;
  private readonly url?: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly enabled: boolean;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueueSize: number;
  private readonly retryBackoffMs: number;
  private readonly timeoutMs: number;
  private droppedEntries = 0;
  private nextRetryAt = 0;
  private queue: LokiQueueEntry[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isFlushing = false;

  constructor(private readonly configService: ConfigService) {
    this.environment =
      this.configService.get<string>('app.nodeEnv') ?? 'development';
    this.serviceName =
      this.configService.get<string>('logging.serviceName') ??
      'school-management-system';
    this.url = this.configService.get<string>('logging.loki.url');
    this.username = this.configService.get<string>('logging.loki.username');
    this.password = this.configService.get<string>('logging.loki.password');
    this.batchSize =
      this.configService.get<number>('logging.loki.batchSize') ?? 50;
    this.flushIntervalMs =
      this.configService.get<number>('logging.loki.flushIntervalMs') ?? 5000;
    this.maxQueueSize =
      this.configService.get<number>('logging.loki.maxQueueSize') ?? 1000;
    this.retryBackoffMs =
      this.configService.get<number>('logging.loki.retryBackoffMs') ?? 5000;
    this.timeoutMs =
      this.configService.get<number>('logging.loki.timeoutMs') ?? 5000;
    this.enabled = Boolean(this.url && this.username && this.password);

    if (this.enabled) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, this.flushIntervalMs);
      this.flushTimer.unref?.();
    }
  }

  enqueue(
    record: Record<string, unknown>,
    labels: Record<string, string>,
  ): void {
    if (!this.enabled) {
      return;
    }

    const entry: LokiQueueEntry = {
      labels: {
        service: this.serviceName,
        environment: this.environment,
        ...labels,
      },
      line: this.stringifyRecord(record),
      timestampNs: `${BigInt(Date.now()) * 1000000n}`,
    };

    this.queue.push(entry);

    if (this.queue.length > this.maxQueueSize) {
      this.droppedEntries += this.queue.length - this.maxQueueSize;
      this.queue = this.queue.slice(-this.maxQueueSize);
      this.reportInternalError(
        'Loki queue reached capacity and older entries were dropped',
        new Error(`Dropped ${this.droppedEntries} log entries`),
      );
      this.droppedEntries = 0;
    }

    if (this.queue.length >= this.batchSize) {
      void this.flush();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await this.flush(true);
  }

  private async flush(force = false): Promise<void> {
    if (
      !this.enabled ||
      this.isFlushing ||
      this.queue.length === 0 ||
      (!force && Date.now() < this.nextRetryAt)
    ) {
      return;
    }

    this.isFlushing = true;
    const batchSize = force ? this.queue.length : this.batchSize;
    const batch = this.queue.splice(0, batchSize);

    try {
      await this.pushBatch(batch);
      this.nextRetryAt = 0;
    } catch (error) {
      this.queue = [...batch, ...this.queue].slice(-this.maxQueueSize);
      this.nextRetryAt = Date.now() + this.retryBackoffMs;
      this.reportInternalError('Failed to push logs to Grafana Loki', error);
    } finally {
      this.isFlushing = false;

      if (force && this.queue.length > 0) {
        await this.flush(true);
      }
    }
  }

  private async pushBatch(batch: LokiQueueEntry[]): Promise<void> {
    if (!this.url || !this.username || !this.password || batch.length === 0) {
      return;
    }

    const payload: LokiPushPayload = {
      streams: this.groupByLabels(batch),
    };
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `Grafana Loki returned ${response.status}: ${await response.text()}`,
      );
    }
  }

  private groupByLabels(
    batch: LokiQueueEntry[],
  ): Array<{ stream: Record<string, string>; values: string[][] }> {
    const grouped = new Map<
      string,
      { stream: Record<string, string>; values: string[][] }
    >();

    for (const entry of batch) {
      const key = JSON.stringify(entry.labels);
      const existing = grouped.get(key);

      if (existing) {
        existing.values.push([entry.timestampNs, entry.line]);
        continue;
      }

      grouped.set(key, {
        stream: entry.labels,
        values: [[entry.timestampNs, entry.line]],
      });
    }

    return Array.from(grouped.values());
  }

  private stringifyRecord(record: Record<string, unknown>): string {
    try {
      return JSON.stringify(record);
    } catch (error) {
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: this.serviceName,
        environment: this.environment,
        context: LokiTransportService.name,
        message: 'Failed to stringify log record for Loki',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private reportInternalError(message: string, error: unknown): void {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: this.serviceName,
        environment: this.environment,
        context: LokiTransportService.name,
        message,
        details: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
