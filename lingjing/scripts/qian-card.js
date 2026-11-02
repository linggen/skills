// qian-card.js — 问签's card (rules/fortune.mjs, 问签 v1, Hanli 2026-11-02): the 签筒 to shake, the 签 that drops with
// its 签诗 revealed line by line in ink, the day's 黄历 under it, the 生辰 asked once, what he asks about, 连签's 签筒 and
// the 签谱. Facts only, from Look (`qian` before and after the draw, `divination` once drawn): every sentence a person
// reads about what the 签 means is 银月's (lingjing.js readingByHer, guide/qian.md) — asleep or away, the card stands
// alone with the 签诗 and the rules' 宜忌, and no reading.
import { esc } from './esc.js';
import { dayKey } from './state.mjs';

export const QIAN_WORDS = {
  zh: {
    title: '问签 · 今日', drawn: '今日之签', notYet: '还没摇 · 点签筒摇一摇', notYetPhone: '还没摇 · 摇一摇手机，或点签筒', chip: '今日签 · 未摇', shake: '摇 签', shaking: '签筒摇着……', hint: '一日一签。心里想着一件事，摇一摇。', hintPhone: '一日一签。心里想着一件事，摇一摇手机，或点一下。',
    ask: '想问什么（可不选）', askText: '或写一句（可不写）', no: '第{n}签', of: '共{of}签',
    speed: '今日修为 ×{x}', yi: '宜{name}（{games}）修为 ×{x}', even: '今日修为照常',
    almanac: '{y}年 {m}月 {d}日 · {officer}日 · 冲{chong} · 煞{sha}', yiLabel: '宜', jiLabel: '忌', none: '无大事',
    signs: '属{zodiac}', sign: '{sign}', clash: '今日冲{zodiac}', asked: '问：{what}',
    streak: '连签 {n} 日', streakNext: '再 {n} 日换{name}', tube: { plain: '竹签筒', jade: '青玉签筒', cinnabar: '朱漆签筒', gold: '鎏金签筒' },
    book: '签谱 · {kinds}/{of}', bookClose: '合上', bookTimes: '×{n}', bookNever: '未得',
    birthTitle: '生辰（只问一次）', birthHint: '可选填。生辰只在本机推算生肖（以立春换年）与星座：日期不入存档；生肖、星座记在存档里，只给银月解签用。',
    birthSign: '再填一次生辰，补上星座（可不填）', birthSet: '定', birthSkip: '不必了', birthBad: '这一天不在历中，再看看。',
    reading: '银月在看这支签……', source: '出处', yingyan: '已应验：{said}',
  },
  en: {
    title: "Today's fortune stick", drawn: "Today's stick", notYet: 'Not drawn yet · tap the tube to shake', notYetPhone: 'Not drawn yet · shake the phone, or tap the tube', chip: "Today's stick · not drawn", shake: 'Shake', shaking: 'Shaking…', hint: 'One stick a day. Hold one thing in mind and shake.', hintPhone: 'One stick a day. Hold one thing in mind — shake the phone, or tap.',
    ask: 'What is it about (optional)', askText: 'or a line of your own (optional)', no: 'Stick {n}', of: 'of {of}',
    speed: 'Cultivation today ×{x}', yi: 'Good for {name} ({games}): cultivation ×{x}', even: 'Cultivation as usual today',
    almanac: '{y} year · {m} month · {d} day · {officer} · clashes {chong} · 煞 {sha}', yiLabel: 'Good for', jiLabel: 'Avoid', none: 'nothing much',
    signs: 'Year of the {zodiac}', sign: '{sign}', clash: 'today clashes with the {zodiac}', asked: 'Asked about: {what}',
    streak: '{n} days in a row', streakNext: '{n} more for {name}', tube: { plain: 'a bamboo tube', jade: 'a jade tube', cinnabar: 'a cinnabar tube', gold: 'a gilt tube' },
    book: 'Sticks drawn · {kinds}/{of}', bookClose: 'Close', bookTimes: '×{n}', bookNever: 'not yet',
    birthTitle: 'Birthday (asked once)', birthHint: 'Optional. Read on this machine for your zodiac animal (the year turns at 立春) and star sign: the date is never saved; the animal and sign are kept in the save, only for Yinyue\'s reading.',
    birthSign: 'Your birthday once more, for your star sign (optional)', birthSet: 'Set', birthSkip: 'Not now', birthBad: 'That day is not in the calendar — look again.',
    reading: 'Yinyue is looking at the stick…', source: 'source', yingyan: 'Came true: {said}',
  },
};

const say = (tpl, fill) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? '');
const wordsOf = (ctx) => QIAN_WORDS[ctx.lang === 'en' ? 'en' : 'zh'];
const isPhone = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);

