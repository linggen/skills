// jinchat-games.js — the word games a 对话 board plays (Hanli 2026-10-27, of 「银月 · 最后一颗」: 「这个对话小游戏好像不太合理,
// 好玩」 → 「AI对话可以对对子, 猜谜语等」 · 「猜动物也行, 心里像一个, 对方猜, 只能回答是或者不是. AI猜玩家心里的」). A chat
// whose data carries a `game` is no longer a free chat with a hidden goal: it is a classic word game played with the
// person, the goal on the page. The pure half — the page decides every right and wrong from data, never the model.
//
//   riddle   猜谜 · 字谜 · 考书: the person sets it (`q`), he answers in the box. Right is his answer against the
//            data's list (`answers`), never a model's say (live 10-27: a model invented a puzzle's answer). Hints come in
//            tiers (`hints`), the choices (`choices`) after `tries` misses; 跳过 always. Solved or not, the story goes on.
//   guess    反着的二十问: he thinks of an animal, they ask yes or no and he taps 是 · 不是 · 不知道 — no typing. The
//            page asks: each question is the one that best splits the animals still possible (worlds/<id>/aigames.json
//            `twenty.reverse`, a yes/no table), a guess when one is left; a guess counts as a question; the win is only
//            his 对. Missed, he types what it was, once.
//
// Who writes what (design.md: Ling writes every word a player reads; code gives facts): the riddle, its hints and its
// answers are data (a puzzle's face, like riddles/zh.json); the person's own bubbles are the model's — a lead-in, a
// jab at a wrong guess, the questions in their voice (one turn at the start, `bankLine`, while he thinks of his animal)
// — each handed the page's verdict as a fact and never the answer before he has it. No model, every game still plays:
// the questions' plain wording is data, and the book's own lines close it.

const pick = (v, lang) => (v == null ? '' : typeof v === 'string' ? v : v[lang] ?? v.zh ?? '');
const list = (v, lang) => (Array.isArray(v) ? v : v?.[lang] ?? v?.zh ?? []);
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

/* ════════ 猜谜 ════════ */

const FILL_ZH = /^(我猜|我觉得|应该是|大概是|是不是|就是|莫非是|难道是|那就是|是)+|(吧|吗|嘛|呀|啊|呢|咯|喽|了|的)+$/g;
const FILL_EN = /^(i think|i guess|my guess is|maybe|perhaps|is it|it's|it is|its|you have)\s+|\b(a|an|the|your|her|his)\b\s*/g;
const NEG = { zh: /^(不是|不|没|没有|别)/, en: /^(not|no|never)\b/ };
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
  if (NEG[lang === 'en' ? 'en' : 'zh'].test(said)) return 'wrong';
  for (const n of all) {
    if (lang === 'en' ? new RegExp(`(^| )${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?( |$)`).test(said) : n.length >= 2 && said.includes(n)) return 'right';
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

/* ════════ Their words: the hidden lines (facts only) ════════ */

const W = {
  zh: {
    head: '[HIDDEN] [jinchat] {title}，{when}。不是对你说的话：不 Look，不调用任何工具。你只写{names}说的话，一到两行，每行不超过三十字{multi}；不叙述，不旁白，不提页面。',
    multi: '，每行以说话人的名字加冒号开头',
    facts: '此刻：{facts}',
    riddle: '这一局是猜谜：{names}出的谜，页面上已经写着——「{q}」{kind}。',
    open: '你先开口，用你的口气叫他猜（谜面别重复，答案一个字也别漏）。',
    miss: '他猜：「{guess}」。页面判了：不对。（谜底别说破，也别替他猜。）回他一句——损他也行，激他也行。{hint}',
    hint: '页面这会儿亮出了提示：「{hint}」。',
    choices: '页面给了他四个选项挑。',
    solved: '他猜中了：「{guess}」（页面判的）。用一句话认了。',
    skip: '他不猜了，跳过；页面亮出了谜底：「{answer}」。回他一句，收个尾。',
    bank: '这一局是二十问反着玩：他心里想好一种动物，你们只问是或不是，来猜。下面每个问题，用你们自己的口气各改写成一句（意思不变，还是只能答是或不是），一行一个，照「编号｜名字：问句」写，名字轮着来；最后一行写「guess｜名字：……{x}……？」——猜的那一句，{x} 原样留着。不要别的字。',
    bankQ: '{id}｜{q}',
    result: '二十问完了（页面判的）：{summary}。说一句收尾，别改这个结果。',
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
    bank: 'This round is twenty questions the other way round: he thinks of an animal and you ask only yes-or-no questions to guess it. Rewrite each question below in your own voice, one line each (same meaning, still yes or no), as "id｜Name: question", taking turns; the last line "guess｜Name: … {x} …?" — the guessing line, {x} left exactly as it is. Nothing else.',
    bankQ: '{id}｜{q}',
    result: 'The twenty questions are over (the page judged it): {summary}. Close it with a line; never change that result.',
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

/** The one turn at the start of a reverse 二十问: every question in their voice, while he thinks of his animal. */
export function bankLine(chat, table, { cast = [], lang = 'zh' } = {}) {
  const w = W[lang] ?? W.zh;
  const qs = table.questions.map((q) => fill(w.bankQ, { id: q.id, q: pick(q.q, lang) })).join('\n');
  return `${headOf(chat, cast, lang)}${w.bank}\n${qs}`;
}
export const resultLine = (chat, summary, lang = 'zh') => `[HIDDEN] [jinchat] ${pick(chat.title, lang)}·${fill((W[lang] ?? W.zh).result, { summary })}`;

/** Their questions back from the bank turn: `{ id → { who, text } }`, only lines that are a question with an id the
    table knows (the guess line keeps its `{x}`); the rest falls back to the data's plain wording. */
export function parseBank(text, table, cast) {
  const ids = new Set([...table.questions.map((q) => q.id), 'guess']);
  const names = cast.map((c) => c.name);
  const out = {};
  for (const raw of String(text ?? '').split(/\n+/)) {
    const m = raw.replace(/\*\*/g, '').trim().match(/^([\w-]+)\s*[｜|]\s*(.+)$/);
    if (!m || !ids.has(m[1])) continue;
    let line = m[2].trim(), who = null;
    const n = line.match(/^([^：:]{1,8})\s*[：:]\s*(.+)$/);
    if (n && names.includes(n[1].trim())) { who = cast[names.indexOf(n[1].trim())].id; line = n[2].trim(); }
    line = line.replace(/^[「"](.*)[」"]$/, '$1').trim();
    if (!line || [...line].length > 40 || !/[?？]$/.test(line)) continue;
    if (m[1] === 'guess' && !line.includes('{x}')) continue;
    if (m[1] !== 'guess' && line.includes('{x}')) continue;
    out[m[1]] = { who, text: line };
  }
  return out;
}

/** A 测试存档's stub (`&her=stub`): a marked line, never a verdict. */
export const stubLine = (cast, event) => `${cast[0]?.name ?? ''}：[stub] ${event}`;
