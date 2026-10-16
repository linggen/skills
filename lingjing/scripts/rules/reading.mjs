// rules/reading.mjs — a passage on the stage holds Ling's hands too (Hanli, 2026-10-16: 「读剧情, 可以简单点,
// 把其他都lock, 玩家读完或跳过才能继续」).
//
// The page locks its own ways out while a passage plays (dialogue.js storyHolds); the chat stays
// open, and a line he types there reaches Ling, who could move him on mid-passage. So the page
// tells the rules when a passage holds and when it ends (`reading --hold=1|0`, the page's verb,
// never logged), and while it holds:
// - Ling's Look carries `reading: "playing"` and a `then` that says: words only, nothing moved;
// - Ling's world-changing calls are refused `reading` (and the refusal is noted `held`);
// - when it ends, the page's `reading --hold=0` answers `held: true` if she was refused meanwhile,
//   and the page reports `[scene] read` — her cue to do now what he asked.
// A hold the page never ended (a tab shut mid-passage) lapses after READING_TTL_MS; the page
// renews it while the passage is still up (lingjing.js syncLock).

export const READING_TTL_MS = 10 * 60 * 1000;

/* What Ling may not do while a passage plays: her tools that change the world. `true` holds the
   verb; a function holds only the calls it says. Reads, Look and the escape hatches (Undo,
   Restart, Unstick) stand. */
const READING_HOLDS = {
  resolve: true, move: true, go: true, enter: true, leave: true, trade: true, tame: true, refine: true,
  make: true, build: true, task: (a) => a.action !== 'list',
};

export const THEN_READING = 'The stage is still playing a passage of the book for the player (`reading`). Answer what they typed in words only — a line or two in the world, never the passage — and change nothing: Resolve, Move and the rest wait (refused `reading`) until it ends. The page then sends `[scene] read`: Look, and do what they asked. ';

/* Is a passage holding now? */
export function readingNow(state, now = new Date()) {
  const since = Date.parse(state?.reading?.since ?? '');
  return Number.isFinite(since) && now.getTime() - since < READING_TTL_MS;
}

/* Ling's call held while a passage plays: the refusal, and the save with the hold marked `held`. */
export function readingHold(state, verb, args = {}, now = new Date()) {
  const hold = READING_HOLDS[verb];
  if (!hold || (typeof hold === 'function' && !hold(args)) || !readingNow(state, now)) return null;
  return {
    keep: state.reading.held ? null : { ...state, reading: { ...state.reading, held: true } },
    result: { ok: false, refused: 'reading', say: null, then: THEN_READING },
  };
}

/* The page's `reading --hold=1|0`: the hold begun (or renewed), or ended — answering whether Ling
   was held meanwhile. `keep` the save to write, null when nothing changed. */
export function pageReading(state, args = {}, now = new Date()) {
  const on = ['1', 'true', 'on'].includes(String(args.hold ?? ''));
  const was = state?.reading ?? null;
  if (on) {
    const held = readingNow(state, now) && was?.held;
    return { keep: { ...state, reading: { since: now.toISOString(), ...(held ? { held: true } : {}) } }, result: { ok: true, hold: true } };
  }
  if (!was) return { keep: null, result: { ok: true, hold: false, held: false } };
  const keep = { ...state };
  delete keep.reading;
  return { keep, result: { ok: true, hold: false, held: Boolean(was.held && readingNow(state, now)) } };
}
