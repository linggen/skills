// rules/aigames.mjs — AI mini-games: 二十问 · 讨价还价 (design.md § AI mini-games; 断案 cut 2026-10-27,
// Hanli 2026-10-15). Part of the rules engine; rules.mjs is its one door.
//
// The model talks, plays roles and judges fuzzy things against a declared
// rubric (worlds/<id>/aigames.json); these rules hold every secret, count
// every turn and decide outcome and pay — capped by the rewards table each
// grant names. Look carries the facts the page draws and never a secret:
// the animal (二十问) reaches only 银月's own tool (`--for=yinyue`), the floor
// (讨价还价) reaches no one. A win is never self-reported: a guess is checked
// against the animal, a deal against the floor.
import { dayKey, pick, seedOf } from '../state.mjs';
import { clone, pay, refuse, spendStamina } from './core.mjs';
import { hashOf } from './travel.mjs';
import { herAwake, herAway } from './companion.mjs';
import { forSale, shopOf } from './look.mjs';
import { visitorHere } from './visiting.mjs';
import { itemBrief, itemOf } from './errands.mjs';
import { bagFull, roomFor } from './pouch.mjs';
import { placeOf } from './world.mjs';

const cfgOf = content => content.aigames ?? null;
const today = (slot, now) => (slot?.day === dayKey(now) ? slot : null);
const text = v => String(v ?? '').trim();

/* ════════ 二十问 — 银月 hosts ════════
   state.twenty = {day, played, game: {round, animal, asked: [{q, a}], guesses: [{g, ok}], outcome, at}}
   `open` is the page's tap (it spends a game's 体力); `ask` and `host` are her
   tool's; `guess` is the page's guess box or her tool passing the player's
   word; `quit` is the page's 认输. */
const TWENTY_ANSWERS = new Set(['yes', 'no', 'partly', 'unknown']);
const animalOf = (content, id) => (cfgOf(content)?.twenty?.animals ?? []).find(a => a.id === id) ?? null;
const countOf = g => g.asked.length + g.guesses.filter(x => !x.ok).length;

/* Today's game — or none. A game from an earlier day is over, unplayed out. */
const twentyToday = (state, now) => today(state.twenty, now);
const twentyGame = (state, now) => twentyToday(state, now)?.game ?? null;

/* Her presence is the game's: no 银月, no host. */
function hostHere(content, state) {
  if (!cfgOf(content)?.twenty) return pick({ zh: '这里没有人陪你玩二十问。', en: 'There is no one here to play twenty questions with.' }, state.lang);
  if (!herAwake(state) || herAway(content, state)) return pick({ zh: '银月不在身边。', en: 'Yinyue is not at your side.' }, state.lang);
  return null;
}

/* The round's animal: one he has not named yet, seeded by day, save and round;
   every one known, any. */
function pickAnimal(content, state, day, round) {
  const all = cfgOf(content).twenty.animals, known = new Set(state.animals ?? []);
  const fresh = all.filter(a => !known.has(a.id));
  const pool = fresh.length ? fresh : all;
  return pool[hashOf(`${day}|${seedOf(state)}|twenty|${round}`) % pool.length];
}

/* What the page and Ling see: the count, the asked list, the guesses — never
   the animal while the game is open. Once it is over, its name is a fact. */
export function twentyBrief(content, state, now) {
  const cfg = cfgOf(content)?.twenty;
  if (!cfg || hostHere(content, state)) return null;
  const t = twentyToday(state, now), g = t?.game ?? null;
  const left = Math.max(0, cfg.rounds - (t?.played ?? 0));
  const known = (state.animals ?? []).length;
  if (!g) return { open: false, rounds_left: left, max: cfg.questions, known };
  const outcome = g.outcome ?? 'open';
  const a = outcome === 'open' ? null : animalOf(content, g.animal);
  return {
    open: outcome === 'open', outcome, count: countOf(g), max: cfg.questions, hint: countOf(g) >= cfg.hint_after,
    asked: g.asked.map(x => ({ q: x.q, a: x.a })), guesses: g.guesses.map(x => x.g), rounds_left: left, known,
    ...(a ? { animal: pick(a.name, state.lang) } : {}),
  };
}

