// A 对话 board's word game while it is open (Hanli 2026-11-03, the 大比 final's 对子): 「红梅香自苦寒来是最终答案吗? chat里,
// ling和yinyue说和花无关, 提示里又说是一种花」 · 「答案必须一个字不差吗? 对对子, 不用要求那么严格吧?」 · 「问ling或者yinyue, 她俩应该
// 可以告诉吧?」. A near 下联 wins a star lower; Ling and 银月 are handed the hints the page has shown and the rule, never the
// answer; on his outright ask they Reveal it and the board is set aside as a skip, nothing paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { chainLine, checkDown, coupletLine, coupletOf, nearOf, riddleLine, riddleOf, riddleOutcome, chainOf } from '../scripts/games/jinchat-games.js';
import { castOf } from '../scripts/games/jinchat-rules.js';
import { openBoard, pageWordBoard, reveal, taskOfChat, wordBoardLook } from '../scripts/rules/wordboard.mjs';
import { look } from '../scripts/rules/look.mjs';
import { progress } from '../scripts/rules/did.mjs';
import { win } from '../scripts/rules/tasks.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const content = loadContent();
const REG = JSON.parse(read('../worlds/jiuding/games.json'));
const CHATS = REG.games.find((g) => g.id === 'jinchat' && !g.task).data.chats;
const PEOPLE = Object.fromEntries((JSON.parse(read('../worlds/jiuding/people.json')).people ?? []).map((p) => [p.id, p]));
const now = new Date('2026-11-03T15:00:00');

/* ════════ near 下联 ════════ */

test('红梅香自苦寒来 wins near — 梅 kept a place along, 苦寒 kept; the original named', () => {
  const c = coupletOf(CHATS.qichangsong.game, 'zh');
  assert.deepEqual(c.keys, ['梅', '苦寒']);
  assert.equal(checkDown(c, '梅花香自苦寒来'), 'right');
  assert.equal(checkDown(c, '红梅香自苦寒来'), 'near', 'two off in place, the keys kept anywhere');
  assert.deepEqual(nearOf(c, '红梅香自苦寒来'), { answer: '梅花香自苦寒来', diff: 2 });
  assert.equal(checkDown(c, '桃花香自苦寒来'), 'close', 'one off, but the plum is gone');
  assert.equal(checkDown(c, '梅花开自严寒来'), 'close', '苦寒 lost');
  assert.equal(checkDown(c, '红梅开自苦寒来'), 'wrong', 'three off');
  assert.equal(checkDown(c, '梅花香自苦寒'), 'wrong', 'another length');
  // With no `keys`, two off is near and nothing else is asked.
  const kou = coupletOf(CHATS['chu-kou'].game, 'zh');
  assert.deepEqual(kou.keys, []);
  assert.equal(checkDown(kou, '灯深村寺树'), 'near');
  assert.equal(checkDown(kou, '灯浅山寺树'), 'wrong');
});

test('every couplet: its answers right, no wrong choice near, its keys inside every answer', () => {
  for (const [id, chat] of Object.entries(CHATS).filter(([, v]) => v.game?.kind === 'couplet')) {
    const c = coupletOf(chat.game, 'zh');
    for (const a of c.answers) {
      assert.equal(checkDown(c, a), 'right', id);
      for (const k of c.keys) assert.ok(a.includes(k), `${id}: key 「${k}」 in 「${a}」`);
    }
    for (const x of c.choices.filter((x) => checkDown(c, x) !== 'right')) assert.equal(checkDown(c, x), 'wrong', `${id}: 「${x}」 is no near line`);
  }
  assert.ok(Object.values(CHATS).filter((v) => v.game?.kind === 'couplet' && v.game.zh.keys?.length).length >= 5, 'keys where an image is plain');
});

