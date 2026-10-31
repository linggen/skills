// 兽潮's nights past the hand-made rows (rules/shouchao.mjs; Hanli 2026-10-28: 「后面新兽潮是否会到下一关, 还是同一关反复, 最好
// 不要反复」 · 「主力塔防放进兽潮」 · 「关卡要多, 最起码1个月不重复」 · 「改成1小时一次也行」): a month of hourly nights, every one a
// layout the save never held, the kits in turn, a 大妖 on the planned nights, a lost night the same night, the day's pay held.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { look, playTo, quest, task, win } from '../scripts/rules.mjs';
import { bossNight, shouchaoHosted, shouchaoRow, tideShare, tonight } from '../scripts/rules/shouchao.mjs';
import { TIDES } from '../scripts/games/tide.js';

const content = loadContent();
const T = content.tasks.tasks.find((t) => t.shouchao);
const C = T.shouchao, EV = content.balance.events.shouchao;
const START = new Date(2026, 9, 20, 9, 0);
const ctx = (now) => ({ now, quests: [] });
const HOUR = 3600_000;

const cache = new Map();
function at(target) {
  if (!cache.has(target)) {
    process.env.LINGJING_STAMINA_LIMIT = '0';
    try { cache.set(target, playTo(content, newState(content, 'zh', START), target, { now: START }).state); } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  }
  const s = structuredClone(cache.get(target));
  return { ...s, quests: { ...(s.quests ?? {}), 'guan-shouchao': { done_at: START.toISOString() } }, place: 'waimen', stamina: 100 };
}
function night(s, now, stars = 3) {
  const w = win(s, content, ctx(now), { id: T.id, stars });
  assert.ok(w.result.ok, `win: ${JSON.stringify(w.result)}`);
  const r = task(w.state, content, ctx(now), { action: 'done', id: T.id });
  assert.ok(r.result.ok, `done: ${JSON.stringify(r.result)}`);
  return r;
}
/* `count` hourly nights from a save, each won: what was dealt, in order. */
function run(s, count, from = new Date(2026, 10, 1, 0, 5)) {
  const out = [];
  let now = from;
  for (let i = 0; i < count; i += 1) {
    const t = tonight(content, s);
    out.push({ n: t.n, game: t.game, sig: t.sig, boss: t.boss, kinds: t.kinds });
    const r = night({ ...s, stamina: 100 }, now);
    s = r.state;
    now = new Date(now.getTime() + EV.every_h * HOUR + 60_000);
  }
  return { nights: out, state: s };
}

test('the task row: an hour\'s cooldown, the 主力 塔防 kits in turn, a 大妖 every 3rd night from night 4', () => {
  assert.equal(EV.every_h, 1);
  const main = (content.games?.games ?? []).filter((g) => g.group === 'tide' && g.mechanic === '塔防').map((g) => g.id);
  assert.deepEqual(C.rotation.map((k) => k.game).sort(), [...new Set(main)].sort(), 'the 游戏厅\'s 兽潮 塔防 boards (games.json group tide)');
  assert.ok(TIDES.shouqiang, 'every turning kit has its maker');
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => bossNight(C, n)), [4, 7, 10]);
});

test('240 hourly nights (10 days; tools/tide-prove.mjs walks 720): every layout distinct, the kits in turn, a 大妖 on the planned nights, beasts of his 回', () => {
  const s8 = at('09-qulao'); // 古八: every beast of the tide open
  const { nights } = run(s8, Number(process.env.TIDE_NIGHTS ?? 240));
  const sigs = nights.map((x) => x.sig);
  assert.equal(new Set(sigs).size, sigs.length, 'no layout twice');
  const turning = C.rotation.filter((k) => TIDES[k.game]).map((k) => k.game);
  const made = nights.filter((x) => !x.sig.startsWith(`${T.game}:`));
  if (turning.length > 1) for (let i = 1; i < made.length; i += 1) assert.notEqual(made[i].game, made[i - 1].game, `night ${made[i].n}: never the same kit running`);
  for (const g of turning) assert.ok(made.filter((x) => x.game === g).length >= made.length / turning.length * 0.8, `${g} comes its share`);
  // A 大妖 on the planned nights where a kit with 结印 can bring one (all of them at 古八), never on the others' made nights.
  const bossKit = turning.some((g) => TIDES[g].boss);
  for (const x of made) {
    if (bossKit && bossNight(C, x.n)) assert.ok(x.boss, `night ${x.n}: a 大妖`);
    if (!bossNight(C, x.n)) assert.ok(!x.boss, `night ${x.n}: no 大妖`);
  }
  const open = new Set(['yezhu', 'zheng', 'longzhi', 'qiuyu', 'heyu', 'qique']);
  assert.ok(nights.every((x) => x.kinds.every((k) => open.has(k))));
  // His save's arc (古五, rows 1–3 won): night 4 is the first 大妖's.
  const s5 = at('09-snow');
  const four = tonight(content, { ...s5, shouchao: { won: ['shouchao-1', 'shouchao-2', 'shouchao-3'], told: true } });
  assert.deepEqual([four.n, four.row?.id, four.boss], [4, 'shouchao-4', true]);
});

