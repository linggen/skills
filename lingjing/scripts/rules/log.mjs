// rules/log.mjs — the play log (`data/log.jsonl`): how a line is added, and how the file is kept small.
//
// Every rules call that changes the save appends `{at, verb, args, before}`, `before` being the WHOLE save as it was
// (tens of KB). Nothing trimmed it: on one Mac it reached 28 MB. What reads the log, and so what it must keep:
//   · Undo (rules.mjs `undo`)      the last line, again and again: each Undo takes one line off the end and restores its
//                                  `before` (and `parked`). It has no floor — LOG_CAP.keepLines is the floor now.
//   · settleOf (rules/inquiry.mjs) the newest `duel` line of a fight that carries its `picks` and `before.fight.setup`,
//                                  and the NEXT line's `before` as the save after it — asked for by Ling's Look right after
//                                  the page reports a fight over, so the newest few lines; null (a bare telling) otherwise.
//   · nothing else (the 数据埋点 is data/analytics/, the phone keeps no log: linggen-mobile drops /data/log.jsonl).
//
// The log is never the game's problem: a trim or a slimming that fails for any reason leaves the file as it was.
import fs from 'node:fs';
import { writeAtomic } from './files.mjs';

const MB = 1024 * 1024;
/* The numbers, in one place. The file is trimmed once it passes `trimAt`, down to the newest lines that fit `keepBytes`
   and number at most `keepLines` — so a trim comes about every (trimAt − keepBytes) of play, never on every call, and
   Undo always reaches the last `keepLines` (or `keepBytes` of) changes: far more than anyone takes back. */
export const LOG_CAP = { trimAt: 8 * MB, keepBytes: 4 * MB, keepLines: 400 };

/* ── a fight's moves are marked one at a time ──
   The door's `duel {action: 'mark'}` after every card played is a line with the full save and the picks so far. The
   moves a resume needs live on the SAVE (`fight.picks`); the log's mark lines serve Undo alone. A run of marks of one
   fight keeps its FIRST line (Undo takes the run back to where it began) and its NEWEST (the one Undo meets first,
   exactly as before); the ones between are not kept. */
const MARK = /^\{"at":"[^"]*","verb":"duel","args":(\{.*?\}),"before":/;
export function markOf(line) {
  if (!line.includes('"action":"mark"')) return null;
  const m = MARK.exec(line);
  if (!m) return null;
  try {
    const args = JSON.parse(m[1]);
    return args.action === 'mark' ? String(args.id ?? '') : null;
  } catch { return null; }
}

/* The lines with each middle mark of a run (same fight, three or more in a row) taken out. */
export function slimMarks(lines) {
  const out = [], ids = [];
  for (const line of lines) {
    const id = markOf(line);
    const n = out.length;
    if (id !== null && n >= 2 && ids[n - 1] === id && ids[n - 2] === id) { out.pop(); ids.pop(); }
    out.push(line);
    ids.push(id);
  }
  return out;
}

/* The newest `bytes` of the file as whole lines — and whether that is all of it. Reads the tail only (not the whole
   of a 28 MB file) where the platform can; the phone's in-memory fs has no positioned read and reads it whole. */
function tailOf(file, bytes) {
  const size = fs.statSync(file).size;
  if (size <= bytes || typeof fs.readSync !== 'function') return { text: fs.readFileSync(file, 'utf8'), size, whole: true };
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes + 1);
    const got = fs.readSync(fd, buf, 0, bytes + 1, size - bytes - 1);
    // The window starts mid-line unless the byte before it ends one: the partial first line is let go.
    const from = buf[0] === 10 ? 1 : buf.indexOf(10, 1) + 1;
    if (from === 0 || from >= got) return { text: '', size, whole: false };
    return { text: buf.toString('utf8', from, got), size, whole: false };
  } finally { fs.closeSync(fd); }
}
const linesOf = text => text.split('\n').filter(l => l.startsWith('{') && l.endsWith('}'));

/* Append one line. A mark that would be the third in a row of its fight takes the one before it off first. */
export function appendLog(file, entry) {
  const line = JSON.stringify(entry) + '\n';
  if (entry.verb === 'duel' && entry.args?.action === 'mark') takeMiddleMark(file, String(entry.args.id ?? ''));
  fs.appendFileSync(file, line);
}

function takeMiddleMark(file, id) {
  try {
    if (!fs.existsSync(file)) return;
    const { text, size, whole } = tailOf(file, 1 * MB);
    const lines = text.split('\n').filter(Boolean);
    if (lines.length < 2 || markOf(lines.at(-1)) !== id || markOf(lines.at(-2)) !== id) return;
    if (whole) fs.writeFileSync(file, lines.slice(0, -1).join('\n') + '\n');
    else fs.truncateSync(file, size - Buffer.byteLength(lines.at(-1)) - 1);
  } catch { /* the log is never the game's problem: the line is added beside it */ }
}

/* Trim an oversized log in place (atomic: a tmp file, then the rename), under the save's lock. Returns whether it did.
   Never throws; on any failure the old file stands. */
export function trimLog(file, caps = LOG_CAP) {
  let tmpLeft = null;
  try {
    if (fs.statSync(file).size <= caps.trimAt) return false;
    const { text } = tailOf(file, caps.keepBytes);
    const kept = slimMarks(linesOf(text)).slice(-caps.keepLines);
    if (!kept.length) return false;
    tmpLeft = `${file}.${process.pid}.tmp`;
    writeAtomic(file, kept.join('\n') + '\n');
    tmpLeft = null;
    return true;
  } catch {
    try { if (tmpLeft) fs.rmSync(tmpLeft, { force: true }); } catch { /* nothing more to do */ }
    return false;
  }
}

/* Every line of the log, newest last — for a reader that looks back (settleOf). */
export function readLog(file) {
  try { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : []; } catch { return []; }
}
