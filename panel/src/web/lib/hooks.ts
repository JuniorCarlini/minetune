import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobInfo } from '../../shared/api.ts';
import { api } from './api.ts';

export interface ApiState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => Promise<void>;
}

/** GET com recarga opcional em intervalo. `path = null` desativa. */
export function useApi<T>(path: string | null, intervalMs?: number): ApiState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(path !== null);
  const current = useRef(path);
  current.current = path;

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const result = await api.get<T>(path);
      if (current.current === path) {
        setData(result);
        setError(undefined);
      }
    } catch (err) {
      if (current.current === path) setError(err as Error);
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(path !== null);
    void reload();
    if (!path || !intervalMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [path, intervalMs, reload]);

  return { data, error, loading, reload };
}

/** Acompanha um job até terminar. */
export function useJob(jobId: string | null, onFinish?: (job: JobInfo) => void): JobInfo | undefined {
  const [job, setJob] = useState<JobInfo>();
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  useEffect(() => {
    setJob(undefined);
    if (!jobId) return;
    let stopped = false;

    const poll = async () => {
      try {
        const next = await api.get<JobInfo>(`/jobs/${jobId}`);
        if (stopped) return;
        setJob(next);
        if (next.status !== 'running') {
          finishRef.current?.(next);
          return;
        }
      } catch {
        // painel reiniciando ou rede instável: tenta de novo
      }
      if (!stopped) setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      stopped = true;
    };
  }, [jobId]);

  return job;
}
