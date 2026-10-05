// rules/changes.mjs — 「只看改动」's state: the version of each 回 the reader
// last confirmed (「已读，确认」), and what changed since (book-diff.js). One
// store for both readers — read.html on the Mac and the phone's reader over
// the peer link — so a 回 confirmed on one reads confirmed on the other.
//
// data/reader/<book>/ (LINGJING_READER overrides data/reader; install-skill.sh
// never touches data/):
//   meta.json      {base, made_at} — written once, by tools/reader-base.mjs
//                  (the first confirmed versions: Hanli's 「10-04 上午」 = skills 93e20ac0)
//   <id>.md        the 回's text as last confirmed; none → the whole 回 is new.
//                  Once a single change is confirmed it is kept as blocks
//                  (book-diff.js blocksMd), the other changes left as they were.
//   <id>.undo.json the versions before each confirm, latest last (撤销 takes
//                  back one confirm at a time; text null: there was none)
// No meta.json → no marks at all: a reader that never set a baseline sees the
// book plain.
//
// Verb `changes --book=<id>` → {ok, base, entries: {<id>: {rev, crev, count, items, marks, gone, confirmed_at, undo}}};
// `--id=<id>` narrows to one; `--do=confirm --id=<id> --item=<n> --rev=<rev> --crev=<crev>`
// confirms change n alone (Hanli 2026-10-05: 逐条确认, never the whole 回) —
// refused `moved` when the text or the confirmed version is no longer the one
// shown; `--do=undo --id=<id>` takes back the last confirm (`undo` names it).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { bookEntries } from '../book-order.js';
import { changesOf, confirmItem } from '../book-diff.js';
import { fillHero } from '../read-md.js';
import { homeDir, skillDir } from './files.mjs';

const BOOK_ID = /^[\w-]+$/;
const ENTRY_ID = /^[\w-]+$/;
/// How many confirms 撤销 can walk back.
export const UNDO_DEPTH = 40;

export const readerDir = (book) => path.join(process.env.LINGJING_READER || path.join(homeDir(), 'reader'), book);
const storyDir = (book) => path.join(skillDir(), 'story', book);
/// The text's revision: what a confirm must name, so it confirms the text read.
export const revOf = (text) => crypto.createHash('sha1').update(text ?? '').digest('hex').slice(0, 12);

const read = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
const drop = (file) => { try { fs.unlinkSync(file); } catch { /* none */ } };

/// Every entry of the book the readers show (drafts too: the phone shows them).
function entriesOf(book) {
  const doc = JSON.parse(fs.readFileSync(path.join(storyDir(book), 'book.json'), 'utf8'));
  return bookEntries(doc, { draft: true }).filter((e) => e.id && e.file);
}
const textOf = (book, e) => {
  const file = path.normalize(e.file);
  if (file.startsWith('..') || path.isAbsolute(file)) return null;
  return read(path.join(storyDir(book), file));
};
// Both sides read as the readers draw them: the fixed hero (沈小满, his words).
const filled = (md) => (md == null ? null : fillHero(md, {}));

/// One entry's changes against its confirmed version.
export function entryChanges(book, e) {
  const dir = readerDir(book);
  const text = textOf(book, e);
  if (text == null) return null;
  const confirmed = read(path.join(dir, `${e.id}.md`));
  const c = changesOf(filled(confirmed), filled(text));
  const at = (() => { try { return fs.statSync(path.join(dir, `${e.id}.md`)).mtime.toISOString(); } catch { return null; } })();
  const last = undoStack(book, e.id).at(-1);
  return { rev: revOf(text), crev: revOf(confirmed ?? ''), ...c, confirmed_at: at, undo: last ? { head: last.head ?? '', at: last.at ?? null } : null };
}

const undoFile = (book, id) => path.join(readerDir(book), `${id}.undo.json`);
function undoStack(book, id) {
  try { const v = JSON.parse(read(undoFile(book, id))); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function changes(args = {}) {
  const book = String(args.book ?? '');
  if (!BOOK_ID.test(book)) return { ok: false, refused: 'bad-book', say: null };
  if (args.id != null && !ENTRY_ID.test(String(args.id))) return { ok: false, refused: 'bad-id', say: null };
  let all;
  try { all = entriesOf(book); } catch { return { ok: false, refused: 'no-book', say: null }; }
  const dir = readerDir(book);
  const meta = (() => { try { return JSON.parse(read(path.join(dir, 'meta.json'))); } catch { return null; } })();
  if (!meta) return { ok: true, base: null, entries: {} };
  const one = args.id == null ? null : all.find((e) => e.id === String(args.id));
  if (args.id != null && !one) return { ok: false, refused: 'no-entry', say: null };
  const act = args.do == null ? null : String(args.do);
  if (act != null && !one) return { ok: false, refused: 'no-entry', say: null };
  if (act === 'confirm') {
    const text = textOf(book, one);
    if (text == null) return { ok: false, refused: 'no-entry', say: null };
    const file = path.join(dir, `${one.id}.md`);
    const was = read(file);
    const shown = { [one.id]: entryChanges(book, one) };
    if (String(args.rev ?? '') !== revOf(text) || String(args.crev ?? '') !== revOf(was ?? '')) return { ok: false, refused: 'moved', say: null, entries: shown };
    const n = Number(args.item);
    const head = shown[one.id].items.find((it) => it.n === n)?.head;
    const next = Number.isInteger(n) ? confirmItem(filled(was), filled(text), n) : null;
    if (next == null) return { ok: false, refused: 'no-item', say: null, entries: shown };
    const stack = [...undoStack(book, one.id), { text: was, head, at: new Date().toISOString() }].slice(-UNDO_DEPTH);
    write(undoFile(book, one.id), JSON.stringify(stack));
    write(file, next);
  } else if (act === 'undo') {
    const stack = undoStack(book, one.id);
    const last = stack.pop();
    if (!last) return { ok: false, refused: 'nothing-to-undo', say: null };
    if (last.text == null) drop(path.join(dir, `${one.id}.md`));
    else write(path.join(dir, `${one.id}.md`), last.text);
    if (stack.length) write(undoFile(book, one.id), JSON.stringify(stack));
    else drop(undoFile(book, one.id));
  } else if (act != null) return { ok: false, refused: 'bad-do', say: null };
  const list = one ? [one] : all;
  const entries = Object.fromEntries(list.map((e) => [e.id, entryChanges(book, e)]).filter(([, v]) => v));
  return { ok: true, base: meta.base ?? null, entries };
}