test('a lost night is the same night: nothing moves until it is won, whatever the hour or the day', () => {
  const { state } = run(at('09-qulao'), 6);
  const a = shouchaoRow(content, state, new Date(2026, 11, 1, 9, 0));
  const b = shouchaoRow(content, state, new Date(2026, 11, 4, 22, 0));
  assert.equal(a.night, 7);
  assert.deepEqual(a.deal, b.deal);
  assert.equal(a.game, b.game);
});

test('the day\'s pay: the first two nights in full, then a replay\'s falling share (100 · 50 · 10%)', () => {
  let s = at('09-qulao');
  const day = (h) => new Date(2026, 10, 3, h, 5);
  const shares = [], wealth = [];
  for (let h = 8; h < 13; h += 1) {
    shares.push(tideShare(content, s, day(h)));
    const r = night({ ...s, stamina: 100 }, day(h));
    wealth.push(r.result.paid.board?.wealth ?? 0);
    s = r.state;
  }
  assert.deepEqual(shares, [1, 1, 0.5, 0.1, 0.1]);
  assert.ok(wealth[2] < wealth[1] && wealth[3] < wealth[2], wealth.join());
  // The next day starts in full again.
  assert.equal(tideShare(content, s, new Date(2026, 10, 4, 8, 5)), 1);
});

test('one night at a time (Hanli 10-28: 「触发后如果用户不玩, 就不触发下一个」): idle 10 h → one night up; played → the next an hour on, never two', () => {
  let s = run(at('09-qulao'), 2).state;
  const played = new Date(s.events.shouchao.at);
  // Ten hours away: exactly one night waits — the next one, not ten.
  const back = new Date(played.getTime() + 10 * HOUR);
  const up = shouchaoRow(content, s, back);
  assert.equal(up.night, 3);
  assert.ok(up.deal && !up.wait_min, 'up, dealt');
  // Still the same one an hour later, and a day later: nights never stack while it waits.
  assert.equal(shouchaoRow(content, s, new Date(back.getTime() + 24 * HOUR)).night, 3);
  // Played: the next is an hour after it was played, not on the wall clock.
  s = night({ ...s, stamina: 100 }, back).state;
  const wait = shouchaoRow(content, s, new Date(back.getTime() + 30 * 60_000));
  assert.equal(wait.night, 3, 'the night just held');
  assert.equal(wait.wait_min, 30);
  assert.equal(wait.deal, undefined);
  const next = shouchaoRow(content, s, new Date(back.getTime() + HOUR));
  assert.equal(next.night, 4);
  assert.equal(shouchaoRow(content, s, new Date(back.getTime() + 5 * HOUR)).night, 4, 'still one');
});

