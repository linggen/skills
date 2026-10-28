// 妖兽出没 (Hanli 2026-10-28: 「按你说的来」): one of the three cooldown events (rules/events.mjs). The pools of 后山 · 上山路
// (balance.json `events.yaoshou.pools`) hold a batch of `batch` fights; each fight settled there takes one; the last
// completes it and the next batch comes `every_h` hours later — from completion, never stacking. The day's first
// `full` batches pay in full, then play_pay.replay's falling share; the beast's own replay share still applies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { duel, look, move, playTo, reroll, yaoshou } from '../scripts/rules.mjs';
import { eventDone, eventShare } from '../scripts/rules/events.mjs';
import { yaoshouShare } from '../scripts/rules/yaoshou.mjs';
import { fightPlay, fightReplay } from '../scripts/rules/playpay.mjs';
import { placeOf } from '../scripts/rules/world.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const EV = content.balance.events.yaoshou;
const MIN = 60_000, HOUR = 60 * MIN;
const at = now => ({ now, quests: [] });

/* 古四's 柴房 night behind him, standing at 后山崖顶 (the 药园外 pool). */
const PLAYED = (() => {
  const t0 = new Date('2026-10-20T09:00:00+08:00');
  const out = playTo(content, newState(content, 'zh', t0), 'wm-chaifang', { now: t0 });
  const m = move(out.state, content, at(out.now), { place: 'houshan' });
  assert.equal(m.result.ok, true, JSON.stringify(m.result).slice(0, 200));
  return { state: m.state, now: out.now };
})();
const fresh = () => structuredClone(PLAYED.state);
const encounter = (s, now) => look(s, content, at(now)).place?.encounter ?? null;
/* One fight at the pool, fought out and lost (every turn passed): a settle takes a slot, won or not. */
function foughtOut(s, now) {
  const e = encounter(s, now);
  assert.ok(e?.game, 'a beast stands');
  const st = duel(s, content, at(now), { id: e.game.id });
  assert.equal(st.result.ok, true, JSON.stringify(st.result).slice(0, 200));
  const end = duel(st.state, content, at(now), { id: e.game.id, picks: Array(300).fill('end').join(',') });
  assert.equal(end.result.ok, true, JSON.stringify(end.result).slice(0, 200));
  return end.state;
}

test('declared in balance.json: 1.5 h, a batch of 3, the first 2 a day in full, at 后山 and 上山路; a batch pays as one fight', () => {
  assert.equal(EV.fight_scale, Math.round((content.balance.master.events.yaoshou.batch_plays / EV.batch) * 10000) / 10000, 'derived (tools/master.mjs)');
  assert.ok(Math.abs(EV.fight_scale * EV.batch - 1) < 0.001);
  assert.deepEqual({ every_h: EV.every_h, batch: EV.batch, full: EV.full }, { every_h: 1.5, batch: 3, full: 2 });
  assert.deepEqual([...EV.pools].sort(), ['songlin', 'yaoyuan-wai']);
  for (const id of ['houshan', 'shanlu']) assert.ok(EV.pools.includes(placeOf(content, id).has.pool), id);
});

test('a batch: three fights, won or lost, then the pool waits 1.5 h — shown as a wait — and a new batch comes', () => {
  let s = fresh(), now = PLAYED.now;
  assert.deepEqual(encounter(s, now).batch, { event: 'yaoshou', left: 3, of: 3 });
  s = foughtOut(s, now);
  assert.deepEqual(encounter(s, now).batch, { event: 'yaoshou', left: 2, of: 3 });
  // 换一只 still works inside a batch, and takes no slot.
  const r = reroll(s, content, at(now));
  if (r.result.ok) { s = r.state; assert.equal(encounter(s, now).batch.left, 2); }
  s = foughtOut(s, now);
  s = foughtOut(s, now);
  // Done: no beast, the wait on Look in the world's words, the brief says when.
  assert.equal(encounter(s, now), null, 'the pool is quiet');
  const lk = look(s, content, at(now));
  const w = lk.waits?.find(x => x.id === 'yaoshou');
  assert.deepEqual(w, { id: 'yaoshou', title: EV.title.zh, shut: EV.shut.zh, wait_min: 90 });
  assert.ok(!lk.waits.some(x => x.id === 'pool:houshan'), 'one row, the event\'s');
  assert.equal(lk.yaoshou.up, false);
  assert.equal(reroll(s, content, at(now)).result.refused, 'resting');
  // 89 minutes on: still quiet. 90: a new batch of three.
  assert.equal(encounter(s, new Date(now.getTime() + 89 * MIN)), null);
  const later = new Date(now.getTime() + 90 * MIN);
  assert.deepEqual(encounter(s, later).batch, { event: 'yaoshou', left: 3, of: 3 });
  assert.equal(look(s, content, at(later)).waits?.find(x => x.id === 'yaoshou'), undefined);
});

