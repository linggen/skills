// rope-worker.js — a 割绳子 level made off the page's thread (rope-gen.js can take a second or two on
// a phone for the hardest days): { id, seed, opts } in, { id, made } out. A module worker.
import { generate } from './rope-gen.js';

self.onmessage = (e) => {
  const { id, seed, opts } = e.data ?? {};
  try {
    self.postMessage({ id, made: generate(seed, opts) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
