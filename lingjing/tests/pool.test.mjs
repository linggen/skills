// 小游戏池 and the 时辰 draw (Hanli 2026-11-02: 「可以, 按照你设计的做吧」; rules/pool.mjs): each 时辰 draws three of the
// pool's members, seeded by the save, the day and the 时辰; a member played leaves the row and rests its cooldown; the
// world's events and the story's boards are never drawn; 体力 spent, the row is one 闭关 card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo, VERBS } from '../scripts/rules.mjs';
import { PLAY_KINDS } from '../scripts/rules/aside.mjs';
import { BRANCH, DRAW, drawPool, shichenOf } from '../scripts/rules/pool.mjs';
import { WORDS, trayHeadHtml, trayHtml } from '../scripts/cards.js';

const content = loadContent();
const START = new Date(2026, 9, 20, 9, 0);
const AT = (h, m = 0) => new Date(2026, 9, 20, h, m);
const BASE = (() => {
  process.env.LINGJING_STAMINA_LIMIT = '0';
  try { return playTo(content, newState(content, 'zh', START), 'wm-yaoyuan', { now: START }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
})();
const at = (place, extra = {}) => ({ ...structuredClone(BASE), quests: { ...(BASE.quests ?? {}), 'guan-shouchao': { done_at: START.toISOString() } },
  place, stamina: 100, stamina_at: START.toISOString(), ...extra });
const lookAt = (s, now) => look(s, content, { now, quests: [] });

/* A pool of eight made-up members (one kind), to ask the draw alone. */
const FAKE = [{ kind: 'fake', pool: { row: e => ({ cooldown_min: e.cd ?? 60, when: e.when ?? [] }) } }];
const rows = (n, f = () => ({})) => Array.from({ length: n }, (_, i) => ({ kind: 'fake', id: `m${i}`, seg: 'open', ...f(i) }));
const ids = d => d.drawn.map(e => e.id).sort();

test('the 时辰: two hours of the local clock, 子 from 23:00 (the next day\'s), 未 13–15', () => {
  assert.equal(shichenOf(AT(13, 5)).i, 7);
  assert.equal(shichenOf(AT(14, 59)).i, 7);
  assert.equal(shichenOf(AT(15, 0)).i, 8);
  assert.equal(+shichenOf(AT(14, 10)).start, +AT(13));
  assert.equal(+shichenOf(AT(14, 10)).end, +AT(15));
  const zi = shichenOf(AT(23, 30));
  assert.equal(zi.i, 0);
  assert.equal(zi.day, shichenOf(new Date(2026, 9, 21, 0, 30)).day, '23:30 and 00:30 are one 子时');
});

test('the draw is the 时辰\'s: the same three all through it, on every reload; another 时辰, another draw', () => {
  const s = at('waimen'), pool = rows(8);
  const a = drawPool(content, s, pool, FAKE, AT(13, 5)), b = drawPool(content, s, pool, FAKE, AT(14, 55));
  assert.equal(a.drawn.length, DRAW);
  assert.deepEqual(ids(a), ids(b));
  assert.deepEqual(ids(a), ids(drawPool(content, structuredClone(s), [...pool].reverse(), FAKE, AT(13, 40))), 'order of the pool never matters');
  const hours = new Set(Array.from({ length: 12 }, (_, i) => ids(drawPool(content, s, pool, FAKE, AT(1 + 2 * i, 10))).join()));
  assert.ok(hours.size > 3, `the hours draw differently (${hours.size})`);
  // Another save, another draw (seeded by the save).
  const other = { ...s, name: '阿禾', seed: 'x-other' };
  const days = Array.from({ length: 12 }, (_, i) => ids(drawPool(content, other, pool, FAKE, AT(1 + 2 * i, 10))).join() === ids(drawPool(content, s, pool, FAKE, AT(1 + 2 * i, 10))).join());
  assert.ok(days.includes(false));
  // Through the rules: Look's tray is the same within the 时辰.
  const t1 = lookAt(s, AT(13, 5)), t2 = lookAt(s, AT(14, 50));
  assert.deepEqual((t1.tray ?? []).map(e => e.id), (t2.tray ?? []).map(e => e.id));
  assert.equal(t1.tray_hour.i, 7);
  assert.equal(t1.tray_hour.ends_min, 115);
});

test('weights: the 时辰\'s lean, where he stands and not played lately count; a gate is the entry itself', () => {
  const s = at('waimen');
  const count = (pool, pick) => { let n = 0; for (let d = 1; d <= 28; d++) for (const h of [1, 13]) if (drawPool(content, s, pool, FAKE, new Date(2026, 9, d, h, 10)).drawn.some(e => e.id === pick)) n++; return n; };
  // A member leaning to 未 is drawn more often at 未 than its twin that leans nowhere.
  const lean = rows(8, i => (i === 0 ? { when: [BRANCH[7]] } : {}));
  const atWei = (pool, id) => { let n = 0; for (let d = 1; d <= 60; d++) if (drawPool(content, s, pool, FAKE, new Date(2026, 9, 1 + (d % 28), 13, 10 + (d >> 5))).drawn.some(e => e.id === id)) n++; return n; };
  assert.ok(atWei(lean, 'm0') > atWei(rows(8), 'm0'), 'the lean weighs');
  // Where he stands: a member here beats one off the map.
  const placed = rows(8, i => ({ places: [i === 0 ? 'waimen' : 'sishui'] }));
  assert.ok(count(placed, 'm0') > count(placed, 'm1'));
  // Not played lately: one played two days ago is drawn more than one played a few hours past its cooldown.
  const lately = { ...s, pool_played: { m1: new Date(2026, 9, 18).toISOString() } };
  const recent = { ...s, pool_played: { m1: AT(4).toISOString() } };
  let fresh = 0, stale = 0;
  for (let d = 1; d <= 28; d++) {
    const now = new Date(2026, 9, 20, 13, d);
    if (drawPool(content, { ...lately, seed: `s${d}` }, rows(8), FAKE, now).drawn.some(e => e.id === 'm1')) fresh++;
    if (drawPool(content, { ...recent, seed: `s${d}` }, rows(8), FAKE, now).drawn.some(e => e.id === 'm1')) stale++;
  }
  assert.ok(fresh >= stale, `${fresh} vs ${stale}`);
  // Gated by the story: 对对子 is never in the pool before its scene.
  const t = content.aigames.duizi.teachers[0];
  for (let h = 1; h < 24; h += 2) assert.ok(!(lookAt(s, AT(h, 10)).tray ?? []).some(e => e.id === 'duizi'));
  const opened = { ...s, done_scenes: [...s.done_scenes, t.after] };
  assert.ok(Array.from({ length: 12 }, (_, i) => lookAt(opened, AT(1 + 2 * i, 10)).tray ?? []).some(r => r.some(e => e.id === 'duizi')), 'drawn in some 时辰 once open');
});

test('played: out of the row for the rest of its 时辰, the others unmoved; back in the pool only after its cooldown', () => {
  const s = at('waimen'), pool = rows(8, () => ({ cd: 360 }));
  const a = drawPool(content, s, pool, FAKE, AT(13, 5));
  const first = a.drawn[0].id;
  const played = { ...s, pool_played: { [first]: AT(13, 20).toISOString() } };
  const b = drawPool(content, played, pool, FAKE, AT(13, 40));
  assert.deepEqual(ids(b), ids(a), 'the 时辰\'s three stand: no other dealt in its stead');
  assert.equal(b.drawn.find(e => e.id === first).played, true);
  // Inside the cooldown, later 时辰 never draw it; past it, it is in the pool again.
  for (let h = 15; h < 19; h += 2) assert.ok(!drawPool(content, played, pool, FAKE, AT(h, 10)).drawn.some(e => e.id === first), `${h}:10`);
  assert.ok(Array.from({ length: 30 }, (_, d) => drawPool(content, played, pool, FAKE, new Date(2026, 9, 21 + d, 9, 10)).drawn.some(e => e.id === first)).some(Boolean), 'back after the cooldown');
  // The verb that plays it stamps the save (rules/locks.mjs gated): 闭关 entered.
  const sec = VERBS.seclude(s, content, { now: AT(13, 30), quests: [] }, { action: 'enter', focus: 'progress' });
  assert.equal(sec.result.ok, true, JSON.stringify(sec.result).slice(0, 200));
  assert.equal(sec.state.pool_played?.seclusion, AT(13, 30).toISOString());
});

test('the world\'s events and 问卦 are never drawn: they keep their own clocks, in the row as before', () => {
  for (const kind of ['tide', 'yaoshou', 'mijing', 'chance', 'visitor', 'pool']) assert.equal(PLAY_KINDS.find(k => k.kind === kind).pool, undefined, kind);
  const her = PLAY_KINDS.find(k => k.kind === 'her').pool;
  assert.equal(her.row({ id: 'divine' }), null, '问卦 stays once a day, fixed');
  assert.ok(her.row({ id: 'duizi' }) && her.row({ id: 'kao' }));
  const s = at('waimen');
  for (let h = 1; h < 24; h += 2) {
    const tray = lookAt(s, AT(h, 10)).tray ?? [];
    assert.ok(tray.some(e => e.id === 'shouchao'), `兽潮 at ${h}:10`);
    assert.ok(tray.some(e => e.id === 'divine'), `问卦 at ${h}:10`);
    const drawnHere = tray.filter(e => PLAY_KINDS.find(k => k.kind === e.kind)?.pool?.row(e));
    assert.ok(drawnHere.length <= DRAW, `${h}:10: ${drawnHere.map(e => e.id)}`);
  }
});

test('the page: the head with the 时辰 and the next; 体力 spent, one 闭关 card; all three played, one line', () => {
  const w = WORDS.zh;
  const head = trayHeadHtml({ words: w, look: { tray_hour: { i: 7, ends_min: 47, drawn: 3, played: 0 } } });
  assert.match(head, /手边的棋局 · 未时/);
  assert.match(head, /申时换一批 · 47 分/);
  assert.equal(trayHeadHtml({ words: w, look: {} }), w.tray);
  const full = new Date(Date.now() + 30 * 60_000).toISOString();
  const rest = trayHtml({ words: w, lang: 'zh', look: { tasks: [{ id: 'b1', kind: 'board', title: '一局', status: 'offered' }], stamina: { empty: true, full_at: full }, tray: [{ kind: 'fake', id: 'x', seg: 'open', act: 'open', opens: 'gear' }] } });
  assert.equal(rest.match(/class="card/g).length, 1, 'one card');
  assert.match(rest, /闭关中 · 约 30 分钟体力回满/);
  assert.match(rest, /data-seclude-open[^>]*>起炉/);
  assert.match(rest, /data-gear[^>]*>喂饭桶/);
  assert.doesNotMatch(trayHtml({ words: w, lang: 'zh', look: { tasks: [], stamina: { empty: true, off: true } } }), /闭关中/, '体力 off: no rest card');
  const all = trayHtml({ words: w, lang: 'zh', look: { tasks: [], tray_hour: { i: 7, ends_min: 47, drawn: 3, played: 3 }, tray: [{ kind: 'pool', id: 'pool:x', title: 'x', wait_min: 30, seg: 'cool' }] } });
  assert.match(all, /这个时辰的都玩过了 · 申时再来/);
  assert.ok(all.indexOf('allplayed') < all.indexOf('data-wait'), 'before the cooldowns');
  assert.doesNotMatch(trayHtml({ words: w, lang: 'zh', look: { tasks: [], tray_hour: { i: 7, ends_min: 47, drawn: 3, played: 2 } } }), /都玩过了/);
  assert.match(trayHeadHtml({ words: WORDS.en, look: { tray_hour: { i: 7, ends_min: 47 } } }), /Goat hour.*Monkey hour · 47 min/);
});
