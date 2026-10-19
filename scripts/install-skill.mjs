// install-skill.mjs — install one skill from a COMMITTED ref into the
// engine's skills dir, whole, or not at all. See install-skill.sh for usage.
//
// Why: files copied by name let a page import a name from an older installed
// neighbour (the page goes blank), and let in-flight edits from the working
// tree ship. Here the source is always a git ref, the staged tree must pass a
// syntax + import/export link check against what the install WILL be, each
// file lands by tmp-write + rename, and user state (data/, state/,
// config.json, sessions/, cloud.save/skip, *.local.*) is never touched.
//
// Prune: the one delete. An install file goes only when it is not in the ref,
// its path was once tracked under <skill>/ in git history, it is not user
// state, AND its bytes equal a blob that path once held — so every pruned
// file is recoverable from git, and a locally edited copy stays. Files git
// never tracked are never touched. Then emptied dirs go (never the root).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const USER_STATE = ['data', 'state', 'config.json', 'sessions', '.installed'];
// Installed but never served (same set tests/pages.test.mjs leaves out): a
// problem here is a warning, not a reason to refuse the install.
const DEV_ONLY = ['tests', 'tools', 'doc'];
const isDevOnly = problem => DEV_ONLY.some(d => problem.startsWith(`${d}/`));

// ── args ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { skill: null, ref: 'origin/main', check: false, dryRun: false, prune: true, refGiven: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ref') { o.ref = argv[++i]; o.refGiven = true; }
    else if (a.startsWith('--ref=')) { o.ref = a.slice(6); o.refGiven = true; }
    else if (a === '--check') o.check = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--prune') o.prune = true;
    else if (a === '--no-prune') o.prune = false;
    else if (a === '-h' || a === '--help') usage(0);
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); usage(2); }
    else if (!o.skill) o.skill = a.replace(/\/+$/, '');
    else { console.error(`unexpected argument: ${a}`); usage(2); }
  }
  if (!o.skill || !o.ref) usage(2);
  return o;
}

function usage(code) {
  (code ? console.error : console.log)(
    'usage: scripts/install-skill.sh <skill> [--ref <git-ref>] [--check] [--dry-run] [--prune | --no-prune]\n' +
    '  --ref       committed source (default origin/main, fetched first; HEAD for a local commit)\n' +
    '  --check     install nothing; report drift between the install and the ref\n' +
    '  --dry-run   run the pre-flight and print what would change (prunes included)\n' +
    '  --prune     remove install files the repo deleted (the default): once tracked,\n' +
    '              byte-identical to a blob git held, not user state\n' +
    '  --no-prune  leave every extra file in place');
  process.exit(code);
}

// ── git ─────────────────────────────────────────────────────────────────────
function git(repo, args, opts = {}) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: opts.encoding ?? 'utf8', maxBuffer: 1 << 30, input: opts.input });
  if (r.status !== 0 && !opts.allowFail) {
    console.error(`git ${args.join(' ')} failed:\n${(r.stderr || '').toString().trim()}`);
    process.exit(1);
  }
  return r;
}

function stage(repo, commit, skill) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `install-${skill}-`));
  const archive = git(repo, ['archive', '--format=tar', commit, `${skill}/`], { encoding: 'buffer' });
  const tar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout });
  if (tar.status !== 0) { console.error(`tar failed: ${tar.stderr}`); process.exit(1); }
  return path.join(dir, skill);
}

