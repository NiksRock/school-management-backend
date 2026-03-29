export interface AppConfig {
  app: {
    nodeEnv: string;
    port: number;
    frontendOrigins: string[];
  };

  api: {
    rateLimit: {
      defaultLimit: number;
      defaultTtlMs: number;
      defaultBlockDurationMs: number;
      authLimit: number;
      authTtlMs: number;
      authBlockDurationMs: number;
    };
    cache: {
      rolesTtlSeconds: number;
    };
  };

  database: {
    url?: string;
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    synchronize: boolean;
    logging: boolean;
    ssl: boolean | { rejectUnauthorized: boolean };
    enableChannelBinding: boolean;
  };

  redis: {
    url?: string;
    restUrl?: string;
    restToken?: string;
    host: string;
    port: number;
    db: number;
    password?: string;
    tls?: {
      rejectUnauthorized: boolean;
    };
  };

  auth: {
    accessTokenSecret: string;
    refreshTokenSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    accessCookieName: string;
    refreshCookieName: string;
    cookieDomain?: string;
    cookieSameSite: 'lax' | 'strict' | 'none';
    cookieSecure: boolean;
  };

  bootstrapAdmin: {
    name: string;
    email: string;
    password: string;
  };

  logging: {
    level: string;
    serviceName: string;
    logRedisOperations: boolean;
    loki: {
      url?: string;
      username?: string;
      password?: string;
      batchSize: number;
      flushIntervalMs: number;
      retryBackoffMs: number;
      timeoutMs: number;
      maxQueueSize: number;
    };
  };

  metrics: {
    defaultMetricsEnabled: boolean;
    dbPingIntervalMs: number;
    redisPingIntervalMs: number;
    slowDbQueryThresholdMs: number;
  };
}
function parseSameSite(value: string | undefined): 'lax' | 'strict' | 'none' {
  const normalized = value?.toLowerCase();

  if (
    normalized === 'lax' ||
    normalized === 'strict' ||
    normalized === 'none'
  ) {
    return normalized;
  }

  return 'lax'; // safe default
}
function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.toLowerCase() === 'true';
}

