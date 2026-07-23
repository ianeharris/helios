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
import type { ClientRequest, IncomingMessage } from 'http';
import type { BridgeConfig, HueStreamEvent } from './types.js';

const agent = new https.Agent({ rejectUnauthorized: false });

export type SseEventHandler = (events: HueStreamEvent[], bridgeId: string) => void;

export class HueSseConnection {
  private request: ClientRequest | null = null;
  private stream: IncomingMessage | null = null;
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
    this.request?.destroy();
    this.stream?.destroy();
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

    try {
      await this.openStream();
    } catch (err: unknown) {
      if (this.stopped) return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[hue/${this.bridge.name}] SSE error: ${msg}`);
    } finally {
      if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    }

    this.scheduleReconnect();
  }

  private openStream(): Promise<void> {
    console.log(`[hue/${this.bridge.name}] connecting to SSE stream at https://${this.bridge.address}/eventstream/clip/v2`);

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        this.request = null;
        this.stream = null;
        if (error) reject(error);
        else resolve();
      };

      const request = https.request({
        hostname: this.bridge.address,
        port: 443,
        path: '/eventstream/clip/v2',
        method: 'GET',
        headers: {
          'hue-application-key': this.bridge.appKey,
          Accept: 'text/event-stream',
        },
        agent,
      }, (response) => {
        this.stream = response;
        if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
          response.resume();
          finish(new Error(`SSE connect failed: HTTP ${response.statusCode ?? 0}`));
          return;
        }

        console.log(`[hue/${this.bridge.name}] SSE connected`);
        this.reconnectDelay = this.baseReconnectDelayMs;
        this.resetActivityTimeout(response);

        let buffer = '';
        response.setEncoding('utf-8');
        response.on('data', (chunk: string) => {
          if (this.stopped) return;
          this.resetActivityTimeout(response);
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const events = JSON.parse(payload) as HueStreamEvent[];
              this.onEvents(events, this.bridge.id);
            } catch (error) {
              console.error(`[hue/${this.bridge.name}] failed to parse SSE payload:`, error);
            }
          }
        });
        response.once('end', () => finish());
        response.once('close', () => finish());
        response.once('error', (error) => finish(error instanceof Error ? error : new Error(String(error))));
      });

      this.request = request;
      request.once('error', (error) => finish(error instanceof Error ? error : new Error(String(error))));
      request.end();
    });
  }
}
