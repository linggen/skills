// rules/look.mjs — The reading: the shelf, the briefs, Look, and what is on the stage.
// Part of the rules engine; rules.mjs is its one door.
import { CAST, gameOf } from '../content.mjs';
import { askMinusStage, stageCards, stageOwns } from '../stage.mjs';
import { dayKey, fill, genderOf, itemName, lockedOf, periodKey, personOf, pick, rollDay, settleStamina, speedOf, phaseName, stepName, threshold, seedOf } from '../state.mjs';
import { artsBrief, canRefine, refineWith, treasureBrief } from './arms.mjs';
import { askOf, THEN_BORN, THEN_THROW, THEN_VALUE, thenFor } from './ask.mjs';
import { fightSetup } from './cards.mjs';
import { callDue, companionOf, hasCompanion, herAwake, herAway, herCard, questBrief, recalledOf } from './companion.mjs';
import { clone, RIDDLE_TRIES, riddleOf, riddleOpen, triedToday } from './core.mjs';
import { staminaBrief } from './daily.mjs';
import { bookOf, breakthroughOf, directorBrief, errandFor, handedHere, itemOf, offersOf, taskOf, waypointOf, workOf } from './errands.mjs';
import { divinationBrief, fateBrief, prng } from './fortune.mjs';
import { withoutLocked } from './locks.mjs';
import { chanceBrief } from './road.mjs';
import { seclusionBrief } from './seclusion.mjs';
import { chapterLook, nodeLook, recapLook } from './story.mjs';
import { knownBrief, liveTale, storyDue, taleBrief } from './tale.mjs';
import { kaifuBrief, kaifuReady, questDone, todayChores } from './chores.mjs';
import { catchHere, gameLevel, hostedHere, lundaoBrief, reopened, stallHere } from './tasks.mjs';
import { hashOf } from './travel.mjs';
import { atScene, beatOf, creatureOf, encounterOf, ofJuan, passed, placeBrief, placeOf, sceneOf, settlePlace } from './world.mjs';
import { rowOf } from './ledger.mjs';
import { building } from './worlds.mjs';
import { chapterLabel, sideLine } from './hui.mjs';
import { capLook } from './cap.mjs';
import { practiceHint } from './scrolls.mjs';
import { owesTell } from './tell.mjs';
import { mainRoot, rootName } from './roots.mjs';
import { memoriesLook } from './memories.mjs';
import { todayBrief } from './festival.mjs';
import { weatherBrief } from './weather.mjs';
import { newHere, portraitOf } from './codex.mjs';
import { hotspotsOf, lookHint, seenLog, seenMet, SEEN_KEEP } from './examine.mjs';

/* The market's shelf: the catalog sold in this province — and, while the
   companion is still to be found, her bell at every market, since the call
   comes wherever the player stands. */
/* 按店进货 (his, 2026-10-05): a place's `shop` may say what its own shop
   sells — `{ name, keeper, goods: [item ids], opens: { done: <scene> } }`, its
   goods only, and nothing until the scene `opens.done` is behind him (邺城's
   豆腐坊 stays shut until the 漳水). `shop: true` (older data, a made world) is
   the province's catalog shelf, by items' `sold`. Either way nothing of a 卷
   not open is on it (world.mjs ofJuan). `where` is the place, or a province. */
const shopOf = place => (place?.has?.shop && typeof place.has.shop === 'object' ? place.has.shop : null);
const shopOpen = (shop, state, content = null) => !shop?.opens?.done || (content ? passed(content, state, shop.opens.done) : (state?.done_scenes ?? []).includes(shop.opens.done));
const shelfOf = (content, where, state = null, now = new Date()) => {
  const place = typeof where === 'string' ? null : where, shop = shopOf(place);
  const province = place ? place.province : where;
  const sold = shop
    ? (shopOpen(shop, state, content) ? (shop.goods ?? []).map(id => itemOf(content, id)).filter(i => i && ofJuan(content, i, now)) : [])
    : content.items.items.filter(i => (i.sold ?? []).includes(province) && ofJuan(content, i, now));
  const c = companionOf(content);
  const searching = c && state && !state.companion?.joined && (state.companion || callDue(content, state)) && !(state.bag[c.bell] > 0);
  return searching && !sold.some(i => i.id === c.bell) ? [...sold, itemOf(content, c.bell)] : sold;
};
const forSale = (content, state, item, where) => shelfOf(content, where, state).some(i => i.id === item.id);

