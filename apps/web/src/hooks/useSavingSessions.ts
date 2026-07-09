import type { SavingSessionState } from '@helios/shared';
import { useRetainedMqttState } from './useRetainedMqttState.js';

type Status = 'loading' | 'ok' | 'unavailable' | 'error';

interface UseSavingSessionsResult {
  sessions: SavingSessionState | null;
  status: Status;
  streamStatus: 'connecting' | 'connected' | 'disconnected';
}

export const useSavingSessions = (): UseSavingSessionsResult => {
  const { data, status, streamStatus } = useRetainedMqttState<SavingSessionState>(
    'helios/energy/octopus/saving_session',
    '/api/energy/saving-sessions',
    { unavailableOn503: true },
  );
  return { sessions: data, status, streamStatus };
};
