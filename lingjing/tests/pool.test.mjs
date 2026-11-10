// 小游戏池 and the 时辰 draw (Hanli 2026-11-02: 「可以, 按照你设计的做吧」; rules/pool.mjs): each 时辰 draws three of the
// pool's members, seeded by the save, the day and the 时辰; a member played leaves the row and rests its cooldown; the
// world's events and the story's boards are never drawn; 体力 spent, the row is one 闭关 card.
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo, VERBS } from '../scripts/rules.mjs';
import { PLAY_KINDS } from '../scripts/rules/aside.mjs';
import { BRANCH, DRAW, drawAt, drawPool as heldPool, pinHold, shichenOf } from '../scripts/rules/pool.mjs';
// The draw's mechanics are one 时辰's own (drawAt); what the row holds across 时辰s (heldPool, 2026-11-04) is tested below.
const drawPool = (c, s, rows, kinds, now) => drawAt(c, s, rows, kinds, shichenOf(now));
import { WORDS, trayHourChipHtml, trayHtml } from '../scripts/cards.js';

const content = loadContent();
const START = new Date(2026, 9, 20, 9, 0);
const AT = (h, m = 0) => new Date(2026, 9, 20, h, m);
const BASE = (() => {
  process.env.LINGJING_STAMINA_LIMIT = '0';
  try { return playTo(content, newState(content, 'zh', START), 'wm-yaoyuan', { now: START }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
})();
const at = (place, extra = {}) => ({ ...structuredClone(BASE), quests: { ...(BASE.quests ?? {}), 'guan-shouchao': { done_at: START.toISOString() } },
  place, stamina: 100, stamina_at: START.toISOString(), ...extra });
/* Look at `now`; a save that has played nothing is taken as begun in this 时辰, so it reads this 时辰's own draw (an unplayed
   draw waits from the 时辰 a save began in, pool.mjs drawPool — tested below). */
const lookAt = (s, now) => look(s.pool_played ? s : { ...s, created: now.toISOString() }, content, { now, quests: [] });

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
  assert.equal(t1.tray_hour.ends_min, undefined, 'no countdown: an unplayed game waits (2026-11-04)');
});

/* The row waits for him (Hanli 2026-11-04: 「冷却的小游戏」 — 「89 分后换」 changed it whether he had played it or not). */
test('an unplayed game stays as the 时辰s turn; once played, the next — and when all are, the next 时辰\'s draw', () => {
  const s = at('waimen'), pool = rows(8), first = (d) => d.drawn.find((x) => !x.played)?.id;
  const begun = { ...s, created: AT(13, 5).toISOString() };
  const shown = first(heldPool(content, begun, pool, FAKE, AT(13, 5)));
  for (const h of [15, 17, 21]) assert.equal(first(heldPool(content, begun, pool, FAKE, AT(h, 10))), shown, `${h}:10 — still ${shown}`);
  assert.equal(heldPool(content, begun, pool, FAKE, AT(17, 10)).held, true);
  // Played (at 15:20): the next of that same draw stands, through the 时辰s too.
  const one = { ...begun, pool_played: { [shown]: AT(15, 20).toISOString() } };
  const next = first(heldPool(content, one, pool, FAKE, AT(15, 30)));
  assert.ok(next && next !== shown);
  assert.equal(first(heldPool(content, one, pool, FAKE, AT(21, 10))), first(drawAt(content, one, pool, FAKE, shichenOf(AT(15, 20)))), 'the draw of his last play, waiting');
  // All of a draw played: the 时辰 he is in draws its own.
  const d = drawAt(content, begun, pool, FAKE, shichenOf(AT(13, 5)));
  const all = { ...begun, pool_played: Object.fromEntries(d.drawn.map((x, i) => [x.id, new Date(AT(13, 5).getTime() + (i + 1) * 60_000).toISOString()])) };
  assert.equal(heldPool(content, all, pool, FAKE, AT(13, 50)).drawn.every((x) => x.played), true, 'its own 时辰: all played');
  // …and then the draw of the 时辰 after it — held there in its turn, not the 时辰 he happens to look in.
  const after = shichenOf(shichenOf(AT(13, 5)).end);
  assert.deepEqual(ids(heldPool(content, all, pool, FAKE, AT(19, 10))), ids(drawAt(content, all, pool, FAKE, after)));
});

