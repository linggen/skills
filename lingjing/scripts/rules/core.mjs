// rules/core.mjs — Changing it: refusals, pay, riddles, stamina, resolve and judge.
// Part of the rules engine; rules.mjs is its one door.
import { gameOf, MADE_GRANT } from '../content.mjs';
import { addProgress, dayKey, fill, fitValue, lockedOf, normalizeAnswer, payOf, personOf, pick, rollDay, settleStamina, speedOf, staminaReturnsAt, stepName, threshold, tierOf } from '../state.mjs';
import { growTreasure, learn } from './arms.mjs';
import { askOf } from './ask.mjs';
import { gainCard, starterOf } from './cards.mjs';
import { breakthroughOf, threadOf } from './errands.mjs';
import { coolingUntil, oddsOf, throwOn } from './breakthrough.mjs';
import { sceneBrief, spoken, wordsOf } from './look.mjs';
import { hashOf } from './travel.mjs';
import { herBeat, storyNode, withHerBeat } from './story.mjs';
import { stow, storedLine } from './pouch.mjs';
import { bornRoots, rootName, starterFor, stoneRoots } from './roots.mjs';
import { oweExit, spanLines } from './tell.mjs';
import { companionOf } from './companion.mjs';
import { grantMemory } from './memories.mjs';
import { writeLedger } from './ledger.mjs';
import { atScene, inMade, placeName, placeOf, placeOpen, sceneOf, settlePlace, tooHard } from './world.mjs';

/* ── Changing it ── */

const refuse = (refused, say, extra = {}) => ({ state: null, result: { ok: false, refused, say: say ?? null, ...extra } });
const clone = state => structuredClone(state);

function meets(state, needs, now = new Date()) {
  if (needs.bag && !(state.bag[needs.bag] > 0)) return false;
  if (needs.task && state.tasks[needs.task]?.status !== 'done') return false;
  if (needs.wealth && !(state.wealth >= needs.wealth)) return false;
  // A choice a thread sets up (an errand handed in), and a day that must pass
  // since the story marked its eve (the 大比 is tomorrow: a real local day).
  if (needs.quest && !state.quests?.[needs.quest]?.done_at) return false;
  if (needs.day_after && !(state.mark_days?.[needs.day_after] && state.mark_days[needs.day_after] < dayKey(now))) return false;
  return true;
}

/* Pay a grant: the table capped it when it was authored, the traits speed
   progress, and the tier's `pay` scales what is finally added, so a task high
   on the ladder pays like one. The day's reading never touches pay: 问卦 is
   the day's fight luck alone (redesign-v2 § 四). No day cap: 灵气 alone limits a day's play (his,
   2026-09-23: 去掉吧，只用体力限制). The 240/60 caps came 2026-09-11, before
   灵气 existed, and after it was kept as a safety net nobody re-decided —
   invisible, it turned his last errand and a pill into +0 with 灵气 to spare.
   `state.day` still counts what the day paid. */
function amountsOf(content, state, now, grant) {
  const table = content.rewards.tables[grant.table];
  const want = Math.round(Math.min(grant.progress ?? 0, table.progress) * speedOf(content, state));
  const base = Math.max(0, want);
  const wealth = Math.max(0, Math.round(Math.min(grant.wealth ?? 0, table.wealth)));
  return { base, progress: base * payOf(content, state), wealth };
}

/* What a grant would pay him now — the table's cap, his roots, the day's
   cast and his tier all counted — so a card shows the number that lands,
   not the authored one (review, 2026-09-24). A realm at its peak may hold
   some of it back; that is told when it is paid. */
const paysOf = (content, state, now, grant) => {
  if (!grant || !content.rewards.tables[grant.table]) return null;
  const { progress, wealth } = amountsOf(content, state, now, grant), shut = lockedOf(content, state);
  return { progress: shut.includes('cultivation') ? 0 : progress, wealth: shut.includes('wealth') ? 0 : wealth };
};

