// 妖兽出没 (Hanli 2026-10-28: 「按你说的来」): one of the three cooldown events (rules/events.mjs). The pools of 后山 · 上山路
// (balance.json `events.yaoshou.pools`) hold a batch of `batch` fights (one since 2026-11-02, Hanli: 「降妖等也是, 都一局就可以了」); each fight settled there takes one; the last
// completes it and the next batch comes `every_h` hours later — from completion, never stacking. The day's first
// `full` batches pay in full, then play_pay.replay's falling share; the beast's own replay share still applies.
// Between batches the pool stands as a plain haunt since 2026-11-04 (`stands`, Hanli 「攒修为可以让玩家去后山打怪吧?」): a beast up,
// no batch on it, paid as any haunt's — the batch is the event's bonus, never the only fight there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { duel, look, move, playTo, reroll, yaoshou } from '../scripts/rules.mjs';
import { eventDone, eventShare } from '../scripts/rules/events.mjs';
import { yaoshouShare } from '../scripts/rules/yaoshou.mjs';
import { fightPlay, fightReplay } from '../scripts/rules/playpay.mjs';
import { placeOf, poolOf } from '../scripts/rules/world.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const EV = content.balance.events.yaoshou;
// The walk and the pool's deals read the local clock (dayKey, the hour): one fixed instant plays a different save and
// deals a different hand in another timezone — under CI's UTC the haunt test drew no winning line (red from 2026-10-31,
// green here at -03:00). The file runs on one clock wherever it runs: the zone it was written in.
process.env.TZ = 'America/Sao_Paulo';
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

test('declared in balance.json: 1.5 h, a batch of one fight, the first 2 a day in full, at 后山 and 上山路; a batch pays as one fight', () => {
  assert.equal(EV.fight_scale, Math.round((content.balance.master.events.yaoshou.batch_plays / EV.batch) * 10000) / 10000, 'derived (tools/master.mjs)');
  assert.ok(Math.abs(EV.fight_scale * EV.batch - 1) < 0.001);
  assert.deepEqual({ every_h: EV.every_h, batch: EV.batch, full: EV.full, fight_scale: EV.fight_scale }, { every_h: 1.5, batch: 1, full: 2, fight_scale: 1 }, 'Hanli 11-02: one fight a batch, paid as the whole batch was');
  assert.deepEqual([...EV.pools].sort(), ['songlin', 'yaoyuan-wai']);
  for (const id of ['houshan', 'shanlu']) assert.ok(EV.pools.includes(placeOf(content, id).has.pool), id);
});

test('a batch: its fights (one), won or lost, then the pool waits 1.5 h — shown as a wait — and a new batch comes', () => {
  let s = fresh(), now = PLAYED.now;
  const B = EV.batch;
  assert.deepEqual(encounter(s, now).batch, { event: 'yaoshou', left: B, of: B });
  // 换一只 still works inside a batch, and takes no slot.
  const r = reroll(s, content, at(now));
  if (r.result.ok) { s = r.state; assert.equal(encounter(s, now).batch.left, B); }
  for (let k = 0; k < B; k += 1) {
    if (k) assert.deepEqual(encounter(s, now).batch, { event: 'yaoshou', left: B - k, of: B });
    s = foughtOut(s, now);
  }
  // Done: the batch waits, on Look in the world's words — and the beast stands as a plain haunt meanwhile (`stands`).
  const plain = encounter(s, now);
  assert.ok(plain?.game && plain.batch === undefined, 'between batches: a plain haunt\'s beast, no batch on it');
  const lk = look(s, content, at(now));
  const w = lk.waits?.find(x => x.id === 'yaoshou');
  assert.deepEqual(w, { id: 'yaoshou', title: EV.title.zh, shut: EV.shut.zh, wait_min: 90 });
  assert.ok(!lk.waits.some(x => x.id === 'pool:houshan'), 'one row, the event\'s');
  assert.equal(lk.yaoshou.up, false);
  // 89 minutes on: still no batch. 90: a new batch.
  assert.equal(encounter(s, new Date(now.getTime() + 89 * MIN))?.batch, undefined);
  const later = new Date(now.getTime() + 90 * MIN);
  assert.deepEqual(encounter(s, later).batch, { event: 'yaoshou', left: B, of: B });
  assert.equal(look(s, content, at(later)).waits?.find(x => x.id === 'yaoshou'), undefined);
});

