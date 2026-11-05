// 今日棋局, one at a time (Hanli 2026-11-04, the phone's list at 沉鼎观: seven boards he had not played, one a place, and
// more as the days turned — 「只有之前的玩了才发新的」). The plate (the 观's painted map) deals ONE practice board; it stays,
// day after day, until it is played — won, lost, put down (✕) or kept (留) — and only then is the next dealt. A board an
// errand asks for stays hosted where the errand puts it (rules/rotation.mjs plateDealt, tasks.mjs hostsNow).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { look, move, VERBS } from '../scripts/rules.mjs';

// Through the one door every host plays by (rules.mjs run · the phone's isolate): the gated verbs.
const task = (s, c, ctx, a) => VERBS.task(s, c, ctx, a);
const win = (s, c, ctx, a) => VERBS.win(s, c, ctx, a);
import { plateDealt, plateKey, poolToday } from '../scripts/rules/rotation.mjs';
import { allPlaces, placeOf } from '../scripts/rules/world.mjs';

const content = loadContent();
const NOW = new Date('2026-10-27T09:00:00-03:00');
const at = (d) => ({ now: new Date(NOW.getTime() + d * 864e5) });
const PLATE = plateKey(placeOf(content, 'cangjing'));

/* Inside the 观 with every place open, 体力 to spare, no errand held. */
function inside(place = 'cangjing', ctx = at(0)) {
  let s = playTo(content, newState(content, 'zh', NOW), 'wm-chaifang', { now: NOW, policy: 'skip' }).state;
  s = { ...s, tier: 'qi', step: 1, progress: 100, stamina: 150, stamina_at: ctx.now.toISOString() };
  const m = move(s, content, ctx, { place });
  assert.equal(m.result.ok, true, JSON.stringify(m.result));
  return { ...m.state, stamina: 150, stamina_at: ctx.now.toISOString() };
}
const listed = (s, ctx = at(0)) => (look(s, content, ctx).boards ?? []).flatMap((r) => r.games.map((g) => `${r.id}:${g.id}`));
/* Walk to the dealt board's place. */
function toDeal(s, ctx = at(0)) {
  const d = plateDealt(content, s, PLATE, ctx.now);
  const m = move(s, content, ctx, { place: d.at });
  assert.equal(m.result.ok, true, JSON.stringify(m.result));
  return { s: { ...m.state, stamina: 150 }, d };
}

test('the plate deals one board, not one a place: the list holds it alone', () => {
  const pools = allPlaces(content).filter((p) => plateKey(p) === PLATE && p.has?.games_pool);
  assert.ok(pools.length >= 5, 'the 观 has its pools');
  const s = inside();
  const d = plateDealt(content, s, PLATE, NOW);
  assert.deepEqual(listed(s), [`${d.at}:${d.game}`]);
});

test('unplayed, it stays as it is through the day turns — nothing new is dealt', () => {
  const s = inside();
  const first = listed(s);
  for (const d of [1, 2, 5]) assert.deepEqual(listed(s, at(d)), first, `day +${d}`);
});

test('played — won, lost, ✕, 留, or its own 跳过 — the next is dealt; the played one leaves the list', () => {
  const plays = {
    win: (s, d) => task(win(s, content, at(0), { id: d.game, stars: 3 }).state, content, at(0), { action: 'done', id: d.game }),
    lost: (s, d) => task(s, content, at(0), { action: 'lost', id: d.game }),
    leave: (s, d) => task(s, content, at(0), { action: 'leave', id: d.game }),
    keep: (s, d) => task(s, content, at(0), { action: 'keep', id: d.game }),
    own: (s, d) => win(s, content, at(0), { id: d.game, grade: 'skipped' }),
  };
  for (const [how, play] of Object.entries(plays)) {
    const { s, d } = toDeal(inside());
    const before = listed(s);
    assert.ok(look(s, content, at(0)).tasks.some((t) => t.id === d.game && t.practice), `${how}: it stands here as practice`);
    const r = play(s, d);
    assert.equal(r.result.ok, true, `${how}: ${JSON.stringify(r.result)}`);
    assert.ok(r.state, `${how}: the deal is written`);
    assert.equal(r.state.plate_deal[PLATE].n, 1, how);
    const after = listed(r.state);
    assert.equal(after.length, 1, how);
    assert.notDeepEqual(after, before, `${how}: a new one is dealt`);
  }
});

test('playing some other board, or the deal\'s board elsewhere off the deal, deals nothing', () => {
  const { s, d } = toDeal(inside());
  const r = task(s, content, at(0), { action: 'leave', id: 'no-such-board' });
  assert.equal((r.state ?? s).plate_deal, undefined);
  // A pool board not dealt is no practice where it would have stood by the day.
  const other = allPlaces(content).find((p) => plateKey(p) === PLATE && p.id !== d.at && poolToday(p, NOW).some((g) => g !== d.game && !(p.has.games ?? []).includes(g)));
  if (other) {
    const m = move(s, content, at(0), { place: other.id }).state;
    const g = poolToday(other, NOW).find((x) => x !== d.game);
    assert.equal(look(m, content, at(0)).tasks.some((t) => t.id === g && t.practice), false, `${other.id}'s ${g} waits for the deal`);
  }
});

test('a board an errand asks for stays hosted where the errand puts it, dealt or not', () => {
  // 晒经 (guan-cangjing-shai) asks for 华容道 at 藏经阁.
  const s0 = inside('cangjing');
  const s = { ...s0, quests: { ...s0.quests, 'guan-cangjing-shai': { took: '2026-10-27', have: {} } } };
  const row = look(s, content, at(0)).tasks.find((t) => t.id === 'huarong');
  assert.ok(row, 'the errand\'s board stands');
  assert.equal(row.practice, undefined, 'for the errand, not practice');
});

test('an older save with no deal reads its first; a deal at a place shut since moves on to one he can reach', () => {
  const s = inside();
  assert.equal(s.plate_deal, undefined);
  assert.equal(listed(s).length, 1);
  const bad = { ...s, plate_deal: { [PLATE]: { n: 3, at: 'no-such-place', game: 'pintu' } } };
  assert.equal(listed(bad).length, 1);
});
