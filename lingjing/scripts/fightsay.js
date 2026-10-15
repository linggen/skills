// fightsay.js — 银月 in a fight (Hanli, 2026-10-15): she talks; the rules decide.
//
// Two ways she helps, both words only — she never plays a card:
//   1. 问银月 (asked): the player asks how to play this turn. She reads the
//      position as facts and suggests a move in her own voice.
//      ASK_LIMIT a fight, one a turn, only on the player's own turn.
//   2. 插嘴 (a cue): a key moment — the beast begins its 杀招, the player's
//      气血 under 30%, a big play by the player, the win over a strong foe,
//      the loss. At most CUE_LIMIT a fight, each kind once, never two in a row
//      (a turn between two; the closing one excepted), never over an ask.
//
// THE FACTS are built from what the page draws — `view(st)` (battle.js), never
// the raw state — so she knows nothing the player cannot see: the beast's hand
// is a count, its plan only what 望气术 shows, its 杀招 only once announced.
// They must fit the engine's 300-character event cap with the name line in
// front (FACTS_MAX), so they go in by what decides a move and stop when full.
//
// THE FIGHT NEVER WAITS ON HER. `speak` returns at once; her line comes when it
// comes. If nobody will hear it (a scratch save, the pet off: `sent` false) the
// fallback shows at once; if she is slow (WAIT_MS) the fallback shows, and her
// own line, should it still land while this fight is open, takes its place. The
// fallback pool below is the only code-held wording of hers (her rule: Yinyue
// writes every message — code gives facts).
//
// Pure of the DOM: the page hands in `ask`, the clock and the timers.

import { BEATS, TIERS, costOf, effectOf } from './battle.js';
import { intentBits, sayEffect, sigWords } from './battle-card.js';

export const ASK_LIMIT = 2;
export const CUE_LIMIT = 3;
export const WAIT_MS = 7000;
/* The engine keeps 300 characters of a moment (api/yinyue.rs EVENT_TEXT_MAX);
   the page puts 「（灵境里玩家叫X。）」 in front. */
export const FACTS_MAX = 260;
export const LOW_AT = 0.3;
/* A big play: one move of the player's takes a third of the beast's 气血, or
   drives two of its rank off. */
export const BIG_SHARE = 1 / 3;
export const BIG_DRIVEN = 2;
/* When two cues fall on one move, the one said. */
export const CUE_ORDER = ['lost', 'won', 'low', 'charge', 'big'];
const CLOSING = new Set(['lost', 'won']);

/* Short lines in her voice for when the model does not answer in time — the
   only words of hers the code holds. Two or three a moment, taken in turn. */
export const FALLBACK = {
  zh: {
    ask: ['先看它下回合要做什么，再出这一手。', '挑它阵前最碍事的那个先打掉。', '灵力别一口气花光，留一手护着自己。'],
    charge: ['小心，它在蓄杀招了。', '它憋着大招呢——下一手想好怎么接。', '它要放杀招了，护主能替你挡一下。'],
    low: ['气血不多了，稳着点……我在呢。', '别硬拼，先顾好你自己。'],
    big: ['漂亮！', '这一手好。', '哼，还算有点样子。'],
    won: ['赢了！它可不好对付——我就知道你行。', '这么强的对手都拿下了，真有你的。'],
    lost: ['没事，下回再来，我陪着你。', '输一场而已，记住它是怎么出手的。'],
  },
  en: {
    ask: ['See what it means to do next turn, then make your move.', 'Take out whatever in its rank is most in the way first.', "Don't spend all your Force at once — keep something back."],
    charge: ["Careful — it's gathering for its big one.", "It's winding up. Think how you'll meet it.", 'It will let go soon — a Guard can take it for you.'],
    low: ["You're low. Steady… I'm here.", "Don't trade blows now — look after yourself."],
    big: ['Nice!', 'That was a good one.', 'Hm. Not bad at all.'],
    won: ["You won! That one was no pushover — I knew you could.", 'Something that strong, and you beat it. Well done.'],
    lost: ["It's all right. We'll try again — I'm with you.", 'Just one fight. Remember how it moved.'],
  },
};

