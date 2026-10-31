// panglu.js — 旁炉, the 丹房's side furnace as a pane of the 储物袋 (rules/panglu.mjs; design.md § 丹药). Pure drawing:
// Look's `panglu` brief and the last batch in, HTML out, every word esc()'d. A herb's button fires one batch — the page's
// own verb (`panglu --action=fire`), no model turn. The odds are never shown: the batch is the rules', the words the world's.
import { esc } from './esc.js';

export const PANGLU_WORDS = {
  zh: { chip: '旁炉', left: '今天还能炼 {n} 炉', fire: '炼一炉', zha: '炸炉' },
  en: { chip: 'Side furnace', left: '{n} more batch(es) today', fire: 'Fire a batch', zha: 'Blown' },
};
const say = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/* The pane: the furnace's line, the count, today's batches left, a button per herb held, the last batch's words. */
export function pangluHtml(b, last, lang = 'zh', artBase = '') {
  const w = PANGLU_WORDS[lang] ?? PANGLU_WORDS.zh;
  if (!b) return '<section class="psec panglu"><div class="loading">…</div></section>';
  const art = (h) => (h.art ? `<img src="${esc(artBase + h.art)}" alt="" loading="lazy">` : '');
  const herbs = (b.herbs ?? []).map((h) => `<button class="act plherb" data-panglu-fire="${esc(h.id)}"${b.ready ? '' : ' disabled'}>${art(h)}<span>${esc(b.fire ?? w.fire)} · ${esc(h.name)}</span><b class="pn">×${esc(h.n)}</b></button>`).join('');
  const done = last ? `<div class="plout ${esc(last.outcome ?? '')}" role="status">${last.outcome === 'zha' ? `<b>${esc(w.zha)}</b> ` : ''}${esc(last.say ?? '')}</div>` : '';
  return `<section class="psec panglu"><h3>${esc(b.name ?? w.chip)}</h3>
    <p class="small dim">${esc(b.line ?? '')}</p>
    <p class="small">${b.fired_say ? `${esc(b.fired_say)} ` : ''}${b.ready && b.left != null ? esc(say(w.left, { n: b.left })) : b.wait ? esc(b.wait) : ''}</p>
    ${done}
    ${herbs ? `<div class="acts plherbs">${herbs}</div>` : `<p class="small dim">${esc(b.empty ?? '')}</p>`}</section>`;
}
