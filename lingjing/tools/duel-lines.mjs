// duel-lines.mjs — the measuring instrument for 斗法 v4 (design.md): in a FAIR fight (both sides one sheet) a player who
// thinks beats one who plays carelessly, and neither always wins. Every fight of tools/story-fights.mjs, alone (no
// companions), played by both lines over fixed seeds, with the even rules ON (balance.json `duel_hp.foe.deck`, set here in
// memory — the file is not touched) and OFF (the rules as they stand).
//
//   node tools/duel-lines.mjs [--seeds N] [--only key,id] [--rules on|off|both] [--bare-gear] [--pills] [--fit | --knobs '{json}'] [--patch '{json}'] [--creatures '{json}'] [--decks '{key: [ids]}'] [--json]
//   --pills: his 丹囊 carries the band's two pills; --fit / --knobs: the fit's knob block over EVEN (in memory).
//   --patch: card fields changed in memory for the run, e.g. '{"huochai":{"atk":4,"hp":3}}' (a proposal weighed, nothing written).
//   --creatures: creature fields changed in memory, e.g. '{"lang":{"wit":"plain"}}' (a wit or a deck weighed before it is written).
//   --decks: a beast's deck by fight key, changed in memory (a proposal weighed; creatures.json is not edited).
//   --bare-gear: nothing worn, no 符, no pill on his side (default off: the output is as it was).
//
// Three lines: `thinking` is `lookahead` (scripts/fightline.js), `careless` is `careful` (tools/trial-sim.mjs fightOnce, one-ply
// greedy) and `plain` is the first card he sees (fightline.js `plain`: the first card that can be played, the first body to
// strike, the root strike — the design's careless player). `lookahead` rolls out with `careful` in a fair fight, so thinking >=
// careful holds by construction there; careful against plain is what shows the fight rewards thought at all. Seeds fixed
// (`band|0..N-1`), output stable. A fight the even rules do not reach (a 试, a 零层 fight) shows `-` under ON.
import { FIGHTS, TWO_PILLS, content, keyOf, rateOf, setupOf } from './story-fights.mjs';
import { plain, plainFor, carefulFor, lookaheadFor, mixFor } from '../scripts/fightline.js';
import { act, begin, foeStep, foeTurn } from '../scripts/battle.js';
import { performance } from 'node:perf_hooks';

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
export const EVEN = { share: { weak: 1, normal: 1, strong: 1 }, by_hp: [], top: 'strong', deck: { size: 10, base: 13, per_level: 1.5, keep: 4 } };

/* The knob block of the fit (docs: duel-audit-2026-11-12.md § The fit), over EVEN, in memory only — balance.json is not touched and the
   live rules read none of it while `duel_hp.foe` is absent. `gear`: × on a worn thing's fight points (whole numbers after); `deck.by_rank`: the
   ten's budget by the beast's class (`by_hp` reads the class off creatures.json `hp`); `step`: levels above his by class (never past his realm).
   Left empty here: EVEN alone is today's even set; `FIT` below is the set the fourth try ends on (skill by standing). */
export const KNOBS_OFF = {};
export const FIT = {
  gear: 0.2, deck: { per_level: 1.3 },
  ai: { by_standing: { roaming: 'foe', room: 'foe', xiong: 'careful', boss: 'careful', story: 'foe' } },
};
/* The third try's set (skill by level, class shifting it), kept for the record. */
export const FIT_BY_LEVEL = {
  gear: 0.2, deck: { per_level: 1.3 }, by_hp: [[1.3, 'weak'], [2.0, 'normal']],
  ai: { by_level: [1, 6], class_step: { weak: 0, normal: 1, strong: 0 } }, step: { normal: 1, strong: 1 },
};
/* The second try's set (the beast's line by class), kept for the record: `--knobs` with it reads as before. */
export const FIT_BY_CLASS = {
  gear: 0.2, deck: { per_level: 1.3 }, by_hp: [[1.3, 'weak'], [2.0, 'normal']],
  ai: { weak: 'careful', normal: 'lookahead', strong: 'lookahead' }, step: { strong: 1 },
};

