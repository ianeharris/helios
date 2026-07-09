import type { DispatchSchedule } from '@helios/shared';
import { useRetainedMqttState } from './useRetainedMqttState.js';

type Status = 'loading' | 'ok' | 'unavailable' | 'error';

interface UseDispatchResult {
  dispatch: DispatchSchedule | null;
  status: Status;
  streamStatus: 'connecting' | 'connected' | 'disconnected';
}

export const useDispatch = (): UseDispatchResult => {
  const { data, status, streamStatus } = useRetainedMqttState<DispatchSchedule>(
    'helios/energy/octopus/dispatch_schedule',
    '/api/energy/dispatch',
    { unavailableOn503: true },
  );
  return { dispatch: data, status, streamStatus };
};
