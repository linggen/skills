// phone/entry.mjs — the door the phone calls (tools/phone-bundle.mjs bundles this with the rules and the world).
// It is rules.mjs's own command line, called as a function: `call(verb, args)` answers the JSON text the CLI prints,
// over an in-memory file system holding the world (read-only) and the player's files under /data.
//
//   Lingjing.load(worldFilesJson)            once, with lingjing-world.json's text
//   Lingjing.call('look', {}, { now })       any verb, as `node rules.mjs <verb> --k=v`; → JSON text
//   Lingjing.look() / tell() / resolve(exit) / task(action, id) / win(id, stars) / init() / playTo(at)
//   Lingjing.dump() / Lingjing.restore(json) the player's files (the save, its log, parked worlds) — the host keeps them
//   Lingjing.env(key, value)                 LINGGEN_LANGUAGE, LINGJING_NOW …, as the engine reads them
//   Lingjing.migrate(stateText)              a save's state brought to these rules' version (state.mjs migrate), as
//                                            JSON text — nothing written; null when it is not a state or is newer
//                                            than these rules. The host's sync compares two saves at one version.
//   Lingjing.her(kind, look, opts)           银月's word at a page moment (scripts/hersay.js, the Mac's own): her mode
//                                            from the Look, the facts and ask for her model, and her pool's lines —
//                                            JSON text { mode, facts, pool } (null when she is absent or the moment
//                                            has nothing to say); `short` builds its facts from the Look's shelf
//                                            and `mijing` from the rules' answer (opts.result: hersay.js mijingWhat);
//                                            and `gear` from the door's gear_hint (hersay.js gearFacts; `key`: game|losses);
//                                            `qian` / `qian_friend` (问签 v2): the 签 card's one line, qian-facts.js;
//                                            `emerge` (出关): opts.result is `seclude leave`'s answer, seclude-facts.js
//   Lingjing.quests({app: doc})             the apps' menus (/quests/<app>.json) the host hands in; null drops one
//   Lingjing.drainTrack()                    the play log's lines since the last drain (rules/analytics.mjs), as JSON
//                                            text — the app keeps them in its own folder, never in the dumped save
//
// Nothing here is a rule: the rules are rules.mjs and rules/*.mjs, unchanged.
import { chooseBoard } from '../../scripts/board-choice.js';
import { parseArgs } from '../../scripts/rules/files.mjs';
import { forLing, run } from '../../scripts/rules.mjs';
import { newerRefusal } from '../../scripts/rules/newer.mjs';
import { STATE_VERSION, migrate } from '../../scripts/state.mjs';
import { drainSink } from '../../scripts/rules/analytics.mjs';
import { MOMENTS, REGISTER, REGISTER_ASLEEP, gearFacts, herMode, mijingWhat, momentFacts, poolOf, shortFacts } from '../../scripts/hersay.js';
import { friendFacts, qianFacts } from '../../scripts/qian-facts.js';
import { emergeFacts } from '../../scripts/seclude-facts.js';
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
process.env.LINGJING_HOST = 'phone'; // the device filter's host (rules/chores.mjs playerDevices): the phone, the Mac known once paired
process.env.LINGJING_TRACK_SINK = '1'; // the play log waits for the app (drainTrack), never in /data
// 体力 on, as the command line has it since 2026-11-02 (rules.mjs; Hanli: 「你把体力也打开加回来吧」).

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
    // A newer save reached by some other way (a parked one: state.mjs migrate throws) answers the door's refusal.
    if (err?.name === 'NewerSave') return JSON.stringify(newerRefusal(err.version));
    return JSON.stringify({ ok: false, refused: 'error', error: String(err?.message ?? err) });
  }
}

/* The moments told off the rules' answer, each its facts or null (nothing to say):
   问签 v2 (`qian`: his, from Look's divination; `qian_friend`: a friend's, the rules' answer to 替人求签) — the Mac's
   qian-facts.js; 出关 (`emerge`: `seclude leave`'s `emerged`) — the Mac's seclude-facts.js. */
const TOLD = {
  qian: (r, l, zh) => { const d = r ?? l.divination; return d?.poem ? qianFacts(d, zh) : null; },
  qian_friend: (r, l, zh) => { const d = r?.friend ?? r; return d?.poem ? friendFacts(d, zh) : null; },
  emerge: (r, l, zh) => emergeFacts(r?.emerged ?? r, zh),
};

/* 银月 at a page moment, as the Mac's hersay.js says it: the phone keeps the once-limits (its own prefs), asks its model
   with `facts`, and falls back to `pool`. `short` takes its facts from the Look itself (shortFacts). */
