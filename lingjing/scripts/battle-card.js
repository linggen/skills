// battle-card.js — 斗法 v3 的卡面. The whole fight on one screen: the beast
// above, the two ranks of 阵前 between, you below with your hand and your
// 灵力. Nothing here decides anything — it draws `view(st)` and `offers(st)`
// from battle.js, so a button that cannot be pressed is greyed WITH ITS REASON
// written on it, and a button that can be pressed is one the rules already
// agreed to (the hover-only why, 2026-09-17, is a bug we do not repeat).
//
// The page keeps one small thing of its own: what the player has picked up —
// a card in hand waiting for a target, or a minion of theirs waiting to be
// pointed at something. `pickOf` turns a click into an action or into that
// waiting state; it never touches the fight.

import { esc } from './cards.js';

const GLYPH = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };

export const WORDS = {
  zh: {
    hp: '气血', mana: '灵力', deck: '牌库', hand: '手牌', power: '主灵根一击', end: '结束回合',
    yours: '你的阵前', theirs: '它的阵前', empty: '空', taunt: '护主', arriving: '刚到',
    struck: '已出手', quit: '认输', won: '胜', lost: '败', withdrew: '它力竭遁走',
    wonSay: '它退入雾中。', lostSay: '你退了半里地，它没有追。', withdrewSay: '它一口气用尽，转身走了 —— 这一场不算你赢。',
    why: {
      'no-mana': '灵力不够', 'board-full': '阵前满了', 'not-your-turn': '还没轮到你',
      'power-used': '这一回合用过了', taunt: '先过护主', 'just-arrived': '刚到，这一回合不能动',
      'already-struck': '这一回合出过手了', 'no-attack': '它不会攻击', 'no-target': '没有可指的',
      'no-friendly': '自己阵前没有人', 'fight-over': '打完了',
    },
    pickCard: '点一个目标', pickTarget: '点它要打谁',
  },
  en: {
    hp: 'Life', mana: 'Force', deck: 'Deck', hand: 'Hand', power: 'Root Strike', end: 'End turn',
    yours: 'Your rank', theirs: 'Its rank', empty: 'empty', taunt: 'Guard', arriving: 'just arrived',
    struck: 'has struck', quit: 'Yield', won: 'Won', lost: 'Lost', withdrew: 'It withdrew',
    wonSay: 'It backs into the mist.', lostSay: 'You give ground; it does not follow.', withdrewSay: 'Its breath runs out and it turns away — this one does not count as a win.',
    why: {
      'no-mana': 'not enough Force', 'board-full': 'the rank is full', 'not-your-turn': 'not your turn',
      'power-used': 'used this turn', taunt: 'a Guard stands in the way', 'just-arrived': 'just arrived',
      'already-struck': 'has struck this turn', 'no-attack': 'it does not strike', 'no-target': 'nothing to point at',
      'no-friendly': 'no one of yours stands', 'fight-over': 'the fight is over',
    },
    pickCard: 'choose a target', pickTarget: 'choose what it strikes',
  },
};

const name = (c, lang) => esc(typeof c?.name === 'string' ? c.name : c?.name?.[lang] ?? c?.name?.zh ?? '');

/* ── What a click means ── */

/* Does this card want to be pointed somewhere? Only two kinds do: one that
   hurts (you may want its damage on a body rather than the beast) and one that
   lifts a friend. Everything else lands the moment it is clicked — a minion
   that asks "where?" when there is nothing to ask about is a click wasted, and
   in a fight of six turns every click is felt (seen in the browser, 2026-09-18). */
export function wantsTarget(card, st) {
  if (!card) return false;
  if (card.effect?.buff) return st.you.board.length > 0;
  if (card.effect?.damage != null) return st.foe.board.length > 0;
  return false;
}

/* A click is a place, not an action: `{ kind: 'hand'|'mine'|'theirs'|'power'|
   'hero'|'end'|'quit', index }`. With something already picked up, the second
   click completes it. Returns `{ action }` to play, `{ pick }` to hold, or
   `{ clear: true }`. */
