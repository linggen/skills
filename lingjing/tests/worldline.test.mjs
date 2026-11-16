// 灵境's line in the world block and its three activity moments: readings of
// where the player stands, from the save as it is; the save itself never written
// for them. (rules/worldline.mjs) Invented saves only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { VERBS } from '../scripts/rules.mjs';
import { FIELDS, eventsOf, worldOf } from '../scripts/rules/worldline.mjs';

const content = loadContent();
const NOW = new Date('2026-11-02T21:00:00Z');
const SCENE = content.chapters['00-waimen'].scenes['wm-koujue'];
const player = (extra = {}) => ({
  ...newState(content, 'zh', NOW), name: '阿力', chapter: '00-waimen', scene: 'wm-koujue', place: SCENE.at, ended: ['00-prologue'],
  tier: 'qi', step: 4, progress: 300, wealth: 777, traits: ['wood', 'water', 'fire', 'earth'], stamina: 10, stamina_at: NOW.toISOString(), ...extra,
});
const secluded = (s = player()) => VERBS.seclude(s, content, { now: NOW, quests: [] }, { action: 'enter', focus: 'progress' }).state;
const ROOT = path.resolve(import.meta.dirname, '..');

test('the line says where the player stands in the game\'s own words, and that no 闭关 runs', () => {
  const w = worldOf(content, player(), 'zh');
  assert.deepEqual(Object.keys(w), FIELDS);
  assert.equal(w.seclusion, 'none');
  assert.match(w.realm, /练气/);
  assert.ok(w.place && w.chapter);
  assert.ok(Object.values(w).every(v => typeof v === 'string' && v.length <= 48), JSON.stringify(w));
});

test('a running 闭关 is a start and the hour the rules stop counting', () => {
  const w = worldOf(content, secluded(), 'zh');
  const cap = content.rewards.seclusion.cap_hours;
  assert.equal(w.seclusion, `since 11-02 21:00Z, counts to ${cap === 12 ? '11-03 09:00Z' : '?'}`);
});

test('no name, no 灵石, no 修为 and no save internals travel', () => {
  const text = JSON.stringify(worldOf(content, player(), 'zh'));
  for (const leak of ['阿力', '777', '300', 'wealth', 'progress', 'bag', 'stamina']) assert.ok(!text.includes(leak), leak);
});

test('the whole line fits the world block in Chinese; in English the chapter, last, is what may not', () => {
  const line = (w, keys) => `lingjing: ${keys.map(k => `${k} ${w[k]}`).join(' · ')} · 59m ago`;
  const zh = worldOf(content, secluded(), 'zh');
  assert.ok(line(zh, FIELDS).length <= 160, line(zh, FIELDS));
  const en = worldOf(content, secluded(), 'en');
  assert.ok(line(en, FIELDS.slice(0, 3)).length <= 160, 'place, realm and 闭关 always fit');
});

test('a chapter finished, a 闭关 begun, a 闭关 ended are the moments; a restart or a load is none', () => {
  const a = player();
  const done = { ...a, ended: [...a.ended, '00-waimen'] };
  const [chapter] = eventsOf(a, done, content, 'resolve', 'zh');
  assert.deepEqual([chapter.app, chapter.verb], ['lingjing', 'chapter_done']);
  assert.ok(chapter.object);
  const inn = secluded(a);
  const [start] = eventsOf(a, inn, content, 'seclude', 'zh');
  assert.deepEqual([start.verb, start.object, start.detail.focus], ['seclusion_start', '闭关', 'progress']);
  const out = VERBS.seclude(inn, content, { now: new Date(NOW.getTime() + 3 * 3600_000), quests: [] }, { action: 'leave' }).state;
  const [end] = eventsOf(inn, out, content, 'seclude', 'zh');
  assert.equal(end.verb, 'seclusion_end');
  assert.equal(end.detail.hours, 3);
  for (const verb of ['init', 'load', 'undo', 'travel', 'seed']) assert.deepEqual(eventsOf(inn, out, content, verb, 'zh'), [], verb);
  assert.deepEqual(eventsOf(a, { ...done, run: 'other' }, content, 'resolve', 'zh'), [], 'a different play is not a move on');
  assert.deepEqual(eventsOf(null, done, content, 'resolve', 'zh'), []);
  assert.deepEqual(eventsOf(a, a, content, 'look', 'zh'), []);
});

