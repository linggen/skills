// rules/codex.mjs — 图鉴 as the rules keep it: which entries a scene brings
// on, which the player has met, and the portrait a person's card may show.
// Ids only: the page and the book draw the cards (scripts/codex.js), from the
// same codex.json. Nothing here is kept in the save — what was met is read
// off the scenes done, the bag and the fights, so an old save has its 图鉴 too.
import { codexFiles } from '../content.mjs';
import { codexRaw, resolveEntry } from '../codex.js';
import { fill, genderOf, personOf } from '../state.mjs';

const RAW = new WeakMap();
const rawOf = (content) => {
  if (!RAW.has(content)) RAW.set(content, content.codex ? codexRaw(codexFiles(content)) : new Map());
  return RAW.get(content);
};
const allScenes = content => Object.values(content.chapters ?? {}).flatMap(ch => Object.values(ch.scenes ?? {}));

/* Who and what a scene brings on: its people (a slot read for this player —
   阿禾 for everyone), 银月 in the form it names, and every entry whose
   `first.scene` is this scene. Only ids the codex holds. */
export function meetsOf(content, state, scene) {
  if (!scene) return [];
  const raw = rawOf(content);
  const whos = [...(scene.people ?? []), ...[...(scene.lines ?? []), ...(scene.exits ?? []).flatMap(e => e.beat ?? [])].map(l => l.who)];
  const ids = whos.map(w => personOf(content, state, w)?.id).filter(Boolean);
  // 银月 in the form the scene names: its own entry when the codex holds one
  // (`yinyue-fox`: the nameless fox of the pit), else hers — never her name
  // before the hero has heard it.
  if (scene.her) ids.push(herEntry(content, raw, scene.her));
  for (const [id, r] of raw) if (r.over.first?.scene === scene.id) ids.push(id);
  return [...new Set(ids)].filter(id => raw.has(id));
}

const herEntry = (content, raw, form) => {
  const id = content.world.companion?.id;
  return raw.has(`${id}-${form}`) ? `${id}-${form}` : id;
};

/* An entry that `becomes` another (the nameless fox → 银月) stands only
   until that one is met: then it is the same subject, known by its name. */
const folded = (raw, seen) => [...seen].filter(id => !seen.has(raw.get(id)?.over.becomes));

/* Every entry the player has met: brought on by a scene done or the scene
   they stand in, held in the bag, fought, or walking with them. */
export function seenOf(content, state, scene = null) {
  const raw = rawOf(content), seen = new Set();
  const done = new Set(state.done_scenes ?? []);
  for (const sc of allScenes(content)) if (done.has(sc.id)) for (const id of meetsOf(content, state, sc)) seen.add(id);
  for (const id of meetsOf(content, state, scene)) seen.add(id);
  for (const id of Object.keys(state.bag ?? {})) seen.add(id);
  for (const id of Object.keys(state.duels ?? {})) seen.add(id);
  if (state.companion?.joined) seen.add(content.world.companion?.id);
  return folded(raw, seen).filter(id => raw.has(id));
}

/* What this scene brings on for the FIRST time: its entries no scene done
   brought before. A scene replayed brings nothing new. */
export function newHere(content, state, scene) {
  if (!scene || (state.done_scenes ?? []).includes(scene.id)) return [];
  const before = new Set();
  const done = new Set(state.done_scenes ?? []);
  for (const sc of allScenes(content)) if (done.has(sc.id)) for (const id of meetsOf(content, state, sc)) before.add(id);
  for (const id of Object.keys(state.bag ?? {})) before.add(id);
  return meetsOf(content, state, scene).filter(id => !before.has(id));
}

/* A person's picture as the codex allows it — null when the codex refuses
   the painted one (a name card stands instead). */
export function portraitOf(content, state, id, fallback = null) {
  const raw = rawOf(content).get(id);
  if (!raw) return fallback;
  return resolveEntry(raw, { lang: state.lang, gender: genderOf(state), say: t => fill(t, state, content) }).image;
}
