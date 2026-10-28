// 银月's presence follows the book, and she wakes only for a small game that needs her (Hanli,
// 2026-10-19: 「平时和剧情对齐, 只有在小游戏里需要时醒着」). In 卷一 she sleeps in 吴婆婆's 木牌 from
// 00-xiuxian (out the 火锅 night, wm-laoyin → wm-jiaxin); a task or 传闻 game that declares
// `needs: "her"` is offered from the 木牌, and its round holds her out (rules/hergame.mjs): the rules
// answer it (companion.mjs herAwake), the engine's presence flag follows (fitPresence →
// `companion.awake`), and when the round ends she is back in the 木牌.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent, lint } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo, VERBS } from '../scripts/rules.mjs';
import { bookAsleep, fitPresence, herAwake, HER_GAME_TTL_MS } from '../scripts/rules/companion.mjs';
import { needsHer, pageHerGame } from '../scripts/rules/hergame.mjs';
import { herMode } from '../scripts/hersay.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const ROOT = path.resolve(import.meta.dirname, '..');
const START = new Date('2026-10-15T09:00:00+08:00');
/* 卷一, past the 秘境 story (古六's door) and well past 00-xiuxian, where the 木牌 holds her. */
const PLAYED = playTo(content, newState(content, 'zh', START), 'wm-qianye', { now: START });
const NIGHT = (() => { const d = new Date(PLAYED.now); d.setDate(d.getDate() + 1); d.setHours(22, 0, 0, 0); return d; })();
const at = (now) => ({ now, quests: [] });
const kaoRow = (s, now) => look(s, content, at(now)).tasks?.find((t) => t.id === 'benwang-kao') ?? null;
const hold = (s, task, now = NIGHT) => fitPresence(content, pageHerGame(content, s, { hold: 1, task }, now).keep, now);

test('卷一 by the book: asleep in the 木牌 — the save, the presence flag, Look, her chip', () => {
  const s = fitPresence(content, structuredClone(PLAYED.state), NIGHT);
  // Asleep she is still `here` — the engine's flag (SKILL.md absent_until): she speaks half asleep (Hanli 2026-10-27:
  // 「yinyue睡着也可以说话」); `awake` stays the page's, for her body on the stage and the games she plays in.
  assert.deepEqual(Object.keys(s.companion).sort(), ['asleep', 'here', 'joined']);
  assert.equal(herAwake(s, NIGHT), false);
  const l = look(s, content, at(NIGHT));
  assert.equal(l.companion.asleep, true);
  assert.equal(herMode(l), 'asleep', 'her chip: 木牌 · 睡着');
  // free play on the map: no scene, the book still has her asleep
  const roam = fitPresence(content, { ...s, scene: null, place: 'shanmen' }, NIGHT);
  assert.equal(roam.companion.asleep, true);
  assert.equal(roam.companion.awake, undefined);
});

test('the games that need her are declared, and offered from the 木牌', () => {
  for (const id of ['jiaxin-letter', 'benwang-kao', 'qiyu-drawguess']) assert.equal(needsHer(content, PLAYED.state, id), true, id);
  assert.equal(needsHer(content, PLAYED.state, 'arcade:drawguess'), true, 'the 游戏厅\'s 画猜, a game her tasks play');
  assert.equal(needsHer(content, PLAYED.state, 'arcade:huarong'), false);
  assert.deepEqual(lint(content), []);
  // 本王考考你 at night, she asleep: offered, its Look row says it needs her
  const row = kaoRow(PLAYED.state, NIGHT);
  assert.ok(row, '本王考考你 offered from the 木牌');
  assert.equal(row.her, true);
  assert.equal(VERBS.kao(PLAYED.state, content, at(NIGHT), { action: 'open' }).result.ok, true, 'a round may begin');
});

