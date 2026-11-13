// duel-audit.mjs — weighs the cards of 斗法 v4 (design.md § 「斗法 v4」, the fitting order's step 2: the cards without gear).
// Analysis only; it changes no card, no number, no rule. Three views:
//
//   node tools/duel-audit.mjs cards                     the paper table: points for the cost, every card that can be in a deck
//   node tools/duel-audit.mjs scope|budget|length [--bare-gear] [--seeds N]|level [--at L --up 1,2 --line l]
//   node tools/duel-audit.mjs fights [--seeds N] [--only key,key] [--all]
//                                                       his ten against the beast's ten, level, who runs dry first (bare gear)
//   node tools/duel-audit.mjs mirror [--seeds N] [--cards id,id|--tails 15|--all] [--level L] [--no-fatigue] [--line careful|lookahead] [--scope] [--exclude id,id] [--json]
//                                                       two identical sheets, deck A against deck A with one card swapped for the card under test
//
// PAPER FORMULA (one line, the same for every card, v3's yardstick 1.2 damage per cost single / 0.7 per target sweep):
//   points = (atk + hp + effect) / (1.2·cost + 2)  for a body;   effect / (1.2·cost)  for a spell, (1.4·cost) for a sweep;
//   effect = damage n → n · sweep n → 2n (two bodies, 0.7 each) · heal n → n · draw n → 1.2n · drain 1 → 1.2 · buff → its atk+hp ·
//   rally → 2 × its atk+hp · summon → n × the token's atk+hp · 护主 → +1; the verbs chain / swallow / drought are judged (below).
//   1.00 is on the curve, above it the card is worth more than its cost.
// MIRROR: both sides one sheet at one level (foundation, L 10, 气血 30), no root, no gear, no pill; deck A is a par ten
// (cost curve 1 1 2 2 2 3 3 4 4 5), deck B is A with the card of the same cost swapped for the card under test; BOTH sides
// are played by the `careful` line (fightline.js's, here for either side), A as first mover on one deal and as second on the
// next, so the first-move edge cancels. The delta is B's win rate − 50.
import { act, begin, EFFECTS, foeTurn, legal, simCopy } from '../scripts/battle.js';
import { lookahead } from '../scripts/fightline.js';
import { FIGHTS, content, keyOf, roadState, setupOf, foeOf } from './story-fights.mjs';
import { withRules } from './duel-lines.mjs';
import { fightLevel, foeLevel } from '../scripts/rules/cards.mjs';

const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
const r2 = x => Math.round(x * 100) / 100;

/* ── 1. The paper table ── */

/// The judged verbs, in damage-equivalents: a chained body sits out a turn (two 灵力's worth), a swallow drives off a body of
/// 攻 up to n (≈ n+3 stats), a drought hits each of two bodies for n over two turns, a dodge turns n blows (2 each).
const JUDGED = { chain: () => 2.4, swallow: n => n + 3, drought: n => 4 * n, dodge: n => 2 * n };

/// What a card's effect is worth, in damage-equivalents (see the formula above). `tokens` is the card rows by id.
export function effectValue(effect, tokens = catalog) {
  let v = 0;
  for (const [k, raw] of Object.entries(effect ?? {})) {
    const n = typeof raw === 'number' ? raw : 0, body = o => (o?.atk ?? 0) + (o?.hp ?? 0);
    if (k === 'damage' || k === 'heal') v += n;
    else if (k === 'sweep') v += 2 * n;
    else if (k === 'draw' || k === 'drain') v += 1.2 * n;
    else if (k === 'buff') v += body(raw);
    else if (k === 'rally') v += 2 * body(raw);
    else if (k === 'summon') v += (raw.n ?? 1) * body(tokens[raw.id]);
    else if (JUDGED[k]) v += JUDGED[k](n);
  }
  return v;
}

