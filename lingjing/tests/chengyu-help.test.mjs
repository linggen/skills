// 成语接龙 on 钱掌柜 · 一罐回春丹 (Hanli 2026-11-04, the Mac): 听风是雨 and 定国安民 refused 「不在成语谱里」, 定国安民 again under
// hint 2's 定国安□ — 「好像卡住了」 at 2/4; and 「输入框会失去焦点，当AI说话后」. Then: 「问ling或者yinyue应该提供帮助, 不能不管玩家」 ·
// 「chengyu.json查不到不用主动查ai, 可以加一个按钮求助yinyue, 让银月帮忙」. The fuller list, a hint that never contradicts it,
// a way past every link, 求助 (one model turn on his tap; the page holds what it does), and the box that keeps the keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CHAIN_TRIES, chainChoices, chainHint, chainOf, checkLink, dictOf, freshChain, helpLine, helpOf, helpWords, needOf, nearLink, nextsOf,
  playLink, replyOf, wayOn,
} from '../scripts/games/jinchat-games.js';
import { chainGame, focusKeeper } from '../scripts/games/jinchat-play.js';
import { loadContent } from '../scripts/content.mjs';
import { pageWordBoard, reveal, STUCK_TRIES, wordBoardLook } from '../scripts/rules/wordboard.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const REG = JSON.parse(read('../worlds/jiuding/games.json'));
const CHATS = REG.games.find((g) => g.id === 'jinchat' && !g.task).data.chats;
const CHAINS = Object.entries(CHATS).filter(([, c]) => c.game?.kind === 'chain');
const DOC = JSON.parse(read('../worlds/jiuding/chengyu.json'));
const DICT = dictOf(DOC);
const COMMON = new Set(DICT.words);
// His board as it stood: 钱 opened, he linked to 听, then 听天由命, and 钱 answered 命中注定.
const QIAN = ['奇货可居', '居安思危', '危言耸听', '听天由命', '命中注定'];
const at = (said) => ({ ...freshChain({ start: said[0] }), said, who: said.map((_, i) => (i % 2 ? 'me' : 'them')) });

/* ════════ the list ════════ */

test('the fuller list: his two idioms, 定国安邦, 命中注定 and twenty common ones; four Han characters each; the notices travel', () => {
  for (const w of ['定国安民', '听风是雨', '定国安邦', '命中注定', '听天由命']) assert.ok(DICT.set.has(w), w);
  const common = ['一鸣惊人', '画蛇添足', '守株待兔', '亡羊补牢', '杯弓蛇影', '对牛弹琴', '井底之蛙', '狐假虎威', '掩耳盗铃', '刻舟求剑',
    '拔苗助长', '自相矛盾', '叶公好龙', '望梅止渴', '卧薪尝胆', '破釜沉舟', '负荆请罪', '纸上谈兵', '四面楚歌', '指鹿为马'];
  for (const w of common) assert.ok(DICT.set.has(w), w);
  assert.ok(DICT.set.size > 40000, `${DICT.set.size} idioms`);
  assert.ok([...DICT.set].every((w) => /^\p{Script=Han}{4}$/u.test(w)), 'four characters each');
  // `words` stays the common tier the page plays from — mined junk (同轴电缆) is never theirs to say.
  assert.ok(!COMMON.has('同轴电缆') && !COMMON.has('博拉尔德'));
  assert.equal(DOC.n, DICT.words.length);
  assert.equal(DOC.n + DOC.n_more, DICT.set.size, 'no idiom in both tiers');
  assert.match(DOC._about, /定国安民, 听风是雨; 2026-11-04/, 'the hand-kept supplement said');
  // Small enough for the phone's pack.
  assert.ok(Buffer.byteLength(JSON.stringify(DOC)) < 600 * 1024);
});

test('his board: 听风是雨 links from 听, 定国安民 from 定 — both taken', () => {
  assert.deepEqual(checkLink(DICT, at(QIAN.slice(0, 3)), '听风是雨'), { v: 'right', word: '听风是雨' });
  assert.deepEqual(checkLink(DICT, at(QIAN), '定国安民'), { v: 'right', word: '定国安民' });
  assert.equal(checkLink(DICT, at(QIAN), '定国安邦').v, 'right');
});

