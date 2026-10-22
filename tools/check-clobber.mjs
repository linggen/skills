#!/usr/bin/env node
// check-clobber — catch a silent revert before it lands.
//
// Parallel agents commit from worktrees. An agent that copies files from an
// old worktree onto a new base (or commits from a stale base without
// rebasing) puts back older file contents and silently deletes what another
// commit added a few hours earlier (10-21: d36ee70a wiped all of b23b2f59).
//
// For each commit in the range, this looks at the lines it REMOVES, blames
// them on the parent, and groups them by the commit that added them. A group
// counts as a clobber when:
//   - the adding commit is recent (within --window-hours of this commit),
//   - this commit's message does not name it (hash prefix or subject),
//   - and the removed lines are not replaced by new work: in each hunk the
//     lines added back are only lines the adding commit itself removed (the
//     old version), or nothing at all.
//   - and there is evidence it put back the OLD version: at least
//     --min-old of the lines the adding commit had replaced come back, or a
//     file ends byte-identical to its version from before the adding commit.
// A rewrite replaces lines with new lines and passes; a plain cut (lines
// deleted, nothing old put back) passes; a revert that names its target
// passes. A revert that does none of these fails.
// Build outputs (*.min.mjs, a kit's source.json, font/chars.txt, lockfiles)
// are not counted: a rebuild rewrites them whole.
//
// Usage:
//   node tools/check-clobber.mjs                 # commits on HEAD not on origin/main
//   node tools/check-clobber.mjs --range A..B    # any range (CI: before..after)
//   node tools/check-clobber.mjs --commit C      # one commit, against its parent
//   CLOBBER_RANGE=A..B node tools/check-clobber.mjs
// Options: --window-hours 72  --min-lines 10  --min-old 3  --json  --all (report, never fail)
//          --no-fetch (default range only: skip `git fetch origin main` first)
import { execFileSync } from 'node:child_process';

const DEFAULTS = { windowHours: 72, minLines: 10, minOld: 3 };

// Generated files: rebuilt whole, so their lines prove nothing.
export function generated(path) {
  return /\.min\.m?js$|(^|\/)source\.json$|(^|\/)font\/chars\.txt$|(^|\/)(package-lock\.json|Cargo\.lock)$|\.map$/.test(path);
}

export function git(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

function tryGit(args, opts) {
  try {
    return git(args, opts);
  } catch {
    return null;
  }
}

// ── diff parsing ──────────────────────────────────────────────────────────

// Parse `git diff -U0` into files → hunks with removed/added lines.
export function parseDiff(text) {
  const files = [];
  let file = null;
  let hunk = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = { oldPath: null, newPath: null, binary: false, hunks: [] };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;
    if (line.startsWith('--- ')) {
      file.oldPath = line === '--- /dev/null' ? null : line.slice(6);
      continue;
    }
    if (line.startsWith('+++ ')) {
      file.newPath = line === '+++ /dev/null' ? null : line.slice(6);
      continue;
    }
    if (line.startsWith('Binary files ')) {
      file.binary = true;
      continue;
    }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m) {
      hunk = {
        oldStart: Number(m[1]),
        oldCount: m[2] === undefined ? 1 : Number(m[2]),
        removed: [],
        added: [],
      };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith('-')) hunk.removed.push(line.slice(1));
    else if (line.startsWith('+')) hunk.added.push(line.slice(1));
  }
  return files;
}

// A line worth counting: not blank, not a lone bracket or comma.
export function meaningful(line) {
  const t = line.trim();
  return t.length >= 4 && !/^[\s{}()[\];,]*$/.test(t);
}

// ── blame ─────────────────────────────────────────────────────────────────

// Blame the given 1-based line numbers of `path` at `rev`.
// Returns Map(lineNo → { sha, time, summary }).
function blameLines(rev, path, lineNos, cwd) {
  const out = new Map();
  if (!lineNos.length) return out;
  const ranges = [];
  let start = lineNos[0];
  let prev = start;
  for (const n of lineNos.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    ranges.push([start, prev]);
    start = prev = n;
  }
  ranges.push([start, prev]);
  const args = ['blame', '--porcelain'];
  for (const [a, b] of ranges) args.push('-L', `${a},${b}`);
  args.push(rev, '--', path);
  const text = tryGit(args, { cwd });
  if (text == null) return out;
  const meta = new Map();
  let cur = null;
  for (const line of text.split('\n')) {
    const head = /^([0-9a-f]{40}) (\d+) (\d+)/.exec(line);
    if (head) {
      cur = { sha: head[1], final: Number(head[3]) };
      if (!meta.has(cur.sha)) meta.set(cur.sha, {});
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('committer-time ')) meta.get(cur.sha).time = Number(line.slice(15));
    else if (line.startsWith('summary ')) meta.get(cur.sha).summary = line.slice(8);
    else if (line === 'boundary') meta.get(cur.sha).boundary = true;
    else if (line.startsWith('\t')) {
      out.set(cur.final, { sha: cur.sha, meta: meta.get(cur.sha) });
      cur = null;
    }
  }
  return out;
}

