// Where memory is, for every page of this skill: the engine that serves the
// page hosts it, on the page's own origin.
// The page is served by the engine that hosts memory, so memory is a
// same-origin call: `POST /mem/api/memory/<verb>` (the engine strips `/mem`
// and hands the rest to memory's own router). The answer is memory's
// envelope, `{ok, data}` or `{ok:false, error, code}`. `/mem` is open to the
// machine the engine runs on, which is where this page is shown.
export const MEM_BASE = '/mem';
export const MEMORY_PREFIX = `${MEM_BASE}/api/memory/`;

/** The path of one memory verb on the engine's own origin. */
export function memoryPath(verb) {
  return `${MEMORY_PREFIX}${verb}`;
}

/** The `data` of a success envelope, or null for anything else. */
export function readEnvelope(envelope) {
  return envelope && envelope.ok && envelope.data ? envelope.data : null;
}
