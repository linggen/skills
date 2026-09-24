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
