// kanjia.js — 砍价, the shop's own haggle panel (Hanli 2026-10-28: 「砍价本身是个好创意…可以放一个砍价按钮到商店的UI里」 ·
// 「直接放一个砍价按钮到商店UI里更简单点」 · 「能否改成[货郎]: 客官您好 这么说话, 省掉[ling]的工具调用?」).
// The 砍价 by a shelf item's 买 opens it: the keeper's face and name, his lines as bubbles (npc-talk.js — the one
// talk panel), and under them the board's widgets: the price, his patience (beads), the arguments he holds (each with
// what it takes off; used ones grey), one counter-offer on a slider, 成交 and 不买了. Every tap is the rules'
// (`haggle`, rules/aigames.mjs) — they set every number; the keeper's words come from a hidden call in his voice,
// in a side session (npc-ask.js), shown only here. Nothing of it reaches the story's chat.
//
//   widgetsHtml(open, lang, { busy, low }) → the strip (pure; tests/npc-talk.test.mjs)
//   openKanjia({ doc, id, lang, verb, ask, onClose, sound }) → Promise (resolves when the panel closes)
//     verb(name, args) → the rules' answer;  ask(line, system) → the keeper's reply text (throws: no one answers)

import { mountTalk } from './npc-talk.js';
import { npcReply } from './npc-line.js';

