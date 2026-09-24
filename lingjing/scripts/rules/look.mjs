// rules/look.mjs — The reading: the shelf, the briefs, Look, and what is on the stage.
// Part of the rules engine; rules.mjs is its one door.
import { CAST, gameOf } from '../content.mjs';
import { askMinusStage, stageCards, stageOwns } from '../stage.mjs';
import { dayKey, fill, periodKey, pick, rollDay, settleStamina, speedOf, stepName, threshold } from '../state.mjs';
import { artsBrief, canRefine, refineWith, treasureBrief } from './arms.mjs';
import { askOf, thenFor } from './ask.mjs';
import { fightSetup, healthBrief } from './cards.mjs';
import { bondBrief, callDue, companionOf, hasCompanion, questBrief } from './companion.mjs';
import { clone, RIDDLE_TRIES, riddleOf, riddleOpen, triedToday } from './core.mjs';
import { chanceBrief, journeyBrief, staminaBrief } from './daily.mjs';
import { bookOf, breakthroughOf, directorBrief, handedHere, itemOf, liveBranch, offersOf, taskOf, waypointOf, workOf } from './errands.mjs';
import { divinationBrief, fateBrief } from './fortune.mjs';
import { doneThisPeriod, gameLevel, lundaoBrief, questDone, reopened } from './tasks.mjs';
import { atScene, creatureOf, placeBrief, placeOf, sceneOf, settlePlace } from './world.mjs';
import { building } from './worlds.mjs';

/* The market's shelf: the catalog sold in this province — and, while the
   companion is still to be found, her bell at every market, since the call
   comes wherever the player stands. */
const shelfOf = (content, province, state = null) => {
  const sold = content.items.items.filter(i => (i.sold ?? []).includes(province));
  const c = companionOf(content);
  const searching = c && state && !state.companion?.joined && (state.companion || callDue(content, state)) && !(state.bag[c.bell] > 0);
  return searching && !sold.some(i => i.id === c.bell) ? [...sold, itemOf(content, c.bell)] : sold;
};
const forSale = (content, state, item, province) => shelfOf(content, province, state).some(i => i.id === item.id);

/* A speaker's name in the player's language; Ling narrates, unnamed. */
const nameOf = (content, who, lang) => (who === 'ling' ? null : pick(CAST[who] ?? creatureOf(content, who)?.name, lang));
/* Lines as the scene says them. Before the companion is found, her line is
   the narration's `alone` text, or it is not said at all. */
const spoken = (content, state, lines) => (lines ?? []).flatMap(l => {
  const c = companionOf(content);
  if (c && l.who === c.id && !hasCompanion(state)) {
    return l.alone ? [{ who: 'ling', name: null, text: fill(pick(l.alone, state.lang), state) }] : [];
  }
  return [{ who: l.who, name: nameOf(content, l.who, state.lang), text: fill(pick(l.text, state.lang), state) }];
});

/* A made world is read by its map: its scenes stand at places, so their
   cards end with the province's map, as its places' do. */
const withMap = (content, show) => (content.world.made && !show.some(c => c.card === 'map') ? [...show, { card: 'map' }] : show);

function sceneBrief(content, state, now = new Date()) {
  const scene = sceneOf(content, state);
  if (!scene) return null;
  const ctxNow = now;
  const lang = state.lang, say = pair => fill(pick(pair, lang), state);
  const buttons = scene.buttons ?? [];
  return {
    id: scene.id,
    place: say(scene.place),
    setup: say(scene.setup),
    cast: (scene.cast ?? []).filter(id => id !== companionOf(content)?.id || hasCompanion(state)).map(id => ({ id, name: nameOf(content, id, lang) })),
    show: withMap(content, scene.show ?? []),
    lines: spoken(content, state, scene.lines),
    buttons: buttons.map(id => ({ id, label: say(scene.exits.find(e => e.id === id).label) })),
    exits: scene.exits.map(e => exitBrief(content, state, e, buttons.includes(e.id), ctxNow, scene)),
  };
}

/* The fight as the scene draws it: the creature at the player's own realm —
   its numbers, its lean and the turns it takes — the player's roots and
   arms, and today's fight if one is open or done. */
