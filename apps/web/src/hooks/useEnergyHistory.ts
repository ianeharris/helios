import { useState, useEffect } from 'react';
import type { EnergyHistory, EnergyPeriod } from '@helios/shared';

interface Result {
  history: EnergyHistory | null;
  status: 'loading' | 'ok' | 'error';
}

export const useEnergyHistory = (period: EnergyPeriod): Result => {
  const [history, setHistory] = useState<EnergyHistory | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    setStatus('loading');
    setHistory(null);

    const controller = new AbortController();
    fetch(`/api/energy/history?period=${period}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as EnergyHistory;
        setHistory(data);
        setStatus('ok');
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setStatus('error');
      });

    return () => controller.abort();
  }, [period]);

  return { history, status };
};
