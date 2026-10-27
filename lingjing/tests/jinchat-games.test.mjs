// The 对话 boards' word games (games/jinchat-games.js · jinchat-play.js; Hanli 2026-10-27, of 「银月 · 最后一颗」: 「这个对话小游戏
// 好像不太合理, 好玩」 → 「AI对话可以对对子, 猜谜语等」 · 「猜动物也行…AI猜玩家心里的」): a classic game with the person, the
// goal on the page; the PAGE judges every answer from data, never the model (live 10-27: a model invented a puzzle's
// answer); the book's lines frame it verbatim; every game plays with no model at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  answerGuess, bankLine, checkRiddle, freshGuess, guessOutcome, guessSummary, judgeGuess, nextMove, normAnswer, parseBank,
  resultLine, riddleLine, riddleOf, riddleOutcome, stillPossible, tableOf,
} from '../scripts/games/jinchat-games.js';
import { castOf } from '../scripts/games/jinchat-rules.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const reg = JSON.parse(read('../worlds/jiuding/games.json'));
const CHATS = reg.games.find((g) => g.id === 'jinchat' && !g.task).data.chats;
const GAMES = Object.entries(CHATS).filter(([, c]) => c.game);
const TASKS = JSON.parse(read('../worlds/jiuding/tasks/world.json')).tasks;
const TABLE = tableOf(JSON.parse(read('../worlds/jiuding/aigames.json')).twenty);
const peopleRaw = JSON.parse(read('../worlds/jiuding/people.json'));
const PEOPLE = Object.fromEntries((Array.isArray(peopleRaw.people) ? peopleRaw.people : Object.values(peopleRaw.people ?? peopleRaw)).filter((p) => p?.id).map((p) => [p.id, p]));
const BOOKJ = JSON.parse(read('../story/jiuding-lu/book.json')).volumes.flatMap((v) => v.hui);
const flat = (s) => s.replace(/\[([^\]]+)\]\{[^}]+\}/g, '$1').replace(/\*/g, '');
const BOOK_ZH = flat(BOOKJ.map((h) => read(`../story/jiuding-lu/${h.file}`)).join('\n'));
const BOOK_EN = flat(BOOKJ.filter((h) => h.file_en).map((h) => read(`../story/jiuding-lu/${h.file_en}`)).join('\n'));
const LANGS = ['zh', 'en'];

test('the boards Hanli named are word games now; the call with his mum is kept as it is', () => {
  assert.equal(CHATS['yinyue-pill'].game?.kind, 'riddle', '最后一颗: a riddle');
  assert.equal(CHATS['yinyue-pill'].agent, 'yinyue', '银月 writes her own lines');
  assert.equal(CHATS['617'].game?.kind, 'guess', '617: 二十问, they guess his animal');
  assert.equal(CHATS.ma.game, undefined, 'Hanli 10-27: 「今1和妈妈的视频通话是个好例子, 保留」');
  // Hanli 10-27 (of 老蔫 · 窗户底下: 「这个不好, 换掉」): every chat board but the call with his mum is a word game.
  for (const [id, c] of Object.entries(CHATS)) if (id !== 'ma') assert.ok(c.game, `${id}: a word game`);
});

test('each riddle: both tongues, tiers of hints, choices with exactly one right, the page\'s answer list', () => {
  for (const [id, c] of GAMES.filter(([, x]) => x.game.kind === 'riddle')) {
    for (const lang of LANGS) {
      const r = riddleOf(c.game, lang);
      assert.ok(r.q, `${id} ${lang}: q`);
      assert.ok(r.hints.length >= 2, `${id} ${lang}: hints in tiers`);
      assert.ok(r.answers.length >= 1, `${id} ${lang}: answers`);
      assert.equal(r.choices.length, 4, `${id} ${lang}: four choices`);
      const right = r.choices.filter((x) => checkRiddle(r, x, lang) === 'right');
      assert.equal(right.length, 1, `${id} ${lang}: one choice right (${right})`);
      assert.equal(checkRiddle(r, r.answers[0], lang), 'right', `${id} ${lang}: its first answer`);
      assert.equal(checkRiddle(r, '', lang), 'empty');
    }
  }
});

