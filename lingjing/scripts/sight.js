// sight.js — 初见: a face's first coming-on, drawn large on the stage.
//
// Hanli, 2026-10-05: 「中间放大显示人物，只在第一次出场的时候就可以，之后不用放大了」.
// A person or a creature stands in the middle of the stage over the box at his
// 亮相 — the beat the book marks `[名]{注=id}`, his formal entrance, the paragraph
// his card stands after in the book (2026-10-13; rules/tell.mjs beatsOf `notes`,
// dialogue.js sightNow, tests/liangxiang.test.mjs): his 图鉴
// portrait — a name card where none is painted — his name and one line. The
// next beat, it shrinks back to his small card in the header and is gone.
//
// Also here: the chat beside the stage folds away (a handle on the seam), kept
// per viewer in this browser — and the page's own fold for a game, the map or a
// fight (setAutoFold), which keeps nothing. On a phone the chat is a bottom sheet
// behind a slim bar instead (PHONE_QUERY, phone.css).
import { esc } from './esc.js';

/* The kinds that come on in person: a 人物 or a 生物 — a thing or an art does not, unless its entry says it does
   (codex.json `sight`: the 饭桶, Hanli 2026-10-27 「饭桶第一次出现, 配个人物志类似的图吧」). */
export const SIGHT_KINDS = new Set(['人物', '生物']);
export const isSight = (e) => Boolean(e && (SIGHT_KINDS.has(e.kind) || e.sight));

/* The large card: the picture (or a clean name card), the name, one line. A tap goes on, as the box does. */
export function sightHtml(entries, { src = (p) => p } = {}) {
  const one = (e) => {
    const pic = e.image
      ? `<img class="sightpic${e.kind === '生物' || e.sight ? ' plate' : ''}" src="${esc(src(e.image))}" alt="${esc(e.name)}">`
      : `<span class="sightpic namecard" aria-hidden="true"><b>${esc(e.name)}</b></span>`;
    const line = e.lines?.[0] ? `<span class="sightline">${esc(e.lines[0])}</span>` : '';
    return `<figure class="sightone" data-sight-id="${esc(e.id)}">${pic}<figcaption><b>${esc(e.name)}</b>${line}</figcaption></figure>`;
  };
  return `<div class="sightcard${entries.length > 1 ? ' two' : ''}" data-dlg-next data-sight="${esc(entries.map((e) => e.id).join(','))}">${entries.slice(0, 2).map(one).join('')}</div>`;
}

/* Paints the sight into `host`: a new one fades in; the one before shrinks
   toward its face in the header (`#headCards [data-codex-big=id]`), or fades up
   where it has none there, and is gone. `key` alone decides a change, so a
   repaint of the same beat never restarts it. */
let shownKey = null;
export function paintSight(host, entries, opts = {}) {
  if (!host) return;
  wordsRoom(host);
  const key = entries.length ? entries.map((e) => e.id).join(',') : null;
  if (key === shownKey) return;
  shownKey = key;
  for (const old of host.querySelectorAll('.sightcard:not(.going)')) leave(old);
  if (key) host.insertAdjacentHTML('beforeend', sightHtml(entries, opts));
  const card = host.querySelector('.sightcard:not(.going)');
  if (card) fitCard(card);
}

/* The whole picture, never a crop (Hanli, 2026-10-15, live at 古七: the 犰狳's woodcut, landscape,
   cut to a portrait frame — legs and belly, no head): the largest box of the picture's own shape
   that fits the room (`region` {w, h}) — contain, never cover. People's portraits are 2:3, so a
   person stands whole as before; a creature's plate (mostly 3:2, some upright) shows the beast
   whole. Null while there is nothing to fit. */
export function fitBox(region, aspect) {
  const w0 = Number(region?.w), h0 = Number(region?.h);
  if (!(w0 > 0 && h0 > 0 && aspect > 0)) return null;
  const w = Math.min(w0, h0 * aspect);
  return { w: Math.floor(w), h: Math.floor(w / aspect) };
}

/* A 出场's picture (creatures.json `appear`, lingjing.js fitAppear): the room on the stage its words
   leave — `stage` {w, h}, `text` the words' box in the stage's coordinates. A wide stage keeps the
   right of the words (the words stand at the lower left); a tall one (the phone) the space above
   them. Margins keep the ink's fade inside the stage and clear of 跳过 in the corner. */
