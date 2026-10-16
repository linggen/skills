// rope-worker.js — a 割绳子 level made off the page's thread (rope-gen.js can take a second or two on
// a phone for the hardest days): { id, seed, opts } in, { id, made } out. A module worker. The
// handler is set before anything loads — the physics loads with a top-level await, and a message
// that arrives while it does would find no one listening.
const ready = import('./rope-gen.js');

self.onmessage = async (e) => {
  const { id, seed, opts } = e.data ?? {};
  try {
    const { generate } = await ready;
    self.postMessage({ id, made: generate(seed, opts) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
