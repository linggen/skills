// rules/revert.mjs — 「↶ 改回原文」 (Hanli 2026-10-05): one change of a 回 put
// back as its confirmed version has it (the 93e20ac0 text for whatever was
// never confirmed since), written to the SOURCE — the skills checkout the
// builder writes in (the phone reads it live) — with the game's scenes that
// quote those paragraphs (story.zh, the book's own text: tests/scene-book-sync)
// kept in step, committed there by path, and the installed copy of those
// files brought level so read.html shows the new text at once.
//
// A builder's tool: only where the checkout exists (LINGJING_DEV_REPO, else
// ~/workspace/linggen/skills); the page and the phone show it only when the
// changes verb says `dev`. Refused, with nothing written, when either file has
// someone's uncommitted change, when the checkout's text is not the text
// shown, or when a scene quotes the words in a way that cannot follow.
// English can't follow by rule: each scene passage changed is listed in
// data/reader/en-pending.json for a translator.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { revertItem } from '../book-diff.js';

export const devRepo = () => process.env.LINGJING_DEV_REPO || path.join(os.homedir(), 'workspace/linggen/skills');
export const installDir = () => process.env.LINGJING_INSTALL_DIR || path.join(os.homedir(), '.linggen/skills/lingjing');
const repoSkill = () => path.join(devRepo(), 'lingjing');
/// The builder's machine: the checkout is there, under git.
export const isDev = (book) => fs.existsSync(path.join(repoSkill(), 'story', book, 'book.json')) && fs.existsSync(path.join(devRepo(), '.git'));

