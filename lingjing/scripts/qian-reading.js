// qian-reading.js — 问签 v2's drawn card (qian-card.js hands it the reading): one shake, one full reading — the 签诗
// inked in, its 白话签解 (the game's own words, marked so), 五项运势, today's 宜忌 (no 宜 row on a day without), the
// game's effect (his card only), 银月's one line; then 替人求签 (a friend's card, the same layout, nothing paid) and
// 分享 · 拷贝图片 · 保存图片 (qian-share.js). Facts only, from the rules; her line is hers.
// No source link on the card (Hanli 11-02: the 出处 link opened the temple's page mid-game and read as a bug): the
// 签谱 ends with one plain line instead (qian-card.js bookHtml).
import { esc } from './esc.js';

export const READING_WORDS = {
  zh: {
    jie: '白话签解（灵境自译）', her: '银月', herWait: '银月在看这支签……', share: '分享', copy: '拷贝图片', save: '保存图片',
    copied: '已拷贝，可以粘贴到微信', saved: '已保存图片', shared: '已分享', shareFail: '没分享出去，可以先保存图片',
    friendOpen: '替人求签', friendTitle: '替人求签', friendName: '称呼（必填）', friendBirth: '生日（可不填，只在本机推算生肖星座，不保存）',
    friendNoKeep: '不保存', friendGo: '求一签', friendLeft: '今日还可替 {n} 人', friendNone: '今日已替三人求过签了', friendBack: '回到我的签',
    friendOf: '替 {name} 求签', friendForget: '删去 {name}', friendKept: '记下的朋友', friendSigns: '属{zodiac}', yiLabel: '宜', jiLabel: '忌',
    source: '签文出自观音灵签（据新加坡宝聚寺所传本）', clash: '今日冲{zodiac}',
  },
  en: {
    jie: "In plain words (the game's own)", her: 'Yinyue', herWait: 'Yinyue is looking at the stick…', share: 'Share', copy: 'Copy image', save: 'Save image',
    copied: 'Copied — paste it anywhere', saved: 'Image saved', shared: 'Shared', shareFail: 'Not shared — save the image instead',
    friendOpen: 'Draw for someone', friendTitle: 'A stick for someone else', friendName: 'Name (required)', friendBirth: 'Birthday (optional, read here for their animal and sign, never kept)',
    friendNoKeep: "Don't keep", friendGo: 'Draw', friendLeft: '{n} more today', friendNone: 'Three drawn for others today', friendBack: 'Back to mine',
    friendOf: 'Drawn for {name}', friendForget: 'Forget {name}', friendKept: 'Kept', friendSigns: '{zodiac}', yiLabel: 'Good for', jiLabel: 'Avoid',
    source: 'Verses from the Guanyin oracle, as kept by BW Monastery (宝聚寺), Singapore', clash: 'today clashes with the {zodiac}',
  },
};
const say = (tpl, fill) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? '');
export const readingWords = (lang) => READING_WORDS[lang === 'en' ? 'en' : 'zh'];

/* Today's 宜 · 忌 as chips: a row only when the day holds some (never 「无大事」). */
export function yijiHtml(al, w) {
  if (!al) return '';
  const row = (cls, label, list) => (list?.length ? `<div class="qyiji"><b class="${cls}">${esc(label)}</b>${list.map((x) => `<span class="qchip">${esc(x.name)}</span>`).join('')}</div>` : '');
  return row('yi', w.yiLabel, al.yi) + row('ji', w.jiLabel, al.ji);
}

/* The five 项, a row each. */
export const aspectsHtml = (d) => (d.aspects?.length
  ? `<div class="qaspects">${d.aspects.map((a) => `<div class="qasp tone-${esc(a.tone)}"><b>${esc(a.name)}</b><span>${esc(a.line)}</span></div>`).join('')}</div>` : '');

/* 分享 · 拷贝图片 · 保存图片 — 分享 only where the browser can share a file. */
function shareHtml(ctx, w, who) {
  const can = ctx.qianCan ?? { share: false, copy: false, save: true };
  const note = ctx.qianShareNote?.who === who ? `<div class="small dim qsharenote" role="status">${esc(w[ctx.qianShareNote.what] ?? ctx.qianShareNote.what)}</div>` : '';
  const btn = (k) => `<button class="act" data-qian-share="${k}" data-qian-who="${esc(who)}"${ctx.qianPngReady?.[who] ? '' : ' disabled'}>${esc(w[k])}</button>`;
  const img = ctx.qianShown?.who === who ? `<img class="qshown" src="${esc(ctx.qianShown.url)}" alt="">` : '';
  return `<div class="acts qshare">${can.share ? btn('share') : ''}${can.copy ? btn('copy') : ''}${btn('save')}</div>${note}${img}`;
}

