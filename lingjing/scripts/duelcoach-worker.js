// The worker owns the coach; the exported handler is also usable without a worker.
import { newCoach, note, summary } from './duelcoach.js';

export function handle(state, msg) {
  if (msg.type === 'start') {
    state.catalog = msg.catalog;
    state.coach = newCoach();
    return { type: 'ready' };
  }
  if (msg.type === 'note') {
    note(state.coach, { ...msg.copy, catalog: state.catalog }, msg.action, msg.opts);
  } else if (msg.type === 'summary') {
    return { type: 'summary', id: msg.id, summary: summary(state.coach, msg.st) };
  }
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  const state = {};
  globalThis.onmessage = ({ data }) => {
    try {
      const result = handle(state, data);
      if (result) globalThis.postMessage(result);
    } catch {
      // A failed start must let the page use its in-thread fallback.
      if (data?.type === 'start') globalThis.postMessage({ type: 'start-error' });
    }
  };
}
