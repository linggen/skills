// install-skill.mjs — install one skill from a COMMITTED ref into the
// engine's skills dir, whole, or not at all. See install-skill.sh for usage.
//
// Why: files copied by name let a page import a name from an older installed
// neighbour (the page goes blank), and let in-flight edits from the working
// tree ship. Here the source is always a git ref, the staged tree must pass a
// syntax + import/export link check against what the install WILL be, each
// file lands by tmp-write + rename, nothing in the install is ever deleted,
// and user state (data/, state/, config.json, sessions/, cloud.save/skip) is
// never touched.
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
  const o = { skill: null, ref: 'origin/main', check: false, dryRun: false, refGiven: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ref') { o.ref = argv[++i]; o.refGiven = true; }
    else if (a.startsWith('--ref=')) { o.ref = a.slice(6); o.refGiven = true; }
    else if (a === '--check') o.check = true;
    else if (a === '--dry-run') o.dryRun = true;
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
    'usage: scripts/install-skill.sh <skill> [--ref <git-ref>] [--check] [--dry-run]\n' +
    '  --ref      committed source (default origin/main, fetched first; HEAD for a local commit)\n' +
    '  --check    install nothing; report drift between the install and the ref\n' +
    '  --dry-run  run the pre-flight and print what would change');
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
};

const splitNames = list => list.split(',').map(s => s.trim()).filter(Boolean).map(s => {
  const m = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(s.replace(/\s+/g, ' '));
  return m ? { from: m[1], as: m[2] ?? m[1] } : null;
}).filter(Boolean);

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
function treeView(layers) {
  const cache = new Map();
  const locate = rel => {
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
      for (const r of extras) console.log(`  extra    ${r} (in the install, not in the ref — left alone)`);
      for (const p of links) console.log(`  LINK     ${p}`);
      const bad = changed.length + missing.length + links.length;
      console.log(bad ? `${changed.length} differ, ${missing.length} missing, ${links.length} link problem(s), ${extras.length} extra`
        : `in sync (${files.length} files${extras.length ? `, ${extras.length} extra` : ''})`);
      return bad ? 1 : 0;
    }

    // Pre-flight on the staged tree, as the install will be after it lands.
    const problems = [];
    for (const r of files.filter(r => /\.m?js$/.test(r))) {
      const p = syntaxProblem(path.join(staged, r));
      if (p) problems.push(`${r}: ${p}`);
    }
    problems.push(...linkCheck(treeView([staged, installDir]), files));
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
    for (const r of extras) console.log(`  warning: ${r} is in the install but not in the ref (left alone)`);
    if (o.dryRun) {
      console.log(`${todo.length} file(s) would change${skillMdChanged ? '; SKILL.md changed — would reload skills' : ''}`);
      return 0;
    }

    for (const [, r] of todo) placeFile(path.join(staged, r), path.join(installDir, r));

    const after = linkCheck(treeView([installDir]), files).filter(p => !isDevOnly(p));
    if (after.length) {
      console.error('!!!!!!!! INSTALLED TREE HAS BROKEN LINKS — the page may be blank !!!!!!!!');
      for (const p of after) console.error(`  ${p}`);
      return 1;
    }
    fs.writeFileSync(path.join(installDir, '.installed'),
      JSON.stringify({ ref: o.ref, commit, at: new Date().toISOString() }, null, 2) + '\n');
    console.log(`installed ${todo.length} file(s); ${files.length} in sync`);
    if (skillMdChanged) await reload(port);
    return 0;
  } finally {
    fs.rmSync(path.dirname(staged), { recursive: true, force: true });
  }
}

process.exit(await main());
