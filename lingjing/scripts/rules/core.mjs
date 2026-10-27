// rules/core.mjs — Changing it: refusals, pay, riddles, stamina, resolve and judge.
// Part of the rules engine; rules.mjs is its one door.
import { gameOf, MADE_GRANT } from '../content.mjs';
import { addProgress, layerPayOf, dayKey, fill, fitValue, fullName, lockedOf, normalizeAnswer, payOf, personOf, pick, rollDay, settleStamina, speedOf, staminaLimited, staminaRest, staminaReturnsAt, stepName, peakName, phaseName, threshold, tierOf, seedOf, stepOfLayer, stepUp, zeroAt } from '../state.mjs';
import { growTreasure, learn } from './arms.mjs';
import { askOf } from './ask.mjs';
import { gainCard, grantFrom } from './cards.mjs';
import { breakthroughOf, itemOf, threadOf } from './errands.mjs';
import { coolingUntil, oddsOf, throwOn } from './breakthrough.mjs';
import { sceneBrief, spoken, wordsOf } from './look.mjs';
import { hashOf } from './travel.mjs';
import { herBeat, storyNode, withHerBeat } from './story.mjs';
import { stow, storedLine } from './pouch.mjs';
import { bornRoots, rootName, stoneRoots } from './roots.mjs';
import { oweExit } from './tell.mjs';
import { seenMet } from './examine.mjs';
import { companionOf } from './companion.mjs';
import { grantMemory } from './memories.mjs';
import { writeLedger } from './ledger.mjs';
import { comingOf, sideLine } from './hui.mjs';
import { capLook, pastCapSay, storyAllows, underCap } from './cap.mjs';
import { entryGate, stageBrief, stageGate, stageSay } from './gates.mjs';
import { fightStuck } from './skips.mjs';
import { atScene, inMade, placeName, placeOf, placeOpen, sceneOf, settlePlace, tooHard } from './world.mjs';
import { authoredScale, fightPlay } from './playpay.mjs';

/* ── Changing it ── */

const refuse = (refused, say, extra = {}) => ({ state: null, result: { ok: false, refused, say: say ?? null, ...extra } });
const clone = state => structuredClone(state);

