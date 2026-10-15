// aigames-cards.js — the stage cards of the AI mini-games (rules/aigames.mjs):
// 二十问 · 讨价还价 · 断案. Facts only, from Look (`twenty`, `haggle`, `case`):
// counts, lists, what was found, the price standing now. The talk is the
// chat's — 银月 and Ling write every sentence a person reads; these cards
// never carry the animal, the floor or the truth (Look does not have them).
import { esc } from './esc.js';

export const AI_WORDS = {
  zh: {
    twentyTitle: '二十问 · 银月', twentyOffer: '她心里想好一种寻常动物，你只问「是不是」。二十问之内猜中它。', twentyBegin: '和银月玩二十问', twentyRow: '玩一局',
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
    twentyTitle: 'Twenty questions · Yinyue', twentyOffer: 'She thinks of an ordinary animal; you ask only yes or no. Guess it within twenty.', twentyBegin: 'Play twenty questions with Yinyue', twentyRow: 'Play',
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
