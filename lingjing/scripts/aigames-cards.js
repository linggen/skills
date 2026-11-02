// aigames-cards.js — the stage cards of the AI mini-games (rules/aigames.mjs):
// 对对子 (断案 cut 2026-10-27; the player-asks 二十问 2026-10-28; 讨价还价 became the shelf's 砍价, kanjia.js). Facts only, from Look:
// counts, lists, what was found, the price standing now. The talk is the
// chat's — 银月 and Ling write every sentence a person reads; these cards
// never carry the floor or the truth (Look does not have them).
import { esc } from './esc.js';
import { CHECK_IDS, checkCouplet } from './couplet.js';
import { RHYME_CHECK_IDS, checkRhyme } from './rhyme.js';
import { duiziDrawn } from './stage.mjs';

export const AI_WORDS = { zh: {}, en: {} };

const say = (tpl, fill) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? '');
const note = (ctx) => (ctx.aiNote ? `<div class="donote">${esc(ctx.aiNote)}</div>` : '');

/* ════════ 对对子 (rules/duizi.mjs) ════════
   The 上联 big and vertical (right), the 下联 beside it (left), as a pair is
   hung (in English, a rhyming-couplet ladder: the line above, the answer
   below, rhyme.js's checks); the form's checks (couplet.js) drawn as he types — the page updates
   them in place (lingjing.js) — and the teacher's grades once Ling has
   graded. 银月's two buttons only while she is awake (Look's `duizi.her`).
   One 联 a sitting (Hanli 2026-11-02): graded, the card ends with 收下 — no 再来; the offer (rungs,
   请先生出上联) stands only while the 时辰 pool has 对对子 drawn (Look's `tray`); the reverse, one a 时辰. */
export const DUIZI_WORDS = {
  zh: {
    title: '对对子 · {who}', offer: '{who}出上联，你对下联。字数、平仄、重字，当场就看得出；词性、意思、意境，先生看了再说。', begin: '请先生出上联', close: '收下',
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
    row: true, input: 'en',
    title: 'Couplets · {who}', offer: '{who} gives a line; you answer it. Syllables, rhyme and copying show as you type; contrast, fit and wit are his to judge.', begin: 'Ask for a line', close: 'Take it',
    done: 'Enough couplets for today · come back tomorrow', rung: '{name} · good {good}/{need}', rungShut: '{name} (not yet)', up: 'Line', down: 'Answer', write: 'Write your answer…',
    send: 'Answer', skip: 'Let this one go', waiting: '{who} strokes his beard over your line', resend: 'Ask him to look again',
    checks: { one: 'one word', len: 'syllables', rhyme: 'rhyme', copy: 'not copied' }, verdict: { ok: '✓', bad: '✗', unsure: '?', wait: '…' },
    oneNote: 'One word only', lenNote: 'As many syllables as his line', rhymeNote: 'End on a rhyme for his last word', copyNote: 'Do not reuse his words',
    ref: 'The classic answer: {down} ({src})', paid: 'Earned: {what}', unlocked: '{name} opened',
    revTitle: 'You set, he answers', revWrite: 'A line for him (up to {max} syllables)', revSend: 'Ask him', revWait: '{who} is thinking', revLeft: '{n} more today',
    herHint: 'Ask Yinyue for a hint', herOffer: 'Yinyue, you try', herSays: 'Yinyue: ', herUsed: 'Yinyue has hinted',
    say: 'Master, my answer: "{down}"', revSay: 'Master, a line for you: "{up}" — your answer?', hintSay: '@银月 I am stuck on "{up}" — a hint?', offerSay: '@银月 your answer to "{up}"?',
  },

};

const NOTE_OF = { tail: 'tailNote', same: 'sameNote', copy: 'copyNote', one: 'oneNote', len: 'lenNote', rhyme: 'rhymeNote' };
const waitingOf = (ids) => ({ checks: Object.fromEntries(ids.map((id) => [id, 'wait'])), ready: false });
const WAITING = waitingOf(CHECK_IDS);
/// The form as he has typed it so far — every check waiting until the table is in (lingjing.js loads it):
/// the 平仄 table for a Chinese round, the syllable and rhyme table for an English one (its `kind`).
export function duiziFormOf(d, up, draft, table) {
  const kind = d.round?.kind;
  if (kind) return table ? checkRhyme(table, up, draft ?? '', { kind, allow: d.round?.allow ?? 0, free: d.free ?? [] }) : waitingOf(RHYME_CHECK_IDS[kind] ?? RHYME_CHECK_IDS.line);
  return table ? checkCouplet(table, up, draft ?? '', { allow: d.round?.allow ?? 0, free: d.free ?? '' }) : WAITING;
}
/// Which table the form is read by (lingjing.js fetches it): English's rhymes, else the 平仄.
export const duiziTableOf = (d, lang) => (d?.round?.kind || lang === 'en' ? 'rhymes.json' : 'tones.json');
/// The form's checks as chips — the card draws them, and the page redraws them as he types.
export function duiziChecksHtml(form, w) {
  if (!form) return '';
  const chips = Object.entries(form.checks).map(([id, v]) => `<span class="dzchk ${esc(v)}">${esc(w.checks[id] ?? id)} ${esc(w.verdict[v] ?? v)}</span>`).join('');
  const notes = Object.entries(form.checks).filter(([id, v]) => v === 'bad' && NOTE_OF[id] && w[NOTE_OF[id]]).map(([id]) => w[NOTE_OF[id]]);
  return `${chips}${notes.length ? `<div class="small dim dznote">${notes.map(esc).join(' · ')}</div>` : ''}`;
}