// ── skill frontmatter: cloud.save / cloud.skip are user state too ───────────
function cloudPaths(skillMd) {
  const lines = skillMd.split('\n');
  if (lines[0] !== '---') return [];
  const end = lines.indexOf('---', 1);
  const out = [];
  let inCloud = false;
  for (const line of lines.slice(1, end < 0 ? lines.length : end)) {
    if (/^\S/.test(line)) { inCloud = /^cloud:\s*$/.test(line); continue; }
    if (!inCloud) continue;
    const m = /^\s+(save|skip):\s*\[(.*)\]\s*(#.*)?$/.exec(line);
    if (m) out.push(...m[2].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean));
  }
  return out.map(p => p.replace(/^\.\//, '').replace(/\/+$/, ''));
}

const underAny = (rel, roots) => roots.some(r => rel === r || rel.startsWith(r + '/'));
const isLocal = rel => /\.local\./.test(path.posix.basename(rel));

// ── prune: sort the install's extras by what git knows of them ──────────────
// Every blob each path under <skill>/ ever held, from one -z log (no quoting
// of non-ASCII names; --no-renames so a renamed-away file shows its old path).
function trackedBlobs(repo, skill) {
  const out = git(repo, ['log', '--all', '--no-renames', '--raw', '--no-abbrev', '-z', '--format=', '--', `${skill}/`]).stdout;
  const blobs = new Map();
  const parts = out.split('\0');
  for (let i = 0; i < parts.length - 1; i++) {
    const m = /^:\d+ \d+ ([0-9a-f]+) ([0-9a-f]+) [A-Z]\d*$/.exec(parts[i].trim());
    if (!m) continue;
    const rel = parts[++i].slice(skill.length + 1);
    if (!blobs.has(rel)) blobs.set(rel, new Set());
    for (const sha of [m[1], m[2]]) if (!/^0+$/.test(sha)) blobs.get(rel).add(sha);
  }
  return blobs;
}

function hashFiles(repo, files) {
  if (!files.length) return [];
  const r = git(repo, ['hash-object', '--no-filters', '--stdin-paths'], { input: files.join('\n') + '\n' });
  return r.stdout.trim().split('\n');
}

// extras → prunable (byte-identical to a blob its path once held), modified
// (once tracked, changed since), untracked (never tracked, or *.local.*).
function sortExtras(repo, skill, installDir, extras) {
  const blobs = trackedBlobs(repo, skill);
  const once = extras.filter(r => blobs.has(r));
  const untracked = extras.filter(r => !blobs.has(r));
  const plain = once.filter(r => { try { return fs.lstatSync(path.join(installDir, r)).isFile(); } catch { return false; } });
  const shas = hashFiles(repo, plain.map(r => path.join(installDir, r)));
  const prunable = plain.filter((r, i) => blobs.get(r).has(shas[i]));
  const modified = once.filter(r => !prunable.includes(r));
  return { prunable, modified, untracked };
}

// Unlink each file, then rmdir its emptied parents up to (never including) the root.
function prune(installDir, files) {
  const root = path.resolve(installDir);
  for (const rel of files) {
    const p = path.resolve(root, rel);
    if (!p.startsWith(root + path.sep)) continue;
    fs.unlinkSync(p);
    for (let d = path.dirname(p); d !== root && d.startsWith(root + path.sep); d = path.dirname(d)) {
      try { fs.rmdirSync(d); } catch { break; } // not empty: stop climbing
    }
  }
}

// ── file walking ────────────────────────────────────────────────────────────
function walk(root, rel = '', out = []) {
  let entries;
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(root, r, out);
    else out.push(r);
  }
  return out;
}

// ── syntax ──────────────────────────────────────────────────────────────────
function syntaxProblem(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status === 0) return null;
  return (r.stderr.split('\n').find(l => /Error/.test(l)) ?? r.stderr.trim()) || `exit ${r.status}`;
}

// ── import / export link check ──────────────────────────────────────────────
const STR = `['"]([^'"\\n]+)['"]`;
const RE = {
  importFrom: new RegExp(`^[ \\t]*import\\s+([^;'"]*?)\\s*from\\s*${STR}`, 'gm'),
  importBare: new RegExp(`^[ \\t]*import\\s*${STR}`, 'gm'),
  importDyn: new RegExp(`\\bimport\\s*\\(\\s*${STR}\\s*\\)`, 'g'),
  exportFrom: new RegExp(`^[ \\t]*export\\s*\\{([^}]*)\\}\\s*from\\s*${STR}`, 'gm'),
  exportStar: new RegExp(`^[ \\t]*export\\s*\\*\\s*(?:as\\s+([\\w$]+)\\s*)?from\\s*${STR}`, 'gm'),
  exportList: /^[ \t]*export\s*\{([^}]*)\}(?!\s*from)/gm,
  exportDecl: /^[ \t]*export\s+(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([\w$]+)/gm,
  exportDestructure: /^[ \t]*export\s+(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/gm,
  exportDefault: /^[ \t]*export\s+default\b/m,
  // `export const W = 480, H = 300;` — the declarators after the first, on the statement's own line.
  exportMulti: /^[ \t]*export\s+(?:const|let|var)\s+[\w$]+\s*=([^\n]*)/gm,
};

const splitNames = list => list.split(',').map(s => s.trim()).filter(Boolean).map(s => {
  const m = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(s.replace(/\s+/g, ' '));
  return m ? { from: m[1], as: m[2] ?? m[1] } : null;
}).filter(Boolean);

/* The names declared after top-level commas in a declaration's rest of line (`= 480, H = 300;`):
   brackets, braces, parens and strings are stepped over; a line comment ends it. */
function laterDeclarators(rest) {
  const names = [];
  let depth = 0, quote = null;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '/' && rest[i + 1] === '/') break;
    else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ';' && depth === 0) break;
    else if (ch === ',' && depth === 0) { const m = /^\s*([\w$]+)\s*=(?!=)/.exec(rest.slice(i + 1)); if (m) names.push(m[1]); }
  }
  return names;
}

