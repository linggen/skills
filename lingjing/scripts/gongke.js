// gongke.js — 人间功课 (Hanli, 2026-10-22): today's real-life chores as the book's cultivation, drawn on
// the 事 book's chore rows (cards.js choreRow; Hanli 11-02: the 物品 panel's tab is gone — 「任务里已经有了」).
// Pure drawing: Look's `gongke` (rules/gongke.mjs gongkeBoard) read in, HTML out, every word esc()'d. Facts
// only — what each chore means in the book, a stamp with the app's own time when done, 已领 when paid, what
// it adds — and labels; any sentence about it is 银月's, told on the hand-in (lingjing.js doTap).
import { esc } from './esc.js';

export const GONGKE_WORDS = {
  zh: {
    chip: '人间功课', done: '已做 {t}', paid: '已领 {t}', adds: '酬', wealth: '灵石 +{n}', progress: '修为 +{n}',
    day: '今日 灵石 {w}/{cw} · 修为 {p}/{cp} · 物 {i}/{ci}', week: '{name} {d}/{of} 日', weekPaid: '{name} 已领',
    ward: '护山大阵 · {name}', noWard: '护山大阵 · 未立',
  },
  en: {
    chip: 'Life chores', done: 'Done {t}', paid: 'Counted {t}', adds: 'Pays', wealth: 'Stones +{n}', progress: 'Cultivation +{n}',
    day: 'Today stones {w}/{cw} · cultivation {p}/{cp} · things {i}/{ci}', week: '{name} {d}/{of} days', weekPaid: '{name} counted',
    ward: 'Mountain ward · {name}', noWard: 'Mountain ward · not raised',
  },
};
const say = (t, vars) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/* A time as the board stamps it: the hour and minute, local. */
const hm = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
};

/* What a row pays, as labels: the chore's own (`pays`, its share of the layer in 修为) and its meaning's (`adds`), summed. */
function addsHtml(r, gw) {
  if (!r.adds && !r.pays) return '';
  const xw = (r.pays?.progress ?? 0) + (r.adds?.progress ?? 0), ls = (r.pays?.wealth ?? 0) + (r.adds?.wealth ?? 0);
  const bits = [xw ? say(gw.progress, { n: xw }) : '', ls ? say(gw.wealth, { n: ls }) : '', r.adds?.item ?? ''].filter(Boolean);
  return bits.length ? `<span class="gkadds">${esc(gw.adds)} ${esc(bits.join(' · '))}</span>` : '';
}

/// A chore's 人间功课 bits on its 事 row (Hanli 11-02: 「人间功课也在物品UI里显示, 应该在任务里吧」 — the 事
/// book is their one place): what it means in the book, the seal (已做 hh:mm, the app's time · 已领 hh:mm), and
/// what it pays with its meaning's share and thing — one line of labels. Look's `gongke` row; '' parts when none.
export function gongkeBits(r, lang) {
  if (!r) return { name: '', stamp: '', adds: '' };
  const gw = GONGKE_WORDS[lang] ?? GONGKE_WORDS.zh;
  const stamp = r.paid ? `<span class="gkstamp paid">${esc(say(gw.paid, { t: hm(r.paid_at) }))}</span>`
    : r.done ? `<span class="gkstamp done">${esc(say(gw.done, { t: hm(r.done_at) }))}</span>` : '';
  return { name: r.name ?? '', stamp, adds: addsHtml(r, gw) };
}

/// The day's marks over the 事 book's chores: the 护山大阵, each week's row, the day against its cap. '' with no board.
export function gongkeMarksHtml(board, lang) {
  if (!board) return '';
  const gw = GONGKE_WORDS[lang] ?? GONGKE_WORDS.zh, c = board.day?.cap ?? {};
  const weeks = (board.weeks ?? []).map((w) => `<span class="gkweek${w.paid ? ' paid' : ''}">${esc(say(w.paid ? gw.weekPaid : gw.week, { name: w.name, d: w.days, of: w.of }))}</span>`).join('');
  const ward = `<span class="gkward${board.ward ? ' up' : ''}">${esc(board.ward ? say(gw.ward, { name: board.ward.name }) : gw.noWard)}</span>`;
  const day = board.day ? `<span class="small dim gkday">${esc(say(gw.day, { w: board.day.wealth, cw: c.wealth ?? '—', p: board.day.progress, cp: c.progress ?? '—', i: board.day.items, ci: c.items ?? '—' }))}</span>` : '';
  return `<div class="gkmarks"><span class="lbl small">${esc(gw.chip)}</span>${ward}${weeks}${day}</div>`;
}