function pay(content, state, ctx, grant, landing = state) {
  rollDay(state, ctx.now);
  // Before a story gate nothing it keeps is paid (state.mjs lockedOf): read
  // where the move lands — the hall's three stones land in the outer court.
  const shut = lockedOf(content, landing);
  const due = amountsOf(content, state, ctx.now, grant);
  const base = shut.includes('cultivation') ? 0 : due.base, progress = shut.includes('cultivation') ? 0 : due.progress, wealth = shut.includes('wealth') ? 0 : due.wealth;
  state.day.progress += base; state.day.wealth += wealth; state.wealth += wealth;
  const { levels, hold } = addProgress(content, state, progress);
  if (grant.cast && !state.cast.includes(grant.cast)) state.cast.push(grant.cast);
  // A beast that joins brings its card; a grant may name one outright.
  const day = dayKey(ctx.now);
  const cards = [[grant.cast, { how: 'tame', creature: grant.cast, day }], [grant.card, { how: 'story', day }]]
    .map(([id, from]) => (id ? gainCard(content, state, id, from) : null)).filter(Boolean);
  // A thing granted goes into the 储物袋 — or, full, waits at the 洞府 (pouch.mjs).
  const stowed = grant.item ? stow(content, state, grant.item) : null;
  const full = storedLine(state, [stowed]);
  // An art is taught by a person, in a scene — never by the beast itself.
  const learned = grant.art ? learn(content, state, grant.art) : null;
  const named = levels.map(l => ({ from: stepName(content, l.from.tier, l.from.step, state.lang), to: stepName(content, l.to.tier, l.to.step, state.lang) }));
  // `progress` is what the realm really took; at the peak the rest is held.
  return { progress: progress - (hold?.held ?? 0), wealth, cast: grant.cast ?? null, item: grant.item ?? null, ...(full ? { stored: true, pouch_full: full } : {}), levels: named, hold, ...(cards.length ? { cards } : {}), ...(learned ? { learned } : {}) };
}

/* A riddle is answered wrong at most this many times a day. */
const RIDDLE_TRIES = 2;

/* An exit's riddles: `key` is one riddle or a pool of them. */
const riddlePool = exit => (Array.isArray(exit.key) ? exit.key : [exit.key]);
const riddleSlot = (scene, exit) => `${scene.id}/${exit.id}`;

/* The riddle an exit asks: today's, once asked; else one this play has not
   seen, by the day and the 名字 — never twice in one play (his rule,
   2026-09-17) until the pool is spent, and then never the last one again. */
export function riddleOf(state, scene, exit, now) {
  const pool = riddlePool(exit), slot = state.riddles?.[riddleSlot(scene, exit)];
  if (slot?.day === dayKey(now) && pool.includes(slot.key)) return slot.key;
  const seen = new Set(state.riddles_seen ?? []);
  let fresh = pool.filter(k => !seen.has(k));
  if (!fresh.length) fresh = pool.length > 1 ? pool.filter(k => k !== slot?.key) : pool;
  return fresh[hashOf(`${dayKey(now)}|${state.name ?? ''}|${riddleSlot(scene, exit)}`) % fresh.length];
}
const triedToday = (state, scene, exit, key, now) => {
  const slot = state.riddles?.[riddleSlot(scene, exit)];
  return slot?.day === dayKey(now) && slot.key === key ? slot.tried ?? [] : [];
};
/* The riddle asked is kept: seen for the play, and today's misses. A seen
   one asked on a new day means its pool was spent — the round begins again
   with it. `open`: the riddle is the question on the table until it is
   answered, shut, or set aside. */
function keepRiddle(s, scene, exit, key, now, tried, open = false) {
  const id = riddleSlot(scene, exit), slot = s.riddles?.[id], seen = s.riddles_seen ?? [];
  const today = slot?.day === dayKey(now) && slot.key === key;
  const pool = riddlePool(exit);
  s.riddles_seen = seen.includes(key) && !today ? [...seen.filter(k => !pool.includes(k)), key] : [...new Set([...seen, key])];
  s.riddles = { ...s.riddles, [id]: { day: dayKey(now), key, tried, ...(open ? { open: true } : {}) } };
}
const riddleOpen = (state, scene, exit, key, now) => {
  const slot = state.riddles?.[riddleSlot(scene, exit)];
  return Boolean(slot?.open && slot.day === dayKey(now) && slot.key === key);
};

/* 先不答 on a riddle on the table sets it aside: the scene's own question
   comes back. Null when there is nothing to set aside. */
