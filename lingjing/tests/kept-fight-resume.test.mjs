// A kept fight reloaded stands exactly where it was left — on the Mac page and on the phone (playbot 11-07, the kept-fight
// walk at 375 and 1280: the fight came back one whole round ahead, 灵力 3 → 4, a card more in the hand, the beast had
// moved again). The Mac page hands the room a state it already replayed from the kept moves (lingjing.js startDuel:
// replayInto) together with the door's brief, which carries the same moves (rules/tasks.mjs `duel.picks`); the room
// replayed them a second time whenever no card of his had been played (games/kapai.js, since 592712a1). The phone hands
// only the moves (games/phone/host.js), so the room must still replay those — a kept fight never restarts at turn 1.
//
// Each case plays a real line through the room as a player taps it, leaves at one point — mid-turn after a play, just
// after 结束回合, while the beast's turn is still being drawn, and after a first turn ended with nothing played — then
// reopens the moves kept so far both ways and compares the room with the one left (once the beast's turn left running
// has played out: its moves are the seed's, so that is where a reload stands).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OUT } from '../tools/arcade-fights.mjs';
import { lookahead } from '../tools/trial-sim.mjs';
import { act, actionOf, begin, foeTurn, idleWhy, replayInto, tokenOf, view } from '../scripts/battle.js';

const TABLE = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const WORLD = new URL('../worlds/jiuding/', import.meta.url).href;
const catalog = Object.fromEntries(JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/cards.json', import.meta.url), 'utf8')).cards.map((c) => [c.id, c]));
globalThis.fetch = async (url) => {
  const href = String(url);
  if (!href.startsWith(WORLD)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(new URL(href), 'utf8')) };
};
globalThis.document ??= { addEventListener() {}, removeEventListener() {} };
const { mount } = await import('../scripts/games/kapai.js');

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
function fakeRoom() {
  const el = () => ({ className: '', innerHTML: '', listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, removeEventListener(t) { delete this.listeners[t]; }, querySelector: () => null, contains: () => true });
  return { ownerDocument: { createElement: el }, kids: [], replaceChildren(h) { this.kids = [h]; } };
}
/* What the playbot compares across a reload, and more: whose turn, 灵力, 气血, the hand card by card, both decks, both ranks. */
const stateOf = (st) => {
  const v = view(st), side = (s, raw) => ({ hp: s.hp, mana: s.mana, manaMax: s.manaMax, hand: raw.hand.slice(), deck: s.deck, board: s.board, allies: s.allies ?? null });
  return { turn: v.turn, whose: v.whose, outcome: v.outcome, you: side(v.you, st.you), foe: side(v.foe, st.foe) };
};

/* The room mounted; `data` as the Mac page or the phone hands it. Resolves once the room is drawn and idle. */
async function open(data) {
  const container = fakeRoom(), played = [], stop = new AbortController();
  const story = { onMove: (t) => played.push(t), settle: async () => ({ ok: true }), holdMs: () => 1 };
  mount(container, { data: { brief: { creature: { name: 'x' } }, catalog, ...data, brief: { creature: { name: 'x' }, ...(data.brief ?? {}) } }, lang: 'zh', reducedMotion: true, signal: stop.signal, shell: { paused: () => false, say() {}, onPause: () => () => {} }, story });
  let host = null;
  for (let i = 0; i < 200 && !host?.kapai; i++) { await tick(); host = container.kids[0]; }
  assert.ok(host?.kapai, 'the room mounted');
  for (let k = 0; k < 800 && (host.kapai.busy() || host.kapai.state().whose !== 'you'); k++) await tick();
  return { kapai: host.kapai, played, close: () => stop.abort() };
}

/* The offline line from the door's seed, as the room takes moves (a spell landing on nothing ends the turn instead). */
function line(setup) {
  const st = begin(setup, catalog), tokens = [];
  for (let g = 0; g < 600 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    let a = lookahead(st, { deep: true });
    if (a.kind === 'play' && idleWhy(st, st.you, catalog[st.you.hand[a.index]])) a = { kind: 'end' };
    tokens.push(tokenOf(a));
    if (!act(st, a, 'you').ok) break;
  }
  return tokens;
}

/* Plays `tokens` through a fresh room up to and including `upTo`, leaving at `when`: 'after' (the move played out, the
   beast's turn too), 'ended' (the instant 结束回合 is taken), 'beast' (while the beast's turn is being drawn). Returns
   the moves kept at the moment of leaving (what the save's `mark` holds) and the room as a reload must show it. */
async function leave(setup, tokens, upTo, when) {
  const room = await open({ setup, st: begin(setup, catalog) });
  let kept = null;
  for (let i = 0; i <= upTo; i++) {
    for (let k = 0; k < 800 && (room.kapai.busy() || room.kapai.state().whose !== 'you'); k++) await tick();
    const moving = room.kapai.move(actionOf(tokens[i]));
    if (i === upTo && when === 'ended') kept = room.played.slice();
    if (i === upTo && when === 'beast') {
      for (let k = 0; k < 800 && room.kapai.state().whose !== 'foe'; k++) await tick();
      assert.equal(room.kapai.state().whose, 'foe', 'left while the beast\'s turn is still being drawn');
      kept = room.played.slice();
    }
    await moving;
  }
  for (let k = 0; k < 800 && (room.kapai.busy() || room.kapai.state().whose !== 'you'); k++) await tick();
  kept ??= room.played.slice();
  const want = stateOf(room.kapai.state());
  room.close();
  return { kept, want };
}

const row = TABLE.fights.find((f) => f.key === 'dangkang@yaoyuan-wai');
const setup = { ...row.setup, seed: 'door|7' };
const tokens = line(setup);
const ends = tokens.map((t, i) => (t === 'end' ? i : -1)).filter((i) => i >= 0);
const playAfter = (from) => tokens.findIndex((t, i) => i > from && t.startsWith('play:') && tokens[i + 1] !== 'end');
const CASES = [
  ['a first turn ended with no card played', ['end'], 0, 'ended'],
  ['mid-turn, a card just played', tokens, playAfter(ends[0]), 'after'],
  ['just after 结束回合', tokens, ends[1], 'ended'],
  ['during the beast\'s turn, still being drawn', tokens, ends[2], 'beast'],
  ['a later 结束回合, its beast turn played out', tokens, ends[3], 'after'],
];

for (const [name, moves, upTo, when] of CASES) {
  test(`a kept fight reopened stands where it was left — ${name}: the Mac page and the phone`, { timeout: 120000 }, async () => {
    assert.ok(upTo >= 0 && upTo < moves.length, `the line has the point (${upTo})`);
    const { kept, want } = await leave(setup, moves, upTo, when);
    assert.ok(kept.length > 0);
    assert.equal(want.whose, 'you');
    // The Mac page (lingjing.js startDuel → mountBout): the state replayed from the door's moves, and the brief with them.
    const mac = await open({ setup, st: replayInto(begin(setup, catalog), kept), brief: { picks: kept }, resumed: true });
    assert.deepEqual(stateOf(mac.kapai.state()), want, 'the Mac page');
    mac.close();
    // The phone (games/phone/host.js): only the brief's moves; the room replays them on the door's seed.
    const phone = await open({ setup, brief: { picks: kept }, resumed: true });
    assert.deepEqual(stateOf(phone.kapai.state()), want, 'the phone');
    assert.notEqual(phone.kapai.state().turn, 1, 'never back at turn 1');
    phone.close();
  });
}
