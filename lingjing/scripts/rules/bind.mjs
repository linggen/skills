// rules/bind.mjs — a chat session bound to a scratch save, for live checks.
// Part of the rules engine; rules.mjs is its one door.
//
// The page on a scratch save (`?save=<name>`) may mount a chat of its own:
// it creates the session, then binds it here (`bind --session=<id>
// --save=<name>`, the page's alone). Every tool call the engine runs in that
// session carries its id (LINGGEN_SESSION_ID), so Ling's and 银月's calls
// there play the scratch save — never data/state.json. Default deny: a
// session not bound plays the player's own save as ever, and a scratch page
// whose bind failed shows no chat. The bindings live beside the real save
// (data/scratch-sessions.json), never inside a save, so no seed wipes them.
import fs from 'node:fs';
import path from 'node:path';
import { homeDir, SAVE_NAME, scratchName, writeAtomic } from './files.mjs';

const SESSION_ID = /^[A-Za-z0-9_-]{1,80}$/;
const KEEP_MS = 7 * 86400000; // a week: a test session is not kept for ever
const fileOf = () => path.join(homeDir(), 'scratch-sessions.json');

function readAll() {
  try {
    const doc = JSON.parse(fs.readFileSync(fileOf(), 'utf8'));
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {};
  } catch {
    return {};
  }
}

/* The scratch save a session plays, or null — the player's own save then. */
export function boundSave(sid) {
  if (!sid || !SESSION_ID.test(sid)) return null;
  const name = readAll()[sid]?.save;
  return typeof name === 'string' && SAVE_NAME.test(name) ? name : null;
}

/* The sessions bound to a scratch save, each with its save and when it was
   bound: the real page never picks one up as its chat; a scratch page takes
   its own back up on a reload. */
export const boundSessions = () => Object.entries(readAll()).filter(([sid]) => boundSave(sid)).map(([session, b]) => ({ session, save: b.save, at: b.at }));

/* Bind — the page's own, on a scratch save: this session plays it from now on.
   Ling's tools never reach it (every one of theirs carries `--for`). */
export function bind(args, reader, now = new Date()) {
  if (reader) return { ok: false, refused: 'page-only', say: null };
  const save = scratchName(), sid = String(args.session ?? '');
  if (!save) return { ok: false, refused: 'not-scratch', say: null };
  if (!SESSION_ID.test(sid)) return { ok: false, refused: 'bad-session', say: null };
  const kept = Object.fromEntries(Object.entries(readAll()).filter(([, b]) => now - new Date(b?.at ?? 0) < KEEP_MS));
  kept[sid] = { save, at: now.toISOString() };
  fs.mkdirSync(homeDir(), { recursive: true });
  writeAtomic(fileOf(), JSON.stringify(kept, null, 2) + '\n');
  return { ok: true, session: sid, save };
}
