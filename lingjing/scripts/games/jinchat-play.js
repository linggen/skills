// jinchat-play.js — a 对话 board's word game, on the page (Hanli 2026-10-27: the chat boards become classic word games
// played with the person, the goal plain on the page). games/jinchat.js lays the chat; when the chat's data carries a
// `game`, it hands the game here instead of the free box. The rules are jinchat-games.js (pure); this half draws the
// controls, plays the turns and says when it is over. Every verdict is the page's; their bubbles are the model's, asked
// in the background (`ctx.react`), never waited on to judge.
//
//   riddleGame(ctx) — the riddle's card, the answer box, 提示 (the hints in tiers), the choices after `tries` misses;
//                     solved or skipped, the book's own lines close it (`game.after`; a `me` line waits for his tap).
//   coupletGame(ctx) — 对对子: the 上联 on a red scroll, the 下联's scroll blank beside it; he types it, the page holds it
//                     against the classic's accepted 下联 and says what is off in its form (字数 · 平仄 · 同位 · 叠字);
//                     the hints in tiers, the choices after `tries` misses; no 跳过 of its own (the shell's ✕ · 留).
//   chainGame(ctx)  — 成语接龙: the person opens, he follows from the last character; each link of theirs is the page's
//                     pick from the dictionary (worlds/<id>/chengyu.json); N links of his and he has won.
//   guessGame(ctx)  — 反着的二十问: he thinks of an animal; 想好了; then 是 · 不是 · 不知道 to each of their questions,
//                     对 · 不对 to a guess; missed, he types what it was, once. Any animal (Hanli 10-28, 袋鼠 too): they
//                     ask and guess freely, a model turn each — the page counts and holds each line to yes-or-no; a turn
//                     the model cannot give is the table's question instead (offline: the table plays it all, unseen).
//
// ctx: { root, chat, cast, lang, w (words), add(line), typeOut(lines), react(text, o) → Promise, sound(name),
//        foot(text), table() → Promise<twenty table>, ask(text) → Promise<{text}> (the open 二十问's turns), typing(on), log(row),
//        board(action, o) (the open game kept on the save for Ling's Look, rules/wordboard.mjs: open · step · close),
//        watchTold(fn) → stop (fn({ answer, src }) once Ling or 银月 told it on his outright ask), afterMs (a test's
//        AFTER_ME_MS) }
// Each answers a Promise of the result: { won: true, grade, stars } — or, told, { won: false, left: true, told: true, kind,
// answer, src? } (over as a skip: the rules already set it down, nothing is paid; the page holds the card with it).

import {
  answerFree, answerGuess, chainChoices, chainHint, chainLine, chainOf, chainOutcome, checkDown, checkLink, checkRiddle,
  coupletLine, coupletOf, freeEndFallback, freeEndLine, freeLine, GUESS_FROM, GUESSES, guessHeld, saidAnimal, freeOutcome, freeSummary, freshChain, freshFree, freshGuess, judgeGuess, needOf, nearOf, nextMove,
  helpLine, helpOf, nearLink, playLink, replyOf, riddleLine, riddleOf, riddleOutcome, shapeOf, wayOn, yesNoOf,
} from './jinchat-games.js';

