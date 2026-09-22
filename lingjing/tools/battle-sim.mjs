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
import { BEATS, MODES, TIERS, act, begin, legal, offers } from '../scripts/battle.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const world = JSON.parse(fs.readFileSync(path.join(HERE, '../worlds/jiuding/cards.json'), 'utf8'));
const CATALOG = Object.fromEntries(world.cards.map(c => [c.id, { ...c, name: c.name.zh }]));
// 银月 is not drafted (she comes in hand), and a token is summoned, never held.
const ALL = world.cards.filter(c => !c._token && c.id !== 'yinyue').map(c => c.id);
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

/* A creature's eight cards ARE its personality, and they are authored —
   `deck` in creatures.json. 夫诸 runs deer shades and closes with the tide;
   狍鸮 walls up then devours; 精卫 never stops coming; 雷神 is all thunder;
   蠪侄 is claws before you stand; 夔 holds the line until your deck is dry;
   狪狪 defends and heals. */
const CREATURES = JSON.parse(fs.readFileSync(path.join(HERE, '../worlds/jiuding/creatures.json'), 'utf8')).creatures;
const byRoot = new Map(CREATURES.filter(c => c.deck).map(c => [c.root, c]));
function foeOf(root) {
  const c = byRoot.get(root) ?? CREATURES.find(x => x.deck);
  return { id: c.id, name: c.name.zh, deck: c.deck };
}

function setupOf({ tier = 'qi', foeTier = tier, root = 'fire', foeRoot = 'wood', deck, seed = 'd1', mode = 'pve', you = {} }) {
  const foe = foeOf(foeRoot);
  return {
    mode, seed,
    you: { tier, root, deck, extra: ['yinyue'], ...(typeof you === 'function' ? you(root) : you) },
    foe: { tier: foeTier, root: foeRoot, deck: foe.deck },
  };
}

/* ── The run ── */

function run(line, { decks, tiers = ['qi', 'foundation', 'core'], days = 6, mode = 'pve', you = {} } = {}) {
  let wins = 0, games = 0, turns = 0, drew = 0;
  const played = new Map();
  const perDeck = new Map();
  for (const deck of decks) {
    for (const tier of tiers) {
      for (const foeRoot of ELEMENTS) {
        for (let d = 0; d < days; d += 1) {
          const setup = setupOf({ tier, root: deck.root, deck: deck.cards, foeRoot, seed: `day${d}|${foeRoot}|${deck.id}`, mode, you });
          const st = play(setup, line);
          games += 1;
          turns += st.turn;
          const won = st.outcome === 'won';
          if (won) wins += 1;
          if (st.outcome === 'withdrew') drew += 1;
          perDeck.set(deck.id, (perDeck.get(deck.id) ?? { w: 0, n: 0 }));
          const row = perDeck.get(deck.id);
          row.n += 1; if (won) row.w += 1;
          for (const id of new Set(st.you.played)) played.set(id, (played.get(id) ?? 0) + 1);
        }
      }
    }
  }
  return { rate: wins / games, drew: drew / games, games, turns: turns / games, played, perDeck };
}

/* 对位 — the axis that actually carries deck-building here. You walk to the
   beast's haunt, so you know what you will fight: bring the root that overcomes
   it, or bring the one it overcomes, or bring a bit of everything. The spread
   between those three IS what choosing a deck is worth, and it is our own 五行
   rather than a borrowed mechanic. */
function matchup() {
  const pool = world.cards.filter(c => !c._token && c.id !== 'yinyue');
  const deckOf = el => [...pool.filter(c => c.element === el).map(c => c.id), ...pool.filter(c => !c.element).map(c => c.id)].slice(0, MODES.pve.deck);
  const mixed = ['huodan', 'hantan', 'luoshi', 'jinzhen', 'xiaoyao', 'luying', 'jiushou', 'shanjing', 'canwu', 'huiqi'];
  const counterOf = root => Object.keys(BEATS).find(e => BEATS[e] === root);
  const score = kind => {
    let w = 0, n = 0;
    for (const c of CREATURES.filter(x => x.deck)) {
      for (const tier of ['qi', 'foundation', 'core']) {
        for (let day = 0; day < 4; day += 1) {
          const el = kind === 'counter' ? counterOf(c.root) : kind === 'wrong' ? BEATS[c.root] : 'fire';
          const deck = kind === 'mixed' ? mixed : deckOf(el);
          const setup = { mode: 'pve', seed: `m|${c.id}|${day}`, you: { tier, root: el, deck, extra: ['yinyue'] }, foe: { tier, root: c.root, deck: c.deck } };
          n += 1;
          if (play(setup, smart).outcome === 'won') w += 1;
        }
      }
    }
    return w / n;
  };
  return { counter: score('counter'), mixed: score('mixed'), wrong: score('wrong') };
}

