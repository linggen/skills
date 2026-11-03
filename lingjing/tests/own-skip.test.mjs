// A board's own 跳过 is a skip (Hanli 11-03: 「修一下吧」 — the word boards' 跳过 and ropekit's ended as a 1-star win, so a
// 古 board paid on a skip). doc/design.md § Skip: a skip pays nothing — no grant, grade or mark; what the story needs is
// the task's `gives`, paid even on a skip; a skipped board comes back by itself later. And a word board told in the
// chat is held on its card, 原句 and 往下走, the way a win's last line is (board-deal.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { look, task, win } from '../scripts/rules.mjs';
import { replayDue, sceneBoards } from '../scripts/rules/skips.mjs';
import { sceneOf } from '../scripts/rules/world.mjs';
import { winIsSkip } from '../scripts/rules/tasks.mjs';
import { ownSkip } from '../scripts/stuck.js';
import { chainOutcome, guessOutcome, riddleOutcome } from '../scripts/games/jinchat-games.js';
import { skipped as inkSkipped } from '../scripts/games/ink.js';
import { catchTold, holdTold, toldHeld, toldInLook } from '../scripts/board-deal.js';
import { crawlRules } from './crawl.mjs';

const content = loadContent();
const DAY = 864e5;
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const crawl = crawlRules(content, { boards: 'skip' });
function at(key) {
  const got = crawl.states.get(key);
  assert.ok(got, `the crawl reached ${key}`);
  return { s: { ...got.s, skipped: [], stamina: 100, stamina_at: got.now.toISOString() }, now: got.now };
}
const ctxAt = (now) => ({ now, quests: [] });
const run = (fn, s, now, args) => fn(s, content, ctxAt(now), args);
const purse = (s) => [s.progress, s.step, s.wealth, s.tier, JSON.stringify(s.bag ?? {}), JSON.stringify(s.cards ?? [])];

test('every module\'s own 跳过 reads as a skip; a real end never does', () => {
  for (const o of [riddleOutcome({ solved: false }), chainOutcome({ done: false }), guessOutcome({}, { skipped: true }), inkSkipped({ live: true }),
    { won: true, stars: 0, skipped: true, note: 'skipped' }, { won: true, grade: 'skipped', skipped: true }]) assert.equal(ownSkip(o), true, JSON.stringify(o));
  for (const o of [riddleOutcome({ solved: true }), riddleOutcome({ solved: true, hints: 1 }), guessOutcome({ won: '狐狸' }), guessOutcome({}),
    { won: true, grade: 'clean', stars: 3 }, { won: false, left: true }, null]) assert.equal(ownSkip(o), false, JSON.stringify(o));
  assert.equal(winIsSkip({ grade: 'skipped' }), true);
  assert.equal(winIsSkip({ skipped: 'true' }), true);
  assert.equal(winIsSkip({ grade: 'stumped' }), false);
});

test('a skip sent as a win (讨饼债\'s 二十问, an older phone) pays nothing — no stars, grade or card — and comes back another day', () => {
  const { s, now } = at('00-prologue/00-yinyue');
  const id = 'yinyue-what';
  assert.equal(s.tasks?.[id]?.status ?? 'offered', 'offered', 'the board stands unplayed');
  const sent = run(win, s, now, { id, grade: 'skipped', stars: 1 });
  assert.equal(sent.result.ok, true, JSON.stringify(sent.result));
  assert.equal(sent.result.skipped, id, 'taken as the skip');
  assert.equal(sent.result.won, undefined, 'never a win');
  const left = sent.state;
  assert.equal(left.wins?.[id], undefined);
  assert.equal(left.stars?.[id], undefined, 'no stars');
  assert.equal(left.play_stars?.[id], undefined);
  assert.equal(left.grades?.[id], undefined, 'no grade');
  assert.ok(!(left.marks ?? []).includes('bing-debt'), 'no mark');
  assert.equal(left.tasks[id].skipped, true);
  // The phone then sends `task done`, as after any win: refused, nothing paid.
  const done = run(task, left, now, { action: 'done', id });
  assert.equal(done.result.ok, false);
  assert.deepEqual(purse(done.state ?? left), purse(s), 'nothing paid, sent as a win or after it');
  // Offered again on a later day, by itself.
  const idle = { ...left, tell_owed: [], told_scenes: [...(left.told_scenes ?? []), left.scene] };
  assert.equal(replayDue(content, idle, now), null, 'never the same day');
  assert.equal(replayDue(content, idle, new Date(now.getTime() + DAY))?.task, id, 'a later day: it comes back');
  // The control: played for real, the same board pays its grade and mark.
  const played = run(win, s, now, { id, grade: 'stumped', stars: 3 }).state;
  assert.equal(played.grades?.[id], 'stumped');
  assert.ok(played.marks.includes('bing-debt'));
  assert.equal(run(task, played, now, { action: 'done', id }).result.ok, true, 'a real win still pays');
});

