// The System Overview: which cards, in what order, and whose hand wins.
// Run: node --test apple-shifu/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { overviewCards, orderCards, parseLayout, securityFromReadout } from '../scripts/overview.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const LAYOUT_SH = path.join(here, '../scripts/layout.sh');

const FULL = { total_gb: 1995.2, free_gb: 99.3 };
const ROOMY = { total_gb: 1000, free_gb: 400 };
const CLEAR = { safe_gb: 423.4, review_gb: 517, finished: '2026-09-23 14:56' };
const SEC = { checks: [{ label: 'SIP', status: 'green', detail: 'enabled' }, { label: 'Firewall', status: 'yellow', detail: 'off' }, { label: 'Gatekeeper', status: 'red', detail: 'disabled' }], passing: 1, total: 3 };

test('clearable leads by default; a full disk leads before it as a warning', () => {
  const quiet = overviewCards({ disk: ROOMY, clearable: CLEAR, backup: { count: 12 }, security: SEC });
  assert.deepEqual(orderCards(quiet).map((c) => c.id), ['clearable', 'backup', 'security']);
  const full = overviewCards({ disk: FULL, clearable: CLEAR, backup: null, security: SEC });
  assert.deepEqual(orderCards(full).map((c) => c.id), ['disk', 'clearable', 'security']);
  assert.match(full[0].title, /99\.3 GB free — 5% of 2\.0 TB/);
});

test('the clearable card opens the reviewed Clear flow with the safe figure', () => {
  const c = overviewCards({ clearable: CLEAR })[0];
  assert.equal(c.title, '423.4 GB safely');
  assert.deepEqual(c.action, { label: 'Review and clear', kind: 'clear' });
  assert.match(c.sub, /517\.0 GB more to review/);
});

test('nothing to say, no card: backed up, all checks green, nothing clearable', () => {
  const cards = overviewCards({
    disk: ROOMY, clearable: { safe_gb: 0, review_gb: 0 }, backup: { count: 0 },
    security: { checks: [{ label: 'SIP', status: 'green', detail: 'on' }], passing: 1, total: 1 },
  });
  assert.deepEqual(cards, []);
});

test('never scanned for clearables is said as a gap with a way to look', () => {
  const [c] = overviewCards({ clearable: null });
  assert.equal(c.title, 'Not looked for yet');
  assert.equal(c.action.kind, 'files');
});

test('security names the red gap first, and where to fix it', () => {
  const c = overviewCards({ security: SEC }).find((x) => x.id === 'security');
  assert.equal(c.title, 'Gatekeeper: disabled');
  assert.match(c.sub, /1 of 3 checks pass · System Settings/);
});

test('the agent leads; the user pins over it; a hide beats everything', () => {
  const cards = overviewCards({ disk: FULL, clearable: CLEAR, backup: { count: 3 }, security: SEC });
  assert.deepEqual(orderCards(cards, { lead: 'security' }).map((c) => c.id), ['disk', 'security', 'clearable', 'backup']);
  assert.deepEqual(orderCards(cards, { lead: 'security', pinned: 'backup' }).map((c) => c.id), ['backup', 'disk', 'security', 'clearable']);
  assert.deepEqual(orderCards(cards, { hidden: ['disk', 'clearable'] }).map((c) => c.id), ['backup', 'security']);
});

test('the layout file reads back', () => {
  assert.deepEqual(parseLayout('lead=backup\nwhy=Your roll is not backed up.\npinned=\nhidden=security,disk\n'),
    { lead: 'backup', why: 'Your roll is not backed up.', pinned: null, hidden: ['security', 'disk'] });
});

test('security rebuilds from the saved readout', () => {
  const s = securityFromReadout({ readings: [
    { group: 'Security', label: 'Gatekeeper', value: 'disabled', detail: 'Worth a look.' },
    { group: 'Security', label: 'Firewall', value: 'off', detail: 'Worth a look.' },
    { group: 'Security', label: 'SIP', value: 'enabled', detail: null },
  ] });
  assert.deepEqual(s.checks.map((c) => c.status), ['red', 'yellow', 'green']);
  assert.equal(s.passing, 1);
});

test('layout.sh: one writer — lead, pin, hide, show; placeholders and unknown cards refused', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'shifu-layout-'));
  const run = (...args) => spawnSync('bash', [LAYOUT_SH, ...args], { encoding: 'utf8', env: { ...process.env, SHIFU_DATA: data } });
  assert.equal(run('lead', 'backup', 'Nothing is backed up yet.').status, 0);
  let out = run('pin', 'security').stdout;
  assert.match(out, /pinned=security/);
  assert.match(out, /the user pinned security/);
  out = run('hide', 'security').stdout;
  assert.match(out, /pinned=\nhidden=security/);
  assert.equal(run('lead', '{{card}}', 'x').status, 2);
  assert.equal(run('lead', 'rm -rf', 'x').status, 2);
  out = run('show', 'all').stdout;
  assert.match(out, /hidden=\n/);
  assert.deepEqual(parseLayout(fs.readFileSync(path.join(data, 'layout.txt'), 'utf8')),
    { lead: 'backup', why: 'Nothing is backed up yet.', pinned: null, hidden: [] });
  fs.rmSync(data, { recursive: true, force: true });
});