export function pickOf(picked, spot, st, catalog = null) {
  if (spot.kind === 'end') return { action: { kind: 'end' } };
  if (spot.kind === 'quit') return { quit: true };
  if (!picked) {
    if (spot.kind === 'hand') {
      const card = catalog?.[st.you.hand[spot.index]];
      return wantsTarget(card, st) ? { pick: { from: 'hand', index: spot.index } } : { action: { kind: 'play', index: spot.index } };
    }
    if (spot.kind === 'mine') return { pick: { from: 'board', index: spot.index } };
    if (spot.kind === 'power') return st.foe.board.length ? { pick: { from: 'power' } } : { action: { kind: 'power' } };
    return { clear: true };
  }
  // Something is in hand — the second click says where it goes.
  const target = spot.kind === 'theirs' ? { kind: 'minion', index: spot.index }
    : spot.kind === 'mine' && picked.from !== 'board' ? { kind: 'minion', index: spot.index }
      : undefined;
  if (picked.from === 'hand') return { action: { kind: 'play', index: picked.index, target } };
  if (picked.from === 'power') return { action: { kind: 'power', target } };
  if (picked.from === 'board') {
    if (spot.kind === 'theirs' || spot.kind === 'hero') return { action: { kind: 'attack', index: picked.index, target } };
    return { clear: true };
  }
  return { clear: true };
}

/* Every offer the rules allow, keyed by what it is, so the card can grey a
   thing WITH ITS REASON instead of hiding it. */
function reasons(st, offers) {
  const best = new Map();
  for (const o of offers) {
    const key = o.action.kind === 'play' ? `hand:${o.action.index}`
      : o.action.kind === 'attack' ? `mine:${o.action.index}`
        : o.action.kind === 'power' ? 'power' : 'end';
    const had = best.get(key);
    if (!had || (o.ok && !had.ok)) best.set(key, o);
  }
  return best;
}

/* ── The pieces ── */

const pool = (label, now, max, cls) => `<div class="bpool"><span>${label}</span><div class="bbar ${cls}"><i style="width:${Math.max(0, Math.round((now / Math.max(1, max)) * 100))}%"></i></div><b>${now}</b></div>`;

const crystals = (now, max, cap) => {
  const dots = [];
  for (let i = 0; i < cap; i += 1) dots.push(`<i class="${i < now ? 'full' : i < max ? 'spent' : 'none'}"></i>`);
  return `<div class="bmana">${dots.join('')}<b>${now}/${max}</b></div>`;
};

function minionHtml(m, side, index, ctx, picked) {
  const w = ctx.words;
  const why = side === 'mine' ? ctx.reasons.get(`mine:${index}`)?.why : null;
  const held = picked?.from === 'board' && picked.index === index && side === 'mine';
  const marks = [m.taunt ? w.taunt : null, side === 'mine' && why ? (w.why[why] ?? why) : null].filter(Boolean);
  return `<button class="bminion ${side}${held ? ' held' : ''}${m.taunt ? ' taunt' : ''}" data-spot="${side === 'mine' ? 'mine' : 'theirs'}" data-index="${index}">
    <span class="bname">${name(m, ctx.lang)}</span>
    <span class="belem">${GLYPH[m.element] ?? ''}${ctx.lang === 'en' && m.element ? ` ${esc(ctx.elName?.(m.element) ?? '')}` : ''}</span>
    <span class="bstat"><b>${m.atk}</b> / <b>${m.hp}</b></span>
    ${marks.length ? `<small>${marks.map(esc).join(' · ')}</small>` : ''}
  </button>`;
}

