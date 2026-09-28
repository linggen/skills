// rules/tell.mjs — The story told in the chat: the source passages a beat owes Ling.
// Part of the rules engine; rules.mjs is its one door.
//
// His ruling, 2026-09-28: 「右边不要放小说内容, 右边尽量放图片, 战斗, 小游戏……
// 像小人书。左边chat里放剧情。」 The stage draws a scene as a panel (a picture and
// two to four lines of caption); the prose is the chat's. A scene's `story` and
// an exit's `story` are the book's own passage for that beat (story/huxian-bing/
// 00-序章上 and 01-序章下, zh + en). The rules hand each one to Ling ONCE, in order —
// the choice's outcome, then the scene it walks into — whoever moved: her own
// Resolve carries it, and a tap on the panel leaves it owed for her next Look.
//
// Yinyue's words inside a passage are marked ⟪…⟫. Until she walks with the
// player — and while she sleeps in the fox token — they are the story's (the fox
// in the valley, the girl at dawn, the token's one word at the 蠪侄), and Ling
// tells them; while she walks with the player awake they are hers (SKILL.md:
// Ling never speaks as her), so Ling's copy shows 〔银月〕 where she speaks and
// the words go to her as her beat (story.mjs herBeat), to say in her own way.
import { fill, pick } from '../state.mjs';
import { companionOf, herAwake } from './companion.mjs';
import { inMade, sceneOf } from './world.mjs';

const SPAN = /⟪([\s\S]*?)⟫/g;
const MARK = { zh: '〔银月〕', en: '〔Yinyue〕' };

/* Her words in a passage, in order: the marked spans' text. */
export const herSpans = text => [...String(text ?? '').matchAll(SPAN)].map(m => m[1]);

/* A passage as Ling reads it: her spans told by the story while she is not
   present, marked as hers while she is. */
export function passageFor(content, state, pair) {
  const lang = state.lang, text = fill(pick(pair, lang), state, content);
  if (text == null) return null;
  return herAwake(state) ? text.replace(SPAN, MARK[lang] ?? MARK.zh) : text.replace(SPAN, '$1');
}

/* Her words in a move's passages as lines of hers, for her beat: the
   exit's story and the scene it walks into, each language kept. */
export function spanLines(content, stories) {
  const c = companionOf(content);
  if (!c) return [];
  const text = {};
  for (const lang of ['zh', 'en']) {
    const said = stories.filter(Boolean).flatMap(s => herSpans(s[lang]));
    if (said.length) text[lang] = said.join(lang === 'zh' ? '' : ' ');
  }
  return text.zh || text.en ? [{ who: c.id, text }] : [];
}

/* An exit taken with a passage of its own: owed until Ling is handed it.
   A spine scene played again owes nothing (it was told). */
export function oweExit(s, scene, exit, replay) {
  if (!exit.story || replay || inMade(s)) return;
  s.tell_owed = [...(s.tell_owed ?? []), `${scene.id}/${exit.id}`];
}

/* What Ling is owed now, in order — the choices' outcomes, then the scene
   she stands in when it has a passage she has not been handed — and the
   save with it marked told. Null when nothing is owed. */
export function tellOf(content, state) {
  if (inMade(state)) return null;
  const scenes = content.chapters[state.chapter]?.scenes ?? {};
  const items = [];
  for (const key of state.tell_owed ?? []) {
    const [sid, eid] = key.split('/');
    const exit = Object.values(content.chapters).map(c => c.scenes[sid]).find(Boolean)?.exits?.find(e => e.id === eid);
    const text = exit?.story ? passageFor(content, state, exit.story) : null;
    if (text) items.push({ of: 'choice', id: key, text });
  }
  const scene = sceneOf(content, state), told = state.told_scenes ?? [];
  if (scene?.story && scenes[scene.id] && !told.includes(scene.id)) items.push({ of: 'scene', id: scene.id, text: passageFor(content, state, scene.story) });
  if (!items.length && !(state.tell_owed ?? []).length) return null;
  const keep = { ...state, tell_owed: [], told_scenes: scene?.story && !told.includes(scene.id) ? [...told, scene.id] : told };
  return { tell: items, keep };
}

export { MARK };