const dzLine = (t, cls) => `<div class="dzline ${cls}">${[...String(t ?? '')].map((c) => `<span>${esc(c)}</span>`).join('')}</div>`;
/* English: the line above, the answer below, each read left to right. */
const rowsHtml = (up, down, w) => `<div class="dzpair row"><div class="dzrow"><div class="dzcap">${esc(w.up)}</div><div class="dzline up">${esc(up)}</div></div>${down ? `<div class="dzrow"><div class="dzcap">${esc(w.down)}</div><div class="dzline down">${esc(down)}</div></div>` : ''}</div>`;
/* The pair as hung: 上联 on the right, 下联 on the left, each read top to bottom. */
const pairHtml = (up, down, w) => (w.row ? rowsHtml(up, down, w) : `<div class="dzpair">${down ? `<div class="dzcol"><div class="dzcap">${esc(w.down)}</div>${dzLine(down, 'down')}</div>` : ''}<div class="dzcol"><div class="dzcap">${esc(w.up)}</div>${dzLine(up, 'up')}</div></div>`);
const dots = (n) => [0, 1].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
/* What was paid: 「修为 3 · 灵石 5」; in English the number first, 「3 cultivation · 5 spirit stones」. */
const PAID = { zh: (n, k) => `${['修为', '灵石'][k]} ${n}`, en: (n, k) => `${n} ${['cultivation', 'spirit stones'][k]}` };
const paidSay = (p, w) => { const one = PAID[w.input === 'en' ? 'en' : 'zh']; return [p?.progress ? one(p.progress, 0) : '', p?.wealth ? one(p.wealth, 1) : ''].filter(Boolean).join(' · '); };
/* The input's language and room: a Chinese line's characters, or an English line's letters. */
const fieldOf = (w, n) => (w.input === 'en' ? 'lang="en" maxlength="160"' : `lang="zh" maxlength="${n * 2 + 4}"`);
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
    ${r.ref ? `<div class="small dim dzref">${esc(say(w.ref, { down: r.ref, src: r.src ?? '' }))}</div>` : ''}${r.paid ? `<div class="small dzpaid">${esc(say(w.paid, { what: paidSay(r.paid, w) }))}</div>` : ''}
    ${r.unlocked ? `<div class="small dzopen">${esc(say(w.unlocked, { name: r.unlocked }))}</div>` : ''}${her}${offer}`;
}

/* Under way: the 上联, the input, the checks as he types, 对上 / 放下; her hint while she is awake. */
function openHtml(d, r, w, ctx) {
  const form = duiziFormOf(d, r.up, ctx.duiziDraft, ctx.duiziTones);
  const hint = d.her ? (r.hint_used ? `<span class="small dim">${esc(w.herUsed)}</span>` : `<button class="act quiet" data-duizi-her="hint">${esc(w.herHint)}</button>`) : '';
  return `${pairHtml(r.up, '', w)}<div class="fateform dzform"><input type="text" id="duizi-down" ${fieldOf(w, [...r.up].length)} autocomplete="off" placeholder="${esc(w.write)}" value="${esc(ctx.duiziDraft ?? '')}">
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
  // An earlier sitting's, answered, is not this card's; one waiting on the teacher still shows.
  const v = d.rev && (!d.rev.down || d.rev_now) ? d.rev : null;
  const shown = v ? `${pairHtml(v.up, v.down ?? '', w)}${v.down ? `<div class="dzchecks">${duiziChecksHtml(v.form, w)}</div>` : waitHtml(say(w.revWait, { who: d.teacher }))}` : '';
  const form = !d.rev_now && d.reverse_left ? `<div class="fateform"><input type="text" id="duizi-up" ${fieldOf(w, d.max)} autocomplete="off" placeholder="${esc(say(w.revWrite, { max: d.max }))}" value="${esc(ctx.duiziUp ?? '')}">
    <button class="act quiet" data-duizi-reverse>${esc(w.revSend)}</button></div><div class="small dim">${esc(say(w.revLeft, { n: d.reverse_left }))}</div>` : '';
  if (!shown && !form) return '';
  return `<details class="dzrev"${v || ctx.duiziRevOpen ? ' open' : ''}><summary class="small">${esc(w.revTitle)}</summary>${shown}${form}</details>`;
}

const STATE_OF = (r) => (!r || r.skipped || r.closed ? 'none' : r.mark ? 'graded' : r.pending ? 'pending' : 'open');
const BODY = { open: openHtml, pending: pendingHtml, graded: gradedHtml, none: () => '' };

/// 对对子 — offered at the teacher's place; under way, the pair and its checks; graded, the teacher's marks.
export function duizi(card, ctx) {
  const d0 = ctx.look?.duizi;
  if (!d0) return '';
  const w = DUIZI_WORDS[ctx.lang === 'en' ? 'en' : 'zh'];
  const d = { ...d0, pick: ctx.duiziRung && d0.rungs.some((r) => r.id === ctx.duiziRung && r.open) ? ctx.duiziRung : d0.rung };
  const r = d.round, st = STATE_OF(r);
  const head = `<div class="cardtitle">${esc(say(w.title, { who: d.teacher }))}</div>`;
  const next = st === 'graded' ? `<div class="acts"><button class="act" data-duizi-close>${esc(w.close)}</button></div>`
    : st !== 'none' ? '' : !d.rounds_left ? `<div class="boarddone">${esc(w.done)}</div>`
      : duiziDrawn(ctx.look) ? `${rungsHtml(d, w)}<div class="acts"><button class="act" data-duizi-open>${esc(w.begin)}</button></div>` : '';
  const intro = st === 'none' ? `<div class="small dim">${esc(say(w.offer, { who: d.teacher }))}</div>` : '';
  return `<div class="card duizi">${head}${intro}${BODY[st](d, r, w, ctx)}${next}${reverseHtml(d, w, ctx)}${note(ctx)}</div>`;
}
