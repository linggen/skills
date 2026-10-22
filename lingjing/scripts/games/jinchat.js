// jinchat.js — 今's 聊天: a phone chat on the stage (Hanli 10-22, the 调息 sweep: 「你说的1-6 都是好主意, 按你说的改一遍.
// 关键是能留住玩家」). The 今 interludes were 调息 after 调息; 今线 is campus life, so a chat with 阿禾 · 马小宝 · 眼镜 ·
// 老蔡 · his mum is the 今's own game, and the contrast to the 古: he types anything, they answer in character.
//
// One module, every chat from data (games.json `jinchat` · `data.chats[deal.chat]`): `look` (phone · call · dark), the
// chat's `title` and `when`, `who` (people.json ids, or `{ id, name, voice }`), `open` — the book's own lines on the
// screen as it begins —, `chips` (the book's lines he may send with a tap), `facts` and `goal` (for Ling, hidden),
// `turns` (how many lines he sends), `book` (the book's own exchange, played when no one can be asked), `typing`
// (`slow`: 阿禾 types, stops, types again). The task's `how` says the goal to him in the shell's bar.
//
// Each of his lines is a turn in the game's own chat, to Ling (drawguess-ling.js — the one way there): a hidden line with
// the facts (jinchat-rules.js turnLine), her reply laid out as their bubbles. The rules (jinchat-rules.js) count and
// decide: the goal met after he spoke → 3 stars; his lines used up → 1; either way the story goes on (the 今 pays
// nothing). Never stuck on a model: a 测试存档's stub (`&her=stub`) answers on the page; chat off, no engine, no chat
// or a turn that fails → the book's own exchange is played and 「就到这儿」 ends it. The stuck gate (stuck.js) still
// offers 「算了，往下走」 under the card after 75 s, as on every board.
//
// mount(container, { data, lang, signal, shell }) → Promise<{ won, grade, stars } | { won: false, left: true }>

import { askInChat, reachable } from './drawguess-ling.js';
import { castOf, outcome, parseChat, stubReply, turnLine } from './jinchat-rules.js';

export const meta = {
  id: 'jinchat',
  name: { zh: '聊天 · 今线', en: 'Chat · the present line' },
  how: { zh: '打字，回他们。', en: 'Type, and answer them.' },
  ai: true, // the other half is a model's (no bot plays it)
  rows: true, // the 游戏厅's 试玩 of a story row plays that row's chat (arcade-board.js `row=`)
};

const TIMEOUT_MS = 45000; // Ling's prompt is the whole game's: a turn is 7–30 s (live 10-22)

