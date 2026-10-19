// 画猜 in the story (Hanli 10-19: 「ai游戏放到游戏中吧, 还挺好玩的. 但要结合剧情」, 「秘境里也放一个.
// AI猜都是Yinyue猜」, 「秘境里可以有随机游戏」, 「AI猜画可以多放几个地方」). The guesser is always 银月,
// and only where she is: 第六回's 家信 (娘 cannot read: a picture beside each line), 本王考考你 on a
// night she is awake (after 入门, a capped few), a 秘境 rerun's 奇遇 (a room may roll one small game
// from a pool), and a 今日传闻 step (never while she sleeps — the rules', not a prompt's).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { look, playTo, rerun, tale, task, win, VERBS } from '../scripts/rules.mjs';
import { letterGrade, matches, normalize, roundsOf, stubReply } from '../scripts/games/drawguess-rules.js';
import { kaoWords, nightKey } from '../scripts/rules/kao.mjs';
import { rollQiyu } from '../scripts/rules/qiyu.mjs';
import { draw } from '../scripts/rules/rerun.mjs';
import { stageCards } from '../scripts/stage.mjs';
import { everyJuan } from './prologue.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const reg = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
const DATA = reg.games.find((g) => g.id === 'drawguess').data;
const taskOf = (id) => content.tasks.tasks.find((t) => t.id === id);
const at = (now) => ({ now, quests: [] });
const awake = (s) => ({ ...s, companion: { ...(s.companion ?? {}), joined: true, asleep: false } });
const asleep = (s) => ({ ...s, companion: { ...(s.companion ?? {}), joined: true, asleep: true } });

/* Every word list: each word with its English, no spelling shared by two words of one list. */
test('the word lists: the 家信\'s lines, 本王考考你\'s met things, the 秘境\'s — each with its English and its own spellings', () => {
  for (const [name, list] of [['met', DATA.met], ['mijing', DATA.mijing]]) {
    const seen = new Map();
    for (const w of list) {
      assert.ok(w.zh && w.en, `${name}: ${w.zh}`);
      for (const s of [w.zh, ...(w.also ?? []), w.en, ...(w.enAlso ?? [])].map(normalize)) {
        assert.ok(!seen.has(s) || seen.get(s) === w.zh, `${name}: ${s} in ${seen.get(s)} and ${w.zh}`);
        seen.set(s, w.zh);
      }
    }
  }
  for (const w of DATA.met) {
    if (w.after) assert.ok(Object.values(content.chapters).some((c) => c.scenes?.[w.after]), `${w.zh}: after ${w.after} is a scene`);
    if (w.cast) assert.ok(content.creatures.creatures.some((c) => c.id === w.cast), `${w.zh}: cast ${w.cast}`);
  }
});

test('第六回\'s 家信: the board is drawn for 娘, 银月 reads it; the lines are the book\'s own, the passage untouched', () => {
  const t = taskOf('jiaxin-letter');
  assert.equal(t.game, 'drawguess');
  assert.equal(t.period, 'once', 'old saves past it keep it done');
  assert.equal(t.deal.who, 'yinyue');
  assert.equal(t.deal.fixed, true);
  assert.equal(t.deal.fallback, true, 'never stuck on a model: 就写字吧');
  assert.equal(t.ledger[0].who, 'sunergou', '孙二狗\'s 恩仇簿 line kept');
  const rounds = roundsOf(DATA.sets.jiaxin, DATA.words);
  assert.deepEqual(rounds.map((r) => r.word.zh), ['盆', '弓', '月亮']);
  const scene = content.chapters['00-waimen'].scenes['wm-jiaxin'];
  const book = scene.exits.find((e) => e.id === 'rest').story_full.zh;
  for (const r of rounds) assert.ok(book.includes(r.line.zh.replace(/。$/, '')), `「${r.line.zh}」 is the book's`);
  assert.match(scene.story_full.zh, /银月钻了出来，蹲在锅沿上/, 'she is out that night (the 火锅)');
  assert.deepEqual([3, 2, 0].map((n) => letterGrade(n, 3)), ['all', 'some', 'none']);
  for (const g of ['all', 'some', 'none', 'written']) assert.ok(Object.hasOwn(t.ranks, g) && Object.hasOwn(t.marks, g), g);
  // The 游戏厅 keeps the old 写信 board; the story's row is drawguess at wm-jiaxin.
  assert.ok(reg.games.some((g) => g.id === 'letter' && !g.scene && !g.task));
  assert.ok(reg.games.some((g) => g.id === 'drawguess' && g.scene === 'wm-jiaxin' && g.task === 'jiaxin-letter' && g.mechanic === '你画我猜'));
});

