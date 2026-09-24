// rules/core.mjs — Changing it: refusals, pay, riddles, stamina, resolve and judge.
// Part of the rules engine; rules.mjs is its one door.
import { gameOf, MADE_GRANT } from '../content.mjs';
import { addProgress, dayKey, normalizeAnswer, payOf, pick, rollDay, settleStamina, speedOf, staminaReturnsAt, stepName, threshold, tierOf } from '../state.mjs';
import { growTreasure, learn } from './arms.mjs';
import { askOf } from './ask.mjs';
import { gainCard, starterOf } from './cards.mjs';
import { threadOf } from './errands.mjs';
import { sceneBrief, spoken, wordsOf } from './look.mjs';
import { hashOf } from './travel.mjs';
import { atScene, inMade, placeName, placeOf, provinceOpen, sceneOf, settlePlace, tooHard } from './world.mjs';

/* ── Changing it ── */

const refuse = (refused, say, extra = {}) => ({ state: null, result: { ok: false, refused, say: say ?? null, ...extra } });
const clone = state => structuredClone(state);

function meets(state, needs) {
  if (needs.bag && !(state.bag[needs.bag] > 0)) return false;
  if (needs.task && state.tasks[needs.task]?.status !== 'done') return false;
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
  const { progress, wealth } = amountsOf(content, state, now, grant);
  return { progress, wealth };
};

function pay(content, state, ctx, grant) {
  rollDay(state, ctx.now);
  const { base, progress, wealth } = amountsOf(content, state, ctx.now, grant);
  state.day.progress += base; state.day.wealth += wealth; state.wealth += wealth;
  const { levels, hold } = addProgress(content, state, progress);
  if (grant.cast && !state.cast.includes(grant.cast)) state.cast.push(grant.cast);
  // A beast that joins brings its card; a grant may name one outright.
  const cards = [grant.cast, grant.card].map(id => (id ? gainCard(content, state, id) : null)).filter(Boolean);
  if (grant.item) state.bag[grant.item] = (state.bag[grant.item] ?? 0) + 1;
  // An art is taught by a person, in a scene — never by the beast itself.
  const learned = grant.art ? learn(content, state, grant.art) : null;
  const named = levels.map(l => ({ from: stepName(content, l.from.tier, l.from.step, state.lang), to: stepName(content, l.to.tier, l.to.step, state.lang) }));
  // `progress` is what the realm really took; at the peak the rest is held.
  return { progress: progress - (hold?.held ?? 0), wealth, cast: grant.cast ?? null, item: grant.item ?? null, levels: named, hold, ...(cards.length ? { cards } : {}), ...(learned ? { learned } : {}) };
}

/* A riddle is answered wrong at most this many times a day. */
const RIDDLE_TRIES = 2;

/* An exit's riddles: `key` is one riddle or a pool of them. */
const riddlePool = exit => (Array.isArray(exit.key) ? exit.key : [exit.key]);
const riddleSlot = (scene, exit) => `${scene.id}/${exit.id}`;

/* The riddle an exit asks: today's, once asked; else one this play has not
   seen, by the day and the 道号 — never twice in one play (his rule,
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
function spendStamina(content, s, ctx, kind, n = 1) {
  if (freeHere(content, s, kind)) return null;
  settleStamina(content, s, ctx.now);
  // A trip is paid as one (his, 2026-09-23: 几分钟消耗光 — seven roads at 3
  // each emptied a fifth of the pool in one tap): a base, a little per road
  // beyond the first, capped. The pool lasts about an hour of his pace.
  const c = content.rewards.stamina.cost[kind] ?? 0;
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

function cleanValue(raw, rule) {
  const value = String(raw ?? '').trim();
  const length = [...value].length;
  return length >= 1 && length <= rule.max_chars ? value : null;
}

/* Entering a scene offers its tasks. */
function offerTasks(content, state) {
  const scene = sceneOf(content, state);
  for (const id of scene?.offers?.tasks ?? []) state.tasks[id] ??= { status: 'offered' };
}