export const KANJIA_WORDS = {
  zh: { title: '砍价', list: '标价 {n}', ask: '现价 {n}', two: '两件 · 共 {n}', patience: '耐性', offer: '还价', offerGo: '还 {n}', deal: '成交 · {n} 灵石',
    walk: '不买了', low: '再低要翻脸了', firm: '到底了', countered: '已还过价', short: '差 {n}', none: '没什么可说的了', meDeal: '成交。', meWalk: '不买了。',
    meOffer: '{n} 灵石，卖不卖？', stones: '灵石 {n}', close: '关闭', done: '今天只照价' },
  en: { title: 'Haggle', list: 'Marked {n}', ask: 'Now {n}', two: 'Two · {n} in all', patience: 'Patience', offer: 'Offer', offerGo: 'Offer {n}', deal: 'Deal · {n} stones',
    walk: 'Walk away', low: 'Any lower and he is done', firm: 'As low as it goes', countered: 'Offered already', short: '{n} short', none: 'Nothing more to say', meDeal: 'Deal.', meWalk: 'I\'ll pass.',
    meOffer: '{n} stones — yes?', stones: 'Stones {n}', close: 'Close', done: 'List price today' },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const say = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const wordsOf = (lang) => KANJIA_WORDS[lang === 'en' ? 'en' : 'zh'];

/** The counter-offer's starting point: halfway down the slider's range. */
export const offerStart = (o) => (o?.offer ? Math.round((o.offer.min + o.offer.max) / 2) : null);

/** The strip under the talk, from the rules' open haggle (Look's `haggle.open`). `offer` the slider's value now. */
export function widgetsHtml(o, lang = 'zh', { busy = false, low = false, offer = null } = {}) {
  const w = wordsOf(lang);
  if (!o) return '';
  const off = busy ? ' disabled' : '';
  const price = o.qty > 1 ? say(w.two, { n: o.total }) : say(w.ask, { n: o.ask });
  const beads = Array.from({ length: o.max_mood }, (_, i) => `<b class="${i < o.mood ? 'is-on' : ''}"></b>`).join('');
  const head = `<div class="kj-price"><s>${esc(say(w.list, { n: o.list }))}</s><strong data-kj-ask>${esc(price)}</strong>${o.firm ? `<em>${esc(w.firm)}</em>` : ''}`
    + `<span class="kj-beads" title="${esc(w.patience)}" aria-label="${esc(w.patience)} ${o.mood}/${o.max_mood}">${beads}</span></div>`;
  const args = o.args.length
    ? `<div class="g-jc-gacts kj-args">${o.args.map((a) => `<button type="button" class="g-jc-gbtn kj-arg" data-kj-arg="${esc(a.id)}"${a.used || busy ? ' disabled' : ''}>${esc(a.say)}${a.used ? '' : ` <small>−${a.off}</small>`}</button>`).join('')}</div>`
    : '';
  const v = Math.max(o.offer?.min ?? 1, Math.min(o.offer?.max ?? 1, offer ?? offerStart(o) ?? 1));
  const slider = o.offer
    ? `<div class="kj-offer"><input type="range" data-kj-slider min="${o.offer.min}" max="${o.offer.max}" step="1" value="${v}" aria-label="${esc(w.offer)}"${off}>`
      + `<button type="button" class="g-jc-gbtn kj-offer-go" data-kj-offer="${v}"${off}>${esc(say(w.offerGo, { n: v }))}</button></div>${low ? `<p class="g-jc-gnote kj-low">${esc(w.low)}</p>` : ''}`
    : `<p class="g-jc-gnote kj-dim">${esc(w.countered)}</p>`;
  const short = o.total > o.wealth ? say(w.short, { n: o.total - o.wealth }) : '';
  const deal = `<button type="button" class="g-jc-gbtn is-main" data-kj-deal${busy || short ? ' disabled' : ''}>${esc(say(w.deal, { n: o.total }))}${short ? ` · ${esc(short)}` : ''}</button>`;
  return `${head}${args}${slider}<div class="g-jc-gacts">${deal}<button type="button" class="g-jc-gbtn is-skip" data-kj-walk${off}>${esc(w.walk)}</button></div>`;
}

/** The panel, over the shop: opens the haggle on `id`, plays it, and closes on a deal, a walk-off or ✕. */
export function openKanjia({ doc = globalThis.document, id, lang = 'zh', verb, ask, onClose = () => {}, sound = () => {}, art = (a) => a } = {}) {
  const w = wordsOf(lang);
  const veil = doc.createElement('div');
  veil.className = 'kj-veil';
  veil.innerHTML = '<div class="kj-sheet" role="dialog" aria-modal="true"></div>';
  doc.body.append(veil);
  const sheet = veil.querySelector('.kj-sheet');
  styleOnce(doc);
  const g = { open: null, busy: false, low: false, offer: null, over: false, talk: null };
  let done;
  const closed = new Promise((r) => { done = r; });

  const redraw = () => g.talk?.widgets(widgetsHtml(g.open, lang, { busy: g.busy, low: g.low, offer: g.offer }));
  // The keeper's words: his reply in his voice (the hidden line the rules wrote), else his fallback line.
  const speak = async (talk) => {
    if (!talk) return;
    g.talk.typing(true);
    let lines = [];
    try { lines = npcReply(await ask(talk.line, talk.system), talk.who); } catch (e) { console.info('[kanjia] no reply', String(e?.message ?? e)); }
    g.talk.typing(false);
    if (g.over && talk.event !== 'deal' && talk.event !== 'walk' && talk.event !== 'soured') return;
    await g.talk.say(lines.length ? lines : [talk.fallback]);
  };
  const close = (r = {}) => {
    if (g.shut) return;
    g.shut = true;
    g.over = true;
    setTimeout(() => { g.talk?.destroy(); veil.remove(); onClose(r); done(r); }, r.after ?? 0);
  };
  const act = async (args, mine) => {
    if (g.busy || g.over) return null;
    g.busy = true;
    redraw();
    if (mine) g.talk.me(mine);
    const r = await verb('haggle', args).catch((e) => ({ ok: false, error: String(e) }));
    g.busy = false;
    if (!r?.ok) {
      if (r?.say) g.talk.note(r.say);
      if (r?.haggle?.open) g.open = r.haggle.open;
      redraw();
      return r;
    }
    g.open = r.haggle?.open ?? null;
    g.low = Boolean(r.too_low);
    redraw();
    const spoke = speak(r.talk);
    if (r.deal || r.walked || r.soured) {
      g.over = true;
      sound(r.deal ? 'right' : 'skip');
      await spoke;
      close({ forced: true, after: 1400, deal: r.deal ? r : null, walked: Boolean(r.walked || r.soured) });
    }
    return r;
  };

  (async () => {
    const r = await verb('haggle', { action: 'open', id }).catch((e) => ({ ok: false, error: String(e) }));
    const k = r?.haggle?.keeper;
    g.talk = mountTalk(sheet, {
      npc: { id: 'keeper', name: k?.name ?? '', art: k?.art ? art(k.art) : null },
      look: 'face', title: k?.name ?? w.title, when: r?.haggle?.open?.item?.name ?? '', lang,
      tools: [{ kind: 'close', label: w.close }], sound,
    });
    g.talk.onTool((kind) => { if (kind === 'close') (g.open && !g.over ? act({ action: 'walk' }, w.meWalk) : Promise.resolve()).then(() => close({ forced: true })); });
    g.talk.onSlot('[data-kj-arg]', (el) => { const a = g.open?.args.find((x) => x.id === el.dataset.kjArg); act({ action: 'argue', reason: el.dataset.kjArg }, a?.say); });
    g.talk.onSlot('[data-kj-slider]', (el) => {
      g.offer = Number(el.value);
      const b = g.talk.slot.querySelector('[data-kj-offer]');
      if (b) { b.dataset.kjOffer = el.value; b.textContent = say(w.offerGo, { n: el.value }); }
    }, 'input');
    g.talk.onSlot('[data-kj-offer]', (el) => act({ action: 'offer', price: Number(el.dataset.kjOffer) }, say(w.meOffer, { n: el.dataset.kjOffer })));
    g.talk.onSlot('[data-kj-deal]', () => act({ action: 'deal' }, w.meDeal));
    g.talk.onSlot('[data-kj-walk]', () => act({ action: 'walk' }, w.meWalk));
    veil.addEventListener('click', (e) => { if (e.target === veil) g.talk.root.querySelector('[data-talk-tool="close"]')?.click(); });
    if (!r?.ok) {
      g.talk.note(r?.say ?? w.done);
      setTimeout(() => close({ forced: true }), 1600);
      return;
    }
    g.open = r.haggle.open;
    redraw();
    await speak(r.talk);
  })();
  return closed;
}

function styleOnce(doc) {
  if (doc.getElementById('kj-style')) return;
  const el = doc.createElement('style');
  el.id = 'kj-style';
  el.textContent = STYLE;
  doc.head.append(el);
}

const STYLE = `
.kj-veil { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 16px; background: rgba(20, 16, 10, .42); }
.kj-sheet { width: min(460px, 100%); }
.kj-sheet .g-jc { height: min(560px, 82dvh); }
.kj-price { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; justify-content: center; }
.kj-price s { color: var(--jc-dim); font-size: 13px; }
.kj-price strong { font-size: 20px; color: #9a3b2a; }
.kj-price em { font-style: normal; font-size: 12px; color: var(--jc-dim); }
.kj-beads { display: inline-flex; gap: 5px; margin-left: 6px; }
.kj-beads b { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid #9a3b2a; background: #fbf6ea; transition: background .3s; }
.kj-beads b.is-on { background: radial-gradient(circle at 35% 35%, #f07a5c, #b3241a); }
.kj-arg small { font-weight: 500; color: #6f7f3a; }
.kj-arg:disabled small { display: none; }
.kj-offer { display: flex; align-items: center; gap: 8px; }
.kj-offer input[type=range] { flex: 1; min-width: 0; accent-color: #9a3b2a; }
.kj-low { color: #9a3b2a; font-weight: 700; }
.kj-dim { color: var(--jc-dim); }
`;
