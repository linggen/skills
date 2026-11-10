// rules/gates.mjs — 阶段任务, the 修为 stage quest (Hanli, 2026-10-15; design.md § Pacing and the economy).
// Part of the rules engine; rules.mjs is its one door.
//
// Each 回's next story stage waits on 圆满 of the layer he holds: the world declares, per 回
// (ladder.json `caps.hui.<hui>.gates`), the ways on that wait — `{layer, scene, exits, tier?}`, the
// 层 named as the book names it (a 成 above 练气) and the tier the ladder's first unless said.
// A way on behind a gate is refused `stage` until the realm stands at that layer full or past
// it; the 事 book shows it with its progress, and 下一步 and Ling point to where 修为 is earned
// (errands.mjs waitsOnCultivation). The bar and the book move together because he earned it,
// not because the story paid it (the story raises no layer at all since 2026-10-16). Met, it is handed in
// (交差, stageTurn) for balance.json `pay.stage`; one behind him never handed in is paid on the next load
// (settleStages). A scene already passed is never gated again (a save above a
// new gate keeps its place), nor is a scene played again.
// A gate may ask a share of the layer instead (`share`, Hanli 2026-11-10: 「可以是剧情-游戏-剧情-游戏-剧情-游戏到圆满-剧情突破」):
// the way on waits until the bar stands at that share of the layer (or past it) — a step inside the layer, named
// 「练气五层六成」 (ladder.json `caps.stage.part`). Met, it simply opens: nothing to hand in, nothing paid (no 灵石 the
// economy did not have, and no back pay to a save that walked by before it stood). The layer's last gate asks 圆满.
const handsIn = g => g.share == null;
// Nothing here names a 回 or a scene: the data declares it.
import { fullName, pick, stepName, stepOfLayer, threshold } from '../state.mjs';
import { huiNow, huiOrder } from './hui.mjs';
import { gatePassed, rankOf } from './cap.mjs';
import { pay } from './core.mjs';

/* Every gate the world declares, with its 回: [{hui, tier, layer, step, scene, exits}]. Once per world. */
const GATES = new WeakMap();
export function gatesOf(content) {
  if (GATES.has(content)) return GATES.get(content);
  const first = content.ladder.tiers[0].id;
  const out = Object.entries(content.ladder.caps?.hui ?? {}).filter(([id]) => !id.startsWith('_'))
    .flatMap(([hui, cap]) => (cap.gates ?? []).map(g => {
      const tier = g.tier ?? first;
      return { hui, tier, layer: g.layer, step: stepOfLayer(content, tier, g.layer), scene: g.scene, exits: g.exits, ...(g.share != null ? { share: g.share } : {}), ...(g.say ? { say: g.say } : {}) };
    }));
  GATES.set(content, out);
  return out;
}

/* The bar's mark the gate asks on its layer, where he stands on it: its share of the layer, else the layer full. */
export const gateMark = (content, state, gate) => (gate.share != null ? Math.floor(gate.share * threshold(content, state)) : threshold(content, state));

/* Has the realm reached the gate's mark on its layer — full, or its share (or gone past the layer)? */
export function gateMet(content, state, gate) {
  const at = rankOf(content, state.tier, state.step), want = rankOf(content, gate.tier, gate.step);
  return at > want || (at === want && (state.progress ?? 0) >= gateMark(content, state, gate));
}

/* The gate's name: the layer full (练气四层圆满), or the layer at its share (练气五层六成; ladder.json `caps.stage.part`). */
export function gateName(content, gate, lang) {
  if (gate.share == null) return fullName(content, gate.tier, gate.step, lang);
  const part = pick(content.ladder.caps?.stage?.part, lang) ?? '{step} {n}';
  const n = Math.round(gate.share * 10), pct = Math.round(gate.share * 100);
  return part.replace('{step}', stepName(content, gate.tier, gate.step, lang)).replace('{n}', pick(content.ladder.caps?.stage?.tenths, lang)?.[n] ?? String(n)).replace('{pct}', String(pct));
}

/* The gate on this way on, when it still holds him. */
export function stageGate(content, state, sceneId, exitId) {
  if ((state.done_scenes ?? []).includes(sceneId)) return null;
  const g = gatesOf(content).find(x => x.scene === sceneId && x.exits.includes(exitId));
  return g && !gateMet(content, state, g) ? g : null;
}