const T = {
  zh: {
    type: '说点什么……', send: '发送', typing: '对方正在输入…', left: '还能说 {n} 句', done: '聊完了', end: '就到这儿',
    calling: '通话中', far: '这会儿叫不应。', off: '这个测试存档不叫灵（chat=off）。', err: '没回。再说一句？',
  },
  en: {
    type: 'Say something…', send: 'Send', typing: 'typing…', left: '{n} lines left', done: 'Chat over', end: 'Leave it there',
    calling: 'On call', far: 'No one answers just now.', off: 'This test save asks no one (chat=off).', err: 'No reply. Say it again?',
  },
};
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const pick = (v, lang) => (v == null ? '' : typeof v === 'string' ? v : v[lang] ?? v.zh ?? '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const WORLD = new URL('../../worlds/jiuding/', import.meta.url);
let regP = null, peopleP = null;
const chatsOf = () => (regP ??= fetch(new URL('games.json', WORLD)).then((r) => r.json())
  .then((reg) => reg.games.find((g) => g.id === 'jinchat' && !g.task)?.data?.chats ?? {}).catch(() => ({})));
const peopleOf = () => (peopleP ??= fetch(new URL('people.json', WORLD)).then((r) => r.json())
  .then((d) => Object.fromEntries((Array.isArray(d.people) ? d.people : Object.values(d.people ?? d)).filter((p) => p?.id).map((p) => [p.id, p]))).catch(() => ({})));

/** Every chat turn, for the console (and a live check's script): what was sent, what came back, how long. */
function log(row) {
  (globalThis.__jinchat ??= []).push({ at: Date.now(), ...row });
  console.info('[jinchat]', JSON.stringify(row));
}

export function mount(container, { data = {}, lang = 'zh', signal, shell } = {}) {
  const doc = container.ownerDocument;
  const w = T[lang] ?? T.zh;
  styleOnce(doc);
  const root = doc.createElement('div');
  root.className = 'g-jc';
  container.replaceChildren(root);
  const sessionOf = () => (typeof data.session === 'function' ? data.session() : data.session ?? null);
  const g = { chat: null, cast: [], sent: 0, shown: [], busy: false, over: false, mode: 'model', t0: Date.now() };
  let finish = () => {};

  const avatar = (c) => (c?.art
    ? `<img class="g-jc-av" src="${esc(new URL(c.art, WORLD).href)}" alt="" draggable="false">`
    : `<span class="g-jc-av is-letter">${esc([...(c?.name ?? '·')][0])}</span>`);
  const bubbleHtml = (line) => {
    const mine = line.who === 'me';
    const c = g.cast.find((x) => x.id === line.who);
    const name = !mine && g.cast.length > 1 ? `<i class="g-jc-name">${esc(c?.name ?? '')}</i>` : '';
    const body = line.card === 'video' ? `<span class="g-jc-video"><b>▶</b><span>${esc(line.text)}</span></span>` : esc(line.text);
    return `<div class="g-jc-row${mine ? ' is-me' : ''}">${mine ? '' : avatar(c)}<div class="g-jc-col">${name}<div class="g-jc-bub">${body}</div></div></div>`;
  };
  const $ = (sel) => root.querySelector(sel);
  const list = () => $('.g-jc-list');
  const scroll = () => { const l = list(); if (l) l.scrollTop = l.scrollHeight; };
  // The page lays the chat's node into a fresh host on a redraw (Ling's turn ending, the stuck slot — live 10-22) and the
  // list comes back at the top. Unless his own hand scrolled up, the last bubble is put back in view.
  const atBottom = (l) => l.scrollTop + l.clientHeight >= l.scrollHeight - 6;
  const keepDown = () => {
    const l = list();
    if (!l || !root.isConnected || !g.stick || atBottom(l)) return;
    l.scrollTo({ top: l.scrollHeight, behavior: 'instant' });
  };
  const add = (line) => {
    g.stick = true;
    g.shown.push(line);
    try { shell?.sound?.(line.who === 'me' ? 'send' : 'recv'); } catch { /* no sound: the chat goes on */ }
    list()?.insertAdjacentHTML('beforeend', bubbleHtml(line));
    scroll();
  };
  const typing = (on) => { $('.g-jc-typing')?.classList.toggle('is-on', on); if (on) scroll(); };
  const foot = (t) => { const f = $('.g-jc-foot'); if (f) f.textContent = t; };
  const lefts = () => foot(g.over ? w.done : fill(w.left, { n: Math.max(0, turns() - g.sent) }));
  const turns = () => Math.max(1, Number(g.chat?.turns) || 5);
  const inputOn = (on) => {
    for (const el of root.querySelectorAll('.g-jc-in, .g-jc-send, .g-jc-chip')) el.disabled = !on;
    if (on) $('.g-jc-in')?.focus({ preventScroll: true });
  };
  // Her typing shows a beat for each bubble; 阿禾 (`typing: slow`) types, stops and types again.
  const typeOut = async (lines) => {
    for (const l of lines) {
      typing(true);
      const ms = Math.min(1600, 380 + [...l.text].length * 40) * (g.chat?.typing === 'slow' ? 1.8 : 1);
      if (g.chat?.typing === 'slow') { await wait(ms / 2); typing(false); await wait(500); typing(true); await wait(ms / 2); } else await wait(ms);
      typing(false);
      add(l);
    }
  };

  const draw = () => {
    const c = g.chat, look = c.look ?? 'phone';
    root.className = `g-jc is-${esc(look)}`;
    const head = look === 'dark' ? '' : `<div class="g-jc-head"><span class="g-jc-back">‹</span><b>${esc(pick(c.title, lang))}</b>`
      + `<span class="g-jc-when">${look === 'call' ? `<i class="g-jc-rec"></i>${esc(w.calling)}` : esc(pick(c.when, lang))}</span></div>`;
    const darkHead = look === 'dark' ? `<div class="g-jc-dhead">${esc(pick(c.when, lang))}</div>` : '';
    const chips = (c.chips ?? []).map((t, i) => `<button type="button" class="g-jc-chip" data-chip="${i}">${esc(pick(t, lang))}</button>`).join('');
    root.innerHTML = `${head}${darkHead}<div class="g-jc-list"></div>`
      + `<div class="g-jc-typing"><span></span><span></span><span></span><em>${esc(w.typing)}</em></div>`
      + `<div class="g-jc-chips">${chips}</div>`
      + `<form class="g-jc-bar"><input class="g-jc-in" type="text" maxlength="120" autocomplete="off" enterkeyhint="send" placeholder="${esc(w.type)}">`
      + `<button type="submit" class="g-jc-send">${esc(w.send)}</button></form>`
      + `<div class="g-jc-footrow"><span class="g-jc-foot"></span><button type="button" class="g-jc-end" hidden>${esc(w.end)}</button></div>`;
    // A key in the box is the chat's, never the page's or a game's (Enter sends; an IME's Enter composes).
    const input = $('.g-jc-in');
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.isComposing) e.preventDefault(); });
    $('.g-jc-bar').addEventListener('submit', (e) => { e.preventDefault(); say(input.value); });
    // A book line sent is spent: its chip goes (live 10-22: 阿禾's 「要是真到那一步…」 stood on under its own bubble).
    for (const b of root.querySelectorAll('.g-jc-chip')) b.addEventListener('click', () => { if (g.busy || g.over) return; b.remove(); say(pick(c.chips[Number(b.dataset.chip)], lang)); });
    $('.g-jc-end').addEventListener('click', () => end({ won: true, grade: 'talked', stars: 1 }));
  };

  const end = (r) => {
    if (g.over) return;
    g.over = true;
    inputOn(false);
    $('.g-jc-chips')?.replaceChildren();
    lefts();
    log({ kind: 'end', chat: data.chat, ...r, sent: g.sent, ms: Date.now() - g.t0 });
    setTimeout(() => finish(r), r.grade === 'met' ? 1800 : 1200);
  };

  /* No one to ask: the book's own exchange, then 「就到这儿」. */
  const cannot = async (why) => {
    g.mode = 'book';
    inputOn(false);
    $('.g-jc-chips')?.replaceChildren();
    await typeOut((g.chat.book ?? []).map((l) => ({ who: l.who, text: pick(l.text, lang) })));
    foot(why);
    const b = $('.g-jc-end');
    if (b) b.hidden = false;
  };

  const ask = async (text) => {
    if (data.seam === 'stub') { await wait(900); return { text: stubReply(g.cast, g.sent) }; }
    const line = turnLine(g.chat, { k: g.sent, text, cast: g.cast, shown: g.shown.slice(0, g.chat.open?.length ?? 0), lang });
    log({ kind: 'sent', chat: data.chat, k: g.sent });
    return askInChat({ sid: sessionOf(), agent: 'ling', text: line, signal, timeoutMs: TIMEOUT_MS });
  };

  const say = async (raw) => {
    const text = String(raw ?? '').trim();
    if (!text || g.busy || g.over || g.mode !== 'model') return;
    g.busy = true;
    $('.g-jc-in').value = '';
    inputOn(false);
    add({ who: 'me', text });
    g.sent += 1;
    lefts();
    typing(true);
    let r = null;
    const t = performance.now();
    try { r = await ask(text); } catch (e) { r = { err: String(e?.message ?? e) }; }
    typing(false);
    if (signal?.aborted) return;
    const p = r?.text ? parseChat(r.text, g.cast) : { lines: [], met: false };
    log({ kind: 'reply', chat: data.chat, k: g.sent, ms: Math.round(performance.now() - t), met: p.met, lines: p.lines.length, err: r?.err ?? r?.refused ?? null });
    if (!p.lines.length) {
      // No reply (a timeout, a refusal, an empty turn): the line he sent does not count; after two, the book.
      g.sent -= 1;
      g.fails = (g.fails ?? 0) + 1;
      g.busy = false;
      if (g.fails >= 2) return cannot(w.far);
      foot(w.err);
      inputOn(true);
      return;
    }
    await typeOut(p.lines);
    g.busy = false;
    const o = outcome({ met: p.met, sent: g.sent, turns: turns() });
    if (o.over) return end({ won: true, grade: o.grade, stars: o.stars });
    lefts();
    inputOn(true);
  };

  const start = async () => {
    const [chats, people] = await Promise.all([chatsOf(), peopleOf()]);
    g.chat = data.chats?.[data.chat] ?? chats[data.chat] ?? null;
    if (!g.chat) { root.textContent = `jinchat: no chat ${data.chat ?? '(none)'}`; return; }
    g.cast = castOf(g.chat, people, lang);
    draw();
    // The card is redrawn around the chat (the stuck gate's 「算了，往下走」 slot, live 10-22): the node is laid into a
    // new host and its list comes back scrolled to the top — keep the last bubble in view whenever it is laid out again.
    g.stick = true;
    const l = list(), hand = () => { g.handAt = Date.now(); };
    for (const ev of ['wheel', 'touchmove', 'pointerdown']) l.addEventListener(ev, hand, { passive: true });
    l.addEventListener('scroll', () => { if (Date.now() - (g.handAt ?? 0) < 800) g.stick = atBottom(l); }, { passive: true });
    g.keep = setInterval(keepDown, 300);
    inputOn(false);
    lefts();
    await typeOut((g.chat.open ?? []).map((l) => ({ who: l.who, card: l.card, text: pick(l.text, lang) })));
    if (data.seam === 'off') return cannot(w.off);
    if (data.seam !== 'stub' && (!(await reachable()) || !sessionOf())) return cannot(w.far);
    inputOn(true);
  };

  return new Promise((resolve) => {
    let settled = false;
    finish = (result) => { if (settled) return; settled = true; clearInterval(g.keep); resolve(result); };
    signal?.addEventListener('abort', () => finish({ won: false, left: true }), { once: true });
    start().catch((e) => { console.warn('[jinchat]', e); cannot(w.far); });
  });
}

