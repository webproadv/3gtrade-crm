const TOKEN_KEY = '3gtrade.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage non disponibile */
  }
}

let onUnauthorized: () => void = () => undefined;
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const msg = Array.isArray(json?.message) ? json.message.join(', ') : json?.message ?? res.statusText;
    throw new ApiError(res.status, msg, json?.errors ?? {});
  }
  return json as T;
}

export function qs(params: Record<string, string | number | undefined | Record<string, string>>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    if (typeof v === 'object') for (const [fk, fv] of Object.entries(v)) sp.set(`${k}[${fk}]`, fv);
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
