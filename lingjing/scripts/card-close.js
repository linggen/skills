// card-close.js — every card and overlay the page raises over the scene closes, and comes back (Hanli 2026-11-04:
// 「这个狰的卡…然后就关不上了, 加个关闭按钮吧. 应该所有卡都有关闭按钮」 · 「商店卡关上应该能从某个地方点开. 其他卡也是,
// 你check一下, 别有漏洞」). Two halves, one table each:
//   1. a close: the one ✕ at the top right (the boards' own, games/shell.js `.gshell-close`), Esc, and a tap on
//      the veil of a modal;
//   2. a reopen: a visible, standing place that brings it back — closing never loses anything.
// STAGE declares every card kind the stage can draw (cards.js RENDER, lingjing.js PAGE_CARDS); OVERLAYS every
// popover and modal. tests/card-close.test.mjs reads both against the source: a kind or a `role="dialog"` root
// with no row fails, and each row's close and reopen must name a control the page really has. Pure.

import { esc } from './esc.js';

export const CLOSE_WORDS = { zh: '合上', en: 'Close' };

/** The ✕: the shell's round close (shell.css `.gshell-close`), pinned to its card's top right (`.cardx`). */
export const closeX = (lang, attrs, label = null) => {
  const word = label ?? CLOSE_WORDS[lang] ?? CLOSE_WORDS.zh;
  return `<button type="button" class="gshell-btn gshell-close cardx" title="${esc(word)}" aria-label="${esc(word)}" ${attrs}>✕</button>`;
};

/** `html` (one root element) with `btn` as the root's first child. */
export function withCloseX(html, btn) {
  const at = String(html ?? '').indexOf('>');
  return at < 0 ? html : `${html.slice(0, at + 1)}${btn}${html.slice(at + 1)}`;
}

/* Every stage card kind: how it closes, where it comes back, and whether that place stands in sight without a trick.
   close:  'away' — the page's ✕ puts it away (data-card-away); 'own' — the card's own ✕ (`attr`); 'none' — no ✕, `why`.
   scope:  'told' — put away until Ling shows anew (what she Showed follows him from place to place);
           'place' — put away here; walking on brings it back as Look has it.
   reopen: the controls that bring it back (attributes the page draws); `chip` — the tray's 收起 chip (data-card-back)
           is one of them. `visible`: false when the only way back takes knowing where to look. */
