// rules/tasks.mjs — Tasks and quests: boards, errands handed in, win, duel, 论道.
// Part of the rules engine; rules.mjs is its one door.
import { battle } from '../battle.js';
import { gameOf } from '../content.mjs';
import { addStamina, dayKey, periodKey, pick, settleStamina } from '../state.mjs';
import { drop } from './arms.mjs';
import { cardCatalog, fightSetup, winCard } from './cards.mjs';
import { clone, pay, refuse, replaying, spendStamina } from './core.mjs';
import { choreCounts, choreGrant, questDone } from './chores.mjs';
import { advance, countsOf, questDoneBefore, questOf, taskOf, TIERS_ORDER } from './errands.mjs';
import { duelBrief, tasksBrief } from './look.mjs';
import { hashOf } from './travel.mjs';
import { creatureOf, encounterOf, placeOf, sceneOf } from './world.mjs';

/* ── Tasks and quests ── */

export function task(state, content, ctx, args) {
  if (args.action === 'list') return { state: null, result: { ok: true, ...tasksBrief(content, state, ctx) } };
  if (args.action === 'done') return taskDone(state, content, ctx, args.id);
  if (args.action === 'check') return questCheck(state, content, ctx, args.id);
  return refuse('unknown-action', null, { actions: ['list', 'done', 'check'] });
}

/* An errand held and not yet met that asks for a win on this board. It
   reopens a board already done: 云龙山的八味 asks a pill of alchemy-first,
   done once in the story, so the furnace never came back and the errand
   could not be met (his, 2026-09-23: 我已经到这里了, 没触发差事). */
function errandWants(content, state, id) {
  return Object.keys(state.quests ?? {}).some(qid => {
    if (questDoneBefore(state, qid)) return false;
    const q = questOf(content, qid);
    return q ? countsOf(content, state, q).some(n => n.kind === 'board' && n.task === id && !n.done) : false;
  });
}

/* Done before, and open now only for an errand — it pays the errand, not
   the task a second time. */
function reopened(content, state, id, now) {
  const t = taskOf(content, id), held = state.tasks[id];
  const spent = held?.status === 'done' && (t?.period === 'once' || held.period === periodKey(t?.period, now));
  // A game a place hosts is played at that place: the errand sends him there
  // (his screen, 2026-09-23: 碣石's 洛书 stood on the stage at 邺城).
  return Boolean(t) && !t.hosted && (!held || spent) && errandWants(content, state, id);
}

/* A game the place hosts (places' has.games): open here once a period,
   whether or not a scene ever offered it (his, 2026-09-23 — the mini-games
   had no way in). */
function hostedHere(content, state, id) {
  const t = taskOf(content, id);
  return Boolean(t?.hosted) && (placeOf(content, state.place)?.has?.games ?? []).includes(id);
}
const doneThisPeriod = (content, state, id, now) => {
  const t = taskOf(content, id), held = state.tasks[id];
  return held?.status === 'done' && (t?.period === 'once' || held.period === periodKey(t?.period, now));
};

/* A game's level by the player's realm: 练气/筑基 1, 结丹/元婴 2, beyond 3. */
function gameLevel(content, state) {
  const i = TIERS_ORDER(content).indexOf(state.tier);
  return i < 2 ? 1 : i < 4 ? 2 : 3;
}

/* Offered, and not yet done this period — or wanted by an errand, or hosted here. */
function taskOpen(content, state, id, now) {
  const t = taskOf(content, id), held = state.tasks[id];
  if (!t) return false;
  if (reopened(content, state, id, now)) return true;
  if (hostedHere(content, state, id)) return !doneThisPeriod(content, state, id, now);
  if (!held) return false;
  return !(held.status === 'done' && (t.period === 'once' || held.period === periodKey(t.period, now)));
}

