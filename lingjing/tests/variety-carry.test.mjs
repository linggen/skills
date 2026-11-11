// 变着花样 carried on the result (Hanli 2026-11-10's design; rules/locks.mjs `played` → happenings.mjs varietyAfter): EVERY
// path that can pay it — a board played again, 兽潮, 切磋, a card duel at a haunt, the 妖兽 wave — carries it in the one field
// `result.variety = { kinds, at, paid }`, once (the page and the phone both read that field and nothing else).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { playTo, VERBS } from '../scripts/rules.mjs';
import { pay } from '../scripts/rules/core.mjs';
import { kindOf, varietyAfter } from '../scripts/rules/happenings.mjs';
import { WORDS } from '../scripts/cards.js';

const content = loadContent();
const ctx = (now) => ({ now, quests: [] });
const TIDE = content.tasks.tasks.find((t) => t.shouchao), BOUT = content.tasks.tasks.find((t) => t.qiecuo);
const WAVE = content.happenings.forms.yaoshou.wave.task;
const START = new Date(2026, 9, 20, 9, 0);
/* A save played to a scene, with two other kinds already played today (the next distinct kind is the third). */
function twoKinds(target, now, place, extra = {}) {
  process.env.LINGJING_STAMINA_LIMIT = '0';
  let s;
  try { s = playTo(content, newState(content, 'zh', START), target, { now: START }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  return { ...structuredClone(s), place, stamina: 100, stamina_at: now.toISOString(), variety: { day: dayKey(now), kinds: ['__one', '__two'], paid: [] }, ...extra };
}
const played = (s, now, id, stars = 3) => {
  const w = VERBS.win(s, content, ctx(now), { id, stars });
  assert.ok(w.result.ok, JSON.stringify(w.result));
  const d = VERBS.task(w.state, content, ctx(now), { action: 'done', id });
  assert.ok(d.result.ok, JSON.stringify(d.result));
  return d;
};
const carried = (r, kinds) => {
  assert.equal(r.variety?.kinds, kinds, `variety.kinds: ${JSON.stringify(r.variety)}`);
  assert.ok(r.variety.paid?.progress > 0, `variety.paid: ${JSON.stringify(r.variety)}`);
};

test('兽潮: the third kind played carries variety.paid on the night\'s result — once', () => {
  const now = new Date(2026, 9, 20, 17, 30), s = twoKinds('wm-yaoyuan', now, 'waimen', { quests: { 'guan-shouchao': { done_at: START.toISOString() } } });
  const d = played(s, now, TIDE.id);
  carried(d.result, 3);
  assert.deepEqual(d.state.variety.kinds, ['__one', '__two', kindOf(TIDE)]);
  assert.ok(d.result.paid?.progress > 0, 'the night\'s own pay stays apart from it');
});

test('切磋: the bout counted carries variety.paid; the same kind again the same day carries nothing', () => {
  const T0 = new Date(2026, 9, 28, 9, 0), s = twoKinds('wm-baishi', T0, 'yanwu');
  const d = played(s, T0, BOUT.id);
  carried(d.result, 3);
  assert.equal(varietyAfter(content, d.state, structuredClone(d.state), 'task', { action: 'done', id: BOUT.id }, { ok: true }, ctx(T0), pay), null, 'a kind counts once a day');
});

test('a card duel at a haunt and the 妖兽 wave: the one field, the third kind pays, the fifth another', () => {
  const now = new Date(2026, 9, 20, 17, 30), c = ctx(now);
  const base = twoKinds('wm-baishi', now, 'yanwu');
  const next = structuredClone(base);
  const duel = varietyAfter(content, base, next, 'duel', { id: 'haunt:zheng', picks: 'a,b' }, { ok: true, outcome: 'lost' }, c, pay);
  assert.equal(duel?.kinds, 3, 'a duel fought at a haunt is a kind, won or lost');
  assert.ok(duel.paid?.progress > 0);
  const wave = varietyAfter(content, base, structuredClone(base), 'task', { action: 'done', id: WAVE }, { ok: true }, c, pay);
  assert.equal(wave?.kinds, 3, 'the wave is a kind of its own');
  assert.ok(wave.paid?.progress > 0);
  assert.equal(varietyAfter(content, next, structuredClone(next), 'duel', { id: 'haunt:zheng', picks: 'a' }, { ok: true, outcome: 'won' }, c, pay), null, 'the same kind again: nothing');
});

test('the Mac page reads that one field wherever the play\'s own pay shows: board done, a fight\'s 所得, a bout lost', () => {
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const body = (name) => page.slice(page.indexOf(`function ${name}(`), page.indexOf('\n}\n', page.indexOf(`function ${name}(`)));
  assert.match(page, /const varietyOwed = \(r\) =>/);
  assert.match(WORDS.zh.varietyPaid, /第\{n\}种 \+\{p\} 修为/);
  for (const fn of ['payWin', 'settleBout', 'writeLost']) assert.match(body(fn), /varietyOwed\(/, `${fn} shows 变着花样`);
  assert.equal((page.match(/varietyOwed\(/g) ?? []).length, 3, 'three settle points (a win, a fight, a loss) — never twice for one settle');
  assert.match(body('onOnceLost'), /writeLost\(/, 'a bout lost goes through the one loss path');
  assert.equal((page.match(/write\('task', \{ action: 'lost'/g) ?? []).length, 1, 'only writeLost writes a loss');
  assert.match(WORDS.zh.varietyPaid, /变着花样/);
  assert.match(WORDS.en.varietyPaid, /Variety/);
});
