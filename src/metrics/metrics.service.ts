import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

const HTTP_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5,
];
const DEPENDENCY_DURATION_BUCKETS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1,
];

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly contentType = this.registry.contentType;
  private readonly httpRequestsTotal: Counter<string>;
  private readonly httpErrorsTotal: Counter<string>;
  private readonly httpRequestDurationSeconds: Histogram<string>;
  private readonly httpRequestsInFlight: Gauge<string>;
  private readonly dbQueriesTotal: Counter<string>;
  private readonly dbQueryErrorsTotal: Counter<string>;
  private readonly dbSlowQueryDurationSeconds: Histogram<string>;
  private readonly redisOperationsTotal: Counter<string>;
  private readonly redisOperationErrorsTotal: Counter<string>;
  private readonly databaseUp: Gauge<string>;
  private readonly databasePingDurationSeconds: Histogram<string>;
  private readonly redisUp: Gauge<string>;
  private readonly redisPingDurationSeconds: Histogram<string>;
  private readonly appInfo: Gauge<string>;

  constructor(private readonly configService: ConfigService) {
    const serviceName =
      this.configService.get<string>('logging.serviceName') ??
      'school-management-system';
    const environment =
      this.configService.get<string>('app.nodeEnv') ?? 'development';

    this.registry.setDefaultLabels({
      service: serviceName,
      environment,
    });

    if (
      this.configService.get<boolean>('metrics.defaultMetricsEnabled') ??
      true
    ) {
      collectDefaultMetrics({
        register: this.registry,
      });
    }

    this.httpRequestsTotal = new Counter({
      name: 'http_server_requests_total',
      help: 'Total number of completed HTTP requests.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
    this.httpErrorsTotal = new Counter({
      name: 'http_server_errors_total',
      help: 'Total number of failed HTTP requests.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_server_request_duration_seconds',
      help: 'HTTP request duration in seconds.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: HTTP_DURATION_BUCKETS,
      registers: [this.registry],
    });
    this.httpRequestsInFlight = new Gauge({
      name: 'http_server_requests_in_flight',
      help: 'Current number of in-flight HTTP requests.',
      registers: [this.registry],
    });
    this.dbQueriesTotal = new Counter({
      name: 'db_queries_total',
      help: 'Total number of database queries executed.',
      labelNames: ['query_type'],
      registers: [this.registry],
    });
    this.dbQueryErrorsTotal = new Counter({
      name: 'db_query_errors_total',
      help: 'Total number of database query errors.',
      labelNames: ['query_type'],
      registers: [this.registry],
    });
    this.dbSlowQueryDurationSeconds = new Histogram({
      name: 'db_slow_query_duration_seconds',
      help: 'Duration of slow database queries in seconds.',
      labelNames: ['query_type'],
      buckets: DEPENDENCY_DURATION_BUCKETS,
      registers: [this.registry],
    });
    this.redisOperationsTotal = new Counter({
      name: 'redis_operations_total',
      help: 'Total number of Redis operations executed.',
      labelNames: ['backend', 'command'],
      registers: [this.registry],
    });
    this.redisOperationErrorsTotal = new Counter({
      name: 'redis_operation_errors_total',
      help: 'Total number of Redis operation failures.',
      labelNames: ['backend', 'command'],
      registers: [this.registry],
    });
    this.databaseUp = new Gauge({
      name: 'app_database_up',
      help: 'Database connectivity status.',
      registers: [this.registry],
    });
    this.databasePingDurationSeconds = new Histogram({
      name: 'app_database_ping_duration_seconds',
      help: 'Database health-check latency in seconds.',
      buckets: DEPENDENCY_DURATION_BUCKETS,
      registers: [this.registry],
    });
    this.redisUp = new Gauge({
      name: 'app_redis_up',
      help: 'Redis connectivity status.',
      registers: [this.registry],
    });
    this.redisPingDurationSeconds = new Histogram({
      name: 'app_redis_ping_duration_seconds',
      help: 'Redis health-check latency in seconds.',
      buckets: DEPENDENCY_DURATION_BUCKETS,
      registers: [this.registry],
    });
    this.appInfo = new Gauge({
      name: 'app_info',
      help: 'Static information about the running application.',
      labelNames: ['version'],
      registers: [this.registry],
    });
    this.appInfo.set(
      {
        version: process.env.npm_package_version ?? 'unknown',
      },
      1,
    );
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  incrementInflightRequests(): void {
    this.httpRequestsInFlight.inc();
  }

  decrementInflightRequests(): void {
    this.httpRequestsInFlight.dec();
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
  ): void {
    const labels = {
      method: method.toUpperCase(),
      route,
      status_code: String(statusCode),
    };

    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationMs / 1000);

    if (statusCode >= 500) {
      this.httpErrorsTotal.inc(labels);
    }
  }

  recordDbQuery(query: string): void {
    this.dbQueriesTotal.inc({
      query_type: this.getQueryType(query),
    });
  }

  recordDbQueryError(query: string): void {
    this.dbQueryErrorsTotal.inc({
      query_type: this.getQueryType(query),
    });
  }

  recordSlowDbQuery(durationMs: number, query: string): void {
    this.dbSlowQueryDurationSeconds.observe(
      {
        query_type: this.getQueryType(query),
      },
      durationMs / 1000,
    );
  }

  recordRedisOperation(command: string, backend: string): void {
    this.redisOperationsTotal.inc({
      backend,
      command: command.toUpperCase(),
    });
  }

  recordRedisOperationError(command: string, backend: string): void {
    this.redisOperationErrorsTotal.inc({
      backend,
      command: command.toUpperCase(),
    });
  }

  setDatabaseUp(isUp: boolean): void {
    this.databaseUp.set(isUp ? 1 : 0);
  }

  observeDatabasePing(durationMs: number): void {
    this.databasePingDurationSeconds.observe(durationMs / 1000);
  }

  setRedisUp(isUp: boolean): void {
    this.redisUp.set(isUp ? 1 : 0);
  }

  observeRedisPing(durationMs: number): void {
    this.redisPingDurationSeconds.observe(durationMs / 1000);
  }

  private getQueryType(query: string): string {
    const normalized = query.trim().split(/\s+/, 1)[0]?.toUpperCase();
    return normalized || 'UNKNOWN';
  }
}