test('the hold (pool_hold): its game stands until it is itself played — another game played moves nothing', () => {
  const s = at('waimen'), pool = rows(8), sc = shichenOf(AT(13, 5));
  const d = drawAt(content, s, pool, FAKE, sc), [g0, g1, g2] = [...d.drawn].map((x) => x.id);
  // Held on the draw's SECOND game (as the row pinned it), the first unplayed: it is the second that stands.
  const held = { ...s, pool_hold: { draw: sc.start.toISOString(), game: g1 } };
  for (const t of [AT(13, 40), AT(17, 10), new Date(2026, 9, 22, 9, 10)]) assert.equal(heldPool(content, held, pool, FAKE, t).shown, g1, `${t}`);
  // Another game played (in the draw or not): still g1.
  const other = { ...held, pool_played: { [g2]: AT(15, 0).toISOString(), m7: AT(15, 5).toISOString() } };
  assert.equal(heldPool(content, other, pool, FAKE, AT(19, 10)).shown, g1);
  assert.equal(pinHold(other, held, { draw: AT(19, 0).toISOString(), game: 'mX' }), null, 'nothing to pin: the held game stands');
  // The held game played: the next unplayed of the same draw (g0 here), and the door pins it.
  const done = { ...other, pool_played: { ...other.pool_played, [g1]: AT(19, 20).toISOString() } };
  const after = heldPool(content, { ...done, pool_hold: { ...done.pool_hold, game: null } }, pool, FAKE, AT(19, 30));
  assert.equal(after.shown, g0);
  assert.deepEqual(pinHold(done, other, { draw: after.shichen.start.toISOString(), game: after.shown }), { draw: sc.start.toISOString(), game: g0 });
  // No hold yet: pinned once, from the row as it reads.
  assert.deepEqual(pinHold(s, s, { draw: sc.start.toISOString(), game: g0 }), { draw: sc.start.toISOString(), game: g0 });
});

