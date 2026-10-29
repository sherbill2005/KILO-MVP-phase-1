/**
 * Central API & WebSocket Configuration for Kilo Mobile
 * Allows dynamic environment overrides via `EXPO_PUBLIC_WORKER_URL`
 * and optional API key authentication via `EXPO_PUBLIC_WORKER_API_KEY`.
 */

const DEFAULT_WORKER_HOST = 'kilo-worker.sherbill2005.workers.dev';

const rawUrl = process.env.EXPO_PUBLIC_WORKER_URL?.trim();
const normalizedHost = rawUrl
  ? rawUrl.replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '').replace(/\/.*$/, '')
  : DEFAULT_WORKER_HOST;

const isLocal =
  normalizedHost.startsWith('localhost') ||
  normalizedHost.startsWith('127.0.0.1') ||
  normalizedHost.startsWith('10.0.') ||
  normalizedHost.startsWith('192.168.');

export const WORKER_HOST = normalizedHost;
export const WORKER_HTTP_SCHEME = isLocal ? 'http' : 'https';
export const WORKER_WS_SCHEME = isLocal ? 'ws' : 'wss';

export const WORKER_API_KEY =
  process.env.EXPO_PUBLIC_WORKER_API_KEY?.trim() ||
  process.env.EXPO_PUBLIC_API_KEY?.trim() ||
  '';

export const WORKER_BASE_URL = `${WORKER_HTTP_SCHEME}://${WORKER_HOST}`;
export const WORKER_API_BASE = `${WORKER_BASE_URL}/api`;
export const LIVE_WS_URL = WORKER_API_KEY
  ? `${WORKER_WS_SCHEME}://${WORKER_HOST}/ws/ai/live?token=${encodeURIComponent(WORKER_API_KEY)}`
  : `${WORKER_WS_SCHEME}://${WORKER_HOST}/ws/ai/live`;

export function getWorkerHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (WORKER_API_KEY) {
    headers['Authorization'] = `Bearer ${WORKER_API_KEY}`;
  }
  return headers;
}
