import type { TariffState } from '@helios/shared';
import { useRetainedMqttState } from './useRetainedMqttState.js';

type Status = 'loading' | 'ok' | 'error';

interface UseTariffResult {
  tariff: TariffState | null;
  status: Status;
  streamStatus: 'connecting' | 'connected' | 'disconnected';
}

export const useTariff = (): UseTariffResult => {
  const { data, status, streamStatus } = useRetainedMqttState<TariffState>(
    'helios/energy/tariff/state',
    '/api/energy/tariff',
  );
  return { tariff: data, status: status === 'unavailable' ? 'error' : status, streamStatus };
};