// ── commit facts ──────────────────────────────────────────────────────────

const commitCache = new Map();
function commitInfo(sha, cwd) {
  if (commitCache.has(sha)) return commitCache.get(sha);
  const raw = git(['show', '-s', '--format=%H%x00%ct%x00%s%x00%B', sha], { cwd });
  const [full, ct, subject, body] = raw.split('\0');
  const info = { sha: full, time: Number(ct), subject, message: body ?? '' };
  commitCache.set(sha, info);
  return info;
}

// Lines a commit removed, per path (the "old version" it replaced).
const removedCache = new Map();
function linesRemovedBy(sha, path, cwd) {
  const key = `${sha}\0${path}`;
  if (removedCache.has(key)) return removedCache.get(key);
  const set = new Set();
  const text = tryGit(['diff', '-U0', '--no-renames', '--no-ext-diff', `${sha}^`, sha, '--', path], { cwd });
  if (text) for (const f of parseDiff(text)) for (const h of f.hunks) for (const l of h.removed) set.add(l.trim());
  removedCache.set(key, set);
  return set;
}

// Does `message` name commit `target` — by hash prefix or by its subject?
export function mentions(message, target) {
  const msg = message.toLowerCase();
  for (const m of msg.matchAll(/\b[0-9a-f]{7,40}\b/g)) {
    if (target.sha.startsWith(m[0])) return true;
  }
  // Drop the scope word(s): "lingjing ", "lingjing: ", "lingjing + dj: ".
  const subj = target.subject.replace(/^[a-z][\w-]*(?: \+ [a-z][\w-]*)*:?\s+/, '').trim().toLowerCase();
  const key = subj.slice(0, 24);
  return key.length >= 12 && msg.includes(key);
}

// ── the check ─────────────────────────────────────────────────────────────

export function analyzeCommit(sha, opts = {}) {
  const { cwd, windowHours = DEFAULTS.windowHours } = opts;
  const me = commitInfo(sha, cwd);
  const parents = git(['rev-list', '--parents', '-n', '1', sha], { cwd }).trim().split(' ').slice(1);
  if (parents.length !== 1) return { commit: me, victims: [] }; // root or merge
  const parent = parents[0];
  const diff = git(['diff', '-U0', '--no-renames', '--no-ext-diff', parent, sha], { cwd });
  const since = me.time - windowHours * 3600;
  const victims = new Map();

  for (const file of parseDiff(diff)) {
    if (file.binary || !file.oldPath || generated(file.oldPath)) continue;
    const want = [];
    file.hunks.forEach((h, hi) => {
      h.removed.forEach((l, i) => {
        if (meaningful(l)) want.push({ n: h.oldStart + i, hi, text: l });
      });
    });
    if (!want.length) continue;
    const blame = blameLines(parent, file.oldPath, want.map((w) => w.n), cwd);

    // Per hunk, per victim: removed lines, and lines added back that are new work.
    const perHunk = new Map();
    for (const w of want) {
      const b = blame.get(w.n);
      if (!b || b.sha === me.sha || b.meta.boundary) continue;
      if (!(b.meta.time >= since)) continue;
      const k = `${w.hi}\0${b.sha}`;
      if (!perHunk.has(k)) perHunk.set(k, { hi: w.hi, sha: b.sha, lines: [] });
      perHunk.get(k).lines.push(w.text);
    }
    for (const { hi, sha: vsha, lines } of perHunk.values()) {
      const victim = commitInfo(vsha, cwd);
      if (mentions(me.message, victim)) continue;
      const old = linesRemovedBy(vsha, file.oldPath, cwd);
      const added = file.hunks[hi].added.filter(meaningful);
      const novel = added.filter((l) => !old.has(l.trim())).length;
      const restoredOld = added.length - novel;
      // New work replacing the lines → a rewrite, not a clobber.
      if (novel > Math.max(1, lines.length * 0.25)) continue;
      if (!victims.has(vsha)) victims.set(vsha, { commit: victim, lines: 0, restoredOld: 0, oldCopies: [], files: new Map() });
      const v = victims.get(vsha);
      v.lines += lines.length;
      v.restoredOld += restoredOld;
      v.files.set(file.oldPath, (v.files.get(file.oldPath) ?? 0) + lines.length);
    }
  }
  // A file left byte-identical to its version from before the victim: an old copy.
  for (const v of victims.values()) {
    for (const path of v.files.keys()) {
      const mine = tryGit(['rev-parse', '-q', '--verify', `${sha}:${path}`], { cwd });
      const before = tryGit(['rev-parse', '-q', '--verify', `${v.commit.sha}^:${path}`], { cwd });
      if (mine && before && mine.trim() === before.trim()) v.oldCopies.push(path);
    }
  }
  return {
    commit: me,
    victims: [...victims.values()].sort((a, b) => b.lines - a.lines),
  };
}

