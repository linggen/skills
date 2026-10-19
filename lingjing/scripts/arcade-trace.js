// arcade-trace.js — the 游戏厅's chat panel beside a game the model plays (画猜: `meta.ai` and
// `onTrace`). Hanli 10-19: 「从大厅进的时候, 可否旁边加上聊天panel … 让Yinyue来真的猜一次」, and
// 「chat里是否能显示发送的图片, 例如 chat 里显示 "@Yinyue [image01]"」.
// It shows the real traffic, row by row as the game logs it (drawguess.js `onTrace`): each look as
// the player's own turn — 「@银月 [image01]」, the very PNG sent (tap the chip to see it) and the
// words sent folded under it — then her reply as the engine stored it, the guess checked, the model
// and the time; a refusal (`absent`, `unavailable`) or a failure is a plain line, never a wait.
// Page-side on purpose: the shared chat (/shared/chat-bridge.js → /embed) draws a user turn's
// picture as the text `[image]` and its add_message carries no images, and the round's own
// session is emptied before every look and removed at the end — bound to it, the panel would hold
// one look at most, and none once the round settled. Nothing here is sent; nothing is kept.
import { esc } from './esc.js';

const W = {
  zh: {
    title: '对话 · 实况', note: '本局真发出去的图和话，和回来的原话。游戏里只在纸上的气泡里。', sent: '发出的话', empty: '画一笔，看一眼就到这里。',
    names: { ling: '灵', yinyue: '银月' }, begin: '新一局 · 画「{w}」', won: '猜中 · 「{w}」', lost: '没猜中 · 「{w}」', guess: '猜：', open: '开场',
    refused: { absent: '引擎回 absent：存档里{who}没醒着（companion.awake），这一眼没跑她的回合。', unavailable: '引擎回 unavailable：{who}不在（宠物关着）。' },
    far: '连不上引擎。', blind: '这个模型看不见图：', error: '这一眼没回来：{m}', close: '关',
  },
  en: {
    title: 'Chat · live', note: 'What was really sent, and her words as they came back. In the game they show only on the paper.', sent: 'Words sent', empty: 'Draw a stroke; each look lands here.',
    names: { ling: 'Ling', yinyue: 'Yinyue' }, begin: 'New round · draw {w}', won: 'Guessed · {w}', lost: 'Missed · {w}', guess: 'Guess: ', open: 'opening',
    refused: { absent: 'The engine said absent: {who} is not awake in the save (companion.awake); no turn ran.', unavailable: 'The engine said unavailable: {who} is not here (the pet is off).' },
    far: 'The engine can\'t be reached.', blind: 'This model can\'t see pictures: ', error: 'This look didn\'t come back: {m}', close: 'Close',
  },
};
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const two = (n) => String(n).padStart(2, '0');

/** The panel's empty frame (the page lays it beside the game). */
export const traceHtml = (lang) => {
  const w = W[lang] ?? W.zh;
  return `<aside class="arcade-chat" aria-label="${esc(w.title)}"><header><b>${esc(w.title)}</b><small>${esc(w.note)}</small></header>`
    + `<ol class="arcade-chat-log"><li class="arcade-chat-sys is-empty">${esc(w.empty)}</li></ol></aside>`;
};

/** Hear `mod`'s rows into the panel at `el`; answers the way to stop. */
export function wireTrace(el, mod, lang) {
  const w = W[lang] ?? W.zh, log = el.querySelector('.arcade-chat-log'), doc = el.ownerDocument;
  const pics = []; // the PNGs sent, in order: [imageNN] is pics[NN - 1]
  const name = (who) => w.names[who] ?? who;
  const add = (cls, html) => {
    log.querySelector('.is-empty')?.remove();
    const li = doc.createElement('li');
    li.className = cls;
    li.innerHTML = html;
    log.append(li);
    log.scrollTop = log.scrollHeight;
    return li;
  };
  const sys = (text) => add('arcade-chat-sys', esc(text));
  const ROWS = {
    begin: (r) => sys(fill(w.begin, { w: r.word })),
    sent: (r) => {
      pics.push(r.png);
      const n = pics.length;
      add('arcade-chat-me', `<p>@${esc(name(r.who))} <button type="button" class="arcade-chat-img" data-pic="${n}">[image${two(n)}]</button>`
        + `${r.open ? ` <small>${esc(w.open)}</small>` : ''}</p><details><summary>${esc(w.sent)}</summary><pre>${esc(r.prompt ?? '')}</pre></details>`);
    },
    open: (r) => (r.refused ? ROWS.refused(r) : her(r, r.text, null)),
    guess: (r) => her(r, r.text, r),
    refused: (r) => sys(fill(w.refused[r.refused] ?? r.refused, { who: name(r.who) })),
    blind: (r) => sys(w.blind + (r.text ?? '')),
    far: () => sys(w.far),
    error: (r) => sys(fill(w.error, { m: r.message })),
    end: (r) => sys(fill(r.won ? w.won : w.lost, { w: r.word })),
    reveal: (r) => her(r, r.text, null),
  };
  const her = (r, text, g) => {
    const meta = [r.model, r.ms != null ? `${(r.ms / 1000).toFixed(1)} s` : null, r.tools ? `tools ${r.tools}` : null].filter(Boolean).join(' · ');
    const verdict = g?.guess ? `<p class="arcade-chat-guess${g.ok ? ' is-ok' : ''}">${esc(w.guess)}${esc(g.guess)} ${g.ok ? '✓' : '✗'}</p>` : '';
    add('arcade-chat-her', `<b>${esc(name(r.who))}</b><p>${esc(text ?? '').replace(/\n/g, '<br>')}</p>${verdict}<small>${esc(meta)}</small>`);
  };
  el.addEventListener('click', (e) => {
    const n = Number(e.target.closest?.('[data-pic]')?.dataset.pic);
    if (n && pics[n - 1]) show(doc, pics[n - 1], `image${two(n)}`, w.close);
  });
  return mod.onTrace((row) => ROWS[row.kind]?.(row));
}

/* The picture as it was sent, large, over the page; a tap anywhere puts it away. */
function show(doc, png, label, close) {
  const box = doc.createElement('div');
  box.className = 'arcade-chat-view';
  box.innerHTML = `<figure><img alt="${esc(label)}" src="data:image/png;base64,${png}"><figcaption>${esc(label)} · ${esc(close)}</figcaption></figure>`;
  box.addEventListener('click', () => box.remove());
  doc.body.append(box);
}