test('a near win is one star lower, as `hinted`; the hidden line says it was a character or two off and names the original', () => {
  assert.deepEqual(riddleOutcome({ solved: true, near: true }), { over: true, won: true, grade: 'hinted', stars: 2 });
  assert.deepEqual(riddleOutcome({ solved: true, near: true, hints: 1 }), { over: true, won: true, grade: 'hinted', stars: 1 });
  const chat = CHATS.qichangsong, c = coupletOf(chat.game, 'zh'), cast = castOf(chat, PEOPLE, 'zh');
  const zh = coupletLine(chat, { event: 'near', guess: '红梅香自苦寒来', answer: '梅花香自苦寒来', c, cast, lang: 'zh' });
  assert.match(zh, /差一两个字/);
  assert.match(zh, /原句是「梅花香自苦寒来」/);
  const en = coupletLine(chat, { event: 'near', guess: 'x', answer: '梅花香自苦寒来', c, cast, lang: 'en' });
  assert.match(en, /character or two off/);
  // The page's words: 原句 under the scrolls, and the miss of a line two off with its key lost.
  const page = read('../scripts/games/jinchat.js');
  assert.match(page, /original: '原句：\{a\}'/);
  assert.match(page, /close: '只差一两个字，可要紧的字眼丢了——再想想'/);
  assert.match(page, /close: 'only a character or two off, but the key image is lost — think again'/);
  const play = read('../scripts/games/jinchat-play.js');
  assert.match(play, /if \(v === 'near'\) return finish\(true, text, nearOf\(c, text\)/);
  assert.match(play, /const why = v === 'close' \? w\.why\.close : whyOf\(text\);/);
});

/* ════════ the hidden lines: the rule, the hints shown, never the answer ════════ */

test('each word game\'s open line carries the rule; a miss carries the hints shown before; never an answer nor a choice', () => {
  for (const [id, chat] of Object.entries(CHATS)) {
    const kind = chat.game?.kind;
    if (!['riddle', 'couplet', 'chain'].includes(kind)) continue;
    const cast = castOf(chat, PEOPLE, 'zh');
    let lines, secret;
    if (kind === 'couplet') {
      const c = coupletOf(chat.game, 'zh');
      lines = [coupletLine(chat, { event: 'open', c, cast }), coupletLine(chat, { event: 'miss', guess: 'x', why: 'y', hint: c.hints[1], shown: c.hints, c, cast })];
      secret = c.answers; // and the choices are never named: the right one is an answer
      assert.match(lines[1], new RegExp(`页面已经亮出的提示：「${c.hints[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}」`), id);
    } else if (kind === 'riddle') {
      const r = riddleOf(chat.game, 'zh');
      lines = [riddleLine(chat, { event: 'open', riddle: r, cast }), riddleLine(chat, { event: 'miss', guess: 'x', hint: r.hints.at(-1), shown: r.hints, choices: true, riddle: r, cast })];
      secret = r.answers;
    } else {
      lines = [chainLine(chat, { event: 'open', ch: chainOf(chat.game, 'zh'), cast })];
      secret = [];
    }
    assert.ok(!lines.some((l) => l.includes('四个选项') && /「[^」]*」、「/.test(l)), `${id}: the choices never listed`);
    assert.match(lines[0], /答案藏着，你也不知道——别说它是什么，也别说它不是什么/, `${id}: the rule`);
    for (const l of lines) for (const a of secret.filter((a) => [...a].length >= 2)) assert.ok(!l.includes(a), `${id}: 「${a}」 never in the line`);
  }
  const en = riddleLine(CHATS.masan, { event: 'open', riddle: riddleOf(CHATS.masan.game, 'en'), cast: [], lang: 'en' });
  assert.match(en, /never say what it is, nor what it is not/);
});

/* ════════ the board on the save: Look, Reveal ════════ */

const at = () => {
  const s = structuredClone(JSON.parse(read('./fixtures/saves/waimen.json')).state ?? JSON.parse(read('./fixtures/saves/waimen.json')));
  s.scene = 'wm-laoyin';
  s.place = content.chapters['00-waimen'].scenes['wm-laoyin'].place ?? s.place;
  s.tasks = { ...s.tasks, 'laoyin-qi': { status: 'offered' } };
  s.lang = 'zh';
  return s;
};
const opened = (s) => {
  const o = pageWordBoard(content, s, { action: 'open', chat: 'qichangsong', kind: 'couplet', face: '宝剑锋从磨砺出', answer: '梅花香自苦寒来', src: '《警世贤文》' }, now);
  const h = pageWordBoard(content, o.keep, { action: 'step', chat: 'qichangsong', hints: JSON.stringify(['上联说一样兵器，下联说一样花。']) }, now);
  return h.keep;
};

test('the page keeps the open game; Look and 银月\'s Progress hand its face, the hints shown and the rule — never its answer', () => {
  assert.equal(taskOfChat(content, at(), 'qichangsong'), 'laoyin-qi');
  const s = opened(at());
  assert.equal(s.word_board.task, 'laoyin-qi');
  const wb = wordBoardLook(s, now).word_board;
  assert.deepEqual(wb.hints, ['上联说一样兵器，下联说一样花。']);
  assert.equal(wb.face, '宝剑锋从磨砺出');
  assert.match(wb.rule, /never say what it is, nor what it is not/);
  assert.match(wb.rule, /Reveal/);
  const seen = JSON.stringify(look(s, content, { now, quests: [] }));
  assert.match(seen, /"word_board"/);
  assert.ok(!seen.includes('梅花香自苦寒来'), 'Look never carries the answer untold');
  const hers = JSON.stringify(progress(s, content, { now, quests: [] }).result);
  assert.match(hers, /"word_board"/);
  assert.ok(!hers.includes('梅花香自苦寒来'));
  assert.match(hers, /Whisper/);
  // Another day, or closed: gone.
  assert.equal(openBoard(s, new Date('2026-11-04T15:00:00')), null);
  assert.equal(pageWordBoard(content, s, { action: 'close', chat: 'qichangsong' }, now).keep.word_board, undefined);
  // Opened at another scene: not the board before him.
  assert.equal(openBoard({ ...s, scene: 'wm-ahe' }, now), null);
  // 二十问 has no hidden answer: never kept.
  assert.equal(pageWordBoard(content, at(), { action: 'open', chat: 'yinyue-twenty', kind: 'guess' }, now).result.ok, false);
});

test('Reveal hands the answer over and the board is told — set aside as a skip, nothing paid; a win after it is refused', () => {
  const s = opened(at());
  const r = reveal(s, content, { now, quests: [] });
  assert.equal(r.result.ok, true);
  assert.equal(r.result.answer, '梅花香自苦寒来');
  assert.equal(r.result.told, 'laoyin-qi');
  assert.equal(r.result.paid, null);
  const t = r.state.tasks['laoyin-qi'];
  assert.equal(t.status, 'done');
  assert.equal(t.skipped, true);
  assert.equal(t.told, true);
  assert.ok(!r.state.wins?.['laoyin-qi'], 'no win');
  assert.equal(r.state.progress, s.progress, 'no 修为');
  assert.equal(r.state.wealth, s.wealth, 'no 灵石');
  assert.ok((r.state.skipped ?? []).some((e) => e.task === 'laoyin-qi'), 'offered again another day');
  // The page's watch sees it told; Look says so now, the answer with it.
  assert.deepEqual(pageWordBoard(content, r.state, { action: 'peek', chat: 'qichangsong' }, now).result.told, { answer: '梅花香自苦寒来', src: '《警世贤文》' });
  assert.equal(wordBoardLook(r.state, now).word_board.told, true);
  assert.equal(win(r.state, content, { now, quests: [] }, { id: 'laoyin-qi', grade: 'solved' }).result.refused, 'told');
  // Asked again: the same answer, nothing more changed.
  assert.equal(reveal(r.state, content, { now, quests: [] }).state, null);
  // No board open: refused.
  assert.equal(reveal(at(), content, { now, quests: [] }).result.refused, 'no-word-board');
});

test('the page keeps the board through the rules, the Mac\'s alone, and watches for a told one; SKILL.md says when to Reveal', () => {
  const page = read('../scripts/games/jinchat.js');
  assert.match(page, /const kept = typeof data\.ask !== 'function';/);
  assert.match(page, /verb\('wordboard', \{ action, chat: data\.chat, \.\.\.o \}\)/);
  assert.match(page, /board\('peek'\)/);
  const play = read('../scripts/games/jinchat-play.js');
  for (const k of ['riddle', 'couplet', 'chain']) assert.match(play, new RegExp(`keep\\(ctx, 'open', \\{ kind: '${k}'`), k);
  assert.equal((play.match(/resolve\(\{ won: false, left: true, told: true \}\)/g) ?? []).length, 3, 'told: over as left, never a win');
  const skill = read('../SKILL.md');
  assert.match(skill, /- name: Reveal\n/);
  assert.match(skill, /- name: Whisper\n/);
  assert.match(skill, /\*\*A `\[jinchat\]` word game in this chat\*\*, asked about \(a hint, the answer\):\n  Look first/);
  assert.match(skill, /\*\*Reveal\*\*\n  only when the player asks outright for the answer\./);
  // 银月's half is a pet tool: the engine runs only `tier: read` ones for her (skill/tools.rs pet_gate).
  assert.match(skill, /- name: Whisper\n[\s\S]*?--for=yinyue"\n    tier: read\n    pet: true/);
  // Her place text is at its budget: Whisper's own description and Progress's `word_board` rule say when.
  assert.match(skill, /- name: Whisper\n[\s\S]*?only when the\n      player asks you outright — never for a hint/);
  const rules = read('../scripts/rules.mjs');
  assert.match(rules, /if \(verb === 'wordboard' && !reader\)/, 'the page\'s verb, never Ling\'s');
});