function setRiddleAside(content, state, ctx) {
  if (!ctx.said || !atScene(content, state)) return null;
  const ask = askOf(content, state, ctx);
  const back = ask.options.some(o => o.answer != null) && ask.options.find(o => o.look && o.label === String(ctx.said).trim());
  if (!back) return null;
  const s = clone(state), prefix = `${sceneOf(content, s).id}/`;
  s.riddles = Object.fromEntries(Object.entries(s.riddles).map(([id, slot]) => [id, id.startsWith(prefix) ? { ...slot, open: undefined } : slot]));
  return s;
}

function judgeAnswer(content, key, answer) {
  const said = normalizeAnswer(answer);
  if (!said) return false;
  return ['zh', 'en'].some(lang => content.riddles[lang].riddles[key].a.some(a => normalizeAnswer(a) === said));
}

const hourOf = (at, lang) => at.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit' });

/* An action costs stamina — settled by the clock first. Refused, it says
   when the pool holds enough again, in the world's words, and the state is
   untouched. */
/* A chapter marked `free` (the prologue) asks no 灵气 for its own steps
   and bouts: a new player finishes the opening in one sitting. */
const CHAPTER_COSTS = new Set(['step', 'duel', 'move']);
const freeHere = (content, s, kind) => CHAPTER_COSTS.has(kind) && !inMade(s)
  && Boolean(content.chapters[s.chapter]?.free) && !s.ended.includes(s.chapter);

/* 体力 is the only limit on a day's play (his, 2026-09-23): moving costs by
   the road, a fight, a 奇遇, a story step, a choice and a taming cost, and a
   hosted game (the six boards, 炼丹 among them, and 论道) costs what a step
   does (2026-09-24); taps that take no time — the market, errands, 起卦,
   疗伤, 历练 — cost nothing. rewards.json § stamina.cost holds the numbers.
   `n` is how many. */
function spendStamina(content, s, ctx, kind, n = 1, fixed = null) {
  if (freeHere(content, s, kind)) return null;
  settleStamina(content, s, ctx.now);
  // A trip is paid as one (his, 2026-09-23: 几分钟消耗光 — seven roads at 3
  // each emptied a fifth of the pool in one tap): a base, a little per road
  // beyond the first, capped. The pool lasts about an hour of his pace.
  const c = fixed ?? content.rewards.stamina.cost[kind] ?? 0;
  const cost = typeof c === 'object' ? Math.min(c.max, c.base + Math.max(0, n - 1) * c.per_road) : c * n;
  // The last point still buys any one thing, and takes him to 0 (his rule,
  // 2026-09-23: 最后的体力即使只有1, 也允许…然后提示用户返回现实世界休息);
  // only at 0 is he refused, and the empty pool sends him to real life.
  // Run to 0, he rests until the pool is back to `rest` — the last point is
  // once a pool, not every refill (his screen, 2026-09-23: 体力都空了, 还能
  // 开始战斗 — one point back in 3 minutes started a 12-point elite fight).
  const restAt = content.rewards.stamina.rest ?? 0;
  if (s.resting && s.stamina >= restAt) delete s.resting;
  if (!cost || (s.stamina > 0 && !s.resting)) {
    s.stamina = Math.max(0, s.stamina - cost);
    if (cost && s.stamina === 0) s.resting = true;
    return null;
  }
  const at = staminaReturnsAt(content, s, s.resting ? restAt : 1);
  const w = wordsOf(content, s.lang);
  const say = s.lang === 'zh'
    ? `${w.pool}耗尽了。回到现实里歇一歇，${hourOf(at, 'zh')} 再来。`
    : `Your ${w.pool.toLowerCase()} is spent. Rest in the real world a while; come back at ${hourOf(at, 'en')}.`;
  return refuse('no-stamina', say, { stamina: s.stamina, cost, returns_at: at.toISOString() });
}

/* An offered name picked in either form is kept in its zh form: the 名字 is
   a Chinese name, whatever language it was picked in. */
function offeredForm(value, rule) {
  const key = value.toLowerCase();
  const hit = (rule.offers ?? []).find((o) => o.zh === value || String(o.en ?? '').toLowerCase() === key);
  return hit?.zh ?? value;
}

function cleanValue(raw, rule) {
  const value = fitValue(raw, rule.max_chars);
  return value && fitValue(offeredForm(value, rule), rule.max_chars);
}

