// 画猜 (games/drawguess.js, Hanli 2026-10-16: 「玩家画AI猜, 试一下吧」): the page decides whether
// Ling's guess is the word — exact on the word's spellings after normalize, never a substring, never
// the model's say — and the call loop throttles: one call out at a time, requests while one is out
// coalesce to one trailing call, at most four a round, an unchanged paper is not sent again, a
// closed round sends nothing more but hears the call already out, a stopped one drops it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { guessLoop, isBlindReply, matches, normalize, parseReply, pickWord, refusalOf, starsFor, ERASER, strokeOp } from '../scripts/games/drawguess-rules.js';

const reg = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
const ROW = reg.games.find((g) => g.id === 'drawguess');
const WORDS = ROW.data.words;
const word = (zh) => WORDS.find((w) => w.zh === zh);

test('the word list: twelve things from 卷一, each with English and its spellings, no spelling shared by two words', () => {
  assert.equal(ROW.group, 'ai');
  assert.deepEqual(WORDS.map((w) => w.zh), ['弓', '鹿', '狐狸', '饼', '盆', '白菜', '鸡', '葫芦', '剑', '山', '月亮', '灯']);
  const seen = new Map();
  for (const w of WORDS) {
    assert.ok(w.en, w.zh);
    for (const s of [w.zh, ...w.also, w.en, ...w.enAlso].map(normalize)) {
      assert.ok(!seen.has(s) || seen.get(s) === w.zh, `${s}: ${seen.get(s)} and ${w.zh}`);
      seen.set(s, w.zh);
    }
  }
});

test('a guess is right on the word or a spelling, with measure words, punctuation and English articles shed', () => {
  assert.ok(matches('弓', word('弓')));
  assert.ok(matches('一把弓。', word('弓')));
  assert.ok(matches('是一只梅花鹿', word('鹿')));
  assert.ok(matches('  狐 狸！', word('狐狸')));
  assert.ok(matches('一轮弯月', word('月亮')));
  assert.ok(matches('灯笼吧', word('灯')));
  assert.ok(matches('A Fox', word('狐狸')));
  assert.ok(matches('the mountains', word('山')));
  assert.ok(matches('crescent moon', word('月亮')));
  assert.ok(matches('ＭＯＯＮ', word('月亮')), 'full-width folds');
});

test('never a substring, never a near thing: 鸡蛋 is not 鸡, 山羊 not 山, 月饼 not 饼, 剑鞘 not 剑', () => {
  assert.equal(matches('鸡蛋', word('鸡')), false);
  assert.equal(matches('山羊', word('山')), false);
  assert.equal(matches('月饼', word('饼')), false);
  assert.equal(matches('月饼', word('月亮')), false);
  assert.equal(matches('剑鞘', word('剑')), false);
  assert.equal(matches('桥', word('弓')), false);
  assert.equal(matches('', word('弓')), false);
  assert.equal(matches(null, word('弓')), false);
  assert.equal(matches('猜', word('弓')), false);
});

test('her reply is read loosely: the 猜 line anywhere, the zh line, the en line; no guess line is a miss', () => {
  assert.deepEqual(parseReply('我猜这是道拱形的桥。\nI think it’s an arched bridge.\n猜：桥'),
    { guess: '桥', zh: '我猜这是道拱形的桥。', en: 'I think it’s an arched bridge.' });
  assert.equal(parseReply('猜: 弓。\n弯弯的，是张弓。\nA bow.').guess, '弓');
  assert.equal(parseReply('- 猜：月亮').guess, '月亮');
  assert.equal(parseReply('看不太出来。\nHard to tell.').guess, null);
  assert.equal([...parseReply('一'.repeat(40)).zh].length, 25, 'a long line is clipped');
  assert.equal(isBlindReply('`deepseek-flash` cannot read images. These can: gpt-6-luna.'), true);
  assert.equal(isBlindReply('猜：弓'), false);
});

test('the word is never the one just drawn; stars by looks', () => {
  for (let i = 0; i < 50; i++) assert.notEqual(pickWord(WORDS, Math.random, '弓').zh, '弓');
  assert.equal(pickWord(WORDS, () => 0.9999).zh, '灯');
  assert.deepEqual([1, 2, 3, 4].map(starsFor), [3, 2, 1, 1]);
});

