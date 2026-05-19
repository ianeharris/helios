/**
 * One-time tool: register a Helios application key on a Hue Bridge v2.
 *
 * Usage (run on the Mac mini):
 *   1. Press the link button on the bridge.
 *   2. Within 30 seconds, run:
 *      node --loader ts-node/esm adapters/hue/src/tools/register-appkey.ts <bridge-ip>
 *   3. Copy the printed appKey into SOPS secrets.yaml.
 *
 * This only needs to be run once per bridge.
 */

import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

const ip = process.argv[2];
if (!ip) {
  console.error('Usage: register-appkey <bridge-ip>');
  process.exit(1);
}

const res = await fetch(`https://${ip}/api`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ devicetype: 'helios#mac-mini', generateclientkey: true }),
  // @ts-expect-error
  agent,
});

const data = (await res.json()) as Array<{ success?: { username: string; clientkey: string }; error?: { description: string } }>;

if (data[0]?.error) {
  console.error('Bridge returned an error:', data[0].error.description);
  console.error('Did you press the link button within the last 30 seconds?');
  process.exit(1);
}

if (data[0]?.success) {
  console.log('\nApp key registered successfully!\n');
  console.log('appKey (hue-application-key):');
  console.log(' ', data[0].success.username);
  console.log('\nAdd to SOPS secrets.yaml as:');
  console.log(`  hue_app_key_bradgate: "${data[0].success.username}"`);
  console.log('\n(clientkey is for the Entertainment API - not needed by Helios)');
} else {
  console.error('Unexpected response:', JSON.stringify(data));
  process.exit(1);
}
