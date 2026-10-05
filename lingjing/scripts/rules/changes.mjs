// rules/changes.mjs — 「只看改动」's state: the version of each 回 the reader
// last confirmed (「已读，确认」), and what changed since (book-diff.js). One
// store for both readers — read.html on the Mac and the phone's reader over
// the peer link — so a 回 confirmed on one reads confirmed on the other.
//
// data/reader/<book>/ (LINGJING_READER overrides data/reader; install-skill.sh
// never touches data/):
//   meta.json      {base, made_at} — written once, by tools/reader-base.mjs
//                  (the first confirmed versions: Hanli's 「10-04 上午」 = skills 93e20ac0)
//   <id>.md        the 回's text as last confirmed; none → the whole 回 is new
//   <id>.prev.md   the one before it, kept for 撤销 (<id>.prev.none: there was none)
// No meta.json → no marks at all: a reader that never set a baseline sees the
// book plain.
//
// Verb `changes --book=<id>` → {ok, base, entries: {<id>: {rev, count, items, marks, gone, confirmed_at, undo}}};
// `--id=<id>` narrows to one; `--do=confirm --id=<id> --rev=<rev>` saves the
// 回 as confirmed (refused `moved` when the text is no longer the one shown);
// `--do=undo --id=<id>` puts back the version before.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { bookEntries } from '../book-order.js';
import { changesOf } from '../book-diff.js';
import { fillHero } from '../read-md.js';
import { homeDir, skillDir } from './files.mjs';

const BOOK_ID = /^[\w-]+$/;
const ENTRY_ID = /^[\w-]+$/;

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
  const undo = fs.existsSync(path.join(dir, `${e.id}.prev.md`)) || fs.existsSync(path.join(dir, `${e.id}.prev.none`));
  return { rev: revOf(text), ...c, confirmed_at: at, undo };
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
    if (String(args.rev ?? '') !== revOf(text)) return { ok: false, refused: 'moved', say: null, entries: { [one.id]: entryChanges(book, one) } };
    const was = read(path.join(dir, `${one.id}.md`));
    if (was == null) { drop(path.join(dir, `${one.id}.prev.md`)); write(path.join(dir, `${one.id}.prev.none`), ''); }
    else { drop(path.join(dir, `${one.id}.prev.none`)); write(path.join(dir, `${one.id}.prev.md`), was); }
    write(path.join(dir, `${one.id}.md`), text);
  } else if (act === 'undo') {
    const prev = read(path.join(dir, `${one.id}.prev.md`));
    const none = fs.existsSync(path.join(dir, `${one.id}.prev.none`));
    if (prev == null && !none) return { ok: false, refused: 'nothing-to-undo', say: null };
    if (prev != null) write(path.join(dir, `${one.id}.md`), prev);
    else drop(path.join(dir, `${one.id}.md`));
    drop(path.join(dir, `${one.id}.prev.md`));
    drop(path.join(dir, `${one.id}.prev.none`));
  } else if (act != null) return { ok: false, refused: 'bad-do', say: null };
  const list = one ? [one] : all;
  const entries = Object.fromEntries(list.map((e) => [e.id, entryChanges(book, e)]).filter(([, v]) => v));
  return { ok: true, base: meta.base ?? null, entries };
}
