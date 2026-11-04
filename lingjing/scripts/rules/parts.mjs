// rules/parts.mjs — a scene's passage read through its boards (Hanli, 2026-11-04: 「可以, 按你说的做」, after
// 「剧情任务不是读小说剧情时出现吗?」): a board stands at the line of the passage it stages, is played there, and the
// reading goes on after it. A leaf: no imports, so state.mjs, content.mjs and every rule may read it.
//
// The shape: `story`, then the scene's first board (`show` order), then `story_after` — and when `story_after` is a
// list, its part k comes after board k: story → board 0 → story_after[0] → board 1 → story_after[1] → … Boards past the
// last part stand after it, in `show` order (00-halfyear's second). A single `story_after` is the list of one.
//
// The keys the box owes (rules/tell.mjs): part 0 is `after/<scene>` (told as `<scene>/after`, as since 2026-10-14);
// part k ≥ 1 is `after/<scene>/<k>` (told as `<scene>/after/<k>`).
//
// A scene whose `story_after` is a list is read through: each of its boards waits for its line (Look holds it back
// until the part that leads into it is told; tasksBrief). The older one-part scenes keep the stage's own wait.

/* A scene's boards, in the order they are played (its `show`). */
export const sceneBoards = scene => (scene?.show ?? []).filter(c => c.card === 'board').map(c => c.id);
/* The rest of its passage, part by part. */
export const afterParts = scene => (scene?.story_after == null ? [] : [].concat(scene.story_after));
/* Read through its boards: each waits for its line. */
export const readThrough = scene => Array.isArray(scene?.story_after);
export const afterKey = (sid, k = 0) => (k ? `after/${sid}/${k}` : `after/${sid}`);
export const afterId = (sid, k = 0) => (k ? `${sid}/after/${k}` : `${sid}/after`);
/* `after/<scene>[/<k>]` → {sid, k}; null for any other key. */
export function parseAfter(key) {
  const [head, sid, k] = String(key).split('/');
  return head === 'after' && sid ? { sid, k: Number(k ?? 0) || 0 } : null;
}
/* `<scene>/after[/<k>]` → k. */
export const partOfId = id => Number(String(id).split('/')[2] ?? 0) || 0;
/* The part a board's end owes: board k leads into part k, when the scene has one. -1: none. */
export function partAfterBoard(scene, id) {
  const k = sceneBoards(scene).indexOf(id);
  return k >= 0 && k < afterParts(scene).length ? k : -1;
}
/* The whole passage of a scene, every part (the lints, the minutes, the words). */
export const wholeOf = scene => [scene?.story, ...afterParts(scene)].filter(Boolean);

/* Is a scene's board on the stage yet — Look's one rule for every reader (the Mac's tray and 事 book, the phone)? In a
   scene read through its boards: not while a board before it is still to play, nor before the reading reaches its line —
   board 0 once the scene's own passage is told, board k once the part after board k−1 is. Over (done) or taken up again
   (`replay`), it stands as it is. Any other scene keeps the stage's own wait (stage.mjs boardWaits). */
export function boardStaged(state, scene, id) {
  const order = sceneBoards(scene), k = order.indexOf(id), t = state.tasks?.[id];
  if (k < 0 || t?.status === 'done' || t?.replay || !readThrough(scene)) return true;
  if (order.slice(0, k).some(b => state.tasks?.[b]?.status !== 'done')) return false;
  const owed = state.tell_owed ?? [];
  if (!(state.told_scenes ?? []).includes(scene.id) || owed.includes(`scene/${scene.id}`)) return false;
  return !(k > 0 && owed.includes(afterKey(scene.id, k - 1)));
}