const pick = (v, lang) => (v == null ? '' : typeof v === 'string' ? v : v[lang] ?? v.zh ?? '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

/* The game's control strip (under the chat), drawn again for each step. */
function strip(ctx, html) {
  const el = ctx.root.querySelector('.g-jc-game');
  el.innerHTML = html;
  return el;
}
/* The lantern over a slip: its ribs, gold caps, a tassel; one character on its face. In the dark (黑地里) no lantern burns. */
const lanternOf = (ctx) => (ch) => (ctx.chat.look === 'dark' ? '' : lantern(ch));
const lantern = (ch) => `<div class="g-jc-lan" aria-hidden="true"><span class="g-jc-lan-cap"></span><span class="g-jc-lan-body"><b>${esc(ch)}</b></span><span class="g-jc-lan-cap is-low"></span><span class="g-jc-lan-cord"></span></div>`;
const btn = (cls, label, data = '') => `<button type="button" class="g-jc-gbtn ${cls}"${data}>${esc(label)}</button>`;

/* The book's closing lines (`game.after`): theirs typed out; his (`who: me`) a chip he may tap, then his bubble. The
   game is over by then, so the close never waits on his hand: unanswered, his line goes by itself after AFTER_ME_MS
   (2026-11-03, Hanli on the phone: 「猜谜都会卡在这里」 — every word board with a `me` line stood on its dashed chip, the
   board never ended and the story could not go on). A tap (click, or the pointer let go on it) only sends it sooner. */
export const AFTER_ME_MS = 2600;
/** How long the open 二十问's last word of theirs is waited for before the data's own line stands in. */
export const END_MS = 25000;
export async function playAfter(ctx, lines) {
  for (const l of lines ?? []) {
    const text = pick(l.text, ctx.lang);
    if (l.who !== 'me') { await ctx.typeOut([{ who: l.who, text }]); continue; }
    await new Promise((resolve) => {
      const el = strip(ctx, `<div class="g-jc-chips is-game"><button type="button" class="g-jc-chip">${esc(text)}</button></div>`);
      const chip = el.querySelector('.g-jc-chip');
      let done = false;
      const go = () => { if (done) return; done = true; clearTimeout(t); resolve(); };
      const t = setTimeout(go, ctx.afterMs ?? AFTER_ME_MS);
      for (const type of ['click', 'pointerup']) chip.addEventListener(type, go, { once: true });
    });
    strip(ctx, '');
    ctx.add({ who: 'me', text });
  }
}

/* The open game on the save (rules/wordboard.mjs), and its watch: told in the chat, the board shows the answer and ends as
   left — the rules set it down as a skip already. Absent (a test's ctx, the phone's host), nothing is kept. */
const keep = (ctx, action, o = {}) => ctx.board?.(action, o);
/** The answer box keeps the keys (Hanli 11-04: 「输入框会失去焦点，当AI说话后」): after a line lands, a step is drawn,
    or the stage's redraw lays the card into a new host (which blurs it), `focus()` gives the box the focus back —
    unless he put it somewhere else on purpose (a tap, or a Tab, outside the chat). On a touch screen (`touch`: the
    phone) never by itself, which would pop up its typing pad: only once he has tapped into the box. Every word game's box. */
export function focusKeeper({ root, doc, touch = false, signal = null }) {
  let want = !touch;
  const boxOf = () => [...root.querySelectorAll('.g-jc-in')].find((el) => !el.closest?.('[hidden]')) ?? null;
  root.addEventListener('focusin', (e) => { if (e.target?.classList?.contains('g-jc-in')) want = true; });
  root.addEventListener('focusout', (e) => { if (e.relatedTarget && !root.contains(e.relatedTarget)) want = false; });
  const away = (e) => {
    if (!e.target) return;
    if (!root.contains(e.target)) want = false;
    else if (!touch && e.target.closest?.('.g-jc-game, .g-jc-bar')) want = true; // back on the board's own controls
  };
  doc.addEventListener('pointerdown', away, true);
  signal?.addEventListener?.('abort', () => doc.removeEventListener('pointerdown', away, true), { once: true });
  const focus = () => {
    const el = boxOf();
    if (!el || el.disabled || !want || !root.isConnected) return false;
    const a = doc.activeElement;
    if (a === el) return true;
    if (a && a !== doc.body && !root.contains(a)) return false;
    el.focus({ preventScroll: true });
    return true;
  };
  return { focus, wants: () => want };
}
/* The answer box takes the keys back after each step (Hanli 11-04: 「输入框会失去焦点，当AI说话后」): the chat's own
   keeper (games/jinchat.js `focus`, which never opens a phone's typing pad by itself); a test's ctx, the box at once. */
const focusIn = (ctx, input) => (ctx.focus ? ctx.focus() : input.focus({ preventScroll: true }));
const hintsOf = (list) => JSON.stringify(list);
const watch = (ctx, fn) => ctx.watchTold?.(fn) ?? (() => {});
/* Told, the end says what was told, for the page to hold on the card (board-deal.js catchTold). */
const toldEnd = (kind, answer, src) => ({ won: false, left: true, told: true, kind, answer: String(answer ?? ''), ...(src ? { src } : {}) });

/* ════════ 猜谜 ════════ */

export async function riddleGame(ctx) {
  const { chat, lang, w } = ctx;
  const game = chat.game, r = riddleOf(game, lang);
  const st = { misses: 0, hints: 0, shown: [], choices: false, done: false };
  const label = pick(game.label, lang) || w.riddle;
  // A 灯谜 as it is hung at a lantern fair: the red lantern, the riddle on the paper slip beneath it (Hanli 10-27: the
  // boards in the house style, 「画面不精致」 never again).
  ctx.add({ who: 'card', html: `<div class="g-jc-riddle is-lantern">${lanternOf(ctx)(w.mi)}<div class="g-jc-strip"><i>${esc(label)}</i><p class="g-jc-q">${esc(r.q)}</p><ol class="g-jc-hints"></ol><p class="g-jc-ans" hidden></p></div></div>` });
  // A quiet game (`quiet`: 黑地里, the ambulance) asks no one: the moment is no game of theirs, only his answer and the book.
  const react = game.quiet ? () => Promise.resolve() : ctx.react;
  react(riddleLine(chat, { event: 'open', riddle: r, cast: ctx.cast, lang }));
  keep(ctx, 'open', { kind: 'riddle', face: r.q, answer: r.answers[0] ?? '' });
  const card = () => [...ctx.root.querySelectorAll('.g-jc-riddle')].at(-1);
  const showHint = () => {
    if (st.hints >= r.hints.length) return '';
    const h = r.hints[st.hints++];
    st.shown.push(h);
    keep(ctx, 'step', { hints: hintsOf(st.shown), tries: st.misses });
    card()?.querySelector('.g-jc-hints')?.insertAdjacentHTML('beforeend', `<li><b>${esc(fill(w.hintAt, { n: st.hints }))}</b>${esc(h)}</li>`);
    ctx.sound('hint');
    return h;
  };
  const status = () => ctx.foot(fill(w.tried, { n: st.misses }) + (r.hints.length ? ` · ${fill(w.hinted, { n: st.hints, max: r.hints.length })}` : ''));

  return new Promise((resolve) => {
    // Told in the chat on his ask (Ling's Reveal, 银月's Whisper): the answer on the slip, and over — as a skip.
    const stop = watch(ctx, (told) => {
      if (st.done) return;
      st.done = true;
      strip(ctx, '');
      const ans = card()?.querySelector('.g-jc-ans');
      if (ans) { ans.hidden = false; ans.textContent = fill(w.answer, { a: told.answer || (r.answers[0] ?? '') }); }
      ctx.sound('skip');
      ctx.log({ kind: 'riddle', chat: ctx.id, told: true, misses: st.misses, hints: st.hints });
      keep(ctx, 'close');
      resolve(toldEnd('riddle', told.answer || (r.answers[0] ?? ''), told.src));
    });
    const finish = async (solved, guess) => {
      if (st.done) return;
      st.done = true;
      stop();
      keep(ctx, 'close');
      strip(ctx, '');
      const ans = card()?.querySelector('.g-jc-ans');
      if (ans) { ans.hidden = false; ans.textContent = fill(w.answer, { a: r.answers[0] ?? '' }); }
      ctx.sound(solved ? 'right' : 'skip');
      const o = riddleOutcome({ solved, hints: st.hints, choices: st.choices });
      ctx.log({ kind: 'riddle', chat: ctx.id, solved, misses: st.misses, hints: st.hints, choices: st.choices, guess: guess ?? null });
      // The book closes it when it has the lines (最后一颗: 「本王还有一颗。最后一颗。」…「抢的。」); else their own word.
      if (game.after?.length) { await ctx.settle(); await playAfter(ctx, game.after); }
      else await react(riddleLine(chat, { event: solved ? 'solved' : 'skip', guess, riddle: r, cast: ctx.cast, lang }), { wait: true });
      resolve(o);
    };
    const guess = (raw) => {
      const text = String(raw ?? '').trim();
      if (!text || st.done) return;
      ctx.add({ who: 'me', text });
      const v = checkRiddle(r, text, lang);
      if (v === 'right') return finish(true, text);
      st.misses += 1;
      ctx.sound('wrong');
      // A miss lights the next hint by itself after the first; past `tries`, the choices. Look hears how many (stuck).
      const hint = st.misses >= 2 ? showHint() : '';
      if (!hint) keep(ctx, 'step', { tries: st.misses });
      if (st.misses >= r.tries && r.choices.length && !st.choices) st.choices = true;
      react(riddleLine(chat, { event: 'miss', guess: text, hint, shown: st.shown, choices: st.choices && st.misses === r.tries, riddle: r, cast: ctx.cast, lang }));
      draw();
    };
    const draw = () => {
      status();
      const choices = st.choices ? `<div class="g-jc-chips is-game">${r.choices.map((c) => `<button type="button" class="g-jc-chip" data-pick="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : '';
      const el = strip(ctx, `${choices}<form class="g-jc-bar is-game"><input class="g-jc-in" data-jc-in="" type="text" maxlength="40" autocomplete="off" enterkeyhint="send" placeholder="${esc(w.guessIt)}">`
        + `<button type="submit" class="g-jc-send">${esc(w.guessGo)}</button></form>`
        + `<div class="g-jc-gacts">${btn('is-hint', w.hint, st.hints >= r.hints.length ? ' disabled' : '')}</div>`);
      const input = el.querySelector('.g-jc-in');
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.isComposing) e.preventDefault(); });
      el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); guess(input.value); });
      for (const b of el.querySelectorAll('[data-pick]')) b.addEventListener('click', () => guess(b.dataset.pick));
      el.querySelector('.is-hint').addEventListener('click', () => { showHint(); draw(); });
      focusIn(ctx, input);
    };
    draw();
  });
}

