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
//   决策熵   — at the start of a turn, the WIN RATE of the best plan minus
//              the third best. Above 20 points there is only one line (no
//              decision); below 3 nothing matters (no decision either). 5–15
//              is a game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEATS, MODES, TIERS, act, begin, legal, offers, shuffle } from '../scripts/battle.js';

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
  const copy = clone(st);
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
  // 大旱 standing, 灵力 drained off its next turn: worth what they will take.
  const standing = (after.mineDrought - before.mineDrought) * Math.max(1, after.foeBoard) * 1.5 + (after.foeDrain - before.foeDrain) * 1.5;
  return dealt * 2 + cleared * 2 + mine * 1.5 + theirs + standing - lost * 2 - hurtMe + healed + drawn * 0.5 + (o.action.kind === 'end' ? -0.5 : 0);
}

const sum = (board, f) => board.reduce((n, m) => n + f(m), 0);
const snapshot = st => ({
  foeHp: st.foe.hp, youHp: st.you.hp, foeBoard: st.foe.board.length, youBoard: st.you.board.length, hand: st.you.hand.length,
  mineAtk: sum(st.you.board, m => m.atk), mineHp: sum(st.you.board, m => m.hp), mineTaunt: sum(st.you.board, m => (m.taunt ? 1 : 0)),
  // A chained body strikes nothing next turn: most of its 攻 is out of play.
  theirAtk: sum(st.foe.board, m => (m.chain ? m.atk * 0.4 : m.atk)),
  mineDrought: sum(st.you.board, m => m.drought ?? 0), foeDrain: st.foe.drain ?? 0,
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
// A foe is named by its root (the one beast of that root the field uses) or,
// where one piece of gear is weighed against every beast of a root, by its id.
function foeOf(key) {
  const c = CREATURES.find(x => x.id === key && x.deck) ?? byRoot.get(key) ?? CREATURES.find(x => x.deck);
  return { id: c.id, name: c.name.zh, root: c.root, deck: c.deck, signature: c.signature };
}

function setupOf({ tier = 'qi', foeTier = tier, root = 'fire', foeRoot: key = 'wood', deck, seed = 'd1', mode = 'pve', you = {} }) {
  const foe = foeOf(key), foeRoot = foe.root;
  return {
    mode, seed,
    you: { tier, root, deck, extra: ['yinyue'], ...(typeof you === 'function' ? you(root) : you) },
    foe: { tier: foeTier, root: foeRoot, deck: foe.deck, ...(process.env.NO_SIG ? {} : { signature: foe.signature }) },
  };
}

/* ── The run ── */

function run(line, { decks, tiers = ['qi', 'foundation', 'core'], foes = ELEMENTS, days = 6, mode = 'pve', you = {} } = {}) {
  let wins = 0, games = 0, turns = 0, drew = 0;
  const played = new Map();
  const perDeck = new Map();
  for (const deck of decks) {
    for (const tier of tiers) {
      for (const foeRoot of foes) {
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
          const setup = { mode: 'pve', seed: `m|${c.id}|${day}`, you: { tier, root: el, deck, extra: ['yinyue'] }, foe: { tier, root: c.root, deck: c.deck, ...(process.env.NO_SIG ? {} : { signature: c.signature }) } };
          n += 1;
          if (play(setup, smart).outcome === 'won') w += 1;
        }
      }
    }
    return w / n;
  };
  return { counter: score('counter'), mixed: score('mixed'), wrong: score('wrong') };
}

/* 决策熵 — does a turn hold a real choice?
   The first version ranked single ACTIONS by the one-step score and divided
   best-minus-third by the whole spread. That number mostly counted the
   options: n choices spread evenly read 2/(n−1), so this game's 5–13 a turn
   read 17–50% whatever the cards did (2026-09-23, measured 32.5% against an
   even-spread 33%). It also ranked "which 火鸦 first" when both get played.
   Now the unit is the turn and the measure is winning. Every distinct way to
   spend the turn (states reached, not orders taken) is played out to the end
   by the attentive line over the same ROLLOUTS futures — the rest of both
   decks reshuffled, one seed per future, shared by every plan so the plans
   differ only by the plan. The gap is win-rate points, as design.md says. */
const ROLLOUTS = 20;
const PLAN_CAP = 12;

// A copy that shares the card book: the state is plain data (checked against
// replay() on 5,515 positions, 2026-09-23), the book is the heavy part.
function clone(st) {
  const { catalog, origin, history, ...rest } = st;
  const c = structuredClone(rest);
  return Object.assign(c, { catalog, origin, history: [...(history ?? [])] });
}

const sideKey = side => JSON.stringify({ ...side, hand: [...side.hand].sort(), board: side.board.map(m => JSON.stringify(m)).sort(), deck: side.deck.length });
const keyOf = st => `${st.outcome}|${st.whose}|${sideKey(st.you)}|${sideKey(st.foe)}`;

/* Every end state this turn can reach. Orders that land in the same place
   are one plan; a plan the one-step score ranks far down is dropped only
   when there are more than PLAN_CAP. */
function plansOf(st) {
  const seen = new Set();
  const ends = [];
  const walk = s => {
    const k = keyOf(s);
    if (seen.has(k)) return;
    seen.add(k);
    if (s.outcome !== 'open' || s.whose !== 'you') { ends.push(s); return; }
    ends.push(s);
    for (const o of offers(s).filter(x => x.ok && x.action.kind !== 'end')) {
      const c = clone(s);
      if (act(c, o.action, 'you').ok) walk(c);
    }
  };
  walk(clone(st));
  const before = snapshot(st);
  const worth = s => {
    const a = snapshot(s);
    return (before.foeHp - a.foeHp) * 2 + (before.foeBoard - a.foeBoard) * 2 + (a.mineAtk - before.mineAtk) * 1.5 + (a.mineHp - before.mineHp) * 0.9 - (before.youBoard - a.youBoard) * 2 + (s.outcome === 'won' ? 99 : 0);
  };
  return ends.map(s => ({ s, v: worth(s) })).sort((x, y) => y.v - x.v).slice(0, PLAN_CAP).map(x => x.s);
}

function finish(st) {
  for (let guard = 0; guard < 120 && st.outcome === 'open'; guard += 1) {
    if (st.whose === 'foe') { foeAll(st); continue; }
    const pick = smart(st);
    if (!pick) break;
    act(st, pick.action, 'you');
  }
  return st.outcome === 'won';
}

function winRate(plan) {
  let won = 0;
  for (let k = 0; k < ROLLOUTS; k += 1) {
    const s = clone(plan);
    s.you.deck = shuffle(s.you.deck, `future${k}|you`);
    s.foe.deck = shuffle(s.foe.deck, `future${k}|foe`);
    if (s.outcome === 'open' && s.whose === 'you') act(s, { kind: 'end' }, 'you');
    if (finish(s)) won += 1;
  }
  return won / ROLLOUTS;
}

function entropy(decks) {
  const turns = [];
  for (const deck of decks) {
    for (const foeRoot of ['wood', 'metal']) {
      const setup = setupOf({ tier: 'foundation', root: deck.root, deck: deck.cards, foeRoot, seed: `ent|${deck.id}|${foeRoot}` });
      let last = 0;
      play(setup, smart, st => {
        if (st.turn === last) return; // once a turn, at its start
        last = st.turn;
        const plans = plansOf(st);
        if (plans.length < 2) { turns.push({ forced: true }); return; }
        const w = plans.map(winRate).sort((a, b) => b - a);
        turns.push({ gap: w[0] - w[Math.min(2, w.length - 1)], best: w[0] });
      });
    }
  }
  const open = turns.filter(t => !t.forced);
  const gaps = open.map(t => t.gap).sort((a, b) => a - b);
  const share = f => open.length ? open.filter(f).length / open.length : 0;
  return {
    median: gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0,
    turns: turns.length,
    forced: turns.length - open.length,
    oneLine: share(t => t.gap > 0.2),
    game: share(t => t.gap >= 0.03 && t.gap <= 0.2),
    flat: share(t => t.gap < 0.03),
    // A flat turn in a fight already won (or lost) whatever you do is not a
    // design failure — it is the end of the fight.
    settled: share(t => t.gap < 0.03 && (t.best === 1 || t.best === 0)),
  };
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

/* ── 装备入局 — what the world's gear turns into at the door ──
   The same rates the rules use (cards.json `gear`, rules/cards.mjs
   § 装备入局), read from the same files, so the gate weighs the numbers a
   player will really carry in. */
const ITEMS = JSON.parse(fs.readFileSync(path.join(HERE, '../worlds/jiuding/items.json'), 'utf8')).items;
const GEAR = world.gear ?? {};
const itemEffect = id => ITEMS.find(i => i.id === id)?.effect ?? {};
const weaponPower = atk => Math.round((atk ?? 0) * (GEAR.weapon_power ?? 0));
const treasurePower = (base, level) => weaponPower(base) + Math.floor((level - 1) / Math.max(1, GEAR.treasure_levels ?? 99));
const armorOf = id => Math.round((itemEffect(id).def ?? 0) * (GEAR.armor_per_def ?? 0));
const wardOf = id => Object.fromEntries(Object.entries(itemEffect(id).ward ?? {}).map(([el, n]) => [el, Math.round(n * (GEAR.ward_per_point ?? 0))]));
const CHARM = world.cards.find(c => c.charm)?.id;
const SPELLS = world.cards.filter(c => c.kind === 'spell' && !c.charm && !c._token).map(c => c.id);
const starsAll = n => Object.fromEntries(SPELLS.map(id => [id, n]));

/* ── 银月 — her card grows both ways (rewards.json `her_card`, Hanli 2026-09-24) ──
   With the player's realm, and by the story: an ability at the ③ ⑥ ⑨
   cauldron. Each row against the same realm with her card as printed. A
   realm's lift is what she has there; a gift stacks on the realm it comes
   at (③ ≈ 元婴, the fight's last realm — ⑥ and ⑨ come later still, so they
   are weighed on 元婴 too). One step may move the fight at most 8 points;
   everything at once must not make it a sure thing (the 全副 rule). What
   she wears (齐纨 +0/+1) rides on top. */
const HER = JSON.parse(fs.readFileSync(path.join(HERE, '../worlds/jiuding/rewards.json'), 'utf8')).her_card ?? {};
const addLift = (a, b) => ({ ...a, ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === 'number' ? (a[k] ?? 0) + v : v])) });
function herRows(decks, problems) {
  const zh = { foundation: '筑基', core: '结丹', nascent: '元婴' };
  const at = (tier, lift) => run(smart, { decks, tiers: [tier], you: { lifts: { yinyue: lift } } }).rate;
  const bare = {};
  const row = (label, tier, lift, prev) => {
    bare[tier] ??= at(tier, {});
    const r = at(tier, lift), d = (r - bare[tier]) * 100, step = (r - prev) * 100;
    console.log(`${label.padEnd(26)}  ${(r * 100).toFixed(1)}%  (比印的 ${d >= 0 ? '+' : ''}${d.toFixed(1)}，这一步 ${step >= 0 ? '+' : ''}${step.toFixed(1)}，印的 ${(bare[tier] * 100).toFixed(1)}%)`);
    if (Math.abs(step) > 8) problems.push(`${label} 这一步改了 ${step.toFixed(1)} 个百分点 — 她长一步不该替人打仗`);
    if (r > 0.97 || d > 20) problems.push(`${label} 赢 ${(r * 100).toFixed(1)}%（+${d.toFixed(1)}）— 她一人把仗打完了`);
    return r;
  };
  // The yardstick: 练气, her card as printed. Each realm's lift should keep
  // the fight near it — the beast grows with the realm too (battle.js REALMS),
  // and printed she falls behind (元婴 79% against 练气 89%, 2026-09-24).
  const ref = at('qi', {});
  console.log(`\n银月（会读场的，对全部牌组；练气印的样子 ${(ref * 100).toFixed(1)}% 是准绳）`);
  let lift = {};
  for (const [tier, l] of Object.entries(HER.realm ?? {})) {
    bare[tier] ??= at(tier, {});
    lift = { ...l };
    row(`${zh[tier] ?? tier} · +${l.atk ?? 0}/+${l.hp ?? 0}`, tier, lift, ref);
  }
  const top = Object.keys(HER.realm ?? {}).pop() ?? 'core';
  let prev = at(top, lift);
  for (const g of HER.gifts ?? []) {
    lift = addLift(lift, g.lift);
    prev = row(`${zh[top] ?? top} + 第${g.found}鼎 ${g.name?.zh ?? g.id}`, top, lift, prev);
  }
  row(`${zh[top] ?? top} 全 + 齐纨 +0/+1`, top, addLift(lift, { hp: 1 }), prev);
}

