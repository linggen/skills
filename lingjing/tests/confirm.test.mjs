// One AskUser before what lets the journey go (rules/confirm.mjs). A live test
// (2026-09-25) had Ling Look and Restart{} straight after — nothing asked, a
// save wiped; the law was in the prompt only. Now the rules hold it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { thenFor } from '../scripts/rules/ask.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const T0 = new Date('2026-09-11T12:00:00');
const at = (min) => new Date(T0.getTime() + min * 60_000).toISOString();

function game() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-confirm-'));
  const cli = (min, ...args) => {
    const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: at(min), LINGGEN_SESSION_ID: 's1' };
    const out = spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' });
    return JSON.parse(out.stdout);
  };
  const state = () => JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
  const write = (s) => fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(s));
  cli(0, 'init', '--lang', 'zh');
  return { data, cli, state, write };
}
// A game some way in: a name given, so a restart has something to lose.
const played = (g) => g.write({ ...g.state(), name: '清玄' });

test('Restart with nothing asked is refused and changes nothing', () => {
  const g = game(); played(g);
  const r = g.cli(1, 'init', '--for=ling');
  assert.equal(r.refused, 'not-confirmed');
  assert.ok(r.say);
  assert.match(r.then, /never call Restart/);
  assert.equal(g.state().name, '清玄');
  // A blind second try is refused as well: the refusal asks nothing.
  assert.equal(g.cli(1, 'init', '--for=ling').refused, 'not-confirmed');
});

test('重来 → Look asks, over the scene\'s own question; 从头再来 → Restart', () => {
  const g = game(); played(g);
  const plain = g.cli(1, 'look', '--for=ling');
  assert.ok(plain.ask?.options.some(o => o.exit), 'the scene has its own question');
  const asked = g.cli(1, 'look', '--said=我想重来', '--for=ling');
  assert.equal(asked.ask.question, '从头再来？此番修行尽数散去。');
  assert.deepEqual(asked.ask.options.map(o => o.label), ['从头再来', '再想想']);
  assert.equal(asked.ask.options[0].restart, true);
  assert.equal(asked.ask.header, plain.ask.header);
  assert.match(asked.then, /AskUser exactly `ask`/);
  assert.match(asked.then, /Restart only if "从头再来"/);
  assert.equal(g.state().confirm.what, 'restart');
  // The tapped answer arrives as words: Look names Restart.
  assert.match(g.cli(2, 'look', '--said=从头再来', '--for=ling').then, /call Restart now/);
  const r = g.cli(2, 'init', '--for=ling');
  assert.equal(r.restarted, true);
  assert.notEqual(g.state().name, '清玄');
  assert.equal(g.state().confirm, undefined, 'used up');
  assert.equal(g.cli(3, 'init', '--for=ling').refused, 'not-confirmed', 'once only');
  // Undo brings the game back, and never the asking with it.
  assert.equal(g.cli(3, 'undo').undid, 'init');
  assert.equal(g.state().name, '清玄');
  assert.equal(g.state().confirm, undefined);
});

test('再想想 lets it be; the asking expires after ten minutes', () => {
  const g = game(); played(g);
  g.cli(1, 'look', '--said=重新开始吧', '--for=ling');
  g.cli(2, 'look', '--said=再想想', '--for=ling');
  assert.equal(g.state().confirm, undefined);
  assert.equal(g.cli(2, 'init', '--for=ling').refused, 'not-confirmed');
  g.cli(3, 'look', '--said=从头来过吧', '--for=ling');
  assert.equal(g.cli(14, 'init', '--for=ling').refused, 'not-confirmed', 'expired');
  assert.equal(g.state().name, '清玄');
});

test('悔棋 asks before Undo, and Undo unasked is refused', () => {
  const g = game();
  const opening = g.cli(1, 'look');
  const exit = opening.ask.options.find(o => o.exit);
  g.cli(1, 'resolve', `--exit=${exit.exit}`);
  assert.equal(g.cli(2, 'undo', '--for=ling').refused, 'not-confirmed');
  const asked = g.cli(2, 'look', '--said=悔棋', '--for=ling');
  assert.equal(asked.ask.question, '悔棋：收回上一步？');
  assert.equal(asked.ask.options[0].undo, true);
  assert.match(g.cli(2, 'look', '--said=收回', '--for=ling').then, /call Undo now/);
  assert.equal(g.cli(3, 'undo', '--for=ling').undid, 'resolve');
  assert.equal(g.state().confirm, undefined);
});

test('Load and Forget ask on their first call, and go on the second', () => {
  const g = game(); played(g);
  const named = g.cli(1, 'save', '--title=初入邺城').saved;
  const first = g.cli(2, 'load', `--id=${named.id}`, '--for=ling');
  assert.equal(first.refused, 'not-confirmed');
  assert.equal(first.ask.question, '回到初入邺城？');
  assert.deepEqual(first.ask.options.map(o => o.label), ['回到初入邺城', '再想想']);
  assert.match(g.cli(2, 'look', '--said=回到初入邺城', '--for=ling').then, new RegExp(`call Load \\{id: ${named.id}\\} now`));
  assert.equal(g.cli(3, 'load', `--id=${named.id}`, '--for=ling').loaded.id, named.id);
  assert.equal(g.state().confirm, undefined);
  // A confirmation for one save is not one for another, nor for Forget.
  assert.equal(g.cli(4, 'forget', `--id=${named.id}`, '--for=ling').ask.question, '忘掉「初入邺城」？此存档就此散去。');
  assert.equal(g.cli(4, 'forget', `--id=${named.id}`, '--for=ling').forgot, named.id);
  assert.equal(g.state().confirm, undefined);
  // An unknown save is the verb's own refusal, not a question.
  assert.equal(g.cli(5, 'load', '--id=nope', '--for=ling').refused, 'unknown-save');
});

test('the page\'s own calls (no reader) are never gated', () => {
  const g = game(); played(g);
  assert.equal(g.cli(1, 'init').restarted, true);
  assert.equal(g.cli(1, 'undo').undid, 'init');
  const named = g.cli(2, 'save', '--title=x').saved;
  assert.equal(g.cli(2, 'load', `--id=${named.id}`).loaded.id, named.id);
  assert.equal(g.cli(2, 'forget', `--id=${named.id}`).forgot, named.id);
});

test('a first game begins without asking: there is nothing to lose', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-confirm-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: at(0) };
  const r = JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', 'init', '--for=ling'], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
  assert.equal(r.restarted, false);
});

test('a scene entered: the scene first — show, setup, lines — then the question', () => {
  const scene = { id: 'x', setup: 's', lines: [], show: [] };
  const into = thenFor({ ok: true, scene, summarize: true }, { options: [] });
  assert.match(into, /narrate `scene.setup` in one to three sentences/);
  assert.match(into, /then AskUser exactly `ask` — never the options in your own words/);
  const plain = thenFor({ ok: true, scene, summarize: false }, { options: [] });
  assert.match(plain, /^Now AskUser exactly `ask`/);
  assert.doesNotMatch(plain, /scene.setup/);
  // A win that walks into a scene: told in the world, then the scene.
  const both = thenFor({ ok: true, scene, summarize: true, paid: { progress: 10 } }, { options: [] });
  assert.match(both, /Something was won[\s\S]*narrate `scene.setup`/);
  assert.equal(thenFor({ ok: true, scene, summarize: true }, null).includes('scene.setup'), false, 'no question: quiet');
});