/* Her rules of play, handed in her tool's every answer: she reads no guide. */
const HOST_NOTE = [
  'You host 二十问 (twenty questions). `secret` is the animal: answer each yes/no question TRUTHFULLY about that real, ordinary animal, in your own voice — short, teasing, warm.',
  'NEVER say, spell, rhyme or hint at its name or any of `secret.alias` while the game is open; never tell Ling. Before `hint` is true, give no clue beyond the answer; once `hint` is true, add one small hint to each answer.',
  'Each yes/no question: call Twenty with action ask, the player\'s question verbatim and your answer (yes, no, partly or unknown) — before you reply. When the player names an animal as a guess, call Twenty with action guess and the name they said; never decide a guess yourself — `outcome` says it.',
  'Never read the count out: the card shows it. `outcome` lost: say the animal (`reveal`) and console them. Won: praise them; the rules paid and recorded it.',
  '【二十问 · 你是出题的人】谜底在 `secret`：一种寻常动物。玩家每问一句「是不是」，你照实回答——按那种真实的动物答，用你自己的口吻，短，带点逗。谜底未破之前，绝不说出、拼出、押韵暗示它的名字或任何别名；也不告诉 Ling。`hint` 为 true 之前，除了是或不是不给线索；之后每答一句，捎一点小提示。每个问题先调 Twenty（action ask，question 照抄玩家原话，answer 填 yes / no / partly / unknown），再回话。玩家说出一种动物来猜，调 Twenty（action guess，guess 填他说的名字）——猜没猜中看 `outcome`，不由你判。问了几句，卡片上有，不必念。输了（lost），说出谜底（`reveal`），安慰一句；赢了，夸他。',
].join(' ');

/* Her view: the open game with its secret (only ever on `--for=yinyue`). */
function hostView(content, state, now, extra = {}) {
  const g = twentyGame(state, now), cfg = cfgOf(content).twenty;
  if (!g) return { ok: true, open: false, rounds_left: twentyBrief(content, state, now)?.rounds_left ?? 0, host: 'No game is open. The player starts one on the page card (二十问), or asks you to play: then call Twenty with action open.' };
  const a = animalOf(content, g.animal), lang = state.lang, outcome = g.outcome ?? 'open';
  const brief = twentyBrief(content, state, now);
  // `host` first: another member reading this call is handed its head only
  // (the engine's 1200 characters, chat/thread.rs) — the note fills it, so
  // the secret after it never reaches Ling (tests/aigames.test.mjs).
  return {
    host: HOST_NOTE, ok: true, ...extra, outcome, count: brief.count, left: Math.max(0, cfg.questions - brief.count), hint: brief.hint,
    secret: { name: pick(a.name, lang), alias: a.alias?.[lang] ?? [] },
    asked: brief.asked, guesses: brief.guesses,
    ...(outcome === 'lost' ? { reveal: pick(a.name, lang) } : {}),
  };
}

/* The page's and Ling's answers never carry the secret; hers does. */
const forReader = (content, state, now, ctx, extra) => (ctx.reader === 'yinyue'
  ? hostView(content, state, now, extra)
  : { ok: true, ...extra, twenty: twentyBrief(content, state, now) });

/* A guess as said: the animal it names — the longest name or alias found in
   it, over every animal, so 猫头鹰 is never read as 猫. Null when it names none. */
export function guessed(content, lang, raw) {
  const said = text(raw).toLowerCase();
  if (!said) return null;
  let best = null;
  for (const a of cfgOf(content).twenty.animals) {
    for (const lg of ['zh', 'en']) {
      for (const n of [a.name[lg], ...(a.alias?.[lg] ?? [])].filter(Boolean).map(x => x.toLowerCase())) {
        const hit = lg === 'zh' ? said.includes(n) : new RegExp(`(^|[^a-z])${n}(s|es)?($|[^a-z])`).test(said);
        if (hit && (!best || n.length > best.n.length)) best = { id: a.id, n };
      }
    }
  }
  return best?.id ?? null;
}