const merge = (a, b) => (b && typeof b === 'object' && !Array.isArray(b) ? Object.fromEntries([...new Set([...Object.keys(a ?? {}), ...Object.keys(b)])].map(k => [k, k in b ? merge(a?.[k], b[k]) : a[k]])) : b);

/// Fields of cards changed in memory (`{ id: { field: value } }`) for the run of `f`, put back after: a proposal weighed without writing it.
export function withCards(patch, f) {
  const held = Object.entries(patch ?? {}).map(([id, fields]) => { const c = catalog[id]; if (!c) throw new Error(`no card ${id}`); return [c, Object.fromEntries(Object.keys(fields).map(k => [k, c[k]])), fields]; });
  for (const [c, , fields] of held) Object.assign(c, fields);
  try { return f(); } finally { for (const [c, old] of held) for (const [k, v] of Object.entries(old)) { if (v === undefined) delete c[k]; else c[k] = v; } }
}

/// Fields of creatures changed in memory (`{ id: { wit, deck, ... } }`) for the run of `f`, put back after: a wit or a deck weighed before it is written.
export function withCreatures(patch, f) {
  const held = Object.entries(patch ?? {}).map(([id, fields]) => { const c = content.creatures.creatures.find(x => x.id === id); if (!c) throw new Error(`no creature ${id}`); return [c, Object.fromEntries(Object.keys(fields).map(k => [k, c[k]])), fields]; });
  for (const [c, , fields] of held) Object.assign(c, fields);
  try { return f(); } finally { for (const [c, old] of held) for (const [k, v] of Object.entries(old)) { if (v === undefined) delete c[k]; else c[k] = v; } }
}

/// A fight's beast deck changed in memory for the run of `g` (a pool entry carries its own over the creature's, story-fights foeOf), put back after.
export function withDeck(f, deck, g) {
  if (!deck) return g();
  if (!f.pool) return withCreatures({ [f.id]: { deck } }, g);
  const e = Object.values(content.places).map(p => p.pools?.[f.pool]).find(Boolean)?.beasts.find(b => b.creature === f.id);
  const had = e.deck; e.deck = deck;
  try { return g(); } finally { if (had === undefined) delete e.deck; else e.deck = had; }
}

/// Run `f` with the even switch on or off (the content's balance edited in memory, put back after). `knobs`: a block merged over EVEN.
export function withRules(on, f, knobs = KNOBS_OFF) {
  const hp = content.balance.duel_hp, had = hp.foe;
  if (on) hp.foe = structuredClone(merge(EVEN, knobs)); else delete hp.foe;
  try { return f(); } finally { if (had === undefined) delete hp.foe; else hp.foe = had; }
}

/// The first-card line over fixed seeds: { win, turns }.
function plainRate(setup, seeds, from) {
  let won = 0, turns = 0;
  for (let k = from; k < from + seeds; k += 1) {
    const st = begin({ ...setup, seed: `band|${k}` }, catalog);
    for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) {
      if (st.whose === 'foe') { foeTurn(st); continue; }
      const o = plain(st);
      act(st, o ? o.action : { kind: 'end' }, 'you');
    }
    if (st.outcome === 'won') won += 1;
    turns += st.turn;
  }
  return { win: won / seeds, turns: turns / seeds };
}

/// One fight under one rule set: the three lines' win and the turns, alone; null when the even rules do not apply.
export function duel(fight, { on, seeds = 40, from = 0, bare = false, pills = null, knobs = KNOBS_OFF }) {
  return withRules(on, () => {
    const setup = setupOf(fight, { party: [], bare, pills });
    if (on && !setup.even) return null;
    const think = rateOf(fight, seeds, from, 'lookahead', { party: [], bare, pills }), care = rateOf(fight, seeds, from, 'careful', { party: [], bare, pills }), first = plainRate(setup, seeds, from);
    return { thinking: think.win, careless: care.win, plain: first.win, gap: think.win - care.win, gapPlain: care.win - first.win, turns: (think.turns + care.turns + first.turns) / 3 };
  }, knobs);
}

