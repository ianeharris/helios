import type { FoxEssLive } from '@helios/shared';
import { useRetainedMqttState } from './useRetainedMqttState.js';

interface UseFoxEssResult {
  live: FoxEssLive | null;
  streamStatus: 'connecting' | 'connected' | 'disconnected';
}

export const useFoxEss = (): UseFoxEssResult => {
  const { data, streamStatus } = useRetainedMqttState<FoxEssLive>(
    'helios/energy/foxess/live',
    '/api/energy/foxess',
  );
  return { live: data, streamStatus };
};
