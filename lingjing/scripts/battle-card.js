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

import { esc, spoken } from './cards.js';

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
    pickCard: '点一个目标 —— 妖，或它阵前的一个', pickTarget: '再点它要打谁 —— 妖，或它阵前的一个',
    begin: '出 手', wonToday: '今日已降', lostToday: '它退入雾中，明日再来', spentToday: '它今日力竭遁走了',
    stale: '牌面没读全 —— 刷新页面再出手。',
    lean: { hide: '厚皮', ward: '避法', quick: '迅捷', fierce: '凶猛' },
    ready: '可出手', nothing: '这一回合没别的可做了 —— 点「结束回合」', how: '怎么玩', close: '知道了',
    help: [
      ['目标', '把妖的气血打到 0。'],
      ['灵力', '每回合长一格，回合开始回满。牌左上角那个数就是它的价钱。开局 2 格，上限随境界（练气 6 · 筑基 8 · 结丹 10）。'],
      ['手牌', '开局 3 张，外加银月（她不占牌库）。每回合开始自动抽 1 张。牌库 10 张 —— 抽空之后每抽一次反噬掉 1、2、3… 点气血。'],
      ['打牌', '点一张牌就打出：随从落到你的阵前（最多 4 位），功法当场生效。需要目标的牌，点完牌再点目标 —— 妖，或它阵前的一个。'],
      ['随从', '落场那一回合不能动。下一回合起，点它、再点它要打的，就是出手；互殴两边都受伤。'],
      ['护主', '它阵前站着护主时，先打护主 —— 打不到它本人。'],
      ['主灵根一击', '每回合一次，费 2 灵力，打出你主灵根那一行。手里没牌时它是你的底。'],
      ['五行', '你的行克它 → 伤害多五成；被它克 → 少四分之一。金克木 · 木克土 · 土克水 · 水克火 · 火克金。'],
      ['怎么算赢', '打光它的气血就赢。它十二张牌抽完会力竭遁走 —— 不胜不败，也没有奖励，所以拖着不打没用。'],
      ['没有死', '随从被打到 0 是退下，不是死。这个世界里没有死。'],
    ],
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
    pickCard: 'choose a target — the beast, or one of its rank', pickTarget: 'now choose what it strikes',
    begin: 'Begin', wonToday: 'subdued today', lostToday: 'it withdrew — come back tomorrow', spentToday: 'it walked away spent today',
    stale: 'The cards did not load — refresh, then begin.',
    lean: { hide: 'thick-hided', ward: 'warded', quick: 'quick', fierce: 'fierce' },
    ready: 'ready', nothing: 'nothing else this turn — press End turn', how: 'How to play', close: 'Got it',
    help: [
      ['The point', "Take the beast's Life to zero."],
      ['Force', 'One more crystal each round, refilled at the start of it. The number on a card is its price. Two to begin with; the cap rises with your realm (6 · 8 · 10).'],
      ['Your hand', 'Three cards to start, plus Yinyue, who is not one of your ten. One card drawn at the start of every round. Ten in the deck — once it is dry, each draw costs 1, then 2, then 3 Life.'],
      ['Playing', 'Click a card to play it: a minion joins your rank (four stand at most), an art takes effect at once. A card that wants a target: click it, then click the beast or one of its rank.'],
      ['Minions', 'A minion cannot strike the turn it arrives. After that, click it, then click what it strikes — and both take the blow.'],
      ['Guard', 'While a Guard stands in its rank, strike the Guard: the beast itself is out of reach.'],
      ['Root Strike', "Once a round, two Force, in your own root. It is what you have when your hand has nothing."],
      ['The five roots', 'Your root over its root lands half again as hard; under it, a quarter lighter. Metal over Wood · Wood over Earth · Earth over Water · Water over Fire · Fire over Metal.'],
      ['Winning', 'Take all its Life. If its twelve cards run out first it withdraws — neither won nor lost, and nothing is paid, so waiting it out gains nothing.'],
      ['No death', 'A body at zero is driven off, not killed. Nothing dies in this world.'],
    ],
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

/* Where the held thing may land: the beast, or these of its rank. Straight
   from `offers`, so the glow can never disagree with the rules. */