// A fake clock and a send whose replies the test lets go by hand.
function rig({ max = 4, idleMs = 2500 } = {}) {
  let now = 0, id = 0;
  const due = new Map();
  const timers = { set: (fn, ms) => { due.set(++id, { at: now + ms, fn }); return id; }, clear: (k) => due.delete(k) };
  const advance = (ms) => {
    now += ms;
    for (const [k, t] of [...due]) if (t.at <= now) { due.delete(k); t.fn(); }
  };
  const out = [], heard = [];
  let settles = 0;
  const send = (v) => new Promise((resolve) => out.push({ v, resolve }));
  const loop = guessLoop({ send, max, idleMs, timers, onReply: (r, v) => heard.push([r, v]), onSettle: () => { settles += 1; } });
  const flush = () => new Promise((r) => setImmediate(r));
  const answer = async (r = 'ok') => { await flush(); out.shift().resolve(r); await flush(); await flush(); };
  return { loop, out, heard, advance, answer, flush, settles: () => settles };
}

test('throttle: nothing before a stroke; a call after the hand rests idleMs; a new stroke restarts the wait', async () => {
  const t = rig();
  t.loop.now();
  t.advance(10000);
  await t.flush();
  assert.equal(t.out.length, 0, 'an empty paper is never sent');
  t.loop.stroke(); t.loop.rest();
  t.advance(2000);
  t.loop.stroke(); t.loop.rest(); // another stroke before the wait ran out
  t.advance(2000);
  await t.flush();
  assert.equal(t.out.length, 0);
  t.advance(600);
  await t.flush();
  assert.equal(t.out.length, 1, 'one call once the hand rested 2.5 s');
  assert.equal(t.loop.calls, 1);
});

test('throttle: one call out at a time; requests while one is out coalesce to ONE trailing call', async () => {
  const t = rig();
  t.loop.stroke(); t.loop.now();
  await t.flush();
  assert.equal(t.out.length, 1);
  for (let i = 0; i < 5; i++) { t.loop.stroke(); t.loop.now(); t.loop.rest(); t.advance(3000); }
  await t.flush();
  assert.equal(t.out.length, 1, 'never two out');
  assert.equal(t.loop.busy, true);
  await t.answer('first');
  assert.equal(t.out.length, 1, 'the trailing call went as the first came back');
  assert.equal(t.loop.calls, 2);
  await t.answer('second');
  assert.equal(t.out.length, 0, 'and only one');
  assert.deepEqual(t.heard.map(([r]) => r), ['first', 'second']);
  assert.equal(t.settles(), 1, 'settled once nothing was out');
});

test('throttle: an unchanged paper is not sent twice; at most four calls a round', async () => {
  const t = rig();
  t.loop.stroke(); t.loop.now();
  await t.answer();
  t.loop.now();
  await t.flush();
  assert.equal(t.out.length, 0, 'nothing new on the paper');
  for (let i = 0; i < 6; i++) {
    t.loop.stroke(); t.loop.now();
    await t.flush();
    if (t.out.length) await t.answer();
  }
  assert.equal(t.loop.calls, 4);
  assert.equal(t.loop.left, 0);
  t.loop.stroke(); t.loop.rest(); t.advance(5000);
  await t.flush();
  assert.equal(t.out.length, 0);
});

test('throttle: close() sends no more but hears the call out; stop() drops a late reply and every timer', async () => {
  const t = rig();
  t.loop.stroke(); t.loop.now();
  await t.flush();
  t.loop.stroke(); t.loop.now(); // a trailing call owed…
  t.loop.close(); //               …and time runs out
  await t.answer('last look');
  assert.deepEqual(t.heard.map(([r]) => r), ['last look'], 'the call already out still lands');
  assert.equal(t.out.length, 0, 'the owed one never goes');
  assert.equal(t.settles(), 1);

  const u = rig();
  u.loop.stroke(); u.loop.now();
  await u.flush();
  u.loop.stroke(); u.loop.rest();
  u.loop.stop();
  await u.answer('late');
  u.advance(10000);
  await u.flush();
  assert.equal(u.heard.length, 0, 'a reply after stop is dropped');
  assert.equal(u.out.length, 0, 'the rest timer died with the round');
});

test('throttle on the real clock (the default timers, called unbound as a page calls them)', async () => {
  const sent = [];
  const loop = guessLoop({ send: async (v) => { sent.push(v); return 'ok'; }, idleMs: 20 });
  loop.stroke(); loop.rest();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(sent, [1]);
  loop.stop();
});

