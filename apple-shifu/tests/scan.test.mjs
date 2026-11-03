// scan.js — one command that gets no answer costs its own reading, never the
// whole scan (2026-11-03: one slow `du` threw past the channel's 30 s cap and
// every full rescan aborted). Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const asked = [];
/** The daemon as a fake: `du` of ~/Library gets no answer, the listing names
    two folders, everything else answers empty. */
globalThis.fetch = async (_path, init) => {
  const body = JSON.parse(init.body);
  asked.push({ body, headers: init.headers });
  const reply = (stdout) => ({ json: async () => ({ exit_code: 0, stdout, stderr: '' }) });
  if (body.command.includes('ls -1p ~')) return reply('Library/\nWork/\n');
  if (body.command.includes("'Library'")) throw new Error('Control channel request timeout (255 s)');
  if (body.command.includes("'Work'")) return reply('2048\t/Users/a/Work\n');
  if (body.command.startsWith('df -k')) return reply('Filesystem 1024-blocks Used Available Capacity Mounted\n/dev/disk3s5 1000000 500000 400000 56% /System/Volumes/Data\n');
  return reply('');
};
const { runScan, bash } = await import('../scripts/scan.js');

test('a full scan finishes when one folder gets no answer; that folder says why', async () => {
  const results = await runScan('full', null, () => {});
  const unmeasured = results.disk.unmeasured_dirs;
  assert.deepEqual(unmeasured.map((d) => d.path), ['~/Library']);
  assert.match(unmeasured[0].why, /no answer from Linggen/);
  assert.deepEqual(results.disk.top_dirs.map((d) => d.path), ['~/Work']);
  assert.ok(results.security && results.performance);
});

test("bash names its own budget to the channel; one with none declares none", async () => {
  asked.length = 0;
  await bash('du -sk x', null, 240_000);
  await bash('uptime', null);
  assert.equal(asked[0].headers['X-Linggen-Budget-Ms'], String(240_000 + 15_000));
  assert.equal(asked[1].headers['X-Linggen-Budget-Ms'], undefined);
});