function taskDone(state, content, ctx, id) {
  const t = taskOf(content, id);
  if (!t) return refuse('unknown-task', null);
  const again = reopened(content, state, id, ctx.now);
  // A hosted game won today is paid wherever he stands when Ling hands it in:
  // the win was at the place (his 五子棋, 2026-09-23: a queued "go to 彭城" ran
  // before the win's turn, and the pay was refused at 彭城).
  const wonHere = Boolean(t.hosted && state.wins?.[id] && dayKey(new Date(state.wins[id])) === dayKey(ctx.now) && !doneThisPeriod(content, state, id, ctx.now));
  if (!state.tasks[id] && !again && !hostedHere(content, state, id) && !wonHere) return refuse('not-offered', null);
  if (!wonHere && !taskOpen(content, state, id, ctx.now)) return refuse('already-done', null);
  if (!state.wins?.[id]) return refuse('not-won', null);
  const s = clone(state);
  delete s.wins[id];
  if (again) {
    const handed = advance(content, s, { kind: 'board', task: id }, ctx);
    return { state: s, result: { ok: true, done: id, paid: null, gives: null, for: 'errand', ...(handed.length ? { handed } : {}) } };
  }
  // A hosted game costs a little 体力, as a step does (rewards.json
  // stamina.cost.game — his, 2026-09-24: free games out-paid the fight). It
  // is taken as the game is paid: the page records the win without a door of
  // its own, and a win kept while the pool is empty is paid once it refills
  // (the same day — tomorrow the game is played again).
  if (t.hosted) {
    const empty = spendStamina(content, s, ctx, 'game');
    if (empty) return empty;
  }
  s.tasks[id] = { status: 'done', period: periodKey(t.period, ctx.now), done_at: ctx.now.toISOString() };
  if (t.gives?.bag) s.bag[t.gives.bag] = (s.bag[t.gives.bag] ?? 0) + 1;
  const paid = pay(content, s, ctx, t.grant);
  const handed = advance(content, s, { kind: 'board', task: id }, ctx);
  return { state: s, result: { ok: true, done: id, paid, gives: t.gives ?? null, line: pick(t.done_line, s.lang), ...(handed.length ? { handed } : {}) } };
}

/* A real-life chore handed in: today's pick, a fixed one, or a 开府
   milestone (chores.mjs). A pool chore that is not today's pick pays nothing,
   done or not — one a day (redesign-v2). A milestone's period is 'once', so
   its record in the synced save pays it once ever, on any device. */
function questCheck(state, content, ctx, id) {
  const quests = ctx.quests ?? [], q = quests.find(x => x.id === id);
  if (!q) return refuse('unknown-quest', null);
  const period = periodKey(q.period, ctx.now);
  if (state.chores[id]?.period === period) return refuse('already-paid', null);
  if (!choreCounts(state, quests, q, ctx.now)) return refuse('not-today', null, { app: q.app });
  if (!questDone(q, ctx.now)) return refuse('not-done', null, { app: q.app });
  const s = clone(state);
  s.chores[id] = { period, paid_at: ctx.now.toISOString() };
  const grant = choreGrant(content, q);
  const paid = pay(content, s, ctx, grant);
  settleStamina(content, s, ctx.now);
  const stamina = addStamina(content, s, grant.stamina, ctx.now);
  return { state: s, result: { ok: true, quest: id, app: q.app, paid, stamina } };
}

/* The page is the only witness to a board or a duel: it records the win here,
   and Resolve or Task done pays it. Never one of Ling's tools — a win Ling
   could claim would be a self-reported one. */
export function win(state, content, ctx, args) {
  const id = String(args.id ?? '');
  const inScene = sceneOf(content, state)?.exits.some(e => gameOf(e)?.id === id && gameOf(e).kind !== 'duel');
  if (!inScene && !taskOpen(content, state, id, ctx.now)) return refuse('not-here', null);
  const s = clone(state);
  s.wins = { ...s.wins, [id]: ctx.now.toISOString() };
  return { state: s, result: { ok: true, won: id } };
}