/* An exit with `value` (the 名字) is named on the page's card — the player
   taps an offered name or writes their own, and the page resolves it. Ling
   never fills it in: live, 2026-09-28, she asked 「取一个道号」 as the only
   option and, tapped, Resolved it with 青玄 — every player became 青玄. So
   her Resolve of such an exit is refused unless the value stands in the
   player's own typed words (`said`); the page's path (no reader) is never
   gated. Null: not such an exit, or theirs. */
const THEN_PAGE_NAMES = 'This is named on the page\'s card: the player taps an offered name there or writes their own, and the page tells you `[scene] named`. Nothing changed. End on one line inviting them to the card — never AskUser for it, never name one for them, never Resolve it yourself.';
export function pageNames(content, state, args) {
  const exit = sceneOf(content, state)?.exits?.find(e => e.id === args.exit);
  // The 生辰 is the player's alone, typed on the page's card and never said
  // in the chat: Ling never Resolves it, whatever the words (roots.mjs).
  // A save that already holds its roots (v1) keeps them, and the exit is a plain step.
  if (exit?.born && !state.traits?.length) return { ok: false, refused: 'page-born', say: null, then: THEN_PAGE_BORN };
  if (!exit?.value) return null;
  const typed = String(args.said ?? '').trim(), value = String(args.value ?? '').trim();
  if (value && typed && !typed.startsWith('[') && typed.toLowerCase().includes(value.toLowerCase())) return null;
  return { ok: false, refused: 'page-names', say: null, then: THEN_PAGE_NAMES };
}

const THEN_PAGE_BORN = 'The birthday is given on the page\'s card (or left to the stone) — it is private and never said in the chat; the page tells you `[scene] born` when the roots are read. Nothing changed. End on one line inviting them to the card — never AskUser for it, never ask the date yourself, never Resolve it.';

/* The name card's 男 · 女, as the rules keep it — anything else is not said. */
const GENDERS = new Set(['female', 'male']);

/* 生辰 → 灵根 at the 入门仪式 (roots.mjs): always five, 五行杂灵根 — the
   birthday, read here and let go, names the one that leads (a tie by the
   save's start); skipped, five even and none leads. A save that already holds
   its roots keeps them (the four of v1 among them): nothing is read again.
   The 命格 stays the coins card's own choice (fortune.mjs): the roots set
   nothing else, so the day's fights read as they did. */
function readRoots(content, s, ctx, args) {
  if (s.traits?.length) return { kept: true };
  const birth = args.birth ? String(args.birth).trim() : null;
  const read = birth ? bornRoots(content, birth, s.created ?? '') : args.skip ? stoneRoots(content) : null;
  if (!read || (birth && new Date(`${birth}T00:00:00`) > ctx.now)) return null;
  const roots = read.roots;
  s.traits = roots;
  if (read.main) s.root_main = read.main;
  // The root test hands over the starter — the first cards he holds.
  const starter = starterFor(content, roots);
  s.cards = [...new Set([...(s.cards ?? []), ...starter])];
  s.card_from = { ...Object.fromEntries(starter.map(id => [id, { how: 'starter', place: s.place ?? null, chapter: s.chapter ?? null, day: dayKey(ctx.now) }])), ...(s.card_from ?? {}) };
  return { read: birth ? 'birth' : 'stone' };
}

/* The cauldron shut after a failed throw, in the world's words: when. */
function coolingSay(lang, at, now) {
  const later = at.toDateString() !== now.toDateString();
  return lang === 'zh'
    ? `雷劫的余威还在经脉里游走，鼎气不肯近身。${later ? '明日' : ''}${hourOf(at, 'zh')} 以后再来。`
    : `The tribulation still runs through your meridians; the cauldron's breath will not come near. Come back after ${hourOf(at, 'en')}${later ? ' tomorrow' : ''}.`;
}

/* A breakthrough is thrown on the page's card, where its odds stand (Hanli,
   2026-09-28): Ling's Resolve of a cauldron ready to take is refused, so the
   throw never lands before the player has seen what feeds it. Not ready —
   below the peak, or shut after a failure — her Resolve still hears why.
   Null: not such an exit, or not ready. */
