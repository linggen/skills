// rules/lines.mjs — each line its own 修为 and ladder (Hanli 2026-10-27, story 宇宙.md § 三条线，各自一套修为与境界; design.md
// § 境界 in the game). 古, 今 and 未来 don't advance together, so a line beside the book's own keeps its own place on its own
// ladder (ladder.json `lines.<line>`: its hero, its nine realms) in the save's `lines.<line>` ({tier, step, progress, stretch?};
// state.mjs lineStart). 古 stays where it always stood — the save's own `tier` · `step` · `progress` — so no old save moves.
// A line's boards pay that line by the same share of the layer as 古's (rules/playpay.mjs), on its own ladder and its own
// hours (balance.json `play_pay.hours` by its tier ids, `play_pay.lines.<line>.games`). What is 古's alone stays 古's: the
// roots' speed, the realm's `pay`, the 回's caps and stage quests, 圆满 → 灵石, 人间功课 (Hanli 「算古线吧」), the story's locks
// (修行 begins at 入门 on the 古; 沈芒's line is real life and counts from its first board). Part of the rules engine.
import { addProgress, cultivating, layerNo, lineStart, lineTiers, phaseName, pick, realmName, stepName, threshold } from '../state.mjs';
import { playGrant } from './playpay.mjs';
import { sideLine } from './hui.mjs';

/* The lines a world declares beside the book's own (ladder.json `lines`), by id. */
export const linesOf = content => Object.keys(content?.ladder?.lines ?? {}).filter(k => !k.startsWith('_') && lineTiers(content, k)?.length);

/* The world as one line reads it: that line's ladder in place of 古's — no caps, no gates, no throw — and its games' share.
   One object per world and line, so every memo keyed by the world keeps working. */
const WORLDS = new WeakMap();
export function lineWorld(content, line) {
  if (!WORLDS.has(content)) WORLDS.set(content, new Map());
  const memo = WORLDS.get(content);
  if (!memo.has(line)) {
    const tiers = lineTiers(content, line);
    const pp = content.balance?.play_pay, own = pp?.lines?.[line];
    const { caps, breakthrough, lines, ...rest } = content.ladder;
    memo.set(line, tiers ? {
      ...content,
      ladder: { ...rest, tiers },
      ...(pp ? { balance: { ...content.balance, play_pay: { ...pp, ...(own?.games ? { games: own.games } : {}) } } } : {}),
    } : null);
  }
  return memo.get(line);
}

/* The save as one line reads it: that line's place (where it stands, else its start) in the save's own fields, its stretch
   its own. A read-only view: `lineKeep` writes it back. */
export function lineState(content, state, line) {
  const held = state?.lines?.[line] ?? lineStart(content, line);
  const { stretch, need, ...rest } = state;
  return { ...rest, tier: held.tier, step: held.step, progress: held.progress ?? 0, ...(held.stretch ? { stretch: held.stretch } : {}) };
}
const lineKeep = (state, line, v) => {
  state.lines = { ...state.lines, [line]: { tier: v.tier, step: v.step, progress: v.progress, ...(v.stretch ? { stretch: v.stretch } : {}) } };
};

/* The line a board belongs to: the line of the scenes that show or offer it (a 今 board is 今's wherever it is replayed);
   null for the book's own. Once per world. */
const BOARDS = new WeakMap();
export function boardLine(content, id) {
  if (!BOARDS.has(content)) {
    const m = new Map();
    for (const ch of Object.values(content.chapters ?? {})) for (const sc of Object.values(ch.scenes ?? {})) {
      const line = sideLine(content, sc);
      if (!line) continue;
      for (const t of [...(sc.offers?.tasks ?? []), ...(sc.show ?? []).filter(c => c.card === 'board').map(c => c.id)]) m.set(t, line);
    }
    BOARDS.set(content, m);
  }
  const line = BOARDS.get(content).get(id) ?? null;
  return line && lineWorld(content, line) ? line : null;
}

/* A board's play pay on its line: its minutes at the layer that line stands on (playpay.mjs playGrant), never 灵石. */
export function lineGrant(content, state, line, id, task, now, stars = null) {
  const W = lineWorld(content, line);
  const g = W ? playGrant(W, lineState(content, state, line), id, task, now, stars) : null;
  return g?.progress ? { ...g, wealth: 0, line } : null;
}

/* Paid onto its line: the 修为 climbs that line's ladder (state.mjs addProgress — 层 by 层, the stretch as 古's; at a realm's
   top the bar fills on and waits, with no throw yet). Mutates `state`. Its levels are named on that line (新生一层 → 新生二层). */
export function linePay(content, state, line, grant) {
  const W = lineWorld(content, line), amount = Math.max(0, Math.round(grant?.progress ?? 0));
  if (!W || !amount) return null;
  const v = lineState(content, state, line);
  const { levels, hold } = addProgress(W, v, amount);
  lineKeep(state, line, v);
  const named = levels.map(l => ({ from: stepName(W, l.from.tier, l.from.step, state.lang), to: stepName(W, l.to.tier, l.to.step, state.lang) }));
  return { progress: amount, wealth: 0, line, levels: named, hold: hold ? { ...hold, line } : null };
}

/* Each line's place as Look shows it — the same shape as Look's own (古's) `tier` · `progress` · `next`, with the line's
   hero (people.json, ladder.json `lines.<line>.hero`): the top bar on that line's scenes reads 「沈芒 新生一层 · 修为 x/y」. */
export function linesLook(content, state, lang) {
  const out = {};
  for (const line of linesOf(content)) {
    const W = lineWorld(content, line), v = lineState(content, state, line);
    const hero = content.ladder.lines[line].hero, who = (content.people?.people ?? []).find(p => p.id === hero);
    out[line] = {
      hero: pick(who?.name, lang) ?? null,
      tier: { id: v.tier, step: layerNo(W, v.tier, v.step), name: realmName(W, v, lang), phase: phaseName(W, v.tier, v.step, lang), bar: cultivating(W, v) },
      progress: v.progress, next: threshold(W, v),
    };
  }
  return out;
}
