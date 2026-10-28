// aigames-cards.js — the stage cards of the AI mini-games (rules/aigames.mjs):
// 对对子 (断案 cut 2026-10-27; the player-asks 二十问 2026-10-28; 讨价还价 became the shelf's 砍价, kanjia.js). Facts only, from Look:
// counts, lists, what was found, the price standing now. The talk is the
// chat's — 银月 and Ling write every sentence a person reads; these cards
// never carry the floor or the truth (Look does not have them).
import { esc } from './esc.js';
import { CHECK_IDS, checkCouplet } from './couplet.js';

export const AI_WORDS = { zh: {}, en: {} };

const say = (tpl, fill) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? '');
const note = (ctx) => (ctx.aiNote ? `<div class="donote">${esc(ctx.aiNote)}</div>` : '');

/* ════════ 对对子 (rules/duizi.mjs) ════════
   The 上联 big and vertical (right), the 下联 beside it (left), as a pair is
   hung; the form's checks (couplet.js) drawn as he types — the page updates
   them in place (lingjing.js) — and the teacher's grades once Ling has
   graded. 银月's two buttons only while she is awake (Look's `duizi.her`). */
export const DUIZI_WORDS = {
  zh: {
    title: '对对子 · {who}', offer: '{who}出上联，你对下联。字数、平仄、重字，当场就看得出；词性、意思、意境，先生看了再说。', begin: '请先生出上联', again: '再来一联（今日还剩 {n} 联）',
    done: '今天的对子对够了 · 明日再来', rung: '{name} · 好对 {good}/{need}', rungShut: '{name}（未到）', up: '上联', down: '下联', write: '写下联……',
    send: '对上', skip: '放下这一联', waiting: '{who}捻着胡子，细看你这一联', resend: '再请先生看看',
    checks: { len: '字数', tail: '平仄', same: '不重位', copy: '不抄字' }, verdict: { ok: '✓', bad: '✗', unsure: '?', wait: '…' },
    tailNote: '下联末字要平声（一声、二声）', sameNote: '同一位置不能用同一个字', copyNote: '别照抄上联的字',
    ref: '古人对：{down}（{src}）', paid: '得 {what}', unlocked: '{name} 开了',
    revTitle: '你出上联，先生对', revWrite: '出个上联（1–{max} 字）', revSend: '请先生对', revWait: '{who}在想', revLeft: '今日还能出 {n} 联',
    herHint: '问银月要个提示', herOffer: '银月也对一句', herSays: '银月对：', herUsed: '银月已提示过',
    say: '先生请看，我对：「{down}」', revSay: '先生，我出个上联：「{up}」，请对。', hintSay: '@银月 这一联「{up}」我卡住了，给点提示？', offerSay: '@银月 「{up}」这一联，你也对一句？',
  },
  en: {
    title: 'Couplets · {who}', offer: '{who} sets the upper line; you write the lower.', begin: 'Ask for an upper line', again: 'Another ({n} left today)',
    done: 'Enough couplets for today · tomorrow', rung: '{name} · good {good}/{need}', rungShut: '{name} (not yet)', up: 'Upper', down: 'Lower', write: 'Write the lower line…',
    send: 'Answer', skip: 'Let this one go', waiting: '{who} strokes his beard over your line', resend: 'Ask him to look again',
    checks: { len: 'length', tail: 'tone', same: 'no same place', copy: 'not copied' }, verdict: { ok: '✓', bad: '✗', unsure: '?', wait: '…' },
    tailNote: 'The lower line ends on a level tone', sameNote: 'Not the same character at the same place', copyNote: 'Do not copy the upper line',
    ref: 'The classic answer: {down} ({src})', paid: 'Earned {what}', unlocked: '{name} opened',
    revTitle: 'You set, he answers', revWrite: 'An upper line (1–{max})', revSend: 'Ask him', revWait: '{who} is thinking', revLeft: '{n} more today',
    herHint: 'Ask Yinyue for a hint', herOffer: 'Yinyue, you try', herSays: 'Yinyue: ', herUsed: 'Yinyue has hinted',
    say: 'Master, my answer: "{down}"', revSay: 'Master, an upper line for you: "{up}"', hintSay: '@Yinyue I am stuck on "{up}" — a hint?', offerSay: '@Yinyue your answer to "{up}"?',
  },
};

