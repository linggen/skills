// battle-sim.mjs — the balance team, in software (design.md § 好玩这件事).
//
// One person cannot hand-test a hundred cards. So nobody does: every card is a
// row of data, and this plays thousands of whole games to say what each row is
// worth. `node tools/battle-sim.mjs` prints the report; `--gate` exits 1 when a
// band is broken, so a card can never be added by taste alone.
//
// What it measures, and why each one catches a different kind of bad card:
//
//   胜率     — per line of play. One repeated choice must not win (a rolling
//              game), and the attentive line must (or reading it means nothing).
//   局长     — half-turns to the end. PvE has a band because the day has
//              tasks waiting; a fight that drags is a fight nobody finishes.
//   影响力   — the win rate of decks holding a card minus decks without it.
//              A card far above the pack is the one to cost more.
//   出场率   — how often the smart line plays it when it could. 0% is a dead
//              card, 100% is an auto-include; both are failures of design.
//   决策熵   — the spread between the best choice and the third best. Above
//              20% there is only one line (no decision); below 3% nothing
//              matters (no decision either). 5–15% is a game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, TIERS, act, begin, legal, offers } from '../scripts/battle.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const world = JSON.parse(fs.readFileSync(path.join(HERE, '../worlds/jiuding/cards.json'), 'utf8'));
const CATALOG = Object.fromEntries(world.cards.map(c => [c.id, { ...c, name: c.name.zh }]));
const ALL = world.cards.map(c => c.id).filter(id => id !== 'yinyue');
const ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'];

/* ── Lines of play ── */

/* One kind of choice, over and over — the rolling-game test. */
const rote = kind => st => {
  const can = offers(st).filter(o => o.ok);
  return can.find(o => o.action.kind === kind) ?? can.find(o => o.action.kind === 'end');
};

/* The attentive line: spend the turn well. It asks the engine what each choice
   would do rather than holding an opinion, so it can never drift from the
   rules.
   A first version counted only damage and clears, and declared every defensive
   card dead (夔, 狪狪, 山精 — all 0% played). That was the LINE being blind, not
   the cards being bad: a body left standing is damage next turn and damage not
   taken, and a 护主 is worth what it blocks. The value below counts the board
   it leaves behind, which is what a player sees. */
function score(st, o) {
  const before = snapshot(st);
  const copy = replay(st);
  const out = act(copy, o.action, 'you');
  if (!out.ok) return -1;
  const after = snapshot(copy);
  const dealt = before.foeHp - after.foeHp;
  const cleared = before.foeBoard - after.foeBoard;
  const lost = before.youBoard - after.youBoard;
  const healed = after.youHp - before.youHp;
  const drawn = after.hand - before.hand + 1;
  const mine = after.mineAtk - before.mineAtk + (after.mineHp - before.mineHp) * 0.6 + (after.mineTaunt - before.mineTaunt) * 2;
  const theirs = before.theirAtk - after.theirAtk;
  const hurtMe = before.youHp - after.youHp;
  return dealt * 2 + cleared * 2 + mine * 1.5 + theirs - lost * 2 - hurtMe + healed + drawn * 0.5 + (o.action.kind === 'end' ? -0.5 : 0);
}

const sum = (board, f) => board.reduce((n, m) => n + f(m), 0);
const snapshot = st => ({
  foeHp: st.foe.hp, youHp: st.you.hp, foeBoard: st.foe.board.length, youBoard: st.you.board.length, hand: st.you.hand.length,
  mineAtk: sum(st.you.board, m => m.atk), mineHp: sum(st.you.board, m => m.hp), mineTaunt: sum(st.you.board, m => (m.taunt ? 1 : 0)),
  theirAtk: sum(st.foe.board, m => m.atk),
});

/* A fight is replayable, so a line can look one move ahead without changing
   anything: begin again and re-run what has happened so far. */
function replay(st) {
  const copy = begin(st.origin, CATALOG);
  for (const a of st.history) {
    if (a.who === 'foe') foeAll(copy);
    else act(copy, a.action, 'you');
  }
  return copy;
}

const smart = st => {
  const can = offers(st).filter(o => o.ok);
  return can.map(o => ({ o, v: score(st, o) })).sort((a, b) => b.v - a.v)[0]?.o;
};