function handHtml(st, ctx, picked) {
  const w = ctx.words;
  return st.you.hand.map((id, index) => {
    const c = ctx.catalog[id];
    if (!c) return '';
    const o = ctx.reasons.get(`hand:${index}`);
    const why = o?.why;
    const held = picked?.from === 'hand' && picked.index === index;
    const body = c.kind === 'minion' ? `<span class="bstat"><b>${c.atk}</b> / <b>${c.hp}</b></span>` : '';
    return `<button class="bcard${held ? ' held' : ''}${why ? ' dim' : ''}" data-spot="hand" data-index="${index}">
      <span class="bcost">${c.cost}</span>
      <span class="bname">${name(c, ctx.lang)}</span>
      <span class="belem">${GLYPH[c.element] ?? ''}</span>
      <small class="btext">${esc(sayEffect(c, ctx))}</small>
      ${body}
      ${why ? `<small class="bwhy">${esc(w.why[why] ?? why)}</small>` : ''}
    </button>`;
  }).join('');
}

/* What a card does, in words, on the card — never in a tooltip. */
export function sayEffect(c, ctx) {
  const zh = ctx.lang !== 'en';
  const e = c.effect ?? {};
  const bits = [];
  if (e.damage != null) bits.push(zh ? `打 ${e.damage} 点` : `${e.damage} damage`);
  if (e.sweep != null) bits.push(zh ? `它阵前每个 ${e.sweep} 点` : `${e.sweep} to each of its rank`);
  if (e.heal != null) bits.push(zh ? `回 ${e.heal} 气血` : `heal ${e.heal}`);
  if (e.draw != null) bits.push(zh ? `抽 ${e.draw} 张` : `draw ${e.draw}`);
  if (e.buff) bits.push(zh ? `一个 +${e.buff.atk ?? 0}/+${e.buff.hp ?? 0}` : `one of yours +${e.buff.atk ?? 0}/+${e.buff.hp ?? 0}`);
  if (e.rally) bits.push(zh ? `全体 +${e.rally.atk ?? 0}/+${e.rally.hp ?? 0}` : `all of yours +${e.rally.atk ?? 0}/+${e.rally.hp ?? 0}`);
  if (e.summon) bits.push(zh ? `召来 ${e.summon.n ?? 1} 个` : `summon ${e.summon.n ?? 1}`);
  const key = c.keywords?.includes('taunt') ? (zh ? '护主' : 'Guard') : null;
  const cry = c.keywords?.includes('battlecry') ? (zh ? '入阵：' : 'On arrival: ') : '';
  return [key, cry + bits.join('，')].filter(x => x && x.trim()).join(' · ');
}

/* ── 上一手 — what just happened, in words ──
   The creature answers the moment you end your turn, so without this the
   player watches their own minion vanish with no account of it (seen in the
   browser, 2026-09-18: 衔石 was driven off by a 青藤缚 the card never named).
   Only the last exchange is shown; the rest is behind 展开, as decided the
   same morning for the old bout card. */

function sayTurn(t, ctx) {
  const w = ctx.words, zh = ctx.lang !== 'en';
  const who = t.who === 'foe' ? (ctx.foeName ?? '') : (zh ? '你' : 'You');
  const card = id => name(ctx.catalog?.[id], ctx.lang) || id;
  switch (t.act) {
    case 'played': return `${who} ${zh ? '出' : 'plays'} ${card(t.id)}`;
    case 'summoned': return `${who} ${zh ? '召来' : 'summons'} ${card(t.id)}`;
    case 'power': return `${who} ${w.power}`;
    case 'hurt': return t.kind === 'fatigue'
      ? `${who} ${zh ? `反噬 −${t.amount}` : `fatigue −${t.amount}`}`
      : `${who} −${t.amount}`;
    case 'hurt-minion': return `${card(t.id)} −${t.amount}`;
    case 'withdrew': return `${card(t.id)} ${zh ? '退下' : 'withdraws'}`;
    case 'heal': return `${who} +${t.amount}`;
    case 'rally': return `${who} ${zh ? `全体 +${t.atk ?? 0}/+${t.hp ?? 0}` : `all +${t.atk ?? 0}/+${t.hp ?? 0}`}`;
    case 'buff': return `${card(t.id)} +${t.atk ?? 0}/+${t.hp ?? 0}`;
    case 'foe-withdrew': return w.withdrew;
    default: return '';
  }
}