/* The scene's room hosts practice — a board open to play again (hosted, not a stall; rules/tasks.mjs hostedHere): there is
   work where it stands (古五's 石室, 2026-10-31), so its gate waits in the scene, never at the way in. */
export function roomWorks(content, placeId) {
  const room = Object.values(content.places ?? {}).flatMap(d => d.places ?? []).find(p => p.id === placeId);
  return (room?.has?.games ?? []).some(id => { const t = content.tasks?.tasks?.find(x => x.id === id); return Boolean(t?.hosted && t.kind === 'board' && !t.stall); });
}

/* A gate held at the way INTO its scene (Hanli 10-27: 「读了一段剧情, 两个按钮都不能点…感觉卡住了」): where every way on
   of the gated scene is gated and the scene gives nothing to do first (no board, no fight), the passage would be read
   only to stop at two dead buttons — so the way that leads there waits instead, where he stands and can walk off to
   earn it. The gate stays the scene's own (its key, its pay, a save already standing in it); this only holds the door. */
export function entryGate(content, state, exit) {
  const to = exit?.next;
  if (!to || exit.stay || (state.done_scenes ?? []).includes(to)) return null;
  const g = gatesOf(content).find(x => x.scene === to);
  if (!g || gateMet(content, state, g)) return null;
  const sc = Object.values(content.chapters).map(ch => ch.scenes?.[to]).find(Boolean);
  if (!sc || (sc.show ?? []).some(c => c.card === 'board') || sc.exits.some(e => e.game) || roomWorks(content, sc.at)) return null;
  const ways = sc.exits.filter(e => !e.stay);
  return ways.length && ways.every(e => g.exits.includes(e.id)) ? g : null;
}

/* How the gate reads, beside where he stands: its name (练气四层圆满), and his 修为 toward it. */
export function stageBrief(content, state, gate, lang = state.lang) {
  const here = gate.tier === state.tier && gate.step === state.step;
  return {
    hui: gate.hui, scene: gate.scene, step: gateName(content, gate, lang),
    now: { step: stepName(content, state.tier, state.step, lang), progress: state.progress ?? 0, of: here ? gateMark(content, state, gate) : threshold(content, state) },
    met: gateMet(content, state, gate), ...(here ? {} : { below: true }), ...(gate.share != null ? { part: true } : {}),
  };
}

/* A gate's own name on the save: its scene and its first way on (a scene may hold two). */
export const gateKey = g => `${g.scene}/${g.exits[0]}`;
const paidSet = state => new Set(state.stages ?? []);

/* Behind him: its scene passed, or its 回 before the one he stands in. A gate behind him is
   never the open quest — handed in, or settled once by settleStages. */
function behind(content, state, g, hui = huiNow(content, state)) {
  return gatePassed(content, state, g) || huiOrder(content, g.hui) < huiOrder(content, hui);
}

/* The 回's stage quest where the save stands: the first gate of its 回 not handed in and not
   behind him (2026-10-16: 「七层圆满的任务大成了应该可以交任务拿奖励」 — it stood met, unpaid,
   on a scene he never leaves, and named a layer two below his). Met, it is 可交 (`ready`) with
   its pay; short, it shows his 修为 toward it. Null where the 回 has none left. */
export function stageNow(content, state) {
  const hui = huiNow(content, state);
  if (!hui) return null;
  const paid = paidSet(state);
  // A share gate met is open, not a quest to hand in: the next one stands.
  const gate = gatesOf(content).find(g => g.hui === hui && !paid.has(gateKey(g)) && !behind(content, state, g, hui) && (handsIn(g) || !gateMet(content, state, g)));
  if (!gate) return null;
  const b = stageBrief(content, state, gate);
  return { ...b, key: gateKey(gate), ...(b.met ? { pays: { wealth: stagePay(content) } } : {}) };
}

/* A stage quest's pay (balance.json `pay.stage`): 灵石 — at 圆满 the 修为 cannot rise, so a
   hand-in that pays only 修为 would show nothing (Hanli, 2026-10-15: every hand-in visibly gains). */
