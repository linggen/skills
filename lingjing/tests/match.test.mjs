// A pool's beast matched to him (rules/match.mjs; Hanli 2026-10-27: 「后山的难度可以按照玩家等级, 进度来安排吗, 等玩家强大后,
// 可以自动增加难度匹配吗? 最好是可以换一匹战斗对象」): of the beasts up at the pool, the one nearest the first-meeting
// band against his hand stands; a stronger hand meets stronger beasts; 「换一只」 is free once a visit, then 体力.
import test from 'node:test';
import assert from 'node:assert/strict';
import { begin, act, foeTurn } from '../scripts/battle.js';
import { duel, MATCH, pickStand, reroll, standFit } from '../scripts/rules.mjs';
import { encounterOf } from '../scripts/rules/world.mjs';
import { content, NOW, stateAt } from '../tools/story-fights.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const HANDS = {
  weak: { cards: ['niangbing', 'yijian', 'tuna', 'zheng'], wear: {} },
  mid: { cards: ['niangbing', 'yijian', 'tuna', 'zheng', 'caoren'], wear: { robe: 'grey-robe', weapon: 'old-bow' } },
  strong: { cards: ['niangbing', 'yijian', 'tuna', 'zheng', 'caoren', 'sanhuo', 'tieji', 'jixiao', 'mucao'], wear: { robe: 'grey-robe', weapon: 'old-bow' }, done: ['wm-diyilu'] },
};
function at(hand, extra = {}) {
  const h = HANDS[hand], s = stateAt('h05g');
  Object.assign(s, { cards: [...h.cards], wear: { ...h.wear }, place: 'houshan', scene: null, stamina: 100, stamina_at: NOW.toISOString(),
    done_scenes: [...(s.done_scenes ?? []), 'wm-zhoutian', 'wm-yaoyuan', ...(h.done ?? [])] }, extra);
  s.bag = { ...s.bag, 'grey-robe': 1, 'old-bow': 1 };
  delete s.fight;
  return s;
}
const standAt = s => s.duels?.['hunt:houshan']?.stand;

test('the pick: in the band first, one not met before one met, else the nearest; a beast too easy grows, at most ×1.3', () => {
  assert.equal(pickStand([{ cid: 'a', win: 0.9, met: false }, { cid: 'b', win: 0.5, met: true }, { cid: 'c', win: 0.45, met: false }]).cid, 'c');
  assert.equal(pickStand([{ cid: 'a', win: 0.1, met: false }, { cid: 'b', win: 0.3, met: true }]).cid, 'b', 'none in the band: the nearest');
  const grown = pickStand([{ cid: 'a', win: 0.95, met: false }]);
  assert.ok(grown.scale > 1 && grown.scale <= MATCH.grow_max, JSON.stringify(grown));
  assert.equal(pickStand([]), null);
});

test('weak, mid and strong hands each meet a beast of their measure, and the strong one a stronger beast than the weak', () => {
  const got = {};
  for (const hand of Object.keys(HANDS)) {
    const s = standFit(content, at(hand), NOW), st = standAt(s);
    assert.ok(st?.cid, hand);
    got[hand] = st;
    assert.equal(encounterOf(content, s, NOW).creature.id, st.cid, `${hand}: the beast that stands is the matched one`);
    assert.equal(standFit(content, s, NOW), s, `${hand}: kept while it holds — a Look costs nothing`);
  }
  assert.ok(got.mid.win >= MATCH.low && got.mid.win <= MATCH.high, `mid ${JSON.stringify(got.mid)}`);
  assert.ok(got.strong.win >= MATCH.low && (got.strong.win <= MATCH.high || got.strong.scale), `strong ${JSON.stringify(got.strong)}`);
  assert.ok(got.weak.win <= got.mid.win + 0.15, `the weak hand is not handed an easy win it cannot have: ${JSON.stringify(got)}`);
  // A new card is a new hand: the stand is chosen again.
  const s = standFit(content, at('mid'), NOW);
  const more = { ...s, cards: [...s.cards, 'sanhuo'] };
  assert.notEqual(standFit(content, more, NOW), more);
});

