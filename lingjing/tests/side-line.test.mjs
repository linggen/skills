// A scene on a line beside the book's own (Hanli, 2026-10-05, 「都按你说的」):
// a 今 interlude is 沈芒's world — no 灵气, no 银月 (DESIGN § 四·六). Read off
// the scene's 回 (book.json `line`), never an id:
// 1. the page keeps the 古's furniture off — realm, 修为, 灵石, 体力, the roads,
//    事, 袋, the tray — and keeps the 回 and place, the box, the game, the
//    language, the 九鼎录 and the book; back on the 古, all of it returns;
// 2. 银月 is away: the engine's presence flag drops, the page tells her
//    nothing, and her read of the game says only that she is not there;
// 3. 目前任务 is never left empty in a scene: the scene's own written words.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent, lint } from '../scripts/content.mjs';
import { newState, pick } from '../scripts/state.mjs';
import { look, progress, resolve } from '../scripts/rules.mjs';
import { fitPresence, herAway } from '../scripts/rules/companion.mjs';
import { firstSentence, taskLine } from '../scripts/rules/recap.mjs';
import { FURNITURE, herAwake, sideLineOf, stageCards, stands } from '../scripts/stage.mjs';

const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00');
const ctx = { now: NOW, quests: [] };
const ROOT = path.resolve(import.meta.dirname, '..');
const scene = id => Object.values(content.chapters).map(ch => ch.scenes[id]).find(Boolean);
const gameTitle = (id, lang) => pick(content.tasks.tasks.find(t => t.id === id).title, lang);

/* 古二's last scene, 银月 found and awake (not in the token): the next step is 今 · 一. */
const beforeJin = () => ({ ...newState(content, 'zh', NOW), chapter: '00-prologue', scene: '00-notice', place: 'shiao', done_scenes: ['00-uncle'], companion: { joined: '2026-10-01', awake: true } });
const inJin = () => resolve(beforeJin(), content, ctx, { exit: 'go' }).state;

test('the 今 stage keeps none of the 古\'s furniture; the 古 stage keeps all of it', () => {
  const s = inJin();
  assert.equal(s.scene, 'j01-track');
  const l = look(s, content, ctx);
  assert.equal(sideLineOf(l), 'jin');
  for (const part of FURNITURE.main) assert.equal(stands(l, part), false, `${part} is the 古's`);
  for (const part of FURNITURE.every) assert.equal(stands(l, part), true, `${part} stands on every line`);
  // The stage holds the scene alone: no goal line, no coins, no errand, no beast.
  const kinds = stageCards({ ...l, waypoint: { goal: '外门大比' }, offers: [{ id: 'x' }], place: { ...l.place, encounter: { game: { id: 'haunt:x' }, creature: { id: 'x' } } } }).map(c => c.card);
  assert.ok(kinds.every(k => ['meet', 'panel', 'people', 'value', 'born', 'closed', 'board'].includes(k)), kinds.join());
  // Its game is the only board: the 古's practice open at the place stays off.
  const retest = look({ ...s, scene: 'j01-retest', tasks: { ...s.tasks, 'jin-qianmi': { status: 'offered' } } }, content, ctx);
  assert.deepEqual(retest.scene.games, ['jin-qianmi']);
  const boards = stageCards({ ...retest, tasks: [...retest.tasks, { id: 'gu-board', kind: 'board', status: 'offered' }] }).filter(c => c.card === 'board').map(c => c.id);
  assert.deepEqual(boards, ['jin-qianmi']);
  // Back on the 古 (古三's gate): every part stands again.
  const gate = look({ ...s, scene: '00-gate', place: 'shanmen' }, content, ctx);
  assert.equal(sideLineOf(gate), null);
  for (const part of [...FURNITURE.main, ...FURNITURE.every]) assert.equal(stands(gate, part), true, part);
});

test('the page reads the furniture table for the strip, the footer and the tray', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  for (const part of ['name', 'realm', 'pool', 'wealth', 'omen', 'festival', 'weather', 'lu', 'read']) assert.match(src, new RegExp(`has\\('${part}'\\)`), part);
  for (const part of ['roads', 'errands', 'bag', 'tray']) assert.match(src, new RegExp(`stands\\(look, '${part}'\\)`), part);
  assert.match(src, /const herHere = \(\) => Boolean\([^)]*!look\?\.companion\?\.away\)/, 'away, nothing goes to her');
});

