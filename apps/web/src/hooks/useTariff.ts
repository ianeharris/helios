import { useEffect, useState } from 'react';
import type { TariffState } from '@helios/shared';

type Status = 'loading' | 'ok' | 'error';

interface UseTariffResult {
  tariff: TariffState | null;
  status: Status;
}

const POLL_MS = 60_000;

export const useTariff = (): UseTariffResult => {
  const [tariff, setTariff] = useState<TariffState | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let mounted = true;

    const fetch_ = async (): Promise<void> => {
      try {
        const res = await fetch('/api/energy/tariff');
        if (!res.ok) { setStatus('error'); return; }
        const data = (await res.json()) as TariffState;
        if (mounted) { setTariff(data); setStatus('ok'); }
      } catch {
        if (mounted) setStatus('error');
      }
    };

    void fetch_();
    const id = setInterval(() => void fetch_(), POLL_MS);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return { tariff, status };
};
