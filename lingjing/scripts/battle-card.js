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

import { spoken } from './cards.js';
import { esc } from './esc.js';
import { freshHtml, partyHtml, sealHtml } from './battle-party.js';
import { pillTrayHtml, pouchPickHtml } from './danang.js';
import { POWER_COST, asleep, bodyOf, boostedOf, clash, costOf, dealt, effectOf, hashOf, keywordsOf, landed, pierces, sigEffect, starsOf } from './battle.js';

const GLYPH = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
const EN_EL = { metal: 'metal', wood: 'wood', water: 'water', fire: 'fire', earth: 'earth' };

/* 相克 in words, only when it bites: 「木克土」 when the blow overcomes, the
   other way round when it is overcome. The page does the 五行 so the player
   never has to (his, 2026-09-22: 让页面算). */
function clashWord(element, target, lang) {
  const c = clash(element, target);
  if (c === 1) return '';
  const [a, b] = c > 1 ? [element, target] : [target, element];
  return lang === 'en' ? `${EN_EL[a]} over ${EN_EL[b]}` : `${GLYPH[a]}克${GLYPH[b]}`;
}

/* What the held thing would take off a target, as a badge on it. */
function dmgBadge(st, n, element, target, lang, hero = false) {
  if (n == null) return '';
  // A blow at a sleeper that glances (battle.js § asleep) says so on its badge.
  const glance = hero && asleep(st.foe) && !pierces(st.foe, element);
  const word = glance ? (lang === 'en' ? 'glances' : '擦过') : clashWord(element, target, lang);
  const down = glance || clash(element, target) < 1;
  const hits = hero ? landed(st, 'you', n, element) : dealt(st, 'you', n, element, target);
  return `<span class="bdmg${down ? ' down' : word ? ' up' : ''}">−${hits}${word ? ` · ${word}` : ''}</span>`;
}

/* The striker the player holds: its blow and its element, or null. */
function strikerOf(st, picked, ctx) {
  if (!picked) return null;
  if (picked.from === 'power') return { n: st.you.powerHit, element: st.you.root };
  if (picked.from === 'board') { const m = st.you.board[picked.index]; return m ? { n: m.atk, element: m.element } : null; }
  const c = ctx.catalog?.[st.you.hand[picked.index]];
  const e = c ? effectOf(st.you, c) : null;
  return e?.damage != null ? { n: e.damage, element: c.element } : null;
}

/* The foe's pronouns in the card words: 它 for a beast; a person's 他/她 in a
   bout (boutWords). A card drawn outside a fight reads 它. */
const pro = (ctx) => {
  const w = ctx.words ?? {}, zh = ctx.lang !== 'en';
  return { it: w.it ?? (zh ? '它' : 'it'), its: w.its ?? (zh ? '它' : 'its'), itObj: w.itObj ?? (zh ? '它' : 'it') };
};
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/* A bout with a PERSON (the 大比's three; the duel brief's `person`): every word
   that calls the foe 妖 or 它 said of him or her instead — 比试, 认输, 「今日已比过」,
   「他退了下去」 (his, 2026-09-29). `{ta}` … is the person's pronoun by gender, 对方
   (they) when the gender is unsaid. */
const PRONOUN = {
  zh: { male: { ta: '他' }, female: { ta: '她' }, none: { ta: '对方' } },
  en: { male: { it: 'he', its: 'his', itObj: 'him' }, female: { it: 'she', its: 'her', itObj: 'her' }, none: { it: 'they', its: 'their', itObj: 'them' } },
};
export const PERSON_WORDS = {
  zh: {
    theirs: '{ta}的阵前', withdrew: '{ta}力竭认输', wonSay: '{ta}退了下去。', lostSay: '你认了输，退下台来。', withdrewSay: '{ta}一口气用尽，拱手认输 —— 这一场不算你赢。',
    pickCard: '点一个目标 —— {ta}本人，或{ta}阵前的一个', pickRank: '点{ta}阵前的一个', pickTarget: '再点要打谁 —— {ta}本人，或{ta}阵前的一个',
    wonToday: '今日已比过', lostToday: '今日已比过，明日再来', spentToday: '今日已比过',
    why: { 'no-attack': '{ta}不会出手', 'too-big': '吞不下 —— {ta}攻太高', 'aim-one': '点{ta}阵前一个' },
  },
  en: {
    theirs: '{Its} rank', withdrew: '{It} yields, spent', wonSay: '{It} steps down.', lostSay: 'You yield and step down.', withdrewSay: '{It} runs out of breath and yields — this one is not your win.',
    pickCard: 'choose a target — {itObj}, or one of {its} rank', pickRank: 'choose one of {its} rank', pickTarget: 'now choose what it strikes — {itObj}, or one of {its} rank',
    wonToday: 'bout fought today', lostToday: 'bout fought today — again tomorrow', spentToday: 'bout fought today',
    why: { 'no-attack': '{It} does not strike', 'too-big': 'too big to swallow — the attack is too high', 'aim-one': 'choose one of {its} rank' },
  },
};

/* A fight is one of three kinds, and its loss is said as that kind (live, 2026-10-15: 「你认了输，退下台来。」
   closed 邹青松's chase in the 秘境 — no 台 there): a 试 (`goal`, creatures.json `trial`) is not stood
   through; a 比试 with a person (the 大比's 台) is yielded, stepping down; a beast is given ground to. */
export const fightKind = (creature) => (creature?.goal ? 'trial' : creature?.person ? 'bout' : 'beast');
export const TRIAL_WORDS = {
  zh: { lostSay: '这一试没撑过去。歇一歇，再来。' },
  en: { lostSay: 'You did not stand the trial through. Rest, and try again.' },
};

/// The fight's words for this foe: the beast's as they are, a person's with
/// PERSON_WORDS laid over and the pronoun filled in.
export function boutWords(words, creature, lang = 'zh') {
  const trial = fightKind(creature) === 'trial' ? TRIAL_WORDS[lang === 'en' ? 'en' : 'zh'] : null;
  const said = personWords(words, creature, lang);
  return trial ? { ...said, ...trial } : said;
}
function personWords(words, creature, lang) {
  if (!creature?.person) return words;
  const l = lang === 'en' ? 'en' : 'zh', g = creature.gender === 'female' || creature.gender === 'male' ? creature.gender : 'none';
  const p = l === 'zh' ? { it: PRONOUN.zh[g].ta, its: PRONOUN.zh[g].ta, itObj: PRONOUN.zh[g].ta, ta: PRONOUN.zh[g].ta } : PRONOUN.en[g];
  const vars = { ...p, It: cap(p.it), Its: cap(p.its) };
  const put = (t) => t.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
  const over = PERSON_WORDS[l];
  const flat = Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'why').map(([k, v]) => [k, put(v)]));
  return { ...words, ...flat, wonSays: null, it: p.it, its: p.its, itObj: p.itObj, why: { ...words.why, ...Object.fromEntries(Object.entries(over.why).map(([k, v]) => [k, put(v)])) } };
}

