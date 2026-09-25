// drain.js — what a finished Get run hands the agent: facts, never a sentence.
// The page watches the queue; when every song it saw in flight has settled, the
// agent is told what came and what didn't (by name, with the reason) and words
// it in the chat. Pure — no DOM — so node tests it.

const ACTIVE = new Set(['pending', 'running', 'cancelling']);
const MAX_NAMED = 12;

const name = (i) => [i.artist, i.title].filter(Boolean).join(' - ');

/// Watch one poll: remember what is in flight; once none of it is, return the
/// run's facts and forget it. `seen` is the caller's Set of ids, kept between
/// polls. Returns null while the run is going (or there was none).
export function drainStep(items, seen) {
  for (const i of items) if (ACTIVE.has(i.status)) seen.add(i.id);
  if (!seen.size || items.some((i) => seen.has(i.id) && ACTIVE.has(i.status))) return null;
  const run = items.filter((i) => seen.has(i.id));
  seen.clear();
  const got = run.filter((i) => i.status === 'done');
  const failed = run.filter((i) => i.status === 'error');
  if (!got.length && !failed.length) return null; // all cancelled: their own act, nothing to tell
  return {
    got: got.length,
    got_names: got.slice(0, MAX_NAMED).map((i) => (i.file || name(i)).replace(/\.[a-z0-9]+$/i, '')),
    failed: failed.map((i) => `${name(i)}: ${i.error || 'failed'}`),
    // Every song was the phone's Get: Yinyue tells them there, from `tasks`.
    for_phone: run.every((i) => i.for_phone) || undefined,
  };
}

/// The hidden message: a tag, then the facts as JSON. SKILL.md says what the
/// agent does with it.
export const drainMessage = (facts) => `[DOWNLOADS] ${JSON.stringify(facts)}`;
