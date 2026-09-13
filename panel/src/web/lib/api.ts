export class ApiError extends Error {
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const UNAUTHORIZED_EVENT = 'minetune:unauthorized';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Minetune': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };

  if (res.status === 401 && path !== '/login') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok) throw new ApiError(data.error ?? `Erro ${res.status}`, res.status, data.fields);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
};