/* A speaker's name in the player's language; Ling narrates, unnamed. A
   person (people.json) or a slot (`ban`, the companion by gender) is named
   as the save makes them. */
const nameOf = (content, who, lang, state = null) => (who === 'ling' ? null
  : pick(CAST[who] ?? creatureOf(content, who)?.name ?? personOf(content, state, who)?.name, lang));
/* Lines as the scene says them. Before the companion is found, her line is
   the narration's `alone` text, or it is not said at all. Once she walks
   with the player it is not here either: it is hers to say, in her own words
   (Hanli, 2026-09-24) — the move hands it to her as `her_beat` (story.mjs). */
const spoken = (content, state, lines) => (lines ?? []).flatMap(l => {
  const c = companionOf(content);
  if (c && l.who === c.id) {
    if (herAwake(state)) return [];
    return l.alone ? [{ who: 'ling', name: null, text: fill(pick(l.alone, state.lang), state) }] : [];
  }
  // A person speaks as themselves — a slot as the one it stands for.
  const person = personOf(content, state, l.who);
  return [{ who: person?.id ?? l.who, name: nameOf(content, l.who, state.lang, state), text: fill(pick(l.text, state.lang), state, content) }];
});

/* The people a scene brings on — its lines' speakers and its exits' — each
   with the voice Ling writes them in, and the portrait the page draws. */
function peopleIn(content, state, scene) {
  // Who the scene names (`people`, a 连环画 beat: its story is told in the chat,
  // so its speakers are listed, not found in lines), then whoever speaks.
  const whos = [...(scene.people ?? []), ...[...(scene.lines ?? []), ...scene.exits.flatMap(e => e.beat ?? [])].map(l => l.who)];
  const seen = new Map();
  for (const who of whos) {
    const p = personOf(content, state, who);
    if (p && !seen.has(p.id)) seen.set(p.id, { id: p.id, name: pick(p.name, state.lang), role: fill(pick(p.role, state.lang), state, content), voice: pick(p.voice, state.lang), art: portraitOf(content, state, p.id, p.art) });
  }
  // Before she walks with the player she is the story's (the little fox, the
  // girl at dawn): her face in the form the scene names. After, she stands on
  // the stage herself.
  const form = scene.her && !hasCompanion(state) ? companionOf(content)?.forms?.[scene.her] : null;
  // The 图鉴 decides her picture too: none until a good one is painted (a name card).
  if (form) seen.set(companionOf(content).id, { id: companionOf(content).id, name: pick(form.name, state.lang), role: pick(form.role, state.lang), art: portraitOf(content, state, companionOf(content).id, form.art) });
  return [...seen.values()];
}

/* A beat on the stage as a text card (his, 2026-09-29: 「不用小人书的方式了」 —
   a story moment is never illustrated): the place, two to four lines of
   caption, and the scene's own choices under it — the plain exits; a name, a
   birthday, a fight or a board has its own card. Pictures are the 图鉴's. */
function panelOf(content, state, scene, buttons) {
  if (!scene.panel) return null;
  const say = pair => fill(pick(pair, state.lang), state, content);
  // A scene's fight with the book's own words for it (站着，不跪 · 只躲，不还手) is a
  // choice first: its words stand under the card, and the fight comes up once
  // chosen (2026-10-01: 冰夷's trial stood on arrival, before he chose to stand).
  const called = e => gameOf(e)?.kind === 'duel' && Boolean(e.label);
  const own = e => e.value || e.born || (gameOf(e) && !called(e)) || e.breakthrough;
  // A staying choice already made (看碑背) is not offered again: its passage was told.
  // A choice the scene turned down (`snub`) stays, greyed: tried, and seen to fail.
  const marked = e => Boolean(e.mark) && (state.marks ?? []).includes(e.mark);
  const done = e => e.stay && !e.snub && marked(e);
  const taps = buttons.map(id => scene.exits.find(e => e.id === id)).filter(e => e && !own(e) && !done(e))
    .map(e => ({ id: e.id, label: say(e.label), ...(called(e) ? { duel: gameOf(e).id } : {}), ...(e.snub && marked(e) ? { spent: true } : {}) }));
  // A painted picture for the beat, when the world has one: it fills the stage behind the dialogue box.
  return { place: say(scene.place), ...(scene.panel.art ? { art: scene.panel.art } : {}), caption: (scene.panel.caption?.[state.lang] ?? scene.panel.caption?.zh ?? []).map(l => fill(l, state, content)), taps: quietOne(scene, taps), ...(invites(state, taps) ? { invite: true } : {}) };
}