/* The reading's body, his or a friend's: number · grade, the verse, the 签解, the five, the 宜忌, her line. */
export function readingBody(d, ctx, w, { fresh = false, her = null, waiting = false, head = '' } = {}) {
  const poem = d.poem.map((l, i) => `<div class="qline${fresh ? ' ink' : ''}" style="--d:${(0.6 + i * 0.9).toFixed(1)}s">${esc(l)}</div>`).join('');
  const lineOf = her ? `<div class="small ling qher"><b>${esc(w.her)}</b>${esc(her)}</div>` : waiting ? `<div class="small ling qher dim">${esc(w.herWait)}</div>` : '';
  return `<div class="qhead"><span class="qstick">${esc(ctx.noOf(d.n))}</span><span class="grade">${esc(d.grade.name)}</span>${d.title ? `<span class="qtitle">${esc(d.title)}</span>` : ''}</div>${head}
    <div class="qpoem">${poem}</div>
    ${d.jie ? `<div class="qjie"><div class="small dim">${esc(w.jie)}</div><div>${esc(d.jie)}</div></div>` : ''}
    ${aspectsHtml(d)}${ctx.almanacLine ? ctx.almanacLine(d.almanac) : ''}${yijiHtml(d.almanac, w)}${lineOf}`;
}

/* 替人求签's form (inside his card): 称呼 (required), a birthday (optional), 不保存; the kept friends to ask again or
   let go; how many are left today. */
export function friendFormHtml(q, ctx, w) {
  const left = q.friend_left ?? 0;
  const kept = (q.friends ?? []).map((f) => `<span class="qfriend"><button class="qchip ask" data-qian-friend-ask="${esc(f.name)}"${left || ctx.qianFriendAsked?.includes(f.name) ? '' : ' disabled'}>${esc(f.name)}${f.signs ? ` · ${esc(say(w.friendSigns, { zodiac: f.signs.zodiac.name }))}` : ''}</button><button class="qx" data-qian-friend-forget="${esc(f.name)}" aria-label="${esc(say(w.friendForget, { name: f.name }))}" title="${esc(say(w.friendForget, { name: f.name }))}">×</button></span>`).join('');
  return `<div class="qfriendform"><div class="cardtitle">${esc(w.friendTitle)}</div>
    <div class="small dim">${esc(left ? say(w.friendLeft, { n: left }) : w.friendNone)}</div>
    ${kept ? `<div class="small dim">${esc(w.friendKept)}</div><div class="qasks">${kept}</div>` : ''}
    <input type="text" id="qian-friend-name" maxlength="12" autocomplete="off" placeholder="${esc(w.friendName)}" value="${esc(ctx.qianFriendName ?? '')}">
    <label class="small dim qfb">${esc(w.friendBirth)}<input type="date" id="qian-friend-birth" min="1900-01-31" value="${esc(ctx.qianFriendBirth ?? '')}"></label>
    <label class="small qnokeep"><input type="checkbox" id="qian-friend-nokeep"${ctx.qianFriendNoKeep ? ' checked' : ''}> ${esc(w.friendNoKeep)}</label>
    ${ctx.qianFriendNote ? `<div class="small seal" role="status">${esc(ctx.qianFriendNote)}</div>` : ''}
    <div class="acts"><button class="act" data-qian-friend-go${left && (ctx.qianFriendName ?? '').trim() ? '' : ' disabled'}>${esc(w.friendGo)}</button><button class="act" data-qian-friend="close">${esc(w.friendBack)}</button></div></div>`;
}

/* A friend's card: the same reading, 「替 X 求签」 on it, her line about that friend, its own share. */
export function friendCardHtml(f, ctx, w) {
  const head = `<div class="small ling qfor">${esc(say(w.friendOf, { name: f.name }))}${f.signs ? ` · ${esc(say(w.friendSigns, { zodiac: f.signs.zodiac.name }))}${f.signs.sign ? ` · ${esc(f.signs.sign.name)}` : ''}` : ''}${f.clash ? ` · ${esc(say(w.clash, { zodiac: f.signs.zodiac.name }))}` : ''}</div>`;
  return `<div class="card qian drawn friend tone-${esc(f.grade.tone)}">${readingBody(f, ctx, w, { fresh: ctx.qianFriendFresh, her: ctx.qianFriendHer, waiting: ctx.qianFriendWaiting, head })}
    ${shareHtml(ctx, w, 'friend')}<div class="acts"><button class="act" data-qian-friend="back">${esc(w.friendBack)}</button><button class="act" data-qian-friend="open">${esc(w.friendOpen)}</button></div></div>`;
}

export { shareHtml };