test('SKILL.md declares the line and the verbs the code writes', () => {
  const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  assert.match(md, /^activity-verbs: \[chapter_done, seclusion_start, seclusion_end\]$/m);
  assert.match(md, new RegExp(`^ {2}fields: \\[${FIELDS.join(', ')}\\]$`, 'm'));
  assert.match(md, /^ {2}file: data\/world\.json$/m);
});

// ── the door: a verb leaves the save as it would, and a side file beside it ──

const cli = (dir, env, ...args) => spawnSync(process.execPath, ['scripts/rules.mjs', ...args], {
  cwd: ROOT, encoding: 'utf8',
  env: { ...process.env, LINGJING_DATA: dir, LINGJING_QUESTS: path.join(dir, 'none'), LINGJING_NOW: NOW.toISOString(), LINGGEN_PORT: '1', ...env },
});

test('a verb writes world.json beside the save and only when it changes; a scratch save writes none', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-world-'));
  try {
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(player()));
    assert.equal(JSON.parse(cli(dir, {}, 'look', '--for=ling').stdout).ok, true);
    const world = path.join(dir, 'world.json');
    const first = fs.readFileSync(world, 'utf8');
    assert.equal(JSON.parse(first).seclusion, 'none');
    const stamp = fs.statSync(world).mtimeMs;
    cli(dir, {}, 'look', '--for=ling');
    assert.equal(fs.statSync(world).mtimeMs, stamp, 'the same facts leave the file alone');
    cli(dir, {}, 'seclude', '--action=enter', '--focus=progress');
    assert.match(JSON.parse(fs.readFileSync(world, 'utf8')).seclusion, /^since /);
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-world-scratch-'));
    try {
      cli(scratch, {}, 'look', '--save=test', '--for=ling');
      assert.ok(!fs.existsSync(path.join(scratch, 'world.json')) && !fs.existsSync(path.join(scratch, 'saves', 'test', 'world.json')));
    } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a 闭关 begun and ended is posted once each (LINGJING_TELL lets a test reach its own door)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-world-tell-'));
  const seen = [];
  const door = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { seen.push(JSON.parse(raw)); res.statusCode = seen.length === 2 ? 400 : 200; res.end(JSON.stringify(seen.length === 2 ? { error: 'refused' } : { ok: true })); });
  });
  await new Promise(r => door.listen(0, '127.0.0.1', r));
  const env = { LINGGEN_PORT: String(door.address().port), LINGJING_TELL: '1' };
  const run = (...args) => new Promise(resolve => {
    const p = spawn(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env: { ...process.env, LINGJING_DATA: dir, LINGJING_QUESTS: path.join(dir, 'none'), LINGJING_NOW: NOW.toISOString(), ...env } });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('close', () => resolve(err));
  });
  try {
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(player()));
    assert.equal(await run('look', '--for=ling'), '');
    assert.equal(seen.length, 0, 'a look is no moment');
    assert.equal(await run('seclude', '--action=enter', '--focus=progress'), '');
    assert.equal(seen.length, 1);
    assert.deepEqual([seen[0].app, seen[0].verb], ['lingjing', 'seclusion_start']);
    const err = await run('seclude', '--action=leave');
    assert.deepEqual([seen[1].app, seen[1].verb], ['lingjing', 'seclusion_end']);
    assert.match(err, /^activity log refused the seclusion_end record: refused\n$/);
  } finally {
    door.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