/* Decision entropy: how far apart are the best choice and the third best? */
function entropy(decks) {
  const gaps = [];
  for (const deck of decks.slice(0, 4)) {
    const setup = setupOf({ tier: 'foundation', root: deck.root, deck: deck.cards, seed: `ent|${deck.id}` });
    play(setup, smart, (st, can) => {
      if (can.length < 3) return;
      const vals = can.map(o => score(st, o)).sort((a, b) => b - a);
      // Normalised by the whole spread of what is on offer this turn, not by
      // the best value alone: what matters is whether the top choices are
      // close to EACH OTHER, not how big the numbers happen to be.
      const span = Math.max(1, vals[0] - vals[vals.length - 1]);
      gaps.push(Math.min(1, (vals[0] - vals[2]) / span));
    });
  }
  gaps.sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
}

/* ── The decks under test ── */

/* Four built decks and four random piles. The difference between them IS the
   game: a curve deck won 84% where a random ten won 47% (2026-09-18). A gate
   judged only on random piles would be measuring someone who cannot play. */
const ARCHETYPES = [
  // 火烈 — 一口气打穿：便宜的身体，全部的伤害都朝脸去
  { id: '火烈', root: 'fire', cards: ['huoya', 'huoya', 'huodan', 'yanxin', 'xianshi', 'jingwei', 'hantan', 'luoshi', 'wulei', 'liaotian'] },
  // 木众 — 铺场：小东西堆满，再一起长高
  { id: '木众', root: 'wood', cards: ['tengmiao', 'tengmiao', 'leipu', 'chunsheng', 'fengmao', 'linmu', 'xiaoyao', 'qingteng', 'fengmao', 'zhennu'] },
  // 水缓 — 挡住，养回，拖到它抽空
  { id: '水缓', root: 'water', cards: ['tuou', 'gupi', 'hanquan', 'shuiwu', 'hantan', 'tingbo', 'kui', 'huiqi', 'zhuguang', 'chaoqi'] },
  // 金锐 — 抢在你立稳之前
  { id: '金锐', root: 'metal', cards: ['jinsuo', 'jinsuo', 'jiushou', 'jinzhua', 'jianying', 'longzhi', 'suijin', 'jinzhen', 'jingang', 'huodan'] },
  // 土厚 — 站得住，换得起
  { id: '土厚', root: 'earth', cards: ['tuou', 'shanjing', 'houtu', 'tongtong', 'shishou', 'jixiao', 'paoxiao', 'tunshi', 'luoshi', 'zhuguang'] },
];

function fieldDecks(n = 4) {
  const out = ARCHETYPES.map(a => ({ ...a, built: true }));
  for (let i = 0; i < n; i += 1) {
    const root = ELEMENTS[i % ELEMENTS.length];
    out.push({ id: `随手${i}`, root, cards: pick(ALL, 1000 + i * 37, MODES.pve.deck) });
  }
  return out;
}