function her(kind, look = {}, { lang = 'zh', weight = 'full', what = null, result = null } = {}) {
  const l = typeof look === 'string' ? JSON.parse(look) : look;
  const mode = herMode(l), zh = lang !== 'en';
  // A moment told off the rules' answer (`result`), with no pool: without her model the card stands without her line.
  const told = TOLD[kind];
  if (told) {
    const facts = mode === 'absent' ? null : told(typeof result === 'string' ? JSON.parse(result) : result, l, zh);
    if (!facts) return JSON.stringify(null);
    return JSON.stringify({ mode, id: null, facts: facts + (mode === 'asleep' ? REGISTER_ASLEEP : REGISTER)[zh ? 'zh' : 'en'], pool: [] });
  }
  if (mode === 'absent' || !MOMENTS[kind]) return JSON.stringify(null);
  const short = kind === 'short' ? shortFacts(l, zh) : null;
  if (kind === 'short' && !short) return JSON.stringify(null);
  // A story fight weighed with a thing he owns and does not wear (the door's gear_hint): its facts from the Look; `key` is
  // the once-limit's (once a fight a day, again after each loss — hersay.js gearKey, with the host's day).
  const gear = kind === 'gear' ? gearFacts(l, zh) : null;
  if (kind === 'gear' && !gear) return JSON.stringify(null);
  // A 秘境 answer (`result`, the rules' own): its facts as the Mac's page gives them (hersay.js mijingWhat); none, no word.
  const fromResult = kind === 'mijing' && result ? mijingWhat(typeof result === 'string' ? JSON.parse(result) : result, zh) : null;
  if (kind === 'mijing' && result && !fromResult) return JSON.stringify(null);
  const said = short?.what ?? gear?.what ?? fromResult ?? what ?? '';
  const variant = short?.far ? 'far' : null;
  return JSON.stringify({ mode, id: short?.id ?? gear?.item ?? null, ...(gear ? { key: `${gear.game}|${gear.lost}` } : {}), facts: momentFacts(kind, said, zh ? 'zh' : 'en', { weight, mode }), pool: poolOf(kind, { mode, lang: zh ? 'zh' : 'en', weight, variant }) });
}

/* A save's state at these rules' version, for comparing two copies (the host's sync): the rules' own migrate, pure —
   nothing read from or written to /data. Not a state, or newer than these rules (NewerSave): null. */
function migrated(text) {
  try {
    const state = JSON.parse(text);
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    return JSON.stringify(migrate(state));
  } catch {
    return null;
  }
}

let ENV_NOW = false;
const api = {
  // The newest save version these rules play (state.mjs STATE_VERSION): the host's sync never hands them a newer one.
  version: STATE_VERSION,
  chooseBoard: (task, caps) => JSON.stringify(chooseBoard(task, caps)),
  load: (json) => { seed(typeof json === 'string' ? JSON.parse(json) : json); return stats(); },
  call,
  env: (key, value) => { if (value == null) delete process.env[key]; else process.env[key] = String(value); if (key === 'LINGJING_NOW') ENV_NOW = value != null; },
  dump: () => JSON.stringify(dump(DATA)),
  restore: (json) => { restore(typeof json === 'string' ? JSON.parse(json) : json); },
  migrate: (text) => migrated(text),
  // The verbs the story screen uses, named (each one is `call` and nothing more).
  init: (args = {}, opts) => call('init', args, opts),
  look: (args = {}, opts) => call('look', args, opts),
  tell: (opts) => call('tell', {}, opts),
  resolve: (exit, opts) => call('resolve', { exit }, opts),
  task: (action, id, opts) => call('task', { action, id }, opts),
  win: (id, stars, opts) => call('win', { id, ...(stars != null ? { stars } : {}) }, opts),
  playTo: (at, opts) => call('seed', { at }, { save: 'play', ...opts }),
  drainTrack: () => JSON.stringify(drainSink()),
  // The apps' menus the rules read (/quests/<app>.json), set by the host: the phone's own record of its 开府
  // steps, and the Mac's linggen.json when paired — `{ app: doc }`, each replacing that app's file; null drops it.
  quests: (files) => {
    const map = typeof files === 'string' ? JSON.parse(files) : files ?? {};
    fs.mkdirSync(QUESTS);
    for (const [app, doc] of Object.entries(map)) {
      if (!/^[a-z0-9-]{1,48}$/.test(app)) continue;
      const file = `${QUESTS}/${app}.json`;
      if (doc == null) { if (fs.existsSync(file)) fs.unlinkSync(file); continue; }
      fs.writeFileSync(file, typeof doc === 'string' ? doc : JSON.stringify(doc));
    }
    return JSON.stringify(fs.readdirSync(QUESTS));
  },
  her,
  stats,
};
globalThis.Lingjing = api;