/* ── Playing a whole fight ── */

function foeAll(st) {
  // battle.js owns the creature's policy; the sim only hands it the turn.
  const { foeTurn } = globalThis.__battle ?? {};
  foeTurn(st);
}

function play(setup, line, watch = null) {
  const st = begin(setup, CATALOG);
  st.origin = setup;
  st.history = [];
  for (let guard = 0; guard < 120 && st.outcome === 'open'; guard += 1) {
    if (st.whose === 'foe') { foeAll(st); st.history.push({ who: 'foe' }); continue; }
    const can = offers(st).filter(o => o.ok);
    if (watch) watch(st, can);
    const pick = line(st);
    if (!pick) break;
    act(st, pick.action, 'you');
    st.history.push({ who: 'you', action: pick.action });
    if (pick.action.kind === 'play' || pick.action.kind === 'power') st.usedCards?.push?.(pick.id);
  }
  return st;
}

/* ── The field: decks, creatures, days ── */

const pick = (arr, seed, n) => {
  let s = seed;
  const out = [];
  const pool = [...arr];
  while (out.length < n && pool.length) {
    s = (s * 48271) % 2147483647;
    out.push(pool.splice(s % pool.length, 1)[0]);
  }
  return out;
};

/* A creature's eight cards ARE its personality — this is a stand-in until they
   are authored: its own body twice, two imps, and spells of its own root. */
function foeDeck(element, seed) {
  const bodies = world.cards.filter(c => c.kind === 'minion' && c.element === element && c.cost <= 5).map(c => c.id);
  const spells = world.cards.filter(c => c.kind === 'spell' && c.element === element).map(c => c.id);
  // Its own kind twice over, its own two spells, and two imps to hold the line.
  const body = bodies[bodies.length - 1] ?? 'xiaoyao';
  const small = bodies[0] ?? 'xiaoyao';
  const deck = [small, body, body, small, 'xiaoyao', ...spells.slice(0, 2)];
  while (deck.length < MODES.pve.foeDeck) deck.push(pick(ALL, seed + deck.length, 1)[0]);
  return deck.slice(0, MODES.pve.foeDeck);
}

function setupOf({ tier = 'qi', foeTier = tier, root = 'fire', foeRoot = 'wood', deck, seed = 'd1', mode = 'pve' }) {
  return {
    mode, seed,
    you: { tier, root, deck, extra: ['yinyue'] },
    foe: { tier: foeTier, root: foeRoot, deck: foeDeck(foeRoot, 7) },
  };
}

/* ── The run ── */

function run(line, { decks, tiers = ['qi', 'foundation', 'core'], days = 6, mode = 'pve' } = {}) {
  let wins = 0, games = 0, turns = 0;
  const played = new Map();
  const perDeck = new Map();
  for (const deck of decks) {
    for (const tier of tiers) {
      for (const foeRoot of ELEMENTS) {
        for (let d = 0; d < days; d += 1) {
          const setup = setupOf({ tier, root: deck.root, deck: deck.cards, foeRoot, seed: `day${d}|${foeRoot}|${deck.id}`, mode });
          const st = play(setup, line);
          games += 1;
          turns += st.turn;
          const won = st.outcome === 'won';
          if (won) wins += 1;
          perDeck.set(deck.id, (perDeck.get(deck.id) ?? { w: 0, n: 0 }));
          const row = perDeck.get(deck.id);
          row.n += 1; if (won) row.w += 1;
          for (const id of new Set(st.you.played)) played.set(id, (played.get(id) ?? 0) + 1);
        }
      }
    }
  }
  return { rate: wins / games, games, turns: turns / games, played, perDeck };
}

/* Decision entropy: how far apart are the best choice and the third best? */
function entropy(decks) {
  const gaps = [];
  for (const deck of decks.slice(0, 4)) {
    const setup = setupOf({ tier: 'foundation', root: deck.root, deck: deck.cards, seed: `ent|${deck.id}` });
    play(setup, smart, (st, can) => {
      if (can.length < 3) return;
      const vals = can.map(o => score(st, o)).sort((a, b) => b - a);
      const span = Math.max(1, Math.abs(vals[0]) + 1);
      gaps.push(Math.min(1, (vals[0] - vals[2]) / span));
    });
  }
  gaps.sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
}