function styleOnce(doc) {
  if (doc.getElementById('g-jc-style')) return;
  const el = doc.createElement('style');
  el.id = 'g-jc-style';
  el.textContent = STYLE;
  doc.head.append(el);
}

// Comic and clean (Hanli 10-20: small games are comic): a phone's own colours in either theme, a thick ink outline
// and a hard offset shadow on every bubble; the dark is a black room where only the voices show.
const STYLE = `
.g-jc { --jc-bg: #ecebe6; --jc-ink: #22201c; --jc-me: #9de07a; --jc-them: #fff; --jc-dim: #7a756b;
  position: relative; display: flex; flex-direction: column; height: min(540px, 60vh); min-height: 360px; max-width: 520px; margin: 0 auto;
  border: 3px solid var(--jc-ink); border-radius: 22px; background: var(--jc-bg); color: var(--jc-ink); overflow: hidden;
  box-shadow: 5px 6px 0 rgba(34, 32, 28, .85); font-size: 15px; line-height: 1.45; }
.g-jc-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 2.5px solid var(--jc-ink); background: #f7f6f2; }
.g-jc-head b { flex: 1; font-size: 16px; font-weight: 700; letter-spacing: .02em; }
.g-jc-back { font-size: 24px; line-height: 1; font-weight: 700; }
.g-jc-when { font-size: 12px; color: var(--jc-dim); white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; }
.g-jc-rec { width: 8px; height: 8px; border-radius: 50%; background: #e04a3a; animation: g-jc-blink 1.2s infinite; }
.g-jc-list { flex: 1; overflow-y: auto; padding: 12px 10px 6px; display: flex; flex-direction: column; gap: 10px; scroll-behavior: smooth; }
.g-jc-row { display: flex; align-items: flex-start; gap: 7px; animation: g-jc-pop .22s ease-out; }
.g-jc-row.is-me { flex-direction: row-reverse; }
.g-jc-av { flex: none; width: 36px; height: 36px; border-radius: 10px; border: 2.5px solid var(--jc-ink); object-fit: cover; background: #fff; }
.g-jc-av.is-letter { display: grid; place-items: center; font-weight: 800; background: #ffd66b; }
.g-jc-col { display: flex; flex-direction: column; gap: 2px; max-width: 76%; min-width: 0; }
.g-jc-row.is-me .g-jc-col { align-items: flex-end; }
.g-jc-name { font-style: normal; font-size: 11.5px; color: var(--jc-dim); padding-left: 4px; }
.g-jc-bub { padding: 8px 11px; border: 2.5px solid var(--jc-ink); border-radius: 14px 14px 14px 4px; background: var(--jc-them);
  box-shadow: 2px 3px 0 var(--jc-ink); overflow-wrap: anywhere; }
.g-jc-row.is-me .g-jc-bub { background: var(--jc-me); border-radius: 14px 14px 4px 14px; }
.g-jc-video { display: flex; align-items: center; gap: 8px; }
.g-jc-video b { flex: none; display: grid; place-items: center; width: 44px; height: 32px; border-radius: 6px; background: var(--jc-ink); color: #fff; font-size: 13px; }
.g-jc-typing { display: none; align-items: center; gap: 4px; padding: 0 16px 6px; color: var(--jc-dim); font-size: 12px; }
.g-jc-typing.is-on { display: flex; }
.g-jc-typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--jc-dim); animation: g-jc-dot 1s infinite; }
.g-jc-typing span:nth-child(2) { animation-delay: .15s; } .g-jc-typing span:nth-child(3) { animation-delay: .3s; }
.g-jc-typing em { font-style: normal; margin-left: 4px; }
.g-jc-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 10px; }
.g-jc-chips:empty { display: none; }
.g-jc-chip { font: inherit; font-size: 13px; padding: 5px 10px; border: 2px dashed var(--jc-ink); border-radius: 999px; background: #fffbe8; color: var(--jc-ink); cursor: pointer; text-align: left; }
.g-jc-bar { display: flex; gap: 8px; padding: 8px 10px; border-top: 2.5px solid var(--jc-ink); background: #f7f6f2; margin: 6px 0 0; }
.g-jc-in { flex: 1; min-width: 0; font: inherit; font-size: 16px; padding: 7px 10px; border: 2.5px solid var(--jc-ink); border-radius: 10px; background: #fff; color: var(--jc-ink); }
.g-jc-in:disabled { background: #e7e5de; }
.g-jc-send { font: inherit; font-weight: 700; padding: 6px 14px; border: 2.5px solid var(--jc-ink); border-radius: 10px; background: #5cc23a; color: #fff;
  box-shadow: 2px 2px 0 var(--jc-ink); cursor: pointer; }
.g-jc-send:disabled, .g-jc-chip:disabled { opacity: .45; cursor: default; }
.g-jc-footrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 12px 8px; background: #f7f6f2; font-size: 12px; color: var(--jc-dim); }
.g-jc-end { font: inherit; font-size: 12.5px; padding: 3px 10px; border: 2px solid var(--jc-ink); border-radius: 999px; background: #fff; color: var(--jc-ink); cursor: pointer; }
.g-jc.is-call .g-jc-head { background: #2b2a27; color: #fff; }
.g-jc.is-call .g-jc-when { color: #ddd; }
.g-jc.is-dark { --jc-bg: #07080b; --jc-ink: #0b0c10; --jc-them: rgba(150, 160, 190, .14); --jc-me: rgba(140, 200, 120, .16); --jc-dim: #6f7690;
  border-color: #000; color: #c9cede; box-shadow: 5px 6px 0 rgba(0, 0, 0, .6); }
.g-jc.is-dark .g-jc-dhead { padding: 10px 14px 0; font-size: 12px; color: #4d5266; letter-spacing: .1em; text-align: center; }
.g-jc.is-dark .g-jc-av { opacity: .35; filter: grayscale(1) brightness(.6); border-color: #222; }
.g-jc.is-dark .g-jc-bub { border-color: rgba(200, 210, 240, .18); box-shadow: none; color: #d6dbea; font-family: var(--serif, serif); }
.g-jc.is-dark .g-jc-bar, .g-jc.is-dark .g-jc-footrow { background: #0d0e13; border-color: #1c1e26; }
.g-jc.is-dark .g-jc-in { background: #14161d; color: #d6dbea; border-color: #2a2d38; }
.g-jc.is-dark .g-jc-in:disabled { background: #101218; }
.g-jc.is-dark .g-jc-send { background: #2f5a2a; border-color: #1c1e26; box-shadow: none; }
.g-jc.is-dark .g-jc-chip { background: #14161d; color: #c9cede; border-color: #3a3e4c; }
.g-jc.is-dark .g-jc-end { background: #14161d; color: #c9cede; border-color: #3a3e4c; }
@keyframes g-jc-pop { from { transform: translateY(6px) scale(.97); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes g-jc-dot { 0%, 100% { transform: translateY(0); opacity: .5; } 50% { transform: translateY(-3px); opacity: 1; } }
@keyframes g-jc-blink { 50% { opacity: .25; } }
@media (max-width: 600px) { .g-jc { height: min(520px, 64dvh); border-radius: 18px; } .g-jc-col { max-width: 80%; } }
@media (prefers-reduced-motion: reduce) { .g-jc-row, .g-jc-typing span, .g-jc-rec { animation: none; } }
`;
