// 银月 awake through 卷一 (Hanli, 2026-10-19: 「小游戏的时候, 可以让Yinyue醒过来. Yinyue随时可以醒过来,
// 走剧情的时候再回到木牌里就好了」). Once met she is awake by default — the small games, free play, the
// map, the 秘境, the nights, the chat — and in 吴婆婆's 木牌 only while a passage of the story holds
// the stage: the page's `reading` hold (rules/reading.mjs), the one that holds Ling's hands too. The
// rules answer it (companion.mjs herAwake), the engine's presence flag follows it (fitPresence →
// `companion.awake`), and the page's voice waits it out (voice.js `telling`).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo, VERBS } from '../scripts/rules.mjs';
import { fitPresence, herAwake, sleepSpan } from '../scripts/rules/companion.mjs';
import { pageReading, READING_TTL_MS } from '../scripts/rules/reading.mjs';
import { rollQiyu } from '../scripts/rules/qiyu.mjs';
import { draw } from '../scripts/rules/rerun.mjs';
import { herMode } from '../scripts/hersay.js';
import { createVoice } from '../scripts/voice.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const ROOT = path.resolve(import.meta.dirname, '..');
const START = new Date('2026-10-15T09:00:00+08:00');
/* 卷一, past the 秘境 story (古六's door) and well past 00-xiuxian, where the 木牌 once held her for good. */
const PLAYED = playTo(content, newState(content, 'zh', START), 'wm-qianye', { now: START });
const NIGHT = (() => { const d = new Date(PLAYED.now); d.setDate(d.getDate() + 1); d.setHours(22, 0, 0, 0); return d; })();
const at = (now) => ({ now, quests: [] });
const kaoRow = (s, now) => look(s, content, at(now)).tasks?.find((t) => t.id === 'benwang-kao') ?? null;
const RERUN = Object.values(content.chapters).flatMap((c) => c.beats ?? []).find((b) => b.sealed?.rerun);
const qiyuGames = (s, n = 300) => {
  const out = new Set();
  for (let i = 0; i < n; i += 1) for (const q of Object.values(rollQiyu(content, s, { rerunId: RERUN.id, rooms: RERUN.sealed.rerun.rooms, seed: `aw|${i}`, draw }))) out.add(q.task);
  return out;
};
const telling = (s, now = new Date()) => ({ ...s, reading: { since: now.toISOString() } });

test('卷一, off the passages: awake — the save, the presence flag, Look, her mode', () => {
  const s = structuredClone(PLAYED.state);
  assert.ok(s.ended.length === 0 || !s.ended.includes('01-ji'), '卷一');
  assert.ok(s.companion.joined && !s.companion.asleep, JSON.stringify(s.companion));
  assert.equal(herAwake(s), true);
  assert.equal(fitPresence(content, s).companion.awake, true, 'the engine reads her present');
  const l = look(s, content, at(NIGHT));
  assert.equal(l.companion.asleep, undefined);
  assert.equal(l.companion.telling, undefined);
  assert.equal(herMode(l), 'awake');
});

test('awake in a small game, on the map, at night and in the 秘境 (no awake() forced: the save as played)', () => {
  const s = structuredClone(PLAYED.state);
  // her own small game, 二十问: on the stage and open to a tap
  assert.ok(look(s, content, at(NIGHT)).twenty, '二十问 offered');
  assert.notEqual(VERBS.twenty(s, content, at(NIGHT), { action: 'open' }).result.refused, 'no-host');
  // free play on the map: no scene, another place
  const roam = { ...s, scene: null, place: 'shanmen' };
  assert.equal(herAwake(roam), true);
  assert.equal(fitPresence(content, roam).companion.awake, true);
  // 本王考考你: a night beside him
  assert.ok(kaoRow(s, NIGHT), '本王考考你 at 22:00');
  // the 秘境's 奇遇: 你画我猜 may roll
  assert.ok(qiyuGames(s).has('qiyu-drawguess'), 'the 秘境 drawing');
});