export const stagePay = content => content.rewards.tables.stage?.wealth ?? 0;
const STAGE_GRANT = content => ({ table: 'stage', wealth: stagePay(content) });

/* 交差 on the stage quest: the open one, met. Paid once — its key is kept on the save. */
export function stageTurn(content, state, ctx) {
  const q = stageNow(content, state);
  if (!q) return { state: null, result: { ok: false, refused: 'no-stage', say: null } };
  if (!q.met) return { state: null, result: { ok: false, refused: 'not-done', say: null, stage: q } };
  const s = structuredClone(state);
  s.stages = [...(s.stages ?? []), q.key];
  const paid = pay(content, s, ctx, STAGE_GRANT(content));
  const title = pick(content.ladder.caps?.stage?.title, state.lang)?.replace('{step}', q.step) ?? q.step;
  return { state: s, result: { ok: true, turned: 'stage', key: q.key, title, paid: { wealth: paid.wealth } } };
}

/* The stage quests behind him never handed in — a save that crossed them before stage quests
   paid (or before they existed, the pacing layer of 2026-10-16), or walked on without 交差 —
   each paid once, now, and told (`stage_back`, the 事 book's note). A save with none comes
   back as it was (the same object). */
export function settleStages(content, state, now) {
  if (!state || !content.ladder.caps?.hui) return state;
  const hui = huiNow(content, state), paid = paidSet(state);
  const owed = gatesOf(content).filter(g => handsIn(g) && !paid.has(gateKey(g)) && behind(content, state, g, hui) && gateMet(content, state, g));
  if (!owed.length) return state;
  const s = structuredClone(state);
  let wealth = 0;
  for (const g of owed) {
    s.stages = [...(s.stages ?? []), gateKey(g)];
    wealth += pay(content, s, { now }, STAGE_GRANT(content)).wealth;
  }
  // The gates' keys, never their names: named as Look is drawn, in the language then (a name kept here stayed English
  // under 中, 11-02).
  s.stage_back = { at: now.toISOString(), n: owed.length, wealth, gates: owed.map(gateKey) };
  return s;
}

/* The settled ones' note, for the page — a day long, then let go — each step named now. A save from before 11-02 kept
   `steps` as names in the language of that moment: each is read back to its gate by either language's name. */
export function stageBack(content, state, now, lang = state.lang) {
  const b = state.stage_back;
  if (!b || now - new Date(b.at) >= 86_400_000) return null;
  const all = gatesOf(content), byKey = new Map(all.map(g => [gateKey(g), g]));
  const named = (n) => all.find(g => ['zh', 'en'].some(l => gateName(content, g, l) === n));
  const { gates, steps, ...rest } = b;
  const held = gates ? gates.map(k => byKey.get(k)) : (steps ?? []).map(named);
  return { ...rest, steps: held.map((g, i) => (g ? gateName(content, g, lang) : steps?.[i])).filter(Boolean) };
}

/* Stage quests handed in, in the 回 he stands in — the 事 book's 已交. */
export function stagesPaid(content, state) {
  const hui = huiNow(content, state), paid = paidSet(state);
  return gatesOf(content).filter(g => g.hui === hui && paid.has(gateKey(g))).map(g => gateName(content, g, state.lang));
}

/* The refusal's line, in the world's words (the gate's own `say` where the usual work is out of reach — 古五's 石室, inside
   the 秘境 — else ladder.json `caps.stage.refuse`; `{step}` filled). */
export const stageSay = (content, state, gate, lang = state.lang) =>
  (pick(gate.say ?? content.ladder.caps?.stage?.refuse, lang) ?? '').replace('{step}', gateName(content, gate, lang));

/* Earned: the realm at the gate's layer, full — for a test or the explorer that plays a 回's
   routine as one move ("he did the work"); never called by the game itself. Returns a copy. */
export function earned(content, state, gate) {
  const s = structuredClone(state);
  if (rankOf(content, s.tier, s.step) < rankOf(content, gate.tier, gate.step)) { s.tier = gate.tier; s.step = gate.step; s.progress = 0; }
  if (s.tier === gate.tier && s.step === gate.step) s.progress = Math.max(s.progress ?? 0, gateMark(content, s, gate));
  return s;
}
