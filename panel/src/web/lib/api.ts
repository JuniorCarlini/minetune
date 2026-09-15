import { currentLocale } from './i18n.tsx';

export class ApiError extends Error {
  readonly status: number;
  readonly fields?: Record<string, string>;
  /** Lista de problemas que o servidor explicou (ex.: por que um .zip de mundo foi recusado). */
  readonly details?: string[];

  constructor(message: string, status: number, fields?: Record<string, string>, details?: string[]) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.details = details;
  }
}

export const UNAUTHORIZED_EVENT = 'minetune:unauthorized';

type ErrorBody = { error?: string; fields?: Record<string, string>; problems?: string[] };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    // A língua vai junto: erros e avisos do servidor voltam no idioma escolhido no painel.
    headers: { 'Content-Type': 'application/json', 'X-Minetune': '1', 'X-Minetune-Lang': currentLocale() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as ErrorBody;

  if (res.status === 401 && path !== '/login') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok) throw new ApiError(data.error ?? `HTTP ${res.status}`, res.status, data.fields, data.problems);
  return data as T;
}

/**
 * Envia um arquivo com o progresso do envio (o fetch não informa quanto já subiu).
 * O corpo é o próprio arquivo; o nome vai no cabeçalho X-Filename.
 */
export function uploadFile<T>(path: string, file: File, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Minetune', '1');
    xhr.setRequestHeader('X-Minetune-Lang', currentLocale());
    xhr.setRequestHeader('Content-Type', 'application/zip');
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let data: ErrorBody = {};
      try {
        data = JSON.parse(xhr.responseText || '{}') as ErrorBody;
      } catch {
        // resposta sem JSON (proxy na frente, por exemplo): fica só o código
      }
      if (xhr.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(data.error ?? `HTTP ${xhr.status}`, xhr.status, data.fields, data.problems));
    };
    xhr.onerror = () => reject(new ApiError(`HTTP ${xhr.status || 0}`, xhr.status || 0));
    xhr.send(file);
  });
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
};
