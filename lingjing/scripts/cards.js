// cards.js — the scene's cards. One renderer per kind Ling can Show; each
// draws only from authored content and the rules' Look, never from words the
// model wrote, so a card can't show a number the rules didn't return.

import { boardHtml } from './board.js';

export const WORDS = {
  zh: {
    title: '灵境', xw: '修为', ls: '灵石', tray: '今日功课', trayEmpty: '今日无事，随处走走。',
    play: '炼丹', done: '已完成', won: '丹成，待收', offered: '待做', quest: '人间功课',
    paid: '已记', due: '待做', boardHint: '成对点选，八味灵草配齐即丹成。', boardDone: '丹成。',
    tamed: '随行', untamed: '未驯', rootTitle: '测灵根', mapTitle: '九州', goal: '鼎', here: '此处',
    gateTitle: '下一鼎', opens: '开启于', tribTitle: '雷劫', omen: '今日卦象', yinyue: '银月',
    loading: '正在展开……', offline: '灵境还没醒来。',
  },
  en: {
    title: 'Lingjing', xw: 'Cultivation', ls: 'Spirit stones', tray: "Today's practice", trayEmpty: 'Nothing waits today. Wander a while.',
    play: 'Make the pill', done: 'Done', won: 'Pill made — to collect', offered: 'To do', quest: 'Real-life practice',
    paid: 'Counted', due: 'To do', boardHint: 'Tap pairs. When all eight herbs are paired, the pill is made.', boardDone: 'The pill is made.',
    tamed: 'Travels with you', untamed: 'Untamed', rootTitle: 'The root test', mapTitle: 'The Nine Provinces', goal: 'Cauldron', here: 'You',
    gateTitle: 'The next cauldron', opens: 'Opens', tribTitle: 'The heavenly tribulation', omen: "Today's omen", yinyue: 'Yinyue',
    loading: 'Unfolding…', offline: 'Lingjing has not woken yet.',
  },
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pick = (pair, lang) => (pair ? pair[lang] ?? pair.zh : '');

const ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'];
const MAP = [['雍', '冀', '兖'], ['梁', '豫', '青'], ['荆', '扬', '徐']];

function creature(card, ctx) {
  const c = ctx.content.creatures.find((x) => x.id === card.id);
  if (!c) return '';
  const tamed = (ctx.look.beasts || []).some((b) => b.id === c.id);
  return `<div class="card creature${tamed ? ' tamed' : ''}">
    <img class="illus" src="../content/${esc(c.art)}" alt="${esc(pick(c.name, ctx.lang))}">
    <div class="crow"><div class="seal">${esc(c.name.zh)}</div><div>
      <div class="cardtitle">${esc(pick(c.name, ctx.lang))}</div>
      <div class="src">${esc(pick(c.source, ctx.lang))}</div>
      <q>${esc(pick(c.quote, ctx.lang))}</q>
      <span class="chip">${ctx.words[tamed ? 'tamed' : 'untamed']}</span>
    </div></div></div>`;
}

function root(card, ctx) {
  const lit = new Set(ctx.look.root?.ids || []);
  const els = ELEMENTS.map((id) => {
    const e = ctx.content.roots.elements[id];
    const small = ctx.lang === 'en' ? `<small>${esc(e.en)}</small>` : '';
    return `<div class="root ${id}${lit.has(id) ? ' lit' : ''}"><b>${esc(e.zh)}</b>${small}</div>`;
  });
  const result = ctx.look.root ? `<div class="rootres">${esc(ctx.look.root.name)}</div>` : '';
  return `<div class="card"><div class="cardtitle">${ctx.words.rootTitle}</div><div class="roots">${els.join('')}</div>${result}</div>`;
}

function map(card, ctx) {
  const name = (c) => (ctx.lang === 'en' ? ctx.content.terms.provinces[c]?.en : c);
  const cells = MAP.flat().map((c) => {
    const kind = c === card.goal ? 'goal' : c === card.here ? 'here' : '';
    const tag = kind ? `<small>${ctx.words[kind]}</small>` : '';
    return `<div class="prov${kind ? ` ${kind}` : ''}">${esc(name(c))}${tag}</div>`;
  });
  return `<div class="card"><div class="cardtitle">${ctx.words.mapTitle}</div><div class="map">${cells.join('')}</div></div>`;
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

const RENDER = { creature, root, map, hexagram, gate, tribulation, board };

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
  const quests = (ctx.look.quests || []).map((q) => `<div class="card task${q.paid ? ' done' : ''}">
      <div class="tasktitle">${esc(q.title)}</div>
      <div class="taskfoot"><span class="chip real">${ctx.words.quest}</span><span class="chip">${ctx.words[q.paid ? 'paid' : 'due']}</span></div></div>`);
  const all = [...tasks, ...quests];
  return all.length ? all.join('') : `<div class="dimline">${ctx.words.trayEmpty}</div>`;
}
