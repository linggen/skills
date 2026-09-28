// A game's slow half — a module's `think(state)`, the rival's search — run off the
// page in one Worker (./think-worker.js), so the board stays live while it thinks.
// Each ask gets a ticket; the reply comes back by it. A Worker that cannot start,
// or dies, is not missed: the thinking runs inline, as it did before the Worker.

// Run one job on the page. A beat first, so the "thinking" frame paints.
const INLINE_BEAT_MS = 40;
function inline(job) {
  setTimeout(() => {
    try { job.done(job.mod.think(job.state)); } catch (e) { job.fail(e); }
  }, INLINE_BEAT_MS);
}

// `spawn()` makes the Worker (and may throw); answers `think(mod, state)` → Promise
// of the module's reply.
export function thinker(spawn) {
  let worker; // undefined: not tried yet; null: none, think inline
  let next = 0;
  const waiting = new Map(); // ticket → { mod, state, done, fail }

  function heard({ data }) {
    const job = waiting.get(data?.ticket);
    if (!job) return;
    waiting.delete(data.ticket);
    if ('error' in data) inline(job);
    else job.done(data.move);
  }
  // The Worker died (its script would not load, most likely): everything it
  // held is thought inline, and so is everything after.
  function died(e) {
    e?.preventDefault?.();
    console.warn('[lingjing] think worker down, thinking inline', e?.message ?? e);
    worker?.terminate?.();
    worker = null;
    const held = [...waiting.values()];
    waiting.clear();
    held.forEach(inline);
  }
  function start() {
    if (worker !== undefined) return worker;
    try {
      worker = spawn();
      worker.onmessage = heard;
      worker.onerror = died;
    } catch (e) {
      console.warn('[lingjing] no think worker, thinking inline', e?.message ?? e);
      worker = null;
    }
    return worker;
  }

  return (mod, state) => new Promise((done, fail) => {
    const job = { mod, state, done, fail };
    const w = start();
    if (!w) { inline(job); return; }
    const ticket = ++next;
    waiting.set(ticket, job);
    w.postMessage({ ticket, game: mod.meta.id, state });
  });
}

// A reply lands only on the board it was thought for: still the one kept under
// its task, and not moved since (reset, re-dealt or closed meanwhile → dropped).
export const stillAsked = (boards, g, asked) => boards.get(g.taskId) === g && g.state === asked;