async function herOnly() {
  const { foeTurn } = await import('../scripts/battle.js');
  globalThis.__battle = { foeTurn };
  const problems = [];
  herRows(fieldDecks(5), problems);
  console.log(problems.length ? `\n闸：${problems.length} 处越界\n · ${problems.join('\n · ')}` : '\n闸：全部在带内');
  if (process.argv.includes('--gate') && problems.length) process.exit(1);
}

async function kitOnly() {
  const { foeTurn } = await import('../scripts/battle.js');
  globalThis.__battle = { foeTurn };
  const decks = fieldDecks(5);
  const problems = [];
  gearRows(decks, problems);
  console.log(problems.length ? `\n闸：${problems.length} 处越界\n · ${problems.join('\n · ')}` : '\n闸：全部在带内');
  if (process.argv.includes('--gate') && problems.length) process.exit(1);
}

/* Each piece of gear alone, then everything a player could wear at once, each
   against the line that reads the table with nothing on. A piece is weighed
   where it can matter: the 佩 against the element it wards (玉珏 — 土), the
   本命法宝 at 结丹, where it is bound. Alone, none may move the win rate more
   than 15 points; all of it together must not make the fight a sure thing. */
const rootBeasts = root => CREATURES.filter(c => c.deck && c.root === root && !c.elite).map(c => c.id);
function gearRows(decks, problems) {
  const iron = itemEffect('iron-sword'), bamboo = itemEffect('bamboo-sword');
  const ring = wardOf('jade-ring'), ringRoot = Object.keys(ring)[0], zh = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
  const rows = [
    ['竹剑 · 一击 +' + weaponPower(bamboo.atk), { power: weaponPower(bamboo.atk) }],
    ['铁剑 · 一击 +' + weaponPower(iron.atk), { power: weaponPower(iron.atk) }],
    ['蓑衣 · 护体 ' + armorOf('straw-cloak'), { armor: armorOf('straw-cloak') }],
    [`玉珏 · 抗${zh[ringRoot]} ${ring[ringRoot]}（只对${zh[ringRoot]}）`, { ward: ring }, { foes: rootBeasts(ringRoot) }],
    ['符 · 一道在手', { extra: ['yinyue', CHARM] }],
    [`本命法宝 一重（铁剑炼）· +${treasurePower(iron.atk, 1)}`, { power: treasurePower(iron.atk, 1) }, { tiers: ['core'] }],
    [`本命法宝 九重（铁剑炼）· +${treasurePower(iron.atk, 9)}`, { power: treasurePower(iron.atk, 9) }, { tiers: ['core'] }],
    ['全副（铁剑·蓑衣·符）', { power: weaponPower(iron.atk), armor: armorOf('straw-cloak'), extra: ['yinyue', CHARM] }],
    [`全副 + 玉珏（对${zh[ringRoot]}）`, { power: weaponPower(iron.atk), armor: armorOf('straw-cloak'), ward: ring, extra: ['yinyue', CHARM] }, { foes: rootBeasts(ringRoot) }],
    ['全副 结丹（本命九重·蓑衣·符）', { power: treasurePower(iron.atk, 9), armor: armorOf('straw-cloak'), extra: ['yinyue', CHARM] }, { tiers: ['core'] }],
    // 闭关 (rules/seclusion.mjs): a 功法 tempered to ★n — −1 灵力 a star down
    // to 1, then +1 to its number. One card a seclusion; over weeks every
    // spell in the deck can reach ★3, so that is weighed as the ceiling.
    ['闭关 每张功法 ★1', { stars: starsAll(1) }],
    ['闭关 每张功法 ★2', { stars: starsAll(2) }],
    ['全副 闭关 每张功法 ★3（封顶）', { stars: starsAll(3) }],
  ];
  const bases = new Map();
  const baseOf = opts => {
    const k = JSON.stringify(opts);
    if (!bases.has(k)) bases.set(k, run(smart, { decks, ...opts }).rate);
    return bases.get(k);
  };
  console.log('\n装备入局（会读场的，对全部牌组；各比同样条件下什么都不带）');
  for (const [label, you, opts = {}] of rows) {
    const base = baseOf(opts), r = run(smart, { decks, you, ...opts });
    const d = (r.rate - base) * 100;
    console.log(`${label.padEnd(24)}  ${(r.rate * 100).toFixed(1)}%  (${d >= 0 ? '+' : ''}${d.toFixed(1)}，不带 ${(base * 100).toFixed(1)}%)`);
    if (!label.startsWith('全副') && Math.abs(d) > 15) problems.push(`${label} 改了 ${d.toFixed(1)} 个百分点 — 带进门的东西不该替人打仗`);
    if (label.startsWith('全副') && (r.rate > 0.97 || d > 20)) problems.push(`${label} 赢 ${(r.rate * 100).toFixed(1)}%（+${d.toFixed(1)}）— 穿戴齐了，仗就不是仗了`);
  }
}