/* 降妖 — the scene plays the fight turn by turn, the rules decide it.
   `start` checks the creature has not withdrawn today and charges a fight's
   stamina; then, with `picks` — the player's own turns — the rules replay
   the fight and record the outcome: a win the exit can take, or a loss that
   sends the creature into the mist until tomorrow. A loss costs nothing
   else. A creature beaten today is subdued until tomorrow — a scene's as
   much as a haunt's, and one whose exit waits to be taken is not fought
   again at all: every win drops and deals a card, so a
   second win was a farm (review, 2026-09-24). A scene played again (Go
   back into a chapter done) is fought for the story and pays nothing.
   One fight at a time: while one is open no other starts, and only its
   own picks settle it. */
export function duel(state, content, ctx, args) {
  const id = String(args.id ?? '');
  const exit = sceneOf(content, state)?.exits.find(e => gameOf(e)?.id === id && gameOf(e).kind === 'duel');
  const haunt = !exit && id.startsWith('haunt:') ? encounterOf(content, state, ctx.now) : null;
  if (!exit && !(haunt && haunt.game.id === id)) return refuse('not-here', null);
  if (haunt?.tamed) return refuse('tamed', null, { creature: haunt.creature });
  const game = exit ? gameOf(exit) : haunt.game, creature = creatureOf(content, game.creature);
  const withdrawnLine = exit ? pick(exit.withdrawn, state.lang)
    : pick({ zh: `${pick(creature.name, 'zh')}退入林影，明日再来。`, en: `${pick(creature.name, 'en')} withdraws into the shadows; come back tomorrow.` }, state.lang);
  const s = clone(state);
  const day = dayKey(ctx.now), today = s.duels?.[creature.id];

  // ── 出手: the door of the instance ──
  if (!args.picks) {
    if (today?.day === day && today.outcome === 'lost') return refuse('withdrawn', withdrawnLine, { game: id });
    if (today?.day === day && today.outcome === 'withdrew') return refuse('spent-today', null, { game: id });
    if (today?.day === day && today.outcome === 'won') return refuse('subdued-today', null, { game: id });
    if (exit && s.wins?.[id]) return refuse('won-already', null, { game: id, exit: exit.id });
    if (s.fight && s.fight.game !== id) return refuse('in-a-fight', null, { game: s.fight.game });
    if (!s.traits?.length) return refuse('no-traits', null);
    // A page reloaded mid-fight asks again: the same fight comes back, and the
    // day's 灵气 is not taken twice. The seed is the day's, so the cards deal
    // the same way they did.
    const resuming = s.fight?.game === id && today?.day === day && today.outcome === 'open';
    if (!resuming) {
      const empty = spendStamina(content, s, ctx, 'duel');
      if (empty) return empty;
    }
    s.duels = { ...s.duels, [creature.id]: { day, outcome: 'open' } };
    // While this is set, Ling advances NOTHING (SKILL.md § 斗法): she knows
    // from the save, not from a message, because a message can be lost.
    s.fight = resuming ? s.fight : { game: id, creature: creature.id, at: ctx.now.toISOString() };
    // The whole setup is kept with it, so the settle replays what the page
    // is handed now (an older save's open fight takes it on resume).
    if (!s.fight.setup) s.fight.setup = fightSetup(content, s, creature, ctx.now, id);
    return { state: s, result: { ok: true, started: id, ...(resuming ? { resumed: true } : {}), duel: duelBrief(content, s, game, ctx.now) } };
  }

  // ── 收场: the page hands back what was played, the rules replay it ──
  if (today?.day !== day || today.outcome !== 'open' || s.fight?.game !== id) return refuse('not-started', null, { game: id });
  // The setup the page was handed at the door, not one made again now.
  const setup = s.fight.setup ?? fightSetup(content, s, creature, ctx.now, id);
  const actions = String(args.picks).split(',').map(x => x.trim()).filter(Boolean);
  const played = battle(actions, setup, cardCatalog(content));
  if (played.refused) return refuse(played.refused.why, null, { action: played.refused.action });
  if (played.outcome === 'open') return refuse('unfinished', null, { turn: played.turn });
  delete s.fight;
  // A loss costs nothing but the beast, gone for the day (伤势 was cut, redesign-v2 § 四).
  s.duels[creature.id] = { day, outcome: played.outcome };
  // A 符 played is a 符 spent, win or lose (cards.mjs § 装备入局).
  const spent = spentCharms(content, setup, played);
  for (const id of spent) { s.bag[id] = Math.max(0, (s.bag[id] ?? 0) - 1); if (!s.bag[id]) delete s.bag[id]; }
  const won = played.outcome === 'won';
  // A scene played again is fought for the story: the exit opens, nothing else pays.
  const pays = won && !(exit && replaying(content, s, sceneOf(content, s)));
  const handed = pays ? advance(content, s, { kind: 'subdue', creature: creature.id }, ctx) : [];
  if (won) s.wins = { ...s.wins, [id]: ctx.now.toISOString() };
  // A beast met on the road, beaten, has been met: it leaves the road.
  if (won && haunt?.road) s.meets.places[s.place] = { ...s.meets.places[s.place], done: true };
  const say = played.outcome === 'lost' ? withdrawnLine
    : played.outcome === 'withdrew' ? pick({ zh: `${pick(creature.name, 'zh')}一口气用尽，转身走了 —— 这一场不算你赢。`, en: `${pick(creature.name, 'en')} runs out of breath and turns away — this one is not a win.` }, state.lang)
      : null;
  // What a subdued creature leaves, and what a haunt pays for it. A fight that
  // ended in 遁走 pays nothing: it has to be WON (design.md § 斗法 v3). An
  // elite pays as any beast: its harder deck is all it is (redesign-v2 § 四).
  const dropped = pays ? drop(content, s, creature, ctx.now) : [];
  const card = pays ? winCard(content, s, creature, ctx.now) : null;
  if (card) dropped.push(card);
  const t = content.rewards.tables.haunt;
  const paid = haunt && pays ? pay(content, s, ctx, { table: 'haunt', progress: t.progress, wealth: t.wealth }) : null;
  return { state: s, result: { ok: true, outcome: played.outcome, game: id, say, ...(spent.length ? { spent } : {}), you: played.you, foe: played.foe, turns: played.turn, ...(dropped.length ? { dropped } : {}), ...(handed.length ? { handed } : {}), ...(paid ? { paid, haunt: haunt.creature } : {}) } };
}

