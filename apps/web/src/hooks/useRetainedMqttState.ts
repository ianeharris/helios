import { useEffect, useState } from 'react';

type Status = 'loading' | 'ok' | 'unavailable' | 'error';

type MqttStreamEvent = {
  topic: string;
  payload: unknown;
  receivedAt: string;
};

export interface UseRetainedMqttStateResult<T> {
  data: T | null;
  status: Status;
  streamStatus: 'connecting' | 'connected' | 'disconnected';
}

export const useRetainedMqttState = <T>(
  topic: string,
  fallbackPath: string,
  options: { unavailableOn503?: boolean } = {},
): UseRetainedMqttStateResult<T> => {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    let cancelled = false;

    const loadInitial = async (): Promise<void> => {
      try {
        const res = await fetch(fallbackPath);
        if (res.status === 503 && options.unavailableOn503) {
          if (!cancelled) setStatus('unavailable');
          return;
        }
        if (!res.ok) {
          if (!cancelled) setStatus('error');
          return;
        }

        const payload = (await res.json()) as T;
        if (!cancelled) {
          setData(payload);
          setStatus('ok');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    void loadInitial();

    return (): void => {
      cancelled = true;
    };
  }, [fallbackPath, options.unavailableOn503]);

  useEffect(() => {
    let closed = false;
    let reconnectTimer: number | undefined;
    let socket: WebSocket | null = null;

    const connect = (): void => {
      if (closed) return;
      setStreamStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/api/stream?topics=${encodeURIComponent(topic)}`);

      socket.addEventListener('open', () => {
        if (!closed) setStreamStatus('connected');
      });

      socket.addEventListener('message', (message) => {
        try {
          const event = JSON.parse(String(message.data)) as MqttStreamEvent;
          if (event.topic !== topic) return;
          setData(event.payload as T);
          setStatus('ok');
        } catch {
          // Ignore malformed stream messages; the last good retained value remains visible.
        }
      });

      socket.addEventListener('close', () => {
        if (closed) return;
        setStreamStatus('disconnected');
        reconnectTimer = window.setTimeout(connect, 3000);
      });

      socket.addEventListener('error', () => {
        socket?.close();
      });
    };

    connect();

    return (): void => {
      closed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [topic]);

  return { data, status, streamStatus };
};