/* ── 首领牌 — each chapter boss's card, tamed and taken into a deck ──
   Every one of the ten carries its legend as a verb (2026-09-25): 夫诸 floods,
   雷神 drums, 夔 steals a turn's 灵力, 无支祁 chains, 防风氏 stands, 巴蛇
   swallows, 夔牛 rallies, 肥遗 parches, 泰逢 stirs the qi. Each is weighed the
   way a player meets it: swapped into a built deck for the card nearest its
   cost, against the same deck without it. One tamed beast may lift a deck,
   never carry it — more than BOSS_BAND points and it is the card that wins. */
const BOSSES = ['fuzhu', 'paoxiao', 'leishen', 'kui', 'wuzhiqi', 'fangfeng', 'bashe', 'kuiniu', 'feiyi', 'taifeng'];
const BOSS_BAND = 12;
function withBoss(cards, id) {
  const cost = CATALOG[id].cost;
  const out = cards.filter(x => x !== id);
  // A deck that already holds it gives that slot back to a plain card of its cost.
  while (out.length < cards.length) out.push(ALL.find(x => !BOSSES.includes(x) && !out.includes(x) && CATALOG[x].cost === cost && CATALOG[x].kind === 'minion') ?? 'xiaoyao');
  const without = [...out];
  let at = 0;
  out.forEach((x, i) => { if (Math.abs(CATALOG[x].cost - cost) < Math.abs(CATALOG[out[at]].cost - cost)) at = i; });
  out[at] = id;
  return { without, with: out };
}
function bossRows(problems) {
  const built = ARCHETYPES.map(a => ({ ...a, built: true }));
  console.log(`\n首领牌（换进五副原型，比不带它；越过 ${BOSS_BAND} 点报越界）`);
  for (const id of BOSSES) {
    const c = CATALOG[id];
    const pairs = built.map(d => ({ d, ...withBoss(d.cards, id) }));
    const a = run(smart, { decks: pairs.map(p => ({ ...p.d, cards: p.with })) });
    const b = run(smart, { decks: pairs.map(p => ({ ...p.d, cards: p.without })) });
    const d = (a.rate - b.rate) * 100;
    const seen = (a.played.get(id) ?? 0) / a.games;
    const body = `${c.cost}费 ${c.atk}/${c.hp}`;
    console.log(`${c.name.padEnd(5)} ${body.padEnd(9)} ${(a.rate * 100).toFixed(1)}%  (${d >= 0 ? '+' : ''}${d.toFixed(1)}，不带 ${(b.rate * 100).toFixed(1)}%)  出场 ${(seen * 100).toFixed(0)}%`);
    if (Math.abs(d) > BOSS_BAND) problems.push(`${c.name} 换进牌组改了 ${d.toFixed(1)} 个百分点 — 一只收服的妖不该替人打仗`);
    if (seen < 0.05) problems.push(`${c.name} 带着也几乎不出 — 废牌`);
  }
}

