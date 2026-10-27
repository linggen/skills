// jinchat.js — 今's 聊天: a phone chat on the stage (Hanli 10-22, the 调息 sweep: 「你说的1-6 都是好主意, 按你说的改一遍.
// 关键是能留住玩家」). The 今 interludes were 调息 after 调息; 今线 is campus life, so a chat with 阿禾 · 马小宝 · 眼镜 ·
// 老蔡 · his mum is the 今's own game, and the contrast to the 古: he types anything, they answer in character.
//
// One module, every chat from data (games.json `jinchat` · `data.chats[deal.chat]`): `look` (phone · call · dark; `face` for the
// 古: said face to face, the page's paper and ink, no phone — 吓马三, 吴婆婆, 2026-10-26), the
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
// A host with no Ling chat (the phone app, doc/lingjing-phone.md step 2) hands `data.ask({ agent, text, system })` →
// `{ text }`: the same hidden line goes to its own model, with HOST_SYSTEM as the turn's system (what SKILL.md's
// `[jinchat]` rule is to the Mac's Ling); a host that cannot reach one throws `far`, and the book's exchange plays.
//
// mount(container, { data, lang, signal, shell }) → Promise<{ won, grade, stars } | { won: false, left: true }>

import { askInChat, reachable } from './drawguess-ling.js';
import { HOST_SYSTEM, castOf, outcome, parseChat, stubReply, turnLine } from './jinchat-rules.js';
import { stubLine } from './jinchat-games.js';
import { guessGame, riddleGame, tableOf } from './jinchat-play.js';