test('the scratch seam: a stub that misses once, then names the word — no model, no call', () => {
  const pen = DATA.words.find((w) => w.zh === '盆');
  assert.match(stubReply(pen, 1), /猜：石头/);
  assert.match(stubReply(pen, 2), /猜：盆/);
  assert.equal(matches('石头', pen), false);
  const src = fs.readFileSync(new URL('../scripts/games/drawguess.js', import.meta.url), 'utf8');
  assert.match(src, /data\.seam === 'stub'/);
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /if \(SCRATCH\) deal\.seam = HER_SEAM === 'stub' \? 'stub' : 'off';/, 'a 测试存档 never calls her');
});

/* ── 今日传闻 ── */
const TALE_NOW = new Date('2026-09-11T12:00:00');
const tc = (extra = {}) => ({ now: TALE_NOW, quests: [], ...extra });
const juan = everyJuan(loadContent());
function taleOpen() {
  const s = newState(juan, 'zh', TALE_NOW);
  return { ...s, name: '青玄', step: 1, traits: ['water', 'wood'], scene: null, ended: ['00-prologue'], place: 'sishui', cast: [] };
}
const drawTale = (word) => {
  const t = structuredClone(juan.tale.example.zh);
  t.steps[0] = { game: 'drawguess', at: 'sishui', giver: 'old-fisher', line: '哑巴老汉只会比划，画下来叫银月认。', clue: '他看见的是一盏灯。', ...(word ? { word } : {}) };
  return t;
};

test('今日传闻: 你画我猜 is Ling\'s to pick once 银月 is met — from the 木牌 too (its round wakes her, 2026-10-19) — the seed and the lint, not a prompt', () => {
  const seedOf = (s) => tale(s, juan, tc(), { action: 'seed' }).result.shape.games.map((g) => g.id);
  assert.ok(!seedOf(taleOpen()).includes('drawguess'), 'not met: not in the seed');
  assert.ok(seedOf(asleep(taleOpen())).includes('drawguess'), 'asleep in the 木牌: in the seed — the round wakes her');
  const up = tale(awake(taleOpen()), juan, tc(), { action: 'seed' }).result.shape.games.find((g) => g.id === 'drawguess');
  assert.ok(up && up.frames.length === 3 && up.words.includes('灯'), 'awake: in the seed, with its frames and words');
  const refused = tale(taleOpen(), juan, tc(), { action: 'make', tale: JSON.stringify(drawTale()) }).result;
  assert.equal(refused.refused, 'not-playable');
  assert.ok(refused.problems.some((p) => /steps\[0\]\.game.*Yinyue/.test(p)), JSON.stringify(refused.problems));
  const bad = tale(awake(taleOpen()), juan, tc(), { action: 'make', tale: JSON.stringify(drawTale('飞机')) }).result;
  assert.ok(bad.problems.some((p) => /steps\[0\]\.word/.test(p)), 'a word not in the list');
  const made = tale(awake(taleOpen()), juan, tc(), { action: 'make', tale: JSON.stringify(drawTale('灯')) });
  assert.equal(made.result.ok, true, JSON.stringify(made.result));
  const step = look(made.state, juan, tc()).tale.step;
  assert.equal(step.board.page, 'drawguess');
  assert.equal(step.board.deal.who, 'yinyue');
  assert.equal(step.board.deal.word.zh, '灯', 'Ling\'s word is the thing drawn');
});

/* ── 本王考考你 and the 秘境's 奇遇: a save past the 秘境 story (古六's door) ── */
const PLAYED = (() => {
  const start = new Date('2026-10-15T09:00:00+08:00');
  const out = playTo(content, newState(content, 'zh', start), 'wm-qianye', { now: start });
  return { state: out.state, now: out.now };
})();
const past = () => awake(structuredClone(PLAYED.state));
const night = () => { const d = new Date(PLAYED.now); d.setDate(d.getDate() + 1); d.setHours(22, 0, 0, 0); return d; };
const noon = () => { const d = night(); d.setHours(13); return d; };
const kaoRow = (s, now) => look(s, content, at(now)).tasks?.find((t) => t.id === 'benwang-kao') ?? null;
const ok = (out) => { assert.equal(out.result.ok, true, JSON.stringify(out.result)); return out.state ?? null; };

