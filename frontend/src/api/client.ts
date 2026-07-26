const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

let _token: string | null = null

export function setAuthToken(token: string | null) {
  _token = token
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (_token) headers['Authorization'] = `Bearer ${_token}`

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message = (data as { detail?: string }).detail ?? `Request failed (${res.status})`
    throw new Error(message)
  }
  return data as T
}

export interface TokenResponse {
  access_token: string
}

export const api = {
  signup: (body: { org_name: string; email: string; password: string }) =>
    request<TokenResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<TokenResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
}