export function lastHtml(log, ctx, open = false) {
  const w = ctx.words;
  const lines = (log ?? []).map(t => sayTurn(t, ctx)).filter(Boolean);
  if (!lines.length) return '';
  const shown = open ? lines : lines.slice(-4);
  const more = lines.length - shown.length;
  return `<div class="blast">
    <span class="blab">${ctx.lang === 'en' ? 'Just now' : '上一手'}</span>
    ${shown.map(l => `<span class="bline">${esc(l)}</span>`).join('')}
    ${more > 0 ? `<button class="bmore" data-spot="more">${ctx.lang === 'en' ? `all ${lines.length}` : `展开 ${lines.length} 手`}</button>` : ''}
  </div>`;
}

/* ── The whole screen ── */

/* `st` is `view(state)`, `offers` is `offers(state)`, `ctx` carries the
   catalog, the language and the words. `picked` is what the player is holding. */
export function battleHtml(st, offers, ctx, picked = null, openLog = false) {
  const w = ctx.words;
  ctx.reasons = reasons(st, offers);
  const rank = (side, board, n) => {
    const cells = [];
    for (let i = 0; i < n; i += 1) {
      cells.push(board[i] ? minionHtml(board[i], side, i, ctx, picked) : `<div class="bminion empty">${w.empty}</div>`);
    }
    return cells.join('');
  };
  const powerWhy = ctx.reasons.get('power')?.why;
  const over = st.outcome !== 'open';
  const said = st.outcome === 'won' ? w.wonSay : st.outcome === 'lost' ? w.lostSay : st.outcome === 'withdrew' ? w.withdrewSay : '';
  const title = st.outcome === 'won' ? w.won : st.outcome === 'lost' ? w.lost : st.outcome === 'withdrew' ? w.withdrew : '';
  return `<div class="battle${over ? ' over' : ''}">
    <div class="btop">
      <button class="bquit" data-spot="quit">${w.quit}</button>
      <span class="bwhere">${esc(ctx.title ?? '')}</span>
    </div>

    <div class="bside foe" data-spot="hero">
      <div class="bwho">${esc(ctx.foeName ?? '')} <span class="belem">${GLYPH[st.foe.root] ?? ''}</span></div>
      ${pool(w.hp, st.foe.hp, st.foe.hpMax, 'hp')}
      ${crystals(st.foe.mana, st.foe.manaMax, st.foe.manaCap)}
      <div class="bcount">${w.deck} ${st.foe.deck}</div>
    </div>

    ${lastHtml(st.log, ctx, openLog)}

    <div class="brank theirs"><span class="blab">${w.theirs}</span>${rank('theirs', st.foe.board, ctx.board)}</div>
    <div class="brank mine"><span class="blab">${w.yours}</span>${rank('mine', st.you.board, ctx.board)}</div>

    <div class="bside you">
      <div class="bwho">${esc(ctx.youName ?? '')} <span class="belem">${GLYPH[st.you.root] ?? ''}</span></div>
      ${pool(w.hp, st.you.hp, st.you.hpMax, 'hp')}
      ${crystals(st.you.mana, st.you.manaMax, st.you.manaCap)}
      <div class="bcount">${w.deck} ${st.you.deck}</div>
    </div>

    <div class="bhand">${handHtml(st, ctx, picked)}</div>

    <div class="bacts">
      <button class="bact${powerWhy ? ' dim' : ''}${picked?.from === 'power' ? ' held' : ''}" data-spot="power">
        ${w.power} <span class="belem">${GLYPH[st.you.root] ?? ''}</span>
        <small>${powerWhy ? esc(w.why[powerWhy] ?? powerWhy) : `${st.you.powerHit} · ${2}${ctx.lang === 'en' ? ' ' : ''}${w.mana}`}</small>
      </button>
      <button class="bact end" data-spot="end">${w.end}</button>
    </div>

    ${picked ? `<div class="bhint">${picked.from === 'board' ? w.pickTarget : w.pickCard}</div>` : ''}
    ${over ? `<div class="bover"><b>${title}</b><span>${said}</span></div>` : ''}
  </div>`;
}
