// jinchat-games.js — the word games a 对话 board plays (Hanli 2026-10-27, of 「银月 · 最后一颗」: 「这个对话小游戏好像不太合理,
// 好玩」 → 「AI对话可以对对子, 猜谜语等」 · 「猜动物也行, 心里像一个, 对方猜, 只能回答是或者不是. AI猜玩家心里的」). A chat
// whose data carries a `game` is no longer a free chat with a hidden goal: it is a classic word game played with the
// person, the goal on the page. The pure half — the page decides every right and wrong from data, never the model.
//
//   riddle   猜谜 · 字谜 · 考书: the person sets it (`q`), he answers in the box. Right is his answer against the
//            data's list (`answers`), never a model's say (live 10-27: a model invented a puzzle's answer). Hints come in
//            tiers (`hints`), the choices (`choices`) after `tries` misses; 跳过 always. Solved or not, the story goes on.
//   guess    反着的二十问: he thinks of an animal — any animal (Hanli 10-28: 「别固定30种动物, 全部动物都可以」) — they
//            ask yes or no and he taps 是 · 不是 · 不知道 — no typing. Their questions and guesses are the model's, free
//            (`freeLine`); the page holds each to yes-or-no (`yesNoOf`) and counts; he alone knows the answer, so his 对 is
//            the only win of theirs. A turn the model cannot give is the table's (worlds/<id>/aigames.json
//            `twenty.reverse`: the question that best splits the animals still possible), never shown. Missed, he types
//            what it was, once.
//
// Who writes what (design.md: Ling writes every word a player reads; code gives facts): the riddle, its hints and its
// answers are data (a puzzle's face, like riddles/zh.json); the person's own bubbles are the model's — a lead-in, a
// jab at a wrong guess, the questions in their voice (in the open 二十问, every question and guess of theirs, one turn each, `freeLine`)
// — each handed the page's verdict as a fact and never the answer before he has it. No model, every game still plays:
// the questions' plain wording is data, and the book's own lines close it.

import { checkCouplet, hanOf } from '../couplet.js';

const pick = (v, lang) => (v == null ? '' : typeof v === 'string' ? v : v[lang] ?? v.zh ?? '');
const list = (v, lang) => (Array.isArray(v) ? v : v?.[lang] ?? v?.zh ?? []);
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

/* ════════ 猜谜 ════════ */