export function commitsInRange(range, cwd) {
  const out = tryGit(['rev-list', '--reverse', '--no-merges', range], { cwd });
  return out == null ? null : out.split('\n').filter(Boolean);
}

// A victim group is a clobber when enough of its lines went and the old version came back.
export function isClobber(v, { minLines = DEFAULTS.minLines, minOld = DEFAULTS.minOld } = {}) {
  return v.lines >= minLines && (v.restoredOld >= minOld || v.oldCopies.length > 0);
}

export function check({ commits, cwd, windowHours = DEFAULTS.windowHours, minLines = DEFAULTS.minLines, minOld = DEFAULTS.minOld, all = false }) {
  const findings = [];
  for (const sha of commits) {
    const r = analyzeCommit(sha, { cwd, windowHours });
    for (const v of r.victims) {
      if (all ? v.lines >= minLines : isClobber(v, { minLines, minOld })) findings.push({ commit: r.commit, victim: v });
    }
  }
  return findings;
}

export function formatFinding({ commit, victim }) {
  const short = (s) => s.slice(0, 8);
  const files = [...victim.files.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([f, n]) => `      ${n} lines  ${f}`)
    .join('\n');
  return [
    `✗ ${short(commit.sha)} ${commit.subject.slice(0, 80)}`,
    `  this commit reverts ${short(victim.commit.sha)} ${victim.commit.subject.slice(0, 80)}`,
    `  (${victim.lines} of its lines removed with nothing new in their place${victim.restoredOld ? `, ${victim.restoredOld} older lines put back` : ''}${victim.oldCopies.length ? `, ${victim.oldCopies.length} file(s) back to their old copy` : ''})`,
    files,
    `  → rebase onto origin/main, never copy files from an old worktree (CLAUDE.md § Parallel work).`,
    `    If the revert is intended, name ${short(victim.commit.sha)} in the commit message.`,
  ].join('\n');
}

function parseArgs(argv) {
  const a = { windowHours: DEFAULTS.windowHours, minLines: DEFAULTS.minLines, minOld: DEFAULTS.minOld, json: false, all: false, fetch: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--range') a.range = argv[++i];
    else if (k === '--commit') a.commit = argv[++i];
    else if (k === '--window-hours') a.windowHours = Number(argv[++i]);
    else if (k === '--min-lines') a.minLines = Number(argv[++i]);
    else if (k === '--min-old') a.minOld = Number(argv[++i]);
    else if (k === '--no-fetch') a.fetch = false;
    else if (k === '--json') a.json = true;
    else if (k === '--all') a.all = true;
    else throw new Error(`unknown argument: ${k}`);
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  let commits;
  let label;
  if (a.commit) {
    commits = [git(['rev-parse', a.commit]).trim()];
    label = a.commit;
  } else {
    const range = a.range || process.env.CLOBBER_RANGE || 'origin/main..HEAD';
    // The stale ref is the whole failure mode: compare against today's origin/main.
    if (range === 'origin/main..HEAD' && a.fetch) tryGit(['fetch', '-q', 'origin', 'main']);
    // CI on a new branch or first push: `before` is all zeros — nothing to compare.
    if (/^0{40}\.\./.test(range)) {
      console.log('check-clobber: no previous push to compare against — skipped');
      return 0;
    }
    commits = commitsInRange(range);
    label = range;
    if (commits == null) {
      console.log(`check-clobber: range ${range} not in this clone (shallow?) — skipped`);
      return 0;
    }
  }
  const findings = check({ commits, windowHours: a.windowHours, minLines: a.minLines, minOld: a.minOld, all: a.all });
  if (a.json) {
    console.log(
      JSON.stringify(
        findings.map(({ commit, victim }) => ({
          commit: commit.sha,
          subject: commit.subject,
          victim: victim.commit.sha,
          victimSubject: victim.commit.subject,
          lines: victim.lines,
          restoredOld: victim.restoredOld,
          oldCopies: victim.oldCopies,
          files: Object.fromEntries(victim.files),
        })),
        null,
        2,
      ),
    );
  } else if (findings.length) {
    console.log(findings.map(formatFinding).join('\n\n'));
  } else {
    console.log(`check-clobber: ${commits.length} commit(s) in ${label}, no silent reverts`);
  }
  return findings.length && !a.all ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