export const WORDS = {
  zh: {
    hp: '气血', mana: '灵力', deck: '牌库', hand: '手牌', power: '主灵根一击', end: '结束回合',
    it: '它', its: '它', itObj: '它',
    yours: '你的阵前', theirs: '它的阵前', empty: '空', taunt: '护主', arriving: '刚到',
    struck: '已出手', spoils: '所得', spoilsCard: '新得一张牌，往后可带进斗法：', spoilsBag: '收进储物袋：', spoilsClose: '收起', spoilsSpent: '用去：', spentTitle: '用去', xw: '修为', ls: '灵石', quit: '认输', won: '胜', passed: '试过了', lost: '败', withdrew: '它力竭遁走',
    wonSays: ['它伏低了身子，退进草里去了。', '它垂下头，慢慢走开了。', '它喘了几口粗气，掉头走了。', '它服了，退开三步，不再上前。', '它看了你一眼，钻进林子去了。',
      '它低低叫了一声，转身走了。', '它趴在地上，不动了。', '它夹起尾巴，溜了。', '它收了凶相，退到一边去了。', '它一瘸一拐地走远了。',
      '它不再看你，自顾自走了。', '风一过，它已经不见了。', '它往后一缩，没进山影里。', '它甩甩头，退回它来的地方。', '它伏在原地，喘着气，认了。',
      '它让开了路。', '它退了，一步一回头。', '它没力气了，蹲在那儿看你走过去。', '地上只剩几个爪印。', '它服了软，走了。'],
    wonSay: '它退入雾中。', passedSay: '它们收了回去，不再动了。', lostSay: '你退了半里地，它没有追。', withdrewSay: '它一口气用尽，转身走了 —— 这一场不算你赢。',
    why: {
      'no-mana': '灵力不够', 'board-full': '阵前满了', 'not-your-turn': '还没轮到你',
      'power-used': '这一回合用过了', taunt: '先过护主', 'just-arrived': '刚到，这一回合不能动',
      'already-struck': '这一回合出过手了', 'no-attack': '它不会攻击', 'no-target': '没有可指的',
      'no-friendly': '自己阵前没有人', 'fight-over': '打完了',
      'too-big': '吞不下 —— 它攻太高', 'aim-one': '点它阵前一个', chained: '被锁着，这一回合不能动',
    },
    chained: '锁', drought: '大旱', drainNext: '下回合灵力 −{n}',
    // A body's why in a word (its pill is narrow): '' says nothing — the turn itself says it.
    mark: { 'just-arrived': '刚到', 'already-struck': '已出手', 'no-attack': '不出手', 'not-your-turn': '', chained: '' },
    pickCard: '点一个目标 —— 妖，或它阵前的一个', pickRank: '点它阵前的一个', pickTarget: '再点它要打谁 —— 妖，或它阵前的一个',
    begin: '出 手', wonToday: '今日已降', lostToday: '它退入雾中，明日再来', spentToday: '它今日力竭遁走了',
    stale: '牌面没读全 —— 刷新页面再出手。',
    lean: { hide: '厚皮', ward: '避法', quick: '迅捷', fierce: '凶猛' },
    ready: '可出手', nothing: '这一回合没别的可做了 —— 点「结束回合」', how: '怎么玩', close: '知道了',
    armor: '护体', ward: '抗{el} {n}', absorbed: '护体挡 {n}',
    help: [
      ['目标', '把妖的气血打到 0。'],
      ['灵力', '每回合长一格，回合开始回满。牌左上角那个数就是它的价钱。开局 2 格，上限随境界（练气 6 · 筑基 8 · 结丹 10）。'],
      ['手牌', '开局 3 张，外加银月（她不占牌库）。每回合开始自动抽 1 张。牌库 10 张 —— 抽空之后每抽一次反噬掉 1、2、3… 点气血。'],
      ['打牌', '点一张牌就打出：随从落到你的阵前（最多 4 位），功法当场生效。需要目标的牌，点完牌再点目标 —— 妖，或它阵前的一个。'],
      ['随从', '落场那一回合不能动。下一回合起，点它、再点它要打的，就是出手；互殴两边都受伤。'],
      ['护主', '它阵前站着护主时，先打护主 —— 打不到它本人。'],
      ['主灵根一击', '每回合一次，费 2 灵力，打出你主灵根那一行。手里没牌时它是你的底。'],
      ['五行', '你的行克它 → 伤害多五成；被它克 → 少四分之一。金克木 · 木克土 · 土克水 · 水克火 · 火克金。不用自己算：牌上和瞄准处写的就是实打的点数。'],
      ['怎么算赢', '打光它的气血就赢。它十二张牌抽完会力竭遁走 —— 不胜不败，也没有奖励，所以拖着不打没用。'],
      ['望气', '学了望气术（坊市有卷），你的回合开始时，它头像下写着它下回合要做什么 —— 上卷只看出攻、召、守、养，下卷连点数都看得清。它定下的，就一定照做。'],
      ['杀招', '妖掉到一半气血时开始蓄力：下一回合它不出牌，再下一回合放出它的杀招，一场一次。它会打多少、打谁，写在它头像下面。趁它蓄力打完它，立护主去挡，回血，或者别把随从都摆上去挨群伤。'],
      ['装备', '法衣给护体：打你先扣护体，扣完才伤气血，不留伤。佩给抗：那一行打你轻几点（至少 1）。符开局在手，打出后背包里少一道。'],
      ['锁 · 吞 · 大旱', '锁：它阵前一个下回合不能出手。吞：它阵前一个攻不过牌上那个数的，直接吞下。灵力 −1：它下回合少一格灵力。大旱：那只站着，你每回合末它阵前每个都挨。'],
      ['没有死', '随从被打到 0 是退下，不是死。这个世界里没有死。'],
    ],
  },
  en: {
    it: 'it', its: 'its', itObj: 'it',
    hp: 'Life', mana: 'Force', deck: 'Deck', hand: 'Hand', power: 'Root Strike', end: 'End turn',
    yours: 'Your rank', theirs: 'Its rank', empty: 'empty', taunt: 'Guard', arriving: 'just arrived',
    struck: 'has struck', spoils: 'Spoils', spoilsCard: 'A new card, yours to take into a fight:', spoilsBag: 'Into the pouch: ', spoilsClose: 'Put away', spoilsSpent: 'Used up: ', spentTitle: 'Used up', xw: 'Cultivation', ls: 'Stones', quit: 'Yield', won: 'Won', passed: 'Passed', lost: 'Lost', withdrew: 'It withdrew',
    wonSays: ['It drops low and backs into the grass.', 'It lowers its head and walks slowly off.', 'It blows a few hard breaths and turns away.', 'It gives in, backs three steps, and comes no closer.', 'It gives you one look and slips into the trees.',
      'It makes a low sound and turns away.', 'It lies down on the ground and stays there.', 'Tail tucked, it slinks off.', 'Its fury gone, it moves aside.', 'It limps away into the distance.',
      'It stops looking at you and goes its own way.', 'A gust passes, and it is gone.', 'It shrinks back and melts into the mountain\'s shadow.', 'It shakes its head and goes back where it came from.', 'It crouches where it is, panting, and yields.',
      'It steps out of your way.', 'It retreats, looking back at every step.', 'Spent, it sits and watches you walk past.', 'Only a few pawprints are left on the ground.', 'It softens, and goes.'],
    wonSay: 'It backs into the mist.', passedSay: 'They draw back and are still.', lostSay: 'You give ground; it does not follow.', withdrewSay: 'Its breath runs out and it turns away — this one does not count as a win.',
    why: {
      'no-mana': 'not enough Force', 'board-full': 'the rank is full', 'not-your-turn': 'not your turn',
      'power-used': 'used this turn', taunt: 'a Guard stands in the way', 'just-arrived': 'just arrived',
      'already-struck': 'has struck this turn', 'no-attack': 'it does not strike', 'no-target': 'nothing to point at',
      'no-friendly': 'no one of yours stands', 'fight-over': 'the fight is over',
      'too-big': 'too big to swallow — its attack is too high', 'aim-one': 'choose one of its rank', chained: 'chained — cannot strike this turn',
    },
    chained: 'Chained', drought: 'Drought', drainNext: 'Force −{n} next turn',
    mark: { 'just-arrived': 'new', 'already-struck': 'struck', 'no-attack': 'no attack', 'not-your-turn': '', chained: '' },
    pickCard: 'choose a target — the beast, or one of its rank', pickRank: 'choose one of its rank', pickTarget: 'now choose what it strikes',
    begin: 'Begin', wonToday: 'subdued today', lostToday: 'it withdrew — come back tomorrow', spentToday: 'it walked away spent today',
    stale: 'The cards did not load — refresh, then begin.',
    lean: { hide: 'thick-hided', ward: 'warded', quick: 'quick', fierce: 'fierce' },
    ready: 'ready', nothing: 'nothing else this turn — press End turn', how: 'How to play', close: 'Got it',
    armor: 'Shield', ward: '{el} −{n}', absorbed: 'shield took {n}',
    help: [
      ['The point', "Take the beast's Life to zero."],
      ['Force', 'One more crystal each round, refilled at the start of it. The number on a card is its price. Two to begin with; the cap rises with your realm (6 · 8 · 10).'],
      ['Your hand', 'Three cards to start, plus Yinyue, who is not one of your ten. One card drawn at the start of every round. Ten in the deck — once it is dry, each draw costs 1, then 2, then 3 Life.'],
      ['Playing', 'Click a card to play it: a minion joins your rank (four stand at most), an art takes effect at once. A card that wants a target: click it, then click the beast or one of its rank.'],
      ['Minions', 'A minion cannot strike the turn it arrives. After that, click it, then click what it strikes — and both take the blow.'],
      ['Guard', 'While a Guard stands in its rank, strike the Guard: the beast itself is out of reach.'],
      ['Root Strike', "Once a round, two Force, in your own root. It is what you have when your hand has nothing."],
      ['The five roots', 'Your root over its root lands half again as hard; under it, a quarter lighter. Metal over Wood · Wood over Earth · Earth over Water · Water over Fire · Fire over Metal. No need to reckon it: the card and whatever you aim at show the number that lands.'],
      ['Winning', 'Take all its Life. If its twelve cards run out first it withdraws — neither won nor lost, and nothing is paid, so waiting it out gains nothing.'],
      ['Reading the qi', 'With Reading the Qi learned (a scroll at the market), the start of your turn shows what the beast will do next — Part One its shape (strike, summon, guard, heal), Part Two every move and its number. What it plans, it does.'],
      ['Signature', "At half its Life the beast gathers: it plays nothing next turn and lets its signature go the turn after, once a fight. What it will do, and to whom, is written under it. Finish it while it gathers, stand a Guard, heal, or keep your rank back from a sweep."],
      ['Gear', 'A robe gives Shield: blows at you take it first, then Life, and it leaves no wound. A pendant wards one root: its blows land lighter on you (at least 1). A talisman starts in hand; played, it leaves the bag.'],
      ['Chain · Swallow · Drought', 'Chain: one of its rank cannot strike next turn. Swallow: one of its rank whose attack is at most the number is gone. Force −1: it has one less Force next turn. Drought: while it stands, each of its rank takes the number at the end of your every turn.'],
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
  if (card.effect?.damage != null || aimsAtRank(card)) return st.foe.board.length > 0;
  return false;
}
/* 锁 and 吞 point at one of its rank, never the beast itself. */
const aimsAtRank = card => card?.effect?.chain != null || card?.effect?.swallow != null;

/* A tap is a place, not an action: `{ kind: 'hand'|'mine'|'theirs'|'power'|
   'hero'|'end'|'quit'|'stage', index }`. The first tap lifts what it lands on
   — or plays it at once when there is nothing to ask (a 灵兽, a 功法 with no
   aim); with something lifted, the second tap says where it goes (SECOND).
   The same thing tapped again puts it back, and so does a tap on no place
   (the stage itself); a tap on another thing that lifts lifts that instead.
   Returns `{ action }` to play, `{ pick }` to hold, or `{ clear: true }`
   (tests/battle-input.test.mjs). */
const LIFTS = new Set(['hand', 'mine', 'power', 'pill']);
const FROM = { hand: 'hand', mine: 'board', power: 'power', pill: 'pill' };
const sameSpot = (picked, spot) => FROM[spot.kind] === picked.from && (spot.kind === 'power' || picked.index === spot.index);
/* A 回春丹 asks whom when a member stands beside him (丹囊, battle.js § pills); anything else is taken at once. */
const pillAsks = (st, index) => Boolean(st.you.pouch?.[index]?.heal) && (st.you.allies ?? []).some(a => !a.gone);
const minionAt = spot => (spot.kind === 'theirs' || spot.kind === 'mine' ? { kind: 'minion', index: spot.index } : undefined);
const isLift = (picked, st, catalog) => Boolean(catalog?.[st.you.hand[picked.index]]?.effect?.buff);

/* The second tap, by what is lifted and where it lands. A place missing here
   puts the lifted thing back. Only a lift is aimed at your own rank. */
const SECOND = {
  pill: {
    self: p => ({ action: { kind: 'pill', index: p.index } }),
    ally: (p, spot) => ({ action: { kind: 'pill', index: p.index, target: { kind: 'ally', index: spot.index } } }),
  },
  hand: {
    theirs: (p, spot) => ({ action: { kind: 'play', index: p.index, target: minionAt(spot) } }),
    hero: p => ({ action: { kind: 'play', index: p.index, target: undefined } }),
    mine: (p, spot, st, catalog) => (isLift(p, st, catalog) ? { action: { kind: 'play', index: p.index, target: minionAt(spot) } } : { clear: true }),
  },
  board: {
    theirs: (p, spot) => ({ action: { kind: 'attack', index: p.index, target: minionAt(spot) } }),
    hero: p => ({ action: { kind: 'attack', index: p.index, target: undefined } }),
  },
  power: {
    theirs: (p, spot) => ({ action: { kind: 'power', target: minionAt(spot) } }),
    hero: () => ({ action: { kind: 'power', target: undefined } }),
  },
};

/* Every move the rules allow from what this tap would lift. */
const MATCH = {
  hand: (a, spot) => a.kind === 'play' && a.index === spot.index,
  mine: (a, spot) => a.kind === 'attack' && a.index === spot.index,
  power: a => a.kind === 'power',
};
const allowedFrom = (spot, offers) => (offers ?? []).filter(o => o.ok && MATCH[spot.kind]?.(o.action, spot));

/* Only one place it may go: go there (Hanli, 2026-10-15: 只有一个可以攻击的目标,
   点了牌就攻击). The count is `offers` — the rules' own legality — so a 护主
   standing alone, a beast with an empty rank, a 锁 with one body to take and a
   lift with one friend to lift all act on the first tap; two or more ask where. */
function onlyOne(spot, offers) {
  if (!offers) return null;
  const ok = allowedFrom(spot, offers);
  return ok.length === 1 ? { action: ok[0].action } : null;
}

function firstTap(spot, st, catalog, offers = null) {
  const one = onlyOne(spot, offers);
  if (one) return one;
  if (spot.kind === 'hand') {
    const card = catalog?.[st.you.hand[spot.index]];
    return wantsTarget(card, st) ? { pick: { from: 'hand', index: spot.index } } : { action: { kind: 'play', index: spot.index } };
  }
  if (spot.kind === 'mine') return { pick: { from: 'board', index: spot.index } };
  if (spot.kind === 'power') return st.foe.board.length ? { pick: { from: 'power' } } : { action: { kind: 'power' } };
  if (spot.kind === 'pill') return pillAsks(st, spot.index) ? { pick: { from: 'pill', index: spot.index } } : { action: { kind: 'pill', index: spot.index } };
  return { clear: true };
}

/* `offers` (battle.js offers, optional): with them, a lift that has exactly
   one legal place acts on the first tap (onlyOne). */
export function pickOf(picked, spot, st, catalog = null, offers = null) {
  if (spot.kind === 'end') return { action: { kind: 'end' } };
  if (spot.kind === 'quit') return { quit: true };
  if (!picked) return firstTap(spot, st, catalog, offers);
  if (sameSpot(picked, spot)) return { clear: true };
  const second = SECOND[picked.from]?.[spot.kind];
  if (second) return second(picked, spot, st, catalog);
  return LIFTS.has(spot.kind) ? firstTap(spot, st, catalog, offers) : { clear: true };
}

/* A drag is the two taps in one gesture (the Mac's mouse; nothing depends on
   it): from where it was picked up to where it was let go. A card that asks
   nothing plays once it leaves the hand; let go on another thing that lifts,
   or back on the hand, and nothing happens. */
export function dropOf(from, to, st, catalog = null) {
  // A drag says where itself, so it never takes the one-place shortcut.
  const first = firstTap(from, st, catalog);
  if (first.action) return to && to.kind !== 'hand' && to.kind !== 'end' && to.kind !== 'quit' ? first : { clear: true };
  if (!first.pick || !to) return { clear: true };
  const second = pickOf(first.pick, to, st, catalog);
  return second.action ? second : { clear: true };
}

/* Where the held thing may land: the beast, or these of its rank. Straight
   from `offers`, so the glow can never disagree with the rules — the foe itself
   lights only when it can be hit (a 护主 in the way: it stays dark, 2026-09-29). */
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
  return `<div class="bdeck ${side}${n ? '' : ' dry'}" data-pile="${side}">
    ${Array.from({ length: layers }, (_, i) => `<i style="transform: translate(${i * -1.4}px, ${i * -1.6}px)"></i>`).join('')}
    <b>${n}</b><small>${esc(w.deck)}</small>
  </div>`;
}

/* `mark` draws a line on the bar: where a 试 yields (battle.js § trial). */
const pool = (label, now, max, cls, mark = null) => `<div class="bpool" data-now="${now}" data-max="${max}"><span>${label}</span><div class="bbar ${cls}"><i style="width:${Math.max(0, Math.round((now / Math.max(1, max)) * 100))}%"></i>${mark ? `<s class="bmark" style="left:${Math.round(mark * 100)}%"></s>` : ''}</div><b>${now}<small class="bmax">/${max}</small></b></div>`;

const crystals = (now, max, cap) => {
  const dots = [];
  for (let i = 0; i < cap; i += 1) dots.push(`<i class="${i < now ? 'full' : i < max ? 'spent' : 'none'}"></i>`);
  return `<div class="bmana">${dots.join('')}<b>${now}/${max}</b></div>`;
};

/* A body's why on its pill, in a word (WORDS.mark) — the whole sentence is the hand's and the help's;
   on a 98px body 「刚到，这一回合不能动」 read 「刚到，这…」 (live, 2026-10-16). */
const markOf = (w, why) => w.mark?.[why] ?? w.why[why] ?? why;

function minionHtml(m, side, index, ctx, picked) {
  const w = ctx.words;
  const why = side === 'mine' ? ctx.reasons.get(`mine:${index}`)?.why : null;
  const held = picked?.from === 'board' && picked.index === index && side === 'mine';
  const marks = [
    m.taunt ? w.taunt : null,
    m.chained ? w.chained : null,
    m.drought ? w.drought : null,
    side === 'mine' && why ? markOf(w, why) : null,
    side === 'mine' && !why && m.ready ? w.ready : null,
  ].filter(Boolean);
  const can = side === 'mine' && !why && m.ready;
  const aimed = side === 'theirs' ? ctx.aim?.theirs?.has(index) : ctx.aim?.mine?.has(index);
  const badge = side === 'theirs' && aimed && ctx.striker ? dmgBadge(ctx.st, ctx.striker.n, ctx.striker.element, m.element, ctx.lang)
    : side === 'theirs' && aimed && ctx.verb ? `<span class="bdmg up">${esc(ctx.verb)}</span>` : '';
  const pic = artOf(ctx.catalog?.[m.id], ctx);
  // A body on the rank is a little card of its own: its picture on top, its
  // name under it, and 攻 / 血 in the two bottom corners where a card player's
  // eye already looks. A 22px strip of a painting is a smudge, not a picture
  // (his, 2026-09-18: 放到阵前, 图片看不到了).
  return `<button class="bminion ${side} el-${esc(m.element ?? 'none')}${held ? ' held' : ''}${m.taunt ? ' taunt' : ''}${can ? ' can' : ''}${aimed ? ' aimed' : ''}${side === 'mine' && why ? ' dim' : ''}${herOf(m.id, ctx)}" data-spot="${side === 'mine' ? 'mine' : 'theirs'}" data-index="${index}" data-id="${esc(m.id)}"${m.uid != null ? ` data-uid="${esc(m.uid)}"` : ''}>
    <span class="bface-wrap">
      ${pic ? `<img class="bpic small" src="${esc(pic)}" alt="" loading="lazy">` : '<span class="bpic small none"></span>'}
      <span class="bglyph">${GLYPH[m.element] ?? ''}</span>
    </span>
    <span class="bname">${name(m, ctx.lang)}</span>
    <span class="batk">${m.atk}</span><span class="bhp">${m.hp}</span>
    ${marks.length ? `<small>${marks.map(esc).join(' · ')}</small>` : ''}${badge}
  </button>`;
}

/* A card's picture. The 山海经 creatures keep their classical plates; the rest
   were painted for us (worlds/<id>/art/cards). A card without one still reads
   — the name and the line under it carry it — so the picture is a gift, never
   a requirement. */
const artOf = (c, ctx) => (c?.art ? `${ctx.artBase ?? ''}${c.art}` : null);

/* A card as a scroll leaf (the ink fight, 2026-10-15): rice paper, the art on
   top, the 五行 seal in its corner, cost and 攻/血 in brush figures. The art row
   is the one that gives: it takes what the words leave (a grid row of `1fr`), so
   a long rule never runs off a small card. `o` carries what differs between the
   hand and the spoils: the cost now, the rule as it reads now, the ★, the why. */
function leafHtml(c, ctx, o = {}) {
  const pic = artOf(c, ctx);
  const body = c.kind === 'minion' ? `<span class="batk">${o.atk ?? c.atk}</span><span class="bhp">${o.hp ?? c.hp}</span>` : '';
  return `<span class="bleaf">
      <span class="bcost">${o.cost ?? c.cost}</span>
      ${c.element ? `<span class="belem">${GLYPH[c.element] ?? ''}</span>` : ''}
      ${pic ? `<img class="bpic" src="${esc(pic)}" alt="" loading="lazy">` : '<span class="bpic none"></span>'}
      <span class="bname">${name(c, ctx.lang)}${o.stars ? ` <span class="stars">${'★'.repeat(o.stars)}</span>` : ''}</span>
      <small class="btext">${o.text ?? esc(sayEffect(c, ctx))}</small>
      ${body}
      ${o.why ? `<small class="bwhy">${esc(o.why)}</small>` : ''}
    </span>`;
}

/// One card's face by its id, as the hand draws it — for a card shown in passing (the beast's 功法).
export function cardFaceHtml(id, ctx) {
  const c = ctx.catalog?.[id];
  return c ? leafHtml(c, ctx) : '';
}

/* The fan: each card turned a little about the middle of the hand and dropped
   along the arc, so the hand reads as held, not as a row of buttons. */
const fanOf = (i, n) => {
  const k = i - (n - 1) / 2;
  return `--r:${(k * 3.2).toFixed(1)}deg;--y:${(k * k * 1.8).toFixed(1)}px;--z:${i + 1}`;
};

/* Whose card it is, when it is a person's: 银月's leaf is edged silver-blue —
   the companion's id is her card's (ctx.herCard), never a name in the code. */
const herOf = (id, ctx) => (ctx.herCard && id === ctx.herCard ? ' her' : '');

function handHtml(st, ctx, picked) {
  const w = ctx.words, n = st.you.hand.length;
  return st.you.hand.map((id, index) => {
    const c = ctx.catalog[id];
    if (!c) return '';
    const why = ctx.reasons.get(`hand:${index}`)?.why;
    const held = picked?.from === 'hand' && picked.index === index;
    const b = bodyOf(st.you, c);
    // 闭关's ★: the cost it has now, and the stars by its name.
    // On the beast's turn every card waits alike: the seal and the turn say why once, not each card.
    const shownWhy = why && why !== 'not-your-turn' ? (w.why[why] ?? why) : null;
    const text = `${esc(sayEffect({ ...c, effect: effectOf(st.you, c), keywords: keywordsOf(st.you, c) }, ctx))}${liftOf(st.you, c, ctx)}${onBeast(st, c, ctx)}${backlash(st, c, ctx)}`;
    return `<button class="bcard el-${esc(c.element ?? 'none')}${herOf(id, ctx)}${held ? ' held' : ''}${why ? ' dim' : ''}${!why && !held ? ' can' : ''}" data-spot="hand" data-index="${index}" data-id="${esc(id)}" style="${fanOf(index, n)}"${why ? ` title="${esc(w.why[why] ?? why)}"` : ''}>
      ${leafHtml(c, ctx, { cost: costOf(st.you, c), atk: b.atk, hp: b.hp, stars: starsOf(st.you, c), text, why: shownWhy })}${sealHtml(c, st, ctx)}${freshHtml(id, ctx)}
    </button>`;
  }).join('');
}

/* 所得 — what a won fight left, on the stage after the room closes: the card
   he now holds, drawn as it will be in his hand, and what went into the bag.
   Until he puts it away or walks on; the rules already wrote it down. */
export function spoilsHtml(spoils, ctx) {
  const w = ctx.words;
  const faces = (spoils.cards ?? []).map((row) => {
    const c = ctx.catalog[row.id];
    return c ? `<div class="bcard face el-${esc(c.element ?? 'none')}">${leafHtml(c, ctx)}</div>` : '';
  }).join('');
  // An arm of a rarity (a rerun's drop, rules/rerun.mjs) says it: 「青铜古剑 · 稀有」.
  // 不拿重复的物品 (2026-10-15): the first of a thing is marked 新; a one-off had before came as its worth.
  const things = (spoils.items ?? []).map((i) => thingHtml(i, ctx.lang === 'en')).join(' · ');
  // A 符 played is gone from the bag (result.spent), won or lost.
  const spent = (spoils.spent ?? []).map((id) => name(ctx.catalog[id], ctx.lang) || esc(id)).join(' · ');
  // What the win paid, in the card's own words — not only a float on the strip.
  const p = spoils.paid ?? {};
  const pays = [p.progress ? `${w.xw} +${p.progress}` : '', p.wealth ? `${w.ls} +${p.wealth}` : ''].filter(Boolean).join(' · ');
  const gained = faces || things || pays || spoils.line;
  return `<div class="card spoils"><div class="cardtitle">${esc(gained ? w.spoils : w.spentTitle)}</div>
    ${pays ? `<div class="spoilpays">${esc(pays)}</div>` : ''}
    ${spoils.line ? `<div class="small">${esc(spoils.line)}</div>` : ''}
    ${faces ? `<div class="small dim">${esc(w.spoilsCard)}</div><div class="spoilfaces">${faces}</div>` : ''}
    ${things ? `<div class="small">${esc(w.spoilsBag)}${things}</div>` : ''}
    ${spent ? `<div class="small dim">${esc(w.spoilsSpent)}${spent}</div>` : ''}
    <div class="acts"><button class="act" data-spoils-close>${esc(w.spoilsClose)}</button></div></div>`;
}

/* One thing in the bag's line: 新 if first had, its rarity, ×n, and what a
   one-off already had came as instead. */
function thingHtml(i, isEn) {
  const fresh = i.new ? `<span class="chip cnew">${isEn ? 'New' : '新'}</span> ` : '';
  const named = `${esc(i.name)}${i.rarity_name ? ` · ${esc(i.rarity_name)}` : ''}`;
  const body = i.rarity ? `<span class="rarity r-${esc(i.rarity)}">${named}</span>` : named;
  const n = i.got ?? i.n;
  const count = n > 1 ? ` ×${n}` : '';
  const instead = i.instead_of ? ` <span class="dim">（${esc(isEn ? `for a ${i.instead_of.name} you have` : `${i.instead_of.name}已有`)}）</span>` : '';
  return `${fresh}${body}${count}${instead}`;
}

/* A 功法 that hits: what it would take off the beast, when 五行 changes it. */
function onBeast(st, c, ctx) {
  const e = effectOf(st.you, c);
  if (c.kind !== 'spell' || e?.damage == null) return '';
  const word = clashWord(c.element, st.foe.root, ctx.lang);
  if (!word) return '';
  const n = dealt(st, 'you', e.damage, c.element, st.foe.root);
  return ` <b class="bon${clash(c.element, st.foe.root) < 1 ? ' down' : ''}">${ctx.lang === 'en' ? `→ ${n} on ${pro(ctx).itObj} · ${word}` : `→ 对${pro(ctx).itObj} ${n} · ${word}`}</b>`;
}

/* 反噬 a draw would cost, reckoned now: each card wanted past a dry deck costs
   1, then 2, then 3 气血 (battle.js draw). 参悟 hurt him with no word on it
   (Hanli, 2026-10-15) — the rule was fair, the card was silent. */
export function backlashOf(side, c) {
  const want = effectOf(side, c)?.draw;
  const deck = typeof side?.deck === 'number' ? side.deck : side?.deck?.length ?? 0;
  const over = want == null ? 0 : Math.max(0, want - deck);
  let n = 0;
  for (let k = 1; k <= over; k += 1) n += (side.fatigue ?? 0) + k;
  return { over, n, deck };
}
function backlash(st, c, ctx) {
  const { n, deck } = backlashOf(st.you, c);
  if (!n) return '';
  return ` <b class="bon down">${ctx.lang === 'en' ? `deck has ${deck} · backlash −${n} Life` : `牌库剩 ${deck} 张 · 反噬 −${n} 气血`}</b>`;
}

/* The day's cast on a card it touches — so a number that differs from the
   printed one says why. */
function liftOf(side, c, ctx) {
  const b = side.boost;
  if (boostedOf(side, c) === c.effect) return '';
  const n = b.n > 0 ? `+${b.n}` : `${b.n}`;
  return ` <b class="blift${b.n < 0 ? ' down' : ''}">${ctx.lang === 'en' ? `cast ${n}` : `卦 ${n}`}</b>`;
}

/* What a card does, in words, on the card — never in a tooltip. */
export function sayEffect(c, ctx) {
  const zh = ctx.lang !== 'en';
  const e = c.effect ?? {};
  const bits = [];
  if (e.damage != null) bits.push(zh ? `打 ${e.damage} 点` : `${e.damage} damage`);
  if (e.sweep != null) bits.push(zh ? `${pro(ctx).its}阵前每个 ${e.sweep} 点` : `${e.sweep} to each of ${pro(ctx).its} rank`);
  if (e.heal != null) bits.push(zh ? `回 ${e.heal} 气血` : `heal ${e.heal}`);
  if (e.draw != null) bits.push(zh ? `抽 ${e.draw} 张` : `draw ${e.draw}`);
  if (e.buff) bits.push(zh ? `一个 +${e.buff.atk ?? 0}/+${e.buff.hp ?? 0}` : `one of yours +${e.buff.atk ?? 0}/+${e.buff.hp ?? 0}`);
  if (e.rally) bits.push(zh ? `全体 +${e.rally.atk ?? 0}/+${e.rally.hp ?? 0}` : `all of yours +${e.rally.atk ?? 0}/+${e.rally.hp ?? 0}`);
  if (e.summon) bits.push(zh ? `召来 ${e.summon.n ?? 1} 个` : `summon ${e.summon.n ?? 1}`);
  if (e.chain != null) bits.push(zh ? `锁${pro(ctx).its}阵前一个，下回合不能出手` : `Chain one of ${pro(ctx).its} rank: it cannot strike next turn`);
  if (e.swallow != null) bits.push(zh ? `吞${pro(ctx).its}阵前一个攻 ≤${e.swallow} 的` : `Swallow one of ${pro(ctx).its} rank with attack ≤ ${e.swallow}`);
  if (e.drain != null) bits.push(zh ? `${pro(ctx).it}下回合灵力 −${e.drain}` : `${pro(ctx).its} Force −${e.drain} next turn`);
  if (e.drought != null) bits.push(zh ? `大旱：你每回合末，${pro(ctx).its}阵前每个 ${e.drought} 点` : `Drought: at the end of your turn, ${e.drought} to each of ${pro(ctx).its} rank`);
  const key = c.keywords?.includes('taunt') ? (zh ? '护主' : 'Guard') : null;
  const cry = c.keywords?.includes('battlecry') ? (zh ? '入阵：' : 'On arrival: ') : '';
  return [key, cry + bits.join('，')].filter(x => x && x.trim()).join(' · ');
}

/* ── 杀招 — what is coming, in the numbers that will land ──
   The beast at half its 气血 gathers (battle.js § 杀招). The page says what
   it will do and how hard, reckoned by the same `dealt` the fight uses, so
   the player answers a fact, not a guess — and Ling says nothing. */
export function sigWords(st, ctx) {
  const e = sigEffect(st.foe), zh = ctx.lang !== 'en', root = st.foe.root;
  const hit = (n, target) => dealt(st, 'foe', n, root, target);
  const guard = st.you.board.find(m => m.taunt);
  const out = [];
  if (e.sweep != null) out.push(zh ? `你阵前每个 −${hit(e.sweep, null)}` : `each of your rank −${hit(e.sweep, null)}`);
  if (e.damage != null) {
    out.push(guard
      ? (zh ? `${name(guard, ctx.lang)} 替你挡 −${hit(e.damage, guard.element)}` : `${name(guard, ctx.lang)} takes it −${hit(e.damage, guard.element)}`)
      : (zh ? `你 −${landed(st, 'foe', e.damage, root)}（护主可挡）` : `you −${landed(st, 'foe', e.damage, root)} (a Guard takes it)`));
  }
  if (e.heal != null) out.push(zh ? `${pro(ctx).it}回 ${e.heal}` : `${pro(ctx).it} heals ${e.heal}`);
  if (e.summon) out.push(zh ? `召来 ${name(ctx.catalog?.[e.summon.id], ctx.lang)} ×${e.summon.n ?? 1}` : `summons ${name(ctx.catalog?.[e.summon.id], ctx.lang)} ×${e.summon.n ?? 1}`);
  if (e.rally) out.push(zh ? `${pro(ctx).its}阵前全体 +${e.rally.atk ?? 0}/+${e.rally.hp ?? 0}` : `${pro(ctx).its} rank +${e.rally.atk ?? 0}/+${e.rally.hp ?? 0}`);
  return out.join(zh ? ' · ' : ' · ');
}

/* The 杀招's wind-up held on the beast's own plate for as long as it lasts: ink drawn round it while it
   gathers, cinnabar when it lets go next turn (battle.css .charge-gathering · .charge-ready). */
const windUp = (st) => {
  const phase = st.foe.charge;
  return st.outcome === 'open' && st.foe.signature && (phase === 'gathering' || phase === 'ready') ? ` charge-${phase}` : '';
};

export function chargeHtml(st, ctx) {
  const phase = st.foe.charge;
  if (st.outcome !== 'open' || !st.foe.signature || (phase !== 'gathering' && phase !== 'ready')) return '';
  const zh = ctx.lang !== 'en';
  const sig = name(st.foe.signature, ctx.lang);
  const when = phase === 'gathering'
    ? (zh ? `${pro(ctx).it}在蓄力 —— 下一回合不出牌，再下一回合放出` : `${cap(pro(ctx).it)} gathers — nothing played next turn, let go the turn after`)
    : (zh ? `${pro(ctx).it}下一回合放出 —— 这一回合是你的` : `${cap(pro(ctx).it)} lets go next turn — this turn is yours`);
  return `<div class="bcharge ${phase}"><b>${zh ? '杀招' : 'Signature'} · ${sig}</b><span>${sigWords(st, ctx)}</span><small>${when}</small></div>`;
}

/* ── 装睡 — a beast playing dead (battle.js § asleep) ──
   The trap is shown, never hidden: what it is doing, that a plain blow
   glances and what goes in, and how hard it wakes — the number grows with
   every blow that glanced, so the player can read what feeding it costs. */
export function feintHtml(st, ctx) {
  const f = st.foe.feint;
  if (st.outcome !== 'open' || !asleep(st.foe)) return '';
  const zh = ctx.lang !== 'en';
  const goes = [...(f.pierce ?? []).map(el => (zh ? GLYPH[el] : EN_EL[el])), ...(f.pierce_binds ? [zh ? '缚住了的那一回合' : 'a bound turn'] : [])].join(zh ? '、' : ', ');
  const what = zh ? `装睡 —— 寻常一击只擦过 −${f.lands ?? 1}${goes ? `，${goes}能打进去` : ''}` : `Playing dead — a plain blow glances (−${f.lands ?? 1})${goes ? `; ${goes} goes in` : ''}`;
  const sig = st.foe.signature ? name(st.foe.signature, ctx.lang) : '';
  const wake = f.left > 1
    ? (zh ? `再 ${f.left} 回合睁眼` : `wakes in ${f.left} turns`)
    : (zh ? '下回合睁眼' : 'wakes next turn');
  const after = sig ? (zh ? `：${sig}，${sigWords(st, ctx)}${f.per_glance ? `（每擦过一下 +${f.per_glance}）` : ''}` : `: ${sig}, ${sigWords(st, ctx)}${f.per_glance ? ` (+${f.per_glance} per glance)` : ''}`) : '';
  return `<div class="bcharge feint"><b>${name(f, ctx.lang)}</b><span>${what}</span><small>${wake}${after}</small></div>`;
}

/* ── 望气 — the beast's plan, as far as the player can read it ──
   The plan is made for everyone at the start of your turn (battle.js § 意图);
   the view carries it only when 望气术 is learned. 上卷 reads the shape of it
   (攻 · 召 · 守 · 养), 下卷 reads every move with the number that lands. */
export function intentBits(st, ctx) {
  const it = st.foe.intent, zh = ctx.lang !== 'en', root = st.foe.root;
  const exact = it.sight >= 2;
  const bits = it.cards.map((id) => {
    const c = ctx.catalog?.[id];
    if (!c) return null;
    const e = c.effect ?? {};
    if (!exact) {
      if (c.kind === 'minion') return zh ? '召' : 'summon';
      if (e.damage != null || e.sweep != null) return zh ? '攻' : 'strike';
      if (e.heal != null) return zh ? '养' : 'heal';
      return zh ? '助' : 'bolster';
    }
    const nm = name(c, ctx.lang);
    if (c.kind === 'minion') return zh ? `召 ${nm} ${c.atk}/${c.hp}` : `${nm} ${c.atk}/${c.hp}`;
    if (e.damage != null) return zh ? `${nm} 打 ${landed(st, 'foe', e.damage, c.element)}` : `${nm}: ${landed(st, 'foe', e.damage, c.element)}`;
    if (e.sweep != null) return zh ? `${nm} 你阵前各 −${dealt(st, 'foe', e.sweep, c.element, null)}` : `${nm}: each of yours −${dealt(st, 'foe', e.sweep, c.element, null)}`;
    if (e.heal != null) return zh ? `${nm} 回 ${e.heal}` : `${nm}: heals ${e.heal}`;
    return nm;
  }).filter(Boolean);
  if (it.power) bits.push(exact ? (zh ? `主灵根一击 ${landed(st, 'foe', st.foe.powerHit, root)}` : `root strike ${landed(st, 'foe', st.foe.powerHit, root)}`) : (zh ? '一击' : 'strike'));
  return bits;
}

export function intentHtml(st, ctx) {
  const it = st.foe.intent;
  if (!it || st.outcome !== 'open' || st.whose !== 'you') return '';
  const zh = ctx.lang !== 'en', bits = intentBits(st, ctx);
  const what = asleep(st.foe) && st.foe.feint.left > 1 ? (zh ? '装睡，不出手' : 'plays dead — nothing')
    : it.gathering ? (zh ? '蓄力，不出手' : 'gathers — nothing else') : bits.length ? bits.join(' · ') : (zh ? '只让阵前的出手' : 'only its rank strikes');
  return `<div class="bintent${it.sight >= 2 ? ' exact' : ''}"><b>${zh ? '望气' : 'Its qi'}</b><span>${zh ? `${pro(ctx).it}下回合：` : 'Next turn: '}${esc(what)}</span></div>`;
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
      : t.absorbed && !t.amount ? `${who} ${fill(w.absorbed, { n: t.absorbed })}`
        : `${who} −${t.amount}${t.absorbed ? `（${fill(w.absorbed, { n: t.absorbed })}）` : ''}`;
    case 'hurt-minion': return `${card(t.id)} −${t.amount}`;
    case 'withdrew': return `${card(t.id)} ${zh ? '退下' : 'withdraws'}`;
    case 'heal': return `${who} +${t.amount}`;
    case 'rally': return `${who} ${zh ? `全体 +${t.atk ?? 0}/+${t.hp ?? 0}` : `all +${t.atk ?? 0}/+${t.hp ?? 0}`}`;
    case 'buff': return `${card(t.id)} +${t.atk ?? 0}/+${t.hp ?? 0}`;
    case 'chained': return `${card(t.id)} ${zh ? '被锁' : 'is chained'}`;
    case 'swallowed': return `${card(t.id)} ${zh ? '被吞下' : 'is swallowed'}`;
    case 'drained': return `${t.who === 'foe' ? (ctx.foeName ?? '') : (zh ? '你' : 'You')} ${fill(w.drainNext, { n: t.amount })}`;
    case 'drought': return `${card(t.id)} ${w.drought}`;
    case 'foe-withdrew': return w.withdrew;
    case 'trial-passed': return w.passed;
    case 'charge': return `${who} ${zh ? '开始蓄力' : 'gathers'}：${name(ctx.st?.foe?.signature, ctx.lang)}`;
    case 'unleash': return `${who} ${zh ? '放出' : 'lets go'} ${name(ctx.st?.foe?.signature, ctx.lang)}`;
    case 'feint': return `${who} ${zh ? '还在装睡' : 'still plays dead'}`;
    case 'glanced': return `${who} ${zh ? `装睡，这一下擦过（已 ${t.glanced} 下）` : `plays dead — that one glanced (${t.glanced} so far)`}`;
    case 'bound': return `${who} ${zh ? `被${card(t.id)}缚住 —— 这一回合打得进去` : `is bound by ${card(t.id)} — this turn goes in`}`;
    case 'woke': return `${who} ${zh ? '睁眼了' : 'opens its eyes'}`;
    default: return '';
  }
}

