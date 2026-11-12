// duel-lines.mjs — the measuring instrument for 斗法 v4 (design.md): in a FAIR fight (both sides one sheet) a player who
// thinks beats one who plays carelessly, and neither always wins. Every fight of tools/story-fights.mjs, alone (no
// companions), played by both lines over fixed seeds, with the even rules ON (balance.json `duel_hp.foe.deck`, set here in
// memory — the file is not touched) and OFF (the rules as they stand).
//
//   node tools/duel-lines.mjs [--seeds N] [--only key,id] [--rules on|off|both] [--json]
//
// Three lines: `thinking` is `lookahead` (scripts/fightline.js), `careless` is `careful` (tools/trial-sim.mjs fightOnce, one-ply
// greedy) and `plain` is the first card he sees (fightline.js `plain`: the first card that can be played, the first body to
// strike, the root strike — the design's careless player). `lookahead` rolls out with `careful` in a fair fight, so thinking >=
// careful holds by construction there; careful against plain is what shows the fight rewards thought at all. Seeds fixed
// (`band|0..N-1`), output stable. A fight the even rules do not reach (a 试, a 零层 fight) shows `-` under ON.
import { FIGHTS, content, keyOf, rateOf, setupOf } from './story-fights.mjs';
import { plain } from '../scripts/fightline.js';
import { act, begin, foeTurn } from '../scripts/battle.js';

export const EVEN = { share: { weak: 1, normal: 1, strong: 1 }, by_hp: [], top: 'strong', deck: { size: 10, base: 13, per_level: 1.5, keep: 4 } };

/// Run `f` with the even switch on or off (the content's balance edited in memory, put back after).
export function withRules(on, f) {
  const hp = content.balance.duel_hp, had = hp.foe;
  if (on) hp.foe = structuredClone(EVEN); else delete hp.foe;
  try { return f(); } finally { if (had === undefined) delete hp.foe; else hp.foe = had; }
}

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
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
export function duel(fight, { on, seeds = 40, from = 0 }) {
  return withRules(on, () => {
    const setup = setupOf(fight, { party: [] });
    if (on && !setup.even) return null;
    const think = rateOf(fight, seeds, from, 'lookahead', { party: [] }), care = rateOf(fight, seeds, from, 'careful', { party: [] }), first = plainRate(setup, seeds, from);
    return { thinking: think.win, careless: care.win, plain: first.win, gap: think.win - care.win, gapPlain: care.win - first.win, turns: (think.turns + care.turns + first.turns) / 3 };
  });
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const seeds = Number(arg('--seeds', 40)), only = arg('--only', null)?.split(','), rules = arg('--rules', 'both');
  const rows = FIGHTS.filter(f => !only || only.includes(keyOf(f)) || only.includes(f.id)).map(f => ({
    key: keyOf(f), name: f.name, at: f.at,
    ...(rules !== 'off' ? { even: duel(f, { on: true, seeds }) } : {}), ...(rules !== 'on' ? { main: duel(f, { on: false, seeds }) } : {}),
  }));
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
