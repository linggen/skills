// gongke.js — 人间功课, the board at the 洞府 (Hanli, 2026-10-22): today's real-life chores as the
// book's cultivation. Pure drawing: Look's `gongke` (rules/gongke.mjs gongkeBoard) read in, HTML out,
// every word esc()'d. The board shows facts only — what each chore means in the book, the app's own
// title, a stamp with the app's own time when done, 已领 when paid, what it adds and leaves — and
// labels; any sentence about it is 银月's, told on the hand-in (lingjing.js doTap). One tap per row
// (交差, or the app's page): no menu.
import { esc } from './esc.js';

export const GONGKE_WORDS = {
  zh: {
    chip: '人间功课', title: '人间功课 · 洞府', none: '今日无功课', done: '已做 {t}', paid: '已领 {t}', undone: '未做',
    turn: '交差', open: '去做 ↗', adds: '酬', leaves: '得', wealth: '灵石 +{n}', progress: '修为 +{n}',
    day: '今日 灵石 {w}/{cw} · 修为 {p}/{cp} · 物 {i}/{ci}', week: '{name} {d}/{of} 日', weekPaid: '{name} 已领',
    ward: '护山大阵 · {name}', noWard: '护山大阵 · 未立', back: '回储物袋',
  },
  en: {
    chip: 'Life chores', title: 'Life chores · the abode', none: 'No chores today', done: 'Done {t}', paid: 'Counted {t}', undone: 'Not yet',
    turn: 'Hand in', open: 'Do it ↗', adds: 'Pays', leaves: 'Leaves', wealth: 'Stones +{n}', progress: 'Cultivation +{n}',
    day: 'Today stones {w}/{cw} · cultivation {p}/{cp} · things {i}/{ci}', week: '{name} {d}/{of} days', weekPaid: '{name} counted',
    ward: 'Mountain ward · {name}', noWard: 'Mountain ward · not raised', back: 'Back to the pouch',
  },
};
const say = (t, vars) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const DEVICE = { mac: '💻', phone: '📱', both: '💻📱' };

/* A time as the board stamps it: the hour and minute, local. */
const hm = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
};

/* What a row adds, as labels. */
function addsHtml(r, gw) {
  if (!r.adds) return '';
  const bits = [r.adds.wealth ? say(gw.wealth, { n: r.adds.wealth }) : '', r.adds.progress ? say(gw.progress, { n: r.adds.progress }) : '', r.adds.item ?? ''].filter(Boolean);
  return bits.length ? `<span class="gkadds">${esc(gw.adds)} ${esc(bits.join(' · '))}</span>` : '';
}

/* One chore: its meaning's name, the app's title, where, the stamp, and its one tap. */
function rowHtml(r, gw) {
  const stamp = r.paid ? `<span class="gkstamp paid">${esc(say(gw.paid, { t: hm(r.paid_at) }))}</span>`
    : r.done ? `<span class="gkstamp done">${esc(say(gw.done, { t: hm(r.done_at) }))}</span>` : `<span class="gkstamp">${esc(gw.undone)}</span>`;
  const act = r.paid ? '' : r.done ? `<button class="act do" data-do="turn" data-id="${esc(r.id)}">${esc(gw.turn)}</button>`
    : r.open ? `<a class="act quiet" href="${esc(r.open)}" target="_blank" rel="noopener">${esc(gw.open)}</a>` : '';
  return `<div class="gkrow${r.paid ? ' paid' : r.done ? ' done' : ''}" data-gongke="${esc(r.id)}">
    <div class="gkhead">${r.name ? `<b class="gkname">${esc(r.name)}</b>` : ''}<span class="gktitle">${esc(r.title)}</span><span class="gkdev">${esc(DEVICE[r.device] ?? '')}</span></div>
    <div class="gkfoot">${stamp}${addsHtml(r, gw)}${act}</div></div>`;
}

/// The board, or '' when Look carries none (before the gate, or a world without the table).
export function gongkeHtml(board, lang) {
  if (!board) return '';
  const gw = GONGKE_WORDS[lang] ?? GONGKE_WORDS.zh, c = board.day?.cap ?? {};
  const rows = board.rows?.length ? board.rows.map((r) => rowHtml(r, gw)).join('') : `<p class="small dim">${esc(gw.none)}</p>`;
  const day = `<p class="small dim gkday">${esc(say(gw.day, { w: board.day.wealth, cw: c.wealth ?? '—', p: board.day.progress, cp: c.progress ?? '—', i: board.day.items, ci: c.items ?? '—' }))}</p>`;
  const weeks = (board.weeks ?? []).map((w) => `<span class="gkweek${w.paid ? ' paid' : ''}">${esc(say(w.paid ? gw.weekPaid : gw.week, { name: w.name, d: w.days, of: w.of }))}</span>`).join('');
  const ward = `<span class="gkward${board.ward ? ' up' : ''}">${esc(board.ward ? say(gw.ward, { name: board.ward.name }) : gw.noWard)}</span>`;
  return `<section class="psec gongke"><h3>${esc(gw.title)}</h3><div class="gkmarks">${ward}${weeks}</div>${rows}${day}</section>`;
}
