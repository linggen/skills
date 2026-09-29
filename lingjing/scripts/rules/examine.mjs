// rules/examine.mjs — 看: the things a scene lets the player look at.
// Part of the rules engine; rules.mjs is its one door.
//
// His, 2026-09-29: tapping scene cards to move the story felt like turning
// pages. A scene may declare hotspots — `look: [{id, label, text, clue?,
// gives?}]` — shown on its card as small 「看」 chips. Looking is the rules'
// verb (`look --at=<id>`): it costs no 体力, it is written on the save
// (`looked`, "scene/id", in the order found), and its finding is one line in
// the book's voice. An exit may wait on a clue (`needs.seen: [id]`): it is not
// offered until the clue is found, and a player who looked twice without it
// is given the scene's `look_hint`. What was found — and what was passed by —
// goes to 录 (「所见」) and to Ling's Look (`seen`), so the story can come back
// to it. Never a word of a finding before it is found.
import { fill, pick } from '../state.mjs';
import { atScene, sceneOf } from './world.mjs';

/* Looks without the key before the scene's hint is given. */
export const STALL_LOOKS = 2;
/* How many scenes of findings Ling's Look carries — the newest. */
export const SEEN_KEEP = 6;

const keyOf = (sceneId, id) => `${sceneId}/${id}`;
const spotsOf = scene => scene?.look ?? [];

/* The hotspot ids found in a scene, in the order found. */
export const lookedIn = (state, sceneId) => (state.looked ?? []).filter(k => k.startsWith(`${sceneId}/`)).map(k => k.slice(sceneId.length + 1));
export const hasLooked = (state, sceneId, id) => (state.looked ?? []).includes(keyOf(sceneId, id));
/* An exit's `needs.seen`: every clue named has been found in this scene. */
export const seenMet = (state, sceneId, ids = []) => ids.every(id => hasLooked(state, sceneId, id));

/* The clues this scene's exits still wait on. */
const missingClues = (state, scene) => [...new Set(scene.exits.flatMap(e => e.needs?.seen ?? []))].filter(id => !hasLooked(state, scene.id, id));

/* Stalled: an exit waits on a clue, and the player has looked STALL_LOOKS
   times here without finding it. */
export const stalled = (state, scene) => missingClues(state, scene).length > 0 && lookedIn(state, scene.id).length >= STALL_LOOKS;

/* The scene's hotspots as Look carries them: the label always; the finding
   only once found — the page draws it under the card, Ling may refer to it. */
export function hotspotsOf(content, state, scene) {
  const say = pair => fill(pick(pair, state.lang), state, content);
  return spotsOf(scene).map(h => {
    const found = hasLooked(state, scene.id, h.id);
    return { id: h.id, label: say(h.label), found, ...(found ? { text: say(h.text), ...(h.clue ? { clue: true } : {}) } : {}) };
  });
}

/* The hint, when the player is stuck on a clue. */
export const lookHint = (content, state, scene) => (stalled(state, scene) && scene.look_hint ? fill(pick(scene.look_hint, state.lang), state, content) : null);

/* What a finding gives: a mark the story remembers. A table, so a new kind is one line. */
export const GIVES = {
  mark: (s, v) => { s.marks = [...new Set([...(s.marks ?? []), v])]; },
};

const refused = (why, extra = {}) => ({ state: null, result: { ok: false, refused: why, say: null, ...extra } });

/* Labels of the exits a finding has just opened: waiting on it, and on nothing else now. */
function opened(content, before, after, scene) {
  const waits = scene.exits.filter(e => e.needs?.seen && e.label);
  return waits.filter(e => !seenMet(before, scene.id, e.needs.seen) && seenMet(after, scene.id, e.needs.seen)).map(e => fill(pick(e.label, after.lang), after, content));
}

/* Look at one thing here (`look --at=<id>`). Free, never a turn of the
   story; looked at again, the same line and nothing written. */
export function examine(state, content, ctx, args) {
  const scene = sceneOf(content, state);
  if (!scene || !atScene(content, state)) return refused('no-scene');
  const spot = spotsOf(scene).find(h => h.id === String(args.at));
  if (!spot) return refused('nothing-there', { spots: spotsOf(scene).map(h => h.id) });
  const say = pair => fill(pick(pair, state.lang), state, content);
  const looked = { id: spot.id, label: say(spot.label), text: say(spot.text), ...(spot.clue ? { clue: true } : {}) };
  if (hasLooked(state, scene.id, spot.id)) return { state: null, result: { ok: true, looked, again: true } };
  const s = structuredClone(state);
  s.looked = [...(s.looked ?? []), keyOf(scene.id, spot.id)];
  for (const [kind, v] of Object.entries(spot.gives ?? {})) GIVES[kind]?.(s, v);
  const opens = opened(content, state, s, scene), hint = lookHint(content, s, scene);
  return { state: s, result: { ok: true, looked, ...(opens.length ? { opens } : {}), ...(hint ? { hint } : {}) } };
}

/* 所见 — what was found, scene by scene, in the order first looked; and, for
   a scene left behind, what was passed by (labels only: unseen stays unknown). */
export function seenLog(content, state, keep = Infinity) {
  const order = [...new Set((state.looked ?? []).map(k => k.slice(0, k.lastIndexOf('/'))))];
  const here = atScene(content, state) ? state.scene : null;
  const say = pair => fill(pick(pair, state.lang), state, content);
  const rows = order.map(id => sceneById(content, id)).filter(Boolean).map(scene => {
    const found = lookedIn(state, scene.id).map(i => spotsOf(scene).find(h => h.id === i)).filter(Boolean);
    const missed = scene.id === here ? [] : spotsOf(scene).filter(h => !found.includes(h)).map(h => say(h.label));
    return { scene: scene.id, place: say(scene.place), found: found.map(h => ({ label: say(h.label), text: say(h.text) })), ...(missed.length ? { missed } : {}) };
  });
  return rows.slice(-keep);
}

const sceneById = (content, id) => Object.values(content.chapters ?? {}).map(ch => ch.scenes?.[id]).find(Boolean) ?? null;
