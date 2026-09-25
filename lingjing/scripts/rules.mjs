// The rules engine — the only writer of a player's state. Ling proposes by
// calling a verb; the rules check it against the state and the content and
// either apply it or refuse with a reason Ling can narrate.
//
//   node rules.mjs <verb> [--key value …]
//   verbs: init look progress story resolve judge task win duel tame refine tale summarize move trade lang make enter leave
//          build worlds travel amend art go saves save load forget seclude undo
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
import { guard, onLook, unconfirmed } from './rules/confirm.mjs';
import { markSeen, notePage, READS_PAGE, unseen } from './rules/did.mjs';
import { clock, dataDir, freshState, parseArgs, readQuests, savedFile, savedFor, userTurn, withLock, writeAtomic } from './rules/files.mjs';
import { look, stageAt } from './rules/look.mjs';
import { closeStaleFight, fightHold } from './rules/tasks.mjs';
import { seclusionHold } from './rules/seclusion.mjs';
import { heed } from './rules/travel.mjs';
import { VERBS } from './rules/verbs.mjs';
import { owesRecap, withHerBeat } from './rules/story.mjs';
import { guideVerb, withGuides } from './rules/guide.mjs';
import { atScene } from './rules/world.mjs';
import { BUILDING_WAITS, keepDay, keepSave, paintList, readSave } from './rules/worlds.mjs';

export { refine, TREASURE_TOP } from './rules/arms.mjs';
export { askOf, tapThen, thenFor } from './rules/ask.mjs';
export { deck, deckFor, fightSetup, hpMaxOf, ownedCards } from './rules/cards.mjs';
export { hasCompanion } from './rules/companion.mjs';
export { judge, resolve, riddleOf } from './rules/core.mjs';
export { greet } from './rules/daily.mjs';
export { advance, BOOK_MAX } from './rules/errands.mjs';
export { meet } from './rules/road.mjs';
export { parseArgs } from './rules/files.mjs';
export { castThrows, divinationBrief, divine, fate, fateBrief, fateOf } from './rules/fortune.mjs';
export { look } from './rules/look.mjs';
export { closeStaleFight, duel, fightHold, lundao, task, win } from './rules/tasks.mjs';
export { go, heed, lang, move, summarize, trade } from './rules/travel.mjs';
export { chapterLook, owesRecap, recapLook, story, storyNode } from './rules/story.mjs';
export { lintTale, tale } from './rules/tale.mjs';
export { seclude, seclusionBrief, seclusionHold } from './rules/seclusion.mjs';
export { quest, show, VERBS } from './rules/verbs.mjs';
export { PAGE_KEEP, progress } from './rules/did.mjs';
export { amend, art, atlas, build, BUILDING_WAITS, enter, forget, leave, load, make, paintList, ring, save, saves, tame, travel, wake, worlds } from './rules/worlds.mjs';

/* Answers handed over as they are — no question, no stage: Progress is for
   a pet that only wants to know how the game stands; Story is a book to read. */
const PLAIN = new Set(['progress', 'story']);
/* The verbs that are story when they land: a scene step, something met on the road, a made scene entered. */
const STORY_VERBS = new Set(['resolve', 'meet', 'enter']);

/* One call, start to end, under the save's lock (files.mjs withLock): the
   read, the verb and every write it makes — Look's `asked_at` too, and a
   reader's place in what the page did. `reader` is who asked (`--for`):
   none is the page, whose every change is written down (rules/did.mjs). */
function run(verb, args, reader = null) {
  if (verb === 'guide') return guideVerb(args);
  const stateFile = path.join(dataDir(), 'state.json');
  return withLock(stateFile, () => guided(verb, args, reader, stateFile, runLocked(verb, args, stateFile, reader)), () => ({ ok: false, refused: 'busy', say: null }));
}

/* Ling's answer carries the rules of what just became live (rules/guide.mjs):
   once per session per part, remembered on the save and never logged. */
function guided(verb, args, reader, stateFile, result) {
  if (reader !== 'ling' || !fs.existsSync(stateFile)) return result;
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const out = withGuides({ verb, said: args.said, result, state, session: process.env.LINGGEN_SESSION_ID });
  if (out.guided) writeAtomic(stateFile, JSON.stringify({ ...state, guided: out.guided }));
  return out.result;
}