/* Only a real decision is a row of buttons (his, 2026-09-29: tapping on felt
   like turning pages). A scene with one plain way on is a transition: its one
   tap is `quiet` — the page draws a small link, not a button. The link keeps
   the choice's own words (请巫祝婆婆先去报信, 能。, 今日到此——大比，明日):
   live 2026-10-01 they all read 「接着 ›」 and the book's decisions vanished.
   Only an exit with no words of its own is a bare 「接着」. */
const quietOne = (scene, taps) => (taps.length === 1 && !taps[0].spent
  ? [{ ...taps[0], quiet: taps[0].label ? 'label' : 'on' }] : taps);

/* 「也可以直接说你想怎么做」 — now and then, not on every scene: a real
   decision (two ways or more), on every INVITE_EVERY-th scene played. */
const INVITE_EVERY = 3;
const invites = (state, taps) => taps.filter(t => !t.spent).length >= 2 && (state.done_scenes ?? []).length % INVITE_EVERY === 0;

/* The things this player has named, id → the name the page shows. */
function namedOf(content, state, lang) {
  const named = Object.fromEntries((content.items?.items ?? []).filter(i => i.named && state[i.named]).map(i => [i.id, itemName(i, state, lang)]));
  return Object.keys(named).length ? { named } : {};
}

/* 恩仇簿 as Look tells it: who, 恩 · 仇 · 诺, what, the player's own words,
   when — oldest first, in the player's language. The page draws every entry;
   `here` marks what Ling is handed (forLing): the people present, and every
   promise still open (哇时刻 5 — so the words come back when they do). */
function ledgerOf(content, state, now = new Date()) {
  const present = presentOf(content, state, now);
  return (state.ledger ?? []).map(e => ({
    ...rowOf(content, state, e), ...(e.day ? { day: e.day } : {}), ...(e.by ? { by: e.by } : {}),
    here: present.has(e.who) || (e.kind === '诺' && e.kept == null),
  }));
}

/* Who stands here: the scene's people, the companion at the player's side,
   the beast of the place. */
function presentOf(content, state, now) {
  const ids = new Set(atScene(content, state) ? peopleIn(content, state, sceneOf(content, state)).map(p => p.id) : []);
  if (hasCompanion(state)) ids.add(companionOf(content).id);
  const beast = !atScene(content, state) ? encounterOf(content, state, now)?.creature?.id : null;
  if (beast) ids.add(beast);
  return ids;
}

/* A made world is read by its map: its scenes stand at places, so their
   cards end with the province's map, as its places' do. */
const withMap = (content, show) => (content.world.made && !show.some(c => c.card === 'map') ? [...show, { card: 'map' }] : show);