function parseModule(src) {
  const imports = []; // { spec, names: [imported names] }
  const exports = new Set();
  const stars = [];
  for (const m of src.matchAll(RE.importFrom)) {
    const clause = m[1].trim();
    const names = [];
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) names.push(...splitNames(braces[1]).map(n => n.from));
    const head = clause.replace(/\{[^}]*\}/, '').split(',').map(s => s.trim()).filter(Boolean);
    for (const h of head) if (!/^\*/.test(h) && /^[\w$]+$/.test(h)) names.push('default');
    imports.push({ spec: m[2], names });
  }
  for (const m of src.matchAll(RE.importBare)) imports.push({ spec: m[1], names: [] });
  for (const m of src.matchAll(RE.importDyn)) imports.push({ spec: m[1], names: [] });
  for (const m of src.matchAll(RE.exportFrom)) {
    const ns = splitNames(m[1]);
    imports.push({ spec: m[2], names: ns.map(n => n.from) });
    for (const n of ns) exports.add(n.as);
  }
  for (const m of src.matchAll(RE.exportStar)) {
    imports.push({ spec: m[2], names: [] });
    if (m[1]) exports.add(m[1]); else stars.push(m[2]);
  }
  for (const m of src.matchAll(RE.exportList)) for (const n of splitNames(m[1])) exports.add(n.as);
  for (const m of src.matchAll(RE.exportDecl)) exports.add(m[1]);
  for (const m of src.matchAll(RE.exportMulti)) for (const n of laterDeclarators(m[1])) exports.add(n);
  for (const m of src.matchAll(RE.exportDestructure)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop().split('=')[0].trim().replace(/^\.\.\./, '');
      if (/^[\w$]+$/.test(name)) exports.add(name);
    }
  }
  if (RE.exportDefault.test(src)) exports.add('default');
  return { imports, exports, stars };
}

// A tree view: the staged files first, then what the install already holds.
function treeView(layers, gone = new Set()) {
  const cache = new Map();
  const locate = rel => {
    if (gone.has(rel)) return null; // about to be pruned
    for (const root of layers) {
      const p = path.join(root, rel);
      try { if (fs.statSync(p).isFile()) return p; } catch {}
    }
    return null;
  };
  const read = rel => {
    if (!cache.has(rel)) { const p = locate(rel); cache.set(rel, p ? fs.readFileSync(p, 'utf8') : null); }
    return cache.get(rel);
  };
  return { exists: rel => locate(rel) !== null, read };
}

function resolveRel(fromRel, spec) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null; // engine route, bare, or URL
  const clean = spec.split(/[?#]/)[0];
  const r = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), clean));
  return r.startsWith('../') ? null : r; // outside the skill: not ours to check
}

function exportsOf(tree, rel, seen = new Set()) {
  if (seen.has(rel)) return new Set();
  seen.add(rel);
  const src = tree.read(rel);
  if (src == null) return new Set();
  const mod = parseModule(src);
  const out = new Set(mod.exports);
  for (const s of mod.stars) {
    const t = resolveRel(rel, s);
    if (t) for (const n of exportsOf(tree, t, seen)) if (n !== 'default') out.add(n);
  }
  return out;
}

function checkImports(tree, rel, src, label = rel) {
  const problems = [];
  for (const imp of parseModule(src).imports) {
    const target = resolveRel(rel, imp.spec);
    if (!target) continue;
    if (!tree.exists(target)) { problems.push(`${label}: imports '${imp.spec}' — ${target} does not exist`); continue; }
    if (!imp.names.length || !/\.m?js$/.test(target)) continue;
    const have = exportsOf(tree, target);
    for (const n of imp.names) if (!have.has(n)) problems.push(`${label}: imports { ${n} } from '${imp.spec}' — ${target} does not export it`);
  }
  return problems;
}