test('the door pins the hold after a pool play, or once for a save with none (rules.mjs)', () => {
  const src = fs.readFileSync(new URL('../scripts/rules.mjs', import.meta.url), 'utf8');
  assert.match(src, /if \(!next\.pool_hold \|\| JSON\.stringify\(next\.pool_played \?\? null\) !== JSON\.stringify\(\(raw \?\? state\)\.pool_played \?\? null\)\)/);
  assert.match(src, /pinHold\(next, raw \?\? state, look\(next, content/);
});

test('✕ and 留 are plays: the door stamps them, so the row moves on (rules/locks.mjs played)', () => {
  const src = fs.readFileSync(new URL('../scripts/rules/aside.mjs', import.meta.url), 'utf8');
  assert.match(src, /\['done', 'lost', 'leave', 'skip', 'keep'\]\.includes\(args\.action\)/);
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
  // The row deals one at a time: first of its 时辰's three in some 时辰 of the week.
  assert.ok(Array.from({ length: 84 }, (_, i) => lookAt(opened, new Date(2026, 9, 20 + Math.floor(i / 12), 1 + 2 * (i % 12), 10)).tray ?? []).some(r => r.some(e => e.id === 'duizi')), 'in the row in some 时辰 once open');
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
  // The verb that plays it stamps the save (rules/locks.mjs gated): 饭桶 fed. 闭关 is no member (Hanli 11-09): never stamped.
  const sec = VERBS.seclude(s, content, { now: AT(13, 30), quests: [] }, { action: 'enter', focus: 'progress' });
  assert.equal(sec.result.ok, true, JSON.stringify(sec.result).slice(0, 200));
  assert.equal(sec.state.pool_played?.seclusion, undefined);
});

test('a hold whose draw and the 时辰 after it are all played walks on to a draw with a game unplayed (Hanli\'s phone 11-05 → 11-09: an empty row)', () => {
  const s = at('waimen'), pool = rows(8), sc = shichenOf(AT(13, 5));
  const d = drawAt(content, s, pool, FAKE, sc), after = shichenOf(sc.end);
  const a = drawAt(content, s, pool, FAKE, after);
  // Everything either draw holds played two days later: each reads all played (a play counts in every draw since its 时辰).
  const later = new Date(2026, 9, 22, 9, 30);
  const played = Object.fromEntries([...d.drawn, ...a.drawn].map((x, i) => [x.id, new Date(later.getTime() + i * 60_000).toISOString()]));
  const held = { ...s, pool_hold: { draw: sc.start.toISOString(), game: null }, pool_played: played };
  const now = new Date(2026, 9, 22, 13, 10), out = heldPool(content, held, pool, FAKE, now);
  assert.ok(out.shown, `a game stands (${JSON.stringify(out.drawn)})`);
  assert.ok(!played[out.shown], 'one not played');
  assert.ok(out.shichen.start > after.start && out.shichen.start <= shichenOf(now).start, 'a later draw, never past the present');
});

test('闭关 stands in 全部 all day, whatever the 时辰 draws; never in the strip (Hanli 11-09: 「手机上闭关不用放主页面常驻, 全部里有就行」)', () => {
  const s = at('waimen');
  for (let h = 1; h < 24; h += 2) {
    const l = lookAt(s, AT(h, 10));
    const row = (l.tray ?? []).find(e => e.id === 'seclusion');
    assert.ok(row?.standing, `${h}:10 in the tray as a standing row`);
    const item = (l.agenda ?? []).find(i => i.key === 'tray:seclusion');
    assert.ok(item && !item.tray, `${h}:10 in 全部, not the strip`);
  }
  assert.equal(PLAY_KINDS.find(k => k.kind === 'seclusion').pool, undefined, 'no 小游戏池 member');
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

test('the page: the 时辰 chip in the footer; 体力 spent, one 闭关 card; all three played, one line', () => {
  const w = WORDS.zh;
  // No title line over the row (Hanli 11-02: 「手边的棋局 这几个字去掉, 省点空间」): the 时辰 is a footer chip beside the sky.
  const chip = trayHourChipHtml({ words: w, look: { tray_hour: { i: 7, ends_min: 47, drawn: 3, played: 0 } } });
  // 「未时」 alone (Hanli 11-04: 「可以, 挪进清单」): the countdown is 事's heading and the tray card's mark now.
  assert.match(chip, />未时</);
  assert.doesNotMatch(chip, /\d/, 'no countdown on the footer');
  assert.match(chip, /title="申时换一批"/);
  assert.equal(trayHourChipHtml({ words: w, look: {} }), '');
  const full = new Date(Date.now() + 30 * 60_000).toISOString();
  const rest = trayHtml({ words: w, lang: 'zh', look: { tasks: [{ id: 'b1', kind: 'board', title: '一局', status: 'offered' }], stamina: { empty: true, full_at: full }, tray: [{ kind: 'fake', id: 'x', seg: 'open', act: 'open', opens: 'gear' }] } });
  assert.equal(rest.match(/class="card/g).length, 1, 'one card');
  // Spent outside 闭关 (no clock refills it, Hanli 11-02): what brings it back, one tap.
  assert.match(rest, /体力耗尽 · 闭关约 30 分钟回满/);
  assert.match(rest, /data-seclude-open[^>]*>闭关/);
  assert.match(rest, /data-gear[^>]*>喂饭桶/);
  // …inside one: the minutes left, and no second 闭关.
  const inside = trayHtml({ words: w, lang: 'zh', look: { tasks: [], seclusion: { focus: 'progress' }, stamina: { empty: true, full_at: full } } });
  assert.match(inside, /闭关中 · 约 30 分钟体力回满/);
  assert.doesNotMatch(inside, /data-seclude-open/);
  assert.doesNotMatch(trayHtml({ words: w, lang: 'zh', look: { tasks: [], stamina: { empty: true, off: true } } }), /体力耗尽|闭关中/, '体力 off: no rest card');
  const all = trayHtml({ words: w, lang: 'zh', look: { tasks: [], tray_hour: { i: 7, ends_min: 47, drawn: 3, played: 3 }, tray: [{ kind: 'pool', id: 'pool:x', title: 'x', wait_min: 30, seg: 'cool' }] } });
  assert.match(all, /这个时辰的都玩过了 · 申时再来/);
  assert.ok(all.indexOf('allplayed') < all.indexOf('data-wait'), 'before the cooldowns');
  assert.doesNotMatch(trayHtml({ words: w, lang: 'zh', look: { tasks: [], tray_hour: { i: 7, ends_min: 47, drawn: 3, played: 2 } } }), /都玩过了/);
  assert.match(trayHourChipHtml({ words: WORDS.en, look: { tray_hour: { i: 7, ends_min: 47 } } }), /title="New three at Monkey hour">Goat hour</);
});

test('a round under way stays in the row, 继续, through a reload and past its 时辰 — until it ends (本王考考你, 对对子)', () => {
  const s = at('waimen'), ctx = now => ({ now, quests: [] });
  const kaoOf = (st, now) => (lookAt(st, now).tray ?? []).find(e => e.id === 'kao');
  const begun = VERBS.kao(s, content, ctx(AT(19, 20)), { action: 'open' });
  assert.equal(begun.result.ok, true, JSON.stringify(begun.result).slice(0, 200));
  assert.ok(begun.state.pool_played?.kao, 'stamped as played');
  // A reload in the same 时辰: still there, resumable, holding its slot (not counted played).
  const same = kaoOf(begun.state, AT(19, 50));
  assert.equal(same?.resume, true, '继续 after a reload');
  assert.equal(same.act, 'open');
  const h = lookAt(begun.state, AT(19, 50)).tray_hour;
  assert.equal(h.played, 0, 'an open round is not played yet');
  // The next 时辰, inside its cooldown: still there while the round is open.
  assert.equal(kaoOf(begun.state, AT(21, 10))?.resume, true, 'past its 时辰');
  // The round ends (missed): played, out of the row.
  const over = VERBS.kao(begun.state, content, ctx(AT(19, 55)), { action: 'miss' });
  assert.equal(over.result.ok, true);
  assert.equal(kaoOf(over.state, AT(19, 58)), undefined, 'ended: out of the row');
  assert.equal(lookAt(over.state, AT(19, 58)).tray_hour.played, 1);
  // 对对子: a couplet set and not yet answered is a round under way too.
  const t = content.aigames.duizi.teachers[0];
  const d0 = { ...s, place: t.at, done_scenes: [...s.done_scenes, t.after] };
  const set = VERBS.duizi(d0, content, ctx(AT(13, 20)), { action: 'open' });
  assert.equal(set.result.ok, true, JSON.stringify(set.result).slice(0, 200));
  assert.ok(set.state.pool_played?.duizi);
  const duiziOf = (st, now) => (lookAt(st, now).tray ?? []).find(e => e.id === 'duizi');
  assert.equal(duiziOf(set.state, AT(14, 30))?.resume, true, '对对子 继续 after a reload');
  assert.equal(duiziOf(set.state, AT(15, 10))?.resume, true, '对对子 past its 时辰');
  const skipped = VERBS.duizi(set.state, content, ctx(AT(14, 40)), { action: 'skip' });
  assert.equal(skipped.result.ok, true, JSON.stringify(skipped.result).slice(0, 200));
  assert.equal(duiziOf(skipped.state, AT(14, 50)), undefined, 'skipped: out of the row');
});

test('the row deals the 时辰\'s three one at a time: the first not played, the next once it is (Hanli 11-02)', () => {
  const isMember = e => Boolean(PLAY_KINDS.find(k => k.kind === e.kind)?.pool?.row(e));
  const poolOf = (st, now) => (lookAt(st, now).tray ?? []).filter(isMember).map(e => e.id);
  let s = at('waimen');
  const seen = [];
  for (let n = 0; n < DRAW; n++) {
    const shown = poolOf(s, AT(9, 10 + 10 * n));
    assert.equal(shown.length, 1, `one at a time (${n}): ${shown}`);
    assert.ok(!seen.includes(shown[0]), 'the next, never one played');
    seen.push(shown[0]);
    s = { ...s, pool_played: { ...(s.pool_played ?? {}), [shown[0]]: AT(9, 15 + 10 * n).toISOString() } };
  }
  assert.deepEqual(poolOf(s, AT(10, 50)), [], 'all three played: none');
  assert.equal(lookAt(s, AT(10, 50)).tray_hour.played, DRAW);
  // The world's events stand beside, as before.
  assert.ok((lookAt(s, AT(10, 50)).tray ?? []).some(e => e.id === 'shouchao'));
  // The first left unplayed: the 时辰 ends, the next 时辰's draw begins with its own first — nothing piles up.
  const idle = at('waimen');
  assert.equal(poolOf(idle, AT(9, 10)).length, 1);
  assert.equal(poolOf(idle, AT(11, 10)).length, 1, 'the next 时辰: one, not two');
});
