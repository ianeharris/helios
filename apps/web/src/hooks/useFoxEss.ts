import { useEffect, useState } from 'react';
import type { FoxEssLive } from '@helios/shared';

const POLL_MS = 30_000;

interface UseFoxEssResult {
  live: FoxEssLive | null;
}

export const useFoxEss = (): UseFoxEssResult => {
  const [live, setLive] = useState<FoxEssLive | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetch_ = async (): Promise<void> => {
      try {
        const res = await fetch('/api/energy/foxess');
        if (!res.ok) return;
        const data = (await res.json()) as FoxEssLive;
        if (mounted) setLive(data);
      } catch { /* silently degrade — tiles show '--' */ }
    };

    void fetch_();
    const id = setInterval(() => void fetch_(), POLL_MS);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return { live };
};