const THEN_PAGE_THROWS = 'The breakthrough is thrown on the page\'s card, where its chance and what feeds it stand; the player throws there, and the page tells you `[scene] breakthrough won|failed`. Nothing changed. End on one line inviting them to the cauldron — never AskUser for it, never promise how it will go, never Resolve it yourself.';
export function pageThrows(content, state, args) {
  const exit = sceneOf(content, state)?.exits?.find(e => e.id === args.exit);
  if (!exit?.breakthrough || !breakthroughOf(content, state, args.now ?? new Date()).ready) return null;
  return { ok: false, refused: 'page-throws', say: null, then: THEN_PAGE_THROWS };
}

/* Entering a scene offers its tasks. */
function offerTasks(content, state) {
  const scene = sceneOf(content, state);
  for (const id of scene?.offers?.tasks ?? []) state.tasks[id] ??= { status: 'offered' };
}

/* The story lifts the realm to a layer of the first tier (an exit's `rise`,
   1-based: 小周天 is 一层, 息壤 五层) — never down, never past its tier, once:
   a scene played again lifts nothing, and before a story gate nothing moves. */
function riseTo(content, s, layer, replay) {
  const tier = content.ladder.tiers[0];
  if (replay || s.tier !== tier.id || s.step >= layer - 1 || lockedOf(content, s).includes('cultivation')) return null;
  const from = stepName(content, s.tier, s.step, s.lang);
  s.step = Math.min(layer, tier.thresholds.length) - 1; s.progress = 0;
  return { from, to: stepName(content, s.tier, s.step, s.lang) };
}

/* After a chapter ends, the next one that has opened takes over. One still
   being written (`coming`, e.g. 「第二章 · 即将开放」) is waited on, dateless. */
function advanceChapter(content, state, now) {
  const next = Object.values(content.chapters)
    .filter(c => !state.ended.includes(c.id) && c.id > state.chapter)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!next) return { waiting: null };
  if (next.coming) return { waiting: { chapter: next.id, coming: pick(next.coming, state.lang) } };
  if (next.opens && new Date(next.opens) > now) return { waiting: { chapter: next.id, opens: next.opens } };
  state.chapter = next.id; state.scene = next.first_scene;
  settlePlace(content, state);
  offerTasks(content, state);
  return { waiting: null };
}

