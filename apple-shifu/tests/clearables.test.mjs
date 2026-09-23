// The Clearable pile's page logic: the catalog is well-formed, verdicts only
// ever move down from a rule's base safety, why lines are built from facts,
// and the copyable command comes from the catalog, never from model text.
// Run: node --test apple-shifu/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseScan, parseFound, ruleMap, verdict, whyLine, commandFor, groupRows, headline,
  homeBreakdown, summaryText,
} from '../scripts/clearables.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(here, '../scripts/clearables.json'), 'utf8'));
const rules = ruleMap(catalog);
const NOW = 1_790_000_000;
const DAY = 86400;

test('catalog: every rule is complete and names a known group, finder and method', () => {
  const groups = new Set(catalog.groups.map((g) => g.id));
  const kinds = new Set(['marker', 'path', 'children', 'ext', 'big', 'series', 'cmd']);
  const methods = new Set(['tool', 'purge', 'trash', 'report']);
  const ids = new Set();
  for (const r of catalog.rules) {
    assert.ok(!ids.has(r.id), `duplicate rule ${r.id}`);
    ids.add(r.id);
    assert.ok(groups.has(r.group), `${r.id}: group ${r.group}`);
    assert.ok(kinds.has(r.find.kind), `${r.id}: finder ${r.find.kind}`);
    assert.ok(methods.has(r.remove.method), `${r.id}: method ${r.remove.method}`);
    assert.ok(['safe', 'review', 'careful'].includes(r.safety), `${r.id}: safety`);
    assert.ok(r.label && r.regen, `${r.id}: label and regen`);
    if (r.remove.method === 'tool' || r.remove.method === 'report') assert.ok(r.remove.cmd, `${r.id}: cmd`);
    // user data never goes by purge: logs and backups are the person's
    if (['logs', 'installers'].includes(r.group) && r.id !== 'library-logs') {
      assert.notEqual(r.remove.method, 'purge', `${r.id}: user data must be recoverable`);
    }
  }
  assert.ok(!ids.has('found'), '"found" is the page\'s rule, not the catalog\'s');
});

test('catalog: the design\'s must-haves are covered', () => {
  const markers = catalog.rules.filter((r) => r.find.kind === 'marker').flatMap((r) => r.find.markers);
  for (const m of ['Cargo.toml', 'package.json', 'pubspec.yaml', 'build.gradle', 'CMakeLists.txt',
    'pyproject.toml', 'ProjectSettings', 'CACHEDIR.TAG']) assert.ok(markers.includes(m), m);
  const cargo = rules.get('cargo-target');
  assert.equal(cargo.remove.cmd, 'cargo clean');
  assert.equal(cargo.active_days, 30);
});

test('parseScan: rows keep a path with a pipe whole; H, P, T and D lines land', () => {
  const scan = parseScan([
    'S|100', 'P|2',
    'R|cargo-target|211900000000|ok|1780000000|0|project=luffy|/Users/a/w/luf|fy/target',
    'R|library-caches|0|timeout|0|0||/Users/a/Library/Caches/big',
    'T|150', 'H|900|ok|/Users/a/w', 'D|200|100', 'garbage line',
  ].join('\n'));
  assert.equal(scan.rows.length, 2);
  assert.equal(scan.rows[0].path, '/Users/a/w/luf|fy/target');
  assert.equal(scan.rows[0].extra.project, 'luffy');
  assert.equal(scan.rows[1].state, 'timeout');
  assert.deepEqual([scan.started, scan.total, scan.tree, scan.finished, scan.seconds], [100, 2, 150, 200, 100]);
  assert.equal(scan.home[0].path, '/Users/a/w');
});

test('verdict: an old build is SAFE; a fresh one, or one with a process running, is REVIEW', () => {
  const rule = rules.get('cargo-target');
  const old = { rule: 'cargo-target', last: NOW - 71 * DAY, running: false, extra: {} };
  assert.equal(verdict(rule, old, NOW), 'safe');
  assert.equal(verdict(rule, { ...old, last: NOW - 3 * DAY }, NOW), 'review');
  assert.equal(verdict(rule, { ...old, running: true }, NOW), 'review');
});

test('verdict: facts only demote — a REVIEW rule never turns SAFE, an unknown rule is CAREFUL', () => {
  const venv = rules.get('python-venv');
  assert.equal(verdict(venv, { last: NOW - 900 * DAY, extra: {} }, NOW), 'review');
  assert.equal(verdict(undefined, { extra: {} }, NOW), 'careful');
  assert.equal(verdict({ ...venv, safety: 'bogus' }, { extra: {} }, NOW), 'careful');
});

