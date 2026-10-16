// rules/gates.mjs — 阶段任务, the 修为 stage quest (Hanli, 2026-10-15; design.md § Pacing and the economy).
// Part of the rules engine; rules.mjs is its one door.
//
// Each 回's next story stage waits on 圆满 of the layer he holds: the world declares, per 回
// (ladder.json `caps.hui.<hui>.gates`), the ways on that wait — `{layer, scene, exits, tier?}`, the
// 层 named as the book names it (a 成 above 练气) and the tier the ladder's first unless said.
// A way on behind a gate is refused `stage` until the realm stands at that layer full or past
// it; the 事 book shows it with its progress, and 下一步 and Ling point to where 修为 is earned
// (errands.mjs waitsOnCultivation). The bar and the book move together because he earned it,
// not because the story paid it. A scene already passed is never gated again (a save above a
// new gate keeps its place), nor is a scene played again.
// Nothing here names a 回 or a scene: the data declares it.
import { fullName, pick, stepName, stepOfLayer, threshold } from '../state.mjs';
import { huiNow } from './hui.mjs';
import { rankOf } from './cap.mjs';

/* Every gate the world declares, with its 回: [{hui, tier, layer, step, scene, exits}]. Once per world. */
const GATES = new WeakMap();
export function gatesOf(content) {
  if (GATES.has(content)) return GATES.get(content);
  const first = content.ladder.tiers[0].id;
  const out = Object.entries(content.ladder.caps?.hui ?? {}).filter(([id]) => !id.startsWith('_'))
    .flatMap(([hui, cap]) => (cap.gates ?? []).map(g => {
      const tier = g.tier ?? first;
      return { hui, tier, layer: g.layer, step: stepOfLayer(content, tier, g.layer), scene: g.scene, exits: g.exits };
    }));
  GATES.set(content, out);
  return out;
}

/* Has the realm reached the gate's layer full (or gone past it)? */
export function gateMet(content, state, gate) {
  const at = rankOf(content, state.tier, state.step), want = rankOf(content, gate.tier, gate.step);
  return at > want || (at === want && (state.progress ?? 0) >= threshold(content, state));
}

/* The gate on this way on, when it still holds him. */
export function stageGate(content, state, sceneId, exitId) {
  if ((state.done_scenes ?? []).includes(sceneId)) return null;
  const g = gatesOf(content).find(x => x.scene === sceneId && x.exits.includes(exitId));
  return g && !gateMet(content, state, g) ? g : null;
}

/* How the gate reads, beside where he stands: its name (练气四层圆满), and his 修为 toward it. */
export function stageBrief(content, state, gate, lang = state.lang) {
  const here = gate.tier === state.tier && gate.step === state.step;
  return {
    hui: gate.hui, scene: gate.scene, step: fullName(content, gate.tier, gate.step, lang),
    now: { step: stepName(content, state.tier, state.step, lang), progress: state.progress ?? 0, of: threshold(content, state) },
    met: gateMet(content, state, gate), ...(here ? {} : { below: true }),
  };
}

/* The 回's stage quest where the save stands: the first gate of its 回 whose scene he has not
   passed (met or not — the 事 book shows it either way). Null where the 回 has none left. */
export function stageNow(content, state) {
  const hui = huiNow(content, state);
  if (!hui) return null;
  const done = new Set(state.done_scenes ?? []);
  const gate = gatesOf(content).find(g => g.hui === hui && !done.has(g.scene));
  return gate ? stageBrief(content, state, gate) : null;
}

/* The refusal's line, in the world's words (ladder.json `caps.stage.refuse`, `{step}` filled). */
export const stageSay = (content, state, gate, lang = state.lang) =>
  (pick(content.ladder.caps?.stage?.refuse, lang) ?? '').replace('{step}', fullName(content, gate.tier, gate.step, lang));

/* Earned: the realm at the gate's layer, full — for a test or the explorer that plays a 回's
   routine as one move ("he did the work"); never called by the game itself. Returns a copy. */
export function earned(content, state, gate) {
  const s = structuredClone(state);
  if (rankOf(content, s.tier, s.step) < rankOf(content, gate.tier, gate.step)) { s.tier = gate.tier; s.step = gate.step; s.progress = 0; }
  if (s.tier === gate.tier && s.step === gate.step) s.progress = Math.max(s.progress ?? 0, threshold(content, s));
  return s;
}