export function lastHtml(log, ctx, open = false) {
  const w = ctx.words;
  const lines = (log ?? []).map(t => sayTurn(t, ctx)).filter(Boolean);
  if (!lines.length) return '';
  const shown = open ? lines : lines.slice(-4);
  const more = lines.length - shown.length;
  return `<div class="blast${open ? ' open' : ''}">
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
    <div class="cardtitle">${esc(ctx.title ?? '')}${ctx.badge ?? ''}</div>
    <div class="chead">
      ${c.art ? `<img class="cface" src="${esc(ctx.artBase ?? '')}${esc(c.art)}" alt="">` : ''}
      <div>
        <div class="cname">${spoken(c.name, c.pinyin)} <span class="belem">${GLYPH[c.root] ?? ''}${ctx.lang === 'en' ? ` ${esc(c.root_name ?? '')}` : ''}</span>${c.elite ? ` <span class="celite">${ctx.lang === 'en' ? 'Elite' : '精英'}</span>` : ''}</div>
        ${c.lean ? `<div class="clean">${esc(w.lean?.[c.lean] ?? c.lean)}</div>` : ''}
        ${c.about ? `<p class="cabout">${esc(c.about)}</p>` : ''}
        ${c.goal ? `<p class="cgoal">${esc(c.goal)}</p>` : ''}
        ${(c.hints ?? []).map((h) => `<p class="cgoal chint">${esc(h)}</p>`).join('')}
      </div>
    </div>
    ${done ? '' : pouchPickHtml(brief, ctx)}
    ${done ? `<div class="cdone">${esc(done)}</div>${ctx.feed ? `<div class="cacts">${ctx.feed}</div>` : ''}` : `<div class="cacts"><button class="bact end" data-duel-start="${esc(brief.id)}">${esc(w.begin)}</button>${ctx.feed ?? ''}</div>`}
    ${!done && ctx.say ? `<div class="cdone">${esc(ctx.say)}</div>` : ''}
  </div>`;
}