test('银月 is away on the 今: the presence flag drops, her read says only that, and she comes back on the 古', () => {
  const s = inJin();
  assert.match(herAway(content, s), /今线.*保持沉默/);
  assert.match(herAway(content, { ...s, lang: 'en' }), /not in this world.*silent/i);
  const fitted = fitPresence(content, s);
  assert.equal(fitted.companion.awake, undefined, 'the engine reads companion.awake: unset, she is absent');
  assert.equal(fitted.companion.away, true);
  assert.equal(fitPresence(content, fitted), fitted, 'fitted once, the same object');
  const l = look(fitted, content, ctx);
  assert.equal(l.companion.away, herAway(content, s));
  assert.equal(herAwake(l), false, 'no coins, no her on the page');
  assert.deepEqual(Object.keys(progress(fitted, content, ctx).result), ['ok', 'away'], 'her read of the game: only that she is not there');
  // Back on the 古: awake again, and her read is the game's.
  const back = fitPresence(content, { ...fitted, scene: '00-gate', place: 'shanmen' });
  assert.deepEqual([back.companion.awake, back.companion.away], [true, undefined]);
  assert.equal(herAway(content, back), null);
  assert.ok(progress(back, content, ctx).result.stamina);
  // Asleep in the token she stays asleep, on either line.
  const asleep = fitPresence(content, { ...s, companion: { joined: '2026-10-01', asleep: true } });
  assert.deepEqual(asleep.companion, { joined: '2026-10-01', asleep: true });
  assert.deepEqual(lint(content), []);
});

test('the command line: the move into the 今 writes her absent, the move out writes her back', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-side-'));
  try {
    const file = path.join(data, 'state.json');
    fs.writeFileSync(file, JSON.stringify(beforeJin()));
    const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], {
      cwd: ROOT, encoding: 'utf8',
      env: { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() },
    }).stdout);
    const saved = () => JSON.parse(fs.readFileSync(file, 'utf8')).companion;
    cli('resolve', '--exit=go');
    assert.deepEqual([saved().awake, saved().away], [undefined, true], 'into 今 · 一: absent');
    const lines = () => fs.readFileSync(path.join(data, 'log.jsonl'), 'utf8').trim().split('\n').length;
    const logged = lines();
    assert.ok(cli('look').companion.away);
    assert.equal(lines(), logged, 'a Look in the 今 writes nothing more');
    assert.ok(cli('progress', '--for=yinyue').away);
    cli('go', '--scene=00-gate');
    assert.deepEqual([saved().awake, saved().away], [true, undefined], 'back on the 古: present');
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('SKILL.md: what she reads of Look carries `companion.away`, and her place text says to keep silent', () => {
  const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  const lookRead = md.match(/name: Look[\s\S]*?others_read: \[([^\]]*)\]/)[1];
  assert.ok(lookRead.split(',').map(x => x.trim()).includes('companion.away'), lookRead);
  const place = md.match(/place:\n {2}yinyue:[\s\S]*?absent_until/)[0];
  assert.match(place, /companion\.away/);
  assert.match(place, /SILENT/);
});

test('目前任务 in a scene is the scene\'s own written words — its game, else its setup\'s first sentence; zh and en', () => {
  const s = inJin();
  const track = scene('j01-track');
  assert.equal(taskLine(content, s, ctx), `目前任务：${firstSentence(track.setup.zh)}`);
  assert.equal(taskLine(content, s, ctx), '目前任务：入学第十二天，体测一千米。');
  assert.equal(taskLine(content, { ...s, lang: 'en' }, ctx), `Now: ${firstSentence(track.setup.en)}`);
  assert.equal(taskLine(content, { ...s, lang: 'en' }, ctx), 'Now: Twelfth day of term, the 1000-metre fitness test.');
  // A scene that offers a game: the game, by its title — until it is played.
  const retest = { ...s, scene: 'j01-retest' };
  assert.equal(taskLine(content, retest, ctx), `目前任务：${gameTitle('jin-qianmi', 'zh')}`);
  assert.equal(taskLine(content, { ...retest, lang: 'en' }, ctx), `Now: ${gameTitle('jin-qianmi', 'en')}`);
  const played = { ...retest, tasks: { ...retest.tasks, 'jin-qianmi': { status: 'done' } } };
  assert.equal(taskLine(content, played, ctx), `目前任务：${firstSentence(scene('j01-retest').setup.zh)}`);
  // A 古 scene with nothing in hand is told the same way; a quote is never cut.
  assert.equal(firstSentence('出村时，吴婆婆把一块木牌塞给你：「到了碑那儿，看看碑背面。」前山满地狗爪印。后半句。'), '出村时，吴婆婆把一块木牌塞给你：「到了碑那儿，看看碑背面。」前山满地狗爪印。');
  assert.equal(firstSentence('Eggs at 1.20 yuan each. Then more.'), 'Eggs at 1.20 yuan each.');
});
