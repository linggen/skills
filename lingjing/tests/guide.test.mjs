// Ling's rules, handed over when the game gets there (rules/guide.mjs; his
// ruling 2026-09-25: 没出现的内容，不用一直带着). SKILL.md keeps the laws and a
// line for every part; each part's detail is guide/<topic>.md, pushed once a
// session with the answer that makes it live, or read with Guide.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { guideVerb, topics, withGuides } from '../scripts/rules/guide.mjs';
import { readTools } from './skill-md.test.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
const body = md.slice(md.indexOf('\n---\n', 4) + 5);

test('every part has its guide, SKILL.md names every part, and every tool points to a part that exists', () => {
  for (const t of topics()) {
    assert.ok(fs.existsSync(path.join(ROOT, 'guide', `${t}.md`)), `guide/${t}.md`);
    assert.ok(body.includes(`\`${t}\``), `SKILL.md names ${t}`);
  }
  const { tools } = readTools(md);
  for (const m of md.matchAll(/guides? `(\w+)`(?:, `(\w+)`)?/g)) for (const t of [m[1], m[2]].filter(Boolean)) assert.ok(topics().includes(t), `a pointer to ${t}`);
  const guideTool = tools.find(t => t.name === 'Guide');
  assert.ok(guideTool && guideTool.args.includes('topic'));
});

test('SKILL.md stays small: the laws and the outline, never the whole game again', () => {
  assert.ok(Buffer.byteLength(body) < 12_000, `body ${Buffer.byteLength(body)} bytes`);
  const fm = md.slice(0, md.indexOf('\n---\n', 4));
  const said = [...fm.matchAll(/\n {4}description: (?:>-\n((?: {6}.*\n?)+)|(.*))/g)].reduce((n, m) => n + Buffer.byteLength(m[1] ?? m[2]), 0);
  assert.ok(said < 5_500, `tool descriptions ${said} bytes`);
});

test('what moved out is all still somewhere Ling can read it', () => {
  const all = topics().map(t => fs.readFileSync(path.join(ROOT, 'guide', `${t}.md`), 'utf8')).join('\n');
  for (const words of ['先降后收', '杀招', '望气术', '榜文', '开府', 'Meet `offer`', 'Tale `seed`', 'reference_down', 'GenerateImage', '前情提要', '`page_did`', '`director`', 'Summarize', 'not-beaten', 'road-closed']) {
    assert.ok(all.includes(words), words);
  }
});

test('a part is handed over once a session, when it becomes live — and again in a new session', () => {
  const state = { place: 'leize' };
  const fight = { ok: true, fight: { id: 'x' } };
  const a = withGuides({ verb: 'look', said: '[scene] won x', result: fight, state, session: 's1' });
  assert.ok(a.result.guide.look && a.result.guide.fight, 'the first answer: look, and the fight');
  assert.ok(!a.result.guide.tale && !a.result.guide.made, 'nothing not yet live');
  const b = withGuides({ verb: 'look', said: '[scene] won x', result: fight, state: { ...state, guided: a.guided }, session: 's1' });
  assert.equal(b.result.guide, undefined, 'the same session: never twice');
  assert.equal(b.guided, null);
  const c = withGuides({ verb: 'tale', said: '', result: { ok: true }, state: { ...state, guided: a.guided }, session: 's1' });
  assert.deepEqual(Object.keys(c.result.guide), ['tale']);
  const d = withGuides({ verb: 'look', said: '', result: fight, state: { ...state, guided: c.guided }, session: 's2' });
  assert.ok(d.result.guide.look && d.result.guide.fight, 'a new session starts afresh');
  assert.equal(withGuides({ verb: 'guide', result: { ok: true }, state, session: 's1' }).result.guide, undefined);
});

test('Guide reads a part by name; an unknown name lists them', () => {
  const g = guideVerb({ topic: 'trial' });
  assert.equal(g.ok, true);
  assert.match(g.text, /Meet `offer`/);
  assert.deepEqual(guideVerb({ topic: 'nope' }).topics, topics());
});

test('through the door: Ling\'s answer carries the guide once, the page\'s never', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-guide-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'q'), LINGJING_NOW: '2026-09-25T10:00:00Z', LINGGEN_SESSION_ID: 'sess-a' };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
  try {
    assert.ok(cli('look', '--said=hi', '--for=ling').guide?.look, 'first Look of the session');
    assert.equal(cli('look', '--said=hi', '--for=ling').guide, undefined, 'then not again');
    assert.equal(cli('look').guide, undefined, 'the page never gets one');
    assert.ok(cli('guide', '--topic=fight', '--for=ling').text.includes('降妖'));
    env.LINGGEN_SESSION_ID = 'sess-b';
    assert.ok(cli('look', '--said=hi', '--for=ling').guide?.look, 'a new chat, a fresh hand-over');
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});
