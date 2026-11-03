// spent-card.js — the card when a turn the page ran (Ling's story, 银月's 出题, a hidden report) was refused because
// the account's free tokens or month's pool are spent (the engine's `allowance_spent` fact). Two ways on, as the chat's
// own card: 订阅 on linggen.dev, or 用自己的模型 (Settings → Models; once one is added the chat sends the refused turn
// again). Fixed words (cards.js WORDS spent*), zh and en — the one place Ling's and 银月's words are not a model's:
// with the allowance spent no model can speak (Hanli 2026-11-03: 「试用期到期后, 要有消息提示用户订阅或者添加自己的模型」).

import { esc } from './esc.js';

export const SUBSCRIBE_URL = 'https://linggen.dev/app/billing';

/** The card's HTML. `reason`: 'trial' | 'monthly'. */
export function spentCardHtml(w, reason) {
  const head = reason === 'monthly' ? w.spentMonthly : w.spentTrial;
  return `<div class="spentcard" role="dialog" aria-live="polite">`
    + `<div class="spentcard-head">${esc(head)}</div>`
    + `<div class="spentcard-how">${esc(w.spentHow)}</div>`
    + `<div class="spentcard-acts">`
    + `<a class="spentcard-btn spentcard-sub" href="${SUBSCRIBE_URL}" target="_blank" rel="noopener noreferrer" data-spent-sub>${esc(w.spentSubscribe)}</a>`
    + `<button type="button" class="spentcard-btn" data-spent-own>${esc(w.spentOwn)}</button>`
    + `<button type="button" class="spentcard-btn spentcard-later" data-spent-close>${esc(w.spentClose)}</button>`
    + `</div></div>`;
}

const CSS = `.spentcard-veil{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;background:rgba(20,16,12,.35)}
.spentcard{max-width:min(360px,calc(100vw - 32px));padding:18px 20px;border-radius:12px;background:#F1ECE1;color:#2B2620;box-shadow:0 12px 36px rgba(0,0,0,.3);font-size:14px;line-height:1.6}
.spentcard-head{font-size:16px;font-weight:600;margin-bottom:4px}
.spentcard-how{color:#5a5047;margin-bottom:14px}
.spentcard-acts{display:flex;flex-wrap:wrap;gap:8px}
.spentcard-btn{font:inherit;font-size:13px;padding:6px 14px;border-radius:8px;border:1px solid #A8352B;background:none;color:#A8352B;cursor:pointer;text-decoration:none}
.spentcard-sub{background:#A8352B;color:#F1ECE1}
.spentcard-later{border-color:transparent;color:#8a7a66}`;

/** Show the card (one at a time). `onOwn`: the chat's own-model way on. */
export function openSpentCard(doc, { words, reason, onOwn }) {
  if (doc.querySelector('.spentcard-veil')) return;
  if (!doc.getElementById('spentcard-css')) {
    const style = doc.createElement('style');
    style.id = 'spentcard-css';
    style.textContent = CSS;
    doc.head.appendChild(style);
  }
  const veil = doc.createElement('div');
  veil.className = 'spentcard-veil';
  veil.innerHTML = spentCardHtml(words, reason);
  const close = () => veil.remove();
  veil.addEventListener('click', (e) => {
    const t = e.target;
    if (t === veil || t.closest?.('[data-spent-close]') || t.closest?.('[data-spent-sub]')) close();
    if (t.closest?.('[data-spent-own]')) { close(); onOwn?.(); }
  });
  doc.body.appendChild(veil);
}
