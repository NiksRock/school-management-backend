# Observability Setup

This repository supports two observability modes:

- Production or cloud logging: the NestJS app pushes structured logs directly to Grafana Cloud Loki with `GRAFANA_LOKI_*` environment variables.
- Local observability stack: Docker Compose can start Prometheus, Loki, Promtail, and Grafana for development and validation.

## What is included

- Structured JSON logging with request correlation IDs
- Prometheus metrics at `/metrics`
- HTTP, database, Redis, and dependency health metrics
- Local Loki and Promtail for log aggregation
- Local Grafana provisioning for datasources and dashboards
- Prometheus alert rules for common backend failures

## Local setup

1. Copy `.env.example` to `.env`.
2. Keep `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USERNAME`, and `GRAFANA_LOKI_PASSWORD` empty if you want console-only logging locally.
3. Start the local services:

```bash
npm install
docker compose up postgres redis
npm run start:dev
```

4. Start the full local observability stack:

```bash
npm run docker:up:observability
```

5. Open the local UIs:

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- Metrics: `http://localhost:3000/metrics`
- Loki: `http://localhost:3100/ready`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`

6. Sign in to Grafana with:

- Username: `GRAFANA_ADMIN_USER`
- Password: `GRAFANA_ADMIN_PASSWORD`

## Render and Grafana Cloud setup

Set these environment variables in Render:

```env
SERVICE_NAME=school-management-system-api
LOG_LEVEL=info
GRAFANA_LOKI_URL=https://logs-prod-xxx.grafana.net/loki/api/v1/push
GRAFANA_LOKI_USERNAME=<grafana-cloud-user-id>
GRAFANA_LOKI_PASSWORD=<grafana-cloud-api-key>
```

Optional production tuning:

```env
LOG_REDIS_OPERATIONS=false
DB_LOGGING=false
GRAFANA_LOKI_BATCH_SIZE=50
GRAFANA_LOKI_FLUSH_INTERVAL_MS=5000
GRAFANA_LOKI_RETRY_BACKOFF_MS=5000
GRAFANA_LOKI_TIMEOUT_MS=5000
GRAFANA_LOKI_MAX_QUEUE_SIZE=1000
METRICS_DB_PING_INTERVAL_MS=30000
METRICS_REDIS_PING_INTERVAL_MS=30000
METRICS_SLOW_DB_QUERY_THRESHOLD_MS=500
```

## Prometheus alerts

Alert rules are provisioned from `observability/prometheus/alerts.yml`:

- `BackendServiceDown`
- `BackendHighErrorRate`
- `BackendHighLatencyP95`
- `BackendDatabaseUnavailable`
- `BackendRedisUnavailable`

## Validation checklist

- `npm run lint` passes.
- `npm run build` passes.
- `npm test` passes.
- `GET /health` returns `200`.
- `GET /metrics` returns Prometheus exposition text.
- Prometheus target `nestjs-app` is `UP`.
- Grafana dashboard `NestJS Backend Observability` loads.
- Loki Explore query `{compose_service="app"} | json` returns application logs.
- Triggering a bad request increases `http_server_requests_total`.
- Stopping Redis sets `app_redis_up` to `0`.
- Stopping PostgreSQL sets `app_database_up` to `0`.

## Notes

- Promtail is included because it was explicitly requested, but it is deprecated and reached EOL on March 2, 2026. Plan a future migration to Grafana Alloy.
- Local Docker observability uses Promtail to ship container stdout logs to Loki.
- Production Render logging still uses direct app-to-Loki HTTP push.
