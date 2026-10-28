// npc-talk.js — the one talk panel for every board where the player speaks with someone of the world (Hanli 2026-10-28:
// 「可以做一个通用的和NPC对话的UI」): 砍价's keeper first; the 今 chats (games/jinchat.js) draw their list with it too.
// Taken out of jinchat's chat (its frame, bubbles, avatars, typing and looks: phone · call · dark · face) — one
// component, its classes still the `g-jc-` they were born with.
//
// A board DECLARES the talk and the component draws it:
//   mountTalk(host, {
//     npc:     { id, name, art }       who speaks (people.json's portrait, or a letter)
//     look:    'face' | 'phone' | 'call' | 'dark'
//     title, when                      the head (face: the place; phone: the chat's name)
//     lang, base                       words; the URL portraits resolve against (the world's folder)
//     tools:   [{ kind: 'close'|'sound', label }]   the shared shell's ✕ (and 🔊) in the head, heard by onTool
//     slow                             she types, stops, types again
//   }) → { say(lines), me(text), note(text), typing(on), slot, widgets(html), onTool(fn), onSlot(sel, fn, 'click'|'input'), destroy() }
//   `slot` is the board's own strip under the talk — the widgets: patience beads, a price slider, the argument buttons,
//   a riddle's input — redrawn by `widgets(html)`; taps in it reach `onSlot`. The NPC's lines come from the model
//   through a hidden call (npc-ask.js — a side session, never the story's chat) with the facts the board gives
//   (npc-line.js); a board shows them with `say`, the typing dots while it waits.
//   createTalk(root, { cast, base, sound, slow }) — the list alone (bubbles, typing, the last one kept in view), for a
//   board that draws its own frame (jinchat).
// At most one result line ever reaches the story's chat, and that is the board's to send, never this panel's.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const W = { zh: { typing: '对方正在输入…', sound: '声音', close: '关闭' }, en: { typing: 'typing…', sound: 'Sound', close: 'Close' } };

/** A speaker's face: the portrait (resolved against `base`), else the first letter of the name. */
export function avatarHtml(c, base = null) {
  if (c?.art) return `<img class="g-jc-av" src="${esc(base ? new URL(c.art, base).href : c.art)}" alt="" draggable="false">`;
  return `<span class="g-jc-av is-letter">${esc([...(c?.name ?? '·')][0])}</span>`;
}

/** One line of the talk: `who` 'me' (the player), 'note' (narration), 'card' (a board's own html), else a cast id. */
export function bubbleHtml(line, cast = [], base = null) {
  if (line.who === 'card') return `<div class="g-jc-row is-card">${line.html}</div>`;
  if (line.who === 'note') return `<div class="g-jc-note">${esc(line.text)}</div>`;
  const mine = line.who === 'me';
  const c = cast.find((x) => x.id === line.who);
  const name = !mine && cast.length > 1 ? `<i class="g-jc-name">${esc(c?.name ?? '')}</i>` : '';
  const body = line.html ? line.html : line.card === 'video' ? `<span class="g-jc-video"><b>▶</b><span>${esc(line.text)}</span></span>` : esc(line.text);
  return `<div class="g-jc-row${mine ? ' is-me' : ''}">${mine ? '' : avatarHtml(c, base)}<div class="g-jc-col">${name}<div class="g-jc-bub">${body}</div></div></div>`;
}

/** The frame a declared talk draws: head (by look), the list, the typing dots, the board's slot. */
export function frameHtml({ look = 'face', title = '', when = '', npc = null, lang = 'zh', tools = [], base = null } = {}) {
  const w = W[lang] ?? W.zh;
  const btns = tools.map((t) => `<button type="button" class="gshell-btn gshell-${esc(t.kind)} g-jc-tool" data-talk-tool="${esc(t.kind)}" title="${esc(t.label ?? w[t.kind] ?? t.kind)}" aria-label="${esc(t.label ?? w[t.kind] ?? t.kind)}">${t.kind === 'close' ? '✕' : t.kind === 'sound' ? (t.on === false ? '🔇' : '🔊') : esc(t.glyph ?? '?')}</button>`).join('');
  const face = npc && look === 'face' ? `<span class="g-jc-headav">${avatarHtml(npc, base)}</span>` : '';
  const head = look === 'dark' ? `<div class="g-jc-dhead">${esc(when)}${btns}</div>`
    : `<div class="g-jc-head">${look === 'face' ? face : '<span class="g-jc-back">‹</span>'}<b>${esc(title)}</b><span class="g-jc-when">${look === 'call' ? '<i class="g-jc-rec"></i>' : ''}${esc(when)}</span>${btns}</div>`;
  return `${head}<div class="g-jc-list"></div><div class="g-jc-typing"><span></span><span></span><span></span><em>${esc(w.typing)}</em></div><div class="g-jc-game"></div>`;
}