export function twenty(state, content, ctx, args) {
  const lang = state.lang, action = text(args.action) || 'host', now = ctx.now;
  const away = hostHere(content, state);
  if (away) return refuse('no-host', away);
  const cfg = cfgOf(content).twenty;
  if (action === 'host') return { state: null, result: forReader(content, state, now, ctx, {}) };
  const s = clone(state);
  const t = twentyToday(s, now), g = t?.game ?? null;
  if (action === 'open') {
    if (g && !g.outcome) return { state: null, result: forReader(content, state, now, ctx, { again: true }) };
    if ((t?.played ?? 0) >= cfg.rounds) return refuse('rounds-done', pick({ zh: `今天的二十问玩够了（${cfg.rounds} 局）。明日再来。`, en: `Enough twenty questions for today (${cfg.rounds} rounds). Tomorrow.` }, lang));
    const empty = spendStamina(content, s, ctx, 'game');
    if (empty) return empty;
    const day = dayKey(now), round = (t?.played ?? 0) + 1;
    s.twenty = { day, played: round, game: { round, animal: pickAnimal(content, s, day, round).id, asked: [], guesses: [], outcome: null, at: now.toISOString() } };
    return { state: s, result: forReader(content, s, now, ctx, { opened: true }) };
  }
  if (!g || g.outcome) return refuse('not-open', null, { twenty: twentyBrief(content, state, now) });
  const game = s.twenty.game;
  if (action === 'ask') {
    const q = text(args.question), a = text(args.answer).toLowerCase();
    if (!q) return refuse('no-question', null);
    if (!TWENTY_ANSWERS.has(a)) return refuse('bad-answer', null, { answers: [...TWENTY_ANSWERS] });
    // The same question twice in a row is one question (a retried call).
    const last = game.asked.at(-1);
    if (last?.q === q) return { state: null, result: forReader(content, state, now, ctx, { again: true }) };
    game.asked.push({ q: q.slice(0, 80), a });
    return settleTwenty(content, s, ctx, {});
  }
  if (action === 'guess') {
    const said = text(args.guess ?? args.answer);
    if (!said) return refuse('no-guess', null);
    const id = guessed(content, lang, said);
    const key = id ?? said.slice(0, 20);
    // A guess already made (the page's, then her call on it) is counted once.
    if (game.guesses.some(x => x.key === key)) return { state: null, result: forReader(content, state, now, ctx, { again: true }) };
    const ok = id === game.animal;
    game.guesses.push({ g: said.slice(0, 20), key, ok });
    return settleTwenty(content, s, ctx, { right: ok });
  }
  if (action === 'quit') {
    game.outcome = 'lost';
    return { state: s, result: forReader(content, s, now, ctx, { gave_up: true }) };
  }
  return refuse('unknown-action', null, { actions: ['open', 'host', 'ask', 'guess', 'quit'] });
}

/* After a question or a guess: won on the right guess (paid, the animal known),
   lost at the last question unguessed. */
function settleTwenty(content, s, ctx, { right = false }) {
  const cfg = cfgOf(content).twenty, game = s.twenty.game;
  let paid = null;
  if (right) {
    game.outcome = 'won';
    if (!(s.animals ?? []).includes(game.animal)) s.animals = [...(s.animals ?? []), game.animal];
    paid = pay(content, s, ctx, cfg.pay);
  } else if (countOf(game) >= cfg.questions) game.outcome = 'lost';
  return { state: s, result: forReader(content, s, ctx.now, ctx, { ...(right ? { right: true } : {}), ...(paid ? { paid } : {}) }) };
}

/* The animals he has named (录): their names, in the order won. */
export const animalsKnown = (content, state) => (state.animals ?? []).map(id => animalOf(content, id)).filter(Boolean).map(a => ({ id: a.id, name: pick(a.name, state.lang) }));

/* ════════ 讨价还价 — Ling plays the keeper ════════
   state.haggle = {day, used, walked: [item], open: {item, place, list, floor, ask, qty, turns, mood, used_reasons, barter}, deals: {place: n}}
   `deals` outlives the day (熟客 is a past deal here). */
const haggleCfg = content => cfgOf(content)?.haggle ?? null;

/* The keeper at this place: a market's or a visiting shop's on its day, that
   aigames.json names. */
function keeperHere(content, state, now) {
  const cfg = haggleCfg(content), here = placeOf(content, state.place);
  const k = cfg?.keepers?.[state.place];
  if (!k || !here) return null;
  const open = here.has?.shop ? shopOf(here) : visitorHere(content, state, here, now);
  return open ? { ...k, place: state.place } : null;
}
const haggleToday = (state, now) => today(state.haggle, now);
const reasonOf = (content, id) => (haggleCfg(content)?.rubric ?? []).find(r => r.id === id) ?? null;
const MOODS = { zh: ['翻脸', '不耐烦', '还行', '和气'], en: ['done with you', 'impatient', 'fair', 'amiable'] };
const moodWord = (n, lang) => (MOODS[lang] ?? MOODS.zh)[Math.max(0, Math.min(3, n))];

/* What the page and Ling see of it — never the floor. `firm` once the ask
   has come down as far as it goes: he says so; the number is no secret then. */
