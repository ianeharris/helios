import { useEffect, useState } from 'react';
import type { SavingSessionState } from '@helios/shared';

type Status = 'loading' | 'ok' | 'unavailable' | 'error';

interface UseSavingSessionsResult {
  sessions: SavingSessionState | null;
  status: Status;
}

const POLL_MS = 5 * 60_000;

export const useSavingSessions = (): UseSavingSessionsResult => {
  const [sessions, setSessions] = useState<SavingSessionState | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let mounted = true;

    const fetch_ = async (): Promise<void> => {
      try {
        const res = await fetch('/api/energy/saving-sessions');
        if (res.status === 503) { if (mounted) setStatus('unavailable'); return; }
        if (!res.ok) { if (mounted) setStatus('error'); return; }
        const data = (await res.json()) as SavingSessionState;
        if (mounted) { setSessions(data); setStatus('ok'); }
      } catch {
        if (mounted) setStatus('error');
      }
    };

    void fetch_();
    const id = setInterval(() => void fetch_(), POLL_MS);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return { sessions, status };
};