test('本王考考你: offered on a night she is beside him, after 入门 — from the 木牌 too (its round wakes her) — not by day', () => {
  const s = past();
  assert.ok(kaoRow(s, night()), 'a night, awake');
  assert.equal(kaoRow(s, noon()), null, 'by day: no');
  assert.ok(kaoRow(asleep(s), night())?.her, 'asleep in the 木牌: offered, a game that needs her');
  const row = kaoRow(s, night());
  assert.equal(row.light, true, 'a light offer');
  assert.equal(row.deal.who, 'yinyue');
  assert.deepEqual(row.deal.begin, { verb: 'kao', action: 'open' });
  assert.equal(nightKey(new Date(2026, 9, 17, 2)), nightKey(new Date(2026, 9, 16, 22)), 'after midnight is the same night');
  const words = kaoWords(content, s).map((w) => w.zh);
  assert.ok(words.includes('饼') && words.includes('饭桶'), words.join(' '));
  assert.ok(!words.includes('鯥'), 'not met yet: not a word');
});

test('本王考考你: each round counted as it begins, three a night; a word\'s first clear pays by its looks, once', () => {
  const now = night(), K = 'benwang-kao';
  let s = past();
  const w0 = s.wealth;
  const o1 = VERBS.kao(s, content, at(now), { action: 'open' });
  s = ok(o1);
  const first = o1.result.word.zh;
  assert.ok(kaoWords(content, s).some((w) => w.zh === first));
  s = ok(win(s, content, at(now), { id: K, stars: 3 }));
  const paid = task(s, content, at(now), { action: 'done', id: K });
  s = ok(paid);
  assert.equal(paid.result.first, true);
  assert.equal(s.wealth - w0, content.balance.boards.best, 'one look: best');
  // Two more rounds (one lost, never won) and the night is spent.
  s = ok(VERBS.kao(s, content, at(now), { action: 'open' }));
  assert.ok(kaoRow(s, now)?.open, 'a round under way stands');
  s = ok(VERBS.kao(s, content, at(now), { action: 'open' }));
  assert.ok(kaoRow(s, now), 'the third, open, still stands');
  const capped = VERBS.kao(s, content, at(now), { action: 'open' }).result;
  assert.equal(capped.refused, 'cap');
  assert.notEqual(s.kao.drawn[1], first, 'never the same word twice a night');
  // The next night: the first word cleared pays nothing again.
  const next = new Date(now.getTime() + 864e5);
  let t = { ...s, kao_cleared: [first] };
  t = ok(VERBS.kao(t, content, at(next), { action: 'open' }));
  assert.notEqual(t.kao.open.word, first, 'a word never cleared first');
  const t0 = t.wealth;
  t = { ...t, kao: { ...t.kao, open: { ...t.kao.open, word: first } } };
  t = ok(win(t, content, at(next), { id: K, stars: 3 }));
  const again = task(t, content, at(next), { action: 'done', id: K });
  assert.equal(again.result.first, false);
  assert.equal(again.state.wealth, t0, 'a word cleared before pays nothing');
});

const RERUN = Object.values(content.chapters).flatMap((c) => c.beats ?? []).find((b) => b.sealed?.rerun);
const openAt = () => new Date(new Date(PLAYED.state.reruns[RERUN.id].ended_at).getTime() + RERUN.sealed.rerun.every_h * 3600000);
const atDoor = (s = past(), now = openAt()) => ({ ...s, place: RERUN.sealed.rerun.door, stamina: 100, stamina_at: now.toISOString() });

test('奇遇: a room rolls one small game from the pool — about one in three, never the same twice running, 你画我猜 once she is met (the 木牌 too)', () => {
  const rooms = RERUN.sealed.rerun.rooms, s = past(), seen = new Map();
  let hits = 0, all = 0;
  for (let n = 0; n < 400; n += 1) {
    const q = rollQiyu(content, s, { rerunId: RERUN.id, rooms, seed: `t|${n}`, draw });
    all += rooms.length; hits += Object.keys(q).length;
    const games = rooms.map((r) => q[r]?.task).filter(Boolean);
    games.forEach((g, i) => { assert.notEqual(g, games[i - 1]); seen.set(g, (seen.get(g) ?? 0) + 1); });
  }
  assert.ok(hits / all > 0.22 && hits / all < 0.38, `one room in three or four (${(hits / all).toFixed(2)})`);
  for (const id of ['qiyu-drawguess', 'qiyu-rope', 'qiyu-huarong', 'qiyu-qiqiao', 'qiyu-wuziqi']) assert.ok(seen.get(id) > 0, id);
  assert.ok(!seen.has('qiyu-luoshu'), '洛书 retired from the pool (10-19): never drawn');
  const unmet = { ...s, companion: undefined };
  let slept = 0;
  for (let n = 0; n < 200; n += 1) {
    const q = rollQiyu(content, unmet, { rerunId: RERUN.id, rooms, seed: `t|${n}`, draw });
    assert.ok(!Object.values(q).some((x) => x.task === 'qiyu-drawguess'), 'not met: no drawing');
    slept += Object.values(rollQiyu(content, asleep(s), { rerunId: RERUN.id, rooms, seed: `t|${n}`, draw })).filter((x) => x.task === 'qiyu-drawguess').length;
  }
  assert.ok(slept > 0, 'in the 木牌: a drawing may roll — its round wakes her');
  const last = { ...s, reruns: { ...s.reruns, [RERUN.id]: { ...s.reruns[RERUN.id], qiyu_last: 'qiyu-huarong' } } };
  for (let n = 0; n < 200; n += 1) {
    const q = rollQiyu(content, last, { rerunId: RERUN.id, rooms, seed: `t|${n}`, draw });
    const firstRoom = rooms.map((r) => q[r]).find(Boolean);
    assert.notEqual(firstRoom?.task, 'qiyu-huarong', 'not the game the last run ended on');
  }
});