/// Points for its cost: 1.00 is on v3's curve. A body is weighed with a +2 stand-in for being a body at all.
export function cardPoints(card, tokens = catalog) {
  const cost = Math.max(1, card.cost ?? 1), fx = effectValue(card.effect, tokens);
  if (card.kind === 'minion') {
    const value = (card.atk ?? 0) + (card.hp ?? 0) + fx + ((card.keywords ?? []).includes('taunt') ? 1 : 0);
    return { value: r2(value), par: r2(1.2 * cost + 2), points: r2(value / (1.2 * cost + 2)) };
  }
  const par = (card.effect?.sweep != null ? 1.4 : 1.2) * cost;
  return { value: r2(fx), par: r2(par), points: r2(fx / par) };
}

/// A card that can be in a deck: not a token, a pill, a charm or a mortal's own skill.
export const deckable = c => !c._token && !c.pill && !c.mortal && !c.charm;

const effectWords = c => {
  const e = c.effect ?? {}, kw = (c.keywords ?? []).map(k => (k === 'taunt' ? '护主' : k === 'battlecry' ? '入阵' : k));
  const fx = Object.entries(e).map(([k, v]) => `${k}${typeof v === 'number' ? ` ${v}` : ` ${JSON.stringify(v)}`}`).join(' + ');
  return [c.kind === 'minion' ? `${c.atk}/${c.hp}` : '', ...kw, fx].filter(Boolean).join(' ');
};

/// Every deckable card with its points, best value first.
export function paperTable(cards = content.cards.cards, tokens = Object.fromEntries(cards.map(x => [x.id, x]))) {
  return cards.filter(deckable).map(c => ({ id: c.id, name: c.name.zh, kind: c.kind, cost: c.cost, owner: c.owner ?? null, what: effectWords(c), ...cardPoints(c, tokens) }))
    .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
}

/* ── 5. Scope: what a player can hold in 卷一 ── */

const creatureOf = (c, id) => c.creatures.creatures.find(x => x.id === id);
const sceneJuan = (c, id) => Object.values(c.chapters).find(ch => ch.scenes?.[id])?.juan;
/// Is the card an ordinary deck card of 卷一 (held from its book, bought, or won from a 卷一 beast or person)? `why` names the cut otherwise:
/// 'owner' (a companion's, 银月 too), 'no source' (a gear's card), 'foe art' (a person's own art: from.kind foe, creature foe-*), 'later 卷'.
export function scopeOf(card, c = content) {
  if (card.owner) return { in: false, why: String(card.owner).startsWith('foe-') ? 'foe art' : 'owner' };
  const from = card.from ?? [];
  if (!from.length) return { in: false, why: 'no source' };
  if (from.every(f => f.kind === 'foe' && String(f.creature).startsWith('foe-'))) return { in: false, why: 'foe art' };
  const here = f => {
    if (f.kind === 'story' || f.kind === 'beat') return f.scene ? sceneJuan(c, f.scene) === 1 : true;
    if (f.kind === 'beast' || f.kind === 'foe' || f.kind === 'tame') return (creatureOf(c, f.creature)?.juan ?? 1) === 1;
    return f.kind === 'shop' || f.kind === 'tale' || f.kind === 'summon';
  };
  return from.some(here) ? { in: true, why: '' } : { in: false, why: 'later 卷' };
}

/* ── 4. The mirror ── */