/* ════════ the hint and the list agree ════════ */

test('lint: every idiom the page or the person can say — opening, reply, hint, choice — is in the list, and in its common tier', () => {
  for (const [id, c] of CHAINS) {
    const ch = chainOf(c.game, 'zh');
    assert.ok(COMMON.has(ch.start), `${id}: 「${ch.start}」`);
    // Walk every chain a few ways (the commonest, the second, the third way on at each of his links).
    for (const k of [0, 1, 2]) {
      let st = freshChain(ch);
      for (let n = 0; n < ch.links; n += 1) {
        const way = wayOn(DICT, st);
        assert.ok(way && COMMON.has(way), `${id}: the way on from 「${st.said.at(-1)}」`);
        assert.equal(checkLink(DICT, st, way).v, 'right', `${id}: the way on links`);
        for (const lv of [1, 2]) {
          const h = chainHint(DICT, st, lv);
          assert.ok(way.startsWith(h.replace(/□/g, '')), `${id}: hint ${lv} 「${h}」 is the way on's`);
          // Whatever fits the revealed characters and is in the list is taken; a fit not in the list, under hint 2, is near.
          const shown = h.replace(/□/g, '');
          for (const w of [...DICT.set].filter((x) => x.startsWith(shown)).slice(0, 20)) if (!st.said.includes(w)) assert.equal(checkLink(DICT, st, w).v, 'right', `${id}: 「${w}」 fits 「${h}」`);
          if (lv === 2) assert.ok(nearLink(st, `${shown}囧`, h), `${id}: 「${h}」 with any last character is near`);
        }
        const four = chainChoices(DICT, st);
        assert.equal(four.filter((w) => checkLink(DICT, st, w).v === 'right').length, 1, `${id}: one right among the four`);
        assert.ok(four.every((w) => COMMON.has(w)), `${id}: the choices are common idioms`);
        const mine = nextsOf(DICT, needOf(st), st.said)[k] ?? way;
        st = playLink(st, mine, 'me');
        const r = replyOf(DICT, st.said);
        if (!r) break;
        // The person's own link passes the same check his do, and is a common idiom.
        assert.ok(COMMON.has(r), `${id}: 「${r}」 theirs`);
        assert.equal(checkLink(DICT, { ...st, said: st.said }, r).v, 'right', `${id}: 「${r}」 links`);
        st = playLink(st, r, 'them');
      }
    }
  }
});

test('near: hint 2 shows three characters and his keeps them, the last his own — taken; anything else is not', () => {
  const st = at(QIAN);
  assert.ok(nearLink(st, '定国安民', '定国安□'));
  assert.ok(!nearLink(st, '定国安民', '定国□□'), 'hint 1 is no promise');
  assert.ok(!nearLink(st, '定国平民', '定国安□'));
  assert.ok(!nearLink(st, '定国安', '定国安□'));
  assert.ok(!nearLink({ ...st, said: [...QIAN, '定国安民'] }, '定国安民', '定国安□'), 'never twice');
});

/* ════════ the board played: a fake strip, the real chainGame ════════ */

