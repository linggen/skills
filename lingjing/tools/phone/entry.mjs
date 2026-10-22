// phone/entry.mjs — the door the phone calls (tools/phone-bundle.mjs bundles this with the rules and the world).
// It is rules.mjs's own command line, called as a function: `call(verb, args)` answers the JSON text the CLI prints,
// over an in-memory file system holding the world (read-only) and the player's files under /data.
//
//   Lingjing.load(worldFilesJson)            once, with lingjing-world.json's text
//   Lingjing.call('look', {}, { now })       any verb, as `node rules.mjs <verb> --k=v`; → JSON text
//   Lingjing.look() / tell() / resolve(exit) / task(action, id) / win(id, stars) / init() / playTo(at)
//   Lingjing.dump() / Lingjing.restore(json) the player's files (the save, its log, parked worlds) — the host keeps them
//   Lingjing.env(key, value)                 LINGGEN_LANGUAGE, LINGJING_NOW …, as the engine reads them
//
// Nothing here is a rule: the rules are rules.mjs and rules/*.mjs, unchanged.
import { parseArgs } from '../../scripts/rules/files.mjs';
import { forLing, run } from '../../scripts/rules.mjs';
import fs, { dump, restore, seed, stats } from './shims/fs.mjs';
import { process } from './shims/process.mjs';

/* A bare JS engine (JavaScriptCore without WebKit) has the language but not the web's globals: structuredClone is one. */
function deepClone(v, seen = new Map()) {
  if (v === null || typeof v !== 'object') return v;
  if (seen.has(v)) return seen.get(v);
  if (v instanceof Date) return new Date(v.getTime());
  if (v instanceof Map) { const m = new Map(); seen.set(v, m); for (const [k, x] of v) m.set(deepClone(k, seen), deepClone(x, seen)); return m; }
  if (v instanceof Set) { const s = new Set(); seen.set(v, s); for (const x of v) s.add(deepClone(x, seen)); return s; }
  const out = Array.isArray(v) ? [] : {};
  seen.set(v, out);
  for (const k of Object.keys(v)) out[k] = deepClone(v[k], seen);
  return out;
}
if (typeof globalThis.structuredClone !== 'function') globalThis.structuredClone = (v) => deepClone(v);

const DATA = '/data', QUESTS = '/quests';
const SAVE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

process.env.LINGJING_DATA = DATA;
process.env.LINGJING_QUESTS = QUESTS;
process.env.LINGJING_STAMINA_LIMIT ??= '0'; // as the command line sets it while the game is tested (rules.mjs)

/* `{k: v}` through the command line's own reading (`--k=v`: strings, true / false, empty dropped). */
const argsOf = (args = {}) => parseArgs(Object.entries(args).filter(([, v]) => v != null).map(([k, v]) => `--${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`));

function call(verb = 'look', args = {}, { reader = null, save = null, now = null } = {}) {
  try {
    const { for: who, ...rest } = argsOf(args);
    if (save != null && !SAVE.test(String(save))) return JSON.stringify({ ok: false, refused: 'bad-save', say: null });
    if (save != null) process.env.LINGJING_SAVE = String(save); else delete process.env.LINGJING_SAVE;
    if (now != null) process.env.LINGJING_NOW = String(now); else if (!ENV_NOW) delete process.env.LINGJING_NOW;
    fs.mkdirSync(QUESTS);
    if (verb === 'lang') return JSON.stringify({ ok: false, refused: 'host', say: null }); // the language is the host's: Lingjing.env('LINGGEN_LANGUAGE', …)
    const reading = reader ?? who ?? null;
    const result = run(verb, rest, reading);
    return JSON.stringify(reading === 'ling' ? forLing(result) : result);
  } catch (err) {
    return JSON.stringify({ ok: false, refused: 'error', error: String(err?.message ?? err) });
  }
}

let ENV_NOW = false;
const api = {
  load: (json) => { seed(typeof json === 'string' ? JSON.parse(json) : json); return stats(); },
  call,
  env: (key, value) => { if (value == null) delete process.env[key]; else process.env[key] = String(value); if (key === 'LINGJING_NOW') ENV_NOW = value != null; },
  dump: () => JSON.stringify(dump(DATA)),
  restore: (json) => { restore(typeof json === 'string' ? JSON.parse(json) : json); },
  // The verbs the story screen uses, named (each one is `call` and nothing more).
  init: (args = {}, opts) => call('init', args, opts),
  look: (args = {}, opts) => call('look', args, opts),
  tell: (opts) => call('tell', {}, opts),
  resolve: (exit, opts) => call('resolve', { exit }, opts),
  task: (action, id, opts) => call('task', { action, id }, opts),
  win: (id, stars, opts) => call('win', { id, ...(stars != null ? { stars } : {}) }, opts),
  playTo: (at, opts) => call('seed', { at }, { save: 'play', ...opts }),
  stats,
};
globalThis.Lingjing = api;