/* The day's 黄历 line and its 宜 · 忌 chips (rules/almanac.mjs). */
export function almanacHtml(al, w) {
  if (!al) return '';
  const chips = (list) => (list.length ? list.map((x) => `<span class="qchip">${esc(x.name)}</span>`).join('') : `<span class="dim">${esc(w.none)}</span>`);
  return `<div class="qalmanac"><div class="small">${esc(say(w.almanac, { y: al.ganzhi.year, m: al.ganzhi.month, d: al.ganzhi.day, officer: al.officer.name, chong: al.chong.name ?? al.chong.branch, sha: al.sha.name }))}</div>
    <div class="qyiji"><b class="yi">${esc(w.yiLabel)}</b>${chips(al.yi)}</div><div class="qyiji"><b class="ji">${esc(w.jiLabel)}</b>${chips(al.ji)}</div></div>`;
}

/* The 签筒: its look by 连签, and the sticks; the whole tube is the button. */
function tubeHtml(q, w, ctx) {
  const shaking = ctx.qianShaking ? ' shaking' : '';
  const sticks = Array.from({ length: 9 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  return `<button class="qiantong tube-${esc(q.tube)}${shaking}" data-qian-shake aria-label="${esc(w.shake)}"${ctx.qianShaking ? ' disabled' : ''}>
    <span class="sticks">${sticks}</span><span class="tube"></span><span class="lbl">${esc(ctx.qianShaking ? w.shaking : w.shake)}</span></button>`;
}
function streakHtml(q, w) {
  const next = q.next ? ` · ${say(w.streakNext, { n: q.next - q.streak, name: w.tube[{ 3: 'jade', 7: 'cinnabar', 30: 'gold' }[q.next]] ?? '' })}` : '';
  return `<div class="small dim qstreak">${q.streak ? esc(say(w.streak, { n: q.streak })) : esc(w.tube[q.tube] ?? w.tube.plain)}${esc(next)}</div>`;
}

/* 生辰, asked once, on the first 问签 (`qian.birth`: 'ask' — never given; 'sign' — given before 星座 were read). */
function birthHtml(q, ctx, w) {
  if (!q.birth || (q.birth === 'ask' && ctx.look?.fate)) return '';
  const today = dayKey(ctx.now ?? new Date());
  return `<div class="fate form qbirth"><div class="small">${esc(q.birth === 'sign' ? w.birthSign : w.birthTitle)}</div>${q.birth === 'ask' ? `<div class="small dim">${esc(w.birthHint)}</div>` : ''}
    <div class="fateform"><input type="date" id="fate-birth" min="1900-01-31" max="${today}" value="${esc(ctx.fateDraft ?? '')}">
    <button class="act" data-fate="birth">${esc(w.birthSet)}</button>${q.birth === 'ask' ? `<button class="act" data-fate="decline">${esc(w.birthSkip)}</button>` : ''}</div>
    ${ctx.fateError ? `<div class="small seal">${esc(w.birthBad)}</div>` : ''}</div>`;
}

/* What he may ask about: one tap picks (again: none), or a line of his own. */
function askHtml(q, ctx, w) {
  const chips = q.asks.map((a) => `<button class="qchip ask${ctx.qianAsk === a.id ? ' on' : ''}" data-qian-ask="${esc(a.id)}">${esc(a.name)}</button>`).join('');
  return `<div class="qask"><div class="small dim">${esc(w.ask)}</div><div class="qasks">${chips}</div>
    <input type="text" id="qian-ask-text" maxlength="20" autocomplete="off" placeholder="${esc(w.askText)}" value="${esc(ctx.qianAskText ?? '')}"></div>`;
}

/* The 签谱: all of the set, each drawn one with its count. */
function bookHtml(ctx, w) {
  const rows = ctx.qianBook ?? [];
  const cells = rows.map((r) => (r.count
    ? `<div class="qcell got ${esc(r.tone)}" title="${esc(`${r.title ?? ''} ${r.first ?? ''}`)}"><b>${esc(r.n)}</b><span>${esc(r.grade)}</span><em>${esc(say(w.bookTimes, { n: r.count }))}</em></div>`
    : `<div class="qcell" title="${esc(w.bookNever)}"><b>${esc(r.n)}</b></div>`)).join('');
  return `<div class="qbook"><div class="qgrid">${cells}</div><div class="acts"><button class="act" data-qian-book="close">${esc(w.bookClose)}</button></div></div>`;
}
const bookChip = (q, w) => `<button class="chip qbookchip" data-qian-book="open">${esc(say(w.book, { kinds: q.book.kinds, of: q.book.of }))}</button>`;

/* The drawn 签: number, grade, title; the 签诗 a line at a time (inked in order when it is new); what it does today. */
function drawnHtml(d, q, ctx, w) {
  const fresh = ctx.castFresh;
  const poem = d.poem.map((l, i) => `<div class="qline${fresh ? ' ink' : ''}" style="--d:${(0.6 + i * 0.9).toFixed(1)}s">${esc(l)}</div>`).join('');
  const does = [d.speed > 1 ? say(w.speed, { x: d.speed }) : w.even, d.yi ? say(w.yi, { name: d.yi.name, games: d.yi.games, x: d.yi.pay }) : ''].filter(Boolean);
  const signs = d.signs ? [say(w.signs, { zodiac: d.signs.zodiac.name }), d.signs.sign ? d.signs.sign.name : '', d.clash ? say(w.clash, { zodiac: d.signs.zodiac.name }) : ''].filter(Boolean).join(' · ') : '';
  const asked = d.ask || d.ask_text ? `<div class="small dim">${esc(say(w.asked, { what: [d.ask?.name, d.ask_text].filter(Boolean).join(' · ') }))}</div>` : '';
  const her = fresh && ctx.herHere ? `<div class="small ling">${esc(w.reading)}</div>` : '';
  const came = d.yingyan?.said ? `<div class="small dim">${esc(say(w.yingyan, { said: d.yingyan.said }))}</div>` : '';
  return `<div class="card qian drawn tone-${esc(d.grade.tone)}${fresh ? ' fresh' : ''}">
    <div class="qhead"><span class="qstick">${esc(say(w.no, { n: d.n }))}</span><span class="grade">${esc(d.grade.name)}</span>${d.title ? `<span class="qtitle">${esc(d.title)}</span>` : ''}</div>
    <div class="qpoem">${poem}</div>${d.gloss ? `<div class="small dim qgloss">${esc(d.gloss)}</div>` : ''}
    <div class="small castfx">${esc(does.join(' · '))}</div>${signs ? `<div class="small">${esc(signs)}</div>` : ''}${asked}
    ${almanacHtml(d.almanac, w)}${her}${came}
    <div class="qfoot">${q ? bookChip(q, w) : ''}${d.source ? `<a class="small dim" href="${esc(d.source)}" target="_blank" rel="noopener">${esc(w.source)}</a>` : ''}</div>
    ${ctx.qianBookOpen ? bookHtml(ctx, w) : ''}</div>`;
}

/* The card: the 签筒 before the draw, the 签 after. Null-safe: no 问签 in this world, nothing. */
export function qianCardHtml(ctx) {
  const look = ctx.look ?? {}, q = look.qian, d = look.divination, w = wordsOf(ctx);
  if (d?.poem) return drawnHtml(d, q, ctx, w);
  if (!q) return '';
  // Plainly not drawn yet (Hanli 11-02: 「这个是已经算完了吗? 不太明显」), and what went wrong on the card itself.
  const state = `<div class="qstate">${esc(isPhone() ? w.notYetPhone : w.notYet)}</div>${ctx.qianNote ? `<div class="small seal qnote" role="status">${esc(ctx.qianNote)}</div>` : ''}`;
  return `<div class="card qian uncast tube-${esc(q.tube)}"><div class="cardtitle">${esc(w.title)}</div>${state}
    <div class="qbody">${tubeHtml(q, w, ctx)}<div class="qside">
      <div class="hextext">${esc(isPhone() ? w.hintPhone : w.hint)}</div>${streakHtml(q, w)}
      ${birthHtml(q, ctx, w)}${askHtml(q, ctx, w)}</div></div>
    ${almanacHtml(q.almanac, w)}
    <div class="qfoot">${q.book.draws ? bookChip(q, w) : ''}</div>${ctx.qianBookOpen ? bookHtml(ctx, w) : ''}</div>`;
}

/* The top bar's chip: 「今日 上上签 · 修为 ×1.2 · 宜斗法」 once drawn; before, 「今日签 · 未摇」 (not 「求签」, which read
   as either) to open the card. */
export function qianChipHtml(look, lang) {
  const d = look?.divination, zh = lang !== 'en';
  if (d?.poem) {
    const text = zh ? `今日 ${d.grade.name} · 修为 ×${d.speed}${d.yi ? ` · 宜${d.yi.name}` : ''}` : `${d.grade.name} · ×${d.speed}${d.yi ? ` · good for ${d.yi.name}` : ''}`;
    return `<button class="omenchip qianchip ${esc(d.grade.tone)}" data-qian-chip>${esc(text)}</button>`;
  }
  return look?.qian ? `<button class="omenchip qianchip uncast" data-qian-chip>${esc(QIAN_WORDS[zh ? 'zh' : 'en'].chip)}</button>` : '';
}