/* The 符 the door put in his hand that the fight saw him play — each is
   taken from the bag at the settle. Read off the log the replay wrote, so the
   page and the rules agree on it as they agree on the rest. */
const spentCharms = (content, setup, played) => {
  const catalog = cardCatalog(content), held = new Set((setup.you?.extra ?? []).filter(id => catalog[id]?.charm));
  return [...new Set(played.log.filter(e => e.act === 'played' && e.who === 'you' && held.has(e.id)).map(e => e.id))];
};

/* ── A fight open: the world holds still ──
   While a fight is open (state.fight) the verbs that change the world are
   refused `in-a-fight` — Ling was told so in SKILL.md, the rules never were,
   and a Move mid-fight left the fight unsettleable (review, 2026-09-24). The
   fight's own verbs stand: Duel settles it (or resumes it), Look, Show and the
   readers work. `true` holds the verb; a function holds only the calls it
   says. Anything not named is left alone. */
const FIGHT_HOLDS = {
  resolve: true, move: true, go: true, enter: true, leave: true, trade: true, tale: a => !['info', 'seed'].includes(a.action),
  meet: true, tame: true, refine: true, task: a => a.action !== 'list',
  win: true, travel: true, build: true, load: true, make: true, amend: true, lundao: true,
  divine: true, fate: true, ring: true, greet: true, deck: true, quest: a => !['info', 'kaifu'].includes(a.action),
};
export function fightHold(state, verb, args = {}) {
  const hold = state?.fight ? FIGHT_HOLDS[verb] : null;
  if (!hold || (typeof hold === 'function' && !hold(args))) return null;
  return refuse('in-a-fight', null, { game: state.fight.game });
}

