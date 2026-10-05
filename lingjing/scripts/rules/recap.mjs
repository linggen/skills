// rules/recap.mjs — 前情提要 + 目前任务: what Ling tells as a sitting opens.
// Part of the rules engine; rules.mjs is its one door.
//
// His (2026-09-25): 「不用保存前情, 每次开始游戏时, 前情提要+目前任务」. There is
// no saved summary any more — a written one drifted from the game (蓬莱 while
// he stood at 雷泽, a cauldron 得到 while still current) and was read back as
// truth. The recap is put together from the book every time (story.mjs
// sittingRecap: the scenes' own `recap` lines and the chapter's riddle), and
// 目前任务 from what is in hand now — the goal line, the book's errands.
import { fill, pick } from '../state.mjs';
import { bookOf, waypointOf } from './errands.mjs';
import { sideLine } from './hui.mjs';
import { sittingRecap } from './story.mjs';
import { atScene, inMade, sceneOf } from './world.mjs';

/* The first sentence of a written passage, never cut inside a quote. */
const OPENS = '「『“（(', CLOSES = '」』”）)';
export function firstSentence(text) {
  const t = String(text ?? '').trim();
  let depth = 0, straight = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (OPENS.includes(c)) depth += 1;
    else if (CLOSES.includes(c)) depth = Math.max(0, depth - 1);
    else if (c === '"') straight = !straight;
    else if (!depth && !straight && ('。！？'.includes(c) || ('.!?'.includes(c) && (i + 1 === t.length || /\s/.test(t[i + 1]))))) return t.slice(0, i + 1);
  }
  return t || null;
}

/* Standing in a scene with nothing else in hand, the scene says what is
   before the player in its own written words (2026-10-05: left empty, Ling
   wrote one of her own): the game it offers, still to play — its title —
   else its setup's first sentence. */
export function sceneTask(content, state) {
  if (inMade(state) || !atScene(content, state)) return null;
  const scene = sceneOf(content, state), lang = state.lang;
  const game = (scene?.offers?.tasks ?? []).filter(id => state.tasks?.[id]?.status !== 'done')
    .map(id => (content.tasks?.tasks ?? []).find(t => t.id === id)).find(t => t?.title);
  if (game) return pick(game.title, lang);
  return scene?.setup ? firstSentence(fill(pick(scene.setup, lang), state, content)) : null;
}

/* 目前任务, one line put together from the facts: the goal line the spine
   names (and the place it leads to, when the line does not name it), then
   each 差事 in hand by its title and where it is met — never a count (the
   page shows those). Nothing of those in hand (or a scene on a line beside
   the book's own — the 古's goal and errands are not 沈芒's): the scene's own
   (sceneTask). */
const TASK_SAY = {
  zh: { head: '目前任务：', sep: '；', at: w => `（${w}）`, toward: p => `——${p}`, here: '（就在这里）', ready: '，可以交了' },
  en: { head: 'Now: ', sep: '; ', at: w => ` (${w})`, toward: p => ` — ${p}`, here: ' (here)', ready: ', ready to hand in' },
};
export function taskLine(content, state, ctx) {
  const w = TASK_SAY[state.lang] ?? TASK_SAY.zh;
  const side = !inMade(state) && sideLine(content, sceneOf(content, state));
  const way = side ? null : waypointOf(content, state, ctx);
  const goal = way ? (way.text ?? way.title ?? null) : null;
  const toward = way?.place?.name && !String(goal ?? '').includes(way.place.name) ? way.place.name : null;
  const parts = [
    ...(goal ? [goal + (toward ? w.toward(toward) : '')] : []),
    ...(side ? [] : bookOf(content, state, state.lang, ctx)).map(b => b.title + (b.ready ? w.ready : '') + (b.where?.here ? w.here : b.where?.name ? w.at(b.where.name) : '')),
  ].filter(Boolean);
  if (!parts.length) parts.push(sceneTask(content, state));
  return parts[0] ? w.head + parts.join(w.sep) : null;
}

/* What Ling reads out as a sitting opens: the 前情提要 the rules put
   together from the book's own lines (story.mjs recapText), and 目前任务 —
   both finished text, read as written. No facts to tell from: told from
   facts, she wrote her own story (2026-10-05: 「银月化作的姑娘仍留在吴婆婆的
   木牌之谜里」 — no such line anywhere). */
export function recapFacts(content, state, ctx) {
  const text = sittingRecap(content, state)?.text;
  if (!text) return null;
  const task = taskLine(content, state, ctx);
  return { text, ...(task ? { task } : {}) };
}