test('猜者: Ling or 银月; each look is the player\'s short line to her in the game\'s chat, and the engine\'s refusal (not met yet, pet off) is read as such', async () => {
  const { GUESSERS, askGuess, askReveal } = await import('../scripts/games/drawguess.js');
  assert.deepEqual(GUESSERS, ['ling', 'yinyue']);
  // Her name opens the line (her guest turn), Ling's never; a short line, and one note of the reply's shape.
  assert.match(askGuess('yinyue', 1), /^@银月 我画了一样东西，你猜是什么？（.*「猜：」.*）$/);
  assert.match(askGuess('yinyue', 1, null, 'en'), /^@yinyue I drew something.*"Guess: "/);
  assert.doesNotMatch(askGuess('ling', 1), /@|银月/);
  // Where they are rides the round's first look only; later looks are short. She sees the dialogue:
  // nothing restates her earlier guesses, and no brief tells her who she is.
  assert.match(askGuess('yinyue', 1, '腊八夜里'), /^@银月 （腊八夜里）/);
  for (const n of [1, 2, 3]) {
    const line = askGuess('yinyue', n);
    assert.ok([...line].length < 60, `${n}: ${line}`);
    assert.doesNotMatch(line, /先前猜|别再猜|妖王|本王|不调用|\[画猜\]/, line);
  }
  assert.match(askGuess('yinyue', 2), /又添了几笔/);
  // The reveal: the word, won or not, and her feeling and her word on the drawing asked for.
  assert.match(askReveal('yinyue', '鸡', true), /^@银月 对了，就是「鸡」！.*点评/);
  assert.match(askReveal('yinyue', '鸡', false), /^@银月 时间到——我画的是「鸡」。.*懊恼/);
  assert.equal(refusalOf({ status: 'absent', agent_id: 'yinyue' }), 'absent');
  assert.equal(refusalOf({ status: 'unavailable' }), 'unavailable');
  assert.equal(refusalOf({ status: 'started' }), null);
  assert.equal(refusalOf(null), null);
});