const GLYPH = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
const nameOf = (c, lang) => (typeof c?.name === 'string' ? c.name : c?.name?.[lang] ?? c?.name?.zh ?? '');
const plain = (t) => String(t ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const len = (t) => [...t].length;

/* One body on a rank, as the card shows it. */
function bodyWords(m, zh) {
  return `${m.name ? nameOf(m, zh ? 'zh' : 'en') : m.id}${m.atk}/${m.hp}${m.taunt ? (zh ? '护主' : ' Guard') : ''}${m.chained ? (zh ? '被锁' : ' chained') : ''}`;
}
/* One card in hand: its name, what it costs now and what it does now. */
function handWords(v, id, ctx, full) {
  const zh = ctx.lang !== 'en', c = ctx.catalog?.[id];
  if (!c) return null;
  const nm = nameOf(c, ctx.lang), cost = costOf(v.you, c);
  if (!full) return zh ? `${nm}${cost}` : `${nm} ${cost}`;
  const does = c.kind === 'minion'
    ? `${c.atk ?? 0}/${c.hp ?? 0}${c.keywords?.includes('taunt') ? (zh ? '护主' : ' Guard') : ''}`
    : plain(sayEffect({ ...c, effect: effectOf(v.you, c) }, ctx)).replace(/\s+/g, zh ? '' : ' ');
  return zh ? `${nm}(${cost}灵力,${does})` : `${nm} (${cost}, ${does})`;
}
function clashWords(you, foe, zh) {
  if (!you || !foe) return '';
  if (BEATS[you] === foe) return zh ? `你${GLYPH[you]}克它${GLYPH[foe]}。` : `Your ${you} overcomes its ${foe}.`;
  if (BEATS[foe] === you) return zh ? `它${GLYPH[foe]}克你${GLYPH[you]}。` : `Its ${foe} overcomes your ${you}.`;
  return '';
}
function rankWords(tiers, zh) {
  const a = TIERS.indexOf(tiers?.you), b = TIERS.indexOf(tiers?.foe);
  if (a < 0 || b < 0) return '';
  if (a === b) return zh ? '境界相当。' : 'Same realm.';
  return a > b ? (zh ? '你境界比它高。' : 'You are a realm above it.') : (zh ? '它境界比你高。' : 'It is a realm above you.');
}

/* What each kind asks of her — the tail of the facts, always kept. */
function tailOf(kind, zh, extra) {
  // The player's own words from the ask bar, kept short: the position comes first.
  const said = [...String(extra?.words ?? '').trim()];
  const words = said.length > 30 ? `${said.slice(0, 30).join('')}…` : said.join('');
  const T = {
    ask: zh ? `玩家问你这一手怎么打${words ? `：「${words}」` : ''}。用你自己的话给一个建议，一两句；只说建议，不替玩家出牌。`
      : `Player asks how to play this turn${words ? `: “${words}”` : ''}. Suggest a move, your words, a line or two.`,
    charge: zh ? '它刚开始蓄杀招。插一两句，你自己的话。' : 'It just began charging. A line, your words.',
    low: zh ? '玩家气血不到三成了。插一两句，你自己的话。' : 'Player under 30% Life. A line, your words.',
    big: zh ? `玩家刚打出漂亮的一手${extra?.what ? `（${extra.what}）` : ''}。插一句，你自己的话。` : `Player just made a big play${extra?.what ? ` (${extra.what})` : ''}. A line, your words.`,
    won: zh ? '这一仗赢了，对手比玩家强。说一两句，你自己的话。' : 'Won, against a stronger foe. A line or two, your words.',
    lost: zh ? '这一仗输了。说一两句，你自己的话。' : 'The fight is lost. A line or two, your words.',
  };
  return T[kind] ?? T.ask;
}

/* The position as facts, for one kind of word from her. `v` is view(st);
   ctx: { catalog, lang, foeName, tiers: {you, foe}, words } — the card's own
   ctx is enough. Returns the text (≤ FACTS_MAX characters). */
export function fightFacts(v, ctx, kind = 'ask', extra = {}) {
  const zh = ctx.lang !== 'en', foe = ctx.foeName ?? '';
  const sc = { ...ctx, st: v };
  const head = zh ? `斗法中，对手${foe}（${GLYPH[v.foe.root] ?? ''}）。` : `vs ${foe} (${v.foe.root ?? ''}).`;
  const tail = tailOf(kind, zh, extra);
  const sig = v.foe.signature, phase = v.foe.charge;
  const charging = v.outcome === 'open' && sig && (phase === 'gathering' || phase === 'ready');
  const sigName = sig ? nameOf(sig, ctx.lang) : '';
  const parts = [];
  if (charging) {
    const what = plain(sigWords(v, sc));
    parts.push(zh ? `它在蓄杀招「${sigName}」，${phase === 'ready' ? '下回合放出' : '再下回合放出'}${what ? `：${what}` : ''}。` : `Charging ${sigName}, ${phase === 'ready' ? 'next turn' : 'in 2 turns'}${what ? `: ${what}` : ''}.`);
  }
  // Both sides' 气血 always go in, right after what is coming.
  const hp = zh ? `你气血${v.you.hp}/${v.you.hpMax}，灵力${v.you.mana}/${v.you.manaMax}；它气血${v.foe.hp}/${v.foe.hpMax}。`
    : `You ${v.you.hp}/${v.you.hpMax} Life, ${v.you.mana}/${v.you.manaMax} Force; it ${v.foe.hp}/${v.foe.hpMax}.`;
  let plan = '';
  if (v.foe.intent && v.whose === 'you') {
    const bits = v.foe.intent.gathering ? [zh ? '蓄力，不出手' : 'gathers'] : intentBits(v, sc).map(plain);
    plan = zh ? `望气：它下回合${bits.join('、') || '只让阵前出手'}。` : `Its qi: next turn ${bits.join(', ') || 'only its rank strikes'}.`;
  }
  // Asked, what he holds comes before the beast's plan (the English cap is tight).
  if (kind !== 'ask') parts.push(plan);
  if (kind === 'ask') {
    parts.push(v.foe.board.length ? (zh ? `它阵前：${v.foe.board.map((m) => bodyWords(m, zh)).join('、')}。` : `Its rank: ${v.foe.board.map((m) => bodyWords(m, zh)).join(', ')}.`) : (zh ? '它阵前空。' : 'Its rank: none.'));
    const hand = (full) => v.you.hand.map((id) => handWords(v, id, ctx, full)).filter(Boolean);
    parts.push([zh ? `你手牌：${hand(true).join('、')}。` : `Your hand: ${hand(true).join('; ')}.`, zh ? `你手牌(灵力)：${hand(false).join('、')}。` : `Your hand (cost): ${hand(false).join(', ')}.`]);
    if (v.you.board.length) parts.push(zh ? `你阵前：${v.you.board.map((m) => bodyWords(m, zh)).join('、')}。` : `Your rank: ${v.you.board.map((m) => bodyWords(m, zh)).join(', ')}.`);
    parts.push(plan);
    parts.push(zh ? `主灵根一击${v.you.powerHit}点，2灵力${v.you.powerUsed ? '（本回合已用）' : ''}。` : `Root strike ${v.you.powerHit} for 2${v.you.powerUsed ? ' (used)' : ''}.`);
  }
  parts.push(clashWords(v.you.root, v.foe.root, zh));
  parts.push(rankWords(ctx.tiers, zh));
  if (kind === 'ask') parts.push(zh ? `牌库：你${v.you.deck}张，它${v.foe.deck}张；它手里${v.foe.hand}张。` : `Decks: you ${v.you.deck}, it ${v.foe.deck}; it holds ${v.foe.hand}.`);
  // In by priority while it fits; a part with a shorter form tries that next.
  let body = head + (zh ? '' : ' ') + hp;
  const room = () => (ctx.max ?? FACTS_MAX) - len(tail) - (zh ? 0 : 1);
  for (const p of parts) {
    for (const form of Array.isArray(p) ? p : [p]) {
      if (!form) continue;
      const next = body + (zh ? '' : ' ') + form;
      if (len(next) <= room()) { body = next; break; }
    }
  }
  return body + (zh ? '' : ' ') + tail;
}

/* What one stretch of the fight came to, for her cues: `before` and `after`
   are view(st) either side of it, `log` the entries in between, `fight`
   { strong } from the brief. Returns the kinds that fired (unordered). */
export function cuesOf(before, after, log, fight = {}) {
  const out = [];
  if (after.outcome === 'lost') out.push('lost');
  if (after.outcome === 'won' && fight.strong) out.push('won');
  if (after.outcome !== 'open') return out;
  if (log.some((t) => t.act === 'charge' && t.who === 'foe')) out.push('charge');
  const lowNow = after.you.hp < after.you.hpMax * LOW_AT, lowThen = before.you.hp < before.you.hpMax * LOW_AT;
  if (lowNow && !lowThen) out.push('low');
  return out;
}
/* A big play: one move of the player's. `log` is that move's entries. */
export function bigPlay(log, after, lang = 'zh') {
  const zh = lang !== 'en';
  const hit = log.filter((t) => t.act === 'hurt' && t.who === 'foe' && t.kind !== 'fatigue').reduce((n, t) => n + (t.amount ?? 0), 0);
  const driven = log.filter((t) => t.act === 'withdrew' && t.who === 'foe').length;
  if (hit >= Math.ceil(after.foe.hpMax * BIG_SHARE)) return zh ? `一手打掉它${hit}点气血` : `${hit} off its Life in one move`;
  if (driven >= BIG_DRIVEN) return zh ? `一手逼退它阵前${driven}个` : `${driven} of its rank driven off at once`;
  return null;
}
/* Is this foe stronger than the player — an elite, a trial, a person in a
   bout, or a realm above? The win over it is worth her word. */
export function strongFoe(brief) {
  const c = brief?.creature ?? {}, s = brief?.setup ?? {};
  return Boolean(c.elite || c.goal || c.person || TIERS.indexOf(s.foe?.tier) > TIERS.indexOf(s.you?.tier));
}

/* Her line as it came: one or two lines, trimmed for the bubble. */
export function cleanLine(text, max = 90) {
  let t = String(text ?? '').replace(/^\s*(\*\*)?(银月|Yinyue)(\*\*)?\s*[:：]\s*/i, '').replace(/\s+/g, ' ').trim();
  if (!t || /^SILENT\b/i.test(t)) return null;
  if (len(t) <= max) return t;
  const cut = [...t].slice(0, max).join('');
  const at = Math.max(...['。', '！', '？', '.', '!', '?', '…'].map((p) => cut.lastIndexOf(p)));
  return at > max / 3 ? cut.slice(0, at + 1) : `${cut}…`;
}

/* Called as methods, the browser's own would throw (Illegal invocation): wrapped. */
const BROWSER_TIMERS = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) };

