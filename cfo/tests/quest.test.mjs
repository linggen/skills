// CFO's quest facts: the menu, each chore's own done time, stamped through the
// same locked atomic write every CFO file takes — and nothing about money.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MENU, merged, stampQuest } from '../scripts/quest.js';

const NOW = new Date('2026-09-24T15:00:00Z');

// The page's /api/bash, run for real under a scratch HOME.
const scratch = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-quest-'));
  const runBash = async (cmd) => execFileSync('bash', ['-c', cmd], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  const file = path.join(home, '.linggen', 'quests', 'cfo.json');
  return { home, runBash, file, read: () => JSON.parse(fs.readFileSync(file, 'utf8')) };
};

test('every entry carries the protocol fields, and each pool chore is modest', () => {
  for (const m of MENU) {
    assert.match(m.id, /^cfo-/);
    assert.ok(['day', 'week'].includes(m.period), m.id);
    assert.ok(['mac', 'phone', 'both'].includes(m.device), m.id);
    assert.ok(m.reward >= 20 && m.reward <= 30 && m.stamina >= 10 && m.stamina <= 20, m.id);
    assert.ok(m.title.zh && m.title.en && m.open.startsWith('/apps/cfo/'), m.id);
  }
  const doc = merged(null, {});
  assert.equal(doc.app, 'cfo');
  assert.ok(doc.quests.every((q) => q.due === true && q.done_at === null));
});

test('a stamp sets its own done_at and keeps every other id, known or not', async () => {
  const s = scratch();
  fs.mkdirSync(path.dirname(s.file), { recursive: true });
  fs.writeFileSync(s.file, JSON.stringify({
    app: 'cfo',
    quests: [{ id: 'cfo-review', done_at: '2026-09-23T10:00:00.000Z' }, { id: 'someone-else', done_at: 'x' }],
  }));
  assert.equal(await stampQuest(s.runBash, 'cfo-import', { now: NOW }), true);
  const byId = Object.fromEntries(s.read().quests.map((q) => [q.id, q]));
  assert.equal(byId['cfo-import'].done_at, NOW.toISOString());
  assert.equal(byId['cfo-review'].done_at, '2026-09-23T10:00:00.000Z');
  assert.equal(byId['cfo-review'].reward, MENU.find((m) => m.id === 'cfo-review').reward, 'menu fields refreshed');
  assert.equal(byId['cfo-sort'].done_at, null);
  assert.deepEqual(byId['someone-else'], { id: 'someone-else', done_at: 'x' });
  const left = fs.readdirSync(path.dirname(s.file));
  assert.deepEqual(left, ['cfo.json'], 'no temp or lock left behind');
  fs.rmSync(s.home, { recursive: true, force: true });
});

test('a torn file is started again, an unknown id writes nothing', async () => {
  const s = scratch();
  assert.equal(await stampQuest(s.runBash, 'cfo-nope', { now: NOW }), false);
  assert.ok(!fs.existsSync(s.file));
  fs.mkdirSync(path.dirname(s.file), { recursive: true });
  fs.writeFileSync(s.file, '{"app":"cfo","que');
  await stampQuest(s.runBash, 'cfo-sort', { now: NOW });
  assert.equal(s.read().quests.find((q) => q.id === 'cfo-sort').done_at, NOW.toISOString());
  fs.rmSync(s.home, { recursive: true, force: true });
});

test('a failing shell is silent — the stamp resolves false, never throws', async () => {
  const broken = async () => { throw new Error('bash 500'); };
  assert.equal(await stampQuest(broken, 'cfo-review', { now: NOW }), false);
});

test('only the fact crosses — no amount, merchant or file', () => {
  const text = JSON.stringify(merged(null, { 'cfo-import': NOW.toISOString() }));
  for (const leak of ['amount', 'merchant', 'csv', 'pdf', 'balance', 'category"']) assert.ok(!text.includes(leak), leak);
});
