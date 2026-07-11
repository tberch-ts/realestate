import { API_URL as BASE } from './runtimeEnv';

// Centralized fetch for all /api/* calls from apps/crm — resolves relative
// paths against API_URL, mirroring apps/web's src/lib/api.ts convention.
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, init);
}
