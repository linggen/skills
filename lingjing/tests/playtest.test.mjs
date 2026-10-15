// The playtest crawler's fast half (the page's is tools/playtest.mjs): 卷一 walked by the rules
// alone — every scene reached, every exit taken, a way on standing at each step, nothing forced
// that a player could not do — and every card kind the stage can hold given a place to stand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import * as stage from '../scripts/stage.mjs';
import { crawlRules, JUAN_ONE } from './crawl.mjs';

const { CARD_KINDS, HEADER, MAIN, PAGE_OWNS, cardHoldsWay, stageSlots } = stage;
/* Kinds that stand outside main: the header's, and the 事 book's (the goal, stage.mjs BOOK). */
const ASIDE = [...HEADER, ...(stage.BOOK ?? [])];

const content = loadContent();

test('卷一 from a fresh save: every scene reached, every exit taken, a way on at every step', () => {
  const r = crawlRules(content);
  const scenes = JUAN_ONE.flatMap((ch) => Object.keys(content.chapters[ch].scenes).map((id) => `${ch}/${id}`));
  const exits = JUAN_ONE.flatMap((ch) => Object.values(content.chapters[ch].scenes).flatMap((s) => s.exits.map((e) => `${s.id}:${e.id}`)));
  assert.deepEqual(scenes.filter((id) => !r.scenes.has(id)), [], 'scenes never reached');
  assert.deepEqual(exits.filter((id) => !r.exits.has(id)), [], 'exits never taken');
  assert.deepEqual(r.findings, [], 'stalls on the way');
  assert.deepEqual(r.forced, [], 'steps the walk had to force — a road no earlier step opens');
});

test('卷一 skipping every board (Hanli, 2026-10-15: 「对游戏进展要确保没有影响」): every scene reached, every exit taken, nothing forced', () => {
  const r = crawlRules(content, { boards: 'skip' });
  const scenes = JUAN_ONE.flatMap((ch) => Object.keys(content.chapters[ch].scenes).map((id) => `${ch}/${id}`));
  const exits = JUAN_ONE.flatMap((ch) => Object.values(content.chapters[ch].scenes).flatMap((s) => s.exits.map((e) => `${s.id}:${e.id}`)));
  assert.deepEqual(scenes.filter((id) => !r.scenes.has(id)), [], 'scenes never reached with every board left');
  assert.deepEqual(exits.filter((id) => !r.exits.has(id)), [], 'exits never taken with every board left (a grade gate, an item a board gave)');
  assert.deepEqual(r.findings, [], 'stalls on the way');
  assert.deepEqual(r.forced, [], 'nothing a skipped board should have given had to be forced');
  // Every story board of 卷一 was met and left.
  const boards = JUAN_ONE.flatMap((ch) => Object.values(content.chapters[ch].scenes).flatMap((s) => (s.show ?? []).filter((c) => c.card === 'board').map((c) => c.id)));
  const left = new Set([...r.states.values()].flatMap(({ s }) => (s.skipped ?? []).map((e) => e.task)));
  assert.ok(boards.length >= 20);
  assert.deepEqual(boards.filter((id) => !left.has(id)), [], 'every story board was left on the way');
});

test('every card kind the stage can hold has a place: the header, the book, or one rank of main — never dropped', () => {
  const look = { scene: null, tasks: [], place: null };
  for (const kind of Object.keys(CARD_KINDS)) {
    const slots = stageSlots(look, [{ card: kind, id: 'x' }]);
    const placed = ASIDE.includes(kind) || slots.main.some((c) => c.card === kind) || MAIN.some((r) => r.kinds.includes(kind));
    assert.ok(placed, `${kind} stands nowhere`);
    if (!ASIDE.includes(kind) && !MAIN.find((r) => r.kinds.includes(kind))?.filler) assert.ok(slots.main.some((c) => c.card === kind), `${kind} alone is not what main shows`);
  }
  for (const kind of PAGE_OWNS) assert.ok(kind in CARD_KINDS, `the page's own ${kind} has a CARD_KINDS entry`);
});

test('a way on that is a card of its own holds the story view off its last beat: the name, the 生辰, the throw, an uncalled fight', () => {
  const ways = [{ value: { field: 'name' } }, { born: {} }, { breakthrough: { odds: {} } }, { game: { kind: 'duel', id: 'd' } }];
  for (const w of ways) assert.equal(cardHoldsWay({ scene: { panel: { taps: [] }, exits: [{ id: 'go', ...w }] } }), true, JSON.stringify(w));
  // A fight the scene's own words call (a tap that names it) is the box's to hold; a won one is done.
  assert.equal(cardHoldsWay({ scene: { panel: { taps: [{ id: 'go' }] }, exits: [{ id: 'go', game: { kind: 'duel', id: 'd' } }] } }), false);
  assert.equal(cardHoldsWay({ scene: { panel: { taps: [] }, exits: [{ id: 'go', won: true, game: { kind: 'duel', id: 'd' } }] } }), false);
  assert.equal(cardHoldsWay({ scene: { panel: { taps: [] }, exits: [{ id: 'go', born: { kept: true } }] } }), false, 'roots already read: a plain step');
});
