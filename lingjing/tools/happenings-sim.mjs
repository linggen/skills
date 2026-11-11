#!/usr/bin/env node
// tools/happenings-sim.mjs — 观里的事 over N days for a save at 练气八层 in 古八 (rules/happenings.mjs): he looks in at
// a few hours a day (--at, default 9,13,18,21), goes to every happening lit then and plays the game it deals. Prints how
// many distinct kinds were dealt, how often each, and the longest gap (in days) any kind went without being dealt.
// Usage: node tools/happenings-sim.mjs [--days 60] [--at 9,13,18,21] [--seed x] [--scene 09-laba]
//   --scene: a save played through the story to that scene (rules.mjs playTo) in place of the hand-built one.
import { loadContent } from '../scripts/content.mjs';
import { newState, threshold } from '../scripts/state.mjs';
import { happeningTray, stampHappening } from '../scripts/rules/happenings.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = Number(arg('days', 60)), HOURS = String(arg('at', '9,13,18,21')).split(',').map(Number);
const content = loadContent();
const T0 = new Date(2026, 10, 1, 0, 0);
const s0 = { ...newState(content, 'zh', T0), seed: arg('seed', 'sim'), chapter: '00-zhuji', scene: '09-shenshi', place: 'waimen', ended: ['00-prologue', '00-waimen'],
  done_scenes: ['09-futian', '09-dabi', '09-shenshi', '09-danfang'], tier: 'qi', step: 8, progress: 0, traits: ['wood', 'water', 'fire', 'earth', 'metal'] };
s0.progress = Math.floor(0.3 * threshold(content, s0));

const scene = arg('scene', null);
if (scene) process.env.LINGJING_STAMINA_LIMIT = '0';
let s = scene ? (await import('../scripts/rules.mjs')).playTo(content, newState(content, 'zh', T0), scene, { now: T0 }).state : s0;
if (scene) console.log(`a save played to ${scene}: ${s.tier} ${s.step}`);
const kindOf = id => content.tasks.tasks.find(t => t.id === id)?.game;
const dealt = {}, days = {}, perDay = [];
for (let d = 0; d < DAYS; d++) {
  let n = 0;
  for (const h of HOURS) {
    const now = new Date(T0.getFullYear(), T0.getMonth(), T0.getDate() + d, h, 20);
    for (const row of happeningTray(content, s, now, 'mac')) {
      const there = { ...s, place: row.at };
      const deal = happeningTray(content, there, now, 'mac').find(r => r.id === row.id);
      if (!deal?.task) continue;
      const next = structuredClone(there);
      stampHappening(content, there, next, 'task', { action: 'done', id: deal.task }, now);
      s = next; n++;
      const k = kindOf(deal.task);
      dealt[k] = (dealt[k] ?? 0) + 1;
      (days[k] ??= new Set()).add(d);
    }
  }
  perDay.push(n);
}
const gap = k => { const list = [...days[k]].sort((a, b) => a - b), all = [-1, ...list, DAYS]; let g = 0; for (let i = 1; i < all.length; i++) g = Math.max(g, all[i] - all[i - 1] - 1); return g; };
console.log(`${DAYS} days, looking in at ${HOURS.join(' · ')}: ${perDay.reduce((a, b) => a + b, 0)} games dealt (${(perDay.reduce((a, b) => a + b, 0) / DAYS).toFixed(1)} a day)`);
console.log(`distinct kinds: ${Object.keys(dealt).length}`);
for (const [k, n] of Object.entries(dealt).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${String(n).padStart(4)} dealt · on ${days[k].size} days · longest gap ${gap(k)} days`);
const once = new Set((content.happenings?.happenings ?? []).flatMap(h => h.deals.filter(d => d.once).map(d => kindOf(d.task))));
const kinds = Object.keys(dealt).filter(k => !once.has(k));
console.log(`longest gap of any kind: ${Math.max(...kinds.map(gap))} days (${[...once].join(' · ')} dealt once ever by design, left out)`);