export const meta = {
  id: 'jinchat',
  sounds: ['send', 'recv', 'right', 'wrong', 'hint', 'skip', 'tap'], // what it names (games/kit/audio/sounds.json)
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
    riddle: '猜谜', mi: '谜', wen: '问', guessIt: '你猜……', guessGo: '猜', hint: '提示', hintAt: '提示{n}：', skip: '跳过', answer: '谜底：{a}',
    tried: '猜错 {n} 回', hinted: '提示 {n}/{max}',
    twenty: '二十问 · 猜你心里的动物', think: '心里想好一种动物，就在下面这些里挑。只许问是不是，{max} 问之内来猜。想好了，点「想好了」。',
    ready: '想好了', yes: '是', no: '不是', unknown: '不知道', right: '对', wrong: '不对', asked: '已问 {n}/{max}',
    tell: '没猜着。说出来，你心里是什么：', itWas: '它是……', tellGo: '说',
  },
  en: {
    type: 'Say something…', send: 'Send', typing: 'typing…', left: '{n} lines left', done: 'Chat over', end: 'Leave it there',
    calling: 'On call', far: 'No one answers just now.', off: 'This test save asks no one (chat=off).', err: 'No reply. Say it again?',
    riddle: 'A riddle', mi: '?', wen: '?', guessIt: 'Your guess…', guessGo: 'Guess', hint: 'Hint', hintAt: 'Hint {n}: ', skip: 'Skip', answer: 'The answer: {a}',
    tried: '{n} wrong', hinted: 'hints {n}/{max}',
    twenty: 'Twenty questions · the animal you think of', think: 'Think of an animal from the ones below. Yes-or-no questions only, and a guess within {max}. Ready? Tap "Got one".',
    ready: 'Got one', yes: 'Yes', no: 'No', unknown: 'Don\'t know', right: 'Right', wrong: 'Wrong', asked: 'Asked {n}/{max}',
    tell: 'Not guessed. Say what you thought of:', itWas: 'It was…', tellGo: 'Say',
  },
};
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const pick = (v, lang) => (v == null ? '' : typeof v === 'string' ? v : v[lang] ?? v.zh ?? '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const WORLD = new URL('../../worlds/jiuding/', import.meta.url);
let regP = null, peopleP = null, twentyP = null;
const twentyOf = () => (twentyP ??= fetch(new URL('aigames.json', WORLD)).then((r) => r.json()).then((d) => tableOf(d.twenty)));
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
    if (line.who === 'card') return `<div class="g-jc-row is-card">${line.html}</div>`;
    if (line.who === 'note') return `<div class="g-jc-note">${esc(line.text)}</div>`;
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
    if (line.who !== 'card' && line.who !== 'note') sound(line.who === 'me' ? 'send' : 'recv');
    list()?.insertAdjacentHTML('beforeend', bubbleHtml(line));
    scroll();
  };
  const sound = (name) => { try { shell?.sound?.(name); } catch { /* no sound: the chat goes on */ } };
  const typing = (on) => { $('.g-jc-typing')?.classList.toggle('is-on', on); if (on) scroll(); };
  const foot = (t) => { const f = $('.g-jc-foot'); if (f) f.textContent = t; };
  const lefts = () => { if (!g.chat?.game) foot(g.over ? w.done : fill(w.left, { n: Math.max(0, turns() - g.sent) })); }; // a word game keeps its own count
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
    const head = look === 'dark' ? '' : `<div class="g-jc-head">${look === 'face' ? '' : '<span class="g-jc-back">‹</span>'}<b>${esc(pick(c.title, lang))}</b>`
      + `<span class="g-jc-when">${look === 'call' ? `<i class="g-jc-rec"></i>${esc(w.calling)}` : esc(pick(c.when, lang))}</span></div>`;
    const darkHead = look === 'dark' ? `<div class="g-jc-dhead">${esc(pick(c.when, lang))}</div>` : '';
    const chips = (c.chips ?? []).map((t, i) => `<button type="button" class="g-jc-chip" data-chip="${i}">${esc(pick(t, lang))}</button>`).join('');
    // A word game (`game`, 2026-10-27) has its own strip of controls under the chat, in place of the free box.
    const game = c.game ? '<div class="g-jc-game"></div>' : '';
    root.innerHTML = `${head}${darkHead}<div class="g-jc-list"></div>`
      + `<div class="g-jc-typing"><span></span><span></span><span></span><em>${esc(w.typing)}</em></div>${game}`
      + `<div class="g-jc-chips"${c.game ? ' hidden' : ''}>${chips}</div>`
      + `<form class="g-jc-bar"${c.game ? ' hidden' : ''}><input class="g-jc-in" type="text" maxlength="120" autocomplete="off" enterkeyhint="send" placeholder="${esc(w.type)}">`
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
    if (!g.chat?.game) lefts();
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
    return send(line);
  };
  // One hidden line to whoever writes their words: Ling, or the person's own agent (`chat.agent`: 银月 writes her own
  // lines, the standing rule — her guest turn, as 讨饼债's; she refuses when not awake, and Ling, who wrote her
  // before, answers instead).
  const send = async (line, timeoutMs = TIMEOUT_MS) => {
    if (typeof data.ask === 'function') return data.ask({ agent: 'ling', text: line, system: HOST_SYSTEM[lang] ?? HOST_SYSTEM.zh });
    const agent = g.chat.agent ?? 'ling';
    if (agent !== 'ling') {
      const at = lang === 'en' ? '@Yinyue ' : '@银月 ';
      const r = await askInChat({ sid: sessionOf(), agent, text: line.replace(/^\[HIDDEN\] /, `[HIDDEN] ${at}`), signal, timeoutMs }).catch((e) => ({ err: String(e?.message ?? e) }));
      if (r?.text) return r;
      log({ kind: 'refused', chat: data.chat, agent, why: r?.refused ?? r?.err ?? null });
    }
    return askInChat({ sid: sessionOf(), agent: 'ling', text: line, signal, timeoutMs });
  };

  /* ── A word game (`chat.game`): the page plays it; their bubbles come when they come. ── */
  // One of their lines at a time: a moment while one is still on its way goes unanswered (the game never waits on it,
  // except the last, `wait`). After `settle()` (the book's lines close the game) no late bubble is laid.
  const react = (text, { wait: hold = false } = {}) => {
    if (!g.live || g.hush) return Promise.resolve();
    if (g.inflight && !hold) return g.inflight;
    const run = (g.inflight ?? Promise.resolve()).then(() => talk(text)).catch((e) => log({ kind: 'react-fail', chat: data.chat, err: String(e?.message ?? e) }))
      .finally(() => { if (g.inflight === run) g.inflight = null; });
    g.inflight = run;
    return run;
  };
  const say1 = async (text, event) => {
    if (data.seam === 'stub') { await wait(700); return { text: stubLine(g.cast, event) }; }
    return send(text);
  };
  const talk = async (text) => {
    const t = performance.now();
    const r = await say1(text, (text.match(/·(\S{0,6})/) ?? [])[1] ?? 'line');
    const p = r?.text ? parseChat(r.text, g.cast) : { lines: [] };
    log({ kind: 'react', chat: data.chat, ms: Math.round(performance.now() - t), lines: p.lines.length, err: r?.err ?? r?.refused ?? null });
    if (!p.lines.length || g.hush || g.over) return;
    await typeOut(p.lines.slice(0, 2));
  };
  const settle = async () => { await Promise.race([g.inflight ?? Promise.resolve(), wait(12000)]); g.hush = true; };
  const playGame = async () => {
    const ctx = {
      root, chat: g.chat, cast: g.cast, lang, w, id: data.chat, add, typeOut, react, settle, sound, foot, log,
      table: twentyOf,
      ask: (text) => (g.live && data.seam !== 'stub' ? send(text, 60000) : Promise.resolve({ text: '' })),
    };
    const kind = g.chat.game.kind;
    const r = await (kind === 'guess' ? guessGame(ctx) : riddleGame(ctx));
    end(r);
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
      if (g.fails >= 2 || r?.err === 'far') return cannot(w.far);
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
    // A word game's context first (`game.setup`, the book's own narration: 最后一颗 — what the 饭桶 just did).
    for (const l of g.chat.game?.setup ?? []) add({ who: 'note', text: pick(l, lang) });
    await typeOut((g.chat.open ?? []).map((l) => ({ who: l.who, card: l.card, text: pick(l.text, lang) })));
    if (g.chat.game) {
      // Every game plays with no one to ask (chat off, no engine): the page judges, the book closes it.
      g.live = data.seam === 'stub' || typeof data.ask === 'function' || (data.seam !== 'off' && Boolean(sessionOf()) && (await reachable()));
      return playGame();
    }
    if (data.seam === 'off') return cannot(w.off);
    if (data.seam !== 'stub' && typeof data.ask !== 'function' && (!(await reachable()) || !sessionOf())) return cannot(w.far);
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
/* 古: face to face — the book's paper and ink, a seal-red for his own lines; no phone chrome. */
.g-jc.is-face { --jc-bg: #f3ead6; --jc-ink: #2b2219; --jc-them: #fbf6ea; --jc-me: #ecd2b4; --jc-dim: #8a7a60; border-radius: 6px;
  font-family: var(--serif, serif); box-shadow: 4px 5px 0 rgba(43, 34, 25, .55); }
.g-jc.is-face .g-jc-head { background: #e8dcc2; justify-content: space-between; }
.g-jc.is-face .g-jc-bub { border-width: 1.5px; box-shadow: none; border-radius: 4px; }
.g-jc.is-face .g-jc-av { border-radius: 50%; border-width: 1.5px; }
.g-jc.is-face .g-jc-bar, .g-jc.is-face .g-jc-footrow { background: #e8dcc2; }
.g-jc.is-face .g-jc-send { background: #9a3b2a; box-shadow: none; }
.g-jc.is-face .g-jc-chip { background: #fbf6ea; }
/* A word game (2026-10-27): the riddle's card in the list, the context's narration line, the controls' strip. */
.g-jc [hidden] { display: none !important; }
.g-jc-note { align-self: center; max-width: 92%; font-size: 12.5px; color: var(--jc-dim); text-align: center; font-style: italic; padding: 2px 6px; }
.g-jc-row.is-card { justify-content: center; }
.g-jc-riddle { width: min(100%, 420px); text-align: center; display: flex; flex-direction: column; align-items: center; }
/* 灯谜: a red lantern with gold caps and a tassel, the riddle on a paper slip hung beneath it. */
.g-jc-lan { position: relative; display: flex; flex-direction: column; align-items: center; transform-origin: 50% 0; animation: g-jc-swing 4.5s ease-in-out infinite; }
.g-jc-lan-cap { width: 30px; height: 7px; border-radius: 2px; background: linear-gradient(#f6d77a, #b98a1e); box-shadow: 0 1px 0 rgba(0,0,0,.25); }
.g-jc-lan-cap.is-low { width: 24px; }
.g-jc-lan-body { position: relative; width: 70px; height: 52px; margin: -1px 0; border-radius: 50%;
  background: repeating-linear-gradient(90deg, rgba(90,10,6,.0) 0 11px, rgba(90,10,6,.35) 11px 12.5px), radial-gradient(circle at 50% 38%, #ff8a5c 0, #e0321f 42%, #a3170f 78%, #6e0d08 100%);
  box-shadow: 0 0 18px rgba(255, 120, 60, .45), inset 0 -6px 10px rgba(0,0,0,.25); display: grid; place-items: center; }
.g-jc-lan-body b { font-family: var(--serif, serif); font-size: 22px; color: #ffe08a; text-shadow: 0 1px 0 #7a1208; }
.g-jc-lan-cord { width: 2px; height: 12px; background: #b98a1e; }
.g-jc-strip { position: relative; width: 100%; padding: 12px 16px 12px; border-radius: 3px; transform: rotate(-.6deg);
  background: linear-gradient(#c8231b, #c8231b) top / 100% 5px no-repeat, linear-gradient(#c8231b, #c8231b) bottom / 100% 5px no-repeat, #fff3dc;
  box-shadow: 2px 4px 0 rgba(34, 32, 28, .35), 0 0 0 1px rgba(150, 40, 20, .35); font-family: var(--serif, serif); }
.g-jc-strip i { display: block; font-style: normal; font-size: 11.5px; letter-spacing: .14em; color: #9a3b2a; }
.g-jc-q.is-small { font-size: 14px; font-weight: 600; }
.g-jc.is-dark .g-jc-strip { filter: brightness(.82) sepia(.15); color: #2b2219; }
.g-jc.is-dark .g-jc-pool { color: #6b5e48; }
.g-jc.is-dark .g-jc-list { scrollbar-color: #2a2d38 #0b0c10; }
.g-jc.is-dark .g-jc-gbtn { box-shadow: none; border-color: #3a3e4c; background: #14161d; color: #c9cede; }
.g-jc.is-dark .g-jc-gbtn.is-yes, .g-jc.is-dark .g-jc-gbtn.is-main { background: #2f5a2a; color: #e6f0e0; }
.g-jc.is-dark .g-jc-gbtn.is-no { background: #5a2a24; color: #f0e0dc; }
.g-jc-q { margin: 4px 0 2px; font-size: 16px; font-weight: 700; line-height: 1.55; }
.g-jc-hints { margin: 6px 0 0; padding: 0; list-style: none; font-size: 13px; color: #6b4d12; }
.g-jc-hints li { margin-top: 2px; }
.g-jc-ans { margin: 6px 0 0; font-weight: 800; color: #9a3b2a; }
.g-jc-pool { margin: 6px 0 0; font-size: 12.5px; color: var(--jc-dim); line-height: 1.6; }
.g-jc-game { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px 6px; border-top: 2.5px solid var(--jc-ink); background: #f7f6f2; }
.g-jc.is-face .g-jc-game { background: #e8dcc2; border-top-width: 1.5px; }
.g-jc.is-dark .g-jc-game { background: #0d0e13; border-color: #1c1e26; }
.g-jc-game:empty { display: none; }
.g-jc-game .g-jc-bar { margin: 0; padding: 0; border: 0; background: none; }
.g-jc-gacts { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.g-jc-gbtn { font: inherit; font-size: 14px; font-weight: 700; padding: 6px 16px; border: 2.5px solid var(--jc-ink); border-radius: 999px; background: #fff; color: var(--jc-ink);
  box-shadow: 2px 2px 0 var(--jc-ink); cursor: pointer; }
.g-jc-gbtn:disabled { opacity: .4; cursor: default; }
.g-jc-gbtn.is-yes, .g-jc-gbtn.is-main { background: #5cc23a; color: #fff; }
.g-jc-gbtn.is-no { background: #e8674f; color: #fff; }
.g-jc-gbtn.is-skip { font-weight: 500; font-size: 12.5px; box-shadow: none; border-style: dashed; }
.g-jc-gnote { margin: 0; font-size: 13px; text-align: center; }
.g-jc.is-face .g-jc-gbtn { box-shadow: none; border-width: 1.5px; }
.g-jc.is-face .g-jc-gbtn.is-yes, .g-jc.is-face .g-jc-gbtn.is-main { background: #6f7f3a; }
.g-jc.is-face .g-jc-gbtn.is-no { background: #9a3b2a; }
@keyframes g-jc-swing { 0%, 100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }
@keyframes g-jc-pop { from { transform: translateY(6px) scale(.97); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes g-jc-dot { 0%, 100% { transform: translateY(0); opacity: .5; } 50% { transform: translateY(-3px); opacity: 1; } }
@keyframes g-jc-blink { 50% { opacity: .25; } }
@media (max-width: 600px) { .g-jc { height: min(520px, 64dvh); border-radius: 18px; } .g-jc-col { max-width: 80%; } }
@media (prefers-reduced-motion: reduce) { .g-jc-row, .g-jc-typing span, .g-jc-rec, .g-jc-lan { animation: none; } }
`;
