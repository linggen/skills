// The open 二十问 (jinchat `guess`: he thinks of an animal, they ask), Hanli 2026-11-03: 「AI有点弱, 而且知道正确答案后没反应.
// 怎么也要有个懊恼情绪, "竟然是..."」. The guesser is handed a strategy, the page's summary of what his answers settled and a
// cap on guesses; told the animal it missed, it rues it (「竟然是……！」, the model's words, the data's when none answers);
// guessing right, a small boast. Both hosts: the Mac's chat and the phone's `ask` seam go through the same `react`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { answerFree, freeEndFallback, freeEndLine, freeLine, freshFree, guessHeld, knownOf, saidAnimal, tableOf } from '../scripts/games/jinchat-games.js';
import { guessGame } from '../scripts/games/jinchat-play.js';
import { castOf } from '../scripts/games/jinchat-rules.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const CHATS = JSON.parse(read('../worlds/jiuding/games.json')).games.find((g) => g.id === 'jinchat' && !g.task).data.chats;
const TWENTY = JSON.parse(read('../worlds/jiuding/aigames.json')).twenty;
const peopleRaw = JSON.parse(read('../worlds/jiuding/people.json'));
const PEOPLE = Object.fromEntries((Array.isArray(peopleRaw.people) ? peopleRaw.people : Object.values(peopleRaw.people ?? peopleRaw)).filter((p) => p?.id).map((p) => [p.id, p]));

const played = (pairs) => pairs.reduce((st, [q, a, x]) => answerFree(st, x ? { kind: 'guess', text: q, x } : { kind: 'ask', text: q }, a), freshFree());

test('every turn hands the strategy, the page\'s own summary of what is known, all asked so far, and the guesses left', () => {
  const c = CHATS['617'], cast = castOf(c, PEOPLE, 'zh');
  const st = played([['是哺乳动物吗？', 'yes'], ['住在水里吗？', 'no'], ['比狗大吗？', 'yes'], ['会飞吗？', 'unknown'], ['是不是马？', 'wrong', '马']]);
  const line = freeLine(c, st, { max: 15, cast, lang: 'zh' });
  assert.match(line, /先问能把剩下的动物劈成两半的大问题——是哺乳动物吗？住在水里吗？比狗大吗？家里养的吗？/);
  assert.match(line, /圈子窄到两三种了才猜/);
  assert.match(line, /到现在知道的：是——是哺乳动物吗？、比狗大吗？；不是——住在水里吗？；他不知道——会飞吗？；猜错过——马（别再猜）。/);
  assert.match(line, /还能猜 2 回/);
  assert.match(line, /1\. 问：是哺乳动物吗？——他答：是\n[\s\S]*5\. 猜：马——他说：不对/, 'every question and answer, not only the summary');
  assert.equal(knownOf(freshFree()), '');
  const en = freeLine(c, st, { max: 15, cast, lang: 'en' });
  assert.match(en, /split what is left in half — a mammal\? lives in water\? bigger than a dog\? kept at home\?/);
  assert.match(en, /Known so far: yes — /);
});

test('guesses are capped: none before question 5, three at most, the last question may always guess; a held guess is asked again', () => {
  const ask = (n) => played(Array.from({ length: n }, (_, i) => [`问${i}？`, 'no']));
  assert.equal(guessHeld(ask(2), { max: 15 }), 'soon');
  assert.equal(guessHeld(ask(4), { max: 15 }), null, 'the fifth may guess');
  const three = played([...Array.from({ length: 5 }, (_, i) => [`问${i}？`, 'no']), ['a', 'wrong', '甲'], ['b', 'wrong', '乙'], ['c', 'wrong', '丙']]);
  assert.equal(guessHeld(three, { max: 15 }), 'spent');
  assert.equal(guessHeld(three, { max: 9 }), null, 'the last question may always guess');
  const c = CHATS['617'];
  assert.match(freeLine(c, ask(2), { max: 15, lang: 'zh', bad: 'soon' }), /（上一句是猜，页面没收：才问了几问，圈子还宽。这一句问。）/);
  assert.match(freeLine(c, three, { max: 15, lang: 'zh', bad: 'spent' }), /猜的次数用完了/);
  assert.match(freeLine(c, three, { max: 15, lang: 'zh' }), /还能猜 0 回/);
});