test('while a passage reads she is in the 木牌: presence off, Look says so, her games wait', () => {
  const s = telling(structuredClone(PLAYED.state));
  assert.equal(herAwake(s), false);
  const fitted = fitPresence(content, s);
  assert.equal(fitted.companion.awake, undefined, 'the engine keeps her away (absent_until companion.awake)');
  assert.equal(fitted.companion.asleep, undefined, 'and nothing lasting is written: no `asleep`');
  const l = look(fitted, content, at(new Date()));
  assert.equal(l.companion.telling, true);
  assert.equal(herMode(l), 'asleep', 'her chip: 木牌 · 睡着');
  assert.equal(kaoRow(fitted, NIGHT), null, '本王考考你 waits');
  assert.ok(!qiyuGames(fitted, 120).has('qiyu-drawguess'), 'no drawing');
  // The page's own hold reads the same before the rules have answered.
  assert.equal(herMode(look(structuredClone(PLAYED.state), content, at(NIGHT)), { telling: true }), 'asleep');
});

test('when the passage ends she is awake again — ended by the page, or a hold nobody ended lapsing', () => {
  const now = new Date();
  const held = fitPresence(content, pageReading(structuredClone(PLAYED.state), { hold: 1 }, now).keep, now);
  assert.equal(held.companion.awake, undefined);
  const ended = fitPresence(content, pageReading(held, { hold: 0 }, now).keep, now);
  assert.equal(ended.reading, undefined);
  assert.equal(ended.companion.awake, true);
  const later = new Date(now.getTime() + READING_TTL_MS + 1000);
  assert.equal(fitPresence(content, held, later).companion.awake, true, 'a tab shut mid-passage: back on the next write');
});

test('the command line: `reading --hold=1` writes her out of the chat, `--hold=0` back in', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-awake-'));
  try {
    const file = path.join(data, 'state.json');
    fs.writeFileSync(file, JSON.stringify(PLAYED.state));
    const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], {
      cwd: ROOT, encoding: 'utf8',
      env: { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: new Date().toISOString() },
    }).stdout);
    const saved = () => JSON.parse(fs.readFileSync(file, 'utf8')).companion;
    cli('reading', '--hold=1');
    assert.equal(saved().awake, undefined, 'in the 木牌');
    assert.equal(cli('look').companion.telling, true);
    cli('reading', '--hold=0');
    assert.equal(saved().awake, true, 'awake again');
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('the book\'s own sleep stays: the faint at the deer, until she wakes that night — and only there', () => {
  assert.deepEqual([...sleepSpan(content)].sort(), ['00-dusk', '00-rent']);
  const faint = { ...structuredClone(PLAYED.state), chapter: '00-prologue', scene: '00-rent', companion: { joined: '2026-10-01', asleep: true } };
  assert.equal(fitPresence(content, faint).companion.asleep, true);
  assert.equal(herAwake(faint), false);
});

test('old saves load fine: `asleep` from the 木牌 through 卷一 wakes as the save is read', () => {
  for (const f of ['waimen.json', 'zhuji-cliff.json', 'mijing-kunzhen.json', 'ji-altar.json']) {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/saves', f), 'utf8'));
    assert.equal(s.companion.asleep, true, `${f} was saved asleep`);
    const fitted = fitPresence(content, s);
    assert.equal(fitted.companion.asleep, undefined, f);
    assert.equal(fitted.companion.awake, true, f);
    assert.equal(fitPresence(content, fitted), fitted, `${f}: fitted once`);
  }
});

test('the page\'s voice waits a passage out: every moment held (big ones too), said once it ends', () => {
  let t = 1_000_000;
  const posts = [];
  const seen = { fighting: false, present: true, telling: true };
  const v = createVoice({ now: () => t, post: (id) => { posts.push(id); return true; }, sees: () => seen });
  assert.equal(v.moment('scene_end', 'a scene passed').verdict, 'held', 'a story node mid-passage');
  assert.equal(v.moment('won', 'x').verdict, 'held');
  t += 10_000;
  assert.equal(v.tick(), null, 'nothing while the passage holds');
  assert.deepEqual(posts, []);
  seen.telling = false;
  t += 1000;
  assert.deepEqual(v.tick(), ['scene_end', 'won'], 'the story node reaches her after the reading');
  assert.deepEqual(posts, ['scene_end', 'won']);
  // A big one held over a passage goes whatever the budget: a line just heard does not hold it back.
  seen.telling = true;
  v.moment('chapter', 'a chapter ended');
  v.heard();
  seen.telling = false;
  t += 1000;
  assert.deepEqual(v.tick(), ['chapter']);
});
