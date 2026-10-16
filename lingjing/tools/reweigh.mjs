// reweigh.mjs — weigh each of 卷一's fights back into its band by the beast's 气血 alone (Hanli,
// 2026-10-15: about 60% the first time; 2026-10-16: the cards moved — every card gained in the
// story, a party beside him from 古七 — so every fight is weighed again). The lookahead player
// (scripts/fightline.js) at `--seeds` fixed deals; the beast's `hp` is bisected (log scale) until
// the fight is won about `--target` of the time, and written where that fight reads it: a scene's
// exit game `foe.hp`, or a pool entry's `hp`. Cards, decks and pay are never touched.
//
//   node tools/reweigh.mjs [--seeds 30] [--target 0.6] [--only key,key] [--write]
import fs from 'node:fs';
import path from 'node:path';
import { content, FIGHTS, keyOf, rateOf } from './story-fights.mjs';
import { creatureOf } from '../scripts/rules/world.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SEEDS = Number(opt('--seeds', 30)), TARGET = Number(opt('--target', 0.6));
const only = args.includes('--only') ? opt('--only').split(',') : null;

/* Where a fight's 气血 lives, as a getter and a setter on the loaded content. */
function slotOf(f) {
  if (f.scene) {
    const [sid, eid] = f.scene.split('/');
    const game = Object.values(content.chapters).map(ch => ch.scenes?.[sid]).find(Boolean).exits.find(e => e.id === eid).game;
    const base = creatureOf(content, f.id).hp ?? 1;
    return { get: () => game.foe?.hp ?? base, set: v => { game.foe = { ...(game.foe ?? {}), hp: v }; }, where: `scene ${sid}/${eid}` };
  }
  const entry = Object.values(content.places).map(p => p.pools?.[f.pool]).find(Boolean).beasts.find(b => b.creature === f.id);
  const base = creatureOf(content, f.id).hp ?? 1;
  return { get: () => entry.hp ?? base, set: v => { entry.hp = v; }, where: `pool ${f.pool}` };
}

const round = v => Math.round(v * 20) / 20;
function weigh(f) {
  const slot = slotOf(f), was = slot.get();
  const rate = v => { slot.set(v); return rateOf(f, SEEDS, 0, 'lookahead'); };
  let lo = 0.1, hi = 9, best = { hp: was, r: rate(was) };
  const ok = r => Math.abs(r.win - TARGET) <= 0.08;
  if (ok(best.r)) return { f, was, hp: was, r: best.r, where: slot.where };
  for (let i = 0; i < 9; i += 1) {
    const mid = round(Math.sqrt(lo * hi));
    const r = rate(mid);
    if (Math.abs(r.win - TARGET) < Math.abs(best.r.win - TARGET)) best = { hp: mid, r };
    if (ok(r)) break;
    if (r.win > TARGET) lo = mid; else hi = mid;
    if (hi / lo < 1.08) break;
  }
  slot.set(best.hp);
  return { f, was, hp: best.hp, r: best.r, where: slot.where };
}

const rows = [];
for (const f of FIGHTS.filter(f => !only || only.includes(keyOf(f)) || only.includes(f.id))) {
  const w = weigh(f);
  rows.push(w);
  console.log(`${f.name.padEnd(30)} ${f.at.padEnd(5)} hp ${String(w.was).padStart(5)} → ${String(w.hp).padStart(5)}  win ${(w.r.win * 100).toFixed(0).padStart(3)}%  lost ${(w.r.lost * 100).toFixed(0).padStart(3)}%  dry ${(w.r.withdrew * 100).toFixed(0).padStart(3)}%  (${w.where})`);
}

/* Written into the files, as text, so each file keeps its own layout: a pool entry's `"hp": n` on
   its creature's line, a scene's exit game `foe`. */
if (args.includes('--write')) {
  for (const w of rows.filter(w => w.hp !== w.was)) {
    if (w.f.scene) {
      const [sid] = w.f.scene.split('/');
      const ch = Object.values(content.chapters).find(c => c.scenes?.[sid]);
      const file = path.join(content.dir, 'chapters', ch.id, 'scenes', `${sid}.json`);
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      const game = j.exits.find(e => e.id === w.f.scene.split('/')[1]).game;
      game.foe = { ...(game.foe ?? {}), hp: w.hp };
      fs.writeFileSync(file, JSON.stringify(j, null, 1) + '\n');
    } else {
      const dir = path.join(content.dir, 'places');
      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name), t = fs.readFileSync(file, 'utf8');
        const j = JSON.parse(t);
        const pool = j.pools?.[w.f.pool];
        if (!pool) continue;
        const entry = pool.beasts.find(b => b.creature === w.f.id);
        entry.hp = w.hp;
        // keep the file's own layout: rewrite only this entry's object, found by its creature in this pool
        fs.writeFileSync(file, rewriteEntry(t, w.f.pool, w.f.id, w.hp));
      }
    }
  }
  console.log('written');
}

/* The pool's entry for `creature`, its `hp` set (added after `"creature": "<id>"` when it has none). */
function rewriteEntry(text, pool, creature, hp) {
  const at = text.indexOf(`"${pool}"`);
  if (at < 0) throw new Error(`pool ${pool} not found`);
  const i = text.indexOf(`"creature": "${creature}"`, at);
  const close = text.indexOf('}', i);
  const obj = text.slice(i, close);
  const next = /"hp":\s*[\d.]+/.test(obj) ? obj.replace(/"hp":\s*[\d.]+/, `"hp": ${hp}`) : obj.replace(`"creature": "${creature}"`, `"creature": "${creature}", "hp": ${hp}`);
  return text.slice(0, i) + next + text.slice(close);
}
