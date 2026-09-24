// The rules engine — the only writer of a player's state. Ling proposes by
// calling a verb; the rules check it against the state and the content and
// either apply it or refuse with a reason Ling can narrate.
//
//   node rules.mjs <verb> [--key value …]
//   verbs: init look resolve judge task win duel tame write refine nourish branch summarize move trade lang make enter leave
//          build worlds travel amend art go saves save load forget undo
//
// Every verb prints one JSON object. A refusal is {ok:false, refused, say}
// and never changes state. The save says which world it plays; `init` begins
// it again — or another with `--world` — and logs the save it replaces. `build` and
// `travel` switch worlds: the save in play is parked under data/saves/ and
// the other world's is restored, or begun.
// Env: LINGJING_DATA, LINGJING_QUESTS, LINGJING_NOW; LINGGEN_USER_TURNS from the engine.
//
// The verbs live in rules/, one file per part of the game (world, errands,
// cards, travel …); this file is their one door — every export Ling's tools,
// the page and the tests use comes through here — and the command line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allWorlds, DEFAULT_WORLD, knownWorld, loadWorld } from './content.mjs';
import { migrate } from './state.mjs';
import { askOf, tapThen, withAsk } from './rules/ask.mjs';
import { clock, dataDir, freshState, parseArgs, readQuests, savedFile, savedFor, userTurn, writeAtomic } from './rules/files.mjs';
import { look, stageAt } from './rules/look.mjs';
import { heed } from './rules/travel.mjs';
import { VERBS } from './rules/verbs.mjs';
import { atScene } from './rules/world.mjs';
import { BUILDING_WAITS, keepDay, keepSave, paintList, readSave } from './rules/worlds.mjs';

export { nourish, NOURISH, refine, TREASURE_TOP } from './rules/arms.mjs';
export { askOf, tapThen, thenFor } from './rules/ask.mjs';
export { deck, deckFor, fightSetup, hpMaxOf, ownedCards } from './rules/cards.mjs';
export { bond, hasCompanion, tend } from './rules/companion.mjs';
export { judge, resolve, riddleOf } from './rules/core.mjs';
export { chance, greet, journey } from './rules/daily.mjs';
export { advance, BOOK_MAX, meet } from './rules/errands.mjs';
export { parseArgs } from './rules/files.mjs';
export { castThrows, divinationBrief, divine, fate, fateBrief, fateOf } from './rules/fortune.mjs';
export { look } from './rules/look.mjs';
export { duel, lundao, task, win, write } from './rules/tasks.mjs';
export { branch, go, heed, lang, move, summarize, trade } from './rules/travel.mjs';
export { quest, show, VERBS } from './rules/verbs.mjs';
export { amend, art, atlas, build, BUILDING_WAITS, enter, forget, leave, load, make, paintList, ring, save, saves, tame, travel, wake, worlds } from './rules/worlds.mjs';

function run(verb, args) {
  const stateFile = path.join(dataDir(), 'state.json');
  const logFile = path.join(dataDir(), 'log.jsonl');
  const now = clock();
  const saved = fs.existsSync(stateFile) ? migrate(JSON.parse(fs.readFileSync(stateFile, 'utf8'))) : null;

  if (verb === 'undo') return undo(stateFile, logFile);
  // `init` begins the world in play again (or the one named), in the
  // language in use; the save it replaces is logged so `undo` brings it back.
  const worldId = verb === 'init' ? args.world ?? saved?.world ?? DEFAULT_WORLD : saved?.world ?? DEFAULT_WORLD;
  if (!knownWorld(worldId)) return { ok: false, refused: 'unknown-world', world: worldId, worlds: allWorlds() };
  const content = loadWorld(worldId);
  const state = verb === 'init' || !saved ? freshState(content, args.lang ?? saved?.lang, now) : saved;
  if (verb === 'init' || !saved) writeAtomic(stateFile, JSON.stringify(state));
  if (verb === 'init') {
    if (saved) fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb, args, before: saved }) + '\n');
    return { ...look(state, content, { now, quests: readQuests() }), restarted: !!saved };
  }

  const fn = VERBS[verb];
  if (!fn) return { ok: false, refused: 'unknown-verb', verbs: ['init', ...Object.keys(VERBS), 'undo'] };
  if (BUILDING_WAITS.has(verb)) {
    const paint = paintList(content);
    if (paint.length) return { ok: false, refused: 'still-building', say: null, paint };
  }
  if (saved) keepDay(saved, now);
  const heard = heed(state, args.said);
  const out = fn(heard, content, { now, quests: readQuests(), turn: userTurn(), said: args.said }, args);
  if (out.result?.load) return loadSave(out.result.load, state, { stateFile, logFile, now });
  const next = out.state ?? (heard !== state ? heard : null);
  if (next) {
    next.updated = now.toISOString();
    writeAtomic(stateFile, JSON.stringify(next));
    fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb, args, before: state }) + '\n');
  }
  if (out.result?.travel) return travelTo(out.result.travel, next ?? state, { stateFile, logFile, now, verb });
  const result = heard !== state ? { ...out.result, lang_set: heard.lang } : out.result;
  const asking = next ?? state;
  const answer = withAsk(result, content, asking, { now, quests: readQuests(), said: args.said, verb });
  // Written down, so the next bare Look does not ask it again. Cleared by
  // walking somewhere, because `asked_at` is the place it was asked at.
  const here = stageAt(content, asking);
  if (answer.ask && !atScene(content, asking) && asking.asked_at !== here) {
    asking.asked_at = here;
    writeAtomic(stateFile, JSON.stringify(asking));
  }
  // A tapped label is matched against the question whether or not it was
  // asked: the roads are on the map card even when the chat holds its tongue,
  // and a tap on one must still become a Move.
  const tapCtx = { now, quests: readQuests(), said: args.said };
  const tap = verb === 'look' && tapThen(answer.ask ?? askOf(content, next ?? state, tapCtx, {}, true), args.said);
  return tap ? { ...answer, then: tap } : answer;
}

