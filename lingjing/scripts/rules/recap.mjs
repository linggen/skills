// rules/recap.mjs — 前情提要 + 目前任务: what Ling tells as a sitting opens.
// Part of the rules engine; rules.mjs is its one door.
//
// His (2026-09-25): 「不用保存前情, 每次开始游戏时, 前情提要+目前任务」. There is
// no saved summary any more — a written one drifted from the game (蓬莱 while
// he stood at 雷泽, a cauldron 得到 while still current) and was read back as
// truth. The recap is built from the facts every time: the short 九鼎录
// (story.mjs `story`, short), where the player stands, who walks with them,
// and what is in hand now — the book's errands, today's 传闻 step, the goal.
import { CAST } from '../content.mjs';
import { pick } from '../state.mjs';
import { companionOf, hasCompanion } from './companion.mjs';
import { bookOf, waypointOf } from './errands.mjs';
import { story } from './story.mjs';
import { atScene, creatureOf, inMade, placeBrief, sceneOf } from './world.mjs';

/* Where the player stands, by name: the scene's place, else the place on the map. */
function hereOf(content, state, now) {
  const scene = inMade(state) ? null : sceneOf(content, state);
  if (scene && atScene(content, state)) return pick(scene.place, state.lang) ?? null;
  return placeBrief(content, state, now)?.name ?? null;
}

/* Who walks with the player: her, once found, and the beasts tamed. */
const nameOf = (content, id, lang) => pick(CAST[id] ?? creatureOf(content, id)?.name, lang) ?? null;
function withOf(content, state) {
  const her = hasCompanion(state) ? companionOf(content)?.id : null;
  return [...(her ? [her] : []), ...(state.cast ?? [])].map(id => nameOf(content, id, state.lang)).filter(Boolean);
}

/* 目前任务: the goal line the spine names, and each 差事 in hand — title,
   its counts (a board won and kept says so), where it is met. */
function taskOf(content, state, ctx, told) {
  const way = waypointOf(content, state, ctx);
  const line = way ? (way.text ?? way.title ?? null) : null;
  const goal = line && line !== told ? line : null; // the chapter's `now` says it already
  const book = bookOf(content, state, state.lang, ctx).map(b => ({
    title: b.title,
    need: (b.need ?? []).map(n => ({ kind: n.kind, have: n.have, n: n.n, ...(n.kept ? { kept: true } : {}) })),
    ...(b.ready ? { ready: true } : {}),
    ...(b.where?.name ? (b.where.here ? { here: true } : { where: b.where.name }) : {}),
  }));
  return { ...(goal ? { goal } : {}), ...(way?.place?.name ? { toward: way.place.name } : {}), book };
}

/* The recap Ling tells: the story from the book — chapters ended with their
   closing lines, the current one with its lines and where it stands — the
   open mystery, where the player is, who walks along, and the task in hand. */
export function recapFacts(content, state, ctx) {
  const book = story(state, content, ctx, { short: 'true' }).result;
  const now = book.chapters.find(c => c.state === 'current')?.now ?? null;
  return {
    chapters: book.chapters.map(({ title, state: st, recap, now }) => ({ title, state: st, recap, ...(now ? { now } : {}) })),
    found: book.found,
    ...(book.open?.length ? { mystery: book.open[0] } : {}),
    here: hereOf(content, state, ctx.now),
    with: withOf(content, state),
    task: taskOf(content, state, ctx, now),
  };
}