test('a 古 board skipped by its own 跳过 hands over its `gives` only; won, it pays its grant besides (古九 · 看炉)', () => {
  const { s: arrived, now } = at('00-zhuji/09-dabi');
  const id = 'danfang-kanlu';
  const s = { ...arrived, tasks: { ...arrived.tasks }, step: Math.max(arrived.step ?? 0, 1) };
  const order = sceneBoards(sceneOf(content, s));
  assert.ok(order.includes(id), `09-dabi stands ${id}: ${order}`);
  for (const b of order.slice(0, order.indexOf(id))) s.tasks[b] = { status: 'done' };
  const r = run(win, s, now, { id, skipped: true, stars: 2 });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.deepEqual(r.result.gives, { bag: 'huangjing-10' }, 'what the story needs is handed over');
  assert.equal(r.result.paid, null, 'the reward is not');
  assert.deepEqual([r.state.progress, r.state.wealth], [s.progress, s.wealth], 'no 修为, no 灵石');
  assert.ok(JSON.stringify(r.state.bag ?? {}).includes('huangjing-10'), 'its gives in the bag');
  assert.equal(r.state.stars?.[id], undefined);
  const won = run(task, run(win, s, now, { id, stars: 2 }).state, now, { action: 'done', id });
  assert.equal(won.result.ok, true, JSON.stringify(won.result));
  assert.ok((won.result.paid?.progress ?? 0) > 0 || (won.result.paid?.wealth ?? 0) > 0, 'a real win still pays');
});

test('the page sends a board\'s own 跳过 as a skip, before any win; the phone\'s host says so; mount.js marks it', () => {
  const page = read('../scripts/lingjing.js');
  assert.match(page, /if \(r\.won && !g\.sent && ownSkip\(g\.state\)\) return boardSkipped\(g\);\n\s*if \(r\.won && !g\.sent\) \{ g\.sent = true;/, 'a tapped board');
  assert.match(page, /onWon: \(g\) => \{ if \(ownSkip\(g\.state\)\) return boardSkipped\(g\); g\.sent = true;/, 'a board in time');
  assert.match(page, /if \(ownSkip\(result\)\) return boardSkipped\(g\);\n\s*\/\/ A game that gives stars but no grade/, 'a mounted board');
  const fn = page.slice(page.indexOf('function boardSkipped('), page.indexOf('const toldUp ='));
  assert.doesNotMatch(fn, /onWin|write\('win'/, 'never a win');
  assert.match(fn, /if \(task\?\.leave && !task\.skip && !task\.replay\) return leaveGame\(id\);\n\s*return skipGame\(id\);/);
  assert.match(read('../scripts/games/phone/host.js'), /grade: skip \? 'skipped' : r\?\.grade \?\? null, left: Boolean\(r\?\.left\), skipped: skip,/);
  assert.match(read('../scripts/games/mount.js'), /ownSkip\(s\) \? \{ won: true, grade: 'skipped', skipped: true \}/);
});

test('a told word board is held on its card till he puts it away — from Look or the game\'s own end, first word kept', () => {
  const lk = { word_board: { kind: 'couplet', face: '冰冻三尺', told: true, answer: '梅花香自苦寒来', src: '警世贤文', task: 'dabi-final' } };
  const told = toldInLook(lk);
  assert.deepEqual(told, { task: 'dabi-final', kind: 'couplet', answer: '梅花香自苦寒来', src: '警世贤文' });
  assert.equal(toldInLook({ word_board: { ...lk.word_board, told: undefined } }), null, 'not told: nothing held');
  assert.equal(toldInLook({}), null);
  const g = { taskId: 'dabi-final' };
  assert.equal(toldHeld(g), false);
  assert.equal(catchTold(g, told), true);
  assert.equal(catchTold(g, { kind: 'couplet', answer: '别的' }), false, 'the first word stands');
  assert.equal(g.told.answer, '梅花香自苦寒来');
  assert.equal(toldHeld(g), true);
  // Look's next read has taken the played board off; the hold stands it again — once.
  const cards = [{ card: 'panel' }];
  assert.deepEqual(holdTold(cards, ['dabi-final']), [{ card: 'panel' }, { card: 'board', id: 'dabi-final' }]);
  assert.equal(holdTold([{ card: 'board', id: 'dabi-final' }], ['dabi-final']).length, 1);
  assert.equal(holdTold(cards, []), cards);
  g.toldDone = true;
  assert.equal(toldHeld(g), false, '往下走: put away');
  assert.equal(catchTold(null, told), false, 'no board on the stage: nothing to hold');
});

test('the page holds it: caught on the read after her turn and on the game\'s end; the passage waits; 往下走 takes the way on', () => {
  const page = read('../scripts/lingjing.js');
  assert.match(page, /catchTold\(boards\.get\(toldInLook\(look\)\?\.task\), toldInLook\(look\)\);\n\s*watchTell\(\);/, 'before anything reads it off');
  assert.match(page, /if \(result\?\.told\) \{ if \(catchTold\(g, result\)\) render\(\); return; \}/);
  assert.match(page, /watchAppear\(cards\);\n[^\n]*\n\s*cards = holdTold\(cards, toldUp\(\)\);/, 'after every filter');
  assert.match(page, /if \(!look\?\.tell_owed \|\| drawingTold \|\| toldUp\(\)\.length\) return;/, 'the box never beside it');
  const gone = page.slice(page.indexOf('function toldGone('), page.indexOf('async function onSkip('));
  assert.match(gone, /beats\.leave\(id\);/, 'its watch and the open game\'s record taken down');
  assert.match(gone, /winExit\(id, null, true\)/, 'the way on, as after a skip');
  assert.match(page, /\['\[data-told-on\]', \(el\) => toldGone\(el\.dataset\.toldOn\)\]/);
  const cards = read('../scripts/cards.js');
  assert.match(cards, /const told = ctx\.toldOf\?\.\(id\);\n\s*if \(told\) return toldCard\(/);
  assert.match(cards, /toldSaid: \{ couplet: '原句：\{a\}'/);
  assert.match(read('../scripts/rules/wordboard.mjs'), /\.\.\.\(b\.task \? \{ task: b\.task \} : \{\}\), rule: TOLD/, 'Look names the told board');
});