export function haggleBrief(content, state, now) {
  const cfg = haggleCfg(content);
  if (!cfg) return null;
  const k = keeperHere(content, state, now), t = haggleToday(state, now), o = t?.open;
  const left = Math.max(0, cfg.per_day - (t?.used ?? 0));
  if (o && o.place === state.place) {
    const item = itemOf(content, o.item);
    return {
      open: true, keeper: pick(k?.who ?? cfg.keepers[o.place]?.who, state.lang), item: { id: o.item, name: pick(item?.name, state.lang) ?? o.item },
      list: o.list, ask: o.ask, qty: o.qty, total: o.ask * o.qty, turns: o.turns, max_turns: cfg.turns, mood: moodWord(o.mood, state.lang),
      reasons: o.used_reasons.map(id => pick(reasonOf(content, id)?.name, state.lang) ?? id), ...(o.barter ? { barter: pick(itemOf(content, o.barter)?.name, state.lang) } : {}),
      ...(o.ask <= o.floor ? { firm: true } : {}), ...(o.turns >= cfg.turns ? { last_word: true } : {}), left,
    };
  }
  if (!k) return null;
  return { open: false, keeper: pick(k.who, state.lang), left, walked: (t?.walked ?? []).map(id => pick(itemOf(content, id)?.name, state.lang) ?? id) };
}

/* Ling's own answer: the brief, the rubric to tag by, his voice — no floor. */
function haggleView(content, state, now, extra = {}) {
  const cfg = haggleCfg(content), k = keeperHere(content, state, now), lang = state.lang;
  return {
    ok: true, ...extra, haggle: haggleBrief(content, state, now),
    ...(k ? { keeper: { who: pick(k.who, lang), voice: pick(k.voice, lang) } } : {}),
    rubric: cfg.rubric.map(r => ({ id: r.id, name: pick(r.name, lang), about: r.about })),
  };
}

/* The floor for a thing at this keeper: the item's own, else the keeper's, else the default. */
const floorOf = (content, k, item) => {
  const cfg = haggleCfg(content), share = cfg.floors?.[item.id] ?? k.floor ?? cfg.floor;
  return Math.max(1, Math.ceil(item.buy * share));
};

export function haggle(state, content, ctx, args) {
  const cfg = haggleCfg(content), lang = state.lang, now = ctx.now, action = text(args.action) || 'open';
  if (!cfg) return refuse('not-here', null);
  const k = keeperHere(content, state, now);
  const t0 = haggleToday(state, now), o0 = t0?.open && t0.open.place === state.place ? t0.open : null;
  if (!k && !o0) return refuse('not-here', pick({ zh: '这里没有可以讲价的摊子。', en: 'There is no stall here to haggle at.' }, lang));
  const s = clone(state);
  s.haggle = haggleToday(s, now) ?? { day: dayKey(now), used: 0, walked: [], open: null, deals: s.haggle?.deals ?? {} };
  const h = s.haggle;
  if (action === 'open') {
    const item = itemOf(content, text(args.id));
    if (o0) return o0.item === item?.id || !item ? { state: null, result: haggleView(content, state, now, { again: true }) } : refuse('haggling', pick({ zh: '手上这一样还没谈完。', en: 'You are still haggling over the last thing.' }, lang), haggleView(content, state, now));
    if (!item || !item.buy || !forSale(content, s, item, placeOf(content, s.place), now)) return refuse('not-on-shelf', null, haggleView(content, state, now));
    if (h.used >= cfg.per_day) return refuse('haggled-out', pick({ zh: `今天讲价讲够了（${cfg.per_day} 回）。照价买，或明日再来。`, en: `Enough haggling for today (${cfg.per_day}). Pay the list price, or come back tomorrow.` }, lang));
    if (h.walked.includes(item.id)) return refuse('walked-away', pick({ zh: '这一样今天你已经走过一回了，只照价卖。', en: 'You walked away from this one today — list price only.' }, lang));
    h.used += 1;
    h.open = { item: item.id, place: s.place, list: item.buy, floor: floorOf(content, k, item), ask: item.buy, qty: 1, turns: 0, mood: cfg.mood, used_reasons: [], barter: null };
    return { state: s, result: haggleView(content, s, now, { opened: true }) };
  }
  if (!o0) return refuse('not-open', null, haggleView(content, state, now));
  const o = h.open;
  if (action === 'turn') return haggleTurn(content, s, ctx, args, o);
  if (action === 'deal') return haggleDeal(content, s, ctx, o);
  if (action === 'walk') {
    h.walked = [...new Set([...h.walked, o.item])];
    h.open = null;
    return { state: s, result: haggleView(content, s, now, { walked: o.item, line: pick({ zh: '你放下东西走了。这一样今天只照价卖。', en: 'You put it down and walk off. Today it sells at list price only.' }, lang) }) };
  }
  return refuse('unknown-action', null, { actions: ['open', 'turn', 'deal', 'walk'] });
}

