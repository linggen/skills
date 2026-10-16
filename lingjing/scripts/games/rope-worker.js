// rope-worker.js — a 割绳子 level made off the page's thread (rope-gen.js can take a second or two on
// a phone for the hardest days): { id, seed, opts } in, { id, made } out. A module worker. The
// handler is set before anything loads — the physics loads with a top-level await, and a message
// that arrives while it does would find no one listening. Imported anywhere else (a test that walks
// scripts/games/), it does nothing.
const inWorker = typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope;

if (inWorker) {
  const ready = import('./rope-gen.js');
  globalThis.onmessage = async (e) => {
    const { id, seed, opts } = e.data ?? {};
    try {
      const { generate } = await ready;
      globalThis.postMessage({ id, made: generate(seed, opts) });
    } catch (err) {
      globalThis.postMessage({ id, error: String(err?.message ?? err) });
    }
  };
}