function runLocked(verb, args, stateFile, reader) {
  const logFile = path.join(dataDir(), 'log.jsonl');
  const now = clock();
  const raw = fs.existsSync(stateFile) ? migrate(JSON.parse(fs.readFileSync(stateFile, 'utf8'))) : null;

  // Ling's Restart / Undo / Load / Forget only after the one question was
  // asked (rules/confirm.mjs); the page's own calls are never gated.
  if (verb === 'undo') {
    const held = reader === 'ling' ? guard('undo', args, raw, null, now) : null;
    return held ? held.result : undo(stateFile, logFile);
  }
  // `init` begins the world in play again (or the one named), in the
  // language in use; the save it replaces is logged so `undo` brings it back.
  const worldId = verb === 'init' ? args.world ?? raw?.world ?? DEFAULT_WORLD : raw?.world ?? DEFAULT_WORLD;
  if (!knownWorld(worldId)) return { ok: false, refused: 'unknown-world', world: worldId, worlds: allWorlds() };
  const content = loadWorld(worldId);
  const unasked = verb === 'init' && reader === 'ling' ? guard('init', args, raw, content, now) : null;
  if (unasked) return unasked.result;
  // Fitted to its world (ids renamed since), and a fight left open on an
  // earlier day closed — both written with whatever this call writes.
  const saved = raw && raw.world === worldId ? closeStaleFight(migrate(raw, content), now) : raw;
  const state = verb === 'init' || !saved ? freshState(content, args.lang ?? saved?.lang, now) : saved;
  // 前情提要 owed after a while away (story.mjs): marked in place, and kept
  // below without a log line — Undo takes back moves, not the clock.
  const owed = verb !== 'init' && saved === state && owesRecap(state, now);
  if (verb === 'init' || !saved) writeAtomic(stateFile, JSON.stringify(state));
  if (verb === 'init') {
    if (saved) fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb, args, before: unconfirmed(saved) }) + '\n');
    return { ...look(state, content, { now, quests: readQuests() }), restarted: !!saved };
  }

  const fn = VERBS[verb];
  if (!fn) return { ok: false, refused: 'unknown-verb', verbs: ['init', ...Object.keys(VERBS), 'undo'] };
  if (BUILDING_WAITS.has(verb)) {
    const paint = paintList(content);
    if (paint.length) return { ok: false, refused: 'still-building', say: null, paint };
  }
  // While a fight is open, what would change the world waits (tasks.mjs fightHold).
  // While in 闭关, likewise: 出关 first (rules/seclusion.mjs seclusionHold).
  const held = fightHold(state, verb, args) ?? seclusionHold(state, verb, args);
  if (held) return held.result;
  if (raw) keepDay(raw, now);
  const asked = reader === 'ling' ? guard(verb, args, state, content, now) : null;
  if (asked) {
    if (asked.keep) writeAtomic(stateFile, JSON.stringify(asked.keep));
    return asked.result;
  }
  const heard = heed(state, args.said);
  const out = fn(heard, content, { now, quests: readQuests(), turn: userTurn(), said: args.said }, args);
  if (out.result?.load) return loadSave(out.result.load, state, { stateFile, logFile, now });
  // Forget answered: the asking is used up (Load's is, with the save it replaces).
  if (verb === 'forget' && out.result?.ok && state.confirm) writeAtomic(stateFile, JSON.stringify(unconfirmed(state)));
  // A save fitted, a stale fight closed or a language heard is a change too.
  const changed = out.state ?? (heard !== (raw ?? state) ? heard : null);
  // What the page did, written down with it, so Ling and Yinyue can read it.
  const next = (!reader && notePage(verb, args, out.result, changed, content, now)) || changed;
  // Something of the story happened: 传闻's quiet clock starts again (tale.mjs storyDue).
  if (next && out.result?.ok && STORY_VERBS.has(verb)) next.story_at = now.toISOString();
  if (next) {
    next.updated = now.toISOString();
    writeAtomic(stateFile, JSON.stringify(next));
    fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb, args, before: unconfirmed(raw ?? state) }) + '\n');
  }
  if (out.result?.travel) return travelTo(out.result.travel, next ?? state, { stateFile, logFile, now, verb });
  const asking = next ?? state;
  const told = pageTold(verb, reader, asking, stateFile);
  // A refusal with her word in it (Move's `too-hard`) writes nothing, but her
  // beat is kept on the save as a node for the page to raise — never logged,
  // so Undo still takes back the last real move (story.mjs refusalBeat).
  if (!next && out.result?.ok === false && out.result.her_beat) {
    asking.node = withHerBeat(null, out.result.her_beat, now);
    writeAtomic(stateFile, JSON.stringify(asking));
  }
  // 传闻's nudge is handed to Ling once a span: written down like her place in
  // page_did — never logged, so Undo still takes back the last real move.
  if (reader === 'ling' && verb === 'look' && out.result?.story_due) {
    asking.story_told = now.toISOString();
    writeAtomic(stateFile, JSON.stringify(asking));
  }
  // 前情提要 is handed to Ling once: told the moment her Look carries it.
  if (reader === 'ling' && verb === 'look' && out.result?.recap_due) {
    asking.recap = { told: now.toISOString() };
    writeAtomic(stateFile, JSON.stringify(asking));
  } else if (owed && !next) writeAtomic(stateFile, JSON.stringify(asking));
  const said = heard !== state ? { ...out.result, lang_set: heard.lang } : out.result;
  const result = told ? { ...said, page_did: told } : said;
  if (PLAIN.has(verb)) return result;
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
  // 重来 / 悔棋 in his words: the one question, over the scene's own; its
  // answer tapped back: the tool it names (rules/confirm.mjs). Never logged.
  const steer = reader === 'ling' && verb === 'look' ? onLook(args.said, asking, content, now) : null;
  if (steer?.keep) writeAtomic(stateFile, JSON.stringify(steer.keep));
  if (steer?.tap) return { ...answer, then: tapThen(steer.tap, args.said) };
  if (steer?.ask) return { ...answer, ask: steer.ask, then: steer.then };
  const tapCtx = { now, quests: readQuests(), said: args.said };
  const tap = verb === 'look' && tapThen(answer.ask ?? askOf(content, next ?? state, tapCtx, {}, true), args.said);
  return tap ? { ...answer, then: tap } : answer;
}