function duelBrief(content, state, game, now) {
  const creature = creatureOf(content, game.creature);
  const lang = state.lang, today = state.duels?.[game.creature];
  const open = today?.day === dayKey(now) ? today : null;
  return {
    id: game.id,
    creature: {
      id: creature.id, name: pick(creature.name, lang),
      ...(lang === 'zh' && creature.pinyin ? { pinyin: creature.pinyin } : {}),
      root: creature.root, root_name: pick(content.traits.elements[creature.root], lang),
      lean: creature.lean, art: creature.art ?? null, about: pick(creature.about, lang),
      ...(creature.elite ? { elite: true } : {}),
    },
    health: healthBrief(content, state, now),
    // Everything the fight is given at the door, and nothing else.
    setup: fightSetup(content, state, creature, now, game.id),
    today: open ? { outcome: open.outcome } : null,
  };
}

function exitBrief(content, state, exit, button, ctxNow = new Date(), scene = sceneOf(content, state)) {
  const brief = { id: exit.id, means: exit.means, button };
  if (exit.needs) brief.needs = exit.needs;
  if (exit.breakthrough) brief.breakthrough = breakthroughOf(content, state);
  if (exit.key) {
    const key = riddleOf(state, scene, exit, ctxNow);
    const riddle = content.riddles[state.lang].riddles[key], tried = triedToday(state, scene, exit, key, ctxNow);
    const closed = tried.length >= RIDDLE_TRIES;
    Object.assign(brief, { riddle: riddle.q, choices: riddle.choices, tried, closed, ...(!closed && riddleOpen(state, scene, exit, key, ctxNow) ? { waiting: true } : {}) });
  }
  const game = gameOf(exit);
  if (game) {
    Object.assign(brief, { game, won: Boolean(state.wins?.[game.id]) });
    if (game.kind === 'duel') {
      const today = state.duels?.[game.creature];
      brief.withdrawn = today?.day === dayKey(ctxNow) && today.outcome === 'lost';
      brief.duel = duelBrief(content, state, game, ctxNow);
    }
  }
  if (exit.value) brief.value = { field: exit.value.field, max_chars: exit.value.max_chars, offers: exit.value.offers.map(o => pick(o, state.lang)) };
  return brief;
}


function tasksBrief(content, state, ctx) {
  const lang = state.lang;
  // Today's practice: what is offered or won, and what was done today. A
  // task done once on an earlier day is history, not today's (his "what is
  // this task for today?", 2026-09-16, the prologue's alchemy five days on).
  const today = dayKey(ctx.now);
  // A board an errand reopened stands offered again, whatever it was.
  const again = new Set((content.tasks?.tasks ?? []).map(t => t.id).filter(id => reopened(content, state, id, ctx.now)));
  const held = Object.fromEntries([...again].map(id => [id, { status: 'offered' }]));
  // The games this place hosts, open today — beside the story's own boards.
  const hosted = Object.fromEntries((placeOf(content, state.place)?.has?.games ?? [])
    .filter(id => taskOf(content, id)?.hosted && !doneThisPeriod(content, state, id, ctx.now)).map(id => [id, { status: 'offered' }]));
  const tasks = Object.entries({ ...state.tasks, ...held, ...hosted })
    .filter(([, t]) => t.status !== 'done' || (t.done_at ? dayKey(new Date(t.done_at)) === today : false))
    .map(([id, t]) => {
      const task = taskOf(content, id);
      return {
        id, title: pick(task.title, lang), kind: task.kind, status: t.status,
        won: Boolean(state.wins?.[id]),
        paid: t.status === 'done', period: t.period ?? task.period ?? null, // done = paid, once or per period
        ...(again.has(id) ? { for_errand: true } : {}),
        done_at: t.done_at ?? null,
        // what it asks and what it pays, so Ling can tell the practice
        ...(task.game ? { game: task.game, level: gameLevel(content, state) } : {}),
        ...(hosted[id] ? { hosted: true } : {}),
        asks: task.kind === 'board' && !task.game ? (lang === 'zh' ? '在炉前把八味灵草两两配齐' : 'Pair the eight spirit herbs on the furnace board') : task.game ? pick(task.title, lang) : null,
        // reopened for an errand, the errand pays — not the task again
        pays: again.has(id) ? null : task.grant?.progress ?? null, gives: !again.has(id) && task.gives?.bag ? pick(itemOf(content, task.gives.bag)?.name, lang) : null,
      };
    });
  const quests = (ctx.quests ?? []).filter(q => q.due || questDone(q, ctx.now)).map(q => ({
    id: q.id, app: q.app, title: pick(q.title, lang),
    done: questDone(q, ctx.now), paid: state.chores[q.id]?.period === periodKey(q.period, ctx.now),
    done_at: questDone(q, ctx.now) ? q.done_at : null, // when its app saw it done — the scene says so
    period: q.period, reward: q.reward ?? null, stamina: q.stamina ?? null, // what it pays, so Ling can tell the practice
  }));
  return { tasks, quests };
}