const SLOTS = [1, 1, 2, 2, 2, 3, 3, 4, 4, 5];
/// A par ten: for each cost slot the plain card (no verb that needs a target on the board) nearest 1.00 points, never one of
/// `exclude`, bodies and blows alternating (or `bodies`: bodies only, so no spell's own strength sits in the base). Counted, never random.
export function parTen(table, exclude = new Set(), { bodies = false } = {}) {
  const plain = table.filter(r => !exclude.has(r.id) && !r.owner && !/buff|rally|summon|chain|swallow|drought|drain|dodge|bite|draw|heal/.test(r.what) && !(bodies && /入阵/.test(r.what)));
  const used = new Set(), ten = [];
  SLOTS.forEach((cost, i) => {
    const kind = bodies || !(i % 2) ? 'minion' : 'spell';
    const pool = plain.filter(r => r.cost === cost && !used.has(r.id));
    const pick = [...pool.filter(r => r.kind === kind), ...(bodies ? pool.filter(r => r.kind === 'minion') : pool)].sort((a, b) => Math.abs(a.points - 1) - Math.abs(b.points - 1) || a.id.localeCompare(b.id))[0];
    if (!pick) throw new Error(`no par card at cost ${cost}`);
    used.add(pick.id);
    ten.push(pick.id);
  });
  return ten;
}

/// Deck A with the card under test in place of ONE slot of its own cost (the dearest cost for a dearer card): one deck for each
/// such slot, so the card is weighed against every card of its cost in A, not against one.
export function swapIns(deck, card, tokens = catalog) {
  const cost = Math.min(card.cost, Math.max(...deck.map(id => tokens[id].cost)));
  return [...deck.keys()].filter(i => tokens[deck[i]].cost === cost).map(at => ({ at, replaced: deck[at], deck: deck.map((id, i) => (i === at ? card.id : id)) }));
}

/* The careful line (fightline.js `careful`, small) for either side: every legal move weighed by what it leaves on the board. */
const bodyOf = side => side.board.reduce((n, m) => n + m.atk + m.hp * 0.6 + (m.taunt ? 2 : 0), 0);
function movesOf(st, who) {
  const me = st[who], them = st[who === 'you' ? 'foe' : 'you'], out = [];
  const aims = [undefined, ...them.board.map((m, index) => ({ kind: 'minion', index }))];
  me.hand.forEach((id, index) => {
    const c = st.catalog[id], at = c && EFFECTS[Object.keys(EFFECTS).find(k => c.effect?.[k] != null)]?.at;
    const targets = at === 'enemy' || at === 'minion' ? aims : at === 'friendly' && me.board.length ? me.board.map((m, i) => ({ kind: 'minion', index: i })) : [undefined];
    for (const target of targets) out.push({ kind: 'play', index, target });
  });
  for (const target of aims) out.push({ kind: 'power', target });
  me.board.forEach((m, index) => { for (const target of aims) out.push({ kind: 'attack', index, target }); });
  return out.filter(a => legal(st, a, who) === null);
}
/// The move the careful line makes for `who` now, or null (end the turn).
export function carefulFor(st, who) {
  const opp = who === 'you' ? 'foe' : 'you';
  let best = null, top = 0.5;
  for (const a of movesOf(st, who)) {
    const copy = simCopy(st);
    if (!act(copy, a, who).ok) continue;
    const v = (st[opp].hp - copy[opp].hp) * 2 + (copy[who].hp - st[who].hp) + (bodyOf(copy[who]) - bodyOf(st[who])) * 1.2 + (bodyOf(st[opp]) - bodyOf(copy[opp]));
    if (v > top) { top = v; best = a; }
  }
  return best;
}

/// Mirror options: a number is the level; else { level (10), levelYou, levelFoe (a seat one level up), fatigue (false: a dry pile costs nothing,
/// the setup's `fatigue: false`), line ('careful' | 'lookahead') }.
const optsOf = o => { const x = typeof o === 'number' ? { level: o } : o ?? {}, level = x.level ?? 10; return { level, levelYou: x.levelYou ?? level, levelFoe: x.levelFoe ?? level, fatigue: x.fatigue !== false, line: x.line ?? 'careful', from: x.from ?? 0 }; };
const tierAt = level => (level > 27 ? 'nascent' : level > 18 ? 'core' : level > 9 ? 'foundation' : 'qi');