/* What the page did since this reader last read, when this verb is one of
   theirs; their place moves to the newest. Never logged: the reader's place
   is not a move Undo takes back — a Look before Undo would eat it. */
function pageTold(verb, reader, state, stateFile) {
  const reads = READS_PAGE[verb];
  if (!reader || !reads?.who(reader)) return null;
  const told = unseen(state, reader, reads.keep);
  if (markSeen(state, reader)) writeAtomic(stateFile, JSON.stringify(state));
  return verb === 'look' && !told.length ? null : told;
}

/* Park the save in play under its world and take up the other world's —
   restored where it stood, or begun. The answer is the new world's Look,
   with `travelled` saying where from and whether the save is fresh. */
function travelTo(id, current, { stateFile, logFile, now, verb }) {
  const parkedBefore = parkedFiles([current.world, id]);
  keepSave('world', current.world, current, now.toISOString());
  const content = loadWorld(id);
  const parked = savedFor(id) ? readSave(savedFile(id)).state : null;
  if (parked) fs.rmSync(savedFile(id), { force: true }); // in play now, not kept
  const state = unconfirmed(parked) ?? freshState(content, current.lang, now);
  state.updated = now.toISOString();
  writeAtomic(stateFile, JSON.stringify(state));
  fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb: 'travel', args: { world: id, by: verb }, before: unconfirmed(current), parked: parkedBefore }) + '\n');
  return { ...look(state, content, { now, quests: readQuests() }), travelled: { from: current.world, to: id, fresh: !parked } };
}

/* The kept save becomes the game in play. Another world's: the game in play
   is parked under its world first, and that world's parked copy — now in
   play — is let go. The answer is its Look, with `loaded` saying which. */
function loadSave(found, current, { stateFile, logFile, now }) {
  const parkedBefore = parkedFiles([current.world, ...(found.kind === 'world' ? [found.id] : [])]);
  const state = migrate(unconfirmed(found.state), loadWorld(found.state.world));
  if (state.world !== current.world) keepSave('world', current.world, current, now.toISOString());
  if (found.kind === 'world') fs.rmSync(savedFile(found.id), { force: true });
  state.updated = now.toISOString();
  writeAtomic(stateFile, JSON.stringify(state));
  fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb: 'load', args: { id: found.id }, before: unconfirmed(current), parked: parkedBefore }) + '\n');
  const content = loadWorld(state.world);
  return { ...look(state, content, { now, quests: readQuests() }), loaded: { id: found.id, kind: found.kind, title: found.title, at: found.at } };
}

/* The parked saves a Travel or a Load is about to touch, as they were —
   the text of each, or null for none — so Undo puts them back too. Travel
   let the other world's parked save go, and Undo restored only the save in
   play: that world began again from nothing (review, 2026-09-24). */
function parkedFiles(ids) {
  return Object.fromEntries([...new Set(ids)].map(id => [id, savedFor(id) ? fs.readFileSync(savedFile(id), 'utf8') : null]));
}

function undo(stateFile, logFile) {
  const lines = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean) : [];
  if (!lines.length) return { ok: false, refused: 'nothing-to-undo' };
  const last = JSON.parse(lines.pop());
  for (const [id, text] of Object.entries(last.parked ?? {})) {
    if (text == null) fs.rmSync(savedFile(id), { force: true });
    else writeAtomic(savedFile(id), text);
  }
  writeAtomic(stateFile, JSON.stringify(unconfirmed(last.before)));
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
    if (k === 'story_node') continue; // the page's moment; Ling has the node on the move's own result
    // Her beat is hers: Ling learns only that she speaks here and what happened —
    // never her line or her memory, which she says herself (Hanli, 2026-09-24).
    if (k === 'her_beat' && v && typeof v === 'object') { out.her_beat = { id: v.id, facts: { happened: v.facts?.happened ?? null } }; continue; }
    if (k === 'shelf' && Array.isArray(v)) { out.shelf = v.map(shelfForLing); continue; }
    out[k] = forLing(v);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [verb, ...rest] = process.argv.slice(2);
  try {
    const { for: reader, ...args } = parseArgs(rest);
    const result = run(verb ?? 'look', args, reader ?? null);
    console.log(JSON.stringify(reader === 'ling' ? forLing(result) : result));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, refused: 'error', error: String(err?.message ?? err) }));
    process.exit(1);
  }
}