function aimable(offers, picked) {
  const out = { hero: false, theirs: new Set(), mine: new Set() };
  if (!picked) return out;
  for (const o of offers) {
    if (!o.ok) continue;
    const a = o.action;
    const matches = (picked.from === 'hand' && a.kind === 'play' && a.index === picked.index)
      || (picked.from === 'board' && a.kind === 'attack' && a.index === picked.index)
      || (picked.from === 'power' && a.kind === 'power');
    if (!matches) continue;
    if (!a.target) out.hero = true;
    else if (picked.from === 'hand' && !a.target.enemy && o.card?.effect?.buff) out.mine.add(a.target.index);
    else out.theirs.add(a.target.index);
  }
  return out;
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

/* The deck as a thing you can see: a stack whose thickness is what is left in
   it, with the count on top. Without it "牌库 7" is a number nobody reads, and
   the fatigue that ends a fight arrives out of nowhere. */
function deckHtml(n, side, w) {
  const layers = Math.max(0, Math.min(5, Math.ceil(n / 2)));
  return `<div class="bdeck ${side}${n ? '' : ' dry'}" data-deck="${side}">
    ${Array.from({ length: layers }, (_, i) => `<i style="transform: translate(${i * -1.4}px, ${i * -1.6}px)"></i>`).join('')}
    <b>${n}</b><small>${w.deck}</small>
  </div>`;
}

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
  const marks = [
    m.taunt ? w.taunt : null,
    side === 'mine' && why ? (w.why[why] ?? why) : null,
    side === 'mine' && !why && m.ready ? w.ready : null,
  ].filter(Boolean);
  const can = side === 'mine' && !why && m.ready;
  const aimed = side === 'theirs' ? ctx.aim?.theirs?.has(index) : ctx.aim?.mine?.has(index);
  const pic = artOf(ctx.catalog?.[m.id], ctx);
  // A body on the rank is a little card of its own: its picture on top, its
  // name under it, and 攻 / 血 in the two bottom corners where a card player's
  // eye already looks. A 22px strip of a painting is a smudge, not a picture
  // (his, 2026-09-18: 放到阵前, 图片看不到了).
  return `<button class="bminion ${side}${held ? ' held' : ''}${m.taunt ? ' taunt' : ''}${can ? ' can' : ''}${aimed ? ' aimed' : ''}" data-spot="${side === 'mine' ? 'mine' : 'theirs'}" data-index="${index}" data-id="${esc(m.id)}">
    <span class="bface-wrap">
      ${pic ? `<img class="bpic small" src="${esc(pic)}" alt="" loading="lazy">` : '<span class="bpic small none"></span>'}
      <span class="bglyph">${GLYPH[m.element] ?? ''}</span>
    </span>
    <span class="bname">${name(m, ctx.lang)}</span>
    <span class="batk">${m.atk}</span><span class="bhp">${m.hp}</span>
    ${marks.length ? `<small>${marks.map(esc).join(' · ')}</small>` : ''}
  </button>`;
}

/* A card's picture. The 山海经 creatures keep their classical plates; the rest
   were painted for us (worlds/<id>/art/cards). A card without one still reads
   — the name and the line under it carry it — so the picture is a gift, never
   a requirement. */
const artOf = (c, ctx) => (c?.art ? `${ctx.artBase ?? ''}${c.art}` : null);

