// aigames-cards.js — the stage cards of the AI mini-games (rules/aigames.mjs):
// 二十问 · 讨价还价 · 断案. Facts only, from Look (`twenty`, `haggle`, `case`):
// counts, lists, what was found, the price standing now. The talk is the
// chat's — 银月 and Ling write every sentence a person reads; these cards
// never carry the animal, the floor or the truth (Look does not have them).
import { esc } from './esc.js';
import { CHECK_IDS, checkCouplet } from './couplet.js';

export const AI_WORDS = {
  zh: {
    twentyTitle: '二十问 · 银月', twentyOffer: '她心里想好一种寻常动物，你只问「是不是」。二十问之内猜中它。', twentyBegin: '和银月玩二十问',
    twentyHow: '在对话里 @银月 问她，只问是或不是。', twentyCount: '已问 {n}/{max}', twentyHint: '过了十五问，她会给点提示。',
    twentyGuess: '猜它是……', twentyGuessGo: '猜', twentyQuit: '认输', twentyWon: '猜中了：{animal}', twentyLost: '没猜中——是{animal}', twentyDone: '今天玩够了 · 明日再来', twentyAgain: '再来一局（今日还剩 {n} 局）',
    twentyAnswers: { yes: '是', no: '不是', partly: '有点', unknown: '说不准' }, twentyGuesses: '猜过', twentyKnown: '识得 {n} 种', twentyAsk: '@银月 来玩二十问吧，你想好了吗？', twentySaid: '@银月 我猜：{g}',
    haggleTitle: '讨价还价 · {keeper}', haggleOffer: '架上的东西，可以跟{keeper}讲讲价。今日还能讲 {n} 回。', haggleBegin: '讲讲价', haggleSay: '{keeper}，这些东西能便宜点吗？',
    haggleList: '标价 {n}', haggleAsk: '现价 {n}', haggleQty: '两件 · 共 {n}', haggleTurns: '已讲 {n}/{max} 句', haggleMood: '脸色：{m}', haggleUsed: '说动过：{r}', haggleBarter: '拿{item}抵一部分',
    haggleFirm: '他说：这是底价了。', haggleLast: '最后一口价了。', haggleDeal: '成交 · {n} 灵石', haggleWalk: '不买了', haggleHow: '在对话里跟他讲：熟客、多买、瑕疵、拿东西换……空口压价，他会不高兴。', haggleOut: '今天讲价讲够了 · 照价买或明日再来',
    caseHow: '在对话里问人：阿禾、周衡，还有那几个。', caseAsked: '已问 {n}/{max}', caseClues: '凭据', caseNoClues: '还没有凭据。', caseLookAround: '四下看看', casePeople: '在场的人',
    caseAccuse: '指认', caseWho: '是谁？', caseEvidence: '凭什么？（选你找着的）', caseSolved: '账对上了。', caseWrong: '对不上——改日再来。', caseBegin: '问问这案子', caseSay: '这案子，我想再问问。',
  },
  en: {
    twentyTitle: 'Twenty questions · Yinyue', twentyOffer: 'She thinks of an ordinary animal; you ask only yes or no. Guess it within twenty.', twentyBegin: 'Play twenty questions with Yinyue',
    twentyHow: 'Ask her in the chat with @Yinyue — yes-or-no questions only.', twentyCount: 'Asked {n}/{max}', twentyHint: 'Past fifteen questions she gives small hints.',
    twentyGuess: 'It is a…', twentyGuessGo: 'Guess', twentyQuit: 'Give up', twentyWon: 'Guessed it: {animal}', twentyLost: 'Not guessed — it was a {animal}', twentyDone: 'Enough for today · Come back tomorrow', twentyAgain: 'Another round ({n} left today)',
    twentyAnswers: { yes: 'yes', no: 'no', partly: 'partly', unknown: 'can\'t say' }, twentyGuesses: 'Guessed', twentyKnown: '{n} known', twentyAsk: '@Yinyue Let\'s play twenty questions — have you thought of one?', twentySaid: '@Yinyue My guess: {g}',
    haggleTitle: 'Haggling · {keeper}', haggleOffer: 'You can haggle with {keeper} over what is on the shelf. {n} more today.', haggleBegin: 'Haggle', haggleSay: '{keeper}, could any of this come cheaper?',
    haggleList: 'List {n}', haggleAsk: 'Now {n}', haggleQty: 'Two · {n} in all', haggleTurns: 'Said {n}/{max}', haggleMood: 'Mood: {m}', haggleUsed: 'Moved by: {r}', haggleBarter: 'the {item} as part payment',
    haggleFirm: 'He says that is as low as it goes.', haggleLast: 'That was the last word on price.', haggleDeal: 'Deal · {n} stones', haggleWalk: 'Walk away', haggleHow: 'Talk to him in the chat: a regular, buying more, a flaw, a thing in trade… a bare push sours him.', haggleOut: 'Enough haggling today · list price, or tomorrow',
    caseHow: 'Ask people in the chat: Ahe, Zhou Heng, and the others.', caseAsked: 'Asked {n}/{max}', caseClues: 'Proof', caseNoClues: 'No proof yet.', caseLookAround: 'Look around', casePeople: 'Who is here',
    caseAccuse: 'Name them', caseWho: 'Who?', caseEvidence: 'On what proof? (pick what you found)', caseSolved: 'The accounts tally.', caseWrong: 'It does not tally — come back another day.', caseBegin: 'Ask about the case', caseSay: 'About this case — I would like to ask around.',
  },
};