/// The even setup of two sheets: no root, no gear, no pill, no party; each seat's 气血 is 20 + its level, its realm the level's.
export function sheetSetup(deckYou, deckFoe, seed, o = 10) {
  const x = optsOf(o), off = x.fatigue ? {} : { fatigue: false };
  return {
    mode: 'pve', even: true, seed,
    you: { tier: tierAt(x.levelYou), step: 0, base: 20 + x.levelYou, root: null, deck: deckYou, ...off },
    foe: { tier: tierAt(x.levelFoe), root: null, deck: deckFoe, hp_fixed: 20 + x.levelFoe, ...off },
  };
}

/* The lookahead line for either seat: every move tried on a copy and the fight played out from there, BOTH seats by the careful line
   (fightline.js lookahead does this for his seat and lets the beast's own policy answer); the move whose ending is best is made. */
function rollout(st, who) {
  const opp = who === 'you' ? 'foe' : 'you';
  for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) {
    const w = st.whose;
    act(st, carefulFor(st, w) ?? { kind: 'end' }, w);
  }
  if (st.outcome === 'open') return -st[opp].hp;
  const winner = st.outcome === 'won' ? 'you' : 'foe';
  return winner === who ? 1000 + st[who].hp : -1000 - st[opp].hp;
}
export function lookaheadFor(st, who) {
  let best = null, top = -Infinity;
  for (const a of [...movesOf(st, who), { kind: 'end' }]) {
    const copy = simCopy(st);
    if (!act(copy, a, who).ok) continue;
    const v = rollout(copy, who);
    if (v > top) { top = v; best = a; }
  }
  return best?.kind === 'end' ? null : best;
}
const LINES = { careful: carefulFor, lookahead: lookaheadFor };

/// One fight, both seats by the same line: 'won' (the `you` seat), 'lost', or 'open' when it never ended in 400 moves.
export function playSheets(deckYou, deckFoe, seed, o = 10) {
  const x = optsOf(o), line = LINES[x.line], st = begin(sheetSetup(deckYou, deckFoe, seed, x), catalog);
  for (let g = 0; g < 400 && st.outcome === 'open'; g += 1) {
    const who = st.whose, a = line(st, who);
    act(st, a ?? { kind: 'end' }, who);
  }
  return st;
}

/// B (deck with the card swapped in) against A, each deal twice with the seats swapped; B's win rate, draws half. `o.levelB`: B a level up.
export function mirrorRate(deckA, deckB, seeds, o = 10) {
  const x = optsOf(o), levelB = typeof o === 'object' && o.levelB != null ? o.levelB : x.level;
  let score = 0, turns = 0, games = 0;
  for (let k = x.from; k < x.from + seeds; k += 1) {
    for (const bFirst of [true, false]) {
      const seat = bFirst ? { levelYou: levelB, levelFoe: x.level } : { levelYou: x.level, levelFoe: levelB };
      const st = bFirst ? playSheets(deckB, deckA, `mirror|${k}`, { ...x, ...seat }) : playSheets(deckA, deckB, `mirror|${k}`, { ...x, ...seat });
      const bWon = bFirst ? st.outcome === 'won' : st.outcome === 'lost';
      score += st.outcome === 'open' ? 0.5 : bWon ? 1 : 0;
      turns += st.turn;
      games += 1;
    }
  }
  return { win: score / games, turns: turns / games, games };
}

/// One card against every base: B = base with the card in place of each slot of its cost in turn; the delta (B's win rate − 50) is the
/// mean over the slots and over the bases that do not already hold the card.
export function mirrorCard(card, bases, seeds, level = 10) { // `level`: a number or the mirror options (optsOf)
  const per = bases.filter(b => !b.deck.includes(card.id)).map(b => {
    const runs = swapIns(b.deck, card).map(w => ({ ...w, ...mirrorRate(b.deck, w.deck, seeds, level) }));
    const win = runs.reduce((n, w) => n + w.win, 0) / runs.length, turns = runs.reduce((n, w) => n + w.turns, 0) / runs.length;
    return { base: b.name, replaced: runs.map(w => w.replaced), delta: r2((win - 0.5) * 100), turns: r2(turns), games: runs.length * runs[0].games };
  });
  return { delta: r2(per.reduce((n, b) => n + b.delta, 0) / per.length), bases: per };
}

