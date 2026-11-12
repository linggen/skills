// duel-audit.mjs — weighs the cards of 斗法 v4 (design.md § 「斗法 v4」, the fitting order's step 2: the cards without gear).
// Analysis only; it changes no card, no number, no rule. Three views:
//
//   node tools/duel-audit.mjs cards                     the paper table: points for the cost, every card that can be in a deck
//   node tools/duel-audit.mjs fights [--seeds N] [--only key,key] [--all]
//                                                       his ten against the beast's ten, level, who runs dry first (bare gear)
//   node tools/duel-audit.mjs mirror [--seeds N] [--cards id,id|--tails 15|--all] [--level L] [--json]
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
import { act, begin, EFFECTS, legal, simCopy } from '../scripts/battle.js';
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

/// The even setup of two sheets at one level: no root, no gear, no pill, no party.
export function sheetSetup(deckYou, deckFoe, seed, level = 10) {
  const hp = 20 + level, tier = level > 27 ? 'nascent' : level > 18 ? 'core' : level > 9 ? 'foundation' : 'qi';
  return { mode: 'pve', even: true, seed, you: { tier, step: 0, base: hp, root: null, deck: deckYou }, foe: { tier, root: null, deck: deckFoe, hp_fixed: hp } };
}

/// One fight, both sides by the careful line: 'won' (his side), 'lost', or 'open' when it never ended in 400 moves.
export function playSheets(deckYou, deckFoe, seed, level = 10) {
  const st = begin(sheetSetup(deckYou, deckFoe, seed, level), catalog);
  for (let g = 0; g < 400 && st.outcome === 'open'; g += 1) {
    const who = st.whose, a = carefulFor(st, who);
    act(st, a ?? { kind: 'end' }, who);
  }
  return st;
}

/// B (deck with the card swapped in) against A, each deal twice with the seats swapped; B's win rate, draws half.
export function mirrorRate(deckA, deckB, seeds, level = 10) {
  let score = 0, turns = 0, games = 0;
  for (let k = 0; k < seeds; k += 1) {
    for (const bFirst of [true, false]) {
      const st = bFirst ? playSheets(deckB, deckA, `mirror|${k}`, level) : playSheets(deckA, deckB, `mirror|${k}`, level);
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
export function mirrorCard(card, bases, seeds, level = 10) {
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
    const seeds = Number(arg('--seeds', 200)), level = Number(arg('--level', 10)), tails = Number(arg('--tails', 15));
    const tailIds = [...table.slice(0, tails), ...table.slice(-tails)].map(r => r.id);
    const bases = [{ name: 'mix', deck: parTen(table, new Set(tailIds)) }, { name: 'bodies', deck: parTen(table, new Set(tailIds), { bodies: true }) }], t0 = Date.now(), rows = [];
    const inBase = id => bases.every(b => b.deck.includes(id));
    const pickIds = arg('--cards', null)?.split(',') ?? (args.includes('--all') ? table.map(r => r.id).filter(id => !inBase(id)) : tailIds);
    for (const b of bases) console.error(`deck ${b.name}: ${show(b.deck)}  (cost ${sumCost(b.deck)})`);
    for (const id of pickIds) {
      const row = table.find(r => r.id === id), per = mirrorCard(catalog[id], bases, seeds, level);
      rows.push({ id, name: row.name, cost: row.cost, points: row.points, ...per });
      console.error(`${id} ${row.points} -> ${per.delta} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    const rho = spearman(rows.map(r => r.points), rows.map(r => r.delta));
    if (json) console.log(JSON.stringify({ seeds, level, decks: Object.fromEntries(bases.map(b => [b.name, b.deck])), rows, spearman: r2(rho) }, null, 1));
    else { for (const r of rows) console.log(`${String(r.points).padStart(5)} ${String(r.delta).padStart(6)} (${r.bases.map(b => b.delta).join(' / ')}) ${r.cost} ${r.id.padEnd(12)} ${r.name}`); console.log(`spearman ${r2(rho)}`); }
  } else console.log('usage: node tools/duel-audit.mjs cards|fights|mirror  (see the head of this file)');
}