export const STAGE = {
  creature: { close: 'away', scope: 'told', chip: true, reopen: ['data-card-back', 'data-codex-open'], visible: true,
    what: 'a beast\'s card (Ling\'s Show, or 先降后收\'s 收服 once beaten)', also: '书 › 九鼎录 › 图鉴' },
  codex: { close: 'away', scope: 'told', chip: true, reopen: ['data-card-back', 'data-codex-open'], visible: true, what: '图鉴 entry Ling showed', also: '书 › 九鼎录 › 图鉴' },
  meet: { close: 'away', scope: 'place', chip: true, reopen: ['data-card-back', 'data-codex-open'], visible: true, what: '初见: the 图鉴 card of a face the scene brings on', also: '书 › 九鼎录 › 图鉴' },
  item: { close: 'away', scope: 'told', chip: true, reopen: ['data-card-back', 'data-shop-open', 'data-gear'], visible: true,
    what: 'an item Ling showed, or the shop\'s shelf', also: 'the shelf: the header\'s 「有铺子」 (data-shop-open); a thing held: 物品' },
  map: { close: 'away', scope: 'told', chip: true, reopen: ['data-card-back', 'data-roads'], visible: true, what: '九州 map Ling showed', also: '去往 ▾' },
  traits: { close: 'away', scope: 'told', chip: true, reopen: ['data-card-back'], visible: true, what: '灵根 card' },
  gate: { close: 'away', scope: 'told', chip: true, reopen: ['data-card-back'], visible: true, what: 'a 关隘 card' },
  tribulation: { close: 'away', scope: 'told', chip: true, reopen: ['data-card-back'], visible: true, what: '天劫 card' },
  treasure: { close: 'away', scope: 'told', chip: true, reopen: ['data-card-back', 'data-gear'], visible: true, what: '本命法宝', also: '物品' },
  hexagram: { close: 'away', scope: 'told', chip: true, reopen: ['data-card-back', 'data-shelf'], visible: true, what: 'the day\'s coins (old 问卦)', also: '书 › 今日签' },
  // 秘境令 away from the door: the tray's own 秘境 row stands again once the card is down (rules/aside.mjs `stage: 'mijing'`),
  // with the same 去石门 ›; at the door and after a run, the 收起 chip. Inside a run it is the run.
  mijing: { close: 'away', scope: 'place', chip: (look) => !look?.mijing?.away, reopen: ['data-card-back', 'data-go', 'data-gear'], visible: true,
    none: (look) => Boolean(look?.mijing?.inside), what: '秘境探险: 秘境令 · 石门 (away), the door\'s 重, a run\'s pay', also: 'away: the tray\'s 秘境令 row; 物品 holds the 令' },
  handed: { close: 'away', scope: 'place', chip: true, reopen: ['data-card-back', 'data-book'], visible: true, what: '所得 of an errand met', also: '事 (the done fold)' },
  offer: { close: 'away', scope: 'place', chip: true, reopen: ['data-card-back', 'data-book'], visible: true, what: 'errands held out here', also: '事 › 可接' },
  duel: { close: 'own', attr: 'data-panel-exit', reopen: ['data-card-back', 'data-duel-start'], visible: true,
    what: 'a fight: a story fight\'s 留 · ✕ (cards.js passOut); a haunt\'s beast puts away with the page\'s ✕', away: (c, look) => look?.place?.encounter?.game?.id === c.id },
  board: { close: 'own', attr: 'data-board-leave', reopen: ['data-play', 'data-kept-open'], visible: true, what: 'every board: the shell\'s 留 · ✕ (games/shell.js outHtml)' },
  tale: { close: 'own', attr: 'data-board-leave', reopen: ['data-book'], visible: true, what: '传闻\'s step: its board\'s shell ✕, a riddle\'s 留 · ✕', also: '事 › 传闻' },
  lundao: { close: 'away', scope: 'place', chip: true, reopen: ['data-card-back'], visible: true, what: '论道 offered or under way' },
  duizi: { close: 'away', scope: 'place', chip: true, reopen: ['data-card-back', 'data-duizi-open'], visible: true, what: '对对子', also: 'the tray\'s 对对子 row' },
  quest: { close: 'none', why: 'the search\'s step on this very spot: the line under his feet, its own answer on the card' },
  road: { close: 'none', why: '路上: mist, then 收下 or 不取, or a 抉择\'s ways — the rules wait on the answer, and 不取 is its way past' },
  closed: { close: 'own', attr: 'data-close-chapter', reopen: ['data-lu'], visible: true, what: 'a chapter\'s ending card: 合上 and ✕', also: '书 › 九鼎录' },
  seclude: { close: 'own', attr: 'data-seclude-close', reopen: ['data-seclude-open'], visible: true, what: '闭关\'s chooser', also: 'the tray\'s 闭关 · 体力' },
  seclusion: { close: 'none', why: '闭关 running: 出关 is the one way on, the world holds still till it is taken' },
  panel: { close: 'none', why: 'the scene card: its choices are the story\'s way on — put away, the stage would stand blank' },
  value: { close: 'none', why: 'a scene\'s value exit (the 名字): the rules wait on the name' },
  born: { close: 'none', why: '生辰 at the 入门仪式: the rules wait on it (or 交给灵石, its way past)' },
  breakthrough: { close: 'none', why: '渡劫\'s throw: the scene\'s exit; the roads stand under it, so he can walk off to prepare' },
  people: { close: 'none', why: 'the header\'s faces, not a card over the scene' },
  goal: { close: 'none', why: 'drawn in the 事 book (stage.mjs BOOK), never over the scene' },
  building: { close: 'none', why: 'a notice while the place is painted; it goes by itself' },
  empty: { close: 'none', why: '体力 spent: the notice and its 闭关 — the tray\'s rest card says the same' },
  next: { close: 'none', why: '下一步: the way on when nothing else stands — never a blank stage' },
  fight: { close: 'own', attr: 'data-fight-tap', reopen: ['data-duel-start'], visible: true, what: 'the fight room: the bar\'s ✕ (认输)' },
  memory: { close: 'none', why: '银月\'s memory: a moment, a tap skips it; kept in 书 › 九鼎录 › 记忆' },
  homing: { close: 'none', why: '鼎归: a moment, a tap skips it' },
  doors: { close: 'none', why: '息壤\'s doors: a moment, a tap goes on' },
  unfold: { close: 'none', why: '地图展开: a moment, a tap goes on' },
};

/* Every popover and modal over the scene: its root (the class the source draws), its close, Esc, its veil, and the
   chip that opens it again. `file`: where the root is drawn. `transient`: a toast or a moment, with why it needs no
   way back. */
