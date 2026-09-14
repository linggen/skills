// cards.js — the scene's cards. One renderer per kind Ling can Show; each
// draws only from authored content and the rules' Look, never from words the
// model wrote, so a card can't show a number the rules didn't return.

import { boardHtml } from './board.js';
import { worldPath } from './rules.js';
import { duelHtml } from './duel-card.js';

export const WORDS = {
  zh: {
    title: '灵境', xw: '修为', ls: '灵石', tray: '今日功课', trayEmpty: '今日无事，随处走走。',
    play: '炼丹', done: '已完成', won: '丹成，待收', offered: '待做', quest: '人间功课',
    paid: '已记', due: '待做', seen: '已完成，待收', boardHint: '成对点选，八味灵草配齐即丹成。', boardDone: '丹成。',
    tamed: '随行', untamed: '未驯', rootTitle: '测灵根', mapTitle: '九州', goal: '鼎', here: '此处', inBag: '在囊中', buy: '买', sell: '卖', shelf: '货架',
    duelTitle: '降妖', duelHint: '每回合选一个灵根，相克者胜，三胜为降。', begin: '出手', round: '回合', rWon: '胜', rLost: '败', rDraw: '平', duelWon: '妖已降服。', duelLost: '败了，它退入雾中。', withdrawn: '它已隐入雾中，明日再来。', wonWait: '已胜，待收。',
    gateTitle: '下一鼎', opens: '开启于', tribTitle: '雷劫', omen: '今日卦象', yinyue: '银月',
    loading: '正在展开……', offline: '灵境还没醒来。',
    qi: '丹田', qiFull: '充盈', qiHalf: '半满', qiLow: '将尽', qiEmpty: '已空',
    emptyLine: '丹田已空，先去调息。灵气回满于 {t}。', emptySoon: '丹田已空，先去调息。灵气随时辰回满。',
    boardsStay: '炼丹不耗灵气。',
    signTitle: '入境先报名', signBody: '灵境记着你的修行，换台机器也接得上。', signBtn: '登录 linggen.dev',
    signWait: '等浏览器登录……', signFail: '还没登上。再试一次。',
  },
  en: {
    title: 'Lingjing', xw: 'Cultivation', ls: 'Spirit stones', tray: "Today's practice", trayEmpty: 'Nothing waits today. Wander a while.',
    play: 'Make the pill', done: 'Done', won: 'Pill made — to collect', offered: 'To do', quest: 'Real-life practice',
    paid: 'Counted', due: 'To do', boardHint: 'Tap pairs. When all eight herbs are paired, the pill is made.', boardDone: 'The pill is made.',
    tamed: 'Travels with you', untamed: 'Untamed', rootTitle: 'The root test', mapTitle: 'The Nine Provinces', goal: 'Cauldron', here: 'You', inBag: 'In your bag', buy: 'Buy', sell: 'Sell', shelf: 'The shelf',
    duelTitle: 'Subdue', duelHint: 'Each round pick a root; the one that overcomes wins the round; two rounds subdue it.', begin: 'Begin', round: 'Round', rWon: 'won', rLost: 'lost', rDraw: 'draw', duelWon: 'Subdued.', duelLost: 'Lost — it withdraws into the mist.', withdrawn: 'It has withdrawn into the mist; come back tomorrow.', wonWait: 'Won — to collect.',
    gateTitle: 'The next cauldron', opens: 'Opens', tribTitle: 'The heavenly tribulation', omen: "Today's omen", yinyue: 'Yinyue',
    loading: 'Unfolding…', offline: 'Lingjing has not woken yet.',
    qi: 'Dantian', qiFull: 'full', qiHalf: 'half', qiLow: 'low', qiEmpty: 'empty',
    emptyLine: 'Your dantian is empty — go and rest. Qi returns at {t}.', emptySoon: 'Your dantian is empty — go and rest. Qi returns with the hours.',
    boardsStay: 'Alchemy costs no qi.',
    signTitle: 'Sign in to enter', signBody: 'Lingjing keeps your game with your account — pick it up on any machine.', signBtn: 'Sign in to linggen.dev',
    signWait: 'Waiting for the browser…', signFail: 'Not signed in yet. Try again.',
  },
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pick = (pair, lang) => (pair ? pair[lang] ?? pair.zh : '');

const ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'];
const MAP = [['雍', '冀', '兖'], ['梁', '豫', '青'], ['荆', '扬', '徐']];

function creature(card, ctx) {
  const c = ctx.content.creatures.find((x) => x.id === card.id);
  if (!c) return '';
  const tamed = (ctx.look.cast || []).some((b) => b.id === c.id);
  return `<div class="card creature${tamed ? ' tamed' : ''}">
    <img class="illus" src="${esc(worldPath(ctx.look.world.id, c.art))}" alt="${esc(pick(c.name, ctx.lang))}">
    ${c.art_caption ? `<div class="artcap">${esc(pick(c.art_caption, ctx.lang))}</div>` : ''}
    <div class="crow"><div class="seal">${esc(c.name.zh)}</div><div>
      <div class="cardtitle">${esc(pick(c.name, ctx.lang))}</div>
      <div class="src">${esc(pick(c.source, ctx.lang))}</div>
      <q>${esc(pick(c.quote, ctx.lang))}</q>
      <span class="chip">${ctx.words[tamed ? 'tamed' : 'untamed']}</span>
    </div></div></div>`;
}

function traits(card, ctx) {
  const lit = new Set(ctx.look.traits?.ids || []);
  const els = ELEMENTS.map((id) => {
    const e = ctx.content.traits.elements[id];
    const small = ctx.lang === 'en' ? `<small>${esc(e.en)}</small>` : '';
    return `<div class="root ${id}${lit.has(id) ? ' lit' : ''}"><b>${esc(e.zh)}</b>${small}</div>`;
  });
  const result = ctx.look.traits ? `<div class="rootres">${esc(ctx.look.traits.name)}</div>` : '';
  return `<div class="card"><div class="cardtitle">${ctx.words.rootTitle}</div><div class="roots">${els.join('')}</div>${result}</div>`;
}

function map(card, ctx) {
  const name = (c) => (ctx.lang === 'en' ? ctx.content.dictionary.provinces[c]?.en : c);
  const cells = MAP.flat().map((c) => {
    const kind = c === card.goal ? 'goal' : c === card.here ? 'here' : '';
    const tag = kind ? `<small>${ctx.words[kind]}</small>` : '';
    return `<div class="prov${kind ? ` ${kind}` : ''}">${esc(name(c))}${tag}</div>`;
  });
  return `<div class="card"><div class="cardtitle">${ctx.words.mapTitle}</div><div class="map">${cells.join('')}</div>${placesHtml(ctx)}</div>`;
}

/// The province's places under the grid: here, a road away, or beyond the
/// player's tier — from Look, never decided here.
function placesHtml(ctx) {
  const place = ctx.look.place;
  if (!place?.places?.length) return '';
  const chips = place.places.map((p) => {
    const kind = p.here ? 'here' : p.road ? (p.too_hard ? 'far' : 'road') : p.too_hard ? 'far' : '';
    return `<span class="pl${kind ? ` ${kind}` : ''}">${esc(p.name)}</span>`;
  });
  return `<div class="placesTitle">${esc(place.province.name)}</div><div class="places">${chips.join('')}</div>`;
}

function hexagram(card, ctx) {
  const h = ctx.content.hexagrams.find((x) => String(x.id) === String(card.id)) || ctx.look.omen;
  if (!h) return '';
  // Lines are stored bottom to top; a hexagram is drawn top down.
  const bars = [...h.lines].reverse().map((y) => `<i class="${y ? 'yang' : 'yin'}"></i>`).join('');
  return `<div class="card hex"><div class="hexbars">${bars}</div><div>
    <div class="cardtitle">${ctx.words.omen} · ${esc(pick(h.name, ctx.lang) || h.name)}</div>
    <div class="hextext">${esc(pick(h.image, ctx.lang) || h.image)}</div></div></div>`;
}

function gate(card, ctx) {
  const opens = card.opens ? `<div class="small ling">${ctx.words.opens} ${esc(card.opens)}</div>` : '';
  return `<div class="card gate"><div class="ding">鼎</div><div><div class="cardtitle">${ctx.words.gateTitle}</div>${opens}</div></div>`;
}

function tribulation(card, ctx) {
  const bolts = [1, 2, 3].map((k) => `<i class="${k <= (card.strikes || 0) ? 'hit' : ''}"></i>`).join('');
  return `<div class="card trib"><div class="cardtitle">${ctx.words.tribTitle}</div><div class="bolts">${bolts}</div></div>`;
}

/// A board for a task already won or done is a made pill, never a fresh deal.
function board(card, ctx) {
  const task = (ctx.look.tasks || []).find((t) => t.id === card.id);
  const made = task && (task.status === 'done' || task.won);
  const body = made ? `<div class="dim small">${ctx.words.boardDone}</div>` : boardHtml(ctx.boardFor(card.id), ctx.words);
  return `<div class="card"><div class="cardtitle">${ctx.words.play}</div>${body}</div>`;
}

/// One item, or a shelf of them — words, prices and what is held come from
/// Look's place.shelf or bag; the page prices nothing.
function item(card, ctx) {
  const ids = card.ids ?? [card.id];
  const known = new Map((ctx.look.place?.shelf || []).map((i) => [i.id, i]));
  const world = ctx.look.world.id;
  const cells = ids.map((id) => {
    const i = known.get(id) ?? { id, name: id, kind: '', buy: null, sell: null, held: (ctx.look.bag || []).find((b) => b.id === id)?.n ?? 0 };
    const held = i.held ? `<span class="chip">${ctx.words.inBag} ×${i.held}</span>` : '';
    const price = i.buy != null ? `<div class="price"><span>${ctx.words.buy} ${i.buy}</span><span>${ctx.words.sell} ${i.sell}</span></div>` : '';
    const art = i.art ? `<img class="itemart" src="${esc(worldPath(world, i.art))}" alt="">` : '';
    return `<div class="item">${art}<div class="itemname">${esc(i.name)}</div>
      <div class="small dim">${esc(ctx.look.words?.[i.kind] ?? i.kind)}</div>${price}${held}</div>`;
  });
  const title = ids.length > 1 ? ctx.look.words?.shop ?? ctx.words.shelf : ctx.look.words?.item ?? ctx.words.shelf;
  return `<div class="card"><div class="cardtitle">${esc(title)}</div><div class="shelf">${cells.join('')}</div></div>`;
}

/// 降妖 on the scene: the exit's duel from Look, the bout from the page.
function duel(card, ctx) {
  const exit = (ctx.look.scene?.exits || []).find((e) => e.game?.id === card.id && e.game.kind === 'duel');
  if (!exit) return '';
  return duelHtml(exit, ctx.duelFor(card.id), ctx);
}

const RENDER = { creature, traits, map, hexagram, gate, tribulation, board, item, duel };

/// Only the kinds the scene knows; anything else Ling sends is dropped.
export function cardHtml(card, ctx) {
  const draw = RENDER[card?.card];
  return draw ? draw(card, ctx) : '';
}

/// Today's practice: the world's tasks, then what the player's apps report.
export function trayHtml(ctx) {
  const tasks = (ctx.look.tasks || []).map((t) => {
    const state = t.status === 'done' ? 'done' : t.won ? 'won' : 'offered';
    const act = state === 'offered' && t.kind === 'board'
      ? `<button class="act" data-play="${esc(t.id)}">${ctx.words.play}</button>` : '';
    return `<div class="card task ${state}"><div class="tasktitle">${esc(t.title)}</div>
      <div class="taskfoot"><span class="chip">${ctx.words[state]}</span>${act}</div></div>`;
  });
  const quests = (ctx.look.quests || []).map((q) => {
    const state = q.paid ? 'paid' : q.done ? 'seen' : 'due';
    return `<div class="card task ${{ paid: 'done', seen: 'won', due: '' }[state]}">
      <div class="tasktitle">${esc(q.title)}</div>
      <div class="taskfoot"><span class="chip real">${ctx.words.quest}</span><span class="chip">${ctx.words[state]}</span></div></div>`;
  });
  const all = [...tasks, ...quests];
  return all.length ? all.join('') : `<div class="dimline">${ctx.words.trayEmpty}</div>`;
}