async function main() {
  const { foeTurn } = await import('../scripts/battle.js');
  globalThis.__battle = { foeTurn };
  const gate = process.argv.includes('--gate');
  const decks = fieldDecks(5);
  const built = decks.filter(d => d.built);
  const problems = [];

  const lines = {
    '只放法术': rote('play'),
    '只用技能': rote('power'),
    '只结束回合': rote('end'),
    '会读场的': smart,
  };
  console.log('斗法 v3 — 平衡报告');
  console.log(`牌 ${world.cards.length} 张 · 牌组 ${decks.length} 副 · 每副 ${MODES.pve.deck} 张\n`);
  console.log('打法              胜率   它退走   平均局长(半回合)');
  const results = {};
  for (const [name, line] of Object.entries(lines)) {
    const r = run(line, { decks });
    results[name] = r;
    console.log(`${name.padEnd(14)}  ${(r.rate * 100).toFixed(1).padStart(5)}%  ${(r.drew * 100).toFixed(1).padStart(5)}%   ${r.turns.toFixed(1)}   (${r.games} 局)`);
  }

  const smartRun = results['会读场的'];
  const builtRun = run(smart, { decks: built });
  const pileRun = run(smart, { decks: decks.filter(d => !d.built) });
  console.log(`\n会搭牌的（四副原型）  ${(builtRun.rate * 100).toFixed(1)}%  它退走 ${(builtRun.drew * 100).toFixed(1)}%  ${builtRun.turns.toFixed(1)} 个半回合`);
  console.log(`随手抓十张          ${(pileRun.rate * 100).toFixed(1)}%  它退走 ${(pileRun.drew * 100).toFixed(1)}%  ${pileRun.turns.toFixed(1)} 个半回合`);
  console.log(`构筑值多少：${((builtRun.rate - pileRun.rate) * 100).toFixed(1)} 个百分点`);
  for (const [name, r] of Object.entries(results)) {
    if (name !== '会读场的' && r.rate > 0.35) problems.push(`${name} 赢了 ${(r.rate * 100).toFixed(1)}% — 一条无脑路线不该赢`);
  }
  if (builtRun.rate < 0.6) problems.push(`会搭牌的人只赢 ${(builtRun.rate * 100).toFixed(1)}% — 读懂它、搭好牌没有回报`);
  if (builtRun.rate > 0.9) problems.push(`会搭牌的人赢 ${(builtRun.rate * 100).toFixed(1)}% — 一场必胜的仗不是仗`);
  if (builtRun.drew > 0.25) problems.push(`${(builtRun.drew * 100).toFixed(1)}% 的仗它先力竭遁走 — 平局太多`);
  const m = matchup();
  console.log(`\n对位（你知道今天打谁）  带克它那一行 ${(m.counter * 100).toFixed(1)}%  ·  什么都带一点 ${(m.mixed * 100).toFixed(1)}%  ·  带被它克的行 ${(m.wrong * 100).toFixed(1)}%`);
  console.log(`选对行值多少：${((m.counter - m.wrong) * 100).toFixed(1)} 个百分点`);
  if (m.counter - m.wrong < 0.15) problems.push('选对五行几乎不值钱 — 世界的规矩没有进到牌桌上');
  if (m.counter - m.wrong > 0.55) problems.push(`选对五行值 ${((m.counter - m.wrong) * 100).toFixed(1)} 点 — 选行等于替玩家把仗打完了`);
  if (m.wrong < 0.25) problems.push(`带错行只赢 ${(m.wrong * 100).toFixed(1)}% — 一手烂牌不该是死刑`);
  if (smartRun.turns > 18) problems.push(`PvE 平均 ${smartRun.turns.toFixed(1)} 个半回合，太长`);

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

  // 起手 — a new player owns only the starter (design.md § 得牌): the ten
  // cards of the four v1 roots, 银月 in hand. What that wins, realm by realm,
  // and what each tamed beast adds to it.
  const V1 = ['wood', 'water', 'fire', 'earth'];
  const starter = (world.starter ?? []).filter(id => !CATALOG[id].element || V1.includes(CATALOG[id].element));
  console.log('\n起手（只有起手十张 + 银月，会读场的）');
  for (const [label, cards] of [['起手', starter], ['起手 + 夫诸 + 狍鸮', [...starter.slice(0, 8), 'fuzhu', 'paoxiao']]]) {
    const rates = ['qi', 'foundation', 'core'].map(tier => run(smart, { decks: [{ id: label, root: 'wood', cards }], tiers: [tier], days: 12 }));
    console.log(`${label.padEnd(12)}  练气 ${(rates[0].rate * 100).toFixed(1)}% · 筑基 ${(rates[1].rate * 100).toFixed(1)}% · 结丹 ${(rates[2].rate * 100).toFixed(1)}%  （它退走 ${rates.map(r => (r.drew * 100).toFixed(0) + '%').join(' / ')}）`);
    if (label === '起手' && rates[0].rate < 0.5) problems.push(`起手十张在练气只赢 ${(rates[0].rate * 100).toFixed(1)}% — 新人进不了门`);
  }

  // 带进门的 — the sword (+1 on 主灵根一击) and 问斗法 (its element's 功法 ±n).
  // Each should lift or lower the attentive line a few points, never decide it.
  const base = smartRun.rate;
  console.log('\n带进门的（会读场的，对全部牌组）');
  const kit = [
    ['带剑 · 一击 +1', { power: 1 }],
    ['问斗法 大吉 · 本行功法 +2', root => ({ boost: { element: root, n: 2 } })],
    ['问斗法 吉 · +1', root => ({ boost: { element: root, n: 1 } })],
    ['问斗法 凶 · −1', root => ({ boost: { element: root, n: -1 } })],
    ['问斗法 大凶 · −2', root => ({ boost: { element: root, n: -2 } })],
  ];
  for (const [label, you] of kit) {
    const r = run(smart, { decks, you });
    const d = (r.rate - base) * 100;
    console.log(`${label.padEnd(20)}  ${(r.rate * 100).toFixed(1)}%  (${d >= 0 ? '+' : ''}${d.toFixed(1)})`);
    if (Math.abs(d) > 15) problems.push(`${label} 改了 ${d.toFixed(1)} 个百分点 — 带进门的东西不该替人打仗`);
  }

  const ent = entropy(decks);
  console.log(`\n决策熵（中位）：${(ent * 100).toFixed(1)}%  —  健康区间 5–15%`);
  if (ent > 0.25) problems.push(`决策熵 ${(ent * 100).toFixed(1)}% — 多数回合只有一条路`);
  if (ent < 0.02) problems.push(`决策熵 ${(ent * 100).toFixed(1)}% — 怎么打都一样`);

  console.log(problems.length ? `\n闸：${problems.length} 处越界\n · ${problems.join('\n · ')}` : '\n闸：全部在带内');
  if (gate && problems.length) process.exit(1);
}

main();
