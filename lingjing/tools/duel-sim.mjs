// duel-sim.mjs — the gate for 斗法 (design.md § 斗法). Plays every creature
// against every root set at every step, under a few lines of play, and says
// whether the numbers hold:
//
//   · any single choice repeated wins under 30%
//   · an attentive line wins over 75%
//   · four roots and a starting weapon beat every creature, 木 ones included
//   · neither side wins by making the other spend 灵力 alone
//
// Run: node tools/duel-sim.mjs [--tier qi|foundation|core|nascent] [--verbose]
// It reads the real creatures.json, so a lean or a pattern changed here is
// judged at once. tests/duel.test.mjs runs a small version of the same gate.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEATS, ELEMENTS, GENERATES, TIERS, fight, foeOf, offers } from '../scripts/duel.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const world = path.join(here, '..', 'worlds', 'jiuding');
const creatures = JSON.parse(fs.readFileSync(path.join(world, 'creatures.json'), 'utf8')).creatures;
const items = JSON.parse(fs.readFileSync(path.join(world, 'items.json'), 'utf8')).items;
const itemOf = id => items.find(i => i.id === id);

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const VERBOSE = process.argv.includes('--verbose');
const MAX_TURNS = 40;

/* The five root sets a player can be born with: four of the five. */
const ROOT_SETS = ELEMENTS.map(missing => ELEMENTS.filter(e => e !== missing));

const kitOf = (roots, tier, step, { weapon = null, robe = null, charm = 0, arts = {} } = {}) => ({
  roots, tier, step, arts, charm: charm ? { id: 'talisman', held: charm } : null,
  ...(weapon ? { weapon: { id: weapon.id, atk: weapon.effect.atk }, sword: weapon.effect.root } : {}),
  ...(robe ? { robe: { def: robe.effect.def } } : {}),
});

/* Play a whole fight under one policy: actions in, outcome out. */
function play(foe, kit, policy) {
  const actions = [];
  for (let n = 0; n < MAX_TURNS; n += 1) {
    const f = fight(actions, foe, kit);
    if (f.outcome !== 'open') return { ...f, actions };
    const can = offers(actions, foe, kit).filter(o => o.ok);
    const next = policy(f, foe, kit, can, actions);
    if (!next || !can.some(o => o.token === next)) return { ...f, actions, stuck: true };
    actions.push(next);
  }
  return { ...fight(actions, foe, kit), actions, capped: true };
}

/* One choice, over and over — the rolling game his question caught. When it
   cannot be played, the rote player waits rather than reaching for the best
   thing to hand: reaching would make it an attentive line. */
const always = token => (f, foe, kit, can) => {
  if (can.some(o => o.token === token)) return token;
  const wait = can.find(o => o.kind === 'assist') ?? [...can].filter(o => o.kind !== 'charm').sort((a, b) => a.cost - b.cost)[0];
  return wait?.token;
};

/* The attentive line: 护体 against a gathered blow, 聚势 before a blow worth
   lifting, and otherwise the choice that takes the most 气血 for the least
   灵力 — the counter root when it is theirs, the blade into a warded hide,
   the 符 to finish. It asks duel.js itself what each choice would do, so the
   gate can never drift from the rules. */
function worth(actions, token, foe, kit) {
  const before = fight(actions, foe, kit);
  const after = fight([...actions, token], foe, kit);
  return { dealt: before.foe.hp - after.foe.hp, spent: Math.max(0, before.you.qi - after.you.qi) };
}

function attentive(f, foe, kit, can, actions) {
  const has = t => can.some(o => o.token === t);
  if (f.foe.gather && has('assist:guard')) return 'assist:guard';
  // 借势 rides the cast, so the ranking below finds it by itself: a borrowed
  // 火→土 simply deals more for its 灵力 than a root that overcomes nothing.
  const hits = can
    .filter(o => o.kind !== 'assist')
    .map(o => ({ ...o, ...worth(actions, o.token, foe, kit) }))
    .filter(o => o.dealt > 0)
    .sort((a, b) => b.dealt / (b.spent + 1) - a.dealt / (a.spent + 1));
  const best = hits[0];
  if (!best) return can[0]?.token;
  // 聚势 before the finishing blow: only when lifting it ends the fight.
  if (!f.you.focus && has('assist:focus') && best.dealt < f.foe.hp && Math.round(best.dealt * 1.5) >= f.foe.hp) return 'assist:focus';
  if (has('talisman') && f.foe.hp <= 12) return 'talisman';
  return best.token;
}

/* What a player can be standing with. 借势 is the prologue's own art — the
   companion teaches it — and it is how a root the player was not born with
   is reached: cast the element that generates it. */
const KITS = {
  bare: {},
  sword: {},
  geared: { robe: itemOf('straw-cloak') },
  'sword+借势': { arts: { jieshi: { effect: 'generate', ready: true } } },
  'sword+符': { charm: 1 },
};