const say = (tpl, fill) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? '');
const sayBtn = (label, line) => `<button class="act say" data-say="${esc(line)}">${esc(label)}</button>`;
const doBtn = (label, action, id, disabled = false) => `<button class="act do" data-do="${esc(action)}" data-id="${esc(id)}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
const note = (ctx) => (ctx.aiNote ? `<div class="donote">${esc(ctx.aiNote)}</div>` : '');

/// 二十问 — offered while she walks with him; under way, the count, what was
/// asked and her yes/no, the guesses, a guess box; over, the animal named.
export function twenty(card, ctx) {
  const t = ctx.look?.twenty, w = ctx.words;
  if (!t) return '';
  const head = `<div class="cardtitle">${esc(w.twentyTitle)}<span class="small dim"> · ${esc(say(w.twentyKnown, { n: t.known }))}</span></div>`;
  if (!t.open && !t.outcome) {
    if (!t.rounds_left) return `<div class="card twenty done">${head}<div class="boarddone">${esc(w.twentyDone)}</div></div>`;
    return `<div class="card twenty">${head}<div class="small dim">${esc(w.twentyOffer)}</div><div class="acts"><button class="act" data-twenty-open>${esc(w.twentyBegin)}</button></div>${note(ctx)}</div>`;
  }
  const asked = (t.asked ?? []).map((x) => `<li>${esc(x.q)} <b>${esc(w.twentyAnswers[x.a] ?? x.a)}</b></li>`).join('');
  const guesses = t.guesses?.length ? `<div class="small dim">${esc(w.twentyGuesses)}：${t.guesses.map(esc).join('、')}</div>` : '';
  const list = asked ? `<ol class="twentylist">${asked}</ol>` : '';
  if (!t.open) {
    const end = t.outcome === 'won' ? say(w.twentyWon, { animal: t.animal }) : say(w.twentyLost, { animal: t.animal });
    const again = t.rounds_left ? `<div class="acts"><button class="act" data-twenty-open>${esc(say(w.twentyAgain, { n: t.rounds_left }))}</button></div>` : `<div class="small dim">${esc(w.twentyDone)}</div>`;
    return `<div class="card twenty done">${head}<div class="boarddone">${esc(end)}</div>${list}${guesses}${again}</div>`;
  }
  return `<div class="card twenty">${head}<div class="lundaoprompt">${esc(say(w.twentyCount, { n: t.count, max: t.max }))}</div>${t.hint ? `<div class="small">${esc(w.twentyHint)}</div>` : ''}
    ${list}${guesses}<div class="small dim">${esc(w.twentyHow)}</div>
    <div class="fateform"><input type="text" id="twenty-guess" maxlength="20" autocomplete="off" placeholder="${esc(w.twentyGuess)}" value="${esc(ctx.twentyGuess ?? '')}">
    <button class="act" data-twenty-guess>${esc(w.twentyGuessGo)}</button><button class="act quiet" data-twenty-quit>${esc(w.twentyQuit)}</button></div>${note(ctx)}</div>`;
}

/// 讨价还价 — at a keeper's shelf: how many haggles are left and one word to
/// begin; under way, the thing, its list price, the price standing now, how
/// far along, and 成交 / 不买了 — the page's own taps, the rules' price.
export function haggle(card, ctx) {
  const h = ctx.look?.haggle, w = ctx.words;
  if (!h) return '';
  if (!h.open) {
    if (!h.left) return `<div class="card haggle done"><div class="cardtitle">${esc(say(w.haggleTitle, { keeper: h.keeper }))}</div><div class="boarddone">${esc(w.haggleOut)}</div></div>`;
    return `<div class="card haggle"><div class="cardtitle">${esc(say(w.haggleTitle, { keeper: h.keeper }))}</div><div class="small dim">${esc(say(w.haggleOffer, { keeper: h.keeper, n: h.left }))}</div>
      <div class="acts">${sayBtn(w.haggleBegin, say(w.haggleSay, { keeper: h.keeper }))}</div>${note(ctx)}</div>`;
  }
  const price = h.qty > 1 ? say(w.haggleQty, { n: h.total }) : say(w.haggleAsk, { n: h.ask });
  const facts = [say(w.haggleTurns, { n: h.turns, max: h.max_turns }), say(w.haggleMood, { m: h.mood }), h.reasons?.length ? say(w.haggleUsed, { r: h.reasons.join('、') }) : '', h.barter ? say(w.haggleBarter, { item: h.barter }) : ''].filter(Boolean);
  return `<div class="card haggle"><div class="cardtitle">${esc(say(w.haggleTitle, { keeper: h.keeper }))} · ${esc(h.item.name)}</div>
    <div class="lundaoprompt"><s class="dim">${esc(say(w.haggleList, { n: h.list }))}</s> · ${esc(price)}</div>
    <div class="small dim">${facts.map(esc).join(' · ')}</div>${h.firm ? `<div class="small">${esc(w.haggleFirm)}</div>` : ''}${h.last_word ? `<div class="small">${esc(w.haggleLast)}</div>` : ''}
    <div class="small dim">${esc(w.haggleHow)}</div>
    <div class="acts">${doBtn(say(w.haggleDeal, { n: h.total }), 'haggle-deal', h.item.id)}${doBtn(w.haggleWalk, 'haggle-walk', h.item.id)}</div>${note(ctx)}</div>`;
}

/// 断案 — who is there, what was found (each clue as the rules worded it), the
/// spots still to look at, the count, and the accusation: a suspect and the
/// proof picked from what was found. The rules judge it; the card says the
/// outcome in two words and the chat tells the rest.
export function caseCard(card, ctx) {
  const c = ctx.look?.case, w = ctx.words;
  if (!c) return '';
  const head = `<div class="cardtitle">${esc(c.title)}</div>`;
  if (c.outcome === 'solved') return `<div class="card case done">${head}<div class="boarddone">${esc(w.caseSolved)}</div></div>`;
  if (c.outcome === 'wrong') return `<div class="card case done">${head}<div class="boarddone">${esc(w.caseWrong)}</div></div>`;
  const people = c.people.map((p) => `<li><b>${esc(p.name)}</b> <span class="small dim">${esc(p.role)}</span></li>`).join('');
  const clues = c.clues.length ? `<ul class="caseclues">${c.clues.map((x) => `<li><b>${esc(x.name)}</b>：${esc(x.fact)}</li>`).join('')}</ul>` : `<div class="small dim">${esc(w.caseNoClues)}</div>`;
  const spots = c.spots.length ? `<div class="small dim">${esc(w.caseLookAround)}</div><div class="acts">${c.spots.map((s) => `<button class="act" data-case-look="${esc(s.id)}">${esc(s.label)}</button>`).join('')}</div>` : '';
  const who = ctx.caseWho ?? null, ev = new Set(ctx.caseEv ?? []);
  const suspects = c.people.filter((p) => p.suspect).map((p) => `<button class="act namechip${who === p.id ? ' on' : ''}" data-case-who="${esc(p.id)}" aria-pressed="${who === p.id}">${esc(p.name)}</button>`).join('');
  const proofs = c.clues.map((x) => `<button class="act namechip${ev.has(x.id) ? ' on' : ''}" data-case-ev="${esc(x.id)}" aria-pressed="${ev.has(x.id)}">${esc(x.name)}</button>`).join('');
  const ready = who && ev.size > 0 && c.tries_left > 0;
  const accuse = c.clues.length ? `<div class="small dim">${esc(w.caseWho)}</div><div class="acts">${suspects}</div><div class="small dim">${esc(w.caseEvidence)}</div><div class="acts">${proofs}</div>
    <div class="acts"><button class="act" data-case-accuse${ready ? '' : ' disabled'}>${esc(w.caseAccuse)}</button></div>` : '';
  return `<div class="card case">${head}<div class="small dim">${esc(c.line)}</div>
    <div class="small dim">${esc(w.casePeople)}</div><ul class="casepeople">${people}</ul>
    <div class="small dim">${esc(w.caseClues)} · ${esc(say(w.caseAsked, { n: c.asked, max: c.max }))}</div>${clues}${spots}
    <div class="small dim">${esc(w.caseHow)}</div><div class="acts">${sayBtn(w.caseBegin, w.caseSay)}</div>${accuse}${note(ctx)}</div>`;
}

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