function sceneBrief(content, state, now = new Date()) {
  const scene = sceneOf(content, state);
  if (!scene) return null;
  const ctxNow = now;
  const lang = state.lang, say = pair => fill(pick(pair, lang), state, content);
  // A choice a thread sets up (`needs.quest`: 孙二狗's charm before the 大比)
  // is not offered until the thread is done — the story never set it up.
  // A choice that waits on a clue (`needs.seen`, rules/examine.mjs) is not offered until it is found.
  const setUp = id => {
    const exit = scene.exits.find(e => e.id === id), needs = exit?.needs, marks = state.marks ?? [];
    // A step the story set down first (`needs.mark`) waits for it; a step taken once (`once`, its mark held) is done.
    if (needs?.mark && !marks.includes(needs.mark)) return false;
    if (exit?.once && exit.mark && marks.includes(exit.mark)) return false;
    return (!needs?.quest || Boolean(state.quests?.[needs.quest]?.done_at)) && (!needs?.seen || seenMet(state, scene.id, needs.seen));
  };
  const buttons = (scene.buttons ?? []).filter(setUp);
  const people = peopleIn(content, state, scene);
  const panel = panelOf(content, state, scene, buttons);
  // 图鉴: who and what this scene brings on for the first time (codex.mjs) — the page shows their cards.
  const meet = newHere(content, state, scene);
  const looks = hotspotsOf(content, state, scene), hint = lookHint(content, state, scene);
  // A line beside the book's own (a 今 interlude, rules/hui.mjs sideLine): the page lays the modern stage
  // (`scape`: 体育场, 球场, 古籍部 …) and keeps the 古's strip off; Ling tells it as 沈芒's (guide `tell`).
  const line = sideLine(content, scene);
  return {
    id: scene.id,
    // …and its games (`games`, the scene's own boards): the only boards its stage holds (stage.mjs).
    ...(line ? { line, ...(scene.scape ? { scape: scene.scape } : {}), ...(scene.offers?.tasks?.length ? { games: scene.offers.tasks } : {}) } : {}),
    place: say(scene.place),
    setup: say(scene.setup),
    cast: (scene.cast ?? []).filter(id => id !== companionOf(content)?.id || hasCompanion(state)).map(id => ({ id, name: nameOf(content, id, lang) })),
    show: withMap(content, scene.show ?? []),
    lines: spoken(content, state, scene.lines),
    ...(people.length ? { people } : {}),
    ...(panel ? { panel } : {}),
    ...(meet.length ? { meet } : {}),
    // 看 — what may be looked at here; a finding only once found (rules/examine.mjs).
    ...(looks.length ? { look: looks } : {}),
    ...(hint ? { look_hint: hint } : {}),
    buttons: buttons.map(id => ({ id, label: say(scene.exits.find(e => e.id === id).label) })),
    exits: scene.exits.map(e => exitBrief(content, state, e, buttons.includes(e.id), ctxNow, scene)),
  };
}

/* The fight as the scene draws it: the creature at the player's own realm —
   its numbers, its lean and the turns it takes — the player's roots and
   arms, and today's fight if one is open or done. */
/* Why this fight is fought — the most specific reason that holds: a 传闻's
   finale, an errand that asks for the beast, a road beast, its haunt; a
   spine scene's duel is fought for its chapter (redesign-v2 § 五). */
const STAKE = {
  tale: { zh: (t) => `传闻 · ${t} · 终局`, en: (t) => `Rumor · ${t} · Finale` },
  errand: { zh: (t) => `差事 · ${t}`, en: (t) => `Errand · ${t}` },
  road: { zh: (p) => `路上 · ${p}`, en: (p) => `On the road · ${p}` },
  // Only the place: the fight's header already says 降妖 (2026-09-25).
  haunt: { zh: (p) => p, en: (p) => p },
};
const staked = (kind, lang, what) => (what ? (STAKE[kind][lang] ?? STAKE[kind].zh)(what) : null);

/* Today's rumor ends on this beast: its finale link, else null. */
function taleFinaleOf(state, creature) {
  const t = liveTale(state), link = t?.chain?.[t.n];
  return link?.end && link.game === 'duel' && link.creature === creature ? { tale: t, link } : null;
}

function stakeOf(content, state, game) {
  const lang = state.lang;
  // A scene's fight is fought for the story: its 回 (卷一 · 沉鼎 · 第N回, the book's number, rules/hui.mjs).
  if (!game.id.startsWith('haunt:')) return chapterLabel(content, state, content.chapters?.[state.chapter], lang);
  const finale = taleFinaleOf(state, game.creature);
  if (finale) return staked('tale', lang, finale.tale.title);
  const errand = errandFor(content, state, game.creature);
  if (errand) return staked('errand', lang, pick(errand.title, lang));
  const place = placeOf(content, state.place);
  return staked(place?.has?.creature === game.creature || game.hunt ? 'haunt' : 'road', lang, pick(place?.name, lang));
}

/* What the beast says: its own lines from its heritage (creatures.json
   `says`), or — a rumor's finale — the lines Ling wrote with the tale. The
   stage shows them; Ling does not say them again. `won` is the player's win. */
function saysOf(content, state, game) {
  const lang = state.lang, own = creatureOf(content, game.creature)?.says ?? {};
  const boss = game.id.startsWith('haunt:') ? taleFinaleOf(state, game.creature)?.link.boss ?? {} : {};
  const line = k => boss[k] ?? pick(own[k], lang) ?? null;
  const says = { foe: line('open'), won: line('won'), lost: line('lost') };
  return Object.values(says).some(Boolean) ? says : null;
}

