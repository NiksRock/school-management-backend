export interface HealthResponse {
  service: string;
  status: 'ok' | 'degraded';
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
}
