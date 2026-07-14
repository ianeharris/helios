import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

interface MockResponse extends EventEmitter {
  statusCode: number;
  setEncoding: (encoding: string) => void;
}

interface MockRequest extends EventEmitter {
  end: () => void;
}

interface MockRequestOptions {
  hostname: string;
  path: string;
  headers: { 'hue-application-key': string };
  agent: unknown;
}

type RequestImplementation = (options: MockRequestOptions, callback: (response: MockResponse) => void) => MockRequest;

const { requestMock, Agent } = vi.hoisted(() => ({
  requestMock: vi.fn<RequestImplementation>(),
  Agent: class {
    constructor(readonly options: unknown) {}
  },
}));

vi.mock('https', () => ({
  default: { Agent, request: requestMock },
}));

import { probeBridge } from '../api.js';

describe('probeBridge', () => {
  it('uses the Node HTTPS agent for Hue bridge requests', async () => {
    const response = Object.assign(new EventEmitter(), { statusCode: 200, setEncoding: vi.fn() }) as MockResponse;

    requestMock.mockImplementation((_, callback) => {
      const request = new EventEmitter() as MockRequest;
      request.end = (): void => {
        callback(response);
        queueMicrotask(() => {
          response.emit('data', JSON.stringify({ data: [], errors: [] }));
          response.emit('end');
        });
      };
      return request;
    });

    await probeBridge('bridge.local', 'test-key');

    expect(requestMock).toHaveBeenCalledOnce();
    const [options] = requestMock.mock.calls[0] ?? [];
    expect(options).toMatchObject({
      hostname: 'bridge.local',
      path: '/clip/v2/resource/bridge',
      headers: { 'hue-application-key': 'test-key' },
    });
    expect(options?.agent).toBeInstanceOf(Agent);
  });
});
