import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Logger as TypeOrmLoggerInterface, QueryRunner } from 'typeorm';
import { AppLogger } from './app-logger.service';

@Injectable()
export class TypeOrmLogger implements TypeOrmLoggerInterface {
  constructor(
    private readonly appLogger: AppLogger,
    private readonly configService: ConfigService,
  ) {}

  logQuery(
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ): void {
    void queryRunner;

    if (!this.shouldLogQueries()) {
      return;
    }

    this.appLogger.debugWithMetadata(
      'Database query executed',
      {
        event: 'database_query',
        query,
        parameters,
      },
      TypeOrmLogger.name,
    );
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ): void {
    void queryRunner;

    this.appLogger.errorWithMetadata(
      'Database query failed',
      {
        event: 'database_query_error',
        query,
        parameters,
        details: error instanceof Error ? error.message : error,
      },
      TypeOrmLogger.name,
      error,
    );
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ): void {
    void queryRunner;

    this.appLogger.warnWithMetadata(
      'Database query was slow',
      {
        event: 'database_query_slow',
        durationMs: time,
        query,
        parameters,
      },
      TypeOrmLogger.name,
    );
  }

  logSchemaBuild(message: string, queryRunner?: QueryRunner): void {
    void queryRunner;

    this.appLogger.infoWithMetadata(
      'Database schema event',
      {
        event: 'database_schema',
        details: message,
      },
      TypeOrmLogger.name,
    );
  }

  logMigration(message: string, queryRunner?: QueryRunner): void {
    void queryRunner;

    this.appLogger.infoWithMetadata(
      'Database migration event',
      {
        event: 'database_migration',
        details: message,
      },
      TypeOrmLogger.name,
    );
  }

  log(
    level: 'log' | 'info' | 'warn',
    message: unknown,
    queryRunner?: QueryRunner,
  ): void {
    void queryRunner;

    if (level === 'warn') {
      this.appLogger.warnWithMetadata(
        'TypeORM warning',
        {
          event: 'database_warning',
          details: message,
        },
        TypeOrmLogger.name,
      );
      return;
    }

    this.appLogger.infoWithMetadata(
      'TypeORM event',
      {
        event: level === 'info' ? 'database_info' : 'database_log',
        details: message,
      },
      TypeOrmLogger.name,
    );
  }

  private shouldLogQueries(): boolean {
    return this.configService.get<boolean>('database.logging') ?? false;
  }
}