/* The world's words for the harness's ids, in the player's language — the
   only names Ling, the cards and the lines ever use. */
function wordsOf(content, lang) {
  const words = Object.fromEntries(Object.entries(content.dictionary.words).map(([id, w]) => [id, pick(w, lang)]));
  return {
    ...words,
    tiers: content.ladder.tiers.map(t => pick(t.name, lang)),
    provinces: Object.values(content.dictionary.provinces).map(p => pick(p, lang)),
  };
}

export function look(state, content, ctx) {
  const lang = state.lang;
  state = clone(state);
  settleStamina(content, state, ctx.now);
  settlePlace(content, state);
  rollDay(state, ctx.now);
  const traits = state.traits && {
    ids: state.traits,
    elements: state.traits.map(e => pick(content.traits.elements[e], lang)),
    name: pick(content.traits.names[String(state.traits.length)], lang),
    speed: speedOf(content, state),
  };
  const chapter = content.chapters[state.chapter];
  const brief = {
    ok: true, lang, name: state.name, ...(state.lang_set ? { lang_set: true } : {}),
    world: worldBrief(content, lang),
    ...building(content),
    tier: { id: state.tier, step: state.step + 1, name: stepName(content, state.tier, state.step, lang) },
    progress: state.progress, next: threshold(content, state), wealth: state.wealth,
    traits,
    bag: Object.entries(state.bag).map(([id, n]) => ({ id, name: pick(itemOf(content, id)?.name, lang) ?? id, n })),
    wear: state.wear ?? {},
    arts: artsBrief(content, state),
    treasure: treasureBrief(content, state, ctx.now),
    // At 结丹 with none bound: what a binding would take, held now.
    ...(state.treasure || !canRefine(content, state) ? {} : { can_refine: true, refine_with: refineWith(content, state) }),
    // A fight open on the scene: while this is here Ling advances nothing.
    ...(state.fight ? { fight: { open: true, game: state.fight.game, creature: pick(creatureOf(content, state.fight.creature)?.name, state.lang) } } : {}),
    cast: state.cast.map(id => ({ id, name: pick(creatureOf(content, id).name, lang) })),
    chapter: { id: chapter.id, title: pick(chapter.title, lang) },
    scene: atScene(content, state) ? sceneBrief(content, state, ctx.now) : null,
    waypoint: waypointOf(content, state, ctx),
    place: placeBrief(content, state, ctx.now),
    director: directorBrief(content, state, ctx),
    companion: hasCompanion(state) ? { id: companionOf(content).id, name: nameOf(content, companionOf(content).id, lang), joined: state.companion.joined, bond: bondBrief(content, state), ...(state.tended === dayKey(ctx.now) ? { tended: true } : {}), ...(journeyBrief(content, state, ctx.now) ? { journey: journeyBrief(content, state, ctx.now) } : {}), ...(state.journey?.day === dayKey(ctx.now) ? { journeyed: true } : {}) } : null,
    quest: questBrief(content, state, ctx.now),
    // 差事: what is in hand, and what may be taken where he stands.
    book: bookOf(content, state, lang, ctx),
    ...(lundaoBrief(content, state, ctx.now) ? { lundao: lundaoBrief(content, state, ctx.now) } : {}),
    // 所得: errands that handed themselves in here, until he walks on.
    ...(handedHere(content, state).length ? { handed: handedHere(content, state) } : {}),
    // 机缘: where, and how long it lasts — the page counts it down.
    ...(chanceBrief(content, state, ctx.now) ? { chance: chanceBrief(content, state, ctx.now) } : {}),
    // Where an errand may be taken, when the book has room — so 「what now」 has an answer.
    ...(workOf(content, state, ctx) ? { work: workOf(content, state, ctx) } : {}),
    ...(offersOf(content, state, lang, ctx.now).length ? { offers: offersOf(content, state, lang, ctx.now) } : {}),
    ended: state.ended, branch: liveBranch(state, ctx.now), story: state.story,
    divination: divinationBrief(content, state, ctx.now),
    fate: fateBrief(content, state),
    stamina: staminaBrief(content, state, ctx.now),
    health: healthBrief(content, state, ctx.now),
    made: { at: state.made?.at ?? null, scenes: Object.keys(state.made?.scenes ?? {}) },
    words: wordsOf(content, lang),
    ...tasksBrief(content, state, ctx),
  };
  return { ...onStage(content, state, ctx, {}, brief), ...brief };
}