function duelBrief(content, state, game, now, { door = false } = {}) {
  const creature = creatureOf(content, game.creature);
  // A pool's fight is kept by the place (world.mjs huntKey): only one open now is today's; a settled one drew the next beast.
  const lang = state.lang, today = state.duels?.[game.hunt ? `hunt:${game.hunt}` : game.creature];
  // A trial fight (`retry`) lost or run dry is simply open again.
  const open = today?.day === dayKey(now) && !(game.retry && ['lost', 'withdrew'].includes(today.outcome)) && (!game.hunt || today.outcome === 'open') ? today : null;
  return {
    id: game.id,
    creature: {
      id: creature.id, name: pick(creature.name, lang),
      ...(lang === 'zh' && creature.pinyin ? { pinyin: creature.pinyin } : {}),
      root: creature.root, root_name: pick(content.traits.elements[creature.root], lang),
      lean: creature.lean, art: creature.art ?? null, about: pick(creature.about, lang),
      ...(creature.elite ? { elite: true } : {}),
      // A fight that is no 降妖 names itself (冰夷's dragons: 冰夷之试).
      ...(creature.title ? { title: pick(creature.title, lang) } : {}),
      // A 试 says how it is passed (creatures.json `trial.goal`), on the card at the door.
      ...(creature.trial?.goal ? { goal: pick(creature.trial.goal, lang) } : {}),
      // A person met in a bout (the 大比's three), not a beast: the page titles it 比试.
      // Its gender, when people.json says, for the words said of the foe (他/她, battle-card.js boutWords).
      ...(creature.person ? { person: true, ...(personOf(content, state, creature.person)?.gender ? { gender: personOf(content, state, creature.person).gender } : {}) } : {}),
    },
    // Everything the fight is given at the door, and nothing else.
    setup: fightSetup(content, state, creature, now, game.id, game.deal),
    today: open ? { outcome: open.outcome } : null,
    stake: stakeOf(content, state, game),
    // The lines only at the door, where the page opens the fight — Look stays lean.
    ...(door ? { says: saysOf(content, state, game) } : {}),
  };
}

/* The names a value exit offers this player: `draw` of its pool, seeded by
   when the save began — a reload shows the same ones, another player others,
   and none is ever the default (his, 2026-09-28: 不要默认给青玄). */
function drawnOffers(state, exit) {
  const pool = [...(exit.value.offers ?? [])], rand = prng(hashOf(`${state.created ?? ''}|${exit.id}|offers`));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, exit.value.draw ?? pool.length);
}

function exitBrief(content, state, exit, button, ctxNow = new Date(), scene = sceneOf(content, state)) {
  const brief = { id: exit.id, means: exit.means, button };
  if (exit.needs) brief.needs = exit.needs;
  if (exit.breakthrough) brief.breakthrough = breakthroughOf(content, state, ctxNow);
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
      brief.withdrawn = !game.retry && today?.day === dayKey(ctxNow) && today.outcome === 'lost';
      brief.duel = duelBrief(content, state, game, ctxNow);
    }
  }
  if (exit.value) brief.value = { field: exit.value.field, max_chars: exit.value.max_chars, label: fill(pick(exit.label, state.lang), state), ...(exit.value.gender ? { gender: true } : {}), offers: drawnOffers(state, exit).map(o => ({ label: pick(o, state.lang), value: o.zh })) };
  // 生辰 → 灵根: asked on the page's card; a save that holds its roots keeps them.
  if (exit.born) brief.born = { label: fill(pick(exit.label, state.lang), state), kept: Boolean(state.traits?.length) };
  return brief;
}