/* ════════ 反着的二十问 ════════ */

/* The open 二十问 (Hanli 10-28: 「AI猜可以, 但别固定30种动物, 全部动物都可以」): their questions are theirs, his taps the
   only verdict, the page the count. The table (aigames.json `twenty.reverse`) is never shown: it only asks a turn the
   model could not give (offline, a stub, a line that is no yes-or-no twice). */
export async function guessGame(ctx) {
  const { chat, lang, w, cast } = ctx;
  const table = await ctx.table();
  const max = Number(chat.game.max) || 15;
  // At most `guesses` guesses, none before question `from`; the last question may always guess (jinchat-games.js guessHeld).
  const guesses = Number(chat.game.guesses) || GUESSES, from = Number(chat.game.guess_from) || GUESS_FROM;
  ctx.add({ who: 'card', html: `<div class="g-jc-riddle is-lantern">${lanternOf(ctx)(w.wen)}<div class="g-jc-strip"><i>${esc(pick(chat.game.label, lang) || w.twenty)}</i><p class="g-jc-q is-small">${esc(fill(w.think, { max }))}</p></div></div>` });
  let st = freshFree();
  let tst = freshGuess(); // the table's own state, for a turn the model could not give
  let turn = 0;
  const status = () => ctx.foot(fill(w.asked, { n: st.log.length, max }));
  const speaker = () => cast[turn % cast.length]?.id ?? cast[0]?.id;
  // One turn of theirs: the model's line, held to yes-or-no (asked again once); else the table's next move, plainly.
  const nextTurn = async () => {
    let bad = false;
    for (let k = 0; k < 2; k += 1) {
      const r = await ctx.ask(freeLine(chat, st, { max, cast, lang, bad, guesses })).catch(() => null);
      const t = yesNoOf(r?.text, cast, lang);
      // A guess too soon, or past the cap, is not taken: asked again for a question (its why in the line).
      const held = t?.kind === 'guess' ? guessHeld(st, { max, guesses, from }) : null;
      ctx.log({ kind: 'free-turn', chat: ctx.id, n: st.log.length + 1, ok: Boolean(t) && !held, held, err: r?.err ?? r?.refused ?? null });
      if (t && !held) return t.kind === 'guess' && !t.text ? { ...t, text: fill(pick(table.guess, lang) || '{x}？', { x: t.x }) } : t;
      if (!r?.text) break; // no model at all: the table, at once
      bad = held ?? true;
    }
    const mv = nextMove(table, { ...tst, n: st.log.length });
    if (mv.kind === 'giveup') return null;
    if (mv.kind === 'ask') return { kind: 'ask', text: pick(mv.q.q, lang), who: speaker(), tq: mv.q.id };
    const x = pick(mv.animal.name, lang);
    return { kind: 'guess', text: fill(pick(table.guess, lang) || '{x}？', { x }), who: speaker(), x, tid: mv.animal.id };
  };

  return new Promise((resolve) => {
    let done = false;
    const end = async (o, said = '') => {
      if (done) return;
      done = true;
      strip(ctx, '');
      const summary = freeSummary(st, { said }, lang);
      ctx.log({ kind: 'twenty', chat: ctx.id, n: st.log.length, won: st.won, said, summary, free: true });
      ctx.sound(st.won ? 'right' : o.grade === 'skipped' ? 'skip' : 'wrong');
      ctx.foot(summary);
      // Their own last word on the page's result (Hanli 11-03: 「知道正确答案后没反应」): guessed, a small boast; stumped and
      // told, chagrin — 「竟然是……！」 and why they missed it. The model words it; none answers, the data's line. Then the book's.
      const x = st.won ? '' : saidAnimal(said, lang);
      if (!chat.game.quiet && (st.won || x)) {
        // Never held on a host that does not answer (the phone's `ask` seam): past END_MS, the data's line, and on.
        const n = await Promise.race([ctx.react(freeEndLine(chat, st, { said: x, lang }), { wait: true }).catch(() => 0),
          new Promise((r) => setTimeout(() => r(0), ctx.endMs ?? END_MS))]);
        const line = n ? '' : freeEndFallback(table, st, { said: x, lang });
        if (line) await ctx.typeOut([{ who: speaker(), text: line }]);
      }
      if (chat.game.after?.length) { await ctx.settle(); await playAfter(ctx, chat.game.after); }
      resolve(o);
    };
    // No 跳过 of its own (Hanli 11-03): the shell's ✕ and 留 are the one way out, from the start.
    const skipBtn = () => '';
    const wire = () => {};
    const tell = () => {
      const el = strip(ctx, `<p class="g-jc-gnote">${esc(w.tell)}</p><form class="g-jc-bar is-game"><input class="g-jc-in" data-jc-in="" type="text" maxlength="12" autocomplete="off" enterkeyhint="send" placeholder="${esc(w.itWas)}">`
        + `<button type="submit" class="g-jc-send">${esc(w.tellGo)}</button></form>`);
      const input = el.querySelector('.g-jc-in');
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.isComposing) e.preventDefault(); });
      el.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const said = input.value.trim();
        if (!said) return;
        ctx.add({ who: 'me', text: said });
        end(freeOutcome(st), said);
      });
      focusIn(ctx, input);
    };
    const step = async () => {
      status();
      if (st.log.length >= max) { ctx.sound('wrong'); return tell(); }
      strip(ctx, '');
      ctx.typing?.(true);
      const t = await nextTurn();
      ctx.typing?.(false);
      if (done) return;
      if (!t) { ctx.sound('wrong'); return tell(); }
      await ctx.typeOut([{ who: t.who ?? speaker(), text: t.text }]);
      turn += 1;
      const guess = t.kind === 'guess';
      const el = strip(ctx, `<div class="g-jc-gacts is-answers">${guess
        ? `${btn('is-yes', w.right, ' data-a="right"')}${btn('is-no', w.wrong, ' data-a="wrong"')}`
        : `${btn('is-yes', w.yes, ' data-a="yes"')}${btn('is-no', w.no, ' data-a="no"')}${btn('is-unk', w.unknown, ' data-a="unknown"')}`}${skipBtn()}</div>`);
      wire(el);
      for (const b of el.querySelectorAll('[data-a]')) b.addEventListener('click', () => {
        if (done) return;
        ctx.sound('tap');
        ctx.add({ who: 'me', text: b.textContent });
        const a = b.dataset.a;
        st = answerFree(st, t, a);
        if (t.tq) tst = answerGuess(tst, t.tq, a);
        if (t.tid && a === 'wrong') tst = judgeGuess(tst, t.tid, false);
        if (st.over) return end(freeOutcome(st));
        if (guess) ctx.sound('wrong');
        step();
      }, { once: true });
    };
    const el = strip(ctx, `<div class="g-jc-gacts">${btn('is-main', w.ready)}${skipBtn()}</div>`);
    wire(el);
    el.querySelector('.is-main').addEventListener('click', () => { ctx.sound('tap'); ctx.add({ who: 'me', text: w.ready }); step(); }, { once: true });
  });
}