/* ── ranks ── */

/// Rank positions (1 = highest) with ties sharing their mean.
export function ranks(xs) {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]), out = Array(xs.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    for (let k = i; k <= j; k += 1) out[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}
/// Spearman's rank correlation of two lists (−1 … 1).
export function spearman(a, b) {
  const ra = ranks(a), rb = ranks(b), n = a.length, ma = (n + 1) / 2;
  const cov = ra.reduce((s, x, i) => s + (x - ma) * (rb[i] - ma), 0), va = ra.reduce((s, x) => s + (x - ma) ** 2, 0), vb = rb.reduce((s, x) => s + (x - ma) ** 2, 0);
  return va && vb ? cov / Math.sqrt(va * vb) : 0;
}

/* ── 3. His ten against the beast's ten ── */

const sumCost = ids => ids.reduce((n, id) => n + (catalog[id]?.cost ?? 0), 0);
const show = ids => ids.map(id => `${catalog[id]?.name.zh ?? id}${catalog[id]?.cost ?? '?'}`).join(' ');

/// A fight's two tens, levels and 气血 as the door locks them (gear off), with the turn each side first pays 反噬
/// (the careful line for him, the beast's own policy), mean over `seeds`.
export function describeFight(f, opts = {}) { return withRules(true, () => describeEven(f, opts)); }
function describeEven(f, { seeds = 20, bare = true } = {}) {
  const setup = setupOf(f, { party: [], bare }), st = roadState(f, { bare }), beast = foeOf(f);
  const L = fightLevel(content, st), Lf = foeLevel(content, st, beast) ?? L;
  const dry = { you: 0, foe: 0, n: { you: 0, foe: 0 } };
  for (let k = 0; k < seeds; k += 1) {
    const s = begin({ ...setup, seed: `band|${k}` }, catalog);
    const seen = {};
    for (let g = 0; g < 400 && s.outcome === 'open'; g += 1) {
      const who = s.whose, a = who === 'you' ? carefulFor(s, 'you') : null;
      if (who === 'you') act(s, a ?? { kind: 'end' }, 'you'); else { act(s, carefulFor(s, 'foe') ?? { kind: 'end' }, 'foe'); }
      for (const w of ['you', 'foe']) if (s[w].fatigue > 0 && seen[w] == null) seen[w] = s.turn;
    }
    for (const w of ['you', 'foe']) if (seen[w] != null) { dry[w] += seen[w]; dry.n[w] += 1; }
  }
  const mean = w => (dry.n[w] ? r2(dry[w] / dry.n[w]) : null);
  return {
    key: keyOf(f), name: f.name, at: f.at, level: L, foeLevel: Lf, hp: setup.you.base, foeHp: setup.foe.hp_fixed,
    you: { ten: setup.you.deck, cost: sumCost(setup.you.deck), text: show(setup.you.deck) },
    foe: { ten: setup.foe.deck, cost: sumCost(setup.foe.deck), text: show(setup.foe.deck) },
    dryTurn: { you: mean('you'), foe: mean('foe'), youShare: r2(dry.n.you / seeds), foeShare: r2(dry.n.foe / seeds) },
  };
}

/* ── 2. How long the even fights run, and what empties first ── */

/// A fight's length under the even rules, the band's line for him (fightline.js lookahead) and the beast's own policy, mean over `seeds`:
/// the plies it runs, the ply at which each pile first stands empty (and in what share of fights), 反噬's share of what the LOSER's hero took,
/// and in how many fights the killing blow was 反噬. `null` where the even rules do not reach the fight.
export function lengthOf(f, { seeds = 40, bare = false } = {}) {
  return withRules(true, () => {
    const setup = setupOf(f, { party: [], bare });
    if (!setup.even) return null;
    const t = { turns: 0, empty: { you: [], foe: [] }, fat: 0, taken: 0, killed: 0, lost: 0, games: 0 };
    for (let k = 0; k < seeds; k += 1) {
      const st = begin({ ...setup, seed: `band|${k}` }, catalog), seen = {};
      for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) {
        if (st.whose === 'foe') foeTurn(st); else act(st, lookahead(st), 'you');
        for (const w of ['you', 'foe']) if (seen[w] == null && st[w].deck.length === 0) seen[w] = st.turn;
      }
      for (const w of ['you', 'foe']) if (seen[w] != null) t.empty[w].push(seen[w]);
      t.turns += st.turn; t.games += 1;
      if (st.outcome === 'open') continue;
      const loser = st.outcome === 'won' ? 'foe' : 'you', hits = st.log.filter(e => e.act === 'hurt' && e.who === loser);
      const amount = e => (e.amount ?? 0) + (e.absorbed ?? 0);
      t.taken += hits.reduce((n, e) => n + amount(e), 0);
      t.fat += hits.filter(e => e.kind === 'fatigue').reduce((n, e) => n + amount(e), 0);
      if (hits.at(-1)?.kind === 'fatigue') t.killed += 1;
      t.lost += 1;
    }
    const mean = xs => (xs.length ? r2(xs.reduce((n, x) => n + x, 0) / xs.length) : null);
    return {
      key: keyOf(f), name: f.name, turns: r2(t.turns / t.games),
      empty: { you: mean(t.empty.you), foe: mean(t.empty.foe), youShare: r2(t.empty.you.length / seeds), foeShare: r2(t.empty.foe.length / seeds) },
      fatigueShare: t.taken ? r2(t.fat / t.taken) : 0, killedByFatigue: r2(t.killed / Math.max(1, t.lost)),
    };
  });
}