test('never stacks: away ten hours he finds one batch, not several; the wait outlasts midnight', () => {
  const s = fresh(), now = PLAYED.now;
  eventDone(s, 'yaoshou', now);
  assert.deepEqual(encounter(s, new Date(now.getTime() + 10 * HOUR)).batch, { event: 'yaoshou', left: EV.batch, of: EV.batch });
  // Completed at 23:30: at 00:30 it still waits (the cooldown is the event's, not the day's).
  const late = new Date('2026-10-21T23:30:00+08:00'), t = fresh();
  eventDone(t, 'yaoshou', late);
  assert.equal(encounter(t, new Date(late.getTime() + HOUR))?.batch, undefined);
  assert.ok(encounter(t, new Date(late.getTime() + 1.5 * HOUR))?.batch);
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
  // Between batches the fight is a plain haunt's (1); the next batch up pays its share.
  assert.equal(yaoshouShare(content, s, place, now), 1);
  assert.equal(yaoshouShare(content, s, place, new Date(now.getTime() + 1.5 * HOUR)), replay[2] * EV.fight_scale);
  // The beast's replay (playpay.mjs fightReplay) is untouched by the event.
  assert.equal(fightReplay(content, fresh(), 'chihu', now), 1);
});

test('a batch let go (`yaoshou skip`): the clock starts, the day\'s count of full batches does not move', () => {
  const s = fresh(), now = PLAYED.now;
  const out = yaoshou(s, content, at(now), { action: 'skip' });
  assert.equal(out.result.ok, true);
  assert.equal(out.result.wait_min, 90);
  assert.equal(encounter(out.state, now)?.batch, undefined, 'no batch; the haunt stands');
  assert.equal(out.state.events.yaoshou.n, 0, 'not counted as paid');
  assert.equal(yaoshou(out.state, content, at(now), { action: 'skip' }).result.refused, 'shut');
  assert.equal(yaoshou(out.state, content, at(now), { action: 'info' }).result.yaoshou.wait_min, 90);
});

test('a batch up, he elsewhere: one 主页 row says where (a tap walks there); standing at the pool, none', () => {
  const s = fresh(), now = PLAYED.now;
  const away = move(s, content, at(now), { place: 'waimen' });
  assert.equal(away.result.ok, true);
  const row = look(away.state, content, at(now)).home?.todo?.find(r => r.kind === 'yaoshou');
  assert.ok(row && row.left === EV.batch && row.place?.id, JSON.stringify(row));
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
  // A batch pays as one fight: each of its fights `fight_scale` of an ordinary win's 修为 — one fight a batch, the whole (playpay.mjs fightPlay).
  const xw = p => p.progress + (p.converted?.progress ?? 0), one = fightPlay(content, fresh());
  assert.ok(Math.abs(xw(first) - one * EV.fight_scale) <= 2, `${xw(first)} vs ${one} × ${EV.fight_scale}`);
  assert.ok(Math.abs(worth(third) - worth(first) * content.balance.play_pay.replay[1]) <= 2, `${worth(third)} vs ${worth(first)}`);
});

test('a save mid-batch from the batch of three (taken 1 or 2): its one fight still stands, and fighting it completes the batch', () => {
  const now = PLAYED.now;
  for (const taken of [1, 2]) {
    let s = fresh();
    s.events = { yaoshou: { taken } };
    assert.deepEqual(encounter(s, now).batch, { event: 'yaoshou', left: EV.batch, of: EV.batch }, `taken ${taken}`);
    assert.equal(look(s, content, at(now)).yaoshou.left, EV.batch);
    assert.ok(look(s, content, at(now)).tray?.some(e => e.id === 'yaoshou'), 'in the tray');
    s = foughtOut(s, now);
    assert.equal(encounter(s, now)?.batch, undefined, 'the batch done after the one fight');
  }
});

test('后山崖顶 and 上山路 stand (`stands`): between batches, and while a story scene stands at 后山, a beast is up — and the 目标 points at it', () => {
  for (const id of ['houshan', 'shanlu']) assert.equal(poolOf(content, placeOf(content, id)).stands, true, id);
  const t0 = new Date('2026-10-20T09:00:00+08:00');
  const out = playTo(content, newState(content, 'zh', t0), '09-suifeng', { now: t0 });
  const s = { ...out.state, place: 'houshan', stamina: 100, stamina_at: out.now.toISOString() };
  eventDone(s, 'yaoshou', out.now); // the batch just fought: the event waits 1.5 h
  const lk = look(s, content, at(out.now));
  assert.equal(lk.scene?.id, '09-suifeng', 'the story scene stands here');
  assert.ok(lk.place?.encounter?.game && !lk.place.encounter.batch, 'a plain haunt\'s beast');
  // The 主页's next act is the fight; the stage quest's work is 后山's — the beast here, or 周衡's 后山 hunt (「后山的野猪」) while open.
  assert.equal(lk.home?.next?.id, lk.place.encounter.game.id);
  const w = lk.stage_quest?.work;
  assert.ok(w?.place?.id === 'houshan' || (w?.titles ?? []).some(t => t.includes('后山')), JSON.stringify(w));
  // With no errand standing for it, the 目标 holds the fight itself.
  const bare = look({ ...s, quests: {}, book: [] }, content, at(out.now));
  if (bare.stage_quest?.work?.kind === 'beast') assert.ok((bare.agenda ?? []).some(a => a.group === 'goal' && a.id === bare.place.encounter.game.id), '目标 holds the fight');
});