function tasksBrief(content, state, ctx) {
  const lang = state.lang;
  // The boards before him: the story's (a scene offers them), and a game an
  // errand in the book asks for — reopened, or hosted here. None is a daily
  // chore (redesign-v2 § 四). A task done once on an earlier day is history,
  // not today's (his "what is this task for today?", 2026-09-16).
  const today = dayKey(ctx.now);
  // A board an errand wants stands offered, whatever it was: the errand pays.
  const hosted = Object.fromEntries((placeOf(content, state.place)?.has?.games ?? [])
    .filter(id => hostedHere(content, state, id) || stallHere(content, state, id, ctx.now)).map(id => [id, { status: 'offered' }]));
  // The board a beast here is caught with (狰's 守夜), until it is caught.
  const cid = placeOf(content, state.place)?.has?.creature, katch = cid ? creatureOf(content, cid)?.catch : null;
  if (katch && catchHere(content, state, katch)) hosted[katch] = { status: 'offered' };
  const again = new Set([...(content.tasks?.tasks ?? []).map(t => t.id).filter(id => reopened(content, state, id, ctx.now)), ...Object.keys(hosted)]);
  const held = Object.fromEntries([...again].map(id => [id, { status: 'offered' }]));
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
  // Today's 人间功课 only — the fixed ones and the day's pick — and a 开府
  // milestone done but unpaid; the rest of every app's menu never reaches
  // Ling (chores.mjs). 开府 rides as one compact line.
  // Before a story gate: no chores, no 开府, and a board pays no 修为 (state.mjs lockedOf).
  const shut = lockedOf(content, state);
  const menu = ctx.quests ?? [];
  const chores = shut.includes('chores') ? [] : todayChores(state, menu, ctx.now), ready = shut.includes('kaifu') ? [] : kaifuReady(state, menu, ctx.now);
  const quests = [...chores, ...ready].map(q => ({
    id: q.id, app: q.app, title: pick(q.title, lang), device: q.device ?? null,
    done: questDone(q, ctx.now), paid: state.chores[q.id]?.period === periodKey(q.period, ctx.now),
    done_at: questDone(q, ctx.now) ? q.done_at : null, // when its app saw it done — the scene says so
    period: q.period, reward: q.reward ?? null, stamina: q.stamina ?? null, // what it pays, so Ling can tell the practice
  }));
  const kaifu = shut.includes('kaifu') ? null : kaifuBrief(state, menu, ctx.now, lang);
  if (shut.includes('cultivation')) for (const t of tasks) t.pays = null;
  return { tasks, quests, ...(kaifu ? { kaifu } : {}) };
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
    name: rootName(content, state, lang),
    ...(state.traits.length === 5 && mainRoot(state) ? { main: mainRoot(state) } : {}),
    speed: speedOf(content, state),
  };
  const brief = {
    ok: true, lang, name: state.name, gender: genderOf(state), seed: seedOf(state), ...(state.lang_set ? { lang_set: true } : {}),
    // What the story has marked (a choice it will remember), and the beasts whose first sight has played.
    ...(state.marks?.length ? { marks: state.marks } : {}),
    ...(state.appeared?.length ? { appeared: state.appeared } : {}),
    // 恩仇簿: every debt the story has written down, good and bad.
    ...(state.ledger?.length ? { ledger: ledgerOf(content, state, ctx.now) } : {}),
    // The day's 功课 from the scroll in the bag (《吐纳经》, rules/scrolls.mjs).
    ...(practiceHint(content, state) ? { practice_hint: practiceHint(content, state) } : {}),
    world: worldBrief(content, lang),
    ...building(content),
    tier: { id: state.tier, step: state.step + 1, name: stepName(content, state.tier, state.step, lang), phase: phaseName(content, state.tier, state.step, lang) },
    progress: state.progress, next: threshold(content, state), wealth: state.wealth,
    // Filled to the 回's cap (rules/cap.mjs): the full bar and the world's line under it — a wait, not a fault.
    ...(capLook(content, state, lang) ? { capped: capLook(content, state, lang) } : {}),
    traits,
    bag: Object.entries(state.bag).map(([id, n]) => ({ id, name: itemName(itemOf(content, id), state, lang) ?? id, n })),
    // Things the player named (小铜炉 · 饭桶): the 图鉴 card's title reads it.
    ...namedOf(content, state, lang),
    wear: state.wear ?? {},
    arts: artsBrief(content, state),
    treasure: treasureBrief(content, state),
    // At 结丹 with none bound: what a binding would take, held now.
    ...(state.treasure || !canRefine(content, state) ? {} : { can_refine: true, refine_with: refineWith(content, state) }),
    // A fight open on the scene: while this is here Ling advances nothing.
    ...(state.fight ? { fight: { open: true, game: state.fight.game, creature: pick(creatureOf(content, state.fight.creature)?.name, state.lang) } } : {}),
    cast: state.cast.map(id => ({ id, name: pick(creatureOf(content, id).name, lang) })),
    // The chapter (its intro while just begun), the ending once reached (story.mjs).
    ...chapterLook(content, state),
    // A key beat running: the map is shut until its last scene (world.mjs beatOf).
    ...(beatOf(content, state) ? { lock: { beat: beatOf(content, state).id, title: pick(beatOf(content, state).title, lang) } } : {}),
    scene: atScene(content, state) ? sceneBrief(content, state, ctx.now) : null,
    // The book's passages owed to the stage's dialogue box: the page draws them (`tell`, rules/tell.mjs).
    ...(owesTell(content, state) ? { tell_owed: true } : {}),
    // 所见 — what was looked at, the newest scenes, and what was passed by (rules/examine.mjs).
    ...(state.looked?.length ? { seen: seenLog(content, state, SEEN_KEEP) } : {}),
    waypoint: waypointOf(content, state, ctx),
    place: placeBrief(content, state, ctx.now),
    director: directorBrief(content, state, ctx),
    companion: hasCompanion(state) ? { id: companionOf(content).id, name: nameOf(content, companionOf(content).id, lang), joined: state.companion.joined, ...(state.companion.asleep ? { asleep: true } : {}), ...(herAway(content, state) ? { away: herAway(content, state) } : {}), recalled: recalledOf(content, state), card: herCard(content, state) } : null,
    // 银月的记忆 (rules/memories.mjs): the ones unlocked, and what Ling may say of them — never one still locked.
    ...(memoriesLook(content, state) ? { memories: memoriesLook(content, state) } : {}),
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
    // 今日传闻 (tale.mjs): the step open now and its people; `story_due` when nothing story-like happened for a while.
    ...taleLook(content, state, ctx),
    ended: state.ended, story: state.story,
    // 前情提要 while owed, and the last story node while fresh (story.mjs).
    ...recapLook(content, state), ...nodeLook(state, ctx.now),
    divination: divinationBrief(content, state, ctx.now),
    fate: fateBrief(content, state),
    stamina: staminaBrief(content, state, ctx.now),
    // 闭关 running: the hours in and what 出关 would grow now (rules/seclusion.mjs).
    ...(state.seclusion ? { seclusion: seclusionBrief(content, state, ctx.now) } : {}),
    made: { at: state.made?.at ?? null, scenes: Object.keys(state.made?.scenes ?? {}) },
    words: wordsOf(content, lang),
    // 节日 · 节气 (rules/festival.mjs): the player's real day, reckoned on the device.
    today: todayBrief(content, state, ctx, { day: ctx.day }),
    // 天气 (rules/weather.mjs): the engine's weather sense at the player's city, else 蒙山's seasons.
    weather: weatherBrief(state, ctx),
    ...tasksBrief(content, state, ctx),
  };
  // Before a story gate Look carries nothing it keeps shut, and `locked` names it (rules/locks.mjs).
  const kept = withoutLocked(content, state, brief);
  return { ...onStage(content, state, ctx, {}, kept), ...kept };
}

/* 传闻 as Look carries it: the tale, the people met in finished ones, and a nudge. */
function taleLook(content, state, ctx) {
  const tale = taleBrief(content, state, ctx.now), known = knownBrief(content, state), due = storyDue(content, state, ctx);
  return { tale, ...(known.length ? { known } : {}), ...(due ? { story_due: true, story_why: due.why } : {}) };
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
  const naming = cards.some(c => c.card === 'value') ? THEN_VALUE : cards.some(c => c.card === 'born') ? THEN_BORN : '';
  // Only a cauldron ready to throw; shut after a failure, the card only waits.
  const throwing = cards.some(c => c.card === 'breakthrough' && view.scene?.exits?.find(e => e.id === c.id)?.breakthrough?.ready) ? THEN_THROW : '';
  return { then: thenFor(result, ask) + naming + throwing, ask, stage: cards };
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

export { duelBrief, forSale, shopOf, shopOpen, ledgerOf, nameOf, onStage, sceneBrief, shelfOf, shownHere, spoken, stageAt, tasksBrief, withMap, wordsOf };