test('a round of a game that needs her wakes her; its end puts her back', () => {
  const s = structuredClone(PLAYED.state);
  const out = hold(s, 'benwang-kao');
  assert.equal(out.her_game.task, 'benwang-kao');
  assert.equal(herAwake(out, NIGHT), true);
  assert.equal(out.companion.awake, true, 'the engine reads her present for the look');
  assert.equal(out.companion.asleep, true, 'the book\'s sleep is kept underneath');
  const l = look(out, content, at(NIGHT));
  assert.equal(l.companion.asleep, undefined);
  assert.equal(l.companion.out_for, 'benwang-kao');
  assert.equal(herMode(l), 'awake');
  const back = fitPresence(content, pageHerGame(content, out, { hold: 0, task: 'benwang-kao' }, NIGHT).keep, NIGHT);
  assert.equal(back.her_game, undefined);
  assert.equal(back.companion.awake, undefined);
  assert.equal(herMode(look(back, content, at(NIGHT))), 'asleep', 'back in the 木牌');
  // a hold the page never ended lapses
  const later = new Date(NIGHT.getTime() + HER_GAME_TTL_MS + 1000);
  assert.equal(fitPresence(content, out, later).companion.awake, undefined);
});

test('only a game that needs her, and only her own line', () => {
  const s = structuredClone(PLAYED.state);
  assert.equal(pageHerGame(content, s, { hold: 1, task: 'kouzi-crowd' }, NIGHT).result.refused, 'not-hers');
  const unmet = { ...s, companion: undefined };
  assert.equal(pageHerGame(content, unmet, { hold: 1, task: 'benwang-kao' }, NIGHT).result.refused, 'no-host');
});

test('the 火锅 night is the book\'s own wake: wm-laoyin `final` wakes her, wm-jiaxin `rest` puts her back', () => {
  const to = (target) => playTo(content, newState(content, 'zh', START), target, { now: START }).state;
  assert.equal(to('wm-laoyin').companion.asleep, true);
  const night = to('wm-jiaxin');
  assert.ok(night.companion.joined && !night.companion.asleep, 'out for the 火锅 and the letter');
  assert.equal(to('wm-baishi').companion.asleep, true);
});

test('a save written awake through 卷一 by the morning\'s rule (504b73fc) goes back to the 木牌 as it is read', () => {
  for (const f of ['waimen.json', 'zhuji-cliff.json', 'mijing-kunzhen.json', 'ji-altar.json']) {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/saves', f), 'utf8'));
    assert.equal(bookAsleep(content, s), true, f);
    const woken = { ...s, companion: { joined: s.companion.joined, awake: true } };
    const fitted = fitPresence(content, woken);
    assert.equal(fitted.companion.asleep, true, f);
    assert.equal(fitted.companion.awake, undefined, f);
    assert.equal(fitPresence(content, fitted), fitted, `${f}: fitted once`);
  }
  // before the 木牌 the book has no word: a save found before prologue-v3 (the bell at 结丹) stays awake
  assert.equal(bookAsleep(content, { done_scenes: [] }), null);
});

test('the command line: `hergame --hold=1` writes her into the chat, `--hold=0` back out', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-awake-'));
  try {
    const file = path.join(data, 'state.json');
    fs.writeFileSync(file, JSON.stringify(PLAYED.state));
    const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], {
      cwd: ROOT, encoding: 'utf8',
      env: { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NIGHT.toISOString() },
    }).stdout);
    const saved = () => JSON.parse(fs.readFileSync(file, 'utf8')).companion;
    const on = cli('hergame', '--hold=1', '--task=arcade:drawguess');
    assert.deepEqual([on.ok, on.awake, on.asleep], [true, true, false]);
    assert.equal(saved().awake, true, 'present for the engine');
    const off = cli('hergame', '--hold=0', '--task=arcade:drawguess');
    assert.deepEqual([off.ok, off.awake, off.asleep], [true, false, true]);
    assert.equal(saved().awake, undefined, 'in the 木牌');
    assert.equal(saved().asleep, true);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});