const LINES = {
  ...Object.fromEntries(ELEMENTS.map(e => [`always ${e}`, always(`cast:${e}`)])),
  'always strike': always('strike'),
  'always guard': always('assist:guard'),
  attentive,
};

function run(tier) {
  const rows = [];
  for (const [name, policy] of Object.entries(LINES)) {
    for (const [gear, extra] of Object.entries(KITS)) {
      let wins = 0, games = 0, dry = 0;
      const pairs = new Map(); // creature × root set — none may be unwinnable
      for (const c of creatures) {
        for (const roots of ROOT_SETS) {
          for (let step = 0; step < 9; step += 2) {
            for (let day = 0; day < 5; day += 1) {
              const sword = gear === 'bare' ? null : itemOf(roots.includes('metal') ? 'bamboo-sword' : 'iron-sword');
              const kit = kitOf(roots, tier, step, { weapon: sword, ...extra });
              const r = play(foeOf(c, tier, step, `${day}|${c.id}`), kit, policy);
              games += 1;
              const pair = `${c.id}|${roots.join('')}`;
              pairs.set(pair, (pairs.get(pair) ?? 0) + (r.outcome === 'won' ? 1 : 0));
              if (r.outcome === 'won') wins += 1;
              if (r.foe.qi <= 0 || (r.you.qi <= 0 && r.you.hp > 0)) dry += 1;
            }
          }
        }
      }
      rows.push({ line: name, gear, rate: wins / games, games, dry: dry / games, lost: [...pairs].filter(([, w]) => !w).map(([k]) => k) });
    }
  }
  return rows;
}

/* --pair <creature>|<roots> tells which day and step of one pair fail. */
const PAIR = arg('--pair');
if (PAIR) {
  const [cid, rootKey] = PAIR.split('|');
  const c = creatures.find(x => x.id === cid);
  const roots = ROOT_SETS.find(r => r.join('') === rootKey);
  for (let step = 0; step < 9; step += 2) {
    const line = [];
    for (let day = 0; day < 5; day += 1) {
      const sword = itemOf(roots.includes('metal') ? 'bamboo-sword' : 'iron-sword');
      const kit = kitOf(roots, arg('--tier', 'qi'), step, { weapon: sword, ...KITS[arg('--gear', 'sword+借势')] });
      const r = play(foeOf(c, arg('--tier', 'qi'), step, `${day}|${c.id}`), kit, attentive);
      line.push(`${day}:${r.outcome === 'won' ? 'won ' : `lost(${r.you.hp}hp ${r.you.qi}qi vs ${r.foe.hp}hp)`}`);
    }
    console.log(` step ${step}  ${line.join('  ')}`);
  }
  process.exit(0);
}

const pct = n => `${(n * 100).toFixed(1)}%`;
let failed = 0;
const gate = (ok, what) => { if (!ok) { failed += 1; console.log(`  ✗ ${what}`); } else if (VERBOSE) console.log(`  ✓ ${what}`); };

for (const tier of arg('--tier') ? [arg('--tier')] : TIERS) {
  console.log(`\n── ${tier} ──`);
  const rows = run(tier);
  for (const r of rows) {
    console.log(`  ${r.line.padEnd(14)} ${r.gear.padEnd(7)} ${pct(r.rate).padStart(6)}  (灵力-out ${pct(r.dry)})${VERBOSE && r.lost.length ? `  lost to ${r.lost.join(' ')}` : ''}`);
  }
  const rote = rows.filter(r => r.line !== 'attentive');
  const smart = rows.filter(r => r.line === 'attentive');
  gate(rote.every(r => r.rate < 0.3), `rote lines stay under 30% (worst ${pct(Math.max(...rote.map(r => r.rate)))})`);
  const armed = smart.filter(r => r.gear !== 'bare');
  gate(armed.every(r => r.rate > 0.75), `the attentive line beats 75% armed (worst ${pct(Math.min(...armed.map(r => r.rate)))})`);
  const born = smart.find(r => r.gear === 'sword+借势');
  gate(born?.lost.length === 0, `no fight is lost by birth — roots, a sword and 借势 beat every creature${born?.lost.length ? ` (never: ${born.lost.join(' ')})` : ''}`);
  const plain = smart.find(r => r.gear === 'sword');
  if (VERBOSE && plain?.lost.length) console.log(`  · roots and a sword alone never beat: ${plain.lost.join(' ')}`);
  gate(smart.every(r => r.dry < 0.25), `灵力 alone does not decide (worst ${pct(Math.max(...smart.map(r => r.dry)))})`);
}
console.log(failed ? `\n${failed} gate(s) failed` : '\nthe gate holds');
process.exit(failed ? 1 : 0);