test('never stacks: away ten hours he finds one batch of three, not six; the wait outlasts midnight', () => {
  const s = fresh(), now = PLAYED.now;
  eventDone(s, 'yaoshou', now);
  assert.deepEqual(encounter(s, new Date(now.getTime() + 10 * HOUR)).batch, { event: 'yaoshou', left: 3, of: 3 });
  // Completed at 23:30: at 00:30 it still waits (the cooldown is the event's, not the day's).
  const late = new Date('2026-10-21T23:30:00+08:00'), t = fresh();
  eventDone(t, 'yaoshou', late);
  assert.equal(encounter(t, new Date(late.getTime() + HOUR)), null);
  assert.ok(encounter(t, new Date(late.getTime() + 1.5 * HOUR)));
});

test('pay: the day\'s first two batches in full, then half, then a tenth; the beast\'s own replay share on top', () => {
  const s = fresh(), now = PLAYED.now, place = placeOf(content, 'houshan');
  const replay = content.balance.play_pay.replay;
  const shares = [];
  for (let b = 0; b < 5; b += 1) {
    shares.push(eventShare(content, s, 'yaoshou', now));
    eventDone(s, 'yaoshou', now);
  }
  assert.deepEqual(shares, [1, 1, replay[1], replay[2], replay[2]]);
  // A new day: full again.
  assert.equal(eventShare(content, s, 'yaoshou', new Date(now.getTime() + 24 * HOUR)), 1);
  // Elsewhere (蒙山's pool is no event's) the share is 1.
  assert.equal(yaoshouShare(content, s, placeOf(content, 'mengshan'), now), 1);
  assert.equal(yaoshouShare(content, s, place, now), replay[2] * EV.fight_scale);
  // The beast's replay (playpay.mjs fightReplay) is untouched by the event.
  assert.equal(fightReplay(content, fresh(), 'chihu', now), 1);
});

test('a batch let go (`yaoshou skip`): the clock starts, the day\'s count of full batches does not move', () => {
  const s = fresh(), now = PLAYED.now;
  const out = yaoshou(s, content, at(now), { action: 'skip' });
  assert.equal(out.result.ok, true);
  assert.equal(out.result.wait_min, 90);
  assert.equal(encounter(out.state, now), null);
  assert.equal(out.state.events.yaoshou.n, 0, 'not counted as paid');
  assert.equal(yaoshou(out.state, content, at(now), { action: 'skip' }).result.refused, 'shut');
  assert.equal(yaoshou(out.state, content, at(now), { action: 'info' }).result.yaoshou.wait_min, 90);
});

test('a batch up, he elsewhere: one 主页 row says where (a tap walks there); standing at the pool, none', () => {
  const s = fresh(), now = PLAYED.now;
  const away = move(s, content, at(now), { place: 'waimen' });
  assert.equal(away.result.ok, true);
  const row = look(away.state, content, at(now)).home?.todo?.find(r => r.kind === 'yaoshou');
  assert.ok(row && row.left === 3 && row.place?.id, JSON.stringify(row));
  assert.ok(!look(s, content, at(now)).home?.todo?.some(r => r.kind === 'yaoshou'), 'at the pool the fight is the stage\'s');
});

test('a win at the pool pays its haunt grant × the batch\'s share: the third batch of the day half the first', async () => {
  const { winningPicks } = await import('../scripts/rules/progress.mjs');
  const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
  const now = PLAYED.now;
  const paidAt = (n) => {
    const s = fresh();
    if (n) s.events = { yaoshou: { at: new Date(now.getTime() - 2 * HOUR).toISOString(), day: dayKey(now), n } };
    const e = encounter(s, now), st = duel(s, content, at(now), { id: e.game.id });
    const line = winningPicks(st.result.duel.setup, catalog);
    if (!line) return null;
    return duel(st.state, content, at(now), { id: e.game.id, picks: line.join(',') }).result.paid;
  };
  const first = paidAt(0), third = paidAt(2);
  if (!first || !third) assert.fail('no winning line'); // no winning line in this deal: the share itself is held above
  // At the layer's full mark the 修为 is paid as 灵石 (converted): count both.
  const worth = p => p.progress + p.wealth + (p.converted?.progress ?? 0);
  assert.ok(worth(first) > 0);
  // A batch pays as one fight: each of its fights a third of an ordinary win's 修为 (playpay.mjs fightPlay).
  const xw = p => p.progress + (p.converted?.progress ?? 0), one = fightPlay(content, fresh());
  assert.ok(Math.abs(xw(first) - one * EV.fight_scale) <= 2, `${xw(first)} vs ${one} × ${EV.fight_scale}`);
  assert.ok(Math.abs(worth(third) - worth(first) * content.balance.play_pay.replay[1]) <= 2, `${worth(third)} vs ${worth(first)}`);
});