test('the first night is the 执事堂\'s errand 「兽潮来袭 · 守后山」: up after 小周天, once; no hourly tide before it; a save with a night held skips it', () => {
  const Q = 'guan-shouchao', at0 = new Date(2026, 10, 2, 10, 0);
  const fresh = structuredClone(cache.get('09-qulao') ?? at('09-qulao'));
  let s = { ...structuredClone(cache.get('09-qulao')), stamina: 100 };
  delete s.quests?.[Q];
  assert.equal(content.quests.find((q) => q.id === Q)?.need[0].task, T.id);
  // Before it: no tide anywhere.
  for (const place of ['waimen', 'houshan', 'shanmen']) assert.deepEqual(shouchaoHosted(content, { ...s, place }, at0), {}, place);
  // Posted on the 执事堂's east wall.
  const offers = (st) => (look({ ...st, place: 'zhishi' }, content, ctx(at0)).offers ?? []).map((o) => o.id);
  assert.ok(offers(s).includes(Q), offers(s).join());
  // …never before 古四's 小周天.
  assert.ok(!offers(at('wm-zhoutian')).includes(Q) || !at('wm-zhoutian').done_scenes.includes('wm-zhoutian'));
  s = quest({ ...s, place: 'zhishi' }, content, ctx(at0), { action: 'take', id: Q }).state;
  assert.ok(s.quests[Q] && !s.quests[Q].done_at);
  // Taken: still no hourly tide; the board stands at the 后山 only, night 1.
  assert.deepEqual(shouchaoHosted(content, { ...s, place: 'waimen' }, at0), {});
  const row = (look({ ...s, place: 'houshan' }, content, ctx(at0)).tasks ?? []).find((t) => t.id === T.id);
  assert.ok(row && row.status === 'offered', 'the board at the 后山');
  assert.equal(row.deal.lv, 'shouchao-1');
  assert.match(row.title, /第1潮/);
  // Played there: the tide's first night held, the errand done.
  const w = win({ ...s, place: 'houshan' }, content, ctx(at0), { id: T.id, stars: 3 });
  assert.ok(w.result.ok, JSON.stringify(w.result));
  const r = task(w.state, content, ctx(at0), { action: 'done', id: T.id });
  assert.ok(r.result.ok, JSON.stringify(r.result));
  assert.equal(r.result.night, 1);
  s = r.state;
  assert.ok(s.quests[Q].done_at, 'the errand done');
  assert.equal(s.shouchao.n, 1);
  // Then the hourly tide: shut for an hour, then night 2 — and the errand never again.
  assert.deepEqual(shouchaoHosted(content, { ...s, place: 'waimen' }, new Date(at0.getTime() + 30 * 60_000)), {});
  assert.deepEqual(Object.keys(shouchaoHosted(content, { ...s, place: 'waimen' }, new Date(at0.getTime() + HOUR))), [T.id]);
  assert.equal(shouchaoRow(content, s, new Date(at0.getTime() + HOUR)).night, 2);
  assert.ok(!offers(s).includes(Q), 'once');
  // An old save with a night held (his: rows 1–3 won before the errand existed) never sees it, and its tide runs on.
  const old = { ...fresh, quests: {}, shouchao: { won: ['shouchao-1', 'shouchao-2'], told: true, at: '2026-10-28T14:00:00.000Z' } };
  assert.ok(!offers(old).includes(Q));
  assert.deepEqual(Object.keys(shouchaoHosted(content, { ...old, place: 'waimen' }, at0)), [T.id]);
});

test('兽潮 on rules/events.mjs: a save counted before keeps its clock and its day\'s count (shouchao.at · shouchao.day)', () => {
  const s = at('09-qulao');
  const counted = new Date(2026, 10, 3, 9, 30);
  const old = { ...s, events: { ...s.events }, shouchao: { ...(s.shouchao ?? {}), n: 2, told: true, at: counted.toISOString(), day: { key: dayKey(counted), count: 2 } } };
  delete old.events.shouchao;
  // Mid-cooldown: still shut half an hour on, up an hour on.
  assert.deepEqual(shouchaoHosted(content, old, new Date(counted.getTime() + 30 * 60_000)), {});
  assert.deepEqual(Object.keys(shouchaoHosted(content, old, new Date(counted.getTime() + HOUR + 60_000))), [T.id]);
  // The day's count carries: the third night of that day pays half.
  const later = new Date(counted.getTime() + HOUR + 60_000);
  assert.equal(tideShare(content, old, later), 0.5);
  const r = night({ ...old, stamina: 100 }, later);
  assert.ok(r.result.ok, JSON.stringify(r.result));
  assert.equal(r.result.share, 0.5);
  assert.deepEqual(r.state.events.shouchao, { at: later.toISOString(), day: dayKey(later), n: 3 });
  assert.ok(!('at' in r.state.shouchao) && !('day' in r.state.shouchao), 'the clock lives in one place');
});
