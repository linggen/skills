// fantong-free.js — 喂饭桶's free play (Hanli, 2026-10-15): a small board in the
// 物品 panel. Pure drawing — the rules' `fantong` brief and the last feed's
// answer in, HTML out, every word esc()'d — plus the drag that drops a thing
// into the bucket's mouth. The bucket is the story's own drawing
// (games/fantong.js drawBucket). The rules roll everything; the page shows the
// name and the one line of small print, never the effect.
import { esc } from './esc.js';
import { drawBucket } from './games/fantong.js';
import { zhuanHtml } from './pouch.js';

export const FANTONG_WORDS = {
  zh: {
    chip: '饭桶', title: '喂饭桶', open: '饭桶张着嘴，等你喂。', pick: '把一样东西拖进饭桶的嘴里，或点一下再点「喂」。',
    feed: '喂{name}', lingshi: '搭灵石', around: '柴垛边', recipes: '方子', found: '新认出一张方子：', back: '回储物袋', none: '没有能喂的东西。',
    stored: '存进洞府待取',
  },
  en: {
    chip: 'Rice Bucket', title: 'Feed the Rice Bucket', open: 'The Rice Bucket gapes, waiting.', pick: 'Drag a thing into its mouth, or tap it and then Feed.',
    feed: 'Feed {name}', lingshi: 'Add spirit stones', around: 'by the woodpile', recipes: 'Recipes', found: 'A recipe worked out: ', back: 'Back to the pouch', none: 'Nothing here will go in.',
    stored: 'waits at the abode',
  },
};
const say = (t, vars) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const wordsOf = (lang) => FANTONG_WORDS[lang] ?? FANTONG_WORDS.zh;
const artOf = (i, base) => (i.art ? `<img src="${esc(base + i.art)}" alt="" loading="lazy" draggable="false">` : '<i class="noart" aria-hidden="true"></i>');

/* How full the bowl stands: full when the bucket may eat, filling back over the cooldown. */
export function bowlOf(fb, nowMs = Date.now()) {
  if (!fb || fb.ready || !fb.next_at) return 1;
  const total = (fb.limit?.cooldown_min ?? 0) * 60_000;
  if (!total) return 0;
  return Math.max(0, Math.min(1, 1 - (new Date(fb.next_at).getTime() - nowMs) / total));
}

/* What came out: its picture, the name on it, its one line of small print, and the bucket's line. */
function outHtml(r, w, base, lang) {
  if (!r?.out) return '';
  const one = (o) => `<div class="ftthing">${artOf(o, base)}<div><b class="ftname">${esc(o.name)}</b>${zhuanHtml(o.zhuan, lang)}
    ${o.hint ? `<small class="fthint">${esc(o.hint)}</small>` : ''}${o.stored ? `<small class="dim">${esc(w.stored)}</small>` : ''}</div></div>`;
  const found = r.discovered ? `<p class="ftfound">${esc(w.found)}${esc(r.discovered.in)}${r.discovered.lingshi ? ` + ${esc(r.discovered.lingshi)} 灵石` : ''} → ${esc(r.discovered.out)}</p>` : '';
  return `<div class="ftout${r.her ? ' her' : ''}" role="status"><p class="ftsay">${esc(r.say)}</p>${one(r.out)}${r.with ? one(r.with) : ''}${found}</div>`;
}

function tileHtml(i, sel, base) {
  return `<button class="fttile${sel === i.id ? ' sel' : ''}" data-fantong-pick="${esc(i.id)}" aria-pressed="${sel === i.id}" title="${esc(i.name)}">
    ${artOf(i, base)}<span>${esc(i.name)}</span>${i.n > 1 ? `<b class="pn">×${esc(i.n)}</b>` : ''}</button>`;
}