async function bossOnly() {
  const { foeTurn } = await import('../scripts/battle.js');
  globalThis.__battle = { foeTurn };
  const problems = [];
  bossRows(problems);
  console.log(problems.length ? `\n闸：${problems.length} 处越界\n · ${problems.join('\n · ')}` : '\n闸：全部在带内');
  if (process.argv.includes('--gate') && problems.length) process.exit(1);
}

async function main() {
  if (process.argv.includes('--bosses')) return bossOnly();
  if (process.argv.includes('--kit')) return kitOnly();
  if (process.argv.includes('--her')) return herOnly();
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

  // 带进门的 — 问卦 (its element's 功法 ±n) and her lift by the story; the gear is below.
  // Each should lift or lower the attentive line a few points, never decide it.
  const base = smartRun.rate;
  console.log('\n带进门的（会读场的，对全部牌组）');
  const kit = [
    ['问斗法 大吉 · 本行功法 +2', root => ({ boost: { element: root, n: 2 } })],
    ['问斗法 吉 · +1', root => ({ boost: { element: root, n: 1 } })],
    ['问斗法 凶 · −1', root => ({ boost: { element: root, n: -1 } })],
    ['问斗法 大凶 · −2', root => ({ boost: { element: root, n: -2 } })],
  ];
  for (const [label, you] of kit) {
    const r = run(smart, { decks, you });
    const d = (r.rate - base) * 100;
    console.log(`${label.padEnd(20)}  ${(r.rate * 100).toFixed(1)}%  (${d >= 0 ? '+' : ''}${d.toFixed(1)})`);
    if (Math.abs(d) > (label.startsWith('银月') ? 8 : 15)) problems.push(`${label} 改了 ${d.toFixed(1)} 个百分点 — 带进门的东西不该替人打仗`);
  }

  gearRows(decks, problems);
  herRows(decks, problems);
  bossRows(problems);

  // 杀招 — the key turn (battle.js § 杀招). A climax, not a wall: most won
  // fights meet it, and it should cost a careless player, not end the day.
  let met = 0, metLost = 0, n = 0;
  for (const deck of decks) for (const tier of ['qi', 'foundation', 'core']) for (const foeRoot of ELEMENTS) {
    const st = play(setupOf({ tier, root: deck.root, deck: deck.cards, foeRoot, seed: `sig|${deck.id}|${tier}|${foeRoot}` }), smart);
    n += 1;
    if (st.log.some(t => t.act === 'charge')) { met += 1; if (st.outcome === 'lost') metLost += 1; }
  }
  console.log(`\n杀招  碰到它的仗 ${(met / n * 100).toFixed(0)}% · 其中输的 ${(metLost / Math.max(1, met) * 100).toFixed(1)}%`);
  if (!process.env.NO_SIG && met / n < 0.6) problems.push(`只有 ${(met / n * 100).toFixed(0)}% 的仗碰到杀招 — 关键回合不在多数仗里`);
  if (metLost / Math.max(1, met) > 0.25) problems.push(`碰到杀招的仗输了 ${(metLost / met * 100).toFixed(1)}% — 杀招成了墙`);

  // 精英 — its harder deck and nothing more (redesign-v2 § 四, 2026-09-24: the
  // full 气血, the 12 体力, the half-again pay and the second card were cut, and
  // with them 伤势). Every beast stands at the mode's share; an elite should
  // still be the harder fight — by its deck alone — and never a wall.
  const ELITES = CREATURES.filter(c => c.elite && c.deck), PLAIN = CREATURES.filter(c => !c.elite && c.deck);
  const vs = (deck, c, seed) => play({ mode: 'pve', seed, you: { tier: 'foundation', root: deck.root, deck: deck.cards, extra: ['yinyue'] }, foe: { tier: 'foundation', root: c.root, deck: c.deck, ...(process.env.NO_SIG ? {} : { signature: c.signature }) } }, smart);
  const rate = c => { let w = 0, n = 0; for (const deck of decks) for (let d = 0; d < 6; d += 1) { n += 1; if (vs(deck, c, `x${d}|${deck.id}`).outcome === 'won') w += 1; } return w / n; };
  const eliteRate = ELITES.reduce((a, c) => a + rate(c), 0) / Math.max(1, ELITES.length);
  const plainRate = PLAIN.reduce((a, c) => a + rate(c), 0) / Math.max(1, PLAIN.length);
  console.log(`\n精英（只是牌更难）赢 ${(eliteRate * 100).toFixed(1)}%  （寻常 ${(plainRate * 100).toFixed(1)}%）`);
  for (const c of ELITES) console.log(`  ${c.id.padEnd(10)} ${(rate(c) * 100).toFixed(1)}%`);
  if (ELITES.length && eliteRate >= plainRate) problems.push(`精英赢 ${(eliteRate * 100).toFixed(1)}%，不比寻常难 — 牌组该更难`);
  if (ELITES.length && eliteRate < 0.35) problems.push(`精英只赢 ${(eliteRate * 100).toFixed(1)}% — 成了墙`);

  const ent = entropy(decks);
  const pct = x => `${(x * 100).toFixed(0)}%`;
  console.log(`\n决策熵（每回合：最好的打法与第三好的，胜率差几个点；${ROLLOUTS} 个未来）`);
  console.log(`中位 ${(ent.median * 100).toFixed(1)} 点  —  健康区间 5–15`);
  console.log(`${ent.turns} 个回合：只有一种打法 ${ent.forced} · 一条路(>20) ${pct(ent.oneLine)} · 有得选(3–20) ${pct(ent.game)} · 怎么打都一样(<3) ${pct(ent.flat)}，其中胜负已定 ${pct(ent.settled)}`);
  if (ent.median > 0.2) problems.push(`决策熵 ${(ent.median * 100).toFixed(1)} 点 — 多数回合只有一条路`);
  if (ent.flat - ent.settled > 0.5) problems.push(`过半回合怎么打都一样 — 没有决策`);

  console.log(problems.length ? `\n闸：${problems.length} 处越界\n · ${problems.join('\n · ')}` : '\n闸：全部在带内');
  if (gate && problems.length) process.exit(1);
}

main();