test('his answer is judged by the data alone: filler goes, a denial is never right, a near thing is not the thing', () => {
  const pill = riddleOf(CHATS['yinyue-pill'].game, 'zh');
  assert.equal(checkRiddle(pill, '我猜是九转还魂丹吧！', 'zh'), 'right');
  assert.equal(checkRiddle(pill, '仙丹', 'zh'), 'right');
  assert.equal(checkRiddle(pill, '丹', 'zh'), 'right');
  assert.equal(checkRiddle(pill, '不是丹', 'zh'), 'wrong');
  assert.equal(checkRiddle(pill, '龙眼', 'zh'), 'wrong', 'the trap choice');
  assert.equal(checkRiddle(pill, '夜明珠', 'zh'), 'wrong');
  const en = riddleOf(CHATS['yinyue-pill'].game, 'en');
  assert.equal(checkRiddle(en, "I think it's a pill", 'en'), 'right');
  assert.equal(checkRiddle(en, 'a Nine-Turn Soul-Return Pill!', 'en'), 'right');
  assert.equal(checkRiddle(en, 'pillow', 'en'), 'wrong', 'a word, never a substring');
  assert.equal(normAnswer('  我觉得是「风」吧。 ', 'zh'), '风');
});

test('the book frames each game, verbatim: the setup line, the closing lines; the facts they are handed never carry the answer', () => {
  for (const [id, c] of GAMES) {
    const cast = new Set(['me', ...castOf(c, PEOPLE, 'zh').map((p) => p.id)]);
    for (const l of c.game.after ?? []) {
      assert.ok(cast.has(l.who), `${id}: ${l.who} is in the chat`);
      assert.ok(BOOK_ZH.includes(l.text.zh), `${id}: 「${l.text.zh}」 is the book's`);
      assert.ok(BOOK_EN.includes(l.text.en), `${id}: "${l.text.en}" is the book's`);
    }
    for (const s of c.game.setup ?? []) {
      assert.ok(BOOK_ZH.includes(s.zh), `${id}: setup 「${s.zh}」 is the book's`);
      assert.ok(BOOK_EN.toLowerCase().includes(s.en.toLowerCase()), `${id}: setup "${s.en}" is the book's`);
    }
    for (const lang of LANGS) assert.ok(c.game.facts?.[lang], `${id}: the game's own facts (${lang})`);
    if (c.game.kind !== 'riddle') continue;
    for (const lang of LANGS) {
      const r = riddleOf(c.game, lang);
      // (who they are is no leak: the River Lord is called so — his name is left out of the check)
      const names = castOf(c, PEOPLE, lang).map((p) => p.name).concat(lang === 'en' ? ['River Lord'] : []);
      const unnamed = (t) => names.reduce((x, n) => x.split(n).join(' '), t);
      const facts = unnamed(c.game.facts[lang]).toLowerCase();
      const says = (text, a) => (lang === 'en' ? new RegExp(`\\b${a.toLowerCase()}\\b`).test(text.toLowerCase()) : text.includes(a));
      for (const a of r.answers.filter((x) => [...x].length >= (lang === 'en' ? 4 : 2))) assert.ok(!says(facts, a), `${id} ${lang}: the facts never say 「${a}」`);
      // Before he has it, no line they are handed carries the answer (skip comes after the page has shown it).
      const cast = castOf(c, PEOPLE, lang);
      for (const event of ['open', 'miss']) {
        // (the chat's own header — its place and time, on the page anyway — is left out: 台角的水缸 is where 秦雁 stands)
        const line = riddleLine(c, { event, guess: 'x', hint: r.hints[0], riddle: r, cast, lang }).replace(c.title[lang], '').replace(c.when[lang], '');
        const bare = unnamed(line);
        assert.match(line, /^\[HIDDEN\] \[jinchat\] /);
        // (a one-character answer — 气, 水 — is in too many words to check; the riddle and the hints were checked above)
        for (const ans of r.answers.filter((x) => [...x].length >= 2)) assert.ok(!says(bare, ans), `${id} ${lang} ${event}: no 「${ans}」 in the line`);
      }
    }
  }
  // 最后一颗: the context first (what the 饭桶 did), then her 「哭什么。」; solved, her 「本王还有一颗。最后一颗。」 → his
  // tap 「……拿的？」 → 「抢的。」 — the chip comes only after she has said it (live 10-27: it stood there before).
  const pill = CHATS['yinyue-pill'].game;
  assert.match(pill.setup[0].zh, /吸了去/);
  assert.deepEqual(pill.after.map((l) => l.text.zh), ['本王还有一颗。最后一颗。', '……拿的？', '抢的。']);
  assert.deepEqual(pill.after.map((l) => l.who), ['yinyue', 'me', 'yinyue']);
});