/* ── 7. Deck cost by level ── */

/// His ten's total cost (as fightDeck builds it under the even rules), the beast's ten's, and the budget the beast's follows (13 + 1.5 x level).
export function budgetRow(f) {
  return withRules(true, () => {
    const setup = setupOf(f, { party: [], bare: true }), st = roadState(f, { bare: true }), beast = foeOf(f);
    if (!setup.even) return null;
    const L = fightLevel(content, st), Lf = foeLevel(content, st, beast) ?? L, k = content.balance.duel_hp.foe.deck;
    const his = sumCost(setup.you.deck), its = sumCost(setup.foe.deck), budget = Math.round(k.base + k.per_level * Lf);
    return { key: keyOf(f), level: L, his, foeLevel: Lf, its, budget, diff: its - his, size: setup.you.deck.length };
  });
}

/* ── CLI ── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), cmd = args[0], arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const json = args.includes('--json'), table = paperTable();
  if (cmd === 'cards') {
    if (json) console.log(JSON.stringify(table, null, 1));
    else for (const r of table) console.log(`${r.points.toFixed(2)} ${String(r.cost).padStart(2)} ${r.kind.padEnd(6)} ${r.id.padEnd(12)} ${r.name.padEnd(8)} ${r.what}${r.owner ? `  [${r.owner}]` : ''}  (${r.value}/${r.par})`);
  } else if (cmd === 'fights') {
    const only = arg('--only', null)?.split(','), seeds = Number(arg('--seeds', 20));
    const rows = FIGHTS.filter(f => !only || only.includes(keyOf(f))).map(f => describeFight(f, { seeds })).filter(r => r.foe.ten.length);
    console.log(JSON.stringify(rows, null, 1));
  } else if (cmd === 'mirror') {
    const seeds = Number(arg('--seeds', 200)), tails = Number(arg('--tails', 15)), scoped = args.includes('--scope');
    const o = { level: Number(arg('--level', 10)), fatigue: !args.includes('--no-fatigue'), line: arg('--line', 'careful'), from: Number(arg('--from', 0)) };
    const ofScope = r => !scoped || scopeOf(catalog[r.id]).in, listed = table.filter(ofScope);
    const tailIds = [...listed.slice(0, tails), ...listed.slice(-tails)].map(r => r.id), keep = new Set([...tailIds, ...(arg('--exclude', '') ?? '').split(',').filter(Boolean)]);
    const bases = [{ name: 'mix', deck: parTen(table, keep) }, { name: 'bodies', deck: parTen(table, keep, { bodies: true }) }], t0 = Date.now(), rows = [];
    const inBase = id => bases.every(b => b.deck.includes(id));
    const pickIds = arg('--cards', null)?.split(',') ?? (args.includes('--all') ? listed.map(r => r.id).filter(id => !inBase(id)) : tailIds);
    for (const b of bases) console.error(`deck ${b.name}: ${show(b.deck)}  (cost ${sumCost(b.deck)})`);
    for (const id of pickIds) {
      const row = table.find(r => r.id === id) ?? { name: catalog[id].name.zh, cost: catalog[id].cost, points: cardPoints(catalog[id]).points }, per = mirrorCard(catalog[id], bases, seeds, o);
      rows.push({ id, name: row.name, cost: row.cost, points: row.points, ...per });
      console.error(`${id} ${row.points} -> ${per.delta} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    const rho = spearman(rows.map(r => r.points), rows.map(r => r.delta));
    if (json) console.log(JSON.stringify({ seeds, ...o, decks: Object.fromEntries(bases.map(b => [b.name, b.deck])), rows, spearman: r2(rho) }, null, 1));
    else { for (const r of rows) console.log(`${String(r.points).padStart(5)} ${String(r.delta).padStart(6)} (${r.bases.map(b => b.delta).join(' / ')}) ${r.cost} ${r.id.padEnd(12)} ${r.name}`); console.log(`spearman ${r2(rho)}`); }
  } else if (cmd === 'scope') {
    const rows = table.map(r => ({ ...r, ...scopeOf(catalog[r.id]) }));
    if (json) console.log(JSON.stringify(rows, null, 1));
    else for (const r of rows) console.log(`${r.in ? 'in ' : 'OUT'} ${r.points.toFixed(2)} ${r.id.padEnd(12)} ${r.name} ${r.why}`);
  } else if (cmd === 'level') {
    // identical decks, one seat one level (or two) up: win-rate points per level, both lines
    const seeds = Number(arg('--seeds', 400)), at = Number(arg('--at', 5)), line = arg('--line', 'careful'), ups = (arg('--up', '1,2')).split(',').map(Number);
    const ten = parTen(table, new Set()), rows = [];
    for (const up of ups) { const m = mirrorRate(ten, ten, seeds, { level: at, levelB: at + up, line }); rows.push({ at, up, line, win: r2(m.win), points: r2((m.win - 0.5) * 100), games: m.games }); console.error(JSON.stringify(rows.at(-1))); }
    console.log(JSON.stringify({ deck: ten, rows }, null, 1));
  } else if (cmd === 'length') {
    const only = arg('--only', null)?.split(','), seeds = Number(arg('--seeds', 40)), bare = args.includes('--bare-gear');
    console.log(JSON.stringify(FIGHTS.filter(f => !only || only.includes(keyOf(f))).map(f => lengthOf(f, { seeds, bare })).filter(Boolean), null, 1));
  } else if (cmd === 'budget') {
    console.log(JSON.stringify(FIGHTS.map(budgetRow).filter(Boolean), null, 1));
  } else console.log('usage: node tools/duel-audit.mjs cards|fights|mirror  (see the head of this file)');
}
