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
//                     the hints in tiers, the choices after `tries` misses, 跳过 always.
//   chainGame(ctx)  — 成语接龙: the person opens, he follows from the last character; each link of theirs is the page's
//                     pick from the dictionary (worlds/<id>/chengyu.json); N links of his and he has won.
//   guessGame(ctx)  — 反着的二十问: he thinks of an animal; 想好了; then 是 · 不是 · 不知道 to each of their questions,
//                     对 · 不对 to a guess; missed, he types what it was, once. Any animal (Hanli 10-28, 袋鼠 too): they
//                     ask and guess freely, a model turn each — the page counts and holds each line to yes-or-no; a turn
//                     the model cannot give is the table's question instead (offline: the table plays it all, unseen).
//
// ctx: { root, chat, cast, lang, w (words), add(line), typeOut(lines), react(text, o) → Promise, sound(name),
//        foot(text), table() → Promise<twenty table>, ask(text) → Promise<{text}> (the open 二十问's turns), typing(on), log(row) }
// Each answers a Promise of the result: { won: true, grade, stars }.

import {
  answerFree, answerGuess, chainChoices, chainHint, chainLine, chainOf, chainOutcome, checkDown, checkLink, checkRiddle,
  coupletLine, coupletOf, freeLine, freeOutcome, freeSummary, freshChain, freshFree, freshGuess, judgeGuess, needOf, nextMove,
  playLink, replyOf, resultLine, riddleLine, riddleOf, riddleOutcome, shapeOf, yesNoOf,
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

/* The book's closing lines (`game.after`): theirs typed out; his (`who: me`) a chip he taps, then his bubble. */
async function playAfter(ctx, lines) {
  for (const l of lines ?? []) {
    const text = pick(l.text, ctx.lang);
    if (l.who !== 'me') { await ctx.typeOut([{ who: l.who, text }]); continue; }
    await new Promise((resolve) => {
      const el = strip(ctx, `<div class="g-jc-chips is-game"><button type="button" class="g-jc-chip">${esc(text)}</button></div>`);
      el.querySelector('.g-jc-chip').addEventListener('click', () => resolve(), { once: true });
    });
    strip(ctx, '');
    ctx.add({ who: 'me', text });
  }
}

/* ════════ 猜谜 ════════ */

export async function riddleGame(ctx) {
  const { chat, lang, w } = ctx;
  const game = chat.game, r = riddleOf(game, lang);
  const st = { misses: 0, hints: 0, choices: false, done: false };
  const label = pick(game.label, lang) || w.riddle;
  // A 灯谜 as it is hung at a lantern fair: the red lantern, the riddle on the paper slip beneath it (Hanli 10-27: the
  // boards in the house style, 「画面不精致」 never again).
  ctx.add({ who: 'card', html: `<div class="g-jc-riddle is-lantern">${lanternOf(ctx)(w.mi)}<div class="g-jc-strip"><i>${esc(label)}</i><p class="g-jc-q">${esc(r.q)}</p><ol class="g-jc-hints"></ol><p class="g-jc-ans" hidden></p></div></div>` });
  // A quiet game (`quiet`: 黑地里, the ambulance) asks no one: the moment is no game of theirs, only his answer and the book.
  const react = game.quiet ? () => Promise.resolve() : ctx.react;
  react(riddleLine(chat, { event: 'open', riddle: r, cast: ctx.cast, lang }));
  const card = () => [...ctx.root.querySelectorAll('.g-jc-riddle')].at(-1);
  const showHint = () => {
    if (st.hints >= r.hints.length) return '';
    const h = r.hints[st.hints++];
    card()?.querySelector('.g-jc-hints')?.insertAdjacentHTML('beforeend', `<li><b>${esc(fill(w.hintAt, { n: st.hints }))}</b>${esc(h)}</li>`);
    ctx.sound('hint');
    return h;
  };
  const status = () => ctx.foot(fill(w.tried, { n: st.misses }) + (r.hints.length ? ` · ${fill(w.hinted, { n: st.hints, max: r.hints.length })}` : ''));

  return new Promise((resolve) => {
    const finish = async (solved, guess) => {
      if (st.done) return;
      st.done = true;
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
      // A miss lights the next hint by itself after the first; past `tries`, the choices.
      const hint = st.misses >= 2 ? showHint() : '';
      if (st.misses >= r.tries && r.choices.length && !st.choices) st.choices = true;
      react(riddleLine(chat, { event: 'miss', guess: text, hint, choices: st.choices && st.misses === r.tries, riddle: r, cast: ctx.cast, lang }));
      draw();
    };
    const draw = () => {
      status();
      const choices = st.choices ? `<div class="g-jc-chips is-game">${r.choices.map((c) => `<button type="button" class="g-jc-chip" data-pick="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : '';
      const el = strip(ctx, `${choices}<form class="g-jc-bar is-game"><input class="g-jc-in" type="text" maxlength="40" autocomplete="off" enterkeyhint="send" placeholder="${esc(w.guessIt)}">`
        + `<button type="submit" class="g-jc-send">${esc(w.guessGo)}</button></form>`
        + `<div class="g-jc-gacts">${btn('is-hint', w.hint, st.hints >= r.hints.length ? ' disabled' : '')}${btn('is-skip', w.skip)}</div>`);
      const input = el.querySelector('.g-jc-in');
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.isComposing) e.preventDefault(); });
      el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); guess(input.value); });
      for (const b of el.querySelectorAll('[data-pick]')) b.addEventListener('click', () => guess(b.dataset.pick));
      el.querySelector('.is-hint').addEventListener('click', () => { showHint(); draw(); });
      el.querySelector('.is-skip').addEventListener('click', () => finish(false, null));
      input.focus({ preventScroll: true });
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
  ctx.add({ who: 'card', html: `<div class="g-jc-riddle is-lantern">${lanternOf(ctx)(w.wen)}<div class="g-jc-strip"><i>${esc(pick(chat.game.label, lang) || w.twenty)}</i><p class="g-jc-q is-small">${esc(fill(w.think, { max }))}</p></div></div>` });
  let st = freshFree();
  let tst = freshGuess(); // the table's own state, for a turn the model could not give
  let turn = 0;
  const status = () => ctx.foot(fill(w.asked, { n: st.log.length, max }));
  const speaker = () => cast[turn % cast.length]?.id ?? cast[0]?.id;
  // One turn of theirs: the model's line, held to yes-or-no (asked again once); else the table's next move, plainly.
  const nextTurn = async () => {
    for (const bad of [false, true]) {
      const r = await ctx.ask(freeLine(chat, st, { max, cast, lang, bad })).catch(() => null);
      const t = yesNoOf(r?.text, cast, lang);
      ctx.log({ kind: 'free-turn', chat: ctx.id, n: st.log.length + 1, ok: Boolean(t), err: r?.err ?? r?.refused ?? null });
      if (t) return t.kind === 'guess' && !t.text ? { ...t, text: fill(pick(table.guess, lang) || '{x}？', { x: t.x }) } : t;
      if (!r?.text) break; // no model at all: the table, at once
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
      // Smug when she has it, sulking when stumped — her own last word on the page's result.
      if (chat.game.after?.length) { await ctx.settle(); await playAfter(ctx, chat.game.after); }
      else if (o.grade !== 'skipped') await ctx.react(resultLine(chat, summary, lang), { wait: true });
      resolve(o);
    };
    const skipBtn = () => btn('is-skip', w.skip);
    const wire = (el) => el.querySelector('.is-skip')?.addEventListener('click', () => end(freeOutcome(st, { skipped: true })));
    const tell = () => {
      const el = strip(ctx, `<p class="g-jc-gnote">${esc(w.tell)}</p><form class="g-jc-bar is-game"><input class="g-jc-in" type="text" maxlength="12" autocomplete="off" enterkeyhint="send" placeholder="${esc(w.itWas)}">`
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
      input.focus({ preventScroll: true });
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
  const st = { misses: 0, hints: 0, choices: false, done: false };
  const label = pick(game.label, lang) || w.duilian;
  // A pair of red scrolls as they hang by a door: the 上联 on the right, the 下联's blank on the left (Hanli 10-27: the
  // boards in the house style). Solved, his characters fill it; skipped, the classic's.
  ctx.add({ who: 'card', html: `<div class="g-jc-duilian"><i class="g-jc-dl-label">${esc(label)}</i><div class="g-jc-dl-pair">`
    + `${scroll('down', w.downLabel, cells(c.up))}${scroll('up', w.upLabel, cells(c.up, [...c.up].filter((x) => /\p{Script=Han}/u.test(x))))}</div>`
    + `<ol class="g-jc-hints"></ol><p class="g-jc-dl-why" hidden></p><p class="g-jc-ans" hidden></p></div>` });
  const react = game.quiet ? () => Promise.resolve() : ctx.react;
  react(coupletLine(chat, { event: 'open', c, cast: ctx.cast, lang }));
  const card = () => [...ctx.root.querySelectorAll('.g-jc-duilian')].at(-1);
  const fillDown = (text, cls) => {
    const el = card()?.querySelector('.g-jc-dl-scroll.is-down .g-jc-dl-text');
    if (el) { el.innerHTML = cells(c.up, [...text].filter((x) => /\p{Script=Han}/u.test(x))); el.classList.add(cls); }
  };
  const showHint = () => {
    if (st.hints >= c.hints.length) return '';
    const h = c.hints[st.hints++];
    card()?.querySelector('.g-jc-hints')?.insertAdjacentHTML('beforeend', `<li><b>${esc(fill(w.hintAt, { n: st.hints }))}</b>${esc(h)}</li>`);
    ctx.sound('hint');
    return h;
  };
  const whyOf = (raw) => { const f = shapeOf(c, raw, tones); return fill(w.why[f?.id ?? 'form'], f ?? {}); };
  const status = () => ctx.foot(fill(w.triedDown, { n: st.misses }) + (c.hints.length ? ` · ${fill(w.hinted, { n: st.hints, max: c.hints.length })}` : ''));

  return new Promise((resolve) => {
    const finish = async (solved, guess) => {
      if (st.done) return;
      st.done = true;
      strip(ctx, '');
      fillDown(solved ? guess : c.answers[0] ?? '', solved ? 'is-his' : 'is-shown');
      const why = card()?.querySelector('.g-jc-dl-why');
      if (why) why.hidden = true;
      const ans = card()?.querySelector('.g-jc-ans');
      if (ans && c.src) { ans.hidden = false; ans.textContent = fill(w.srcBy, { src: c.src }); }
      ctx.sound(solved ? 'right' : 'skip');
      const o = riddleOutcome({ solved, hints: st.hints, choices: st.choices });
      ctx.log({ kind: 'couplet', chat: ctx.id, solved, misses: st.misses, hints: st.hints, choices: st.choices, guess: guess ?? null });
      if (game.after?.length) { await ctx.settle(); await playAfter(ctx, game.after); }
      else await react(coupletLine(chat, { event: solved ? 'solved' : 'skip', guess, c, cast: ctx.cast, lang }), { wait: true });
      resolve(o);
    };
    const guess = (raw) => {
      const text = String(raw ?? '').trim();
      if (!text || st.done) return;
      ctx.add({ who: 'me', text });
      if (checkDown(c, text) === 'right') return finish(true, text);
      st.misses += 1;
      ctx.sound('wrong');
      // What is off is the page's fact, shown under the scrolls and handed to their voice.
      const why = whyOf(text);
      const el = card()?.querySelector('.g-jc-dl-why');
      if (el) { el.hidden = false; el.textContent = why; }
      const hint = st.misses >= 2 ? showHint() : '';
      if (st.misses >= c.tries && c.choices.length && !st.choices) st.choices = true;
      react(coupletLine(chat, { event: 'miss', guess: text, why, hint, c, cast: ctx.cast, lang }));
      draw();
    };
    const draw = () => {
      status();
      const choices = st.choices ? `<div class="g-jc-chips is-game is-lines">${c.choices.map((x) => `<button type="button" class="g-jc-chip" data-pick="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : '';
      const el = strip(ctx, `${choices}<form class="g-jc-bar is-game"><input class="g-jc-in" type="text" maxlength="40" autocomplete="off" enterkeyhint="send" placeholder="${esc(w.downIt)}">`
        + `<button type="submit" class="g-jc-send">${esc(w.downGo)}</button></form>`
        + `<div class="g-jc-gacts">${btn('is-hint', w.hint, st.hints >= c.hints.length ? ' disabled' : '')}${btn('is-skip', w.skip)}</div>`);
      const input = el.querySelector('.g-jc-in');
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.isComposing) e.preventDefault(); });
      el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); guess(input.value); });
      for (const b of el.querySelectorAll('[data-pick]')) b.addEventListener('click', () => guess(b.dataset.pick));
      el.querySelector('.is-hint').addEventListener('click', () => { showHint(); draw(); });
      el.querySelector('.is-skip').addEventListener('click', () => finish(false, null));
      input.focus({ preventScroll: true });
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
  const status = () => ctx.foot(fill(w.chainAt, { n: st.links, links: ch.links }) + (st.misses ? ` · ${fill(w.tried, { n: st.misses })}` : ''));

  return new Promise((resolve) => {
    const end = async (o, event, guess = '') => {
      if (done) return;
      done = true;
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
    let lh = 0, at = 0;
    const showHint = () => {
      if (at !== st.said.length) { at = st.said.length; lh = 0; }
      if (lh >= 2) return '';
      lh += 1;
      st.hints += 1;
      const h = chainHint(dict, st, lh);
      if (h) { hintRow(h); ctx.sound('hint'); }
      return h;
    };
    const link = (raw) => {
      if (done) return;
      const text = String(raw ?? '').trim();
      if (!text) return;
      const r = checkLink(dict, st, text);
      if (r.v === 'empty') return;
      ctx.add({ who: 'me', ...(r.v === 'right' ? { html: tilesOf(r.word, { head: true }) } : {}), text });
      if (r.v === 'right') {
        st = playLink(st, r.word, 'me');
        ctx.sound('right');
        const b = card()?.querySelector('.g-jc-jl-beads');
        if (b) b.innerHTML = beads();
        if (st.links >= ch.links) return end(chainOutcome({ done: true, hints: st.hints, choices: st.choices }), 'done', r.word);
        const mine = replyOf(dict, st.said);
        if (!mine) return end(chainOutcome({ done: true, hints: st.hints, choices: st.choices }), 'stuck', r.word);
        st = playLink(st, mine, 'them');
        theirs(mine, true);
        react(chainLine(chat, { event: 'link', guess: r.word, mine, n: st.links, ch, cast, lang }));
        return draw();
      }
      const why = fill(w.chainWhy[r.v], { w: r.word, ch: needOf(st) });
      ctx.add({ who: 'note', text: why });
      if (r.v === 'unknown') return draw(); // not in the list: no miss
      st = { ...st, misses: st.misses + 1 };
      ctx.sound('wrong');
      if (st.misses >= 2) showHint();
      if (st.misses >= ch.tries) st.choices = true;
      react(chainLine(chat, { event: 'miss', guess: r.word, why, ch, cast, lang }));
      draw();
    };
    const draw = () => {
      status();
      const four = st.choices && st.misses >= ch.tries ? chainChoices(dict, st) : [];
      const choices = four.length ? `<div class="g-jc-chips is-game">${four.map((x) => `<button type="button" class="g-jc-chip" data-pick="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : '';
      const el = strip(ctx, `${choices}<form class="g-jc-bar is-game"><span class="g-jc-need" title="${esc(w.chainNeed)}">${esc(needOf(st))}</span><input class="g-jc-in" type="text" maxlength="12" autocomplete="off" enterkeyhint="send" placeholder="${esc(fill(w.linkIt, { ch: needOf(st) }))}">`
        + `<button type="submit" class="g-jc-send">${esc(w.linkGo)}</button></form>`
        + `<div class="g-jc-gacts">${btn('is-hint', w.hint, at === st.said.length && lh >= 2 ? ' disabled' : '')}${btn('is-skip', w.skip)}</div>`);
      const input = el.querySelector('.g-jc-in');
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.isComposing) e.preventDefault(); });
      el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); link(input.value); });
      for (const b of el.querySelectorAll('[data-pick]')) b.addEventListener('click', () => link(b.dataset.pick));
      el.querySelector('.is-hint').addEventListener('click', () => { showHint(); draw(); });
      el.querySelector('.is-skip').addEventListener('click', () => end(chainOutcome({ done: false }), 'skip'));
      input.focus({ preventScroll: true });
    };
    draw();
  });
}

/** The table a guess game reads (aigames.json `twenty`), for the module to fetch once. */
export { tableOf } from './jinchat-games.js';