export function meets(state, needs, now = new Date(), sceneId = state.scene) {
  if (needs.bag && !(state.bag[needs.bag] > 0)) return false;
  if (needs.task && state.tasks[needs.task]?.status !== 'done') return false;
  // A board's grade (tasks.mjs win): the exit a won board's `grade` takes.
  // A board left (skipped, rules/skips.mjs) has no grade: every way on that waits on one is his to choose.
  if (needs.grade && !state.tasks[needs.task]?.skipped && ![needs.grade].flat().includes(state.grades?.[needs.task])) return false;
  if (needs.wealth && !(state.wealth >= needs.wealth)) return false;
  // A choice a thread sets up (an errand handed in), and a day that must pass
  // since the story marked its eve (the 大比 is tomorrow: a real local day).
  if (needs.quest && !state.quests?.[needs.quest]?.done_at) return false;
  if (needs.day_after && !(state.mark_days?.[needs.day_after] && state.mark_days[needs.day_after] < dayKey(now))) return false;
  // A clue that must be found here first (rules/examine.mjs: 看).
  if (needs.seen && !seenMet(state, sceneId, needs.seen)) return false;
  // A step the story set down earlier in the same run (`mark`): 古九's seasons, one after another.
  if (needs.mark && !(state.marks ?? []).includes(needs.mark)) return false;
  // …or one it did NOT set down (`no_mark`): the other side of the same fork (古六's 刮鞋底, 2026-10-15).
  if (needs.no_mark && (state.marks ?? []).includes(needs.no_mark)) return false;
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
  // 修为 as a share of the layer (rules/playpay.mjs, 2026-10-27): a fight by its minutes; what the book authors read
  // against the 练气一层 it was written for. Capped by its table as authored.
  const fight = grant.table === 'haunt' && grant.progress ? fightPlay(content, state) : null;
  const authored = fight ?? Math.min(grant.progress ?? 0, table.progress) * authoredScale(content, state, grant.table);
  // `share`: a replay's falling share (tasks.mjs duel, playpay.mjs fightReplay) — 修为 and 灵石 alike.
  const share = grant.share ?? 1;
  const want = Math.round(authored * speedOf(content, state) * share);
  const base = Math.max(0, want);
  const wealth = Math.max(0, Math.round(Math.min(grant.wealth ?? 0, table.wealth) * share));
  return { base, progress: Math.round(base * payOf(content, state) * layerPayOf(content, state, grant.table)), wealth };
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

/* 圆满之后走剧情到下一个阶段; 刷副本或者打怪奖励的修为改为灵石 (Hanli, 2026-10-15): a grant on
   a table rewards.json `xiuwei_to_lingshi` lists (the fights' — never a scene, a board or the
   功课) pays 修为 only up to the full mark of the layer he may not step past (the 回's cap, a
   realm's peak); the rest is 灵石 at its `rate`, and never carries into the next layer. */
const converting = (content, grant) => {
  const c = content.rewards.xiuwei_to_lingshi;
  return c && (c.tables ?? []).includes(grant?.table) ? c : null;
};
/* How much of `progress` would land past a mark he may not leave — tried on a copy. */
function pastMark(content, state, progress) {
  if (progress <= 0 || zeroAt(content, state.tier, state.step)) return 0;
  const trial = { tier: state.tier, step: state.step, progress: state.progress, ...(state.stretch ? { stretch: { ...state.stretch } } : {}) };
  const { hold } = addProgress(content, trial, progress, (tier, step) => underCap(content, state, tier, step));
  return hold ? Math.min(progress, Math.max(0, hold.over ?? 0)) : 0;
}

function pay(content, state, ctx, grant, landing = state) {
  rollDay(state, ctx.now);
  // Before a story gate nothing it keeps is paid (state.mjs lockedOf): read
  // where the move lands — the hall's three stones land in the outer court.
  const shut = lockedOf(content, landing);
  const due = amountsOf(content, state, ctx.now, grant);
  const base = shut.includes('cultivation') ? 0 : due.base, progress = shut.includes('cultivation') ? 0 : due.progress;
  // A fight's 修为 past the held mark is paid as 灵石 (converting, above).
  const conv = converting(content, grant), over = conv ? pastMark(content, state, progress) : 0;
  const lingshi = over && !shut.includes('wealth') ? Math.round(over * conv.rate) : 0;
  const wealth = (shut.includes('wealth') ? 0 : due.wealth) + lingshi;
  state.day.progress += base; state.day.wealth += wealth; state.wealth += wealth;
  const { levels, hold: kept } = addProgress(content, state, progress - over, (tier, step) => underCap(content, state, tier, step));
  // At the 回's cap the held part is told in the world's words (rules/cap.mjs) — not when the rest went to 灵石.
  const hold = over ? null : kept?.cap ? { ...kept, say: capLook(content, state, state.lang)?.say ?? null } : kept;
  if (grant.cast && !state.cast.includes(grant.cast)) state.cast.push(grant.cast);
  // A beast that joins brings its card; a grant may name one outright.
  const day = dayKey(ctx.now);
  const cards = [[grant.cast, { how: 'tame', creature: grant.cast, day }], [grant.card, { how: 'story', day }]]
    .map(([id, from]) => (id ? gainCard(content, state, id, from) : null)).filter(Boolean);
  // A thing granted goes into the 储物袋 — or, full, waits at the 洞府 (pouch.mjs).
  // `n`: how many of it (古五's 鼎苔, scraped clean off four pits — 杀人必摸尸's habit, design.md § Items).
  const stowed = grant.item ? stow(content, state, grant.item, grant.n ?? 1) : null;
  // `more`: the rest of what the scene put in his hands, {id: n} (杀人必摸尸 — 古五's 石室).
  const extra = Object.entries(grant.more ?? {}).map(([id, n]) => stow(content, state, id, n));
  const full = storedLine(state, [stowed, ...extra]);
  // An art is taught by a person, in a scene — never by the beast itself.
  const learned = grant.art ? learn(content, state, grant.art) : null;
  const named = levels.map(l => ({ from: stepName(content, l.from.tier, l.from.step, state.lang), to: stepName(content, l.to.tier, l.to.step, state.lang) }));
  // `progress` is what the realm really took; at the peak the rest is held.
  return { progress: progress - over - (hold?.held ?? 0), wealth, ...(over ? { converted: { progress: over, wealth: lingshi } } : {}), cast: grant.cast ?? null, item: grant.item ?? null, ...(extra.length ? { more: extra } : {}), ...(full ? { stored: true, pouch_full: full } : {}), levels: named, hold, ...(cards.length ? { cards } : {}), ...(learned ? { learned } : {}) };
}

/* What was owed while a gate kept it shut (tasks.mjs owe: 开府 handed in before the 灵石 were his)
   lands the moment the gate opens: returns what landed, or null. */
function landOwed(content, s, now) {
  const n = s.owed?.wealth ?? 0;
  if (!n || lockedOf(content, s).includes('wealth')) return null;
  rollDay(s, now);
  s.wealth += n; s.day.wealth += n;
  delete s.owed;
  return { wealth: n };
}

/* A road riddle is answered wrong at most this many times a day. A scene's riddle — the story's only way
   on (01-deep's 读封) — never shuts: after this many misses it may be left instead (`pass`, no reward). */
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
  return fresh[hashOf(`${dayKey(now)}|${seedOf(state)}|${riddleSlot(scene, exit)}`) % fresh.length];
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

/* A thing in the bag that waives one cost of this kind (items.json effect `waive`: 饱嗝令, from the 饭桶 —
   「下一关主力游戏免灵气」): one is spent instead of the 灵气, and only when there was a cost to waive. */
function waived(content, s, kind) {
  const c = content.rewards?.stamina?.cost?.[kind];
  if (!c || !staminaLimited(content)) return false;
  const id = Object.keys(s.bag ?? {}).find(x => s.bag[x] > 0 && content.items.items.find(i => i.id === x)?.effect?.waive === kind);
  if (!id) return false;
  s.bag[id] -= 1;
  if (s.bag[id] <= 0) delete s.bag[id];
  return true;
}

/* 体力 is the only limit on a day's play (his, 2026-09-23): moving costs by
   the road, a fight, a 奇遇, a story step, a choice and a taming cost, and a
   hosted game (the six boards, 炼丹 among them, and 论道) costs what a step
   does (2026-09-24); taps that take no time — the market, errands, 起卦,
   疗伤, 历练 — cost nothing. rewards.json § stamina.cost holds the numbers.
   `n` is how many. */
function spendStamina(content, s, ctx, kind, n = 1, fixed = null) {
  if (freeHere(content, s, kind)) return null;
  if (waived(content, s, kind)) return null;
  settleStamina(content, s, ctx.now);
  if (!staminaLimited(content)) return null;
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
  const restAt = staminaRest(content, s);
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
const THEN_PAGE_NAMES = 'This is named on the page\'s card: the player taps an offered name there or writes their own, and the stage goes on by itself (you read it in `page_did`). Nothing changed. End on one line inviting them to the card — never AskUser for it, never name one for them, never Resolve it yourself.';
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

const THEN_PAGE_BORN = 'The birthday is given on the page\'s card (or left to the stone) — it is private and never said in the chat; the stage goes on by itself when the roots are read (`page_did`). Nothing changed. End on one line inviting them to the card — never AskUser for it, never ask the date yourself, never Resolve it.';

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
  // No starter at the root test any more (cards.md § 4): what he holds he has
  // gained along the road; written down so the old starter is never read in.
  s.cards = [...(s.cards ?? [])];
  return { read: birth ? 'birth' : 'stone' };
}

/* The words said (a tap's label, or the player's typed line) hold the name. */
const heardName = (rule, said) => {
  const words = String(said ?? '').toLowerCase();
  return [rule.value, ...(rule.heard ?? [])].some(w => w && words.includes(String(w).toLowerCase()));
};

/* The cauldron shut after a failed throw, in the world's words: when. */
function coolingSay(lang, at, now) {
  const later = at.toDateString() !== now.toDateString();
  return lang === 'zh'
    ? `雷劫的余威还在经脉里游走，鼎气不肯近身。${later ? '明日' : ''}${hourOf(at, 'zh')} 以后再来。`
    : `The tribulation still runs through your meridians; the cauldron's breath will not come near. Come back after ${hourOf(at, 'en')}${later ? ' tomorrow' : ''}.`;
}

/* Under the peak: the exit's own line — unless a failed throw took the 修为
   (breakthrough.mjs fail): then the way back is 闭关, open in every chapter
   that throws, so the story can never stand on a cauldron with no road to it. */
function notPeakSay(exit, s, lang) {
  if (s.breakthrough?.last?.success !== false) return pick(exit.refuse, lang);
  return lang === 'zh'
    ? '雷劫震散了几分修为，丹田那片湖又浅了一截。去闭关，几个时辰便养得回来，再来冲。'
    : 'The tribulation shook loose some of your cultivation; the lake in your dantian sits lower. Go into seclusion — a few hours bring it back — then try again.';
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

/* Since 2026-10-16 the one rise is 入门 — 零层 to 一层, the 小周天 (content.mjs lintEarned refuses any
   other: 「不要直接跳层」); the rest of this reads as it did. The story lifts the realm to a layer of the first tier (an exit's `rise`,
   the 层 as the book names it — state.mjs stepOfLayer: 小周天 is 一层 out of 零层, 息壤 四层) — never down, never past its tier, once:
   a scene played again lifts nothing, and before a story gate nothing moves.
   No story floor (Hanli, 2026-10-15, design.md § Pacing): the book's jumps step
   him, but nothing tops up a 层 he is short of — every rise past 零层 waits on the
   回's stage quest (rules/gates.mjs), so he arrives full. What he had over its
   mark goes with him whole (`carried`), and the new layer asks
   `overflow_stretch` of it more (state.mjs stepUp). */
function riseTo(content, s, rise, replay) {
  const tier = content.ladder.tiers[0];
  // `{layer, full}`: to that layer and filled — 古八's 入秋 (古七's before the 2026-10-07 split), 练气九层圆满 (his, 2026-09-30:
  // the year is the book's four seasons, not days of chores).
  const layer = typeof rise === 'object' ? rise.layer : rise, full = typeof rise === 'object' && rise.full === true;
  const top = Math.min(stepOfLayer(content, tier.id, layer), tier.thresholds.length - 1);
  if (replay || s.tier !== tier.id || lockedOf(content, s).includes('cultivation')) return null;
  if (s.step > top || (s.step === top && (!full || (s.progress ?? 0) >= threshold(content, s)))) return null;
  // Never past where the 回's story stands (rules/cap.mjs) — the data would be wrong; the lint holds it too.
  if (!storyAllows(content, s, tier.id, top)) return null;
  const from = stepName(content, s.tier, s.step, s.lang), had = s.progress ?? 0, need = threshold(content, s);
  if (s.step < top) stepUp(content, s, tier.id, top, had - need, !zeroAt(content, s.tier, s.step));
  if (full) s.progress = Math.max(s.progress ?? 0, threshold(content, s));
  const carried = s.step === top && had > need ? had - need : 0;
  return { from, to: stepName(content, s.tier, s.step, s.lang), ...(full ? { full: true } : {}), ...(carried ? { carried } : {}) };
}

/* How far a breakthrough that lands fills the step it lands on: the pill it
   ate declares it (items.json `fill` — the 九转's "full": 筑基小成圆满 in one
   night, Hanli 2026-10-14), else the exit (`fill`, for a world with no
   breakthrough pills), else nothing — the step's start, 修为 0. "full" is the
   one value: the step filled, shown with the ladder's `full` word; the next
   step stays the ladder's and the 回's cap's to open. */
const landFill = (content, exit, breakthrough) =>
  (breakthrough.pill?.id ? itemOf(content, breakthrough.pill.id)?.fill : null) ?? exit.fill ?? null;

/* Back from a 今 interlude (content.mjs spliceInterludes): the step from its last scene into the
   古 scene it was spliced before puts him where that scene stands — the book turns from 沈芒's
   world straight into its opening passage (the 「完」, the new 回's seal, the passage, then its
   choices and games), never onto the open map at the 古 place he last stood (Hanli, 2026-10-15,
   今 · 二 → 古五: 「太突然了……今线感觉还没结束」 — j04-dog's last tap left him at 柴房 on 孙二狗's
   七巧 board, 第五回's 「完」, seal and passage behind a walk to 石门). Only the place moves, once,
   on this step: the scene is a waypoint as ever, and he may walk off it. Read off the lines. */
function backFromSide(content, left, next) {
  const into = Object.values(content.chapters).map(ch => ch.scenes?.[next]).find(Boolean);
  return into?.at && sideLine(content, left) && !sideLine(content, into) ? into.at : null;
}

/* After a chapter ends, the next one that has opened takes over. One still
   being written (`coming`: 「第四回 · 即将开放」, named by its first 回 — hui.mjs) is waited on, dateless. */
function advanceChapter(content, state, now) {
  const next = Object.values(content.chapters)
    .filter(c => !state.ended.includes(c.id) && c.id > state.chapter)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!next) return { waiting: null };
  if (next.coming) return { waiting: { chapter: next.id, coming: comingOf(content, next, state.lang) } };
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
  settlePlace(content, s, ctx.now);
  if (!atScene(content, s)) {
    const at = placeOf(content, scene.at);
    return refuse('not-at-scene', lang === 'zh' ? `你还没到${pick(at.name, 'zh')}。` : `You are not at ${pick(at.name, 'en')} yet.`, { place: placeName(content, s, at) });
  }
  if (exit.needs && !meets(s, exit.needs, ctx.now, scene.id)) return refuse('needs', pick(exit.refuse, lang));
  // A choice the scene turns down (`snub`: the furnace ignores a grand name):
  // its line is said, nothing moves, and it is kept (`mark`) so the card
  // greys it out. Saved, like a riddle's miss.
  if (exit.snub) {
    if (exit.mark) s.marks = [...new Set([...(s.marks ?? []), exit.mark])];
    return { state: s, result: { ok: false, refused: 'snubbed', say: pick(exit.snub, lang), exit: exit.id } };
  }
  // A name the story gives (`names`: 饭桶) is taken only in words that hold
  // it — the page's tap, or the player's own typed; anything else is refused
  // in the exit's `refuse` line.
  if (exit.names && !heardName(exit.names, args.said)) return refuse('not-named', pick(exit.refuse, lang));
  let breakthrough = null, odds = null, passedRiddle = false, leftFight = null;
  if (exit.breakthrough) {
    const tier = tierOf(content, s.tier), tiers = content.ladder.tiers, next = tiers[tiers.indexOf(tier) + 1];
    const peak = s.step === tier.thresholds.length - 1 && s.progress >= threshold(content, s);
    const gate = content.chapters[s.chapter]?.gate;
    // A failed throw shuts the cauldron for real hours (breakthrough.mjs) — said first: it is why.
    const until = next?.gate === gate ? coolingUntil(s, ctx.now) : null;
    if (until) return refuse('breakthrough-cooling', coolingSay(lang, new Date(until), ctx.now), { again_at: until });
    if (!peak || !next || next.gate !== gate) {
      return refuse('not-at-peak', notPeakSay(exit, s, lang), { tier: s.tier, step: s.step + 1, progress: s.progress, next: threshold(content, s), peak_step: tier.thresholds.length });
    }
    // Past where the book stands in this 回 (rules/cap.mjs): 火候未到, in the world's words.
    if (!storyAllows(content, s, next.id, 0)) return refuse('past-cap', pastCapSay(content, lang), { tier: s.tier, to: next.id });
    // The chance as the card showed it — read before this step's 体力 is paid.
    odds = oddsOf(content, s, ctx.now, next.id);
    // From the realm's 圆满 into the next one's 小成 — the formal words (ladder.json `full`, `phases`).
    breakthrough = { from: peakName(content, s.tier, lang), to: phaseName(content, next.id, 0, lang) ?? stepName(content, next.id, 0, lang), tier: next.id };
  }
  if (exit.key) {
    const key = riddleOf(s, scene, exit, ctx.now);
    const riddle = content.riddles[lang].riddles[key];
    const tried = triedToday(s, scene, exit, key, ctx.now);
    // Never stuck (live, 2026-10-15: two misses at 01-deep shut the only way on for a real day, and
    // 「谜题已过」 read as solved): the misses bring the hint, and once he is stuck — RIDDLE_TRIES misses —
    // 「算了，往下走」 (`pass`) walks the way on with no reward, as a board left (rules/skips.mjs).
    if (args.pass) {
      if (tried.length < RIDDLE_TRIES) return refuse('not-stuck', null, { exit: exit.id, tried: tried.length, needs: RIDDLE_TRIES });
      keepRiddle(s, scene, exit, key, ctx.now, tried);
      passedRiddle = true;
    }
    // Asked is seen: the question stays today's, and the play never asks it again.
    else if (args.answer == null) {
      keepRiddle(s, scene, exit, key, ctx.now, tried, true);
      // The riddle is `ask`'s question, never a line to speak: spoken, the
      // reply ended on it with no AskUser (2026-09-17, gpt-5.6-terra).
      return { state: s, result: { ok: false, refused: 'needs-answer', say: null, exit: exit.id, choices: riddle.choices } };
    }
    else if (!judgeAnswer(content, key, args.answer)) {
      // A miss is kept and brings the hint; it stays on the table. From the RIDDLE_TRIES-th miss he may
      // leave it (`stuck`: the page's 「算了，往下走」).
      const missed = [...new Set([...tried, String(args.answer).trim()])];
      keepRiddle(s, scene, exit, key, ctx.now, missed, true);
      return { state: s, result: { ok: false, refused: 'wrong-answer', say: null, hint: riddle.hint, exit: exit.id, ...(missed.length >= RIDDLE_TRIES ? { stuck: true } : {}) } };
    }
    else keepRiddle(s, scene, exit, key, ctx.now, tried);
  }
  const game = gameOf(exit);
  // A story fight inside a key beat's lock, stuck (rules/skips.mjs fightStuck): 「算了，往下走」 (`pass`) takes
  // the way on a win would take, paying nothing — kept as left (`fights_left`), never as won.
  if (game && !s.wins?.[game.id] && args.pass && game.kind === 'duel') {
    if (!fightStuck(content, s, game)) return refuse('not-stuck', null, { exit: exit.id, game: game.id, lost: s.fight_losses?.[game.id] ?? 0 });
    s.fights_left = { ...s.fights_left, [game.id]: ctx.now.toISOString() };
    leftFight = game.id;
  }
  else if (game && !s.wins?.[game.id]) {
    // A trial fight (`retry`) may be fought again at once: a loss withdraws nothing.
    const today = game.kind === 'duel' && !game.retry ? s.duels?.[game.creature] : null;
    if (today?.day === dayKey(ctx.now) && today.outcome === 'lost') return refuse('withdrawn', pick(exit.withdrawn, lang), { game: game.id });
    return refuse('game-not-won', null, { game: game.id, ...(fightStuck(content, s, game) ? { stuck: true } : {}) });
  }
  // 阶段任务 — after the scene's own board or fight, which may be played before the bar is full (rules/gates.mjs): the next stage waits on 圆满 of the layer he holds — earned, never paid by the story.
  const staged = stageGate(content, s, scene.id, exit.id) ?? entryGate(content, s, exit);
  if (staged) return refuse('stage', stageSay(content, s, staged, lang), { exit: exit.id, stage: stageBrief(content, s, staged, lang) });
  let named = null;
  if (exit.value) {
    const value = cleanValue(args.value, exit.value);
    if (!value) return refuse('value-invalid', null, { max_chars: exit.value.max_chars });
    s[exit.value.field] = value;
    named = { field: exit.value.field, value };
  }
  if (exit.names) { s[exit.names.field] = exit.names.value; named = { field: exit.names.field, value: exit.names.value }; }
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
  if (exit.take?.bag) takeOne(s, exit.take.bag);
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
    s.cards = [...(s.cards ?? [])]; // no starter (cards.md § 4)
  }
  // 出处: leaving a scene, every card it gives (cards.json `from: {kind: 'story', scene}` —
  // 娘's 饼 from 00-kitchen, 褚先生's five at wm-qianye). A scene played again gives nothing new.
  const told = inMade(s) ? [] : grantFrom(content, s, 'story', scene.id, { how: 'story', day: dayKey(ctx.now) });
  if (breakthrough) {
    // What he held over the peak's mark goes with him whole (state.mjs stepUp); a pill that
    // lands the step full fills it under that.
    const over = Math.max(0, (s.progress ?? 0) - threshold(content, s));
    stepUp(content, s, breakthrough.tier, 0, over);
    const filled = landFill(content, exit, breakthrough) === 'full';
    if (filled) s.progress = threshold(content, s) + over - (s.stretch?.[`${s.tier}:0`] ?? 0);
    if (filled) breakthrough = { ...breakthrough, to: fullName(content, s.tier, 0, lang), full: true };
  }
  // The story lifts the realm (小周天, 息壤): to that layer of the first tier, never down.
  const rose = exit.rise ? riseTo(content, s, exit.rise, replaying(content, s, scene)) : null;
  // A riddle left (`pass`) pays nothing (his: 「跳过没有奖励」); the story goes on as after an answer.
  const grant = passedRiddle || leftFight ? null : grantOf(s, scene, exit);
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
    if (exit.next) { s.place = backFromSide(content, scene, exit.next) ?? s.place; s.scene = exit.next; settlePlace(content, s, ctx.now); offerTasks(content, s); }
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
    // The realm the story lifted, for the page's moment (息壤's five doors, story.mjs).
    if (node && rose) node.rose = rose;
  }
  const walked = exit.next ? walkOn(content, s, ctx.now) : null;
  const landed = landOwed(content, s, ctx.now);
  // Her lines in this move — the exit's beat, and the scene it walks into —
  // are hers to say: facts for her, never a line for Ling (story.mjs herBeat).
  // The book's own lines for her are not among them: Ling tells those (tell.mjs).
  const into = exit.next && atScene(content, s) ? sceneOf(content, s) : null;
  const her = herBeat(content, s, {
    id: `${scene.id}/${exit.id}`, lines: [...(exit.beat ?? []), ...(into?.lines ?? [])],
    happened: [...beat.map(b => b.text), into && fill(pick(into.setup, lang), s, content)],
  });
  if (her) s.node = withHerBeat(node, her, ctx.now);
  return {
    state: s,
    result: {
      ok: true, took: exit.id, ...(exit.label ? { chose: fill(pick(exit.label, lang), s, content) } : {}), ...(named ? { named } : {}),
      ...(wrote.length ? { ledger: wrote } : {}), ...(joined ? { joined } : {}), ...(rested ? { her: rested } : {}), ...(born ? { born } : {}), beat, paid, breakthrough, ...(rose ? { rose } : {}), show: exit.show ?? [], scene: atScene(content, s) ? sceneBrief(content, s, ctx.now) : null,
      waypoint: !atScene(content, s) && sceneOf(content, s) ? threadOf(content, s, ctx.now) : null, ended: exit.ends ?? null, waiting,
      ...(walked ? { walked } : {}), ...(landed ? { owed_landed: landed } : {}), ...(grew ? { treasure_grew: grew } : {}), ...(node ? { node } : {}), ...(passedRiddle ? { passed: true } : {}), ...(leftFight ? { passed: true, left_fight: leftFight } : {}),
      // Her price showing as the chapter ends: Ling opens with what she does (story.mjs uneaseAt).
      ...(node?.unease ? { unease: node.unease } : {}),
      ...(her ? { her_beat: her } : {}),
      ...(remembered ? { memory: remembered } : {}),
      ...(told.length ? { cards: told } : {}),
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
  // A member of the 小队 (party.json), never a card in his hand (cards.md § 5).
  s.companion = { joined: dayKey(ctx.now), awake: true };
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


/* One of an item out of the bag (an exit's `take`). Never below nothing: an
   exit with `take.held` takes only if he still holds it (09-snow's 饭桶 eats
   the 赤铜葫芦 if it was not pawned), and a count that was never there is
   not made NaN. The last one gone, it comes off his slot too. */
function takeOne(s, id) {
  const held = Number(s.bag?.[id]) || 0;
  if (held <= 0) return false;
  if (held > 1) { s.bag[id] = held - 1; return true; }
  delete s.bag[id];
  for (const [slot, worn] of Object.entries(s.wear ?? {})) if (worn === id) delete s.wear[slot];
  return true;
}