export function resolve(state, content, ctx, args) {
  const scene = sceneOf(content, state);
  if (!scene) return refuse('no-scene', null);
  const exit = scene.exits.find(e => e.id === args.exit);
  if (!exit) return refuse('unknown-exit', null, { exits: scene.exits.map(e => e.id) });
  const s = clone(state), lang = s.lang;
  settlePlace(content, s);
  if (!atScene(content, s)) {
    const at = placeOf(content, scene.at);
    return refuse('not-at-scene', lang === 'zh' ? `你还没到${pick(at.name, 'zh')}。` : `You are not at ${pick(at.name, 'en')} yet.`, { place: placeName(content, s, at) });
  }
  if (exit.needs && !meets(s, exit.needs, ctx.now)) return refuse('needs', pick(exit.refuse, lang));
  let breakthrough = null, odds = null;
  if (exit.breakthrough) {
    const tier = tierOf(content, s.tier), tiers = content.ladder.tiers, next = tiers[tiers.indexOf(tier) + 1];
    const peak = s.step === tier.thresholds.length - 1 && s.progress >= threshold(content, s);
    const gate = content.chapters[s.chapter]?.gate;
    if (!peak || !next || next.gate !== gate) {
      return refuse('not-at-peak', pick(exit.refuse, lang), { tier: s.tier, step: s.step + 1, progress: s.progress, next: threshold(content, s), peak_step: tier.thresholds.length });
    }
    // A failed throw shuts the cauldron for real hours (breakthrough.mjs).
    const until = coolingUntil(s, ctx.now);
    if (until) return refuse('breakthrough-cooling', coolingSay(lang, new Date(until), ctx.now), { again_at: until });
    // The chance as the card showed it — read before this step's 体力 is paid.
    odds = oddsOf(content, s, ctx.now, next.id);
    breakthrough = { from: stepName(content, s.tier, s.step, lang), to: stepName(content, next.id, 0, lang), tier: next.id };
  }
  if (exit.key) {
    const key = riddleOf(s, scene, exit, ctx.now);
    const riddle = content.riddles[lang].riddles[key];
    const tried = triedToday(s, scene, exit, key, ctx.now);
    if (tried.length >= RIDDLE_TRIES) return refuse('riddle-closed', null, { exit: exit.id });
    // Asked is seen: the question stays today's, and the play never asks it again.
    if (args.answer == null) {
      keepRiddle(s, scene, exit, key, ctx.now, tried, true);
      // The riddle is `ask`'s question, never a line to speak: spoken, the
      // reply ended on it with no AskUser (2026-09-17, gpt-5.6-terra).
      return { state: s, result: { ok: false, refused: 'needs-answer', say: null, exit: exit.id, choices: riddle.choices } };
    }
    if (!judgeAnswer(content, key, args.answer)) {
      // A miss is kept: the first brings the hint, the second closes the
      // riddle until tomorrow — guessing costs, and nothing blocks past a day.
      const missed = [...tried, String(args.answer).trim()];
      const closed = missed.length >= RIDDLE_TRIES;
      keepRiddle(s, scene, exit, key, ctx.now, missed, !closed);
      return { state: s, result: { ok: false, refused: closed ? 'riddle-closed' : 'wrong-answer', say: null, ...(closed ? {} : { hint: riddle.hint }), exit: exit.id } };
    }
    keepRiddle(s, scene, exit, key, ctx.now, tried);
  }
  const game = gameOf(exit);
  if (game && !s.wins?.[game.id]) {
    // A trial fight (`retry`) may be fought again at once: a loss withdraws nothing.
    const today = game.kind === 'duel' && !game.retry ? s.duels?.[game.creature] : null;
    if (today?.day === dayKey(ctx.now) && today.outcome === 'lost') return refuse('withdrawn', pick(exit.withdrawn, lang), { game: game.id });
    return refuse('game-not-won', null, { game: game.id });
  }
  let named = null;
  if (exit.value) {
    const value = cleanValue(args.value, exit.value);
    if (!value) return refuse('value-invalid', null, { max_chars: exit.value.max_chars });
    s[exit.value.field] = value;
    // The card's 男 · 女: kept when said; a name typed in the chat says none.
    const gender = exit.value.gender && GENDERS.has(String(args.gender ?? '')) ? String(args.gender) : null;
    if (gender) s.gender = gender;
    named = { field: exit.value.field, value, ...(gender ? { gender } : {}) };
  }
  let born = null;
  if (exit.born) {
    born = readRoots(content, s, ctx, args);
    if (!born) return refuse('birth-invalid', null);
    const main = s.traits.length === 5 && s.root_main ? { main: pick(content.traits.elements[s.root_main], lang) } : {};
    born = { ...born, roots: { ids: s.traits, name: rootName(content, s, lang), elements: s.traits.map(e => pick(content.traits.elements[e], lang)), ...main } };
  }
  // An exit that is toil by itself (the steps, the ditch) costs its 体力 even
  // in the free prologue: the first place a new player sees the pool move.
  if (exit.stamina) {
    const empty = spendStamina(content, s, ctx, 'toil', 1, exit.stamina);
    if (empty) return empty;
  }
  if (exit.mark) {
    s.marks = [...new Set([...(s.marks ?? []), exit.mark])];
    // The day it was marked, once: a dated beat waits on it (`needs.day_after`).
    s.mark_days = { [exit.mark]: dayKey(ctx.now), ...(s.mark_days ?? {}) };
  }
  if (exit.next || exit.ends) {
    const empty = spendStamina(content, s, ctx, 'step');
    if (empty) return empty;
  }
  // 渡劫 is one throw (Hanli, 2026-09-28): failed, the scene stays, the
  // realm stays, and nothing moves on — the rules' die, never Ling's word.
  if (breakthrough && odds) {
    breakthrough = { ...breakthrough, ...throwOn(content, s, odds, breakthrough.tier, ctx.now) };
    if (!breakthrough.success) return { state: s, result: { ok: true, took: null, breakthrough, beat: [], paid: null, show: [], scene: sceneBrief(content, s, ctx.now), summarize: false } };
  }
  if (game) delete s.wins[game.id];
  if (exit.take?.bag) {
    s.bag[exit.take.bag] -= 1;
    if (s.bag[exit.take.bag] <= 0) delete s.bag[exit.take.bag];
  }
  // A few stones handed over (the outer court's 「公中」): a choice, never a price list.
  if (exit.take?.wealth) s.wealth = Math.max(0, s.wealth - exit.take.wealth);
  // 恩仇簿 — the debts a choice writes down, good and bad (writeLedger).
  const wrote = writeLedger(content, s, exit, ctx);
  // 银月 found in the story itself (prologue-v3 § 九): she walks with the player from here.
  const joined = exit.joins ? joinHer(content, s, ctx) : null;
  const rested = restHer(s, exit);
  // 一鼎一尾一段记忆: a memory only from the 鼎's own exit, never in a made scene (rules/memories.mjs).
  const remembered = inMade(s) ? null : grantMemory(content, s, exit, ctx.now);
  if (exit.set?.traits === 'v1') {
    s.traits = [...content.traits.v1];
    // The root test hands over the starter — the first cards he holds.
    s.cards = [...new Set([...(s.cards ?? []), ...starterOf(content, s.traits)])];
    s.card_from = { ...Object.fromEntries(starterOf(content, s.traits).map(id => [id, { how: 'starter', place: s.place ?? null, chapter: s.chapter ?? null, day: dayKey(ctx.now) }])), ...(s.card_from ?? {}) };
  }
  if (breakthrough) { s.tier = breakthrough.tier; s.step = 0; s.progress = 0; }
  // The story lifts the realm (小周天, 息壤): to that layer of the first tier, never down.
  const rose = exit.rise ? riseTo(content, s, exit.rise, replaying(content, s, scene)) : null;
  const grant = grantOf(s, scene, exit);
  const landing = exit.ends ? { ...s, scene: null } : exit.next && !inMade(s) ? { ...s, scene: exit.next } : s;
  const paid = grant ? pay(content, s, ctx, grant, landing) : null;
  const beat = spoken(content, s, exit.beat);

  let waiting = null, grew = null, node = null;
  const replay = replaying(content, s, scene);
  if (inMade(s)) {
    // A made scene leads only to another made scene or back to the spine.
    if (exit.next) s.made.at = exit.next;
    if (exit.ends) s.made.at = null;
  } else {
    oweExit(s, scene, exit, replay);
    if ((exit.next || exit.ends) && !replay) s.done_scenes.push(scene.id);
    if (exit.next) { s.scene = exit.next; settlePlace(content, s); offerTasks(content, s); }
    if (exit.ends) {
      // A chapter ended for the first time raises the 本命法宝 one 重 (rewards.json `growth`).
      if (!s.ended.includes(exit.ends)) {
        s.ended.push(exit.ends); grew = growTreasure(content, s, 'chapter');
        // The chapter that carries the ending (九 · 定鼎) marks the save once.
        const end = content.chapters[exit.ends]?.ending;
        if (end && !s.ending) s.ending = { id: end.id, at: ctx.now.toISOString() };
      }
      s.scene = null; ({ waiting } = advanceChapter(content, s, ctx.now));
    }
    // A scene passed, a cauldron found, a memory come back: the page's moment (story.mjs).
    if ((exit.next || exit.ends) && !replay) node = s.node = storyNode(content, state, s, scene, exit, ctx.now);
  }
  const walked = exit.next ? walkOn(content, s, ctx.now) : null;
  // Her lines in this move — the exit's beat, and the scene it walks into —
  // are hers to say: facts for her, never a line for Ling (story.mjs herBeat).
  const into = exit.next && atScene(content, s) ? sceneOf(content, s) : null;
  const her = herBeat(content, s, {
    id: `${scene.id}/${exit.id}`, lines: [...(exit.beat ?? []), ...(into?.lines ?? []), ...spanLines(content, [exit.story, into?.story])],
    happened: [...beat.map(b => b.text), into && fill(pick(into.setup, lang), s, content)], scenes: [scene, into],
  });
  if (her) s.node = withHerBeat(node, her, ctx.now);
  return {
    state: s,
    result: {
      ok: true, took: exit.id, ...(exit.label ? { chose: fill(pick(exit.label, lang), s, content) } : {}), ...(named ? { named } : {}),
      ...(wrote.length ? { ledger: wrote } : {}), ...(joined ? { joined } : {}), ...(rested ? { her: rested } : {}), ...(born ? { born } : {}), beat, paid, breakthrough, ...(rose ? { rose } : {}), show: exit.show ?? [], scene: atScene(content, s) ? sceneBrief(content, s, ctx.now) : null,
      waypoint: !atScene(content, s) && sceneOf(content, s) ? threadOf(content, s, ctx.now) : null, ended: exit.ends ?? null, waiting,
      ...(walked ? { walked } : {}), ...(grew ? { treasure_grew: grew } : {}), ...(node ? { node } : {}),
      // Her price showing as the chapter ends: Ling opens with what she does (story.mjs uneaseAt).
      ...(node?.unease ? { unease: node.unease } : {}),
      ...(her ? { her_beat: her } : {}),
      ...(remembered ? { memory: remembered } : {}),
      summarize: Boolean(exit.next || exit.ends),
    },
  };
}