test('画猜\'s turn shape (Hanli 10-19): the picture rides a turn in the game\'s own chat — no throwaway session, nothing cleared', async () => {
  const { lookTurn, replyPast } = await import('../scripts/games/drawguess-ling.js');
  const turn = lookTurn({ sid: 'game-sid', agent: 'yinyue', png: 'iVBORw0KGgo', text: '@银月 我画了一样东西，你猜是什么？' });
  assert.deepEqual(turn, { project_root: '', agent_id: 'yinyue', message: '@银月 我画了一样东西，你猜是什么？', session_id: 'game-sid', skill_name: 'lingjing', images: ['iVBORw0KGgo'] });
  assert.equal(lookTurn({ sid: 's', agent: 'yinyue', png: 'x', text: 't', model: 'm1' }).model_id, 'm1');
  const ling = fs.readFileSync(new URL('../scripts/games/drawguess-ling.js', import.meta.url), 'utf8');
  assert.match(ling, /import\('\/shared\/api\.js'\)/, 'sessions and models from the engine\'s api.js');
  for (const gone of [/\/api\/chat\/clear/, /removeSkillSession/, /createSession/, /openRound|closeRound|askOnce|dropOpen/]) assert.doesNotMatch(ling, gone);
  // Her reply is the first of hers past what she had said before the look (the chat holds the day).
  const said = [[{ from: 'yinyue', to: 'user' }, '早先的话'], [{ from: 'yinyue', to: 'user' }, '哼，是鸡。\n猜：鸡']];
  assert.equal(replyPast(said.slice(0, 1), 1), null, 'her earlier line is not this look\'s answer');
  assert.equal(replyPast(said, 1), '哼，是鸡。\n猜：鸡');
  assert.match(ling, /const seen = \(await linesOf\(sid, agent\)\)\.length;\n  const res = await post\('\/api\/chat'/, 'counted before the turn goes');
  const src = fs.readFileSync(new URL('../scripts/games/drawguess.js', import.meta.url), 'utf8');
  assert.match(src, /askInChat\(\{ sid: sessionOf\(\), agent: g\.who, png, text/, 'a guess goes to the game\'s chat');
  assert.match(src, /askInChat\(\{ sid, agent: g\.who, png, text/, 'the reveal too');
  // The page hands the board its chat (the session it is bound to now).
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /deal\.session = \(\) => chat\?\.getSessionId\?\.\(\) \?\? null;/);
});

test('the eraser: its strokes cut the ink (never the paper), and a rub counts as a change the next look sends', async () => {
  assert.equal(strokeOp(Object.assign([[0.5, 0.5, 0]], { erase: true })), 'destination-out');
  assert.equal(strokeOp([[0.5, 0.5, 0]]), 'source-over');
  assert.ok(ERASER > 0.02 && ERASER < 0.2);
  const t = rig();
  t.loop.stroke(); t.loop.now(); //   a stroke, a look
  await t.answer();
  t.loop.now();
  await t.flush();
  assert.equal(t.out.length, 0, 'nothing new: no look');
  t.loop.stroke(); t.loop.rest(); //  the eraser drawn across it (the page calls stroke() for a rub as for ink)
  t.advance(2600);
  await t.flush();
  assert.equal(t.out.length, 1, 'the rubbed paper is new paper');
  const src = fs.readFileSync(new URL('../scripts/games/drawguess.js', import.meta.url), 'utf8');
  assert.match(src, /if \(g\.tool === 'eraser'\) g\.cur\.erase = true;\s*g\.loop\.stroke\(\);/, 'a rub starts as a change, like ink');
  assert.doesNotMatch(src, /data-k="undo"/, '撤一笔 is gone');
  assert.match(src, /data-k="pen"/);
  assert.match(src, /data-k="eraser"/);
  assert.match(src, /data-k="clear"/);
});

test('the module keeps the contract and the registry places it in the 游戏厅 only', async () => {
  const src = fs.readFileSync(new URL('../scripts/games/drawguess.js', import.meta.url), 'utf8');
  assert.match(src, /export function mount\(/);
  assert.doesNotMatch(src, /<svg/i, 'nothing drawn as SVG: the paper and his strokes only');
  assert.ok(!ROW.task && !ROW.scene, 'the first row is the 游戏厅\'s own');
  const story = reg.games.filter((g) => g.id === 'drawguess' && g.task);
  assert.deepEqual(story.map((g) => g.task), ['jiaxin-letter'], 'the story\'s 家信 is its second row (tests/drawguess-story.test.mjs)');
});

test('the 游戏厅\'s 试玩 of a game the model plays (Hanli 10-19) is the real game page on a test save, the board on its stage', async () => {
  const read = (p) => fs.readFileSync(new URL(`../scripts/${p}`, import.meta.url), 'utf8');
  assert.ok(!fs.existsSync(new URL('../scripts/arcade-trace.js', import.meta.url)), 'the side panel is gone');
  const { arcadePlayUrl, arcadeGameOf, arcadeRow, isArcadeBoard, withArcade, ARCADE_SEED } = await import('../scripts/arcade-board.js');
  assert.equal(arcadePlayUrl('drawguess'), `index.html?save=arcade-drawguess&seed=${ARCADE_SEED}&board=drawguess`);
  // The fixture it begins from has 银月 joined and awake (the engine's gate, SKILL.md absent_until).
  const fixture = JSON.parse(fs.readFileSync(new URL(`fixtures/saves/${ARCADE_SEED}.json`, import.meta.url), 'utf8'));
  assert.ok((fixture.state ?? fixture).companion?.joined && (fixture.state ?? fixture).companion?.awake);
  // `board=` is a test save's only: the main page never stands it.
  assert.equal(arcadeGameOf('?save=arcade-drawguess&board=drawguess', 'arcade-drawguess'), 'drawguess');
  assert.equal(arcadeGameOf('?board=drawguess', null), null);
  assert.equal(arcadeGameOf('?save=x&board=../x', 'x'), null);
  // The game's own registry row deals it; on Look it is a light board standing open, hers to guess.
  const row = arcadeRow(reg, 'drawguess');
  assert.ok(row && !row.task && row.data.words.length);
  const look = withArcade({ tasks: [{ id: 'x' }] }, 'drawguess', { row, title: '画猜' });
  const t = look.tasks.find((x) => isArcadeBoard(x.id));
  assert.deepEqual({ id: t.id, kind: t.kind, game: t.game, light: t.light, open: t.open, her: t.her, who: t.deal.who, fixed: t.deal.fixed }, { id: 'arcade:drawguess', kind: 'board', game: 'drawguess', light: true, open: true, her: true, who: 'yinyue', fixed: true });
  assert.equal(withArcade(look, 'drawguess', { row }), look, 'once');
  assert.equal(withArcade(look, null), look);
  const { stageCards } = await import('../scripts/stage.mjs');
  assert.ok(stageCards({ tasks: look.tasks }).some((c) => c.card === 'board' && c.id === 'arcade:drawguess'), 'on the stage');
  // The arcade links an AI game there (an old ?game= link too), and never plays it beside a panel of its own.
  const arcade = read('arcade.js');
  assert.match(arcade, /mod\?\.meta\?\.ai \? arcadePlayUrl\(g\.id\)/);
  assert.match(arcade, /if \(mod\?\.meta\?\.ai\) \{ location\.replace\(arcadePlayUrl\(id\)\); return; \}/);
  assert.doesNotMatch(arcade, /arcade-trace|onTrace|hergame|seam|stub/);
  // The page: a win there pays nothing and deals it again; the hold is the story's (`arcade:<game>`, rules/hergame.mjs).
  const page = read('lingjing.js');
  assert.match(page, /if \(isArcadeBoard\(taskId\)\) return arcadeWon\(taskId, grade\);/);
  assert.match(page, /look = withArcade\(seen, ARCADE_GAME, arcadeDeal\);/);
});
