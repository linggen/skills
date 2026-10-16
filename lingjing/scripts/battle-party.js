// battle-party.js — 小队 on the board (cards.md § 5, Hanli 2026-10-16): the members who stand
// beside him in the player's row (阿禾, 孙二狗 …), each with their own 气血, a 嘲讽 mark while they
// guard, and gone to ink when they 退; and the two small marks a card in the shared hand wears —
// its owner's seal (a member's card is played by that member) and 新 until it is first played.
// Pure strings for the page (battle-card.js); the fight itself is battle.js.
import { esc } from './esc.js';

const first = s => [...String(s ?? '')][0] ?? '';
const nameOf = (n, lang) => (typeof n === 'string' ? n : n?.[lang] ?? n?.zh ?? '');
const WORDS = {
  zh: { guard: '嘲讽', gone: '退', party: '同行' },
  en: { guard: 'Guards', gone: 'Out', party: 'Beside you' },
};

/// The members beside the lead, as plates in his row: `st` is the fight's view, `ctx.party` the
/// setup's members (names, art), `ctx.artBase` where pictures live.
export function partyHtml(st, ctx) {
  const allies = st.you.allies ?? [];
  if (!allies.length) return '';
  const w = WORDS[ctx.lang] ?? WORDS.zh, byId = Object.fromEntries((ctx.party ?? []).map(m => [m.id, m]));
  const plate = a => {
    const m = byId[a.id] ?? {}, name = nameOf(m.name ?? a.name, ctx.lang) || a.id;
    const pct = Math.max(0, Math.round((a.hp / Math.max(1, a.hpMax)) * 100));
    return `<div class="bally${a.gone ? ' gone' : ''}${a.taunt && !a.gone ? ' guard' : ''}" data-ally="${esc(a.id)}" title="${esc(name)}">
      <span class="ballyface">${m.art ? `<img src="${esc(ctx.artBase ?? '')}${esc(m.art)}" alt="">` : `<b>${esc(first(name))}</b>`}</span>
      <span class="ballyname">${esc(name)}${a.taunt && !a.gone ? `<i class="ballyguard">${esc(w.guard)}</i>` : ''}${a.gone ? `<i class="ballygone">${esc(w.gone)}</i>` : ''}</span>
      <span class="ballyhp" data-now="${a.hp}" data-max="${a.hpMax}"><i style="width:${pct}%"></i><b>${a.hp}<small>/${a.hpMax}</small></b></span>
    </div>`;
  };
  return `<div class="bparty" aria-label="${esc(w.party)}">${allies.map(plate).join('')}</div>`;
}

/// A card's owner seal in the shared hand — only when that owner stands in this row.
export function sealHtml(c, st, ctx) {
  if (!c?.owner) return '';
  const a = (st.you.allies ?? []).find(x => x.id === c.owner);
  if (!a) return '';
  const m = (ctx.party ?? []).find(x => x.id === c.owner);
  return `<i class="bseal-owner" aria-label="${esc(nameOf(m?.name, ctx.lang))}">${esc(first(nameOf(m?.name, ctx.lang)))}</i>`;
}

/// 新 on a card gained and not yet played (the setup's `fresh`).
export const freshHtml = (id, ctx) => (ctx.fresh?.includes(id) ? `<i class="bfresh">${ctx.lang === 'en' ? 'New' : '新'}</i>` : '');