/* 护体 and 抗 on a hero (the worn 法衣 and 佩, locked at the door): what is
   left of the shield, and each root that lands lighter. The shield stays
   drawn at 0 once it has taken a blow, so the player sees where it went. */
const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
function gearHtml(side, who, st, ctx) {
  const w = ctx.words;
  const hit = (st.log ?? []).some(t => t.act === 'hurt' && t.who === who && t.absorbed);
  const armor = side.armor > 0 || hit ? `<span class="barmor${side.armor ? '' : ' gone'}">${esc(w.armor)} <b>${side.armor ?? 0}</b></span>` : '';
  const ward = Object.entries(side.ward ?? {}).filter(([, n]) => n > 0)
    .map(([el, n]) => `<span class="bward">${esc(fill(w.ward, { el: ctx.lang === 'en' ? EN_EL[el] ?? el : GLYPH[el] ?? el, n }))}</span>`).join('');
  return armor || ward ? `<div class="bgear">${armor}${ward}</div>` : '';
}

/* ── The whole screen ── */

/* The beast's lines on the card: its opening under its name, and at the end
   its last word inside the seal — `won` when the player won, `lost` when the
   player lost; a beast that walked away says nothing. 银月's bubble is left
   empty: her words are hers, spoken in her own voice, and the page never
   holds them (never author a line for her). */