const NOTE_OF = { tail: 'tailNote', same: 'sameNote', copy: 'copyNote' };
const WAITING = { checks: Object.fromEntries(CHECK_IDS.map((id) => [id, 'wait'])), ready: false };
/// The form as he has typed it so far — every check waiting until the 平仄 table is in (lingjing.js loads it).
export const duiziFormOf = (d, up, draft, tones) => (tones ? checkCouplet(tones, up, draft ?? '', { allow: d.round?.allow ?? 0, free: d.free ?? '' }) : WAITING);
/// The form's checks as chips — the card draws them, and the page redraws them as he types.
export function duiziChecksHtml(form, w) {
  if (!form) return '';
  const chips = Object.entries(form.checks).map(([id, v]) => `<span class="dzchk ${esc(v)}">${esc(w.checks[id] ?? id)} ${esc(w.verdict[v] ?? v)}</span>`).join('');
  const notes = Object.entries(form.checks).filter(([id, v]) => v === 'bad' && NOTE_OF[id]).map(([id]) => w[NOTE_OF[id]]);
  return `${chips}${notes.length ? `<div class="small dim dznote">${notes.map(esc).join(' · ')}</div>` : ''}`;
}

const dzLine = (t, cls) => `<div class="dzline ${cls}">${[...String(t ?? '')].map((c) => `<span>${esc(c)}</span>`).join('')}</div>`;
/* The pair as hung: 上联 on the right, 下联 on the left, each read top to bottom. */
const pairHtml = (up, down, w) => `<div class="dzpair">${down ? `<div class="dzcol"><div class="dzcap">${esc(w.down)}</div>${dzLine(down, 'down')}</div>` : ''}<div class="dzcol"><div class="dzcap">${esc(w.up)}</div>${dzLine(up, 'up')}</div></div>`;
const dots = (n) => [0, 1].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
const paidSay = (p) => [p?.progress ? `修为 ${p.progress}` : '', p?.wealth ? `灵石 ${p.wealth}` : ''].filter(Boolean).join(' · ');
const waitHtml = (t) => `<div class="dzwait" role="status"><span>${esc(t)}</span><i></i><i></i><i></i></div>`;

function rungsHtml(d, w) {
  return `<div class="acts dzrungs">${d.rungs.map((r) => (r.open
    ? `<button class="act namechip${d.pick === r.id ? ' on' : ''}" data-duizi-rung="${esc(r.id)}" aria-pressed="${d.pick === r.id}">${esc(say(w.rung, r))}</button>`
    : `<span class="chip">${esc(say(w.rungShut, r))}</span>`)).join('')}</div>`;
}

/* Graded: the mark, the three grades as dots, the classic 下联, the pay; her line if she gave one. */
function gradedHtml(d, r, w, ctx) {
  const grades = d.rubric.map((x) => `<span class="dzgrade">${esc(x.name)} <b>${dots(r.grades?.[x.id] ?? 0)}</b></span>`).join('');
  const her = r.her ? `<div class="dzher"><b>${esc(w.herSays)}</b>${esc(r.her.down)} <span class="dzchecks">${duiziChecksHtml(r.her.form, w)}</span></div>` : '';
  const offer = d.her && !r.her ? `<div class="acts"><button class="act quiet" data-duizi-her="offer">${esc(w.herOffer)}</button></div>` : '';
  return `${pairHtml(r.up, r.down, w)}<div class="dzmark${r.mark?.good ? ' good' : ''}">${esc(r.mark?.name ?? '')}</div>
    <div class="dzgrades">${grades}</div><div class="dzchecks">${duiziChecksHtml(r.form, w)}</div>
    ${r.ref ? `<div class="small dim dzref">${esc(say(w.ref, { down: r.ref, src: r.src ?? '' }))}</div>` : ''}${r.paid ? `<div class="small dzpaid">${esc(say(w.paid, { what: paidSay(r.paid) }))}</div>` : ''}
    ${r.unlocked ? `<div class="small dzopen">${esc(say(w.unlocked, { name: r.unlocked }))}</div>` : ''}${her}${offer}`;
}