/* She joins by the story (an exit's `joins`), not by the bell: the same
   joining as 摇铃's (worlds.mjs ring) without the bell at her neck — she is
   a card he holds from now on. */
function joinHer(content, s, ctx) {
  const c = companionOf(content);
  if (!c || s.companion?.joined) return null;
  s.companion = { joined: dayKey(ctx.now), awake: true };
  gainCard(content, s, c.id, { how: 'companion', day: dayKey(ctx.now) });
  return { id: c.id };
}

/* She sleeps (an exit's `sleeps` — prologue-v3 § 十四, 吴婆婆's fox token) or
   wakes (`wakes`): only a companion found; `awake` is the flag the engine's
   presence reads (SKILL.md `absent_until`). */
function restHer(s, exit) {
  if (!s.companion?.joined || !(exit.sleeps || exit.wakes)) return null;
  const { awake, asleep, ...rest } = s.companion;
  s.companion = exit.sleeps ? { ...rest, asleep: true } : { ...rest, awake: true };
  return exit.sleeps ? 'asleep' : 'awake';
}

/* A scene played again — one already passed, or any of a chapter already
   ended, walked back to by Go — is story only: it pays nothing (review,
   2026-09-24: the river's 月铃 came again with every replay). */
const replaying = (content, s, scene) => !inMade(s) && (s.ended.includes(s.chapter) || s.done_scenes.includes(scene.id));

