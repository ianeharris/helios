/**
 * Local Hue Bridge discovery. Hue advertises _hue._tcp.local over mDNS with a
 * bridgeid TXT record, so the configured hardware ID remains authoritative.
 */

import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';
import makeMdns from 'multicast-dns';
import { discoverHueBridgesWithBonjour, type HueBridgeAdvertisement } from './bonjour.js';
import { probeBridge } from './api.js';
import type { BridgeConfig, ConfiguredBridge } from './types.js';

const HUE_SERVICE = '_hue._tcp.local';


type CachedAddresses = Record<string, string>;

type HueDiscovery = (timeoutMs: number) => Promise<HueBridgeAdvertisement[]>;
type Delay = (milliseconds: number) => Promise<void>;

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

interface DnsRecord {
  name: string;
  type: string;
  data?: unknown;
}

const normaliseBridgeId = (id: string): string => id.replace(/[^a-f0-9]/gi, '').toUpperCase();

const txtValues = (data: unknown): string[] => {
  if (Array.isArray(data)) {
    return data.flatMap((value): string[] => {
      if (Buffer.isBuffer(value)) return [value.toString('utf-8')];
      return typeof value === 'string' ? [value] : [];
    });
  }
  if (Buffer.isBuffer(data)) return [data.toString('utf-8')];
  return typeof data === 'string' ? [data] : [];
};

const srvTarget = (data: unknown): string | undefined => {
  if (typeof data !== 'object' || data === null || !('target' in data)) return undefined;
  return typeof data.target === 'string' ? data.target : undefined;
};

export const parseHueAdvertisements = (records: DnsRecord[]): HueBridgeAdvertisement[] => {
  const idsByService = new Map<string, string>();
  const hostsByService = new Map<string, string>();
  const addressesByHost = new Map<string, string>();

  for (const record of records) {
    const name = record.name.toLowerCase();
    if (record.type === 'TXT') {
      const bridgeId = txtValues(record.data)
        .find((value) => value.toLowerCase().startsWith('bridgeid='))
        ?.slice('bridgeid='.length);
      if (bridgeId) idsByService.set(name, normaliseBridgeId(bridgeId));
    } else if (record.type === 'SRV') {
      const target = srvTarget(record.data);
      if (target) hostsByService.set(name, target.toLowerCase().replace(/\.$/, ''));
    } else if (record.type === 'A' && typeof record.data === 'string') {
      addressesByHost.set(name.replace(/\.$/, ''), record.data);
    } else if (record.type === 'AAAA' && typeof record.data === 'string') {
      const host = name.replace(/\.$/, '');
      if (!addressesByHost.has(host)) addressesByHost.set(host, record.data);
    }
  }

  return [...idsByService].flatMap(([service, id]) => {
    const host = hostsByService.get(service);
    if (!host) return [];
    return [{ id, address: addressesByHost.get(host) ?? host }];
  });
};

const discoverHueBridgesWithMdns = (timeoutMs: number): Promise<HueBridgeAdvertisement[]> =>
  new Promise((resolve) => {
    const mdns = makeMdns();
    const records: DnsRecord[] = [];
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      mdns.destroy();
      resolve(parseHueAdvertisements(records));
    };

    mdns.on('response', (response) => {
      records.push(...(response.answers ?? []), ...(response.additionals ?? []));
    });
    mdns.on('error', finish);
    mdns.query({ questions: [{ name: HUE_SERVICE, type: 'PTR' }] });
    setTimeout(finish, timeoutMs).unref();
  });

export const discoverHueBridges = (timeoutMs: number): Promise<HueBridgeAdvertisement[]> =>
  process.platform === 'darwin'
    ? discoverHueBridgesWithBonjour(timeoutMs)
    : discoverHueBridgesWithMdns(timeoutMs);


export const discoverHueBridgesWithRetries = async (
  timeoutMs: number,
  attempts: number,
  bridgeIds: string[],
  retryDelayMs: number = 1_000,
  discover: HueDiscovery = discoverHueBridges,
  delay: Delay = wait,
): Promise<HueBridgeAdvertisement[]> => {
  const expectedIds = new Set(bridgeIds.map(normaliseBridgeId));
  const boundedAttempts = Math.max(1, attempts);
  let advertisements: HueBridgeAdvertisement[] = [];

  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    advertisements = await discover(timeoutMs);
    const foundIds = new Set(advertisements.map((advertisement) => normaliseBridgeId(advertisement.id)));
    if ([...expectedIds].every((id) => foundIds.has(id))) return advertisements;
    if (attempt < boundedAttempts) await delay(retryDelayMs);
  }

  return advertisements;
};

export const candidateAddressesForBridge = (
  bridge: ConfiguredBridge,
  advertisements: HueBridgeAdvertisement[],
  cache: CachedAddresses,
): string[] => {
  const id = normaliseBridgeId(bridge.id);
  const discovered = advertisements.find((candidate) => normaliseBridgeId(candidate.id) === id)?.address;
  return [...new Set([discovered, cache[id], bridge.address].filter((candidate): candidate is string => Boolean(candidate)))];
};

const readCache = async (path: string): Promise<CachedAddresses> => {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
};

const writeCache = async (path: string, cache: CachedAddresses): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(cache)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
};

export const resolveBridges = async (
  bridges: ConfiguredBridge[],
  timeoutMs: number,
  cachePath: string,
  discoveryAttempts: number = 1,
  discoveryRetryDelayMs: number = 1_000,
): Promise<BridgeConfig[]> => {
  const [advertisements, cache] = await Promise.all([
    discoverHueBridgesWithRetries(timeoutMs, discoveryAttempts, bridges.map((bridge) => bridge.id), discoveryRetryDelayMs),
    readCache(cachePath),
  ]);
  const resolved: BridgeConfig[] = [];
  const nextCache = { ...cache };

  for (const bridge of bridges) {
    const id = normaliseBridgeId(bridge.id);
    const candidates = candidateAddressesForBridge(bridge, advertisements, cache);
    let address: string | undefined;

    for (const candidate of candidates) {
      try {
        await probeBridge(candidate, bridge.appKey);
        address = candidate;
        break;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(`[hue/${bridge.name}] bridge probe failed for ${candidate}: ${detail}`);
        // A stale cache entry or failed mDNS response must not prevent trying another candidate.
      }
    }

    if (!address) {
      throw new Error(`Unable to discover and authenticate Hue bridge "${bridge.name}" (${bridge.id})`);
    }

    nextCache[id] = address;
    resolved.push({ ...bridge, address });
  }

  await writeCache(cachePath, nextCache);
  return resolved;
};
