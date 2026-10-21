'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from './api';

export function useResource<T>(path: string | null) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });
    api<T>(path, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setState({ data, error: null, loading: false });
    }).catch((error: unknown) => { if (!controller.signal.aborted) setState({ data: null, error: errorMessage(error), loading: false }); });
    return () => controller.abort();
  }, [path, revision]);
  return { ...state, refresh };
}