/* The stage and the question, decided together and never twice (his law,
   2026-09-18: a widget may stand in the chat or on the stage, both sides are
   told, and only one of them shows it).

   `stage` is what Ling can SEE standing there — short strings, `kind` or
   `kind:id`, because her context is not a place to put a card list in (his
   「don't blow ling's context up」). She needs nothing more: the question she
   is handed has already had the stage's own actions taken out of it, so she
   cannot offer one by accident, and the page draws the same list from the same
   reading. */
function onStage(content, state, ctx, result = {}, brief = null) {
  const view = brief ?? look(state, content, ctx);
  const cards = stageCards(view, { focus: shownHere(content, state, view), fight: Boolean(state.fight) });
  const ask = askMinusStage(askOf(content, state, ctx, result), stageOwns(view, cards));
  return { then: thenFor(result, ask), ask, stage: cards };
}

/* What Ling last showed, while she is still in the place she showed it — else
   the cards this scene or place was authored with, so a creature is pictured
   even when she forgets to Show it. Walking away clears the stage by itself. */
function shownHere(content, state, view) {
  if (state.shown?.length && state.shown_at === stageAt(content, state)) {
    // A shelf Ling showed is the shelf as it is NOW — a list kept in the save
    // missed every ware added since (seen 2026-09-23: 回春丹 and 望气术 absent
    // from 彭城's card on his save while the shelf itself held them).
    const live = (view.place?.show ?? []).find(c => c.card === 'item');
    return live ? state.shown.map(c => (c.card === 'item' ? live : c)) : state.shown;
  }
  return view.scene?.show ?? view.place?.show ?? [];
}

/* Where the stage stands: the scene being played, else the place. One
   expression, read by the Show that writes it and the Look that reads it —
   two spellings of this is how the cards went missing the first time. */
const stageAt = (content, state) => (atScene(content, state) ? sceneOf(content, state).id : state.place ? `place:${state.place}` : null);

/* The world card as Look tells it — and where its files are, relative to
   the skill, so the page finds a made world's art beside a shipped one's. */
function worldBrief(content, lang) {
  const w = content.world;
  return {
    id: w.id, title: pick(w.title, lang), style: pick(w.style, lang), premise: pick(w.premise, lang) ?? null,
    made: Boolean(w.made), base: w.base ?? null, dir: w.made ? `data/worlds/${w.id}` : `worlds/${w.id}`,
    ...(w.made ? { map: w.map ?? null } : {}),
    ...(w.atlas ? { atlas: { file: w.atlas.file, aspect: w.atlas.aspect, provinces: w.atlas.provinces } } : {}),
  };
}

export { duelBrief, forSale, nameOf, onStage, sceneBrief, shelfOf, shownHere, spoken, stageAt, tasksBrief, withMap, wordsOf };