const FILL_ZH = /^(我猜|我觉得|应该是|大概是|是不是|就是|莫非是|难道是|那就是|是)+|(吧|吗|嘛|呀|啊|呢|咯|喽|了|的)+$/g;
const FILL_EN = /^(i think|i guess|my guess is|maybe|perhaps|is it|it's|it is|its|you have)\s+|\b(a|an|the|your|her|his)\b\s*/g;
const NEG = { zh: /(不是|不要|不|没|没有|别|莫)$/, en: /^(not|no|never|isn't|isnt)$/ };
/** His answer as compared: lower case, no spaces or marks, no filler (「我猜是……吧」, "I think it's a …"). */
export function normAnswer(s, lang = 'zh') {
  let t = String(s ?? '').toLowerCase().trim();
  if (lang === 'en') return t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().replace(FILL_EN, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/[\s\p{P}\p{S}]/gu, '');
  let prev;
  do { prev = t; t = t.replace(FILL_ZH, ''); } while (t !== prev && t);
  return t;
}

/** The riddle as this language plays it: `{ q, answers, hints, choices, tries }` (a 字谜 is Chinese only: its `en` is
    another riddle with the same answer in meaning, never a translation). */
export function riddleOf(game, lang = 'zh') {
  const g = game?.[lang] ?? game?.zh ?? game ?? {};
  return {
    q: pick(g.q ?? game?.q, lang),
    answers: list(g.answers ?? game?.answers, lang),
    hints: (g.hints ?? game?.hints ?? []).map((h) => pick(h, lang)),
    choices: list(g.choices ?? game?.choices, lang),
    tries: Number(game?.tries) || 3,
    kind: pick(g.label ?? game?.label, lang),
  };
}

/** His answer, judged by the data alone: 'right' · 'wrong' · 'empty'. Right is his words naming one of the answers —
    the same after the filler goes, or (an answer two characters or more, or a word in English) inside what he said; a
    denial (「不是丹」) is never right. */
export function checkRiddle(riddle, raw, lang = 'zh') {
  const said = normAnswer(raw, lang);
  if (!said) return 'empty';
  const all = riddle.answers.map((a) => normAnswer(a, lang)).filter(Boolean);
  if (all.includes(said)) return 'right';
  // An answer inside what he said counts unless a denial stands right before it (「不是丹药」, "not a pill").
  const denied = (i) => NEG[lang === 'en' ? 'en' : 'zh'].test(lang === 'en' ? said.slice(0, i).split(' ').filter(Boolean).at(-1) ?? '' : said.slice(Math.max(0, i - 2), i));
  for (const n of all) {
    if (lang === 'en') {
      const m = new RegExp(`(^| )${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?( |$)`).exec(said);
      if (m && !denied(m.index + m[1].length)) return 'right';
    } else if (n.length >= 2 && said.includes(n) && !denied(said.indexOf(n))) return 'right';
  }
  return 'wrong';
}

/** How a riddle came out: solved with no hint and no choices → 3; solved after them → 2; skipped or never solved → 1.
    Every way is `won` (the story goes on; the 今 pays nothing, a 古 board pays as before). */
export function riddleOutcome({ solved = false, hints = 0, choices = false } = {}) {
  if (solved && !hints && !choices) return { over: true, won: true, grade: 'solved', stars: 3 };
  if (solved) return { over: true, won: true, grade: 'hinted', stars: 2 };
  return { over: true, won: true, grade: 'skipped', stars: 1 };
}

/* ════════ 反着的二十问 ════════ */

/** The animals and questions of the table (aigames.json `twenty.reverse` + `twenty.animals`): each animal's answer to a
    question is 'y', 'n' or '?' (either may be said honestly: never held against him). */
export function tableOf(twenty) {
  const rev = twenty?.reverse ?? {};
  const qs = rev.questions ?? [];
  const animals = (twenty?.animals ?? []).filter((a) => rev.table?.[a.id]).map((a) => {
    const row = rev.table[a.id];
    const ans = Object.fromEntries(qs.map((q) => [q.id, (row.y ?? []).includes(q.id) ? 'y' : (row.m ?? []).includes(q.id) ? '?' : 'n']));
    return { id: a.id, name: a.name, alias: a.alias, ans };
  });
  return { questions: qs, animals, max: Number(rev.max) || 18, guess: rev.guess ?? { zh: '是不是{x}？', en: 'Is it a {x}?' } };
}

export const freshGuess = () => ({ asked: [], wrong: [], n: 0, over: false });

/* How far an animal is from what he said: one for each yes said to its 'n', or no to its 'y'. */
const misfit = (a, asked) => asked.reduce((k, x) => k + ((x.a === 'yes' && a.ans[x.q] === 'n') || (x.a === 'no' && a.ans[x.q] === 'y') ? 1 : 0), 0);

/** The animals still possible: the ones his answers fit best (none against, if any; else the fewest — a slip of his is
    forgiven), less every guess he said 不对 to. In the table's order (the commoner first). */
export function stillPossible(table, st) {
  const pool = table.animals.filter((a) => !st.wrong.includes(a.id));
  if (!pool.length) return [];
  const best = Math.min(...pool.map((a) => misfit(a, st.asked)));
  return best > 1 ? [] : pool.filter((a) => misfit(a, st.asked) === best);
}

/* A question's worth over the animals left: the smaller side of its split (a '?' counts half to each). */
const splitOf = (q, cands) => {
  let y = 0, n = 0;
  for (const a of cands) { const v = a.ans[q.id]; if (v === 'y') y += 1; else if (v === 'n') n += 1; else { y += 0.5; n += 0.5; } }
  return Math.min(y, n);
};

/** What they do next: `{ kind: 'ask', q }` the question that splits best; `{ kind: 'guess', animal }` when one is left,
    no question splits any more, or one question is all that is left; `{ kind: 'giveup' }` at the cap or with nothing
    possible. Every ask and every guess is one of the `max`. */
export function nextMove(table, st) {
  if (st.n >= table.max) return { kind: 'giveup' };
  const cands = stillPossible(table, st);
  if (!cands.length) return { kind: 'giveup' };
  const used = new Set(st.asked.map((x) => x.q));
  let best = null, worth = 0;
  for (const q of table.questions) {
    if (used.has(q.id)) continue;
    const w = splitOf(q, cands);
    if (w > worth) { best = q; worth = w; }
  }
  if (cands.length === 1 || !best || worth < 1 || st.n >= table.max - 1) return { kind: 'guess', animal: cands[0] };
  return { kind: 'ask', q: best };
}

/** His tap to a question: 'yes' · 'no' · 'unknown'. */
export function answerGuess(st, qid, a) {
  return { ...st, asked: [...st.asked, { q: qid, a }], n: st.n + 1 };
}
/** His 对 or 不对 to a guess: the only way they win. */
export function judgeGuess(st, id, right) {
  return right ? { ...st, n: st.n + 1, over: true, won: id } : { ...st, n: st.n + 1, wrong: [...st.wrong, id] };
}

/** How it came out, for him: they never got it → 3 (stumped them); they got it → 2; skipped → 1. Always `won`. */
export function guessOutcome(st, { skipped = false } = {}) {
  if (skipped) return { over: true, won: true, grade: 'skipped', stars: 1 };
  return st.won ? { over: true, won: true, grade: 'guessed', stars: 2 } : { over: true, won: true, grade: 'stumped', stars: 3 };
}

/** The result as one line of fact (their last bubble is told it; the log keeps it): 「12 问猜中了狐狸」. */
export function guessSummary(table, st, { said = '' } = {}, lang = 'zh') {
  const a = table.animals.find((x) => x.id === st.won);
  if (lang === 'en') return a ? `guessed it in ${st.n} questions: a ${pick(a.name, 'en')}` : `didn't guess it in ${st.n} questions${said ? `; it was: ${said}` : ''}`;
  return a ? `${st.n} 问猜中了${pick(a.name, 'zh')}` : `${st.n} 问没猜中${said ? `，他心里是：${said}` : ''}`;
}

/* ════════ Which game, in which tongue ════════ */

/** The kind a chat's game plays in this language: a language's block may carry its own `kind` (对对子 and 成语接龙 play
    in Chinese; in English the same chat keeps a riddle, `en.kind: 'riddle'` — a couplet or an idiom chain does not
    translate). */
export const kindOf = (game, lang = 'zh') => game?.[lang]?.kind ?? game?.kind ?? 'riddle';

/* ════════ 对对子 ════════ */

/** The 对子 as this language plays it: `{ up, answers, hints, choices, tries, src }`. The 上联 and every accepted 下联
    are a classic's (`src`: the book or the hall it hangs in); the page judges by the list, never by taste. */
export function coupletOf(game, lang = 'zh') {
  const g = game?.[lang] ?? game?.zh ?? {};
  return {
    up: String(g.up ?? ''),
    answers: list(g.answers, lang),
    hints: (g.hints ?? []).map((h) => pick(h, lang)),
    choices: list(g.choices, lang),
    tries: Number(game?.tries) || 3,
    src: pick(g.src, lang),
    kind: pick(g.label ?? game?.label, lang),
  };
}

const hanJoin = (s) => hanOf(s).join('');
/** His 下联, judged by the data alone: 'right' (one of the accepted 下联, its characters alone compared) · 'wrong' · 'empty'. */
export function checkDown(c, raw) {
  const said = hanJoin(raw);
  if (!said) return 'empty';
  return c.answers.some((a) => hanJoin(a) === said) ? 'right' : 'wrong';
}

/* A 上联's repeats (花开花落: the 1st and 3rd the same) the 下联 answers in kind (云卷云舒), and repeats nothing the 上联 does not. */
const echoOk = (up, down) => up.every((c, i) => up.every((d, j) => (c === d) === (down[i] === down[j])));
export const FREE = '之乎者也而以于其兮';
/** What is wrong with a 下联's form, as facts for the miss (couplet.js's checks, plus the repeats): the first that fails,
    `{ id, … }` — `len` (n, have) · `tail` (ch: ends 仄) · `same` (ch: the 上联's at its place) · `copy` (ch) · `echo` —
    or null when the form holds (then it is only not this couplet's 下联). A polyphone or an unknown tone never fails. */
export function shapeOf(c, raw, tones) {
  const up = hanOf(c.up), down = hanOf(raw);
  const f = checkCouplet(tones, c.up, raw, { free: FREE });
  if (f.checks.len !== 'ok') return { id: 'len', n: up.length, have: down.length };
  if (f.checks.tail === 'bad') return { id: 'tail', ch: down.at(-1) };
  if (f.checks.same === 'bad') return { id: 'same', ch: down.find((x, i) => x === up[i]) };
  if (f.checks.copy === 'bad') return { id: 'copy', ch: f.shared[0] };
  if (!echoOk(up, down)) return { id: 'echo' };
  return null;
}

/* ════════ 成语接龙 ════════ */

/** The chain as this language plays it: `{ start, links, tries }` — the person's opening idiom, his links to win. */
export function chainOf(game, lang = 'zh') {
  const g = game?.[lang] ?? game?.zh ?? {};
  return { start: String(g.start ?? ''), links: Number(g.links) || 3, tries: Number(game?.tries) || 3, kind: pick(g.label ?? game?.label, lang) };
}

/** The dictionary (worlds/<id>/chengyu.json `words`, the commonest first) as a lookup. */
export function dictOf(doc) {
  const words = String(doc?.words ?? '').split(/\s+/).filter(Boolean);
  const byFirst = new Map();
  for (const w of words) { const k = [...w][0]; if (!byFirst.has(k)) byFirst.set(k, []); byFirst.get(k).push(w); }
  return { words, set: new Set(words), byFirst };
}

const lastOf = (w) => [...w].at(-1);
export const freshChain = (chain) => ({ said: [chain.start], who: ['them'], links: 0, misses: 0, hints: 0, choices: false });
/** The character his next idiom must start with. */
export const needOf = (st) => lastOf(st.said.at(-1));
/** The unused idioms that follow on from a character, the commonest first. */
export const nextsOf = (dict, ch, used) => (dict.byFirst.get(ch) ?? []).filter((w) => !used.includes(w));

/** His link, judged by the dictionary alone: `{ v, word }` — v 'empty' · 'unknown' (not in the list: no miss) · 'used' ·
    'mismatch' (it does not start with the character) · 'right'. */
export function checkLink(dict, st, raw) {
  const word = hanJoin(raw);
  if (!word) return { v: 'empty', word };
  if ([...word][0] !== needOf(st) && dict.set.has(word)) return { v: 'mismatch', word };
  if (!dict.set.has(word)) return { v: [...word][0] === needOf(st) || [...word].length !== 4 ? 'unknown' : 'mismatch', word };
  if (st.said.includes(word)) return { v: 'used', word };
  return { v: 'right', word };
}

/** The person's link after his: the commonest that follows on and leaves him three or more to choose from (else one or
    more; else none — they cannot go on, and he has won). The page's pick, never the model's. */
export function replyOf(dict, said) {
  const cands = nextsOf(dict, lastOf(said.at(-1)), said);
  const room = (w) => nextsOf(dict, lastOf(w), [...said, w]).length;
  return cands.find((w) => room(w) >= 3) ?? cands.find((w) => room(w) >= 1) ?? null;
}

/** A link played: his (`who: 'me'`) or theirs. */
export const playLink = (st, word, who) => ({ ...st, said: [...st.said, word], who: [...st.who, who], links: st.links + (who === 'me' ? 1 : 0), misses: who === 'me' ? 0 : st.misses });

/** The way on, for a hint or the choices: the commonest idiom that follows and leaves the person room to answer (a hint
    never hands him a dead end — 上行下效 — for a cheap win), else the commonest. */
export function wayOn(dict, st) {
  const cands = nextsOf(dict, needOf(st), st.said);
  return cands.find((w) => nextsOf(dict, lastOf(w), [...st.said, w]).length >= 3) ?? cands[0] ?? null;
}
/** The k-th hint (1, 2): the way on, its first k+1 characters showing (「欺人□□」). */
export const chainHint = (dict, st, k) => { const w = wayOn(dict, st); return w ? [...w].map((c, i) => (i <= k ? c : '□')).join('') : ''; };
/** Four to pick from, one right: the way on, and three that hold the character but not at the head (自欺欺人 for 欺),
    in a fixed shuffle. */
export function chainChoices(dict, st) {
  const ch = needOf(st), right = wayOn(dict, st);
  if (!right) return [];
  const others = dict.words.filter((w) => w !== right && [...w].indexOf(ch) > 0 && !st.said.includes(w)).slice(0, 3);
  for (const w of dict.words) { if (others.length >= 3) break; if ([...w][0] !== ch && !others.includes(w) && !st.said.includes(w)) others.push(w); }
  const four = [right, ...others];
  const k = [...ch].reduce((n, c) => n + c.codePointAt(0), 0) % 4;
  return [...four.slice(4 - k), ...four.slice(0, 4 - k)];
}

/** How a chain came out: his links all in, no hint and no choices → 3; with them → 2; skipped → 1. Always `won`. */
export const chainOutcome = ({ done = false, hints = 0, choices = false } = {}) => riddleOutcome({ solved: done, hints, choices });

/* ════════ Their words: the hidden lines (facts only) ════════ */

const W = {
  zh: {
    head: '[HIDDEN] [jinchat] {title}，{when}。不是对你说的话：不 Look，不调用任何工具。你只写{names}说的话，一到两行，每行不超过三十字{multi}；不叙述，不旁白，不提页面。',
    multi: '，每行以说话人的名字加冒号开头',
    facts: '此刻：{facts}',
    riddle: '这一局是猜谜：{names}出的谜，页面上已经写着——「{q}」{kind}。',
    open: '你先开口，照你平常说话的样子叫他猜（谜面别重复，答案一个字也别漏）。',
    miss: '他猜：「{guess}」。页面判了：不对。（谜底别说破，也别替他猜。）回他一句——损他也行，激他也行。{hint}',
    hint: '页面这会儿亮出了提示：「{hint}」。',
    choices: '页面给了他四个选项挑。',
    solved: '他猜中了：「{guess}」（页面判的）。用一句话认了。',
    skip: '他不猜了，跳过；页面亮出了谜底：「{answer}」。回他一句，收个尾。',
    result: '二十问完了（页面判的）：{summary}。说一句收尾，别改这个结果。',
    free: '这一局是二十问反着玩：他心里想好了一种动物（什么动物都行），你们只问是或不是来猜，{max} 问之内，猜一回也算一问。',
    freeTurn: '{log}现在是第 {n} 问（还剩 {left} 问）。{push}用你自己的口吻，只写一句{who}：要么问一个只能答「是」或「不是」的问题，要么猜。句首加一个标记——问就写 <!--问-->，猜就写 <!--猜:动物名-->（页面读它，聊天里不显示），标记后面接着写你说出口的那句话。别重复问过的；「是什么」「哪种」「几条」这样答不了是不是的，不许问。',
    freeWho: '，开头写说话人的名字加冒号，轮着来',
    freePush: '心里有了谱就猜，别光问；只剩这几问了，该猜了。', freeMid: '问过一半了，心里有谱就猜。',
    freeLog: '已经问过：\n{rows}\n',
    freeQ: '{n}. 问：{q}——他答：{a}', freeG: '{n}. 猜：{x}——他说：{a}',
    freeA: { yes: '是', no: '不是', unknown: '不知道', right: '对', wrong: '不对' },
    freeBad: '（上一句不是只能答是或不是的问题，页面没收。重来一句。）',
    couplet: '这一局是对对子：{names}出上联，页面上已经写着——「{up}」{kind}。他对下联，对没对上，页面判。',
    cOpen: '你先开口，照你平常说话的样子叫他对下联（上联别重复，下联一个字也别说，别替他对）。',
    cMiss: '他对：「{guess}」。页面判了：没对上（{why}）。下联别说破，也别替他对。回他一句——损他也行，激他也行。{hint}',
    cSolved: '他对上了：「{guess}」（页面判的）。用一句话认了。',
    cSkip: '他不对了，跳过；页面亮出了下联：「{answer}」。回他一句，收个尾。',
    chain: '这一局是成语接龙：{names}先出「{start}」，他接；下一条的头一个字，得是上一条的末一个字，接满{links}条算他赢。接没接上，页面判。',
    lOpen: '你先开口，照你平常说话的样子叫他接（只说你出的那一条，别替他接，也别提示他）。',
    lLink: '他接「{guess}」，页面判了：接上了（{n}/{links}）。你接的是「{mine}」，页面已经摆出来了。回他一句，可以念出「{mine}」；别替他想下一条。',
    lMiss: '他接「{guess}」，页面判了：没接上（{why}）。别替他接，也别提示。回他一句。',
    lDone: '他接满了{links}条（页面判的），最后一条是「{guess}」。用一句话认了。',
    lStuck: '他接「{guess}」，你接不上了（页面翻遍了成语谱）。认个输，一句话。',
    lSkip: '他不接了，跳过。回他一句，收个尾。',
  },
  en: {
    head: '[HIDDEN] [jinchat] {title}, {when}. Not words to you: no Look, no tool at all. Write only what {names} say, in English, one or two lines, each under twenty words{multi}; no narration, never the page.',
    multi: ', each line starting with the speaker\'s name and a colon',
    facts: 'Now: {facts}',
    riddle: 'This round is a riddle: {names} set it, and the page shows it — "{q}"{kind}.',
    open: 'Speak first, in your own voice, daring him to guess (don\'t repeat the riddle; never let slip a letter of the answer).',
    miss: 'He guesses: "{guess}". The page judged it: wrong. (Never give the answer away; never guess for him.) Answer him in a line — a jab or a dare. {hint}',
    hint: 'The page now shows a hint: "{hint}".',
    choices: 'The page has given him four choices.',
    solved: 'He has it: "{guess}" (the page judged it). Own it in a line.',
    skip: 'He gives up and skips; the page shows the answer: "{answer}". Answer him in a line and close it.',
    result: 'The twenty questions are over (the page judged it): {summary}. Close it with a line; never change that result.',
    free: 'This round is twenty questions the other way round: he has thought of an animal (any animal at all), and you ask only yes-or-no questions to guess it, within {max}; a guess counts as one.',
    freeTurn: '{log}This is question {n} ({left} left). {push}In your own voice, write one line only{who}: either a question he can answer only yes or no, or a guess. Start it with a mark — a question <!--ask-->, a guess <!--guess:animal--> (the page reads it; the chat never shows it) — and then the line you say aloud. Never repeat one asked; never "what is it", "which kind", "how many" — nothing that is not yes or no.',
    freeWho: ', starting with the speaker\'s name and a colon, taking turns',
    freePush: 'Few questions left: guess, don\'t only ask. ', freeMid: 'Half your questions are gone; guess once you have a fair idea. ',
    freeLog: 'Asked so far:\n{rows}\n',
    freeQ: '{n}. Q: {q} — he said: {a}', freeG: '{n}. Guess: {x} — he said: {a}',
    freeA: { yes: 'yes', no: 'no', unknown: 'don\'t know', right: 'right', wrong: 'wrong' },
    freeBad: '(The last line was not a yes-or-no question; the page did not take it. Another.)',
    couplet: 'This round is couplets: {names} give the first line, and the page shows it — "{up}"{kind}. He answers with the second; the page judges.',
    cOpen: 'Speak first, in your own voice, daring him to match it (don\'t repeat the line; never say a word of the answer).',
    cMiss: 'He answers: "{guess}". The page judged it: no match ({why}). Never give the answer away. Answer him in a line. {hint}',
    cSolved: 'He has matched it: "{guess}" (the page judged it). Own it in a line.',
    cSkip: 'He gives up; the page shows the second line: "{answer}". Answer him in a line and close it.',
    chain: 'This round is an idiom chain: {names} open with "{start}", he follows; each must start with the last character of the one before, {links} links to win. The page judges.',
    lOpen: 'Speak first, in your own voice, daring him to follow (only your own idiom; never one for him, never a hint).',
    lLink: 'He follows with "{guess}" — the page judged it: it links ({n}/{links}). Yours is "{mine}", laid out on the page. Answer in a line; you may say "{mine}"; never think of his next.',
    lMiss: 'He tries "{guess}" — the page judged it: no link ({why}). Never link for him, never hint. Answer in a line.',
    lDone: 'He has made all {links} links (the page judged it), the last "{guess}". Own it in a line.',
    lStuck: 'He follows with "{guess}", and you cannot go on (the page searched the whole list). Concede in a line.',
    lSkip: 'He gives up and skips. Answer in a line and close it.',
  },
};

const namesOf = (cast, lang) => cast.map((c) => c.name).join(lang === 'en' ? ' and ' : '和');
const headOf = (chat, cast, lang) => {
  const w = W[lang] ?? W.zh;
  return [fill(w.head, { title: pick(chat.title, lang), when: pick(chat.when, lang), names: namesOf(cast, lang), multi: cast.length > 1 ? w.multi : '' }), fill(w.facts, { facts: pick(chat.game?.facts ?? chat.facts, lang) })].join('');
};

/** The hidden line for one moment of a riddle: `event` open · miss · solved · skip. Never the answer before he has it
    (skip is after the page shows it). */
export function riddleLine(chat, { event, guess = '', hint = '', choices = false, riddle, cast = [], lang = 'zh' }) {
  const w = W[lang] ?? W.zh;
  const kind = riddle.kind ? (lang === 'en' ? ` (${riddle.kind})` : `（${riddle.kind}）`) : '';
  const body = {
    open: () => `${fill(w.riddle, { names: namesOf(cast, lang), q: riddle.q, kind })}${w.open}`,
    miss: () => fill(w.miss, { guess, hint: [hint ? fill(w.hint, { hint }) : '', choices ? w.choices : ''].join('') }),
    solved: () => fill(w.solved, { guess }),
    skip: () => fill(w.skip, { answer: riddle.answers[0] ?? '' }),
  }[event]?.() ?? '';
  return event === 'open' ? `${headOf(chat, cast, lang)}${body}` : `[HIDDEN] [jinchat] ${pick(chat.title, lang)}·${body}`;
}

/** The hidden line for one moment of a 对对子: `event` open · miss · solved · skip (the 下联 only after the page shows it). */
export function coupletLine(chat, { event, guess = '', why = '', hint = '', c, cast = [], lang = 'zh' }) {
  const w = W[lang] ?? W.zh;
  const kind = c.kind ? (lang === 'en' ? ` (${c.kind})` : `（${c.kind}）`) : '';
  const body = {
    open: () => `${fill(w.couplet, { names: namesOf(cast, lang), up: c.up, kind })}${w.cOpen}`,
    miss: () => fill(w.cMiss, { guess, why, hint: hint ? fill(w.hint, { hint }) : '' }),
    solved: () => fill(w.cSolved, { guess }),
    skip: () => fill(w.cSkip, { answer: c.answers[0] ?? '' }),
  }[event]?.() ?? '';
  return event === 'open' ? `${headOf(chat, cast, lang)}${body}` : `[HIDDEN] [jinchat] ${pick(chat.title, lang)}·${body}`;
}

/** The hidden line for one moment of a 成语接龙: `event` open · link (his, and the person's own after it) · miss · done ·
    stuck · skip. The person is told only their own idiom — never one of his. */
export function chainLine(chat, { event, guess = '', mine = '', why = '', n = 0, ch, cast = [], lang = 'zh' }) {
  const w = W[lang] ?? W.zh;
  const o = { guess, mine, why, n, links: ch.links };
  const body = {
    open: () => `${fill(w.chain, { names: namesOf(cast, lang), start: ch.start, links: ch.links })}${w.lOpen}`,
    link: () => fill(w.lLink, o), miss: () => fill(w.lMiss, o), done: () => fill(w.lDone, o), stuck: () => fill(w.lStuck, o), skip: () => w.lSkip,
  }[event]?.() ?? '';
  return event === 'open' ? `${headOf(chat, cast, lang)}${body}` : `[HIDDEN] [jinchat] ${pick(chat.title, lang)}·${body}`;
}

export const resultLine = (chat, summary, lang = 'zh') => `[HIDDEN] [jinchat] ${pick(chat.title, lang)}·${fill((W[lang] ?? W.zh).result, { summary })}`;

/* ════════ 反着的二十问, open (Hanli 10-28: he may think of any animal — 袋鼠 too) ════════
   Live, the person asks and guesses freely, one model turn a question; he is the only one who knows the answer, so
   nothing is theirs to judge: the page counts (`max`), holds each line to yes-or-no (`yesNoOf`), and his taps decide —
   是 · 不是 · 不知道, and 对 · 不对 to a guess. Offline, the table (nextMove) plays instead. */

/** The hidden line for their next question: the facts on the first, the log of what was asked every time. */
export function freeLine(chat, st, { max, cast = [], lang = 'zh', bad = false } = {}) {
  const w = W[lang] ?? W.zh;
  const rows = st.log.map((x, i) => fill(x.guess ? w.freeG : w.freeQ, { n: i + 1, q: x.q, x: x.guess, a: w.freeA[x.a] ?? x.a })).join('\n');
  // Live 10-28 (讨饼债, 袋鼠): she asked fifteen and never guessed — past half she is nudged, near the end pushed.
  const left = max - st.log.length;
  const push = left <= 4 ? w.freePush : st.log.length >= max / 2 ? w.freeMid : '';
  const body = `${bad ? w.freeBad : ''}${fill(w.freeTurn, { log: rows ? fill(w.freeLog, { rows }) : '', n: st.log.length + 1, left, push, who: cast.length > 1 ? w.freeWho : '' })}`;
  return st.log.length || bad ? `[HIDDEN] [jinchat] ${pick(chat.title, lang)}·${fill(w.free, { max })}${body}` : `${headOf(chat, cast, lang)}${fill(w.free, { max })}${body}`;
}

const NOT_YES_NO = { zh: /(什么|哪|几|多少|怎么|为什么|为啥|谁|啥)/, en: /^\W*(what|which|how|why|who|where|when)\b/i };
/** Their line back: `{ kind: 'ask' | 'guess', text, who, x? }`, or null when it is not a yes-or-no question or a guess
    (no mark, no question mark, a wh-question, too long) — the page asks again. */
export function yesNoOf(text, cast = [], lang = 'zh') {
  const raw = String(text ?? '').replace(/\*\*/g, '').trim();
  const m = raw.match(/<!--\s*(问|猜|ask|guess)\s*(?:[:：]\s*([^>]*?))?\s*-->/i);
  if (!m) return null;
  const guess = /^(猜|guess)$/i.test(m[1]);
  let line = raw.replace(/<!--[\s\S]*?-->/g, '').split(/\n+/).map((x) => x.trim()).filter(Boolean)[0] ?? '';
  // Live 10-28: now and then the whole question went inside the mark (<!--问:它有尾巴吗？-->) — it is the line.
  if (!line && !guess && /[?？]\s*$/.test(String(m[2] ?? ''))) line = String(m[2]).trim();
  let who = cast[0]?.id ?? null;
  const n = line.match(/^([^：:]{1,8})\s*[：:]\s*(.+)$/);
  const names = cast.map((c) => c.name);
  if (n && names.includes(n[1].trim())) { who = cast[names.indexOf(n[1].trim())].id; line = n[2].trim(); }
  line = line.replace(/^[「"](.*)[」"]$/, '$1').trim();
  const x = guess ? String(m[2] ?? '').trim() : '';
  if (guess) {
    // Live 10-28: her guesses came as the bare mark (<!--猜:猞猁-->) — the animal is the guess; the page says it plainly.
    if (!x || [...x].length > 12) return null;
    return { kind: 'guess', text: [...line].length <= 60 ? line : '', who, x };
  }
  if (!line || [...line].length > 60 || !/[?？]\s*$/.test(line)) return null;
  if (NOT_YES_NO[lang === 'en' ? 'en' : 'zh'].test(line)) return null;
  return { kind: 'ask', text: line, who };
}

export const freshFree = () => ({ log: [], over: false, won: null });
/** His tap: to a question (yes · no · unknown) or a guess (right · wrong). A right guess ends it, theirs. */
export function answerFree(st, turn, a) {
  const row = turn.kind === 'guess' ? { guess: turn.x, q: turn.text, a } : { q: turn.text, a };
  const log = [...st.log, row];
  return turn.kind === 'guess' && a === 'right' ? { ...st, log, over: true, won: turn.x } : { ...st, log };
}
/** How the open game came out: their right guess → 2 (guessed); never → 3 (stumped, he won); skipped → 1. */
export const freeOutcome = (st, o = {}) => guessOutcome({ won: st.won }, o);
/** One line of fact: 「7 问猜中了袋鼠」 · 「15 问没猜中，他心里是：袋鼠」. */
export function freeSummary(st, { said = '' } = {}, lang = 'zh') {
  const n = st.log.length;
  if (lang === 'en') return st.won ? `guessed it in ${n} questions: ${st.won}` : `didn't guess it in ${n} questions${said ? `; it was: ${said}` : ''}`;
  return st.won ? `${n} 问猜中了${st.won}` : `${n} 问没猜中${said ? `，他心里是：${said}` : ''}`;
}

/** A 测试存档's stub (`&her=stub`): a marked line, never a verdict. */
export const stubLine = (cast, event) => `${cast[0]?.name ?? ''}：[stub] ${event}`;