test('the matched beast is the one fought: its door and its settle find the same beast', () => {
  const s = standFit(content, at('mid'), NOW), id = encounterOf(content, s, NOW).game.id;
  const ctx = { now: NOW, quests: [] };
  const started = duel(s, content, ctx, { id });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
  const st = begin(started.result.duel.setup, catalog), picks = [];
  for (let g = 0; g < 400 && st.outcome === 'open'; g += 1) { if (st.whose === 'foe') { foeTurn(st); continue; } act(st, { kind: 'end' }, 'you'); picks.push('end'); }
  const r = duel(started.state, content, ctx, { id, picks: picks.join(',') });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  // After a fight the next beast stands (the record's count moved): chosen again, never the one just fought.
  const next = standFit(content, r.state, NOW);
  assert.ok(standAt(next) && standAt(next).cid !== id.slice(6), JSON.stringify(standAt(next)));
});

test('「换一只」: another of the fitting set, free once a visit, then 体力; never in a fight, never where no pool deals', () => {
  const s = standFit(content, at('mid'), NOW), ctx = { now: NOW, quests: [] };
  const first = reroll(s, content, ctx);
  assert.equal(first.result.ok, true, JSON.stringify(first.result));
  assert.equal(first.result.free, true);
  assert.notEqual(first.result.stands, standAt(s).cid);
  assert.equal(encounterOf(content, first.state, NOW).creature.id, first.result.stands);
  assert.deepEqual(encounterOf(content, first.state, NOW).reroll, { free: false, cost: content.rewards.stamina.cost.reroll });
  const second = reroll(first.state, content, ctx);
  assert.equal(second.result.ok, true);
  assert.equal(second.result.free, false);
  assert.equal(second.state.stamina, first.state.stamina - content.rewards.stamina.cost.reroll);
  assert.equal(reroll({ ...s, fight: { game: 'haunt:lang' } }, content, ctx).result.refused, 'in-a-fight');
  assert.equal(reroll({ ...s, place: 'zhishi' }, content, ctx).result.refused, 'no-pool');
});

/* A fight at the 后山 played out by the bot (`win`: a careful line, else passing every turn). */
function fightThere(s, now, win) {
  const ctx = { now, quests: [] }, id = encounterOf(content, s, now)?.game?.id;
  assert.ok(id, 'a beast stands');
  const started = duel(s, content, ctx, { id });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
  const st = begin(started.result.duel.setup, catalog), picks = [];
  for (let g = 0; g < 400 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const a = win ? lookahead(st, { deep: true }) : { kind: 'end' };
    act(st, a, 'you'); picks.push(tokenOf(a));
  }
  return duel(started.state, content, ctx, { id, picks: picks.join(',') });
}
import { lookahead } from '../scripts/fightline.js';
import { tokenOf } from '../scripts/battle.js';

test('妖兽出没 at the 后山 (2026-10-28): a batch of `events.yaoshou.batch` fights, won or lost, then the stretch rests `every_h`', () => {
  const ev = content.balance.events.yaoshou;
  let s = standFit(content, at('strong'), NOW), now = NOW;
  for (let k = 0; k < ev.batch; k += 1) {
    assert.ok(encounterOf(content, standFit(content, s, now), now), `after ${k} fight(s) of the batch a beast still stands`);
    now = new Date(now.getTime() + 60_000);
    s = fightThere(standFit(content, s, now), now, true).state;
  }
  assert.equal(encounterOf(content, s, now), null, 'the batch fought out: the stretch rests ' + JSON.stringify(s.events));
  const later = new Date(now.getTime() + ev.every_h * 3600_000 + 1000);
  assert.ok(encounterOf(content, standFit(content, s, later), later), 'the next batch');
});

test('the same beast beaten again the same day pays the play rules\' falling share (100 · 50 · 10%)', async () => {
  const { fightReplay, hauntPlayId } = await import('../scripts/rules/playpay.mjs');
  const s = at('mid');
  assert.equal(fightReplay(content, s, 'yezhu', NOW), 1);
  const once = { ...s, plays: { day: '2026-09-29', ids: { [hauntPlayId('yezhu')]: 1 } } };
  const twice = { ...s, plays: { day: '2026-09-29', ids: { [hauntPlayId('yezhu')]: 2 } } };
  const day = (await import('../scripts/state.mjs')).dayKey(NOW);
  for (const x of [once, twice]) x.plays.day = day;
  assert.equal(fightReplay(content, once, 'yezhu', NOW), 0.5);
  assert.equal(fightReplay(content, twice, 'yezhu', NOW), 0.1);
  assert.equal(fightReplay(content, twice, 'lang', NOW), 1, 'another beast pays whole');
});