// The scene check's own normalising (tests/scene-book-sync.test.mjs).
export const norm = (t) => String(t ?? '')
  .replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1')
  .replace(/\{[^}\n]*\}/g, '')
  .replace(/\*\*|⟪|⟫/g, '')
  .replace(/^#.*$/gm, '')
  .replace(/^>\s?/gm, '')
  .replace(/---/g, '')
  .replace(/\s+/g, '');

const git = (...args) => execFileSync('git', ['-C', devRepo(), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const rel = (abs) => path.relative(devRepo(), abs);

/// Every scene of the world whose `hui` is this entry's (or one it absorbed).
function scenesOf(entry) {
  const root = path.join(repoSkill(), 'worlds/jiuding/chapters');
  const ids = new Set([entry.id, ...(entry.absorbs ?? [])]);
  const out = [];
  for (const ch of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const dir = path.join(root, ch, 'scenes');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      const file = path.join(dir, f), text = fs.readFileSync(file, 'utf8');
      let scene;
      try { scene = JSON.parse(text); } catch { continue; }
      if (ids.has(scene.hui)) out.push({ file, text, scene });
    }
  }
  return out;
}

/// The scenes' passages made to follow the reverted book: a paragraph that
/// quoted a block now gone back takes the old words, one that quoted a block
/// now dropped goes. `{writes: [{file, text}], en: [...], stuck: [...]}`.
function followScenes(entry, before, after, plan) {
  const was = norm(before), now = norm(after);
  const swaps = plan.swapped.map((s) => ({ from: norm(s.now), to: s.was }));
  const drops = plan.dropped.map(norm);
  const writes = [], en = [], stuck = [];
  for (const { file, text, scene } of scenesOf(entry)) {
    let changed = false;
    const fix = (where, story) => {
      if (!story?.zh) return;
      const paras = story.zh.split('\n\n');
      const kept = [];
      for (const p of paras) {
        const n = norm(p);
        // A paragraph that is a reverted block follows it; one that only
        // quotes part of it stands while the book still holds its words.
        const swap = n && swaps.find((s) => s.from === n);
        if (swap) { kept.push(swap.to); continue; }
        if (n && drops.includes(n)) continue;
        if (!n || !was.includes(n) || now.includes(n)) { kept.push(p); continue; }
        stuck.push(`${where}: ${p.slice(0, 30)}…`);
        kept.push(p);
      }
      const zh = kept.join('\n\n');
      if (zh === story.zh) return;
      en.push({ file: rel(file), where, hui: scene.hui, zh_was: story.zh, zh_now: zh, en: story.en ?? null });
      story.zh = zh;
      changed = true;
    };
    fix(scene.id, scene.story);
    for (const x of scene.exits ?? []) fix(`${scene.id}/${x.id}`, x.story);
    if (!changed) continue;
    const indent = [1, 2].find((k) => `${JSON.stringify(JSON.parse(text), null, k)}\n` === text);
    if (indent == null) { stuck.push(`${rel(file)}: not in the plain JSON form`); continue; }
    writes.push({ file, text: `${JSON.stringify(scene, null, indent)}\n` });
  }
  return { writes, en, stuck };
}

/// What 改回 would do, or did: `{ok, item, swapped, dropped, restored, scenes, en_pending, files}`;
/// `write` false only shows it (the page's first step).
export function revert({ book, entry, confirmed, item, rev, revOf, label, readerDir, write }) {
  if (!isDev(book)) return { ok: false, refused: 'not-dev', say: null };
  const bookFile = path.join(repoSkill(), 'story', book, entry.file);
  const current = fs.existsSync(bookFile) ? fs.readFileSync(bookFile, 'utf8') : null;
  if (current == null) return { ok: false, refused: 'no-entry', say: null };
  // The checkout must hold the very text the reader showed.
  if (revOf(current) !== rev) return { ok: false, refused: 'out-of-sync', say: '工作区里的原文与阅读器里的不一致——先装机或刷新。' };
  if (confirmed == null) return { ok: false, refused: 'no-original', say: '这一回在基准里没有原文。' };
  const plan = revertItem(confirmed, current, item);
  if (!plan) return { ok: false, refused: 'no-item', say: null };
  const scenes = followScenes(entry, current, plan.md, plan);
  const files = [bookFile, ...scenes.writes.map((w) => w.file)];
  const shown = { item, swapped: plan.swapped, dropped: plan.dropped, restored: plan.restored, scenes: scenes.writes.map((w) => rel(w.file)), en_pending: scenes.en.length };
  // Never over someone's uncommitted work — in the book, or any scene of this 回.
  const dirty = git('status', '--porcelain', '--', rel(bookFile), ...scenesOf(entry).map((x) => rel(x.file))).trim();
  if (dirty) return { ok: false, refused: 'dirty', say: '工作区里这些文件有未提交的改动，未改：', dirty: dirty.split('\n'), ...shown };
  if (scenes.stuck.length) return { ok: false, refused: 'scene-unmatched', say: '场景引用对不上，未改：', stuck: scenes.stuck, ...shown };
  if (!write) return { ok: true, preview: true, ...shown };
  const put = (file, text) => { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); };
  put(bookFile, plan.md);
  for (const w of scenes.writes) put(w.file, w.text);
  let commit = null;
  try {
    git('commit', '-q', '-m', `lingjing 九鼎录 ${label}: 改回原文（Hanli 在阅读器里）\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, '--', ...files.map(rel));
    commit = git('rev-parse', '--short=8', 'HEAD').trim();
  } catch (err) {
    return { ok: false, refused: 'commit-failed', say: String(err?.stderr || err?.message || err).trim().slice(0, 300), written: files.map(rel), ...shown };
  }
  // The installed copy of the same files, so read.html reads the new text now.
  const inst = installDir();
  if (path.resolve(inst) !== path.resolve(repoSkill()) && fs.existsSync(inst)) {
    for (const f of files) {
      const to = path.join(inst, path.relative(repoSkill(), f));
      if (fs.existsSync(path.dirname(to))) put(to, fs.readFileSync(f, 'utf8'));
    }
  }
  if (scenes.en.length) {
    const file = path.join(path.dirname(readerDir), 'en-pending.json');
    let list = [];
    try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    list.push(...scenes.en.map((e) => ({ at: new Date().toISOString(), commit, ...e })));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    put(file, `${JSON.stringify(list, null, 1)}\n`);
  }
  return { ok: true, commit, ...shown };
}