function parseStringList(
  value: string | undefined,
  fallback: string[],
): string[] {
  if (!value) {
    return fallback;
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseLogLevel(value: string | undefined, fallback: string): string {
  return (value ?? fallback).toLowerCase();
}

type DatabaseUrlMetadata = {
  sslMode?: string;
  requiresChannelBinding: boolean;
};

type RedisUrlMetadata = {
  requiresTls: boolean;
};

function shouldUseManagedConnection(
  nodeEnv: string,
  connectionUrl: string | undefined,
): boolean {
  if (!connectionUrl) {
    return false;
  }

  return nodeEnv === 'staging' || nodeEnv === 'production';
}

function parseDatabaseUrlMetadata(
  databaseUrl: string | undefined,
): DatabaseUrlMetadata {
  if (!databaseUrl) {
    return {
      requiresChannelBinding: false,
    };
  }

  try {
    const parsed = new URL(databaseUrl);

    return {
      sslMode: parsed.searchParams.get('sslmode')?.toLowerCase(),
      requiresChannelBinding:
        parsed.searchParams.get('channel_binding')?.toLowerCase() === 'require',
    };
  } catch {
    return {
      requiresChannelBinding: false,
    };
  }
}

function resolveDatabaseSsl(
  metadata: DatabaseUrlMetadata,
): boolean | { rejectUnauthorized: boolean } {
  const explicitSsl = parseOptionalBoolean(process.env.DB_SSL);
  const explicitRejectUnauthorized = parseOptionalBoolean(
    process.env.DB_SSL_REJECT_UNAUTHORIZED,
  );

  if (explicitSsl === false) {
    return false;
  }

  if (explicitSsl === true) {
    return {
      rejectUnauthorized: explicitRejectUnauthorized ?? false,
    };
  }

  switch (metadata.sslMode) {
    case 'disable':
      return false;
    case 'allow':
    case 'prefer':
    case 'require':
      return {
        rejectUnauthorized: explicitRejectUnauthorized ?? false,
      };
    case 'verify-ca':
    case 'verify-full':
      return {
        rejectUnauthorized: explicitRejectUnauthorized ?? true,
      };
    default:
      return false;
  }
}

function resolveChannelBinding(metadata: DatabaseUrlMetadata): boolean {
  return (
    parseOptionalBoolean(process.env.DB_ENABLE_CHANNEL_BINDING) ??
    metadata.requiresChannelBinding
  );
}

function parseRedisUrlMetadata(redisUrl: string | undefined): RedisUrlMetadata {
  if (!redisUrl) {
    return {
      requiresTls: false,
    };
  }

  try {
    const parsed = new URL(redisUrl);

    return {
      requiresTls: parsed.protocol === 'rediss:',
    };
  } catch {
    return {
      requiresTls: false,
    };
  }
}

function resolveRedisTls(
  metadata: RedisUrlMetadata,
): { rejectUnauthorized: boolean } | undefined {
  const explicitTls = parseOptionalBoolean(process.env.REDIS_TLS);
  const explicitRejectUnauthorized = parseOptionalBoolean(
    process.env.REDIS_TLS_REJECT_UNAUTHORIZED,
  );
  const shouldUseTls = explicitTls ?? metadata.requiresTls;

  if (!shouldUseTls) {
    return undefined;
  }

  return {
    rejectUnauthorized: explicitRejectUnauthorized ?? true,
  };
}

export default (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const logLevel = parseLogLevel(
    process.env.LOG_LEVEL,
    nodeEnv === 'production' ? 'info' : 'debug',
  );
  const configuredDatabaseUrl = process.env.DATABASE_URL;
  const activeDatabaseUrl = shouldUseManagedConnection(
    nodeEnv,
    configuredDatabaseUrl,
  )
    ? configuredDatabaseUrl
    : undefined;
  const databaseUrlMetadata = parseDatabaseUrlMetadata(activeDatabaseUrl);
  const configuredRedisUrl = process.env.REDIS_URL;
  const activeRedisUrl = shouldUseManagedConnection(nodeEnv, configuredRedisUrl)
    ? configuredRedisUrl
    : undefined;
  const configuredUpstashRedisRestUrl = process.env.UPSTASH_REDIS_REST_URL;
  const activeUpstashRedisRestUrl = shouldUseManagedConnection(
    nodeEnv,
    configuredUpstashRedisRestUrl,
  )
    ? configuredUpstashRedisRestUrl
    : undefined;
  const configuredUpstashRedisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const activeUpstashRedisRestToken =
    activeUpstashRedisRestUrl && configuredUpstashRedisRestToken
      ? configuredUpstashRedisRestToken
      : undefined;
  const redisUrlMetadata = parseRedisUrlMetadata(activeRedisUrl);

  return {
    app: {
      nodeEnv,
      port: parseNumber(process.env.PORT, 3000),
      frontendOrigins: parseStringList(process.env.FRONTEND_ORIGINS, [
        'http://localhost:3001',
        'http://localhost:3000',
      ]),
    },
    api: {
      rateLimit: {
        defaultLimit: parseNumber(process.env.API_RATE_LIMIT_LIMIT, 120),
        defaultTtlMs:
          parseNumber(process.env.API_RATE_LIMIT_TTL_SECONDS, 60) * 1000,
        defaultBlockDurationMs:
          parseNumber(process.env.API_RATE_LIMIT_BLOCK_SECONDS, 60) * 1000,
        authLimit: parseNumber(process.env.API_AUTH_RATE_LIMIT_LIMIT, 10),
        authTtlMs:
          parseNumber(process.env.API_AUTH_RATE_LIMIT_TTL_SECONDS, 60) * 1000,
        authBlockDurationMs:
          parseNumber(process.env.API_AUTH_RATE_LIMIT_BLOCK_SECONDS, 300) *
          1000,
      },
      cache: {
        rolesTtlSeconds: parseNumber(
          process.env.API_CACHE_ROLES_TTL_SECONDS,
          60,
        ),
      },
    },
    database: {
      url: activeDatabaseUrl,
      host: process.env.DB_HOST ?? 'localhost',
      port: parseNumber(process.env.DB_PORT, 5432),
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      name: process.env.DB_NAME ?? 'school_management',
      synchronize: parseBoolean(process.env.DB_SYNC, true),
      logging: parseBoolean(process.env.DB_LOGGING, false),
      ssl: resolveDatabaseSsl(databaseUrlMetadata),
      enableChannelBinding: resolveChannelBinding(databaseUrlMetadata),
    },
    redis: {
      url: activeRedisUrl,
      restUrl: activeUpstashRedisRestUrl,
      restToken: activeUpstashRedisRestToken,
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseNumber(process.env.REDIS_PORT, 6379),
      password: process.env.REDIS_PASSWORD,
      db: parseNumber(process.env.REDIS_DB, 0),
      tls: resolveRedisTls(redisUrlMetadata),
    },
    auth: {
      accessTokenSecret:
        process.env.ACCESS_TOKEN_SECRET ??
        process.env.JWT_SECRET ??
        'change-me-access-token-secret',
      refreshTokenSecret:
        process.env.REFRESH_TOKEN_SECRET ?? 'change-me-refresh-token-secret',
      accessTokenTtlSeconds: parseNumber(
        process.env.ACCESS_TOKEN_TTL_SECONDS,
        900,
      ),
      refreshTokenTtlSeconds: parseNumber(
        process.env.REFRESH_TOKEN_TTL_SECONDS,
        604800,
      ),
      accessCookieName: process.env.ACCESS_COOKIE_NAME ?? 'sms_access_token',
      refreshCookieName: process.env.REFRESH_COOKIE_NAME ?? 'sms_refresh_token',
      cookieDomain: process.env.COOKIE_DOMAIN,
      cookieSameSite: parseSameSite(process.env.COOKIE_SAME_SITE) ?? 'lax',
      cookieSecure: parseBoolean(process.env.COOKIE_SECURE, false),
    },
    bootstrapAdmin: {
      name: process.env.ADMIN_NAME ?? 'System Admin',
      email: process.env.ADMIN_EMAIL ?? 'admin@school.local',
      password: process.env.ADMIN_PASSWORD ?? 'Admin@12345',
    },
    logging: {
      serviceName: process.env.SERVICE_NAME ?? 'school-management-system',
      level: logLevel,
      logRedisOperations: parseBoolean(process.env.LOG_REDIS_OPERATIONS, false),
      loki: {
        url: process.env.GRAFANA_LOKI_URL,
        username: process.env.GRAFANA_LOKI_USERNAME,
        password: process.env.GRAFANA_LOKI_PASSWORD,
        batchSize: parseNumber(process.env.GRAFANA_LOKI_BATCH_SIZE, 50),
        flushIntervalMs: parseNumber(
          process.env.GRAFANA_LOKI_FLUSH_INTERVAL_MS,
          5000,
        ),
        retryBackoffMs: parseNumber(
          process.env.GRAFANA_LOKI_RETRY_BACKOFF_MS,
          5000,
        ),
        timeoutMs: parseNumber(process.env.GRAFANA_LOKI_TIMEOUT_MS, 5000),
        maxQueueSize: parseNumber(
          process.env.GRAFANA_LOKI_MAX_QUEUE_SIZE,
          1000,
        ),
      },
    },
    metrics: {
      defaultMetricsEnabled: parseBoolean(
        process.env.METRICS_DEFAULT_METRICS_ENABLED,
        true,
      ),
      dbPingIntervalMs: parseNumber(
        process.env.METRICS_DB_PING_INTERVAL_MS,
        30000,
      ),
      redisPingIntervalMs: parseNumber(
        process.env.METRICS_REDIS_PING_INTERVAL_MS,
        30000,
      ),
      slowDbQueryThresholdMs: parseNumber(
        process.env.METRICS_SLOW_DB_QUERY_THRESHOLD_MS,
        500,
      ),
    },
  };
};