/* One fight's worth of her. `ask(kind, facts)` → { sent: Promise<boolean>,
   line: Promise<string|null> } — whether anyone will hear it, and her line.
   `onLine({kind, text, from})` — from: 'wait' (text null) · 'her' · 'fallback'. */
export function createFightSay({ ask, onLine = () => {}, lang = () => 'zh', wait = WAIT_MS, timers = BROWSER_TIMERS } = {}) {
  const st = { asks: 0, askTurn: null, cues: 0, cueTurn: null, told: new Set(), seq: 0, line: null, pending: false, over: false, used: {} };
  const show = (line) => { st.line = line; onLine(line); };
  const fallbackOf = (kind) => {
    const pool = (FALLBACK[lang() === 'en' ? 'en' : 'zh'][kind]) ?? FALLBACK.zh.ask;
    const n = st.used[kind] ?? 0;
    st.used[kind] = n + 1;
    return pool[n % pool.length];
  };
  function speak(kind, facts) {
    const id = ++st.seq;
    let settled = false;
    st.pending = true;
    show({ kind, text: null, from: 'wait', id });
    const fall = () => {
      if (settled || id !== st.seq) return;
      settled = true;
      st.pending = false;
      show({ kind, text: fallbackOf(kind), from: 'fallback', id });
    };
    const timer = timers.set(fall, wait);
    // Never awaited by the caller: the fight goes on whatever she does.
    Promise.resolve()
      .then(() => ask(kind, facts))
      .then((r) => {
        Promise.resolve(r?.sent).then((sent) => { if (!sent) { timers.clear(timer); fall(); } }, () => { timers.clear(timer); fall(); });
        return r?.line;
      })
      .then((text) => {
        const said = cleanLine(text);
        if (!said || id !== st.seq || st.over) return;
        timers.clear(timer);
        settled = true;
        st.pending = false;
        show({ kind, text: said, from: 'her', id });
      })
      .catch(() => { timers.clear(timer); fall(); });
    return id;
  }
  return {
    st,
    /* Whether 问银月 answers now: her turn to be asked is the player's own. */
    canAsk(v) {
      return v.outcome === 'open' && v.whose === 'you' && !st.pending && st.asks < ASK_LIMIT && st.askTurn !== v.turn;
    },
    asksLeft() { return Math.max(0, ASK_LIMIT - st.asks); },
    ask(v, facts) {
      if (!this.canAsk(v)) return null;
      st.asks += 1;
      st.askTurn = v.turn;
      return speak('ask', facts);
    },
    /* The cues that fired on one move; at most one is said, if the limits allow. */
    cue(kinds, v, factsOf) {
      const kind = CUE_ORDER.find((k) => kinds.includes(k) && !st.told.has(k));
      if (!kind || st.cues >= CUE_LIMIT) return null;
      // The closing word may follow anything; a mid-fight one waits out a
      // pending word, an ask this turn, and a cue on this turn or the last.
      if (!CLOSING.has(kind)) {
        if (st.pending || st.askTurn === v.turn) return null;
        if (st.cueTurn != null && v.turn - st.cueTurn < 2) return null;
      }
      st.told.add(kind);
      st.cues += 1;
      st.cueTurn = v.turn;
      return speak(kind, factsOf(kind));
    },
    /* The room closed: a late line of hers lands in the chat only. */
    close() { st.over = true; },
  };
}