test('the end lines: stumped and told — chagrin, 「竟然是……！」 and why; guessed — a small boast; the data\'s line when no model answers', () => {
  const c = CHATS['617'];
  const lost = played([['是哺乳动物吗？', 'yes'], ['会飞吗？', 'no']]);
  const l = freeEndLine(c, lost, { said: '穿山甲', lang: 'zh' });
  assert.match(l, /^\[HIDDEN\] \[jinchat\] /);
  assert.match(l, /他说出了谜底：「穿山甲」。你输了——先懊恼一句，像「竟然是穿山甲……！」，再用你自己的口吻说一句是哪儿没想到（他答过的：是——是哺乳动物吗？；不是——会飞吗？）/);
  assert.match(freeEndLine(c, lost, { said: 'pangolin', lang: 'en' }), /A pangolin, of all things…!/);
  const won = answerFree(lost, { kind: 'guess', text: '是穿山甲？', x: '穿山甲' }, 'right');
  assert.match(freeEndLine(c, won, { lang: 'zh' }), /你猜中了，是「穿山甲」，用了 3 问。得意一句，小小显摆一下/);
  const table = tableOf(TWENTY);
  assert.equal(freeEndFallback(table, lost, { said: '穿山甲', lang: 'zh' }), '竟然是穿山甲……！早该想到的。');
  assert.equal(freeEndFallback(table, won, { lang: 'en' }), 'A 穿山甲! I knew it.');
  // His typed answer is the animal, filler gone.
  assert.equal(saidAnimal('是穿山甲吧', 'zh'), '穿山甲');
  assert.equal(saidAnimal('它是袋鼠', 'zh'), '袋鼠');
  assert.equal(saidAnimal('It was a kangaroo', 'en'), 'kangaroo');
});

/* ════════ the board, played: a fake page ════════ */

function page() {
  const listeners = [];
  const node = (extra = {}) => ({ value: '', addEventListener: (type, fn) => listeners.push({ el: node, type, fn }), focus() {}, ...extra });
  const slot = {
    html: '',
    set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; },
    querySelectorAll(sel) {
      if (sel !== '[data-a]') return [];
      return [...this.html.matchAll(/data-a="(\w+)">([^<]*)</g)].map(([, a, label]) => {
        const b = { dataset: { a }, textContent: label, addEventListener: (type, fn) => listeners.push({ a, type, fn }) };
        return b;
      });
    },
    querySelector(sel) {
      if (sel === '.is-main') return { addEventListener: (type, fn) => listeners.push({ main: true, type, fn }) };
      if (sel === '.g-jc-in') return (this.input ??= node());
      if (sel === 'form') return { addEventListener: (type, fn) => listeners.push({ form: true, type, fn }) };
      return null;
    },
  };
  return { slot, listeners, root: { querySelector: (sel) => (sel === '.g-jc-game' ? slot : null) } };
}
const tick = () => new Promise((r) => setTimeout(r, 5));
async function until(fn) { for (let i = 0; i < 400; i += 1) { const v = fn(); if (v) return v; await tick(); } throw new Error('never'); }

function play({ replies, reactN = 1, max = 3, chat = CHATS['617'] }) {
  const p = page(), reacts = [], said = [], asked = [];
  const game = { ...chat, game: { ...chat.game, max, after: null } };
  const w = { wen: '问', twenty: '二十问', think: '{max}', ready: '想好了', yes: '是', no: '不是', unknown: '不知道', right: '对', wrong: '不对', asked: '{n}/{max}', tell: '说', itWas: '它是', tellGo: '说' };
  const ctx = {
    root: p.root, chat: game, cast: castOf(chat, PEOPLE, 'zh'), lang: 'zh', w, id: 'x', endMs: 200,
    add: (l) => said.push(l), typeOut: async (ls) => { for (const l of ls) said.push(l); }, typing() {}, sound() {}, foot() {}, log() {},
    table: async () => tableOf(TWENTY), settle: async () => {},
    ask: async (text) => { asked.push(text); return { text: replies.shift() ?? '' }; },
    react: async (text) => { reacts.push(text); return reactN; },
  };
  return { p, reacts, said, asked, done: guessGame(ctx) };
}
const tap = async (p, a) => {
  const l = await until(() => p.listeners.find((x) => x.a === a && !x.used));
  p.listeners.forEach((x) => { if (x.a) x.used = true; });
  l.fn();
};