test('a riddle\'s stars: clean 3, with hints or choices 2, skipped 1; the story goes on every way', () => {
  assert.deepEqual(riddleOutcome({ solved: true }), { over: true, won: true, grade: 'solved', stars: 3 });
  assert.deepEqual(riddleOutcome({ solved: true, hints: 1 }), { over: true, won: true, grade: 'hinted', stars: 2 });
  assert.deepEqual(riddleOutcome({ solved: true, choices: true }), { over: true, won: true, grade: 'hinted', stars: 2 });
  assert.deepEqual(riddleOutcome({ solved: false }), { over: true, won: true, grade: 'skipped', stars: 1 });
});

/* An honest player: each answer as the table says, an 'either' answered by `either`. */
function play(animal, either = 'unknown', slip = null) {
  let st = freshGuess();
  for (let k = 0; k < 60 && !st.over; k++) {
    const mv = nextMove(TABLE, st);
    if (mv.kind === 'giveup') return { st, gaveUp: true };
    if (mv.kind === 'guess') { st = judgeGuess(st, mv.animal.id, mv.animal.id === animal.id); continue; }
    let v = animal.ans[mv.q.id];
    v = v === 'y' ? 'yes' : v === 'n' ? 'no' : either;
    if (slip === st.n) v = v === 'yes' ? 'no' : 'yes';
    st = answerGuess(st, mv.q.id, v);
  }
  return { st };
}

test('反着的二十问: every animal on the list, answered honestly, is guessed within the cap; a guess is a question', () => {
  assert.equal(TABLE.animals.length, 30);
  assert.ok(TABLE.max >= 15 && TABLE.max <= 20);
  for (const either of ['yes', 'no', 'unknown']) {
    for (const a of TABLE.animals) {
      const { st } = play(a, either);
      assert.equal(st.won, a.id, `${a.id} (either → ${either}): guessed`);
      assert.ok(st.n <= TABLE.max, `${a.id}: within ${TABLE.max}`);
    }
  }
  // Two animals the table cannot tell apart would be unfair: every pair differs on some question (no 'either' in it).
  for (const a of TABLE.animals) for (const b of TABLE.animals) {
    if (a.id >= b.id) continue;
    assert.ok(TABLE.questions.some((q) => (a.ans[q.id] === 'y' && b.ans[q.id] === 'n') || (a.ans[q.id] === 'n' && b.ans[q.id] === 'y')), `${a.id} vs ${b.id}`);
  }
});

