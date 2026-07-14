import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';

const originalEnv = { ...process.env };
const tempDirs: string[] = [];

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe('Hue configuration', () => {
  it('loads bridge keys from a host-managed secret directory', () => {
    const secretsDir = mkdtempSync(join(tmpdir(), 'helios-hue-'));
    tempDirs.push(secretsDir);
    writeFileSync(join(secretsDir, 'hue_app_key_bradgate.txt'), 'test-app-key\n');

    process.env['HUE_BRIDGES'] = '[{"id":"bridge-1","name":"Bradgate"}]';
    process.env['HUE_SECRETS_DIR'] = secretsDir;

    expect(loadConfig().bridges).toEqual([
      { id: 'bridge-1', name: 'Bradgate', appKey: 'test-app-key' },
    ]);
  });
});