/* Under way: the 上联, the input, the checks as he types, 对上 / 放下; her hint while she is awake. */
function openHtml(d, r, w, ctx) {
  const form = duiziFormOf(d, r.up, ctx.duiziDraft, ctx.duiziTones);
  const hint = d.her ? (r.hint_used ? `<span class="small dim">${esc(w.herUsed)}</span>` : `<button class="act quiet" data-duizi-her="hint">${esc(w.herHint)}</button>`) : '';
  return `${pairHtml(r.up, '', w)}<div class="fateform dzform"><input type="text" id="duizi-down" lang="zh" maxlength="${[...r.up].length * 2 + 4}" autocomplete="off" placeholder="${esc(w.write)}" value="${esc(ctx.duiziDraft ?? '')}">
    <button class="act" data-duizi-submit${form?.ready ? '' : ' disabled'}>${esc(w.send)}</button></div>
    <div class="dzchecks" id="duizi-checks">${duiziChecksHtml(form, w)}</div>
    <div class="acts"><button class="act quiet" data-duizi-skip>${esc(w.skip)}</button>${hint}</div>`;
}

/* Sent, not yet graded: the pair, and the teacher looking — never a bare card. */
function pendingHtml(d, r, w, ctx) {
  const late = ctx.duiziLate ? `<div class="acts"><button class="act quiet" data-duizi-resend>${esc(w.resend)}</button></div>` : '';
  return `${pairHtml(r.up, r.down, w)}<div class="dzchecks">${duiziChecksHtml(r.form, w)}</div>${waitHtml(say(w.waiting, { who: d.teacher }))}${late}`;
}

/* The reverse: his 上联 for the teacher, the answer once Ling gives it. */
function reverseHtml(d, w, ctx) {
  const v = d.rev;
  const shown = v ? `${pairHtml(v.up, v.down ?? '', w)}${v.down ? `<div class="dzchecks">${duiziChecksHtml(v.form, w)}</div>` : waitHtml(say(w.revWait, { who: d.teacher }))}` : '';
  const form = (!v || v.down) && d.reverse_left ? `<div class="fateform"><input type="text" id="duizi-up" lang="zh" maxlength="${d.max * 2 + 4}" autocomplete="off" placeholder="${esc(say(w.revWrite, { max: d.max }))}" value="${esc(ctx.duiziUp ?? '')}">
    <button class="act quiet" data-duizi-reverse>${esc(w.revSend)}</button></div><div class="small dim">${esc(say(w.revLeft, { n: d.reverse_left }))}</div>` : '';
  if (!shown && !form) return '';
  return `<details class="dzrev"${v || ctx.duiziRevOpen ? ' open' : ''}><summary class="small">${esc(w.revTitle)}</summary>${shown}${form}</details>`;
}

const STATE_OF = (r) => (!r || r.skipped ? 'none' : r.mark ? 'graded' : r.pending ? 'pending' : 'open');
const BODY = { open: openHtml, pending: pendingHtml, graded: gradedHtml, none: () => '' };

/// 对对子 — offered at the teacher's place; under way, the pair and its checks; graded, the teacher's marks.
export function duizi(card, ctx) {
  const d0 = ctx.look?.duizi;
  if (!d0) return '';
  const w = DUIZI_WORDS[ctx.lang === 'en' ? 'en' : 'zh'];
  const d = { ...d0, pick: ctx.duiziRung && d0.rungs.some((r) => r.id === ctx.duiziRung && r.open) ? ctx.duiziRung : d0.rung };
  const r = d.round, st = STATE_OF(r);
  const head = `<div class="cardtitle">${esc(say(w.title, { who: d.teacher }))}</div>`;
  const ready = st === 'none' || st === 'graded';
  const next = !ready ? '' : d.rounds_left
    ? `${rungsHtml(d, w)}<div class="acts"><button class="act" data-duizi-open>${esc(st === 'graded' ? say(w.again, { n: d.rounds_left }) : w.begin)}</button></div>`
    : `<div class="boarddone">${esc(w.done)}</div>`;
  const intro = st === 'none' ? `<div class="small dim">${esc(say(w.offer, { who: d.teacher }))}</div>` : '';
  return `<div class="card duizi">${head}${intro}${BODY[st](d, r, w, ctx)}${next}${reverseHtml(d, w, ctx)}${note(ctx)}</div>`;
}