test('反着的二十问: only his 对 is their win; one slip of his is forgiven; at the cap they give up and never claim it', () => {
  const fox = TABLE.animals.find((a) => a.id === 'fox');
  // one wrong answer early on still ends in the fox (or a give-up — never a false win)
  for (let slip = 0; slip < 4; slip++) {
    const { st } = play(fox, 'unknown', slip);
    assert.ok(st.won === 'fox' || !st.won, `slip at ${slip}: never another animal claimed`);
  }
  let st = freshGuess();
  const mv = nextMove(TABLE, st);
  assert.equal(mv.kind, 'ask', 'they ask before they guess');
  // he says 不对 to every guess: they run out and give up — no win
  for (let k = 0; k < 80; k++) {
    const m = nextMove(TABLE, st);
    if (m.kind === 'giveup') break;
    st = m.kind === 'ask' ? answerGuess(st, m.q.id, 'unknown') : judgeGuess(st, m.animal.id, false);
  }
  assert.equal(nextMove(TABLE, st).kind, 'giveup');
  assert.ok(!st.won && st.n <= TABLE.max);
  assert.deepEqual(guessOutcome(st), { over: true, won: true, grade: 'stumped', stars: 3 });
  assert.match(guessSummary(TABLE, st, { said: '穿山甲' }, 'zh'), /问没猜中，他心里是：穿山甲$/);
  const won = judgeGuess(freshGuess(), 'fox', true);
  assert.deepEqual(guessOutcome(won), { over: true, won: true, grade: 'guessed', stars: 2 });
  assert.equal(guessSummary(TABLE, won, {}, 'zh'), '1 问猜中了狐狸');
  assert.deepEqual(guessOutcome(st, { skipped: true }).stars, 1);
  assert.ok(stillPossible(TABLE, freshGuess()).length === 30);
});

test('their voice: one bank turn rewrites the questions; only well-formed questions with known ids are taken', () => {
  const c = CHATS['617'], cast = castOf(c, PEOPLE, 'zh');
  const line = bankLine(c, TABLE, { cast, lang: 'zh' });
  assert.match(line, /^\[HIDDEN\] \[jinchat\] /);
  assert.ok(TABLE.questions.every((q) => line.includes(`${q.id}｜`)), 'every question offered');
  const bank = parseBank('fly｜老蔡：这玩意儿能上天不？\neggs｜眼镜：我查了，它下蛋吗？\nnope｜老蔡：乱来？\nfur｜老蔡：长毛\nguess｜眼镜：我赌是{x}，对不对？\nhorns｜{x}有角吗？', TABLE, cast);
  assert.deepEqual(Object.keys(bank).sort(), ['eggs', 'fly', 'guess']);
  assert.equal(bank.fly.who, 'jin-laocai');
  assert.equal(bank.eggs.text, '我查了，它下蛋吗？');
  assert.match(resultLine(c, '12 问猜中了狐狸', 'zh'), /12 问猜中了狐狸.*别改这个结果/);
});

test('the module: the page judges (no tag, no model verdict); every game is skippable, sounds through the shell', () => {
  const play = read('../scripts/games/jinchat-play.js');
  assert.ok(!/<!--成-->|TAG|\.met\b/.test(play), 'a game never reads a model tag');
  assert.match(play, /checkRiddle\(r, text, lang\)/, 'the riddle\'s verdict is the data\'s');
  assert.equal((play.match(/w\.skip/g) ?? []).length >= 2, true, '跳过 in each game');
  const src = read('../scripts/games/jinchat.js');
  const sounds = JSON.parse(read('../scripts/games/kit/audio/sounds.json')).games.jinchat.events;
  for (const s of ['right', 'wrong', 'hint', 'skip', 'tap']) {
    assert.ok(sounds[s], `sound ${s}`);
    assert.match(src, new RegExp(`'${s}'`), `meta.sounds names ${s}`);
  }
  for (const [id] of GAMES) {
    const t = TASKS.find((x) => x.game === 'jinchat' && x.deal?.chat === id);
    if (!t) continue;
    assert.deepEqual(t.grant, { table: 'task' }, `${id}: pays as before`);
  }
});