function board({ helper = null, help = null, game = CHATS['qian-dan'].game } = {}) {
  const said = [], logs = [], focused = [];
  let html = '', input = null, form = null, buttons = {};
  const mk = () => ({ handlers: {}, addEventListener(t, f) { this.handlers[t] = f; } });
  const strip = {
    set innerHTML(v) {
      html = v;
      input = { ...mk(), value: '', focus: () => focused.push('box') };
      form = mk();
      buttons = {};
      for (const k of ['is-hint', 'is-help', 'is-pass']) if (html.includes(`g-jc-gbtn ${k}`)) buttons[k] = { ...mk(), disabled: new RegExp(`${k}"[^>]* disabled`).test(html) };
    },
    get innerHTML() { return html; },
    querySelector: (sel) => (sel === '.g-jc-in' ? input : sel === 'form' ? form : sel.startsWith('.is-') ? buttons[sel.slice(1)] ?? null : null),
    querySelectorAll: (sel) => (sel === '[data-pick]' ? [...html.matchAll(/data-pick="([^"]+)"/g)].map(([, v]) => ({ dataset: { pick: v }, ...mk() })) : []),
  };
  const ctx = {
    chat: { ...CHATS['qian-dan'], game }, cast: [{ id: 'qian', name: '钱掌柜' }], lang: 'zh', w: WORDS, id: 'qian-dan',
    root: { querySelector: () => strip, querySelectorAll: () => [] },
    add: (l) => said.push(l), typeOut: async (ls) => { for (const l of ls) said.push(l); }, react: async () => 0, settle: async () => {},
    sound: () => {}, foot: () => {}, log: (r) => logs.push(r), dict: async () => DICT,
    ...(helper ? { helper, help } : {}),
  };
  const done = chainGame(ctx);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const type = async (word) => { await tick(); input.value = word; form.handlers.submit({ preventDefault() {} }); await tick(); };
  const tap = async (k) => { await tick(); buttons[k].handlers.click(); await tick(); await tick(); };
  return { said, logs, focused, done, type, tap, ready: async () => { await tick(); await tick(); }, has: (k) => Boolean(buttons[k]), html: () => html, notes: () => said.filter((l) => l.who === 'note').map((l) => l.text) };
}
// The page's words for the game (jinchat.js T.zh), read from the module's source so the test needs no DOM.
const WORDS = await (async () => {
  const src = read('../scripts/games/jinchat.js');
  const zh = src.slice(src.indexOf('  zh: {'), src.indexOf('  en: {'));
  // eslint-disable-next-line no-new-func
  return Function(`return {${zh.replace(/^\s*zh: \{/, '').replace(/\},\s*$/, '')}}`)();
})();

test('a word not in the list costs no star but counts: after three refusals on one link, the ways past it open', async () => {
  const b = board();
  for (let k = 0; k < CHAIN_TRIES - 1; k += 1) await b.type('居怪怪怪');
  assert.ok(!b.has('is-pass'), 'not yet');
  await b.type('居怪怪怪');
  assert.ok(b.has('is-pass'), '请钱掌柜接 after three');
  assert.match(b.html(), /请钱掌柜接/);
  assert.match(b.html(), /data-pick=/, 'and the four choices');
  await b.tap('is-pass');
  assert.match(b.notes().at(-1), /^钱掌柜替你接了「居.{3}」$/);
  assert.ok(!b.has('is-pass'), 'a new link, its own count');
  const theirs = b.said.filter((l) => l.who === 'qian').map((l) => l.text);
  assert.equal(theirs.length, 2, 'the chain went on: 钱 answered');
});

test('near after hint 2: a fit to 「X Y Z □」 not in the list is taken with the list\'s own named', async () => {
  const b = board();
  await b.type('居怪怪怪');
  await b.type('居怪怪怪'); // two refusals (no miss): ask the hints by hand, as he did
  await b.tap('is-hint');
  await b.tap('is-hint');
  const hint = b.notes().filter((t) => t.startsWith('提示2：')).at(-1).slice(4);
  assert.match(hint, /^居..□$/);
  // A last character of his own that is not in the list and that 钱 can follow from.
  const mine = [...'人天心生民事年意'].map((c) => `${hint.slice(0, 3)}${c}`).find((x) => !DICT.set.has(x) && nextsOf(DICT, [...x].at(-1), []).length);
  assert.equal(checkLink(DICT, freshChain({ start: '奇货可居' }), mine).v, 'unknown');
  await b.type(mine);
  assert.match(b.notes().at(-1), /^谱里记的是「居..[^□]」，这条也算你接上$/);
  assert.equal(b.said.filter((l) => l.who === 'qian').length, 2, 'taken; 钱 answered');
});

test('求助: one model turn per tap, with the facts; `accept` takes only a word of his this link refused; `whisper` shows the page\'s way', async () => {
  const asked = [];
  const reply = { text: '' };
  const help = async (line) => { asked.push(line); return { text: reply.text }; };
  const b = board({ helper: { id: 'yinyue', name: '银月' }, help });
  await b.ready();
  assert.ok(b.has('is-help'), '求助银月 beside 提示');
  assert.match(b.html(), /求助银月/);
  await b.type('居心叵人'); // refused, not in the list
  // She vouches for a word he never typed: nothing is taken.
  reply.text = '银月：本王说算就算。\n<!--accept:居安思危-->';
  await b.tap('is-help');
  assert.equal(asked.length, 1, 'one turn for one tap');
  assert.match(asked[0], /^\[HIDDEN\] \[jinchat\] /);
  assert.match(asked[0], /要接的是「居」字开头的成语/);
  assert.match(asked[0], /这一条他试过、页面没收的：「居心叵人」/);
  assert.match(asked[0], /一条接得上的（页面的）：「居.{3}」/);
  assert.equal(b.said.filter((l) => l.who === 'qian').length, 1, 'no link from a word he never said');
  // She vouches for his refused word: taken.
  reply.text = '银月：这是成语，谱里没收罢了。\n<!--accept:居心叵人-->';
  await b.tap('is-help');
  assert.equal(asked.length, 2);
  assert.equal(b.notes().at(-1), '银月说「居心叵人」是成语，算你接上');
  assert.equal(b.said.filter((l) => l.who === 'qian').length, 2, '钱 answered');
  // Whisper: the page's own way on, never one of her text.
  reply.text = '银月：凑过来——<!--whisper-->';
  await b.tap('is-help');
  assert.match(b.notes().at(-1), /^一条接得上的：「.{4}」$/);
  // No answer (timeout, no model): a plain note, the board plays on.
  reply.text = '';
  await b.tap('is-help');
  assert.equal(b.notes().at(-1), '银月这会儿没回话');
  assert.equal(asked.length, 4);
});

test('helpOf holds her marks: accept only a refused word that heads right; whisper only with a way on; the marks never shown', () => {
  const o = { rejected: ['定国安民'], need: '定', way: '定国安邦' };
  assert.deepEqual(helpOf('是成语。<!--accept:定国安民-->', o), { accept: '定国安民' });
  assert.deepEqual(helpOf('<!-- accept：「定国安民」 -->', o), { accept: '定国安民' });
  assert.equal(helpOf('<!--accept:定国安邦-->', o), null, 'not his refused word');
  assert.equal(helpOf('<!--accept:安国定民-->', { ...o, rejected: ['安国定民'] }), null, 'heads wrong');
  assert.deepEqual(helpOf('悄悄话<!--whisper-->', o), { whisper: '定国安邦' });
  assert.equal(helpOf('<!--whisper-->', { ...o, way: null }), null);
  assert.equal(helpOf('随便说说', o), null);
  assert.equal(helpWords('这是成语。\n<!--accept:定国安民-->'), '这是成语。');
  const line = helpLine(CHATS['qian-dan'], { need: '定', said: QIAN, hint: '定国安□', rejected: ['定国安民'], way: '定国安邦' });
  assert.match(line, /页面亮出的提示：「定国安□」/);
  assert.match(line, /<!--accept:那条成语-->/);
  assert.match(line, /<!--whisper-->/);
});

test('no helper (no one to ask): no 求助 button; the page is the same game', async () => {
  const b = board();
  await b.ready();
  assert.ok(b.html().includes('is-hint'));
  assert.ok(!b.has('is-help'));
});

/* ════════ Look: the stuck facts, the rule ════════ */

const content = loadContent();
const now = new Date('2026-11-04T15:00:00');
test('Look carries the stuck facts after two refusals; the rule lets her say a word is real, and never call a hint\'s fit wrong', () => {
  const s0 = { scene: null, tasks: {} };
  const o = pageWordBoard(content, s0, { action: 'open', chat: 'qian-dan', kind: 'chain', face: '命中注定', answer: '定国安邦' }, now).keep;
  assert.equal(wordBoardLook(o, now).word_board.stuck, undefined, 'not yet stuck');
  const s = pageWordBoard(content, o, { action: 'step', chat: 'qian-dan', hints: JSON.stringify(['定国□□', '定国安□']), tries: STUCK_TRIES, rejected: JSON.stringify(['定国安民']) }, now).keep;
  const wb = wordBoardLook(s, now, 'Whisper').word_board;
  assert.equal(wb.stuck, true);
  assert.equal(wb.tries, 2);
  assert.deepEqual(wb.rejected, ['定国安民']);
  assert.deepEqual(wb.hints, ['定国□□', '定国安□']);
  assert.ok(!JSON.stringify(wb).includes('定国安邦'), 'never the answer untold');
  assert.match(wb.rule, /Asked whether a word is a real idiom, phrase or line, answer truthfully/);
  assert.match(wb.rule, /「X是成语，谱里没收」/);
  assert.match(wb.rule, /never call wrong what fits a shown hint/);
  assert.match(wb.rule, /Stuck \(`stuck`\) or asking for help: help — offer to whisper it; on his yes, or his outright ask, call Whisper/);
  // A chain's Reveal hands only the way on: the chain goes on, nothing skipped.
  const r = reveal(s, content, { now, quests: [] });
  assert.equal(r.result.ok, true);
  assert.equal(r.result.answer, '定国安邦');
  assert.equal(r.result.told, false);
  assert.equal(r.state.word_board.told, undefined);
  assert.equal(pageWordBoard(content, r.state, { action: 'peek', chat: 'qian-dan' }, now).result.told, null, 'the page plays on');
  // The next link: the way told for this one goes.
  const n = pageWordBoard(content, r.state, { action: 'step', chat: 'qian-dan', face: '民不聊生', answer: '生龙活虎', tries: 0, rejected: '[]' }, now).keep;
  assert.equal(n.word_board.whispered, undefined);
  assert.equal(wordBoardLook(n, now).word_board.stuck, undefined);
});

test('「X不是成语吗？」 — the hidden line\'s rule, every word game\'s, says to answer it truthfully', async () => {
  const { chainLine } = await import('../scripts/games/jinchat-games.js');
  const zh = chainLine(CHATS['qian-dan'], { event: 'open', ch: chainOf(CHATS['qian-dan'].game, 'zh'), cast: [{ id: 'qian', name: '钱掌柜' }], lang: 'zh' });
  assert.match(zh, /他问某个词是不是成语、是不是真有这句，照实答——成语谱没收的真成语也有，就说「X是成语，谱里没收」/);
  assert.match(zh, /合页面提示的，别说成错/);
  assert.doesNotMatch(zh, /也别说它不是什么/, 'the line that made Ling refuse (「我不能替钱掌柜判定」) is gone');
});

/* ════════ the box keeps the keys ════════ */

function dom({ touch = false } = {}) {
  const on = {}, docOn = {};
  const inside = new Set();
  const doc = { body: { id: 'body' }, activeElement: null, addEventListener: (t, f) => { docOn[t] = f; }, removeEventListener: () => {} };
  const box = { classList: { contains: (c) => c === 'g-jc-in' }, closest: () => null, disabled: false, focus() { doc.activeElement = box; } };
  const root = { isConnected: true, addEventListener: (t, f) => { on[t] = f; }, contains: (el) => el === box || inside.has(el), querySelectorAll: () => [box] };
  doc.activeElement = doc.body;
  const k = focusKeeper({ root, doc, touch });
  return { k, doc, box, root, on, docOn, inside };
}
test('focus: after their line lands (the card re-laid, the box blurred) the box has it again; not when he clicked away; never by itself on a phone', () => {
  const d = dom();
  d.k.focus();
  assert.equal(d.doc.activeElement, d.box, 'the Mac: the box from the first step');
  // The stage's redraw lays the card into a new host: the box is blurred, the focus on the body. Their line lands.
  d.doc.activeElement = d.doc.body;
  d.k.focus();
  assert.equal(d.doc.activeElement, d.box, 'back in the box');
  // A button of the board's own (提示) had it: the box takes it back.
  const hintBtn = { closest: (s) => (s.includes('.g-jc-game') ? {} : null) };
  d.inside.add(hintBtn);
  d.docOn.pointerdown({ target: hintBtn });
  d.doc.activeElement = hintBtn;
  d.k.focus();
  assert.equal(d.doc.activeElement, d.box);
  // He clicked somewhere else on the page on purpose: left there.
  const elsewhere = { id: 'askField' };
  d.docOn.pointerdown({ target: elsewhere });
  d.doc.activeElement = elsewhere;
  d.k.focus();
  assert.equal(d.doc.activeElement, elsewhere, 'never stolen');
  d.doc.activeElement = d.doc.body; // even once that is gone
  d.k.focus();
  assert.equal(d.doc.activeElement, d.doc.body, 'he left it; it stays left');
  // Back into the box himself: kept again.
  d.on.focusin({ target: d.box });
  d.doc.activeElement = d.doc.body;
  d.k.focus();
  assert.equal(d.doc.activeElement, d.box);
  // The phone: never by itself (the keyboard); once he tapped in, kept.
  const p = dom({ touch: true });
  p.k.focus();
  assert.equal(p.doc.activeElement, p.doc.body, 'no keyboard popped');
  p.on.focusin({ target: p.box });
  p.doc.activeElement = p.doc.body;
  p.k.focus();
  assert.equal(p.doc.activeElement, p.box, 'already his: kept');
});

test('every word game\'s box goes through the keeper, and the free chat\'s too; each box marked for the stage\'s restoreFocus', () => {
  const play = read('../scripts/games/jinchat-play.js');
  assert.equal((play.match(/focusIn\(ctx, input\);/g) ?? []).length, 4, 'riddle · couplet · chain · 二十问');
  assert.doesNotMatch(play, /input\.focus\(\{ preventScroll: true \}\);\n/);
  assert.equal((play.match(/<input class="g-jc-in" data-jc-in=""/g) ?? []).length, 4);
  const page = read('../scripts/games/jinchat.js');
  assert.match(page, /const \{ focus \} = focusKeeper\(\{ root, doc, touch, signal \}\);/);
  assert.match(page, /const add = \(line\) => \{ g\.shown\.push\(line\); g\.els\.push\(list\.add\(line\)\); focus\(\); \};/, 'after every line laid');
  assert.match(page, /setInterval\(\(\) => \{ list\.keepDown\(\); focus\(\); \}, 300\)/, 'and after the stage re-lays the card');
  assert.match(page, /<input class="g-jc-in" data-jc-in=""/);
  assert.match(page, /const touch = typeof data\.ask === 'function'/, 'the phone host is a touch screen');
});

test('three 不算错 refusals open the ways past but cost nothing: linked by his own hand after, the chain is still 3 stars', async () => {
  const b = board({ game: { ...CHATS['qian-dan'].game, after: undefined } });
  for (let k = 0; k < CHAIN_TRIES; k += 1) await b.type('居怪怪怪');
  assert.ok(b.has('is-pass'));
  const words = () => b.said.filter((l) => l.who === 'qian' || (l.who === 'me' && l.html)).map((l) => l.text);
  for (let n = 0; n < chainOf(CHATS['qian-dan'].game, 'zh').links; n += 1) {
    const said = words();
    if (!b.html()) break; // won (or 钱 ran out)
    await b.type(nextsOf(DICT, [...said.at(-1)].at(-1), said)[0]);
  }
  const o = await b.done;
  assert.equal(o.won, true);
  assert.equal(o.stars, 3, 'no chip, no 请钱掌柜接, no hint: three stars');
});

test('Look calls a couplet or a riddle stuck after two misses too', () => {
  const s0 = { scene: null, tasks: {} };
  const o = pageWordBoard(content, s0, { action: 'open', chat: 'qichangsong', kind: 'couplet', face: '宝剑锋从磨砺出', answer: '梅花香自苦寒来' }, now).keep;
  const s = pageWordBoard(content, o, { action: 'step', chat: 'qichangsong', tries: 2 }, now).keep;
  assert.equal(wordBoardLook(s, now).word_board.stuck, true);
  assert.equal(wordBoardLook(s, now).word_board.tries, 2);
  const play = read('../scripts/games/jinchat-play.js');
  assert.match(play, /if \(!hint\) keep\(ctx, 'step', \{ tries: st\.misses \}\);/, 'the riddle says each miss');
  assert.match(play, /keep\(ctx, 'step', \{ tries: st\.misses \}\); \/\/ Look hears how many/, 'the couplet too');
});
