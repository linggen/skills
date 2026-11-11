// `cloud.ignore` (SKILL.md, skill-spec § Cloud) against what the game really writes: a save read again and again by
// the page, by Ling and by 银月, hours apart, moves no progress — so every top-level key those reads touch is either
// in the list or a key named here as a remaining source of false conflict copies (it mixes progress and stamps).
// Found 2026-11-10 by diffing a scratch save; this is that diff, kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { readIgnore } from '../tools/further.mjs';
import { TO_VALLEY, walk } from './prologue.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const T0 = new Date('2026-11-02T15:00:00');
const at = (m) => new Date(T0.getTime() + m * 60_000);
const IGNORE = JSON.parse(readIgnore(fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8')));
/* Written by a read, mixing progress and stamp in one key (or earned): left out of the list on purpose. A new key
   here is a new source of copies — fix it in the list, or say here why it stays. */
const REMAINING = new Set(['chance', 'been']);

const open = () => ({
  ...newState(content, 'zh', T0), name: '清玄', traits: ['wood', 'water', 'fire', 'earth'], tier: 'core', step: 0, progress: 100,
  chapter: '03-qing', scene: null, place: 'sishui', ended: ['00-prologue', '01-ji', '02-yan'], cards: ['qingteng', 'huodan', 'wulei', 'leiming'],
  bag: {}, stamina: 50, stamina_at: T0.toISOString(), updated: T0.toISOString(),
});

function reads(label, start) {
  test(`reading a ${label} save again, hours apart, writes only ignored keys`, () => {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-ignore-'));
    try {
      fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(start));
      const cli = (now, ...args) => spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, encoding: 'utf8',
        env: { ...process.env, LINGJING_STAMINA_LIMIT: '1', LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: now.toISOString() } });
      const saved = () => JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
      cli(at(0), 'look'); // a hand-made save is fitted to the world once; that is the save's, not a read's
      let prev = saved();
      const stray = new Set();
      let m = 0;
      for (const gap of [1, 40, 300, 1500]) {
        for (const verb of [['look'], ['look', '--for=ling'], ['look', '--for=yinyue'], ['tell']]) {
          m += gap;
          cli(at(m), ...verb);
          const cur = saved();
          for (const k of new Set([...Object.keys(prev), ...Object.keys(cur)])) {
            if (JSON.stringify(prev[k]) !== JSON.stringify(cur[k]) && !IGNORE.includes(k) && !REMAINING.has(k)) stray.add(k);
          }
          prev = cur;
        }
      }
      assert.deepEqual([...stray], [], 'a read wrote keys that are neither in cloud.ignore nor named as remaining');
    } finally { fs.rmSync(data, { recursive: true, force: true }); }
  });
}

reads('mid-game', open());
reads('early-story', walk(newState(content, 'zh', T0), TO_VALLEY, content, T0));