/* ── The decks under test ── */

function fieldDecks(n = 8) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const root = ELEMENTS[i % ELEMENTS.length];
    out.push({ id: `deck${i}`, root, cards: pick(ALL, 1000 + i * 37, MODES.pve.deck) });
  }
  return out;
}

async function main() {
  const { foeTurn } = await import('../scripts/battle.js');
  globalThis.__battle = { foeTurn };
  const gate = process.argv.includes('--gate');
  const decks = fieldDecks(8);
  const problems = [];

  const lines = {
    '只放法术': rote('play'),
    '只用技能': rote('power'),
    '只结束回合': rote('end'),
    '会读场的': smart,
  };
  console.log('斗法 v3 — 平衡报告');
  console.log(`牌 ${world.cards.length} 张 · 牌组 ${decks.length} 副 · 每副 ${MODES.pve.deck} 张\n`);
  console.log('打法              胜率    平均局长(半回合)');
  const results = {};
  for (const [name, line] of Object.entries(lines)) {
    const r = run(line, { decks });
    results[name] = r;
    console.log(`${name.padEnd(14)}  ${(r.rate * 100).toFixed(1).padStart(5)}%   ${r.turns.toFixed(1)}   (${r.games} 局)`);
  }

  const smartRun = results['会读场的'];
  for (const [name, r] of Object.entries(results)) {
    if (name === '会读场的' && r.rate < 0.6) problems.push(`会读场的只赢 ${(r.rate * 100).toFixed(1)}% — 读懂它没有回报`);
    if (name !== '会读场的' && r.rate > 0.35) problems.push(`${name} 赢了 ${(r.rate * 100).toFixed(1)}% — 一条无脑路线不该赢`);
  }
  if (smartRun.turns > 16) problems.push(`PvE 平均 ${smartRun.turns.toFixed(1)} 个半回合，太长`);

  console.log('\n每张牌（会读场的打法）');
  console.log('牌            出场率   影响力');
  const rows = [];
  for (const c of world.cards) {
    if (c.id === 'yinyue') continue;
    const withIt = decks.filter(d => d.cards.includes(c.id));
    const without = decks.filter(d => !d.cards.includes(c.id));
    const a = withIt.length ? run(smart, { decks: withIt, tiers: ['foundation'], days: 4 }).rate : null;
    const b = without.length ? run(smart, { decks: without, tiers: ['foundation'], days: 4 }).rate : null;
    const seen = (smartRun.played.get(c.id) ?? 0) / Math.max(1, smartRun.games / decks.length * withIt.length);
    rows.push({ id: c.id, name: c.name.zh, seen, impact: a != null && b != null ? a - b : null, decks: withIt.length });
  }
  rows.sort((x, y) => (y.impact ?? -9) - (x.impact ?? -9));
  for (const r of rows) {
    const imp = r.impact == null ? '  —  ' : `${(r.impact * 100 >= 0 ? '+' : '')}${(r.impact * 100).toFixed(1)}%`;
    console.log(`${r.name.padEnd(10)}  ${(r.seen * 100).toFixed(0).padStart(4)}%   ${imp.padStart(7)}${r.decks < 2 ? '   (牌组太少，参考)' : ''}`);
    if (r.decks >= 3 && r.impact != null && Math.abs(r.impact) > 0.2) problems.push(`${r.name} 影响力 ${(r.impact * 100).toFixed(1)}% — 越界`);
    if (r.decks >= 3 && r.seen < 0.05) problems.push(`${r.name} 几乎从不被打出 — 废牌`);
  }

  const ent = entropy(decks);
  console.log(`\n决策熵（中位）：${(ent * 100).toFixed(1)}%  —  健康区间 5–15%`);
  if (ent > 0.25) problems.push(`决策熵 ${(ent * 100).toFixed(1)}% — 多数回合只有一条路`);
  if (ent < 0.02) problems.push(`决策熵 ${(ent * 100).toFixed(1)}% — 怎么打都一样`);

  console.log(problems.length ? `\n闸：${problems.length} 处越界\n · ${problems.join('\n · ')}` : '\n闸：全部在带内');
  if (gate && problems.length) process.exit(1);
}

main();