export function boutSays(says, outcome) {
  if (!says) return null;
  const end = outcome === 'won' ? says.won : outcome === 'lost' ? says.lost : null;
  return { foe: says.foe ?? null, end: end ?? null };
}


/* 问银月 (fightsay.js): her name on a small button by the turn, with the asks
   left; dim when it does not answer now (the beast's turn, asked this turn,
   her answer still coming). Absent when she is not with him (ctx.herAsk null). */
function askHerHtml(ctx) {
  const a = ctx.herAsk;
  if (!a || !a.left) return '';
  const label = (ctx.lang === 'en' ? 'Ask {name}' : '问{name}').replace('{name}', a.name ?? '');
  return `<button class="bask${a.can ? '' : ' dim'}" data-spot="ask"${a.can ? '' : ' aria-disabled="true"'} title="${esc(label)}">${esc(label)}<small>${a.left}</small></button>`;
}

/* 结束回合 is the turn's own seal (《炉石传说》's end-turn button): cinnabar and yours to press on your
   turn, burning when nothing else is left; on the beast's turn it goes to ink and names whose turn it
   is — the one place the eye checks (the pill by 认输 was too small to read it from). */
function endSealHtml(st, w, stuck, turn) {
  if (st.whose === 'foe' && st.outcome === 'open') return `<button class="bact end wait" data-spot="end" aria-disabled="true"><span class="bsealface"><b>${turn}</b></span></button>`;
  return `<button class="bact end${stuck ? ' urge' : ''}" data-spot="end"><span class="bsealface"><b>${esc(w.end)}</b></span></button>`;
}