export const OVERLAYS = {
  book: { root: 'bookpop', file: 'cards.js', close: 'data-pop-close', reopen: 'data-book', esc: true, outside: true, what: '事' },
  ledger: { root: 'ledgerpop', file: 'cards.js', close: 'data-pop-close', reopen: 'data-ledger', esc: true, outside: true, what: '恩仇录' },
  shelf: { root: 'shelfpop', file: 'lingjing.js', close: 'data-pop-close', reopen: 'data-shelf', esc: true, outside: true, what: '书' },
  roads: { root: 'roadspop', file: 'lingjing.js', close: 'data-pop-close', reopen: 'data-roads', esc: true, outside: true, what: '去往 (and a held road\'s lock)' },
  weather: { root: 'wxpop', file: 'sky.js', close: 'data-pop-close', reopen: 'data-wx', esc: true, outside: true, what: '天气' },
  lu: { root: 'lu', file: 'lu.js', close: 'data-lu-close', reopen: 'data-lu', esc: true, outside: false, what: '九鼎录' },
  pouch: { root: 'lu pouch', file: 'pouch.js', close: 'data-pouch-close', reopen: 'data-gear', esc: true, outside: false, what: '储物袋 · 物品' },
  log: { root: 'dlglog', file: 'dialogue.js', close: 'data-dlg-logclose', reopen: 'data-dlg-log', esc: true, outside: false, what: '回看' },
  qian: { root: 'qianbox', file: 'lingjing.js', close: 'data-qian-close', reopen: 'data-divine', esc: true, outside: true, what: '问签 (the day\'s first open)' },
  codexBig: { root: 'boxcard', file: 'lingjing.js', close: 'data-box-close', reopen: 'data-codex-big', esc: true, outside: true, what: '图鉴, large' },
  kanjia: { root: 'kj-sheet', file: 'kanjia.js', close: 'data-talk-tool', reopen: 'data-kanjia-pick', esc: true, outside: true, what: '砍价' },
  spent: { root: 'spentcard', file: 'spent-card.js', close: 'data-spent-close', reopen: null, esc: true, outside: true, what: 'free tokens spent',
    transient: 'a notice of a refused turn: the chat\'s own card says it again on the next turn' },
};

/* What a stage card closes as, on this Look: 'away' (the page's ✕), 'own', or 'none'. */
export function closeOf(card, look) {
  const row = STAGE[card?.card];
  if (!row) return 'none';
  if (row.none?.(look)) return 'none';
  if (row.close === 'own' && row.away?.(card, look)) return 'away';
  return row.close;
}

/* The put-away key of a card: its kind and id, as stage.mjs slotKey. */
export const awayKey = (c) => `${c.card}:${c.id ?? ''}`;

/* Put away holds while it is in scope: a told card until Ling's next Show (scope 'told': `place` null), any other at
   the place it was put away. */
export const awayHolds = (entry, here) => entry.place == null || entry.place === here;

/* The stage with what he put away taken off: `{ cards, away }` — `away` the cards taken off, for the 收起 chip. */
export function stageMinusAway(cards, entries, here, look) {
  const off = new Set((entries ?? []).filter((e) => awayHolds(e, here)).map((e) => e.key));
  const away = [], kept = [];
  for (const c of cards ?? []) (off.has(awayKey(c)) && closeOf(c, look) === 'away' ? away : kept).push(c);
  return { cards: kept, away };
}

/* The tray's chip for each card put away whose way back is the chip (STAGE `chip`): 「↩ 狰」. */
export function awayChipsHtml(away, { look, name }) {
  return (away ?? []).filter((c) => { const chip = STAGE[c.card]?.chip; return typeof chip === 'function' ? chip(look) : Boolean(chip); })
    .map((c) => `<button type="button" class="bookchip awaychip" data-card-back="${esc(awayKey(c))}" title="${esc(name(c))}">↩ ${esc(name(c))}</button>`).join('');
}

/* The notes over the stage (lingjing.js toastsHtml): each wears the ✕ (toastX), and goes by itself too. None needs a way
   back — what it told is already in hand, and `kept` says where. `fullOffer` is the one that waits on him. */
export const TOASTS = {
  emerged: { close: 'data-emerged-close', kept: '出关\'s gains: the strip (修为 · 体力) and 物品', what: '出关 · what 闭关 grew' },
  trialTold: { close: 'data-toast-close', kept: 'the way taken at the 抉择: the story\'s 回看', what: '抉择 told' },
  spoils: { close: 'data-spoils-close', kept: '所得: 修为 · 灵石 on the strip, things and gear in 物品 (储物袋), cards in 物品 › 牌 and 书 › 九鼎录 › 牌谱; its `line` alone is told once', what: '所得 after a fight' },
  handin: { close: 'data-handin-close', kept: '交差: 事 › 已交', what: 'an errand handed in' },
  fullOffer: { close: 'none', why: '储物袋满了: what came while the pouch was full waits at the door for his choice (take · swap · leave) — the rules hold it till then (pouch.js)' },
};