/// The summary against the acceptance: thinking >= careless in 90% of fights, mean gap >= 15 points where careless is 10-90%;
/// and the mean of each line with the two gaps (thinking - careless, careless - plain).
export function summary(rows) {
  const ok = rows.filter(r => r.even);
  const mid = ok.filter(r => r.even.careless >= 0.1 && r.even.careless <= 0.9);
  const mean = (list, f) => (list.length ? list.reduce((n, r) => n + f(r.even), 0) / list.length : 0);
  return {
    fights: ok.length, thinkingAtLeast: ok.filter(r => r.even.thinking >= r.even.careless).length, careless_ge_plain: ok.filter(r => r.even.careless >= r.even.plain).length, mid: mid.length,
    meanGap: mean(mid, r => r.gap), meanGapAll: mean(ok, r => r.gap),
    mean: { thinking: mean(ok, r => r.thinking), careless: mean(ok, r => r.careless), plain: mean(ok, r => r.plain) },
    gaps: { thinking_careless: mean(ok, r => r.gap), careless_plain: mean(ok, r => r.gapPlain) },
  };
}

/// Mirror the road's bare ten onto the beast, retaining the story fight's roots and other rules.
export function mirrorLines({ seeds = 60 } = {}) {
  const names = ['plain', 'careful', 'lookahead'], enemies = ['foe', 'careful', 'lookahead'];
  const lines = { plain: plainFor, careful: carefulFor, lookahead: lookaheadFor };
  const times = [], cells = {};
  return withRules(true, () => {
    const fights = FIGHTS.map(f => ({ f, setup: setupOf(f, { party: [], bare: true }) })).filter(x => x.setup.even && !x.f.teach);
    for (const you of names) for (const foe of enemies) {
      let wins = 0, losses = 0, near = 0, unfinished = 0;
      for (const { setup } of fights) for (let k = 0; k < seeds; k += 1) {
        const config = structuredClone(setup);
        config.you.extra = [];
        config.foe.deck = [...config.you.deck];
        config.foe.ai = null;
        const st = begin({ ...config, seed: `band|${k}` }, catalog);
        for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) {
          if (st.whose === 'foe' && foe === 'foe') { foeStep(st); continue; }
          const who = st.whose, name = who === 'you' ? you : foe;
          const start = name === 'lookahead' ? performance.now() : 0;
          const action = lines[name](st, who);
          if (name === 'lookahead') times.push(performance.now() - start);
          if (!act(st, action ?? { kind: 'end' }, who).ok) throw new Error('line returned an illegal move');
        }
        if (st.outcome === 'won') wins += 1;
        else if (st.outcome === 'lost') { losses += 1; if (st.foe.hp <= st.foe.hpMax * 0.25) near += 1; }
        else unfinished += 1;
      }
      cells[`${you}/${foe}`] = { wins, losses, near, unfinished, games: fights.length * seeds };
      console.error(`${you}/${foe}: ${JSON.stringify(cells[`${you}/${foe}`])}`);
    }
    times.sort((a, b) => a - b);
    return { seeds, fights: fights.length, cells, timing: { moves: times.length, mean: times.reduce((a, b) => a + b, 0) / times.length, p95: times[Math.ceil(times.length * 0.95) - 1] } };
  });
}