/* ════════ 对对子 ════════ */

/* A scroll's cells, one per character of the 上联 (its marks a narrow gap); `chars` fills them, else blank. */
const cells = (up, chars = null) => {
  let k = 0;
  return [...up].map((c) => (/\p{Script=Han}/u.test(c) ? `<b class="g-jc-dl-c${chars ? '' : ' is-blank'}">${chars ? esc(chars[k++] ?? '') : ''}</b>` : '<b class="g-jc-dl-gap"></b>')).join('');
};
const scroll = (side, label, body) => `<div class="g-jc-dl-scroll is-${side}"><span class="g-jc-dl-rod"></span><div class="g-jc-dl-text">${body}</div><span class="g-jc-dl-rod is-low"></span><em>${esc(label)}</em></div>`;

export async function coupletGame(ctx) {
  const { chat, lang, w } = ctx;
  const game = chat.game, c = coupletOf(game, lang);
  const tones = await ctx.tones().catch(() => null);
  const st = { misses: 0, hints: 0, shown: [], choices: false, done: false };
  const label = pick(game.label, lang) || w.duilian;
  // A pair of red scrolls as they hang by a door: the 上联 on the right, the 下联's blank on the left (Hanli 10-27: the
  // boards in the house style). Solved, his characters fill it; skipped, the classic's.
  ctx.add({ who: 'card', html: `<div class="g-jc-duilian"><i class="g-jc-dl-label">${esc(label)}</i><div class="g-jc-dl-pair">`
    + `${scroll('down', w.downLabel, cells(c.up))}${scroll('up', w.upLabel, cells(c.up, [...c.up].filter((x) => /\p{Script=Han}/u.test(x))))}</div>`
    + `<ol class="g-jc-hints"></ol><p class="g-jc-dl-why" hidden></p><p class="g-jc-ans" hidden></p></div>` });
  const react = game.quiet ? () => Promise.resolve() : ctx.react;
  react(coupletLine(chat, { event: 'open', c, cast: ctx.cast, lang }));
  keep(ctx, 'open', { kind: 'couplet', face: c.up, answer: c.answers[0] ?? '', ...(c.src ? { src: c.src } : {}) });
  const card = () => [...ctx.root.querySelectorAll('.g-jc-duilian')].at(-1);
  const fillDown = (text, cls) => {
    const el = card()?.querySelector('.g-jc-dl-scroll.is-down .g-jc-dl-text');
    if (el) { el.innerHTML = cells(c.up, [...text].filter((x) => /\p{Script=Han}/u.test(x))); el.classList.add(cls); }
  };
  const showHint = () => {
    if (st.hints >= c.hints.length) return '';
    const h = c.hints[st.hints++];
    st.shown.push(h);
    keep(ctx, 'step', { hints: hintsOf(st.shown), tries: st.misses });
    card()?.querySelector('.g-jc-hints')?.insertAdjacentHTML('beforeend', `<li><b>${esc(fill(w.hintAt, { n: st.hints }))}</b>${esc(h)}</li>`);
    ctx.sound('hint');
    return h;
  };
  const whyOf = (raw) => { const f = shapeOf(c, raw, tones); return fill(w.why[f?.id ?? 'form'], f ?? {}); };
  const status = () => ctx.foot(fill(w.triedDown, { n: st.misses }) + (c.hints.length ? ` · ${fill(w.hinted, { n: st.hints, max: c.hints.length })}` : ''));

  // The original under the scrolls (a near line counted, or told): 「原句：……——src」.
  const original = (a) => fill(w.original, { a }) + (c.src ? ` ${fill(w.srcBy, { src: c.src })}` : '');
  return new Promise((resolve) => {
    // Told in the chat on his ask (Ling's Reveal, 银月's Whisper): the classic's 下联 on its scroll, and over — as a skip.
    const stop = watch(ctx, (told) => {
      if (st.done) return;
      st.done = true;
      strip(ctx, '');
      const a = told.answer || (c.answers[0] ?? '');
      fillDown(a, 'is-shown');
      const why = card()?.querySelector('.g-jc-dl-why');
      if (why) why.hidden = true;
      const ans = card()?.querySelector('.g-jc-ans');
      if (ans) { ans.hidden = false; ans.textContent = original(a); }
      ctx.sound('skip');
      ctx.log({ kind: 'couplet', chat: ctx.id, told: true, misses: st.misses, hints: st.hints });
      keep(ctx, 'close');
      resolve(toldEnd('couplet', a, told.src ?? c.src));
    });
    // `near`: his line a character or two off an accepted 下联, counted one star lower — the original named.
    const finish = async (solved, guess, near = '') => {
      if (st.done) return;
      st.done = true;
      stop();
      keep(ctx, 'close');
      strip(ctx, '');
      fillDown(solved ? guess : c.answers[0] ?? '', solved ? 'is-his' : 'is-shown');
      const why = card()?.querySelector('.g-jc-dl-why');
      if (why) why.hidden = true;
      const ans = card()?.querySelector('.g-jc-ans');
      if (ans && near) { ans.hidden = false; ans.textContent = original(near); }
      else if (ans && c.src) { ans.hidden = false; ans.textContent = fill(w.srcBy, { src: c.src }); }
      ctx.sound(solved ? 'right' : 'skip');
      const o = riddleOutcome({ solved, hints: st.hints, choices: st.choices, near: Boolean(near) });
      ctx.log({ kind: 'couplet', chat: ctx.id, solved, near: Boolean(near), misses: st.misses, hints: st.hints, choices: st.choices, guess: guess ?? null });
      if (game.after?.length) { await ctx.settle(); await playAfter(ctx, game.after); }
      else await react(coupletLine(chat, { event: near ? 'near' : solved ? 'solved' : 'skip', guess, answer: near, c, cast: ctx.cast, lang }), { wait: true });
      resolve(o);
    };
    const guess = (raw) => {
      const text = String(raw ?? '').trim();
      if (!text || st.done) return;
      ctx.add({ who: 'me', text });
      const v = checkDown(c, text);
      if (v === 'right') return finish(true, text);
      if (v === 'near') return finish(true, text, nearOf(c, text)?.answer ?? c.answers[0] ?? '');
      st.misses += 1;
      ctx.sound('wrong');
      keep(ctx, 'step', { tries: st.misses }); // Look hears how many (stuck)
      // What is off is the page's fact, shown under the scrolls and handed to their voice — a line a character or two off
      // with its key image lost says so (「只差一两个字……」), never which.
      const why = v === 'close' ? w.why.close : whyOf(text);
      const el = card()?.querySelector('.g-jc-dl-why');
      if (el) { el.hidden = false; el.textContent = why; }
      const hint = st.misses >= 2 ? showHint() : '';
      if (st.misses >= c.tries && c.choices.length && !st.choices) st.choices = true;
      react(coupletLine(chat, { event: 'miss', guess: text, why, hint, shown: st.shown, c, cast: ctx.cast, lang }));
      draw();
    };
    const draw = () => {
      status();
      const choices = st.choices ? `<div class="g-jc-chips is-game is-lines">${c.choices.map((x) => `<button type="button" class="g-jc-chip" data-pick="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : '';
      const el = strip(ctx, `${choices}<form class="g-jc-bar is-game"><input class="g-jc-in" data-jc-in="" type="text" maxlength="40" autocomplete="off" enterkeyhint="send" placeholder="${esc(w.downIt)}">`
        + `<button type="submit" class="g-jc-send">${esc(w.downGo)}</button></form>`
        + `<div class="g-jc-gacts">${btn('is-hint', w.hint, st.hints >= c.hints.length ? ' disabled' : '')}</div>`);
      const input = el.querySelector('.g-jc-in');
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.isComposing) e.preventDefault(); });
      el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); guess(input.value); });
      for (const b of el.querySelectorAll('[data-pick]')) b.addEventListener('click', () => guess(b.dataset.pick));
      el.querySelector('.is-hint').addEventListener('click', () => { showHint(); draw(); });
      focusIn(ctx, input);
    };
    draw();
  });
}