test('奇遇: forced on a 测试存档, it stands in the run\'s first room with its frame; won, it pays a find and its first clear\'s 灵石 once', () => {
  const now = openAt();
  const prev = process.env.LINGJING_SAVE;
  process.env.LINGJING_SAVE = 'cc-qiyu-test';
  let s;
  try {
    s = ok(rerun(atDoor(), content, at(now), { action: 'enter', qiyu: 'qiyu-drawguess' }));
  } finally {
    if (prev == null) delete process.env.LINGJING_SAVE; else process.env.LINGJING_SAVE = prev;
  }
  const room = RERUN.sealed.rerun.rooms[0];
  assert.equal(s.place, room);
  assert.equal(s.rerun.rooms[room].qiyu.task, 'qiyu-drawguess');
  const row = look(s, content, at(now)).tasks.find((t) => t.id === 'qiyu-drawguess');
  assert.ok(row, 'the board stands in the run (sealed mode keeps it)');
  assert.ok(row.how && row.deal.word?.zh && row.deal.who === 'yinyue', JSON.stringify(row));
  const w0 = s.wealth;
  s = ok(win(s, content, at(now), { id: 'qiyu-drawguess', stars: 2, grade: 'look2' }));
  const done = task(s, content, at(now), { action: 'done', id: 'qiyu-drawguess' });
  s = ok(done);
  assert.ok(done.result.found.length === 1 && done.result.found[0].got >= 1, 'a find of the run\'s');
  assert.equal(s.wealth - w0, content.balance.boards.good, 'its first clear: two looks, good');
  assert.equal(s.rerun.rooms[room].qiyu.done, true);
  assert.ok(!look(s, content, at(now)).tasks.some((t) => t.id === 'qiyu-drawguess'), 'done: no longer offered');
  assert.equal(task(s, content, at(now), { action: 'done', id: 'qiyu-drawguess' }).result.ok, false);
});

test('the stage: 本王考考你 stands only on an empty stage (as 二十问), or while a round is under way', () => {
  const s = past(), now = night();
  const lk = look(s, content, at(now));
  const cards = stageCards(lk);
  const kao = cards.some((c) => c.card === 'board' && c.id === 'benwang-kao');
  assert.equal(kao, cards.some((c) => c.card === 'hexagram'), 'with the coins, and only then');
  const busy = { ...lk, scene: { ...(lk.scene ?? {}), panel: true } };
  assert.ok(!stageCards(busy).some((c) => c.card === 'board' && c.id === 'benwang-kao'), 'a scene\'s business first');
  const under = { ...busy, tasks: lk.tasks.map((t) => (t.id === 'benwang-kao' ? { ...t, open: true } : t)) };
  if (lk.tasks.some((t) => t.id === 'benwang-kao')) assert.ok(stageCards(under).some((c) => c.card === 'board' && c.id === 'benwang-kao'), 'a round under way stands');
});

test('her presence at the 家信: asleep in the 木牌 through the 观, out that one night (wm-laoyin `final` wakes, wm-jiaxin `rest` sleeps)', () => {
  const start = new Date('2026-10-15T09:00:00+08:00');
  const at = (target) => playTo(content, newState(content, 'zh', start), target, { now: start }).state;
  assert.equal(at('wm-laoyin').companion.asleep, true, 'asleep before the final');
  const night = at('wm-jiaxin');
  assert.ok(night.companion.joined && !night.companion.asleep, 'out for the 火锅 and the letter');
  assert.equal(at('wm-baishi').companion.asleep, true, 'back in the 木牌 after');
});