/** The list's life: bubbles laid in, the typing dots, the newest kept in view unless his hand scrolled up. */
export function createTalk(root, { cast = [], base = null, sound = () => {}, slow = false } = {}) {
  const $ = (sel) => root.querySelector(sel);
  const list = () => $('.g-jc-list');
  const st = { stick: true, handAt: 0, cast, slow };
  const atBottom = (l) => l.scrollTop + l.clientHeight >= l.scrollHeight - 6;
  const scroll = () => { const l = list(); if (l) l.scrollTop = l.scrollHeight; };
  const typing = (on) => { $('.g-jc-typing')?.classList.toggle('is-on', on); if (on) scroll(); };
  const add = (line) => {
    st.stick = true;
    if (line.who !== 'card' && line.who !== 'note') { try { sound(line.who === 'me' ? 'send' : 'recv'); } catch { /* no sound: the talk goes on */ } }
    list()?.insertAdjacentHTML('beforeend', bubbleHtml(line, st.cast, base));
    scroll();
  };
  // Each bubble after a typing beat as long as the line; `slow` types, stops and types again.
  const typeOut = async (lines) => {
    for (const l of lines) {
      typing(true);
      const ms = Math.min(1600, 380 + [...String(l.text ?? '')].length * 40) * (st.slow ? 1.8 : 1);
      if (st.slow) { await wait(ms / 2); typing(false); await wait(500); typing(true); await wait(ms / 2); } else await wait(ms);
      typing(false);
      add(l);
    }
  };
  // The node laid into a fresh host on a redraw comes back scrolled to the top: put the last bubble back in view.
  const keepDown = () => {
    const l = list();
    if (!l || !root.isConnected || !st.stick || atBottom(l)) return;
    l.scrollTo({ top: l.scrollHeight, behavior: 'instant' });
  };
  const watch = () => {
    const l = list();
    if (!l) return;
    const hand = () => { st.handAt = Date.now(); };
    for (const ev of ['wheel', 'touchmove', 'pointerdown']) l.addEventListener(ev, hand, { passive: true });
    l.addEventListener('scroll', () => { if (Date.now() - st.handAt < 800) st.stick = atBottom(l); }, { passive: true });
  };
  return { add, typeOut, typing, scroll, keepDown, watch, setCast: (c) => { st.cast = c; }, setSlow: (on) => { st.slow = Boolean(on); } };
}

/** A declared talk in `host` (see the head of this file). */
export function mountTalk(host, spec = {}) {
  const doc = host.ownerDocument;
  talkStyle(doc);
  const root = doc.createElement('div');
  root.className = `g-jc is-${esc(spec.look ?? 'face')} npc-talk`;
  root.innerHTML = frameHtml(spec);
  host.replaceChildren(root);
  const npc = spec.npc ?? { id: 'npc', name: '' };
  const talk = createTalk(root, { cast: [{ id: npc.id ?? 'npc', ...npc }], base: spec.base, sound: spec.sound, slow: spec.slow });
  talk.watch();
  const keep = setInterval(talk.keepDown, 300);
  const slot = root.querySelector('.g-jc-game');
  let toolFn = () => {}, slotFns = [];
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-talk-tool]');
    if (t) { toolFn(t.dataset.talkTool, t); return; }
    for (const [sel, fn, type] of slotFns) { if (type !== 'click') continue; const el = e.target.closest(sel); if (el && slot.contains(el) && !el.disabled) { fn(el, e); return; } }
  });
  root.addEventListener('input', (e) => { for (const [sel, fn, type] of slotFns) if (type === 'input' && e.target.matches?.(sel)) fn(e.target, e); });
  // A key in the panel is the panel's, never the page's or a game's.
  root.addEventListener('keydown', (e) => e.stopPropagation());
  return {
    root, slot,
    say: (lines) => talk.typeOut((Array.isArray(lines) ? lines : [lines]).filter(Boolean).map((text) => ({ who: npc.id ?? 'npc', text }))),
    me: (text) => talk.add({ who: 'me', text }),
    note: (text) => talk.add({ who: 'note', text }),
    typing: talk.typing,
    widgets: (html) => { slot.innerHTML = html; },
    onTool: (fn) => { toolFn = fn; },
    onSlot: (sel, fn, type = 'click') => { slotFns.push([sel, fn, type]); },
    destroy: () => { clearInterval(keep); root.remove(); },
  };
}

export function talkStyle(doc) {
  if (!doc || doc.getElementById('npc-talk-style')) return;
  const el = doc.createElement('style');
  el.id = 'npc-talk-style';
  el.textContent = TALK_STYLE;
  doc.head.append(el);
}

// Comic and clean (Hanli 10-20: small games are comic): a phone's own colours in either theme, a thick ink outline
// and a hard offset shadow on every bubble; the dark is a black room where only the voices show; face to face (古),
// the book's paper and ink.
export const TALK_STYLE = `
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
.g-jc.is-dark .g-jc-list { scrollbar-color: #2a2d38 #0b0c10; }
.g-jc.is-dark .g-jc-gbtn { box-shadow: none; border-color: #3a3e4c; background: #14161d; color: #c9cede; }
.g-jc.is-dark .g-jc-gbtn.is-yes, .g-jc.is-dark .g-jc-gbtn.is-main { background: #2f5a2a; color: #e6f0e0; }
.g-jc.is-dark .g-jc-gbtn.is-no { background: #5a2a24; color: #f0e0dc; }
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
@keyframes g-jc-pop { from { transform: translateY(6px) scale(.97); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes g-jc-dot { 0%, 100% { transform: translateY(0); opacity: .5; } 50% { transform: translateY(-3px); opacity: 1; } }
@keyframes g-jc-blink { 50% { opacity: .25; } }
@media (max-width: 600px) { .g-jc { height: min(520px, 64dvh); border-radius: 18px; } .g-jc-col { max-width: 80%; } }
@media (prefers-reduced-motion: reduce) { .g-jc-row, .g-jc-typing span, .g-jc-rec, .g-jc-lan, .g-jc-dl-scroll, .g-jc-dl-c { animation: none !important; } }
/* The head's tools (the shared shell's ✕, 🔊) and the speaker's face in a face-to-face talk. */
.g-jc-head .g-jc-tool, .g-jc-dhead .g-jc-tool { flex: none; margin-left: 2px; }
.g-jc-headav .g-jc-av { width: 34px; height: 34px; }
`;
