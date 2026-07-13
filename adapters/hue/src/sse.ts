/**
 * Server-Sent Events (EventStream) connection to a single Hue Bridge v2.
 *
 * The bridge pushes events on: GET https://<ip>/eventstream/clip/v2
 * Response is text/event-stream. Each `data:` line is a JSON array of
 * HueStreamEvent objects.
 *
 * The stream goes quiet if no events occur. We set a timeout and reconnect
 * if no data arrives within sseTimeoutMs (default 120 s). The bridge also
 * closes the connection periodically; we reconnect with exponential backoff.
 */

import https from 'https';
import type { IncomingMessage } from 'http';
import type { BridgeConfig, HueStreamEvent } from './types.js';

const agent = new https.Agent({ rejectUnauthorized: false });

export type SseEventHandler = (events: HueStreamEvent[], bridgeId: string) => void;

export class HueSseConnection {
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private reconnectDelay: number;

  constructor(
    private readonly bridge: BridgeConfig,
    private readonly onEvents: SseEventHandler,
    private readonly sseTimeoutMs: number,
    private readonly baseReconnectDelayMs: number,
  ) {
    this.reconnectDelay = baseReconnectDelayMs;
  }

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.abortController?.abort();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
  }

  private resetActivityTimeout(stream: IncomingMessage): void {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = setTimeout(() => {
      console.warn(`[hue/${this.bridge.name}] SSE stream silent for ${this.sseTimeoutMs}ms - reconnecting`);
      stream.destroy();
    }, this.sseTimeoutMs);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    console.log(`[hue/${this.bridge.name}] reconnecting in ${this.reconnectDelay}ms`);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, this.reconnectDelay);
    // Exponential backoff capped at 60 s
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;

    const url = `https://${this.bridge.address}/eventstream/clip/v2`;
    console.log(`[hue/${this.bridge.name}] connecting to SSE stream at ${url}`);

    this.abortController = new AbortController();

    try {
      const res = await fetch(url, {
        headers: {
          'hue-application-key': this.bridge.appKey,
          Accept: 'text/event-stream',
        },
        // @ts-expect-error - node-fetch / undici agent type mismatch
        agent,
        signal: this.abortController.signal,
      });

      if (!res.ok) {
        throw new Error(`SSE connect failed: HTTP ${res.status}`);
      }
      if (!res.body) {
        throw new Error('SSE response has no body');
      }

      console.log(`[hue/${this.bridge.name}] SSE connected`);
      this.reconnectDelay = this.baseReconnectDelayMs; // reset backoff on success

      let buffer = '';
      const decoder = new TextDecoder();

      for await (const chunk of res.body) {
        if (this.stopped) break;
        this.resetActivityTimeout(res.body as unknown as IncomingMessage);

        buffer += decoder.decode(chunk as Uint8Array, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const events = JSON.parse(payload) as HueStreamEvent[];
            this.onEvents(events, this.bridge.id);
          } catch (e) {
            console.error(`[hue/${this.bridge.name}] failed to parse SSE payload:`, e);
          }
        }
      }
    } catch (err: unknown) {
      if (this.stopped) return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[hue/${this.bridge.name}] SSE error: ${msg}`);
    } finally {
      if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    }

    this.scheduleReconnect();
  }
}
