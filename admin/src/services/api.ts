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

export function getToken(): string | null {
  return localStorage.getItem('fa_admin_token');
}

export function setToken(token: string) {
  localStorage.setItem('fa_admin_token', token);
}

export function removeToken() {
  localStorage.removeItem('fa_admin_token');
  localStorage.removeItem('fa_admin_user');
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
 * Standard HTTP fetch client wrapper for backend calls.
 * Automatically injects authorization header JWT tokens if present in local storage.
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
    const errorText = await response.text();
    let errMsg = `Request failed: ${response.statusText}`;
    try {
      const parsed = JSON.parse(errorText);
      errMsg = parsed.error || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  return response.json();
}
