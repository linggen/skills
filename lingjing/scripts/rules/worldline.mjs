// rules/worldline.mjs — what 灵境 gives the world block (SKILL.md `world-line`)
// and the activity log (`activity-verbs`): where the player stands, as the game
// names it, and the three moments worth a line in the log. Part of the rules
// engine; rules.mjs is its one door.
//
//   lingjing: place 彭城 · realm 练气四层 · seclusion none · chapter 第三回 · 5m ago
//
// Readings only, from what the rules already build for their own pages
// (progress.mjs summaryOf: place and realm; hui.mjs: the 回). Not the player's
// name, not 灵石, not 修为 — no figure of the save's economy.
//
// THE SAVE IS NEVER TOUCHED HERE. `world.json` is a side file written beside
// the save (data/world.json), only for the player's own save (never a scratch
// `--save=`), only when its body changes; a failure is swallowed — the game
// never waits on its own line. The save is read, before and after the verb,
// under the lock the verb already holds.
import fs from 'node:fs';
import path from 'node:path';
import { knownWorld, loadWorld } from '../content.mjs';
import { pick, realmName } from '../state.mjs';
import { chapterLabel } from './hui.mjs';
import { langNow } from './language.mjs';
import { placeOf } from './world.mjs';
import { homeDir, scratchName, writeAtomic } from './files.mjs';

const HOUR = 3600_000;
const pad = n => String(n).padStart(2, '0');
/* `MM-DD HH:MMZ`, UTC: the rules' own clock is the save's ISO stamps. */
const stampOf = ms => { const d = new Date(ms); return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`; };

/* The line's fields, in the order SKILL.md declares them. */
/* The chapter last: an English place and realm are long, and the engine drops a field that does not fit from the end. */
export const FIELDS = ['place', 'realm', 'seclusion', 'chapter'];

/* 闭关, as a fact: when it began and when the rules stop counting its hours
   (`cap_hours` after) — there is no other end; 出关 is the player's. Or `none`. */
function seclusionText(content, state) {
  const rule = content.rewards?.seclusion;
  if (!rule) return null;
  const since = Date.parse(state.seclusion?.since);
  if (!state.seclusion || Number.isNaN(since)) return 'none';
  return `since ${stampOf(since)}, counts to ${stampOf(since + rule.cap_hours * HOUR)}`;
}

/* The world file's body for a save. Pure. A field the save cannot say is left out. */
export function worldOf(content, state, lang = langNow()) {
  const place = pick(placeOf(content, state.place)?.name, lang) ?? state.place ?? null;
  const chapter = chapterLabel(content, state, content.chapters?.[state.chapter], lang, 'short');
  const fields = { place, realm: realmName(content, state, lang), chapter, seclusion: seclusionText(content, state) };
  return Object.fromEntries(FIELDS.filter(k => fields[k]).map(k => [k, String(fields[k])]));
}

/* Verbs that replace the game rather than play it: a restart, a load, an undo, a
   journey to another world, a seed — never a chapter finished or a 闭关 begun. */
const REPLACES = new Set(['init', 'load', 'undo', 'travel', 'seed', 'shift', 'forget', 'enter']);

/* What changed between two reads of the save worth the activity log: a chapter
   finished (`ended` grew), a 闭关 begun, a 闭关 ended. Pure. */
export function eventsOf(before, after, content, verb, lang = langNow()) {
  if (!before || !after || REPLACES.has(verb) || before.world !== after.world || before.run !== after.run) return [];
  const out = [];
  const was = new Set(before.ended ?? []);
  for (const id of (after.ended ?? []).filter(c => !was.has(c))) {
    const label = chapterLabel(content, after, content.chapters?.[id], lang, 'short');
    out.push({ by: 'user', app: 'lingjing', verb: 'chapter_done', object: label ?? id });
  }
  if (!before.seclusion && after.seclusion) {
    out.push({ by: 'user', app: 'lingjing', verb: 'seclusion_start', object: '闭关', detail: { focus: after.seclusion.focus, since: after.seclusion.since } });
  }
  if (before.seclusion && !after.seclusion) {
    out.push({ by: 'user', app: 'lingjing', verb: 'seclusion_end', object: '闭关', detail: { focus: before.seclusion.focus, hours: after.last_seclusion?.hours ?? null } });
  }
  return out;
}

/* ── the side effects ── */
const readSave = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const worldFile = () => path.join(homeDir(), 'world.json');

/* Records waiting for the CLI door to post them (rules.mjs), after the lock is gone. */
const toTell = [];
/* A test's data dir (LINGJING_DATA) never reaches an engine unless it asks (LINGJING_TELL). */
const mayTell = () => !scratchName() && (!process.env.LINGJING_DATA || process.env.LINGJING_TELL === '1');

/* Keep data/world.json in step with the save as `fn` (a verb) leaves it, and note
   the moments worth the log. Returns what `fn` returned; never throws for its own sake. */
export function aroundWorld(verb, stateFile, fn) {
  if (scratchName()) return fn();
  const before = readSave(stateFile);
  const out = fn();
  try {
    const after = readSave(stateFile);
    const content = after && knownWorld(after.world) ? loadWorld(after.world) : null;
    if (content) {
      const body = `${JSON.stringify(worldOf(content, after), null, 2)}\n`;
      let held = null;
      try { held = fs.readFileSync(worldFile(), 'utf8'); } catch { /* none yet */ }
      if (held !== body) writeAtomic(worldFile(), body);
      toTell.push(...eventsOf(before, after, content, verb));
    }
  } catch { /* the line is never the game's problem */ }
  return out;
}

/* Post what the verbs noted, outside the lock, with a short timeout; a refusal is one plain line on stderr. */
export async function tellActivity() {
  if (!toTell.length || !mayTell() || typeof fetch !== 'function') { toTell.length = 0; return; }
  // The engine on this machine, nothing else: loopback, the port Linggen gave this process.
  const door = `http://127.0.0.1:${process.env.LINGGEN_PORT || '9527'}/api/activity`;
  for (const record of toTell.splice(0)) {
    try {
      const res = await fetch(door, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record), signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) console.error(`activity log refused the ${record.verb} record: ${(await res.json().catch(() => ({}))).error || `HTTP ${res.status}`}`);
    } catch (e) { console.error(`activity log not told of the ${record.verb}: ${e?.message || e}`); }
  }
}