/* After a chapter ends, the next one that has opened takes over. */
function advanceChapter(content, state, now) {
  const next = Object.values(content.chapters)
    .filter(c => !state.ended.includes(c.id) && c.id > state.chapter)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!next) return { waiting: null };
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
  if (exit.needs && !meets(s, exit.needs)) return refuse('needs', pick(exit.refuse, lang));
  let breakthrough = null;
  if (exit.breakthrough) {
    const tier = tierOf(content, s.tier), tiers = content.ladder.tiers, next = tiers[tiers.indexOf(tier) + 1];
    const peak = s.step === tier.thresholds.length - 1 && s.progress >= threshold(content, s);
    const gate = content.chapters[s.chapter]?.gate;
    if (!peak || !next || next.gate !== gate) {
      return refuse('not-at-peak', pick(exit.refuse, lang), { tier: s.tier, step: s.step + 1, progress: s.progress, next: threshold(content, s), peak_step: tier.thresholds.length });
    }
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
    const today = game.kind === 'duel' ? s.duels?.[game.creature] : null;
    if (today?.day === dayKey(ctx.now) && today.outcome === 'lost') return refuse('withdrawn', pick(exit.withdrawn, lang), { game: game.id });
    return refuse('game-not-won', null, { game: game.id });
  }
  if (exit.value) {
    const value = cleanValue(args.value, exit.value);
    if (!value) return refuse('value-invalid', null, { max_chars: exit.value.max_chars });
    s[exit.value.field] = value;
  }
  if (exit.next || exit.ends) {
    const empty = spendStamina(content, s, ctx, 'step');
    if (empty) return empty;
  }
  if (game) delete s.wins[game.id];
  if (exit.take?.bag) {
    s.bag[exit.take.bag] -= 1;
    if (s.bag[exit.take.bag] <= 0) delete s.bag[exit.take.bag];
  }
  if (exit.set?.traits === 'v1') {
    s.traits = [...content.traits.v1];
    // The root test hands over the starter — the first cards he holds.
    s.cards = [...new Set([...(s.cards ?? []), ...starterOf(content, s.traits)])];
  }
  if (breakthrough) { s.tier = breakthrough.tier; s.step = 0; s.progress = 0; }
  const grant = grantOf(s, scene, exit);
  const paid = grant ? pay(content, s, ctx, grant) : null;
  const beat = spoken(content, s, exit.beat);

  let waiting = null, grew = null;
  const replay = replaying(content, s, scene);
  if (inMade(s)) {
    // A made scene leads only to another made scene or back to the spine.
    if (exit.next) s.made.at = exit.next;
    if (exit.ends) s.made.at = null;
  } else {
    if ((exit.next || exit.ends) && !replay) s.done_scenes.push(scene.id);
    if (exit.next) { s.scene = exit.next; settlePlace(content, s); offerTasks(content, s); }
    if (exit.ends) {
      // A chapter ended for the first time raises the 本命法宝 one 重 (rewards.json `growth`).
      if (!s.ended.includes(exit.ends)) { s.ended.push(exit.ends); grew = growTreasure(content, s, 'chapter'); }
      s.scene = null; ({ waiting } = advanceChapter(content, s, ctx.now));
    }
  }
  const walked = exit.next ? walkOn(content, s, ctx.now) : null;
  return {
    state: s,
    result: {
      ok: true, took: exit.id, beat, paid, breakthrough, show: exit.show ?? [], scene: atScene(content, s) ? sceneBrief(content, s, ctx.now) : null,
      waypoint: !atScene(content, s) && sceneOf(content, s) ? threadOf(content, s, ctx.now) : null, ended: exit.ends ?? null, waiting,
      ...(walked ? { walked } : {}), ...(grew ? { treasure_grew: grew } : {}),
      summarize: Boolean(exit.next || exit.ends),
    },
  };
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
  if (!target || !here?.roads.includes(target.id) || !provinceOpen(content, target.province, now) || tooHard(content, s, target)) return null;
  s.place = target.id;
  return { from: placeName(content, s, here), to: placeName(content, s, target) };
}

export function judge(state, content, ctx, args) {
  if (!content.riddles.zh.riddles[args.key]) return refuse('unknown-riddle', null);
  return { state: null, result: { ok: true, right: judgeAnswer(content, args.key, args.answer) } };
}

export { advanceChapter, clone, paysOf, replaying, hourOf, judgeAnswer, offerTasks, pay, refuse, RIDDLE_TRIES, riddleOpen, setRiddleAside, spendStamina, triedToday };
