export const API_HOST = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5000';
export const BASE_URL = `${API_HOST}/api/v1`;

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'agency_user';
  white_label_name?: string;
  white_label_logo_url?: string;
}

export interface DecodedToken {
  agencyId?: string;
  role?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Safely parse a JWT payload on the client side.
 */
export function parseJwt(token: string): DecodedToken | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const binaryStr = atob(payload);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const decodedStr = new TextDecoder().decode(bytes);
    return JSON.parse(decodedStr);
  } catch (_) {
    return null;
  }
}

/**
 * Checks if a JWT token has expired or is invalid.
 * Uses a small 5-second buffer to handle boundary clock skews.
 */
export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  const decoded = parseJwt(token);
  if (!decoded) return true;
  if (typeof decoded.exp !== 'number') return false;
  return Date.now() >= (decoded.exp * 1000 - 5000);
}

/**
 * Returns remaining milliseconds until token expiry, or 0 if expired/invalid.
 */
export function getTokenRemainingTime(token: string | null): number {
  if (!token) return 0;
  const decoded = parseJwt(token);
  if (!decoded || typeof decoded.exp !== 'number') return 0;
  return Math.max(0, decoded.exp * 1000 - Date.now());
}

export function removeToken() {
  localStorage.removeItem('fa_admin_token');
  localStorage.removeItem('fa_admin_user');
}

/**
 * Cleanly logs out the admin and redirects to login if the session is expired or terminated.
 */
export function logoutAdminSession(reason: 'expired' | 'manual' = 'manual') {
  removeToken();
  if (typeof window !== 'undefined') {
    const isLoginPage = window.location.pathname.startsWith('/login');
    if (!isLoginPage) {
      const url = reason === 'expired' ? '/login?expired=true' : '/login';
      window.location.href = url;
    }
  }
}

export function getToken(): string | null {
  const token = localStorage.getItem('fa_admin_token');
  if (!token) return null;
  if (isTokenExpired(token)) {
    removeToken();
    return null;
  }
  return token;
}

export function setToken(token: string) {
  localStorage.setItem('fa_admin_token', token);
}

export function getUser(): UserProfile | null {
  const raw = localStorage.getItem('fa_admin_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function setUser(user: UserProfile) {
  localStorage.setItem('fa_admin_user', JSON.stringify(user));
}

/**
 * Standard HTTP fetch client wrapper for admin backend calls.
 * Automatically injects authorization header JWT tokens if present in local storage.
 * Automatically catches 401/403 and logs out expired sessions so UI does not stay
 * rendered with stale or incorrect data.
 */
export async function apiRequest(path: string, method: string = 'GET', body?: any) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const isAuthLogin = path.includes('/auth/login');
    if ((response.status === 401 || response.status === 403) && !isAuthLogin && !path.includes('/auth/change-password')) {
      logoutAdminSession('expired');
      throw new Error('Your session has expired or is unauthorized. Please log in again.');
    }

    const errorText = await response.text();
    let errMsg = `Request failed: ${response.statusText}`;
    try {
      const parsed = JSON.parse(errorText);
      errMsg = parsed.error || errMsg;
    } catch (_) {}

    if (errMsg.toLowerCase().includes('expired token') || errMsg.toLowerCase().includes('jwt expired')) {
      logoutAdminSession('expired');
    }

    throw new Error(errMsg);
  }

  return response.json();
}
