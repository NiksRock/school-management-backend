import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppLogger } from './app-logger.service';
import { LokiTransportService } from './loki-transport.service';
import { RequestContextService } from './request-context.service';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { TypeOrmLogger } from './typeorm.logger';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    AppLogger,
    LokiTransportService,
    RequestContextService,
    RequestLoggingInterceptor,
    TypeOrmLogger,
  ],
  exports: [
    AppLogger,
    LokiTransportService,
    RequestContextService,
    RequestLoggingInterceptor,
    TypeOrmLogger,
  ],
})
export class LoggingModule {}