export function artRoom(stage, text) {
  const W = Number(stage?.w), H = Number(stage?.h);
  if (!(W > 0 && H > 0)) return null;
  const top = H * 0.05, foot = H * 0.08 + 36;
  const beside = { x: (text?.right ?? 0) + 24, y: top, w: W * 0.97 - (text?.right ?? 0) - 24, h: H - top - foot };
  if (W > H && beside.w >= W * 0.3) return beside;
  return { x: W * 0.04, y: top, w: W * 0.92, h: Math.max(0, (text?.top ?? H) - top - 12) };
}

/* Each picture of the card sized by fitBox to the room its card leaves it: the card's height, its
   width shared between the faces less each one's name card beside it (or under it, where the
   phone stacks a pair). Again whenever the card's own box changes (the stage, the words' top). */
const GAP = 14;
function fitCard(card) {
  const fit = () => {
    if (!card.isConnected || card.classList.contains('going')) return;
    const figs = [...card.querySelectorAll('.sightone')];
    const share = (card.clientWidth - GAP * (figs.length - 1)) / Math.max(1, figs.length);
    for (const fig of figs) {
      const img = fig.querySelector('img.sightpic');
      if (!img?.naturalWidth) continue;
      const cap = fig.querySelector('figcaption');
      const stacked = getComputedStyle(fig).flexDirection === 'column';
      const region = stacked ? { w: share, h: card.clientHeight - (cap?.offsetHeight ?? 0) - 6 } : { w: share - (cap?.offsetWidth ?? 0) - GAP, h: card.clientHeight };
      const box = fitBox(region, img.naturalWidth / img.naturalHeight);
      if (!box) continue;
      img.style.width = `${box.w}px`;
      img.style.height = `${box.h}px`;
      img.classList.add('fit');
    }
  };
  for (const img of card.querySelectorAll('img.sightpic')) if (!img.complete) img.addEventListener('load', fit, { once: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(card);
  fit();
}

/* Where the words begin on the stage (the beat's whole paragraph is laid out, its unread sentences
   only faint): `--words-top` on the sight's layer, so on a phone the portrait ends above the words
   and shrinks rather than stand over them (phone.css). */
function wordsRoom(host) {
  const words = document.querySelector('#dlg .story .screen:not([hidden])');
  if (!words) { host.style.removeProperty('--words-top'); return; }
  // Measured from the stage (the layer is hidden while empty, so it has no box of its own yet).
  const stage = host.parentElement ?? host;
  const top = Math.round(words.getBoundingClientRect().top - stage.getBoundingClientRect().top - (parseFloat(getComputedStyle(host).top) || 0));
  host.style.setProperty('--words-top', `${Math.max(0, top)}px`);
}

function leave(card) {
  const fig = card.querySelector('.sightone');
  const id = fig?.dataset.sightId;
  const to = id ? document.querySelector(`#headCards [data-codex-big="${CSS.escape(id)}"] img, #headCards [data-codex-big="${CSS.escape(id)}"] .namecard`) : null;
  const a = fig?.querySelector('.sightpic')?.getBoundingClientRect(), b = to?.getBoundingClientRect();
  if (a?.width && b?.width && !card.classList.contains('two')) {
    const c = card.getBoundingClientRect();
    card.style.transformOrigin = `${a.left - c.left + a.width / 2}px ${a.top - c.top + a.height / 2}px`;
    card.style.setProperty('--to', `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(${(b.width / a.width).toFixed(3)})`);
  }
  card.removeAttribute('data-dlg-next');
  card.classList.add('going');
  setTimeout(() => card.remove(), 650);
}

/* 收起/展开 the chat: a handle on the seam between the stage and the chat;
   folded, the stage has the whole width. Kept in this browser (it may refuse). */
const CHAT_KEY = 'lingjing.chatFolded';
/* The page's own fold (2026-10-14, the approved prototypes: games, the map and a fight fold the
   chat; story pages keep it open): `autofold` on the shell, apart from the viewer's handle —
   nothing kept. A tap on the handle while it holds opens the chat for that game (`autoopen`). */
export function setAutoFold(shell, on) {
  if (!shell) return;
  if (!on) shell.classList.remove('autoopen');
  shell.classList.toggle('autofold', Boolean(on));
}
const CHAT_WORDS = { zh: ['收起对话', '展开对话'], en: ['Fold the chat away', 'Open the chat'] };
/* The phone (Hanli, 2026-10-15: 「手机layout也一起改」): on a narrow or short screen the stage takes
   the screen and the chat is a sheet — folded to a slim bar under the stage; a tap opens it from the
   bottom over the stage, a tap outside (or Esc) closes it, and a dot shows while Ling or 银月 wrote
   something unseen. Kept nowhere: it opens folded. The same query as phone.css. */
export const PHONE_QUERY = '(max-width: 600px), (max-width: 860px) and (max-height: 700px)';
const onPhone = () => Boolean(globalThis.matchMedia?.(PHONE_QUERY).matches);
const BAR_WORDS = { zh: ['和灵说话', '收起'], en: ['Talk to Ling', 'Close'] };
/* Is the chat out of sight now — the phone's sheet shut, the viewer's fold, or the page's? */
export function chatHidden(shell, phone = onPhone()) {
  const c = shell.classList;
  if (phone) return !c.contains('chatsheet');
  return c.contains('autofold') ? !c.contains('autoopen') : c.contains('chatfolded');
}
/* Ling or 银月 wrote in the chat: a dot on the bar while it is out of sight; opening it clears it. */
export function chatHeard(shell) {
  if (shell && chatHidden(shell)) shell.classList.add('chatunread');
}
export function mountChatToggle(shell, lang = () => 'zh') {
  if (!shell || shell.querySelector('.chattoggle')) return;
  let folded = false;
  try { folded = localStorage.getItem(CHAT_KEY) === '1'; } catch { /* no storage: open */ }
  const btn = document.createElement('button');
  btn.className = 'chattoggle';
  btn.type = 'button';
  const paint = () => {
    const phone = onPhone(), shut = chatHidden(shell, phone);
    const w = phone ? (BAR_WORDS[lang()] ?? BAR_WORDS.zh) : (CHAT_WORDS[lang()] ?? CHAT_WORDS.zh);
    const say = phone ? w[shut ? 0 : 1] : w[shut ? 1 : 0];
    btn.setAttribute('aria-pressed', shut ? 'true' : 'false');
    btn.title = say;
    btn.setAttribute('aria-label', say);
    const html = `<span aria-hidden="true">${shut ? '‹' : '›'}</span><b class="barword">${esc(say)}</b><i class="unread" aria-hidden="true"></i>`;
    if (btn.innerHTML !== html) btn.innerHTML = html;
  };
  // The page's fold comes and goes with the stage: the handle's arrow follows it.
  new MutationObserver(paint).observe(shell, { attributes: true, attributeFilter: ['class'] });
  const set = (on, keepIt) => {
    folded = on;
    shell.classList.toggle('chatfolded', on);
    paint();
    if (keepIt) { try { localStorage.setItem(CHAT_KEY, on ? '1' : '0'); } catch { /* this load only */ } }
  };
  // The phone's sheet: open on the bar, shut on the scrim, Esc, or the bar again.
  const sheet = (on) => {
    shell.classList.toggle('chatsheet', on);
    if (on) shell.classList.remove('chatunread');
  };
  const scrim = document.createElement('div');
  scrim.className = 'chatscrim';
  scrim.setAttribute('aria-hidden', 'true');
  scrim.addEventListener('click', () => sheet(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && shell.classList.contains('chatsheet')) sheet(false); });
  globalThis.matchMedia?.(PHONE_QUERY).addEventListener?.('change', () => { sheet(false); paint(); });
  btn.addEventListener('click', () => {
    if (onPhone()) { sheet(!shell.classList.contains('chatsheet')); return; }
    shell.classList.remove('chatunread');
    // Folded by the page for a game: the handle opens it for this game only, and keeps nothing.
    if (shell.classList.contains('autofold')) { shell.classList.toggle('autoopen'); paint(); return; }
    set(!folded, true);
  });
  shell.appendChild(scrim);
  shell.appendChild(btn);
  set(folded, false);
}