function checkPage(tree, rel) {
  const html = tree.read(rel);
  const problems = [];
  const refs = [
    ...[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1]),
    ...[...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/gi)].map(m => m[1]),
  ].filter(r => !/^(\/|[a-z]+:|#)/i.test(r));
  for (const r of refs) {
    const target = resolveRel(rel, r.startsWith('.') ? r : `./${r}`);
    if (target && !tree.exists(target)) problems.push(`${rel}: references '${r}' — ${target} does not exist`);
  }
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/type=["']module["']/i.test(m[1]) || /\bsrc=/i.test(m[1])) continue;
    problems.push(...checkImports(tree, rel, m[2], `${rel} (inline module)`));
  }
  return problems;
}

// Every staged code file and page, checked against a tree view.
function linkCheck(tree, files) {
  const problems = [];
  for (const rel of files) {
    if (/\.m?js$/.test(rel)) problems.push(...checkImports(tree, rel, tree.read(rel) ?? ''));
    else if (/\.html?$/.test(rel)) problems.push(...checkPage(tree, rel));
  }
  return problems;
}

// ── install ─────────────────────────────────────────────────────────────────
function sameFile(a, b) {
  try {
    const sa = fs.lstatSync(a), sb = fs.lstatSync(b);
    if (sa.isSymbolicLink() || sb.isSymbolicLink()) return sa.isSymbolicLink() && sb.isSymbolicLink() && fs.readlinkSync(a) === fs.readlinkSync(b);
    return sa.size === sb.size && fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch { return false; }
}

function placeFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp.${process.pid}`;
  const st = fs.lstatSync(src);
  try { fs.rmSync(tmp, { force: true }); } catch {}
  if (st.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(src), tmp);
  else { fs.copyFileSync(src, tmp); fs.chmodSync(tmp, st.mode & 0o777); }
  fs.renameSync(tmp, dest); // new inode, atomic per file
}

async function reload(port) {
  const url = `http://localhost:${port}/api/skills/reload`;
  console.log(`SKILL.md changed — POST ${url}`);
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: ctl.signal });
    clearTimeout(t);
    console.log(r.ok ? 'skills reloaded (start a NEW chat to bind the new SKILL.md)' : `reload answered HTTP ${r.status} — reload by hand`);
  } catch {
    console.log(`engine not reachable on port ${port} — skills NOT reloaded; reload once it is up`);
  }
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const o = parseArgs(process.argv.slice(2));
  const repo = git(path.dirname(new URL(import.meta.url).pathname), ['rev-parse', '--show-toplevel']).stdout.trim();
  const skillsDir = process.env.LINGGEN_SKILLS_DIR || path.join(os.homedir(), '.linggen', 'skills');
  const installDir = path.join(skillsDir, o.skill);
  const port = process.env.LINGGEN_PORT || '9527';

  const remote = /^([^/]+)\//.exec(o.ref)?.[1];
  if (remote && git(repo, ['remote'], { allowFail: true }).stdout.split('\n').includes(remote)) {
    const f = git(repo, ['fetch', '--quiet', remote], { allowFail: true });
    if (f.status !== 0) console.error(`warning: git fetch ${remote} failed — using the last fetched ${o.ref}`);
  }
  const commit = git(repo, ['rev-parse', '--verify', `${o.ref}^{commit}`]).stdout.trim();
  if (!git(repo, ['ls-tree', commit, `${o.skill}/SKILL.md`]).stdout.trim()) {
    console.error(`${o.skill}/SKILL.md is not in ${o.ref} (${commit.slice(0, 9)})`);
    process.exit(1);
  }

  const staged = stage(repo, commit, o.skill);
  try {
    const keep = [...USER_STATE, ...cloudPaths(fs.readFileSync(path.join(staged, 'SKILL.md'), 'utf8'))];
    const files = walk(staged).filter(r => !underAny(r, keep)).sort();
    const installed = new Set(walk(installDir));
    const extras = [...installed].filter(r => !underAny(r, keep) && !files.includes(r) && !/\.tmp\.\d+$/.test(r)).sort();
    const { prunable: once, modified, untracked: never } = sortExtras(repo, o.skill, installDir, extras);
    const prunable = once.filter(r => !isLocal(r));
    const untracked = [...never, ...once.filter(isLocal)];
    const pruning = o.prune ? prunable : [];
    const changed = files.filter(r => installed.has(r) && !sameFile(path.join(staged, r), path.join(installDir, r)));
    const missing = files.filter(r => !installed.has(r));
    const head = `${o.skill} @ ${o.ref} (${commit.slice(0, 9)}) → ${installDir}`;

    if (o.check) {
      console.log(`check ${head}`);
      try { const m = JSON.parse(fs.readFileSync(path.join(installDir, '.installed'), 'utf8')); console.log(`installed: ${m.ref} ${String(m.commit).slice(0, 9)} at ${m.at}`); }
      catch { console.log('installed: no .installed marker (never installed by this script)'); }
      const allLinks = linkCheck(treeView([installDir]), files.filter(r => installed.has(r)));
      const links = allLinks.filter(p => !isDevOnly(p));
      for (const p of allLinks.filter(isDevOnly)) console.log(`  warning  ${p} (dev-only, not served)`);
      for (const r of changed) console.log(`  differs  ${r}`);
      for (const r of missing) console.log(`  missing  ${r}`);
      for (const r of prunable) console.log(`  prunable ${r} (deleted from the repo; an install prunes it)`);
      for (const r of modified) console.log(`  extra    ${r} (once tracked, changed since — left alone)`);
      for (const r of untracked) console.log(`  extra    ${r} (never tracked — left alone)`);
      for (const p of links) console.log(`  LINK     ${p}`);
      const bad = changed.length + missing.length + links.length;
      const extraNote = `${prunable.length} prunable, ${untracked.length} untracked extra${modified.length ? `, ${modified.length} changed since tracked` : ''}`;
      console.log(bad ? `${changed.length} differ, ${missing.length} missing, ${links.length} link problem(s); ${extraNote}`
        : `in sync (${files.length} files${extras.length ? `; ${extraNote}` : ''})`);
      return bad ? 1 : 0;
    }

    // Pre-flight on the staged tree, as the install will be after it lands.
    const problems = [];
    for (const r of files.filter(r => /\.m?js$/.test(r))) {
      const p = syntaxProblem(path.join(staged, r));
      if (p) problems.push(`${r}: ${p}`);
    }
    problems.push(...linkCheck(treeView([staged, installDir], new Set(pruning)), files));
    for (const p of problems.filter(isDevOnly)) console.error(`warning (dev-only, not served): ${p}`);
    problems.splice(0, problems.length, ...problems.filter(p => !isDevOnly(p)));
    if (problems.length) {
      console.error(`pre-flight FAILED for ${head} — nothing installed:`);
      for (const p of problems) console.error(`  ${p}`);
      return 1;
    }

    const skillMdChanged = changed.includes('SKILL.md') || missing.includes('SKILL.md');
    const todo = [...missing.map(r => ['new', r]), ...changed.map(r => ['changed', r])].sort((a, b) => a[1].localeCompare(b[1]));
    console.log(`${o.dryRun ? 'dry-run ' : 'install '}${head}`);
    for (const [k, r] of todo) console.log(`  ${k.padEnd(8)} ${r}`);
    for (const r of pruning) console.log(`  prune    ${r}`);
    for (const r of extras.filter(r => !pruning.includes(r))) console.log(`  warning: ${r} is in the install but not in the ref (left alone)`);
    if (o.dryRun) {
      console.log(`${todo.length} file(s) would change, ${pruning.length} would be pruned${skillMdChanged ? '; SKILL.md changed — would reload skills' : ''}`);
      return 0;
    }

    for (const [, r] of todo) placeFile(path.join(staged, r), path.join(installDir, r));
    prune(installDir, pruning);

    const after = linkCheck(treeView([installDir]), files).filter(p => !isDevOnly(p));
    if (after.length) {
      console.error('!!!!!!!! INSTALLED TREE HAS BROKEN LINKS — the page may be blank !!!!!!!!');
      for (const p of after) console.error(`  ${p}`);
      return 1;
    }
    fs.writeFileSync(path.join(installDir, '.installed'),
      JSON.stringify({ ref: o.ref, commit, at: new Date().toISOString() }, null, 2) + '\n');
    console.log(`installed ${todo.length} file(s), pruned ${pruning.length}; ${files.length} in sync`);
    if (skillMdChanged) await reload(port);
    return 0;
  } finally {
    fs.rmSync(path.dirname(staged), { recursive: true, force: true });
  }
}

process.exit(await main());
