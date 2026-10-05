// sight.js — 初见: a face's first coming-on, drawn large on the stage.
//
// Hanli, 2026-10-05: 「中间放大显示人物，只在第一次出场的时候就可以，之后不用放大了」.
// A person or a foe the scene brings on for the first time (Look's
// `scene.meet`, read off the save's scenes done — rules/codex.mjs newHere, so
// an old save never meets again whom it met) stands in the middle of the stage
// over the box at the beat that first has him (dialogue.js sightNow): his 图鉴
// portrait — a name card where none is painted — his name and one line. The
// next beat, it shrinks back to his small card in the header and is gone.
//
// Also here: the chat beside the stage folds away (a handle on the seam), kept
// per viewer in this browser.
import { esc } from './esc.js';

/* The kinds that come on in person: a 人物 or a 生物 — a thing or an art does not. */
export const SIGHT_KINDS = new Set(['人物', '生物']);

/* The large card: the picture (or a clean name card), the name, one line. A tap goes on, as the box does. */
export function sightHtml(entries, { src = (p) => p } = {}) {
  const one = (e) => {
    const pic = e.image
      ? `<img class="sightpic" src="${esc(src(e.image))}" alt="${esc(e.name)}">`
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
  const key = entries.length ? entries.map((e) => e.id).join(',') : null;
  if (key === shownKey) return;
  shownKey = key;
  for (const old of host.querySelectorAll('.sightcard:not(.going)')) leave(old);
  if (key) host.insertAdjacentHTML('beforeend', sightHtml(entries, opts));
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
const CHAT_WORDS = { zh: ['收起对话', '展开对话'], en: ['Fold the chat away', 'Open the chat'] };
export function mountChatToggle(shell, lang = () => 'zh') {
  if (!shell || shell.querySelector('.chattoggle')) return;
  let folded = false;
  try { folded = localStorage.getItem(CHAT_KEY) === '1'; } catch { /* no storage: open */ }
  const btn = document.createElement('button');
  btn.className = 'chattoggle';
  btn.type = 'button';
  const set = (on, keepIt) => {
    folded = on;
    shell.classList.toggle('chatfolded', on);
    const w = CHAT_WORDS[lang()] ?? CHAT_WORDS.zh;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = w[on ? 1 : 0];
    btn.setAttribute('aria-label', w[on ? 1 : 0]);
    btn.innerHTML = `<span aria-hidden="true">${on ? '‹' : '›'}</span>`;
    if (keepIt) { try { localStorage.setItem(CHAT_KEY, on ? '1' : '0'); } catch { /* this load only */ } }
  };
  btn.addEventListener('click', () => set(!folded, true));
  shell.appendChild(btn);
  set(folded, false);
}
