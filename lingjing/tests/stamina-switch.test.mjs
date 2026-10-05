// The 体力 switch (his, 2026-10-01: 「先不要用体力限制我们测试的时长.
// 体力限制游戏时长的设定, 可以以后加.」): played through the command, nothing
// spends 体力 and the pool stays full; the rules' own tests keep the pool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { settleStamina, staminaLimited } from '../scripts/state.mjs';

const NOW = new Date('2026-10-01T12:00:00Z');

test('the switch: LINGJING_STAMINA_LIMIT=0 or rewards.stamina.limit false turns 体力 off; anything else keeps it', () => {
  const content = loadContent();
  const was = process.env.LINGJING_STAMINA_LIMIT;
  try {
    process.env.LINGJING_STAMINA_LIMIT = '0';
    assert.equal(staminaLimited(content), false);
    const s = { stamina: 3, stamina_at: NOW.toISOString(), resting: true };
    settleStamina(content, s, NOW);
    assert.equal(s.stamina, content.rewards.stamina.max, 'off, the pool reads full');
    assert.equal(s.resting, undefined, 'off, there is no rest lock');
    process.env.LINGJING_STAMINA_LIMIT = '1';
    assert.equal(staminaLimited(content), true);
    assert.equal(staminaLimited({ rewards: { stamina: { limit: false } } }), false);
  } finally {
    if (was === undefined) delete process.env.LINGJING_STAMINA_LIMIT; else process.env.LINGJING_STAMINA_LIMIT = was;
  }
});

test('played through the command, 体力 is off by default: Look shows a full pool that is never empty', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-stamina-'));
  const rules = path.resolve(import.meta.dirname, '../scripts/rules.mjs');
  const env = { ...process.env, LINGJING_DATA: dir, LINGJING_NOW: NOW.toISOString() };
  delete env.LINGJING_STAMINA_LIMIT;
  try {
    const out = spawnSync(process.execPath, [rules, 'look'], { env, encoding: 'utf8' });
    const look = JSON.parse(out.stdout.trim().split('\n').pop());
    assert.equal(look.stamina?.now, look.stamina?.max);
    assert.equal(look.stamina?.empty, false);
    assert.equal(look.stamina?.off, true, 'off: Look says so, and the page shows no pool (Hanli, 2026-10-05)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the page draws no 体力 on the strip while it is off', () => {
  const page = fs.readFileSync(path.resolve(import.meta.dirname, '../scripts/lingjing.js'), 'utf8');
  assert.match(page, /if \(!q \|\| !q\.max \|\| q\.off\) return null;/);
});
