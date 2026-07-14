import { spawn } from 'node:child_process';

export interface HueBridgeAdvertisement {
  id: string;
  address: string;
}

const HUE_SERVICE_TYPE = '_hue._tcp';
const HUE_DOMAIN = 'local.';

export const parseBonjourBrowse = (output: string): string[] =>
  [...new Set(
    output
      .split('\n')
      .flatMap((line) => {
        const match = line.match(/\bAdd\b.*?_hue\._tcp\.\s+(.+)$/);
        return match?.[1]?.trim() ? [match[1].trim()] : [];
      }),
  )];

export const parseBonjourLookup = (output: string): HueBridgeAdvertisement | undefined => {
  const address = output
    .match(/can be reached at\s+([^:\s]+):\d+/i)?.[1]
    ?.replace(/\.$/, '');
  const id = output.match(/\bbridgeid=([a-f0-9]+)/i)?.[1]?.toUpperCase();

  return address && id ? { id, address } : undefined;
};

const collectBonjourOutput = (args: string[], timeoutMs: number): Promise<string> =>
  new Promise((resolve) => {
    const child = spawn('/usr/bin/dns-sd', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    let finished = false;

    const finish = (): void => {
      if (finished) return;
      finished = true;
      child.kill();
      resolve(output);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf-8');
    });
    child.once('error', finish);
    setTimeout(finish, timeoutMs).unref();
  });

export const discoverHueBridgesWithBonjour = async (
  timeoutMs: number,
): Promise<HueBridgeAdvertisement[]> => {
  const services = parseBonjourBrowse(
    await collectBonjourOutput(['-B', HUE_SERVICE_TYPE, HUE_DOMAIN], timeoutMs),
  );
  if (services.length === 0) return [];

  const lookupTimeoutMs = Math.max(1_000, Math.floor(timeoutMs / services.length));
  const lookups = await Promise.all(
    services.map(async (service) =>
      parseBonjourLookup(
        await collectBonjourOutput(['-L', service, HUE_SERVICE_TYPE, HUE_DOMAIN], lookupTimeoutMs),
      )),
  );

  return lookups.filter((lookup): lookup is HueBridgeAdvertisement => Boolean(lookup));
};
