// API client.
//
// The access token lives in sessionStorage rather than a cookie, which keeps
// this demo simple and CSRF-free at the cost of not surviving a tab close. A
// production build would move to httpOnly cookies with the refresh rotation the
// API already implements.

// NEXT_PUBLIC_API_URL wins when set. Otherwise the API is assumed to sit on
// port 4000 of whatever host served this page: opened from a phone on the LAN,
// a hardcoded "localhost" would point at the phone itself rather than the dev
// machine, and every request would fail before it left the device.
function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return 'http://localhost:4000';
}

export const API_BASE = resolveApiBase();

const TOKEN_KEY = 'atcon.token';
const USER_KEY = 'atcon.user';

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function getUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}

export function storeSession(token: string, user: SessionUser): void {
  window.sessionStorage.setItem(TOKEN_KEY, token);
  window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
}

export async function api<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const token = auth ? getToken() : null;

  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // The API's own message is written for the person reading it, so it is
    // shown rather than replaced with something generic.
    const detail =
      (body as { message?: string | { message?: string } })?.message ?? 'Request failed.';
    throw new ApiError(
      response.status,
      typeof detail === 'string' ? detail : (detail.message ?? 'Request failed.'),
    );
  }

  return body as T;
}

/** Recruiters think in "3 days", not timestamps. */
export function since(iso: string | null | undefined): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