/// The board. `fb` is the rules' brief (rules/fantong.mjs fantongBrief); `ui`
/// the page's own: `sel` (the thing tapped), `lingshi`, `result` (the last
/// feed's answer), `note` (a refusal in the rules' words), `at` (when it spat).
export function fantongHtml(fb, { lang = 'zh', artBase = '', ui = {}, nowMs = Date.now() } = {}) {
  const w = wordsOf(lang);
  const back = `<button class="act quiet pback" data-pouch-pane="">${esc(w.back)}</button>`;
  if (!fb) return `${back}<section class="psec ftong"><div class="loading">…</div></section>`;
  const spat = ui.result?.out && nowMs - (ui.at ?? 0) < 700;
  const bucket = drawBucket({ open: fb.ready, left: bowlOf(fb, nowMs), spit: spat, seal: ui.result?.grade !== 'junk', seals: 0 });
  const status = ui.note || (fb.ready ? w.open : fb.wait);
  const sel = fb.inputs.find((i) => i.id === ui.sel) ?? null;
  const ls = fb.lingshi && fb.lingshi.max > 0 && fb.lingshi.have > 0
    ? `<div class="ftstones"><span>${esc(w.lingshi)}</span>${Array.from({ length: Math.min(fb.lingshi.max, fb.lingshi.have) + 1 }, (_, k) =>
      `<button class="ftstone${(ui.lingshi ?? 0) === k ? ' on' : ''}" data-fantong-lingshi="${k}" aria-pressed="${(ui.lingshi ?? 0) === k}">${k}</button>`).join('')}</div>` : '';
  const around = fb.inputs.filter((i) => i.around), bag = fb.inputs.filter((i) => !i.around);
  const tiles = fb.inputs.length ? `<div class="ftinputs">${around.length ? `<span class="ftgroup small dim">${esc(w.around)}</span>${around.map((i) => tileHtml(i, ui.sel, artBase)).join('')}` : ''}
    ${bag.map((i) => tileHtml(i, ui.sel, artBase)).join('')}</div>` : `<p class="small dim">${esc(w.none)}</p>`;
  const feed = `<button class="act" data-fantong-feed${sel && fb.ready ? '' : ' disabled'}>${esc(say(w.feed, { name: sel?.name ?? '' }))}</button>`;
  const recipes = fb.recipes?.length ? `<div class="ftrecipes small"><b>${esc(w.recipes)}</b>${fb.recipes.map((r) => `<span>${esc(r.in)}${r.lingshi ? ` + ${esc(r.lingshi)} 灵石` : ''} → ${esc(r.out)}</span>`).join('')}</div>` : '';
  return `${back}<section class="psec ftong${fb.ready ? ' ready' : ' full'}" aria-label="${esc(w.title)}"><h3>${esc(w.title)}</h3>
    <div class="ftbucket${spat ? ' shake' : ''}" data-fantong-mouth aria-label="${esc(fb.name ?? w.chip)}">${bucket}</div>
    <p class="ftstatus${ui.note ? ' refused' : ''}">${esc(status)}</p>${outHtml(ui.result, w, artBase, lang)}
    <p class="small dim">${esc(w.pick)}</p>${tiles}<div class="ftacts">${ls}${feed}</div>${recipes}</section>`;
}

/// The drag: a tile picked up (mouse, pen or touch) follows the pointer as a
/// ghost and, let go over the bucket's mouth, is fed — the same as tap + 喂.
/// A press that never moves is a tap. Listen once, for the life of the page.
export function wireFantongDrag({ onDrop, active }) {
  let g = null;
  const end = () => { g?.ghost?.remove(); document.querySelector('[data-fantong-mouth].dropover')?.classList.remove('dropover'); g = null; };
  document.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !active()) return;
    const el = e.target.closest?.('[data-fantong-pick]');
    if (el) g = { el, id: el.dataset.fantongPick, x: e.clientX, y: e.clientY, moved: false };
  });
  document.addEventListener('pointermove', (e) => {
    if (!g) return;
    if (!g.moved) {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 8) return;
      g.moved = true;
      g.ghost = g.el.cloneNode(true);
      g.ghost.className = 'fttile ftghost';
      document.body.appendChild(g.ghost);
    }
    e.preventDefault();
    g.ghost.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 28}px)`;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-fantong-mouth]');
    document.querySelector('[data-fantong-mouth]')?.classList.toggle('dropover', Boolean(over));
  });
  const up = (e) => {
    if (!g) return;
    const { moved, id } = g;
    const over = moved && document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-fantong-mouth]');
    if (moved) { // the click that follows a drag is not a tap
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 0);
    }
    end();
    if (over) onDrop(id);
  };
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', end);
}