/// The same mirror and deals, with a mixed beast or a within-realm level increase.
export function mirrorWits({ seeds = 30, wits = [0.15, 0.3, 0.5] } = {}) {
  if (!Number.isInteger(seeds) || seeds < 1 || wits.some(w => !Number.isFinite(w) || w < 0 || w > 1)) throw new RangeError('invalid seeds or wit');
  return withRules(true, () => {
    const fights = FIGHTS.map(f => ({ f, setup: setupOf(f, { party: [], bare: true }) })).filter(x => x.setup.even && !x.f.teach);
    const cells = {};
    const cases = [...['careful', 'lookahead'].flatMap(you => wits.map(wit => ({ you, wit, up: 0 }))), ...[1, 2].map(up => ({ you: 'careful', wit: 0, up }))];
    for (const { you, wit, up } of cases) {
      let wins = 0, losses = 0, near = 0, unfinished = 0;
      for (const { setup } of fights) for (let k = 0; k < seeds; k++) {
        const config = structuredClone(setup);
        config.you.extra = []; config.foe.deck = [...config.you.deck]; config.foe.ai = null;
        // On the even sheet 20 + level is the fixed HP. Keep the realm unchanged.
        config.foe.hp_fixed += up;
        const st = begin({ ...config, seed: `band|${k}` }, catalog);
        for (let g = 0; g < 300 && st.outcome === 'open'; g++) {
          const who = st.whose;
          const action = who === 'you' ? (you === 'careful' ? carefulFor(st, who) : lookaheadFor(st, who)) : mixFor(st, who, { wit });
          if (!act(st, action ?? { kind: 'end' }, who).ok) throw new Error('line returned an illegal move');
        }
        if (st.outcome === 'won') wins++;
        else if (st.outcome === 'lost') { losses++; if (st.foe.hp <= st.foe.hpMax * 0.25) near++; }
        else unfinished++;
      }
      const key = up ? `${you}/level+${up}` : `${you}/mix:${wit}`;
      cells[key] = { wins, losses, near, unfinished, games: fights.length * seeds };
      console.error(`${key}: ${JSON.stringify(cells[key])}`);
    }
    return { seeds, fights: fights.length, cells };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  if (args.includes('--mirror-lines')) {
    const wits = arg('--wits', null);
    console.log(JSON.stringify(wits === null ? mirrorLines({ seeds: Number(arg('--seeds', 60)) }) : mirrorWits({ seeds: Number(arg('--seeds', 30)), wits: wits.split(',').map(Number) }), null, 2));
    process.exit(0);
  }
  const seeds = Number(arg('--seeds', 40)), only = arg('--only', null)?.split(','), rules = arg('--rules', 'both'), bare = args.includes('--bare-gear'), pills = args.includes('--pills') ? TWO_PILLS : null, knobs = args.includes('--fit') ? FIT : args.includes('--knobs') ? JSON.parse(arg('--knobs', '{}')) : KNOBS_OFF;
  const patch = JSON.parse(arg('--patch', '{}'));
  const creatures = JSON.parse(arg('--creatures', '{}')), decks = JSON.parse(arg('--decks', '{}'));
  const rows = withCreatures(creatures, () => withCards(patch, () => FIGHTS.filter(f => !only || only.includes(keyOf(f)) || only.includes(f.id)).map(f => ({
    key: keyOf(f), name: f.name, at: f.at,
    ...(rules !== 'off' ? { even: withDeck(f, decks[keyOf(f)], () => duel(f, { on: true, seeds, bare, pills, knobs })) } : {}), ...(rules !== 'on' ? { main: duel(f, { on: false, seeds, bare }) } : {}),
  }))));
  if (args.includes('--json')) console.log(JSON.stringify({ seeds, rows, summary: summary(rows) }, null, 1));
  else {
    const pc = x => (x * 100).toFixed(0).padStart(4);
    const cell = r => (r ? `${pc(r.thinking)} ${pc(r.careless)} ${pc(r.plain)} ${pc(r.gap)} ${pc(r.gapPlain)} ${r.turns.toFixed(1).padStart(5)}` : '   -    -    -    -    -     -');
    const head = 'think care plain  t-c  c-p turns';
    console.log(`${'fight'.padEnd(34)} ${rules !== 'off' ? `EVEN ${head}` : ''}${rules === 'both' ? '  |' : ''}${rules !== 'on' ? ` MAIN ${head}` : ''}`);
    for (const r of rows) console.log(`${r.key.padEnd(34).slice(0, 34)} ${rules !== 'off' ? ' ' + cell(r.even) : ''}${rules === 'both' ? '  |' : ''}${rules !== 'on' ? '  ' + cell(r.main) : ''}`);
    if (rules !== 'off') console.log(JSON.stringify(summary(rows)));
  }
}
