// Every skill's shipped scripts, checked without a browser: each JS file
// parses, each shell script passes `bash -n`, and every local script or
// stylesheet a page loads is really there. A typo in a page script shows up
// as a blank app with an error only in the webview's console — nothing else
// here would notice.
//
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, 'SKILL.md'))).sort();
// Not shipped code: run state, installs, design mock-ups, vendored bundles.
const SKIP = new Set(['node_modules', 'data', '.venv', '__pycache__', 'doc', 'worlds', 'tests', 'tools']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const isModule = (file, src) => file.endsWith('.mjs') || /^\s*(import\s*[\w{*'"]|export\s)/m.test(src);

function parseProblem(file) {
  const src = fs.readFileSync(file, 'utf8');
  if (!isModule(file, src)) {
    try { new vm.Script(src, { filename: file }); return null; } catch (e) { return `${e.name}: ${e.message}`; }
  }
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: src, encoding: 'utf8' });
  return r.status === 0 ? null : (r.stderr.split('\n').find(l => /Error/.test(l)) ?? r.stderr.trim());
}

function missingAssets(html) {
  const text = fs.readFileSync(html, 'utf8');
  const refs = [...text.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/g), ...text.matchAll(/<link[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/g)]
    .map(m => m[1])
    // `/…` is the engine's (served by the shell), `http…` is not ours.
    .filter(r => !/^(\/|https?:|data:|\/\/)/.test(r));
  return refs.map(r => r.split(/[?#]/)[0]).filter(r => !fs.existsSync(path.resolve(path.dirname(html), r)));
}

for (const skill of SKILLS) {
  const files = walk(path.join(ROOT, skill));
  const js = files.filter(f => /\.(m?js)$/.test(f));
  const sh = files.filter(f => f.endsWith('.sh'));
  const html = files.filter(f => f.endsWith('.html'));

  test(`${skill}: every script parses`, () => {
    const bad = js.map(f => [path.relative(ROOT, f), parseProblem(f)]).filter(([, p]) => p);
    assert.deepEqual(bad, []);
  });

  if (sh.length) {
    test(`${skill}: every shell script passes bash -n`, () => {
      const bad = sh.map(f => [path.relative(ROOT, f), spawnSync('bash', ['-n', f], { encoding: 'utf8' })])
        .filter(([, r]) => r.status !== 0).map(([f, r]) => [f, r.stderr.trim()]);
      assert.deepEqual(bad, []);
    });
  }

  if (html.length) {
    test(`${skill}: every page's local scripts and stylesheets exist`, () => {
      const bad = html.map(f => [path.relative(ROOT, f), missingAssets(f)]).filter(([, m]) => m.length);
      assert.deepEqual(bad, []);
    });
  }
}

// ── The engine's page helpers (/shared/*) ──────────────────────────────────
// Pages take the chat bridge, the API client and app-mode from the engine
// (linggen/shared/, served at /shared/<file>) instead of carrying copies.
// These checks read the engine's copy from a sibling linggen checkout when
// there is one, and skip otherwise.
const SHARED_FILES = ['chat-bridge.js', 'api.js', 'app-mode.js'];
const SHARED_DIR = path.resolve(ROOT, '..', 'linggen', 'shared');
const haveShared = fs.existsSync(path.join(SHARED_DIR, 'chat-bridge.js'));

const IMPORT_RE = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]\s*;?/g;

function moduleEntries(html) {
  const text = fs.readFileSync(html, 'utf8');
  return [...text.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)]
    .filter(m => /type=["']module["']/.test(m[0]) && !/^(https?:|\/\/)/.test(m[1]))
    .map(m => m[1]);
}

// Where a module specifier lives on disk: `/shared/x` is the engine's,
// relative ones sit beside the importing file, other absolute paths are
// the engine's routes (not ours to read).
function onDisk(spec, fromFile) {
  if (spec.startsWith('/shared/')) return path.join(SHARED_DIR, spec.slice('/shared/'.length));
  if (spec.startsWith('/')) return null;
  return path.resolve(path.dirname(fromFile), spec);
}

for (const skill of SKILLS) {
  const files = walk(path.join(ROOT, skill));
  const html = files.filter(f => f.endsWith('.html'));
  const code = files.filter(f => /\.(m?js|html)$/.test(f));

  test(`${skill}: /shared/ references name a helper the engine serves`, () => {
    const bad = [];
    for (const f of code) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(/['"]\/shared\/([^'"?#]+)/g)) {
        if (!SHARED_FILES.includes(m[1])) bad.push([path.relative(ROOT, f), m[1]]);
      }
    }
    assert.deepEqual(bad, []);
  });

  test(`${skill}: names imported from /shared/ are exported there`, { skip: !haveShared && 'no sibling linggen checkout' }, () => {
    const bad = [];
    for (const f of code.filter(f => /\.m?js$/.test(f))) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\/shared\/([^'"]+)['"]/g)) {
        const src = fs.readFileSync(path.join(SHARED_DIR, m[2]), 'utf8');
        for (const name of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
          if (!new RegExp(`export\\s+(async\\s+)?(function|const|let|class)\\s+${name}\\b`).test(src)) bad.push([path.relative(ROOT, f), name]);
        }
      }
    }
    assert.deepEqual(bad, []);
  });

  // Opened remotely, the linggen.dev connect page inlines each page module
  // and everything it imports into ONE script, keyed by the resolved path
  // (linggensite ConnectPage.jsx, bundleModule). There a top-level name the
  // engine's helpers declare must not be declared again by the page's own
  // modules, and a helper reached by two spellings is inlined twice. (Page
  // modules clashing among themselves is older and out of this check.)
  if (html.length) {
    test(`${skill}: the engine's helpers don't clash when the relay inlines a page`, { skip: !haveShared && 'no sibling linggen checkout' }, () => {
      const topLevel = (file) => new Set([...fs.readFileSync(file, 'utf8')
        .matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]));
      const bad = [];
      for (const page of html) {
        for (const src of moduleEntries(page)) {
          const entry = onDisk(src, page);
          if (!entry || !fs.existsSync(entry)) continue;
          const seen = new Map(); // file -> spelling
          const stack = [[entry, src]];
          while (stack.length) {
            const [file, key] = stack.pop();
            if (seen.has(file)) {
              if (key.startsWith('/shared/') && seen.get(file) !== key) bad.push([path.relative(ROOT, page), `${key} also reached as ${seen.get(file)}`]);
              continue;
            }
            seen.set(file, key);
            const text = fs.readFileSync(file, 'utf8');
            const dirKey = key.slice(0, key.lastIndexOf('/') + 1);
            for (const imp of text.matchAll(IMPORT_RE)) {
              const spec = imp[1];
              if (!spec.startsWith('.') && !spec.startsWith('/')) continue;
              const dep = onDisk(spec, file);
              if (dep && fs.existsSync(dep)) stack.push([dep, spec.startsWith('/') ? spec : dirKey + spec]);
            }
          }
          const shared = [...seen.keys()].filter(f => f.startsWith(SHARED_DIR));
          const own = [...seen.keys()].filter(f => !f.startsWith(SHARED_DIR));
          const sharedNames = new Set(shared.flatMap(f => [...topLevel(f)]));
          for (const f of own) for (const n of topLevel(f)) {
            if (sharedNames.has(n)) bad.push([path.relative(ROOT, f), `declares ${n}, which /shared/ also declares`]);
          }
        }
      }
      assert.deepEqual(bad, []);
    });
  }
}
