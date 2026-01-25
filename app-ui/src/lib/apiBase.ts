// apiBase.ts
//
// Single source of truth for API base URL resolution.
// Connects to backend via Vite proxy/env or falls back to relative path.
//
// Usage:
//   import { apiUrl } from './apiBase';
//   fetch(apiUrl('/api/something'));
//
//   apiUrl('/api/x') -> "http://localhost:3000/api/x" (if VITE_API_BASE_URL set)
//   apiUrl('/api/x') -> "/api/x" (if not set)

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || '';
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, ''); // Remove trailing slash
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
