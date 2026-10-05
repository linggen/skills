#!/usr/bin/env node
// tools/reader-base.mjs — set 「只看改动」's first confirmed versions from git,
// once (rules/changes.mjs). Each entry of the book as it stood at a commit —
// by its id, so a 回 whose file was renamed since still finds its old text; an
// id the old book did not have is left with none (the whole 回 reads new).
//
//   node lingjing/tools/reader-base.mjs                 # 93e20ac0 (Hanli's 「10-04 上午」) into ~/.linggen/skills/lingjing/data/reader
//   node lingjing/tools/reader-base.mjs --ref=<commit> --to=<reader dir> --book=jiuding-lu --force
//
// Refuses to write over a reader dir that already has a meta.json unless
// --force: the confirmations made since would be lost.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookEntries } from '../scripts/book-order.js';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(SKILL, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => /^--([^=]+)(?:=(.*))?$/.exec(a)).filter(Boolean).map((m) => [m[1], m[2] ?? true]));
const ref = String(args.ref ?? '93e20ac0');
const book = String(args.book ?? 'jiuding-lu');
const to = path.join(String(args.to ?? path.join(os.homedir(), '.linggen/skills/lingjing/data/reader')), book);

const show = (rel) => {
  try { return execFileSync('git', ['-C', REPO, 'show', `${ref}:lingjing/story/${book}/${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }); } catch { return null; }
};

if (fs.existsSync(path.join(to, 'meta.json')) && !args.force) {
  console.error(`${to}/meta.json exists — confirmations made since would be lost; --force to start again from ${ref}`);
  process.exit(1);
}
const now = JSON.parse(fs.readFileSync(path.join(SKILL, 'story', book, 'book.json'), 'utf8'));
const old = JSON.parse(show('book.json') ?? '{}');
const oldEntries = bookEntries(old, { draft: true });
const oldFile = (id) => (oldEntries.find((e) => e.id === id || (e.absorbs ?? []).includes(id))?.file) ?? null;

fs.mkdirSync(to, { recursive: true });
const report = [];
for (const e of bookEntries(now, { draft: true })) {
  if (!e.id || !e.file) continue;
  const was = oldFile(e.id);
  const text = was ? show(was) : null;
  for (const f of [`${e.id}.md`, `${e.id}.undo.json`]) fs.rmSync(path.join(to, f), { force: true });
  if (text != null) fs.writeFileSync(path.join(to, `${e.id}.md`), text);
  report.push(`${e.id}\t${text == null ? '(none — all new)' : was}`);
}
const commit = execFileSync('git', ['-C', REPO, 'rev-parse', '--short=8', ref], { encoding: 'utf8' }).trim();
fs.writeFileSync(path.join(to, 'meta.json'), `${JSON.stringify({ base: commit, made_at: new Date().toISOString() }, null, 1)}\n`);
console.log(`${to} ← ${commit}\n${report.join('\n')}`);