/* What the room says back — a refused move, what to tap next, or that only 结束回合 is left — on the
   seam between the ranks (battle.css .bhints). */
function hintsHtml(w, note, advice, stuck) {
  const said = [note ? `<div class="bhint bno">${esc(w.why[note] ?? note)}</div>` : '', advice ? `<div class="bhint${stuck ? ' burge' : ''}">${esc(advice)}</div>` : ''].join('');
  return said ? `<div class="bhints">${said}</div>` : '';
}

/* `st` is `view(state)`, `offers` is `offers(state)`, `ctx` carries the
   catalog, the language and the words. `picked` is what the player is holding.
   `ctx.ended: false` keeps the closing card off while the last blow plays out. */
export function battleHtml(st, offers, ctx, picked = null, openLog = false, note = null, help = false) {
  const w = ctx.words;
  ctx.reasons = reasons(st, offers);
  const aim = aimable(offers, picked);
  ctx.aim = aim;
  ctx.st = st;
  ctx.striker = strikerOf(st, picked, ctx);
  // 锁 / 吞 held: the word the aimed body wears in place of a number.
  const heldCard = picked?.from === 'hand' ? ctx.catalog?.[st.you.hand[picked.index]] : null;
  ctx.verb = heldCard?.effect?.chain != null ? w.chained : heldCard?.effect?.swallow != null ? (ctx.lang === 'en' ? 'Swallow' : '吞') : null;
  const rank = (side, board, n) => {
    const cells = [];
    for (let i = 0; i < n; i += 1) {
      cells.push(board[i] ? minionHtml(board[i], side, i, ctx, picked) : `<div class="bminion empty" aria-label="${esc(w.empty)}"><i aria-hidden="true"></i></div>`);
    }
    return cells.join('');
  };
  const powerWhy = ctx.reasons.get('power')?.why;
  // What is there to do? If the only move left is to end the turn, SAY SO: he
  // sat on a turn with an empty purse and read it as the beast being stuck
  // (2026-09-18, "我打不了, 雷神不动").
  const canDo = offers.filter(o => o.ok && o.action.kind !== 'end');
  const stuck = st.outcome === 'open' && st.whose === 'you' && !canDo.length;
  const advice = picked ? (picked.from === 'board' ? w.pickTarget : ctx.verb ? w.pickRank : w.pickCard) : stuck ? w.nothing : null;
  const over = st.outcome !== 'open';
  const bubble = (who, text, name = '') => (text ? `<div class="bsay ${who}">${name ? `<b>${esc(name)}</b>` : ''}${esc(text)}</div>` : '');
  const turn = st.whose === 'you' ? (ctx.lang === 'en' ? 'Your turn' : '你的回合') : `${esc(ctx.foeName ?? '')}${ctx.lang === 'en' ? "'s turn" : '的回合'}`;
  // The whole stage (Hanli, 2026-10-15: the ink fight): the beast's plate at the top, its rank and
  // yours across the middle, you along the foot with the hand fanned under you. The weather's painting
  // shows through the paper (lingjing.js paintBackdrop); a tap anywhere that is no place puts back
  // what is held (`data-spot="stage"`, pickOf).
  return `<div class="battle el-${esc(st.foe.root ?? 'none')}${over ? ` over ${esc(st.outcome)}` : ''}${st.whose === 'foe' ? ' foes' : ''}" data-spot="stage">
    <div class="btop">
      <button class="bquit" data-spot="quit">${esc(w.quit)}</button>
      <button class="bhelpbtn${help ? ' on' : ''}" data-spot="help" title="${esc(w.how)}" aria-label="${esc(w.how)}">?</button>
      <span class="bturn ${st.whose}">${turn}</span>
      ${askHerHtml(ctx)}
      <span class="bwhere">${esc(ctx.title ?? '')}${ctx.stake ? `<small class="bstake">${esc(ctx.stake)}</small>` : ''}</span>
    </div>

    <button class="bside foe${aim.hero ? ' aiming aimed' : ''}${windUp(st)}" data-spot="hero">
      <span class="bplate">${ctx.foeArt ? `<img class="bface" src="${esc(ctx.foeArt)}" alt="">` : `<b class="bface none">${esc([...(ctx.foeName ?? '')][0] ?? '')}</b>`}</span>
      <div class="bwho"><span class="bfoename">${esc(ctx.foeName ?? '')} <span class="belem el-${esc(st.foe.root ?? 'none')}">${GLYPH[st.foe.root] ?? ''}</span></span>
        ${pool(w.hp, st.foe.hp, st.foe.hpMax, 'hp', st.foe.trial?.yield)}
        ${st.foe.trial?.survive ? `<small class="bstake bsurvive">${esc(ctx.lang === 'en' ? `Stood ${st.foe.endured ?? 0} of ${st.foe.trial.survive} turns` : `已站住 ${st.foe.endured ?? 0}/${st.foe.trial.survive} 回合`)}</small>` : ''}
        ${bubble('foe', ctx.says?.foe)}</div>
      <div class="bnums">
        ${gearHtml(st.foe, 'foe', st, ctx)}
        ${crystals(st.foe.mana, st.foe.manaMax, st.foe.manaCap)}${st.foe.drain ? `<small class="bdrain">${esc(fill(w.drainNext, { n: st.foe.drain }))}</small>` : ''}
      </div>
      ${deckHtml(st.foe.deck, 'theirs', w)}
      ${aim.hero && ctx.striker ? dmgBadge(st, ctx.striker.n, ctx.striker.element, st.foe.root, ctx.lang, true) : ''}
    </button>

    <div class="bomen">${feintHtml(st, ctx)}${chargeHtml(st, ctx)}${intentHtml(st, ctx)}</div>

    <div class="bfield">
      <div class="brank theirs" aria-label="${esc(w.theirs)}">${rank('theirs', st.foe.board, ctx.board)}</div>
      <div class="bseam">${lastHtml(st.log, ctx, openLog)}${hintsHtml(w, note, advice, stuck)}</div>
      <div class="brank mine" aria-label="${esc(w.yours)}">${rank('mine', st.you.board, ctx.board)}</div>
    </div>

    <div class="bside you">
      <div class="bwho" data-spot="self"><span class="byouname">${esc(ctx.youName ?? '')} <span class="belem el-${esc(st.you.root ?? 'none')}">${GLYPH[st.you.root] ?? ''}</span></span>
        ${pool(w.hp, st.you.hp, st.you.hpMax, 'hp')}
        ${bubble('her', ctx.says?.her, ctx.herName)}</div>
      <div class="bnums">
        ${gearHtml(st.you, 'you', st, ctx)}
        ${crystals(st.you.mana, st.you.manaMax, st.you.manaCap)}${st.you.drain ? `<small class="bdrain">${esc(fill(w.drainNext, { n: st.you.drain }))}</small>` : ''}
      </div>
      ${deckHtml(st.you.deck, 'mine', w)}
      ${partyHtml(st, ctx)}
      <div class="bacts">
        <button class="bact bpower el-${esc(st.you.root ?? 'none')}${powerWhy ? ' dim' : ''}${picked?.from === 'power' ? ' held' : ''}${!powerWhy && picked?.from !== 'power' ? ' can' : ''}" data-spot="power"${powerWhy ? ` title="${esc(w.why[powerWhy] ?? powerWhy)}"` : ''}>
          <span class="bsealface"><b>${esc(w.power)}</b><span class="belem">${GLYPH[st.you.root] ?? ''}</span></span>
          <small>${powerWhy ? esc(w.why[powerWhy] ?? powerWhy) : `${st.you.powerHit} · ${POWER_COST}${ctx.lang === 'en' ? ' ' : ''}${esc(w.mana)}`}</small>
        </button>
        ${endSealHtml(st, w, stuck, turn)}
      </div>
    </div>

    <div class="bdock">${pillTrayHtml(st, ctx, picked)}<div class="bhand">${handHtml(st, ctx, picked)}</div></div>

    ${help ? `<div class="bhelp" data-spot="help-bg"><div class="bsheet">
      <h3>${esc(w.how)}</h3>
      ${w.help.map(([k, v]) => `<p><b>${esc(k)}</b>${esc(v)}</p>`).join('')}
      <button class="bact" data-spot="help">${esc(w.close)}</button>
    </div></div>` : ''}
    ${over && ctx.ended !== false ? endHtml(st, ctx) : ''}
  </div>`;
}

