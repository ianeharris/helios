import { useEffect, useState } from 'react';
import type { DispatchSchedule } from '@helios/shared';

type Status = 'loading' | 'ok' | 'unavailable' | 'error';

interface UseDispatchResult {
  dispatch: DispatchSchedule | null;
  status: Status;
}

const POLL_MS = 5 * 60_000;

export const useDispatch = (): UseDispatchResult => {
  const [dispatch, setDispatch] = useState<DispatchSchedule | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let mounted = true;

    const fetch_ = async (): Promise<void> => {
      try {
        const res = await fetch('/api/energy/dispatch');
        if (res.status === 503) { if (mounted) setStatus('unavailable'); return; }
        if (!res.ok) { if (mounted) setStatus('error'); return; }
        const data = (await res.json()) as DispatchSchedule;
        if (mounted) { setDispatch(data); setStatus('ok'); }
      } catch {
        if (mounted) setStatus('error');
      }
    };

    void fetch_();
    const id = setInterval(() => void fetch_(), POLL_MS);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return { dispatch, status };
};