test('stumped: he types the animal, they rue it in their own words (the chagrin line sent), and the board ends', async () => {
  const g = play({ replies: ['<!--问-->是哺乳动物吗？', '<!--问-->住在水里吗？', '<!--问-->比狗大吗？'] });
  (await until(() => g.p.listeners.find((x) => x.main))).fn();
  for (let i = 0; i < 3; i += 1) await tap(g.p, 'no');
  const form = await until(() => g.p.listeners.find((x) => x.form));
  g.p.slot.input.value = '是穿山甲吧';
  form.fn({ preventDefault() {} });
  const o = await g.done;
  assert.equal(o.grade, 'stumped');
  assert.equal(g.reacts.length, 1);
  assert.match(g.reacts[0], /他说出了谜底：「穿山甲」。你输了——先懊恼一句，像「竟然是穿山甲……！」/);
  assert.match(g.asked[2], /到现在知道的：不是——是哺乳动物吗？、住在水里吗？/, 'the summary rides every turn');
});

test('stumped with no model to answer: the data\'s own 「竟然是……！」, and still it ends', async () => {
  const g = play({ replies: ['<!--问-->会飞吗？', '<!--问-->会游泳吗？', '<!--问-->有毛吗？'], reactN: 0 });
  (await until(() => g.p.listeners.find((x) => x.main))).fn();
  for (let i = 0; i < 3; i += 1) await tap(g.p, 'no');
  const form = await until(() => g.p.listeners.find((x) => x.form));
  g.p.slot.input.value = '刺猬';
  form.fn({ preventDefault() {} });
  await g.done;
  assert.ok(g.said.some((l) => l.text === '竟然是刺猬……！早该想到的。'));
});

test('guessed: a small boast is sent, and a guess too soon is asked again as a question', async () => {
  const g = play({ max: 6, replies: ['<!--猜:猫-->是猫吧？', '<!--问-->是哺乳动物吗？', '<!--问-->家里养的吗？', '<!--问-->会叫吗？', '<!--问-->比猫大吗？', '<!--猜:狗-->是狗！'] });
  (await until(() => g.p.listeners.find((x) => x.main))).fn();
  await until(() => g.asked.length >= 2);
  assert.match(g.asked[1], /页面没收：才问了几问/, 'the early guess was not taken');
  for (const a of ['yes', 'yes', 'yes', 'yes']) await tap(g.p, a);
  await tap(g.p, 'right');
  const o = await g.done;
  assert.equal(o.grade, 'guessed');
  assert.match(g.reacts.at(-1), /你猜中了，是「狗」，用了 5 问。得意一句/);
});

test('both hosts: the end goes through the board\'s react (the Mac\'s chat, the phone\'s `ask` seam), bounded, before the book\'s lines', () => {
  const play = read('../scripts/games/jinchat-play.js');
  assert.match(play, /ctx\.react\(freeEndLine\(chat, st, \{ said: x, lang \}\), \{ wait: true \}\)/);
  assert.match(play, /setTimeout\(\(\) => r\(0\), ctx\.endMs \?\? END_MS\)/, 'never held on a host that does not answer');
  assert.ok(play.indexOf('freeEndLine(chat, st') < play.indexOf('await playAfter(ctx, chat.game.after)'), 'their word, then the book\'s (40099a49 closes it)');
  const host = read('../scripts/games/jinchat.js');
  assert.match(host, /if \(typeof data\.ask === 'function'\) return data\.ask\(\{ agent: 'ling', text: line/);
  assert.match(host, /return Math\.min\(2, p\.lines\.length\);/);
  assert.match(read('../scripts/games/phone/host.js'), /if \(game === 'jinchat' \|\| game === 'drawguess'\) d\.ask = ask\(game\);/);
});
