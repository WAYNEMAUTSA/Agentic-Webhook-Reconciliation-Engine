// In dev, default to Vite proxy so browser host differences (e.g. Codespaces) do not break API calls.
export const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/**
 * Minimal axios-compatible API client that uses BASE_URL as a base.
 * AnomalyQueue and other components use `api.post(path, body)`.
 */
export const api = {
  async get<T = unknown>(path: string): Promise<{ data: T }> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return { data: await res.json() };
  },

  async post<T = unknown>(path: string, body?: unknown): Promise<{ data: T }> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return { data: await res.json() };
  },

  async patch<T = unknown>(path: string, body?: unknown): Promise<{ data: T }> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
    return { data: await res.json() };
  },
};
