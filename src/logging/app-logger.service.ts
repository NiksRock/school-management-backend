import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pino from 'pino';
import type { LevelWithSilent, Logger as PinoLogger } from 'pino';
import { LokiTransportService } from './loki-transport.service';
import { RequestContextService } from './request-context.service';

type LogMetadata = Record<string, unknown>;

type ResolvedLogParams = {
  context?: string;
  metadata: LogMetadata;
};

type ResolvedErrorParams = {
  context?: string;
  metadata: LogMetadata;
  stack?: string;
};

@Injectable()
export class AppLogger implements LoggerService {
  private readonly environment: string;
  private readonly serviceName: string;
  private readonly logger: PinoLogger;

  constructor(
    private readonly configService: ConfigService,
    private readonly requestContextService: RequestContextService,
    private readonly lokiTransport: LokiTransportService,
  ) {
    this.environment =
      this.configService.get<string>('app.nodeEnv') ?? 'development';
    this.serviceName =
      this.configService.get<string>('logging.serviceName') ??
      'school-management-system';
    this.logger = pino({
      level: this.resolveLogLevel(),
      base: undefined,
      messageKey: 'message',
      formatters: {
        bindings: () => ({}),
        level: (label) => ({
          level: label,
        }),
      },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    });
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    const { metadata, context } = this.resolveLogParams(optionalParams);
    this.write('info', this.normalizeMessage(message), metadata, context);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const { metadata, context, stack } = this.resolveErrorParams(
      message,
      optionalParams,
    );

    this.write(
      'error',
      this.normalizeMessage(message),
      metadata,
      context,
      stack,
    );
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    const { metadata, context } = this.resolveLogParams(optionalParams);
    this.write('warn', this.normalizeMessage(message), metadata, context);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    const { metadata, context } = this.resolveLogParams(optionalParams);
    this.write('debug', this.normalizeMessage(message), metadata, context);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    const { metadata, context } = this.resolveLogParams(optionalParams);
    this.write('debug', this.normalizeMessage(message), metadata, context);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    const { metadata, context, stack } = this.resolveErrorParams(
      message,
      optionalParams,
    );

    this.write(
      'fatal',
      this.normalizeMessage(message),
      metadata,
      context,
      stack,
    );
  }

  infoWithMetadata(
    message: string,
    metadata: LogMetadata = {},
    context?: string,
  ): void {
    this.write('info', message, metadata, context);
  }

  warnWithMetadata(
    message: string,
    metadata: LogMetadata = {},
    context?: string,
  ): void {
    this.write('warn', message, metadata, context);
  }

  debugWithMetadata(
    message: string,
    metadata: LogMetadata = {},
    context?: string,
  ): void {
    this.write('debug', message, metadata, context);
  }

  errorWithMetadata(
    message: string,
    metadata: LogMetadata = {},
    context?: string,
    error?: unknown,
  ): void {
    const errorMetadata = this.serializeError(error);

    this.write(
      'error',
      message,
      errorMetadata ? { ...metadata, ...errorMetadata } : metadata,
      context,
      error instanceof Error ? error.stack : undefined,
    );
  }

  private write(
    level: Exclude<LevelWithSilent, 'silent'>,
    message: string,
    metadata: LogMetadata,
    context?: string,
    stack?: string,
  ): void {
    const requestId = this.requestContextService.getRequestId();
    const consoleRecord: LogMetadata = {
      service: this.serviceName,
      environment: this.environment,
      ...(requestId ? { requestId } : {}),
      ...(context ? { context } : {}),
      ...metadata,
      ...(stack ? { stack } : {}),
    };
    const lokiRecord = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...consoleRecord,
    };

    this.logger[level](consoleRecord, message);
    this.lokiTransport.enqueue(lokiRecord, {
      level,
    });
  }

  private resolveLogParams(optionalParams: unknown[]): ResolvedLogParams {
    if (optionalParams.length === 0) {
      return {
        metadata: {},
      };
    }

    let context: string | undefined;
    let metadata: LogMetadata = {};
    const [firstParam, secondParam] = optionalParams;

    if (this.isRecord(firstParam)) {
      metadata = firstParam;
    }

    if (typeof firstParam === 'string') {
      context = firstParam;
    }

    if (typeof secondParam === 'string') {
      context = secondParam;
    }

    if (this.isRecord(secondParam)) {
      metadata = secondParam;
    }

    return {
      context,
      metadata,
    };
  }

  private resolveErrorParams(
    message: unknown,
    optionalParams: unknown[],
  ): ResolvedErrorParams {
    let context: string | undefined;
    let metadata: LogMetadata = {};
    let stack: string | undefined;

    const [firstParam, secondParam, thirdParam] = optionalParams;

    if (typeof firstParam === 'string') {
      stack = firstParam;
    }

    if (this.isRecord(firstParam)) {
      metadata = firstParam;
    }

    if (typeof secondParam === 'string') {
      context = secondParam;
    }

    if (this.isRecord(secondParam)) {
      metadata = secondParam;
    }

    if (typeof thirdParam === 'string') {
      context = thirdParam;
    }

    const errorMetadata = this.serializeError(message);

    return {
      context,
      metadata: errorMetadata ? { ...metadata, ...errorMetadata } : metadata,
      stack:
        stack ??
        (message instanceof Error && message.stack ? message.stack : undefined),
    };
  }

  private serializeError(error: unknown): LogMetadata | undefined {
    if (!(error instanceof Error)) {
      return undefined;
    }

    return {
      errorName: error.name,
      errorMessage: error.message,
      ...(error.stack ? { errorStack: error.stack } : {}),
    };
  }

  private normalizeMessage(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }

    if (message instanceof Error) {
      return message.message;
    }

    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }

  private isRecord(value: unknown): value is LogMetadata {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private resolveLogLevel(): LevelWithSilent {
    const configuredLevel =
      this.configService.get<string>('logging.level')?.toLowerCase() ?? 'info';
    const validLevels: LevelWithSilent[] = [
      'fatal',
      'error',
      'warn',
      'info',
      'debug',
      'trace',
      'silent',
    ];

    return validLevels.includes(configuredLevel as LevelWithSilent)
      ? (configuredLevel as LevelWithSilent)
      : 'info';
  }
}
