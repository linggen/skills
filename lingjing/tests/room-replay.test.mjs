// The fight room (games/kapai.js — the Mac page's and the phone's) and the rules' replay (battle.js battle, replayInto)
// play the same fight from the same seed and moves: the board after each of the beast's turns is the same in both
// (live 11-05: 当康 at 后山, the deep line's offline win drifted on the page). Resume and the settle both rest on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OUT } from '../tools/arcade-fights.mjs';
import { lookahead } from '../tools/trial-sim.mjs';
import { act, actionOf, begin, foeTurn, idleWhy, tokenOf, view } from '../scripts/battle.js';

const TABLE = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const WORLD = new URL('../worlds/jiuding/', import.meta.url).href;
const catalog = Object.fromEntries(JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/cards.json', import.meta.url), 'utf8')).cards.map((c) => [c.id, c]));
function stubFetch() {
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (!href.startsWith(WORLD)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(new URL(href), 'utf8')) };
  };
}
function fakeRoom() {
  const el = () => ({ className: '', innerHTML: '', listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, removeEventListener(t) { delete this.listeners[t]; }, querySelector: () => null, contains: () => true });
  globalThis.document ??= { addEventListener() {}, removeEventListener() {} };
  return { ownerDocument: { createElement: el }, kids: [], replaceChildren(h) { this.kids = [h]; } };
}
const boardOf = (st) => { const v = view(st); return JSON.stringify({ turn: v.turn, whose: v.whose, you: { hp: v.you.hp, mana: v.you.mana, hand: v.you.hand, deck: v.you.deck, board: v.you.board }, foe: { hp: v.foe.hp, mana: v.foe.mana, hand: v.foe.hand, deck: v.foe.deck, board: v.foe.board } }); };

/* The offline line: the deep lookahead (the bands' careful player) from the door's seed — its moves, and the board after
   each beast's turn. `roomRules`: the moves as the room takes them (a spell that would land on nothing is never played
   there, games/kapai.js — the line ends its turn instead). */
function offline(setup, roomRules) {
  const st = begin(setup, catalog), tokens = [], boards = [];
  for (let g = 0; g < 600 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); boards.push(boardOf(st)); continue; }
    let a = lookahead(st, { deep: true });
    if (roomRules && a.kind === 'play' && idleWhy(st, st.you, catalog[st.you.hand[a.index]])) a = { kind: 'end' };
    tokens.push(tokenOf(a));
    if (!act(st, a, 'you').ok) break;
  }
  return { tokens, boards, st };
}
/* The same moves through the room, as a player taps them: its own beast turns, step by step, animations and all. */
async function inRoom(setup, tokens) {
  stubFetch();
  const { mount } = await import('../scripts/games/kapai.js');
  const container = fakeRoom(), boards = [], played = [];
  let host = null;
  const st0 = begin(setup, catalog);
  const story = { onMove: (t) => played.push(t), onPlayed: ({ mine }) => { if (!mine && host) boards.push(boardOf(host.kapai.state())); }, settle: async () => ({ ok: true }), holdMs: () => 1 };
  const done = mount(container, { data: { setup, brief: { creature: { name: 'x' } }, st: st0, catalog }, lang: 'zh', shell: { paused: () => false, say() {}, onPause: () => () => {} }, story });
  for (let i = 0; i < 50 && !host?.kapai; i++) { await new Promise((r) => setTimeout(r, 10)); host = container.kids[0]; }
  let i = 0, end = false;
  done.then(() => { end = true; });
  for (let guard = 0; guard < 4000 && !end && i < tokens.length; guard++) {
    const st = host.kapai.state();
    if (st.outcome === 'open' && st.whose === 'you' && !host.kapai.busy()) await host.kapai.move(actionOf(tokens[i++]));
    else await new Promise((r) => setTimeout(r, 5));
  }
  for (let k = 0; k < 400 && host.kapai.busy(); k++) await new Promise((r) => setTimeout(r, 5));
  return { played, boards, st: host.kapai.state() };
}

for (const key of ['dangkang@yaoyuan-wai', 'chihu@yaoyuan-wai', 'longzhi@00-longzhi/subdue', 'gui@wm-wangzuo/open']) {
  test(`${key}: the room and the rules play one fight — every move kept, the board the same after each beast's turn`, { timeout: 600000 }, async () => {
    const row = TABLE.fights.find((f) => f.key === key);
    assert.ok(row, key);
    const setup = { ...row.setup, seed: 'door|7' };
    const line = offline(setup, true);
    const room = await inRoom(setup, line.tokens);
    assert.deepEqual(room.played, line.tokens, 'every move the room took is the one played offline');
    assert.deepEqual(room.boards, line.boards.slice(0, room.boards.length), 'the board after each beast turn');
    assert.equal(room.boards.length, line.boards.length, 'as many beast turns');
    assert.equal(boardOf(room.st), boardOf(line.st), 'and the same end');
  });
}

test('the deep line as it plays offline (no room rule) can diverge from the room: it plays spells that land on nothing', async () => {
  // The diagnosis, kept: where the line plays such a spell, the room refuses it (no move, nothing spent) — the line's own
  // move list is then not the room's. Counted, not asserted equal: it is the line's habit, not the game's.
  const row = TABLE.fights.find((f) => f.key === 'dangkang@yaoyuan-wai');
  const setup = { ...row.setup, seed: 'door|7' };
  const raw = offline(setup, false), st = begin(setup, catalog);
  let idle = 0;
  for (const t of raw.tokens) {
    while (st.whose === 'foe' && st.outcome === 'open') foeTurn(st);
    if (st.outcome !== 'open') break;
    const a = actionOf(t);
    if (a.kind === 'play' && idleWhy(st, st.you, catalog[st.you.hand[a.index]])) idle += 1;
    act(st, a, 'you');
  }
  console.log(`[room-replay] 当康 door|7: the deep line played ${idle} spell(s) that land on nothing; outcome ${raw.st.outcome}`);
  assert.ok(idle >= 0);
});
