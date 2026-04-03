// In dev, default to Vite proxy so browser host differences (e.g. Codespaces) do not break API calls.
export const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