/* A fight left open on an earlier day is over: the creature went, nobody
   won, nothing is paid (a withdrawal). Closed on the next call, whatever it
   is, so a page closed mid-fight never holds the world still overnight.
   Returns the state to go on with, a copy when anything was closed. */
export function closeStaleFight(state, now) {
  const f = state?.fight;
  if (!f || dayKey(new Date(f.at)) === dayKey(now)) return state;
  const s = clone(state);
  delete s.fight;
  const was = s.duels?.[f.creature];
  if (was?.outcome === 'open') s.duels[f.creature] = { ...was, outcome: 'withdrew' };
  return s;
}

/* 论道 — word games with the scholar at 稷下 (his, 2026-09-23: build the
   mini-games). The rules deal the prompt and check the form: the keyword is
   in the line (飞花令), the idiom chains from the last character (成语接龙),
   the lower line is as long as the upper (对对联). Ling judges the meaning —
   a real verse, a real idiom, a fitting couplet — and says it as `ok`, and
   speaks for the scholar. Three good answers win; three misses and he rises
   for the day. It costs a hosted game's 体力 at the door (`open`), as the
   boards do (rewards.json stamina.cost.game). */
const hanOf = s => [...String(s ?? '')].filter(c => /\p{Script=Han}/u.test(c));
const lundaoToday = (state, now) => (state.lundao?.day === dayKey(now) ? state.lundao : null);

function lundaoBrief(content, state, now) {
  const l = lundaoToday(state, now);
  if (!l) return null;
  const cfg = content.lundao, lang = state.lang;
  const name = { feihua: { zh: '飞花令', en: 'Flying-flower verses' }, chengyu: { zh: '成语接龙', en: 'Word chain' }, duilian: { zh: '对对联', en: 'Matching couplets' } }[l.game];
  return { game: l.game, name: pick(name, lang), prompt: l.prompt, last: l.last, good: l.good, misses: l.misses, need: cfg.need, max_misses: cfg.misses, outcome: l.outcome ?? 'open' };
}

function lundaoForm(game, lang, l, answer) {
  const a = String(answer ?? '').trim();
  if (!a) return 'empty';
  if (l.used.includes(a)) return 'used';
  if (game === 'feihua') {
    if (lang === 'zh') { const n = hanOf(a).length; return !a.includes(l.prompt) ? 'no-keyword' : n < 4 || n > 10 ? 'not-a-line' : null; }
    return !new RegExp(`\\b${l.prompt}`, 'i').test(a) ? 'no-keyword' : a.split(/\s+/).length < 3 ? 'not-a-line' : null;
  }
  if (game === 'chengyu') {
    if (lang === 'zh') { const h = hanOf(a); return h.length !== 4 ? 'not-four' : h[0] !== hanOf(l.last).at(-1) ? 'no-chain' : null; }
    const w = a.toLowerCase().replace(/[^a-z]/g, '');
    return w.length < 3 ? 'not-a-word' : w[0] !== l.last.toLowerCase().replace(/[^a-z]/g, '').at(-1) ? 'no-chain' : null;
  }
  if (game === 'duilian') return hanOf(a).length !== hanOf(l.prompt).length ? 'not-matched' : a === l.prompt ? 'used' : null;
  return 'unknown-game';
}