function handHtml(st, ctx, picked) {
  const w = ctx.words;
  return st.you.hand.map((id, index) => {
    const c = ctx.catalog[id];
    if (!c) return '';
    const o = ctx.reasons.get(`hand:${index}`);
    const why = o?.why;
    const held = picked?.from === 'hand' && picked.index === index;
    const body = c.kind === 'minion' ? `<span class="bstat"><b>${c.atk}</b> / <b>${c.hp}</b></span>` : '';
    return `<button class="bcard${held ? ' held' : ''}${why ? ' dim' : ''}${!why && !held ? ' can' : ''}" data-spot="hand" data-index="${index}" data-id="${esc(id)}">
      <span class="bcost">${c.cost}</span>
      ${artOf(c, ctx) ? `<img class="bpic" src="${esc(artOf(c, ctx))}" alt="" loading="lazy">` : ''}
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

/* Before the fight: the beast on the scene, and the one way in. The duel card
   the v2 bout drew is gone with it — what a player needs here is who they are
   about to fight, not the arithmetic of it. Under the way in stands whatever
   stopped the last 出手: that line had nowhere to be drawn until 2026-09-18,
   so a refused start (no 体力, the beast already spent) set words the page
   never showed and the button simply did nothing. Once the day's outcome is on
   the card it says it all, so the line steps aside (台上不重复). */
export function challengeHtml(brief, ctx) {
  const w = ctx.words, c = brief.creature;
  const today = brief.today?.outcome;
  const done = today === 'won' ? w.wonToday : today === 'lost' ? w.lostToday : today === 'withdrew' ? w.spentToday : null;
  return `<div class="card challenge">
    <div class="cardtitle">${esc(ctx.title ?? '')}</div>
    <div class="chead">
      ${c.art ? `<img class="cface" src="${esc(ctx.artBase ?? '')}${esc(c.art)}" alt="">` : ''}
      <div>
        <div class="cname">${spoken(c.name, c.pinyin)} <span class="belem">${GLYPH[c.root] ?? ''}${ctx.lang === 'en' ? ` ${esc(c.root_name ?? '')}` : ''}</span></div>
        ${c.lean ? `<div class="clean">${esc(w.lean?.[c.lean] ?? c.lean)}</div>` : ''}
        ${c.about ? `<p class="cabout">${esc(c.about)}</p>` : ''}
      </div>
    </div>
    ${done ? `<div class="cdone">${esc(done)}</div>` : `<button class="bact end" data-duel-start="${esc(brief.id)}">${w.begin}</button>`}
    ${!done && ctx.say ? `<div class="cdone">${esc(ctx.say)}</div>` : ''}
  </div>`;
}

/* ── The whole screen ── */

/* `st` is `view(state)`, `offers` is `offers(state)`, `ctx` carries the
   catalog, the language and the words. `picked` is what the player is holding. */
export function battleHtml(st, offers, ctx, picked = null, openLog = false, note = null, help = false) {
  const w = ctx.words;
  ctx.reasons = reasons(st, offers);
  const aim = aimable(offers, picked);
  ctx.aim = aim;
  const rank = (side, board, n) => {
    const cells = [];
    for (let i = 0; i < n; i += 1) {
      cells.push(board[i] ? minionHtml(board[i], side, i, ctx, picked) : `<div class="bminion empty">${w.empty}</div>`);
    }
    return cells.join('');
  };
  const powerWhy = ctx.reasons.get('power')?.why;
  // What is there to do? If the only move left is to end the turn, SAY SO: he
  // sat on a turn with an empty purse and read it as the beast being stuck
  // (2026-09-18, "我打不了, 雷神不动").
  const canDo = offers.filter(o => o.ok && o.action.kind !== 'end');
  const stuck = st.outcome === 'open' && st.whose === 'you' && !canDo.length;
  const advice = picked ? (picked.from === 'board' ? w.pickTarget : w.pickCard) : stuck ? w.nothing : null;
  const over = st.outcome !== 'open';
  const said = st.outcome === 'won' ? w.wonSay : st.outcome === 'lost' ? w.lostSay : st.outcome === 'withdrew' ? w.withdrewSay : '';
  const title = st.outcome === 'won' ? w.won : st.outcome === 'lost' ? w.lost : st.outcome === 'withdrew' ? w.withdrew : '';
  return `<div class="battle${over ? ' over' : ''}">
    <div class="btop">
      <button class="bquit" data-spot="quit">${w.quit}</button>
      <button class="bhelpbtn${help ? ' on' : ''}" data-spot="help" title="${w.how}" aria-label="${w.how}">?</button>
      <span class="bturn ${st.whose}">${st.whose === 'you' ? (ctx.lang === 'en' ? 'Your turn' : '你的回合') : `${esc(ctx.foeName ?? '')}${ctx.lang === 'en' ? "'s turn" : '的回合'}`}</span>
      <span class="bwhere">${esc(ctx.title ?? '')}</span>
    </div>

    <button class="bside foe${picked ? ' aiming' : ''}${aim.hero ? ' aimed' : ''}" data-spot="hero">
      ${ctx.foeArt ? `<img class="bface" src="${esc(ctx.foeArt)}" alt="">` : ''}
      <div class="bwho">${esc(ctx.foeName ?? '')} <span class="belem">${GLYPH[st.foe.root] ?? ''}</span></div>
      <div class="bnums">
        ${pool(w.hp, st.foe.hp, st.foe.hpMax, 'hp')}
        ${crystals(st.foe.mana, st.foe.manaMax, st.foe.manaCap)}
      </div>
      ${deckHtml(st.foe.deck, 'theirs', w)}
    </button>

    ${lastHtml(st.log, ctx, openLog)}

    <div class="brank theirs"><span class="blab">${w.theirs}</span>${rank('theirs', st.foe.board, ctx.board)}</div>
    <div class="brank mine"><span class="blab">${w.yours}</span>${rank('mine', st.you.board, ctx.board)}</div>

    <div class="bside you">
      <div class="bwho">${esc(ctx.youName ?? '')} <span class="belem">${GLYPH[st.you.root] ?? ''}</span></div>
      <div class="bnums">
        ${pool(w.hp, st.you.hp, st.you.hpMax, 'hp')}
        ${crystals(st.you.mana, st.you.manaMax, st.you.manaCap)}
      </div>
      ${deckHtml(st.you.deck, 'mine', w)}
    </div>

    <div class="bhand">${handHtml(st, ctx, picked)}</div>

    <div class="bacts">
      <button class="bact${powerWhy ? ' dim' : ''}${picked?.from === 'power' ? ' held' : ''}${!powerWhy && picked?.from !== 'power' ? ' can' : ''}" data-spot="power">
        ${w.power} <span class="belem">${GLYPH[st.you.root] ?? ''}</span>
        <small>${powerWhy ? esc(w.why[powerWhy] ?? powerWhy) : `${st.you.powerHit} · ${2}${ctx.lang === 'en' ? ' ' : ''}${w.mana}`}</small>
      </button>
      <button class="bact end${stuck ? ' urge' : ''}" data-spot="end">${w.end}</button>
    </div>

    ${note ? `<div class="bhint bno">${esc(w.why[note] ?? note)}</div>` : ''}
    ${advice ? `<div class="bhint${stuck ? ' burge' : ''}">${esc(advice)}</div>` : ''}
    ${help ? `<div class="bhelp" data-spot="help-bg"><div class="bsheet">
      <h3>${w.how}</h3>
      ${w.help.map(([k, v]) => `<p><b>${esc(k)}</b>${esc(v)}</p>`).join('')}
      <button class="bact" data-spot="help">${w.close}</button>
    </div></div>` : ''}
    ${over ? `<div class="bover"><b>${title}</b><span>${said}</span></div>` : ''}
  </div>`;
}