/* What an exit pays, if anything. A spine scene played again pays nothing. A
   made scene is the model's: its grant is progress and wealth only, whatever
   an older save's scene says, and each of its exits pays once (review,
   2026-09-24 — a well that looped on itself paid 息壤 five times). */
function grantOf(s, scene, exit) {
  if (!exit.grant) return null;
  if (!inMade(s)) return replaying(null, s, scene) ? null : exit.grant;
  const key = `${scene.id}/${exit.id}`;
  if ((s.made.paid ?? []).includes(key)) return null;
  s.made.paid = [...(s.made.paid ?? []), key];
  return Object.fromEntries(Object.entries(exit.grant).filter(([k]) => MADE_GRANT.has(k)));
}

/* An exit taken toward the next scene walks the player there when it stands
   one road away, open and within their tier — *去蓬莱* means go; asking
   again which road was the player's "click twice" (2026-09-16). Farther
   off, or beyond them, the road waits as a waypoint. Walking costs nothing,
   as Move costs nothing. */
function walkOn(content, s, now) {
  if (inMade(s) || atScene(content, s)) return null;
  const scene = sceneOf(content, s), here = placeOf(content, s.place);
  const target = scene && placeOf(content, scene.at);
  if (!target || !here?.roads.includes(target.id) || !placeOpen(content, s, target, now) || tooHard(content, s, target)) return null;
  s.place = target.id;
  return { from: placeName(content, s, here), to: placeName(content, s, target) };
}

export function judge(state, content, ctx, args) {
  if (!content.riddles.zh.riddles[args.key]) return refuse('unknown-riddle', null);
  return { state: null, result: { ok: true, right: judgeAnswer(content, args.key, args.answer) } };
}

export { advanceChapter, clone, paysOf, replaying, hourOf, judgeAnswer, offerTasks, pay, refuse, RIDDLE_TRIES, riddleOpen, setRiddleAside, spendStamina, triedToday };