/* Park the save in play under its world and take up the other world's —
   restored where it stood, or begun. The answer is the new world's Look,
   with `travelled` saying where from and whether the save is fresh. */
function travelTo(id, current, { stateFile, logFile, now, verb }) {
  keepSave('world', current.world, current, now.toISOString());
  const content = loadWorld(id);
  const parked = savedFor(id) ? readSave(savedFile(id)).state : null;
  if (parked) fs.rmSync(savedFile(id), { force: true }); // in play now, not kept
  const state = parked ?? freshState(content, current.lang, now);
  state.updated = now.toISOString();
  writeAtomic(stateFile, JSON.stringify(state));
  fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb: 'travel', args: { world: id, by: verb }, before: current }) + '\n');
  return { ...look(state, content, { now, quests: readQuests() }), travelled: { from: current.world, to: id, fresh: !parked } };
}

/* The kept save becomes the game in play. Another world's: the game in play
   is parked under its world first, and that world's parked copy — now in
   play — is let go. The answer is its Look, with `loaded` saying which. */
function loadSave(found, current, { stateFile, logFile, now }) {
  const state = found.state;
  if (state.world !== current.world) keepSave('world', current.world, current, now.toISOString());
  if (found.kind === 'world') fs.rmSync(savedFile(found.id), { force: true });
  state.updated = now.toISOString();
  writeAtomic(stateFile, JSON.stringify(state));
  fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb: 'load', args: { id: found.id }, before: current }) + '\n');
  const content = loadWorld(state.world);
  return { ...look(state, content, { now, quests: readQuests() }), loaded: { id: found.id, kind: found.kind, title: found.title, at: found.at } };
}

function undo(stateFile, logFile) {
  const lines = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean) : [];
  if (!lines.length) return { ok: false, refused: 'nothing-to-undo' };
  const last = JSON.parse(lines.pop());
  writeAtomic(stateFile, JSON.stringify(last.before));
  writeAtomic(logFile, lines.length ? lines.join('\n') + '\n' : '');
  return { ok: true, undid: last.verb, at: last.at };
}

/* What Ling is handed is not what the page draws (his, 2026-09-18: 「don't
   blow ling's context up」). Ling's tools ask with --for=ling (SKILL.md) and
   get the result with the page's own drawing data taken out; the page, and
   anything else, gets it all (an open page on old code never loses its map): every place of the province for the map, and a
   shelf's pictures. The rest of the shelf she keeps — what a thing is
   (`kind`, `about`), what it does (`effect`, its root), both prices, how
   many are held and whether one is worn: SKILL.md has her tell a thing from
   its `about` and `effect` and speak prices only as the shelf gives them.
   Measured 2026-09-23 on his save at 彭城: Look 10.3k chars, 4.2k of them
   places, pictures and blurbs. The rules never read it back, so it cannot
   change a decision. */
const shelfForLing = i => {
  if (!i || typeof i !== 'object') return i;
  const { art, ...kept } = i; // the picture is the page's; the words and prices are hers
  return kept;
};

export function forLing(value) {
  if (Array.isArray(value)) return value.map(forLing);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'places' && Array.isArray(v) && 'roads' in value) continue;
    if (k === 'shelf' && Array.isArray(v)) { out.shelf = v.map(shelfForLing); continue; }
    out[k] = forLing(v);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [verb, ...rest] = process.argv.slice(2);
  try {
    const { for: reader, ...args } = parseArgs(rest);
    const result = run(verb ?? 'look', args);
    console.log(JSON.stringify(reader === 'ling' ? forLing(result) : result));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, refused: 'error', error: String(err?.message ?? err) }));
    process.exit(1);
  }
}