/* ════════ 成语接龙 ════════ */

/* One idiom as four tiles, its head (the link) and its tail (the next one's head) sealed in red. */
export const tilesOf = (word, { head = false } = {}) => `<span class="g-jc-tiles">${[...word].map((c, i, a) => `<b class="g-jc-tile${i === 0 && head ? ' is-head' : ''}${i === a.length - 1 ? ' is-tail' : ''}">${esc(c)}</b>`).join('')}</span>`;

export async function chainGame(ctx) {
  const { chat, lang, w, cast } = ctx;
  const game = chat.game, ch = chainOf(game, lang);
  const dict = await ctx.dict();
  let st = freshChain(ch);
  let done = false;
  const label = pick(game.label, lang) || w.jielong;
  const beads = () => Array.from({ length: ch.links }, (_, i) => `<b class="${i < st.links ? 'is-on' : ''}"></b>`).join('');
  ctx.add({ who: 'card', html: `<div class="g-jc-jl"><i class="g-jc-dl-label">${esc(label)}</i><p class="g-jc-jl-rule">${esc(fill(w.chainRule, { links: ch.links }))}</p><p class="g-jc-jl-beads">${beads()}</p></div>` });
  const react = game.quiet ? () => Promise.resolve() : ctx.react;
  const card = () => [...ctx.root.querySelectorAll('.g-jc-jl')].at(-1);
  const who = cast[0]?.id;
  const theirs = (word, head) => ctx.add({ who, html: tilesOf(word, { head }), text: word });
  // The person's opening idiom is on the table before anyone speaks; their voice comes when it comes.
  theirs(ch.start, false);
  react(chainLine(chat, { event: 'open', ch, cast, lang }));
  // This link's refusals (Hanli 11-04, 定国安民 refused twice under 定国安□ and no way past): every refusal counts —
  // a word not in the list too, though it costs no star — and after `tries` the ways past it open (the choices,
  // 请{name}接). `rejected`: his words refused as not in the list, the ones a helper may vouch for.
  let tries = 0, rejected = [];
  // Kept for Ling's Look: the idiom he follows, and one way on — what a Reveal tells (rules/wordboard.mjs) — and how
  // the link stands for him.
  const kept = () => ({ face: st.said.at(-1), answer: wayOn(dict, st) ?? '' });
  keep(ctx, 'open', { kind: 'chain', ...kept() });
  const status = () => ctx.foot(fill(w.chainAt, { n: st.links, links: ch.links }) + (tries ? ` · ${fill(w.tried, { n: tries })}` : ''));
  const helper = ctx.helper ?? null;

  return new Promise((resolve) => {
    // Told in the chat on his ask: their way on laid out as theirs, and over — as a skip.
    const stop = watch(ctx, (told) => {
      if (done) return;
      done = true;
      strip(ctx, '');
      if (told.answer) ctx.add({ who: 'note', text: fill(w.chainTold, { w: told.answer }) });
      ctx.sound('skip');
      ctx.log({ kind: 'chain', chat: ctx.id, told: true, links: st.links });
      keep(ctx, 'close');
      resolve(toldEnd('chain', told.answer ?? '', null));
    });
    const end = async (o, event, guess = '') => {
      if (done) return;
      done = true;
      stop();
      keep(ctx, 'close');
      strip(ctx, '');
      ctx.sound(o.grade === 'skipped' ? 'skip' : 'right');
      ctx.log({ kind: 'chain', chat: ctx.id, links: st.links, said: st.said, hints: st.hints, choices: st.choices, grade: o.grade });
      if (event === 'stuck') ctx.add({ who: 'note', text: fill(w.chainStuck, { name: cast[0]?.name ?? '' }) });
      if (game.after?.length) { await ctx.settle(); await playAfter(ctx, game.after); }
      else await react(chainLine(chat, { event, guess, ch, cast, lang }), { wait: true });
      resolve(o);
    };
    const hintRow = (text) => ctx.add({ who: 'note', text: `${fill(w.hintAt, { n: lh })}${text}` });
    // Hints are per link (two each: 「欺人□□」, then 「欺人太□」); the count for the stars is the whole game's.
    let lh = 0, at = 0, helping = false;
    const shown = [];
    const stepped = () => keep(ctx, 'step', { hints: hintsOf(shown), tries, rejected: hintsOf(rejected) });
    const showHint = () => {
      if (at !== st.said.length) { at = st.said.length; lh = 0; }
      if (lh >= 2) return '';
      lh += 1;
      st.hints += 1;
      const h = chainHint(dict, st, lh);
      if (h) { hintRow(h); ctx.sound('hint'); shown.push(h); stepped(); }
      return h;
    };
    // The hint before him on this link, if any (hint 2's 「定国安□」 once shown).
    const hintNow = () => (at === st.said.length ? shown.at(-1) ?? '' : '');
    // His link taken — judged right, near the hint, vouched for by his helper, or handed by the person — and theirs after.
    const take = (word, note = '') => {
      ctx.add({ who: 'me', html: tilesOf(word, { head: true }), text: word });
      if (note) ctx.add({ who: 'note', text: note });
      st = playLink(st, word, 'me');
      tries = 0;
      rejected = [];
      ctx.sound('right');
      const b = card()?.querySelector('.g-jc-jl-beads');
      if (b) b.innerHTML = beads();
      if (st.links >= ch.links) return end(chainOutcome({ done: true, hints: st.hints, choices: st.choices }), 'done', word);
      const mine = replyOf(dict, st.said);
      if (!mine) return end(chainOutcome({ done: true, hints: st.hints, choices: st.choices }), 'stuck', word);
      st = playLink(st, mine, 'them');
      theirs(mine, true);
      shown.length = 0; // a link's hints are its own
      keep(ctx, 'step', { ...kept(), hints: hintsOf(shown), tries, rejected: hintsOf(rejected) });
      react(chainLine(chat, { event: 'link', guess: word, mine, n: st.links, ch, cast, lang }));
      return draw();
    };
    const link = (raw) => {
      if (done || helping) return;
      const text = String(raw ?? '').trim();
      if (!text) return;
      const r = checkLink(dict, st, text);
      if (r.v === 'empty') return;
      if (r.v === 'right') return take(r.word);
      // Hint 2 shows three characters and his keeps them all: taken, near — the hint never contradicts the page.
      const hint = hintNow();
      if (r.v === 'unknown' && lh >= 2 && nearLink(st, r.word, hint)) {
        const way = wayOn(dict, st);
        return take(r.word, fill(w.chainNear, { t: way ?? hint }));
      }
      ctx.add({ who: 'me', text });
      const why = fill(w.chainWhy[r.v], { w: r.word, ch: needOf(st) });
      ctx.add({ who: 'note', text: why });
      tries += 1;
      if (r.v === 'unknown') {
        // Not in the list: no miss, no star lost — but it counts toward the way past this link.
        if ([...r.word].length === 4 && [...r.word][0] === needOf(st) && !rejected.includes(r.word)) rejected.push(r.word);
      } else {
        st = { ...st, misses: st.misses + 1 };
        ctx.sound('wrong');
        if (st.misses >= 2) showHint();
        react(chainLine(chat, { event: 'miss', guess: r.word, why, ch, cast, lang }));
      }
      stepped();
      draw();
    };
    // 请{name}接: past `tries` refusals on one link, the person links it for him (the commonest way on) and the chain
    // goes on — counted his, as the choices are (a star less).
    const pass = () => {
      if (done || helping) return;
      const way = wayOn(dict, st);
      if (!way) return end(chainOutcome({ done: true, hints: st.hints, choices: st.choices }), 'stuck', st.said.at(-1));
      st.choices = true;
      take(way, fill(w.chainPassed, { name: cast[0]?.name ?? '', w: way }));
    };
    // 求助 (one model turn, only on his tap): his helper is asked with the board's facts; her words are hers, and what
    // the board does is the page's — a refused word of his she vouches for, or the page's own way on whispered.
    const help = async () => {
      if (done || helping || !helper || typeof ctx.help !== 'function') return;
      helping = true;
      draw();
      const way = wayOn(dict, st), need = needOf(st), tried = [...rejected];
      const r = await ctx.help(helpLine(chat, { need, said: st.said, hint: hintNow(), rejected: tried, way: way ?? '', lang })).catch(() => null);
      helping = false;
      ctx.log({ kind: 'chain-help', chat: ctx.id, helper: helper.id, ok: Boolean(r?.text), err: r?.err ?? r?.refused ?? null });
      if (done) return;
      const h = helpOf(r?.text, { rejected: tried, need, way });
      if (h?.whisper) { st.choices = true; ctx.add({ who: 'note', text: fill(w.chainTold, { w: h.whisper }) }); }
      const by = r?.by === 'ling' ? 'Ling' : helper.name;
      if (h?.accept && needOf(st) === need) return take(h.accept, fill(w.chainVouched, { name: by, w: h.accept }));
      if (!r?.text) ctx.add({ who: 'note', text: fill(w.helpFar, { name: by }) });
      draw();
    };
    const draw = () => {
      status();
      // The choices and 请{name}接 open past `tries`; only taking one costs the star (a 不算错 refusal never does).
      const four = tries >= ch.tries ? chainChoices(dict, st) : [];
      const choices = four.length ? `<div class="g-jc-chips is-game">${four.map((x) => `<button type="button" class="g-jc-chip" data-pick="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : '';
      const passBtn = tries >= ch.tries ? btn('is-pass', fill(w.chainPass, { name: cast[0]?.name ?? '' }), helping ? ' disabled' : '') : '';
      const helpBtn = helper && typeof ctx.help === 'function' ? btn('is-help', fill(w.helpAsk, { name: helper.name }), helping ? ' disabled' : '') : '';
      const el = strip(ctx, `${choices}<form class="g-jc-bar is-game"><span class="g-jc-need" title="${esc(w.chainNeed)}">${esc(needOf(st))}</span><input class="g-jc-in" data-jc-in="" type="text" maxlength="12" autocomplete="off" enterkeyhint="send" placeholder="${esc(fill(w.linkIt, { ch: needOf(st) }))}">`
        + `<button type="submit" class="g-jc-send">${esc(w.linkGo)}</button></form>`
        + `<div class="g-jc-gacts">${btn('is-hint', w.hint, at === st.said.length && lh >= 2 ? ' disabled' : '')}${helpBtn}${passBtn}</div>`);
      const input = el.querySelector('.g-jc-in');
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.isComposing) e.preventDefault(); });
      el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); link(input.value); });
      for (const b of el.querySelectorAll('[data-pick]')) b.addEventListener('click', () => { st.choices = true; link(b.dataset.pick); });
      el.querySelector('.is-hint').addEventListener('click', () => { showHint(); draw(); });
      el.querySelector('.is-help')?.addEventListener('click', () => { help(); });
      el.querySelector('.is-pass')?.addEventListener('click', () => { pass(); });
      focusIn(ctx, input);
    };
    draw();
  });
}

/** The table a guess game reads (aigames.json `twenty`), for the module to fetch once. */
export { tableOf } from './jinchat-games.js';