/* How it ended, as the story view closes a 回 (story.css closecard): a paper card over the
   darkened stage, the cinnabar seal stamped on it — 胜 · 败 · 遁 · 过 — the line of how it went,
   and the beast's last word when it has one (a beast that walked away says nothing). The page
   holds it a moment by itself (lingjing.js settleBout); 收起 puts it away sooner. */
const ENDS = {
  zh: { won: '胜', passed: '过', lost: '败', withdrew: '遁', close: '收起', done: '完' },
  en: { won: 'Won', passed: 'Passed', lost: 'Lost', withdrew: 'Gone', close: 'Put away', done: 'over' },
};
export function endOf(st) {
  const passed = st.outcome === 'won' && (st.log ?? []).some(t => t.act === 'trial-passed');
  return passed ? 'passed' : st.outcome;
}
/* A beast beaten goes its own way — one of twenty lines, by the fight's seed (Hanli, 2026-10-15:
   「战胜后的“它退入雾中”能换一换吗?」 → 「从这20个里每次挑一个」), so a redraw keeps the same one. */
const wonLine = (st, lines) => lines[hashOf(`won|${st.seed ?? ''}|${st.turn ?? 0}`) % lines.length];
function endHtml(st, ctx) {
  const w = ctx.words, e = ENDS[ctx.lang === 'en' ? 'en' : 'zh'], end = endOf(st);
  const said = end === 'won' && w.wonSays?.length ? wonLine(st, w.wonSays) : w[`${end}Say`] ?? '';
  const title = [ctx.title, e.done].filter(Boolean).join(' · ');
  const bubble = (ctx.says?.end ? `<div class="bsay foe">${esc(ctx.says.end)}</div>` : '')
    + (ctx.says?.her ? `<div class="bsay her">${ctx.herName ? `<b>${esc(ctx.herName)}</b>` : ''}${esc(ctx.says.her)}</div>` : '');
  return `<div class="bover ${esc(st.outcome)}"><div class="card closecard bclose ${esc(end)}">
      <b class="bseal">${esc(e[end] ?? w[end] ?? '')}</b>
      <div class="closetitle">${esc(title)}</div>
      ${said ? `<p class="closedid">${esc(said)}</p>` : ''}
      ${bubble}
      <div class="acts"><button class="act closeshut" data-spot="close">${esc(e.close)}</button></div>
    </div></div>`;
}