/* One argument: Ling tags it (`reason`, a rubric id) and grades it (0 weak ·
   1 fair · 2 strong); the rules apply the rubric's step, clamp at the floor,
   and keep each reason to once. A bare push or a reason used again sours him;
   soured to nothing, he will not haggle on — the list price stands today. */
function haggleTurn(content, s, ctx, args, o) {
  const cfg = haggleCfg(content), lang = s.lang, now = ctx.now;
  if (o.turns >= cfg.turns) return refuse('last-word', pick({ zh: '掌柜的已经报了最后一口价：成交，或者走。', en: 'That was the last word on price: deal, or walk.' }, s.lang), haggleView(content, s, now));
  const r = reasonOf(content, text(args.reason)) ?? reasonOf(content, 'none');
  const grade = Math.max(0, Math.min(2, Math.trunc(Number(args.grade ?? 1)) || 0));
  o.turns += 1;
  let step = 0, why = null;
  const again = r.once && o.used_reasons.includes(r.id);
  if (r.id === 'none' || again || grade === 0) why = again ? 'used' : r.id === 'none' ? 'bare' : 'weak';
  else if (r.needs === 'deal_here' && !(s.haggle.deals?.[o.place] > 0)) why = 'not-a-regular';
  else if (r.needs === 'item') {
    const offered = itemOf(content, text(args.item));
    if (!offered || !(s.bag[offered.id] > 0) || offered.id === o.item || !(offered.sell > 0)) why = 'no-such-thing';
    else {
      o.barter = offered.id;
      step = Math.min(offered.sell, Math.floor(o.list * cfg.barter_cap));
    }
  } else step = Math.round(o.list * r.step * cfg.grades[grade]);
  if (why) o.mood -= 1;
  else {
    o.used_reasons.push(r.id);
    if (r.id === 'bulk') o.qty = 2;
  }
  const before = o.ask;
  o.ask = Math.max(o.floor, o.ask - step);
  if (o.mood <= 0) {
    s.haggle.walked = [...new Set([...s.haggle.walked, o.item])];
    s.haggle.open = null;
    return { state: s, result: haggleView(content, s, now, { soured: true, line: pick({ zh: '掌柜的脸一沉：「不卖了。今天这一样，照价。」', en: 'The keeper\'s face sets: "Not selling. That one is list price today."' }, lang) }) };
  }
  return { state: s, result: haggleView(content, s, now, { came_down: before - o.ask, ...(why ? { refused_reason: why } : {}) }) };
}

/* The deal at the ask he stands at now — the page's 成交 or Ling on the
   player's word. Bought as Trade buys: on the shelf, room in the bag, stones
   enough; a thing offered in trade leaves the bag. */
function haggleDeal(content, s, ctx, o) {
  const lang = s.lang, now = ctx.now, item = itemOf(content, o.item);
  const total = o.ask * o.qty;
  if (s.wealth < total) return refuse('no-stones', pick({ zh: '灵石不够。', en: 'Not enough spirit stones.' }, lang), { price: total, wealth: s.wealth });
  for (let i = 0; i < o.qty; i++) if (!roomFor(content, { ...s, bag: { ...s.bag, [item.id]: (s.bag[item.id] ?? 0) + i } }, item.id)) return bagFull(content, s);
  if (o.barter && !(s.bag[o.barter] > 0)) return refuse('no-such-thing', null);
  const empty = spendStamina(content, s, ctx, 'shop');
  if (empty) return empty;
  s.wealth -= total;
  s.bag[item.id] = (s.bag[item.id] ?? 0) + o.qty;
  if (o.barter) { s.bag[o.barter] -= 1; if (s.bag[o.barter] <= 0) delete s.bag[o.barter]; }
  s.haggle.deals = { ...s.haggle.deals, [o.place]: (s.haggle.deals?.[o.place] ?? 0) + 1 };
  s.haggle.open = null;
  const saved = (o.list - o.ask) * o.qty;
  return { state: s, result: { ok: true, deal: true, bought: item.id, qty: o.qty, price: o.ask, saved, item: itemBrief(content, s, item), paid: { wealth: -total }, wealth: s.wealth, ...(o.barter ? { traded: o.barter } : {}), haggle: haggleBrief(content, s, now) } };
}