export function lundao(state, content, ctx, args) {
  const cfg = content.lundao, lang = state.lang, action = String(args.action ?? 'open');
  if (!cfg || !hostedHere(content, state, 'lundao')) return refuse('not-here', pick({ zh: '这里没有可论道的人。', en: 'There is no one here to debate.' }, lang));
  const s = clone(state), today = lundaoToday(s, ctx.now);
  if (action === 'open') {
    if (today?.outcome === 'lost') return refuse('lost-today', pick({ zh: '先生已起身，明日再来。', en: 'The scholar has risen for the day. Come back tomorrow.' }, lang));
    if (today && !today.outcome) return { state: null, result: { ok: true, lundao: lundaoBrief(content, s, ctx.now) } };
    if (doneThisPeriod(content, s, 'lundao', ctx.now)) return refuse('done-today', pick({ zh: '今日已论过道了。', en: 'You have debated today already.' }, lang));
    const empty = spendStamina(content, s, ctx, 'game');
    if (empty) return empty;
    const day = dayKey(ctx.now);
    const games = lang === 'zh' ? ['feihua', 'chengyu', 'duilian'] : ['feihua', 'chengyu'];
    const game = games[hashOf(`${day}|${s.name ?? ''}|lundao`) % games.length];
    const list = game === 'duilian' ? cfg.duilian.zh : cfg[game][lang === 'zh' ? 'zh' : 'en'];
    const dealt = list[hashOf(`${day}|${s.name ?? ''}|lundao|${game}`) % list.length];
    const prompt = game === 'duilian' ? dealt.up : dealt;
    s.lundao = { day, game, prompt, last: prompt, good: 0, misses: 0, used: [prompt], ...(game === 'duilian' ? { model: dealt.down } : {}) };
    return { state: s, result: { ok: true, opened: true, lundao: lundaoBrief(content, s, ctx.now), ...(game === 'duilian' ? { model: dealt.down } : {}) } };
  }
  if (action !== 'turn') return refuse('unknown-action', null, { actions: ['open', 'turn'] });
  if (!today || today.outcome) return refuse('not-open', null);
  const l = s.lundao, form = lundaoForm(l.game, lang, l, args.answer);
  const judged = String(args.ok ?? '') === 'true';
  const good = !form && judged;
  const answer = String(args.answer ?? '').trim();
  if (good) {
    l.good += 1; l.used.push(answer);
    // The chain goes on from the scholar's reply when it chains, else from the answer.
    const reply = String(args.reply ?? '').trim();
    l.last = l.game === 'chengyu' && reply && !lundaoForm('chengyu', lang, { ...l, last: answer }, reply) ? reply : answer;
    if (l.game === 'chengyu' && reply) l.used.push(reply);
    // 对对联: a fresh upper line each round; 飞花令 keeps its keyword.
    if (l.game === 'duilian' && l.good < cfg.need) {
      const next = cfg.duilian.zh[hashOf(`${l.day}|${s.name ?? ''}|lundao|duilian|${l.good}`) % cfg.duilian.zh.length];
      l.prompt = next.up; l.model = next.down;
    }
  } else l.misses += 1;
  let paid = null;
  if (l.good >= cfg.need) {
    l.outcome = 'won';
    const t = taskOf(content, 'lundao');
    s.tasks.lundao = { status: 'done', period: periodKey(t.period, ctx.now), done_at: ctx.now.toISOString() };
    paid = pay(content, s, ctx, t.grant);
    advance(content, s, { kind: 'board', task: 'lundao' }, ctx);
  } else if (l.misses >= cfg.misses) l.outcome = 'lost';
  return { state: s, result: { ok: true, good, ...(form ? { form } : {}), ...(!form && !judged ? { judged: false } : {}), lundao: lundaoBrief(content, s, ctx.now), ...(l.model && !l.outcome ? { model: l.model } : {}), ...(paid ? { paid, line: pick(taskOf(content, 'lundao').done_line, lang) } : {}) } };
}

export { doneThisPeriod, gameLevel, lundaoBrief, lundaoForm, questCheck, questDone, reopened };