test('verdict: installers younger than 14 days are REVIEW; Ling\'s finds are never SAFE', () => {
  const inst = rules.get('installers');
  assert.equal(verdict(inst, { last: NOW - 3 * DAY, extra: {} }, NOW), 'review');
  assert.equal(verdict(inst, { last: NOW - 40 * DAY, extra: {} }, NOW), 'safe');
  const found = parseFound('5|ok|100|200|old export|/Users/a/x|y')[0];
  assert.equal(found.path, '/Users/a/x|y');
  assert.equal(verdict(rules.get('found'), found, NOW), 'review');
  assert.equal(verdict({ ...rules.get('found'), safety: 'safe' }, found, NOW), 'review');
});

test('whyLine: built from facts, in the design\'s words', () => {
  const row = { rule: 'cargo-target', last: NOW - 71 * DAY, running: false, state: 'ok', extra: { project: 'luffy' }, path: '/Users/a/w/luffy/target' };
  assert.equal(whyLine(rules.get('cargo-target'), row, NOW),
    'Rust build output of luffy · last built 71 days ago · `cargo build` rebuilds it — minutes');
  const series = {
    rule: 'log-series', last: NOW, state: 'ok', path: '/Users/a/.sanji',
    extra: { n: '530', first: '2026-05-19', total_bytes: '41000000000', biggest: 'sensing_all.2026-06-19', biggest_bytes: '39900000000', old: '516', keep: '14' },
  };
  assert.match(whyLine(rules.get('log-series'), series, NOW), /^530 dated logs since 2026-05-19, 41\.0 GB in all · biggest sensing_all\.2026-06-19, 39\.9 GB/);
  const unmeasured = { ...row, state: 'timeout' };
  assert.match(whyLine(rules.get('cargo-target'), unmeasured, NOW), /not measured/);
});

test('commandFor: from the catalog, shell-quoted, tool run in its project', () => {
  const row = { rule: 'cargo-target', path: "/Volumes/w/it's/target", extra: {} };
  assert.equal(commandFor(rules.get('cargo-target'), row), `cd '/Volumes/w/it'\\''s' && cargo clean`);
  assert.equal(commandFor(rules.get('library-caches'), { path: '/Users/a/Library/Caches/x', extra: {} }),
    `rm -rf "$HOME"/'Library/Caches/x'`);
  assert.equal(commandFor(rules.get('ollama-models'),
    { path: '/Users/a/.ollama/models/manifests/registry.ollama.ai/library/qwen3.8/27b-mlx', extra: {} }),
  "ollama rm 'qwen3.8':'27b-mlx'");
  assert.equal(commandFor(rules.get('docker-disk'), { path: '/x', extra: {} }), 'docker system prune -a');
});

test('groupRows + headline: biggest group first, safe and review totals, report rows left out', () => {
  const rows = [
    { rule: 'cargo-target', size: 200e9, state: 'ok', last: NOW - 200 * DAY, running: false, extra: { project: 'a' }, path: '/h/a/target' },
    { rule: 'cargo-target', size: 100e9, state: 'ok', last: NOW - DAY, running: false, extra: { project: 'b' }, path: '/h/b/target' },
    { rule: 'library-caches', size: 5e9, state: 'ok', last: NOW, running: false, extra: {}, path: '/h/Library/Caches/x' },
    { rule: 'docker-disk', size: 500e9, state: 'ok', last: NOW, running: false, extra: {}, path: '/h/Docker.raw' },
  ];
  const groups = groupRows(catalog, rows, NOW);
  assert.equal(groups[0].id, 'system');
  assert.equal(groups[1].id, 'build');
  assert.deepEqual(groups[1].rows.map((r) => r.risk), ['safe', 'review']);
  assert.equal(headline(groups), 'About 205.0 GB can be cleared safely, 100.0 GB more to review.');
});

test('homeBreakdown + summaryText: what the rows explain, and the rest', () => {
  const scan = parseScan([
    'S|1', 'R|cargo-target|300|ok|1|0|project=a|/h/w/a/target', 'H|1000|ok|/h/w', 'H|50|timeout|/h/Library', 'D|2|1',
  ].join('\n'));
  const home = homeBreakdown(scan.home, scan.rows);
  assert.equal(home[0].explained, 300);
  assert.equal(home[0].unexplained, 700);
  assert.equal(home[1].unexplained, 0);
  const text = summaryText(catalog, scan, [], NOW).join('\n');
  assert.match(text, /TOP ROWS/);
  assert.match(text, /SAFE · \/h\/w\/a\/target · Rust build output of a/);
  assert.match(text, /not measured · - · - · \/h\/Library/);
});
