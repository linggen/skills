// stage.mjs — what stands on the stage, and what it owns.
//
// ONE TRUTH, TWO READERS, like the fight (battle.js). The page draws this
// list; the rules read the same list to keep the chat's question off anything
// the stage already offers. Before this there were four places that wrote the
// card list and nobody could answer "why is this card on screen?" — which is
// where every card bug of 2026-09-18 lived (a 起一卦 beside 摇一摇铃, a 坊市
// naming another town, a challenge card that killed the whole stage).
//
// His law, 2026-09-18: 「用户可以在 chat 或者 webUI 中交互，因此一个 widget 可
// 以出现在 chat 或者 webUI，但要通知到双方，确保只显示一个。」 So the stage's
// list and the chat's question are decided TOGETHER, from one reading of Look.
//
// Pure: no DOM, no fetch, no clock. Everything comes from the rules' Look.

/* The line running under his feet: a step of the search he can take on this
   very spot. While one is up, the stage carries it and nothing the page would
   add on its own, and the chat holds its tongue — his 「在一个故事线或任务中
   走，显示相关内容」. */
export function lineHere(look) {
  const q = look?.quest;
  if (!q) return null;
  if (q.step === 'riddle') return { id: 'quest', step: 'riddle' };
  if (q.step === 'bell' && q.shop_here) return { id: 'quest', step: 'bell' };
  if (q.step === 'ring' && q.at_water) return { id: 'quest', step: 'ring' };
  return null;
}

/* What met on the road stands on the stage as the one road card — once it is
   revealed; veiled, the page's mist plays over the stage as it is (lingjing.js). */
const ON_ROAD = { chance: m => !m.missed && !m.taken, find: () => true, trial: m => Boolean(m.options) };
export const onRoad = m => Boolean(m && !m.veiled && ON_ROAD[m.kind]?.(m));

/* 传闻's step, when it is to be played on this very spot. */
export function taleHere(look) {
  const t = look?.tale;
  return t?.step?.at?.here && !t.ended && !t.dropped ? t.step : null;
}

/* 银月 walks with him and is awake — and not away on another line (a 今
   interlude, companion.mjs herAway): the coins are hers to throw. */
export const herAwake = look => Boolean(look?.companion?.joined && !look.companion.asleep && !look.companion.away);

/* The line of the book the scene is told on, when it is not the book's own
   (Look's `scene.line`: a 今 interlude — 沈芒's world, no 灵气, no 银月,
   DESIGN § 四·六). Read off the scene, never an id. */
export const sideLineOf = look => look?.scene?.line ?? null;

/* The page's own furniture, by the line it belongs to (Hanli, 2026-10-05:
   今线插曲期间藏起古线的界面). `every` stands on any line: the 回 and the
   place, the box and the scene's game, the language, the 九鼎录 and the
   book. The rest is the 古's — the world of 灵气 — and stands only while the
   scene is on the book's own line; back on it, all of it returns. */
export const FURNITURE = {
  every: ['lang', 'lu', 'read'],
  main: ['name', 'realm', 'pool', 'wealth', 'omen', 'festival', 'weather', 'roads', 'errands', 'bag', 'tray'],
};
export const stands = (look, part) => !sideLineOf(look) || FURNITURE.every.includes(part);
/* On a side line the stage holds the scene alone: its picture, its people,
   the cards that name a value, the game it offers (`scene.games`) and the
   ending card — never the 古's goal, coins, errands, road or beasts. */
const SIDE_CARDS = new Set(['meet', 'panel', 'people', 'value', 'born', 'closed']);
const onSide = look => c => SIDE_CARDS.has(c.card) || (c.card === 'board' && (look.scene?.games ?? []).includes(c.id));

/* EVERY card kind says whether it HOLDS the stage: whether it is asking the
   player to do something, here, now. While any card holds, the chat keeps its
   question to itself and the roads stand on the stage under the cards; the
   moment nothing holds, the question comes. One at a time, and the tap on the
   first is what brings the second (his, 2026-09-21).

   Why a table: until that day this lived in the rules as `stageWaiting`, a
   hand-written list of "what the stage holds out" — a THIRD description of
   the stage beside the two in this file. Nobody updated it: the offer card
   shipped the evening the law was written and was not on it; nor was 拾遗.
   Each fix patched one case, and the next card reopened it ("we fixed it
   several times, still exists"). A kind with no entry here fails the tests,
   so a new card cannot be added without deciding. */
export const CARD_KINDS = {
  fight: { holds: true }, //       the fight IS the stage
  // 银月's memory, blooming from ink into colour (memory.js): the page's own, while it plays — the chat is quiet.
  memory: { holds: true },
  // 鼎归 · 地图晕开 (inkmap.js): a 鼎 come home spreading its province in ink — the page's own, after her memory.
  homing: { holds: true },
  // 息壤's five doors opening (doors.js): the page's own moment, until he taps on.
  doors: { holds: true },
  seclusion: { holds: true }, //   闭关 running: 出关 is the one way on (rules/seclusion.mjs)
  seclude: { holds: false }, //    闭关's choices, offered on an empty pool or a tap on 体力 — never an ask
  offer: { holds: true }, //       接下 — the errands held out where he stands, one card
  // A scene's value exit (the 名字): named on its card. It asks, but a scene's question is the rules'
  // own (ask.mjs keeps it off the chat), and holding would only raise the 或往 roads row under it —
  // a way to walk off in the middle of taking a name.
  value: { holds: false },
  // The 生辰 at the 入门仪式 (rules/roots.mjs): given on its card, private, or left to the stone.
  // Like the name: the scene's own question, never the chat's.
  born: { holds: false },
  // Who the scene brings on (people.json): a portrait and a name each — told, never asking.
  people: { holds: false },
  // The scene card: its place, caption and choices, in words (his, 2026-09-29: 「不用小人书的方式了」 —
  // no picture). The scene's own question — like the name, never the chat's; the choices it
  // carries are owned here (stageOwns), so the chat asks nothing twice.
  panel: { holds: false },
  // 图鉴 (codex.js): who or what this scene brings on for the first time, its card before the
  // scene card — told, never asking. `codex` is the same card when Ling Shows an entry.
  meet: { holds: false },
  codex: { holds: false },
  // 渡劫's odds (rules/breakthrough.mjs): the throw is taken on this card, never
  // the chat's. It holds, so the roads stand under it — a way off to prepare
  // (a pill, a 闭关) before the throw.
  breakthrough: { holds: true },
  road: { holds: true }, //        路上 — what this arrival met: mist until told, then 收下 a find or the
  //                               day's 机缘, or the ways of a 抉择, until it is answered
  item: { holds: true }, //        a shelf to buy from
  quest: { holds: look => Boolean(lineHere(look)) }, // the search's step, only when it can be taken on this spot
  // 传闻's step where he stands: its board, its riddle, its 论道. A fight finale's own duel card holds instead.
  tale: { holds: look => Boolean(taleHere(look)) && look.tale.step.game !== 'duel' },
  // A beast that can still be met today. Won, withdrawn or tamed, its card is a record, not an ask.
  duel: { holds: (look, card) => { const e = look?.place?.encounter; return !e || e.game?.id !== card.id || !(e.won || e.withdrawn || e.tamed); } },
  hexagram: { holds: false }, //   the day's coins: optional, never what an arrival is about
  // A chapter over, the next one waiting: its ending card (story.mjs closeOf) — told, never asking.
  closed: { holds: false },
  lundao: { holds: false }, //     论道 at 稷下: offered, or a game under way — never holds the roads
  handed: { holds: false }, //     所得 — told, never waiting on him; the roads stay
  board: { holds: false }, //      a standing practice, offered for days — not this arrival's business
  goal: { holds: false }, building: { holds: false }, empty: { holds: false },
  creature: { holds: false }, map: { holds: false }, traits: { holds: false },
  gate: { holds: false }, tribulation: { holds: false }, treasure: { holds: false },
};

/* Does anything on the stage hold it? Decided from the list that is drawn —
   never from a second reading of the place. */
export function stageHolds(look, cards) {
  return (cards ?? []).some((c) => {
    const holds = CARD_KINDS[c.card]?.holds;
    return typeof holds === 'function' ? holds(look, c) : Boolean(holds);
  });
}

/* A board whose task is done for the day (the tray's 已完成) never stands on
   the stage — not even one Ling showed (his, 2026-09-24: 「炼丹卡住了，不让点」).
   An errand or a 传闻 step that reopens it is another board: `for_errand`
   (offered again), or the rumor's own `tale:` board. A board named by its
   game (lianliankan) is its task's. */
const taskOfBoard = (look, id) => (look?.tasks ?? []).find(t => t.id === id) ?? (look?.tasks ?? []).find(t => t.kind === 'board' && t.game === id);
export const boardDoneToday = (look, id) => {
  const t = taskOfBoard(look, id);
  return Boolean(t && t.status === 'done' && !t.for_errand);
};
const boardOf = (look, c) => (c.card === 'board' && taskOfBoard(look, c.id) ? { ...c, id: taskOfBoard(look, c.id).id } : c);

/* A beast here beaten (on any day), not yet won over, that likes something:
   its card offers 收服 (the rules refuse Tame before — `not-beaten`). */
export const winnable = e => Boolean(e && e.beaten && !e.tamed && e.likes);

/* The stage, in order, as one list. `focus` is what Ling last showed (the save
   holds it, so a reload puts the same cards back); `fight` is a 斗法 the page
   is playing out. The page draws `building`, `empty` and `quest` itself; every
   other kind is cards.js's. */
export function stageCards(look, { focus = [], fight = false } = {}) {
  if (!look) return [];
  // A fight takes the whole column: she is in it as a card, and the cards need
  // the room (design.md § 斗法在主界面里).
  if (fight) return [{ card: 'fight' }];
  // 闭关 running: its 出关 card is the whole stage — the world holds still
  // until it is settled (his, 2026-09-24: the first thing on opening).
  if (look.seclusion) return [{ card: 'seclusion' }];
  const head = [];
  if (look.building?.paint?.length) head.push({ card: 'building' });
  if (look.stamina?.empty) head.push({ card: 'empty' });
  if (look.quest) head.push({ card: 'quest' });
  // 传闻: the step before him — one card, in the queue near the search's.
  if (taleHere(look)) head.push({ card: 'tale' });
  // Where the story waits — one slim line, no buttons. It was a whole card
  // with the book under it until 2026-09-21, and three tall cards crowded the
  // stage (his: 「current UI is crowded」); the card and the book now open from
  // a chip on the top bar, and this line keeps the 09-18 promise that the goal
  // is never out of sight.
  if (look.waypoint) head.push({ card: 'goal' });
  // 差事 offered where he stands: ONE card, a row each (his, 2026-09-22 — two
  // tall errand cards and a shelf crowded 彭城; WoW's list of what an NPC has).
  if (look.offers?.length) head.push({ card: 'offer' });
  // 所得: an errand met handed itself in (his pick, 2026-09-23) — what it paid
  // and the next step, already in hand, until he walks on.
  if (look.handed?.length) head.unshift({ card: 'handed' });

  // A scene's exit that takes a value (the 名字) is named on its own card:
  // offered names to tap or the player's own, never a chat option and never
  // Ling's to fill (his, 2026-09-28). Driven by the exit, not by the scene.
  for (const e of look.scene?.exits ?? []) if (e.value) head.push({ card: 'value', id: e.id });
  // The 生辰 card, while the roots are still to be read (a save that holds
  // them walks on without it — the exit is the scene's plain button then).
  for (const e of look.scene?.exits ?? []) if (e.born && !e.born.kept) head.push({ card: 'born', id: e.id });
  // A cauldron ready to take — or shut a while after a failed throw — shows
  // its odds and what feeds them, and the throw is its button (Hanli,
  // 2026-09-28: 渡劫 is a 红检). Driven by the exit's `breakthrough.odds`.
  for (const e of look.scene?.exits ?? []) if (e.breakthrough?.odds) head.push({ card: 'breakthrough', id: e.id });

  // 路上 (rules/road.mjs): what this arrival met is ONE card until it is
  // answered — mist while veiled, then a find or the day's 机缘 to 收下, or a
  // 抉择's ways. A traveller's riddle is the chat's question; a road beast is
  // the duel card below.
  if (onRoad(look.place?.meet)) head.push({ card: 'road' });

  const line = lineHere(look);
  // Ling's own cards stand whatever else is true — she chose them. With none,
  // the day's coins fill the stage, unless a line is waiting on this spot.
  // An errand offered here is what the stage is about: the place's creature
  // card gives way to it, and comes back once it is taken (his, 2026-09-21).
  // A card the head already draws (the goal line, the quest…) is never drawn
  // twice when Ling Shows it too (2026-09-25: 眼下要做的 stood twice).
  // …and a kind the page draws for itself (the panel, the people, the goal…)
  // is never Ling's to stand up: she Showed [panel, people] on 2026-09-29 and
  // the 小人书 panel stood twice (PAGE_OWNS, below).
  const inHead = c => head.some(h => h.card === c.card && (h.id ?? null) === (c.id ?? null));
  const kept = focus.filter(showable).map(c => boardOf(look, c)).filter(c => !inHead(c) && !(c.card === 'board' && boardDoneToday(look, c.id)));
  const shown = look.offers?.length ? kept.filter(c => c.card !== 'creature') : kept;
  // The day's coins fill an empty stage; a 遇 standing here is not empty.
  const naming = head.some(c => c.card === 'value' || c.card === 'born' || c.card === 'breakthrough');
  // A picture-book beat is not an empty stage either.
  // Before a story gate the coins are not his yet (Look's `locked`, rules/locks.mjs);
  // nor while 银月 sleeps in the token — the card asks her to throw them (his, 2026-09-29).
  const coins = !(look.locked ?? []).includes('divine') && herAwake(look);
  const cards = shown.length ? [...shown] : line || naming || look.scene?.panel || look.offers?.length || look.place?.meet || !coins ? [] : [{ card: 'hexagram' }];
  const has = (kind, id) => cards.some(c => c.card === kind && (id === undefined || c.id === id));

  if (!line) {
    // An open board is always before the player: Ling tells them it is, so it
    // must be.
    // 论道: the scholar is here (offered), or a game is under way today.
    const word = (look.tasks ?? []).find(t => t.kind === 'word' && t.status !== 'done');
    if ((word || (look.lundao && look.lundao.outcome === 'open')) && !has('lundao')) cards.push({ card: 'lundao' });
    // Every board open here: the story's, an errand's, and the games this place hosts.
    for (const board of (look.tasks ?? []).filter(t => t.kind === 'board' && t.status !== 'done' && !t.won)) {
      if (!has('board', board.id)) cards.push({ card: 'board', id: board.id });
    }
    // A fight the scene offers, and a creature at its haunt with no scene
    // running: both are on the stage, like a board.
    for (const e of look.scene?.exits ?? []) {
      if (e.game?.kind === 'duel' && !has('duel', e.game.id)) cards.push({ card: 'duel', id: e.game.id });
    }
    const haunt = look.place?.encounter;
    // A beast caught, not fought (狰): its 出手 is offered only until the catch — then it is 收服's.
    if (haunt && !haunt.tamed && !(haunt.catch && haunt.beaten) && !has('duel', haunt.game.id)) cards.push({ card: 'duel', id: haunt.game.id });
    // 先降后收: beaten, it may be won over — on its own card (cards.js creature).
    if (winnable(haunt) && !has('creature', haunt.creature.id)) cards.push({ card: 'creature', id: haunt.creature.id });
  }
  // The people of the scene stand first: whoever is speaking is seen.
  const people = look.scene?.people?.length && !line ? [{ card: 'people' }] : [];
  // The scene card stands first (the story is the chat's), and before it the 图鉴 card of
  // whoever or whatever the scene brings on for the first time.
  const meet = (look.scene?.meet ?? []).map(id => ({ card: 'meet', id }));
  const panel = look.scene?.panel ? [{ card: 'panel' }] : [];
  // The chapter's ending card, while the next chapter waits: first on the stage until he puts it away (合上, the page's).
  const closed = look.chapter?.close ? [{ card: 'closed' }] : [];
  const all = [...meet, ...panel, ...people, ...head, ...cards, ...closed];
  return sideLineOf(look) ? all.filter(onSide(look)) : all;
}

/* The kinds the PAGE draws for itself, from Look alone: the scene's panel and
   people, the goal line, the name and 生辰 cards (the scene's exits), a world
   being painted, an empty pool. Never Ling's to Show — the `show` verb drops
   them (rules/verbs.mjs) and the stage drops them from what she showed. */
export const PAGE_OWNS = new Set(['meet', 'panel', 'people', 'goal', 'value', 'born', 'building', 'empty', 'memory', 'homing', 'doors', 'closed']);
export const showable = c => Boolean(c) && !PAGE_OWNS.has(c.card);

/* 此地 · 此刻 · 行 — the stage in FIXED SECTIONS (Hanli, 2026-09-29: the same
   小人书 panel was drawn twice, because the stage was one list). The layout
   stays put; only what fills each slot changes.

   HEADER (此地) is the page's own: the place line, the people, the goal.
   MAIN (此刻) holds EXACTLY ONE thing, the first of these ranks with anything
   in it — replaced, never stacked. Everything else in MAIN's ranks waits in the
   queue, and the footer counts it (还有 N 件 ›). A `together` rank is one thing
   (the panel and the scene's own choice card under it); a `filler` rank stands
   only when nothing else does (the day's coins).
   FOOTER (行): the roads (only while something holds — the chat is quiet
   then), the count of what waits; the page adds the ask bar and the chips.

   Every kind in CARD_KINDS lives in exactly one slot (tests/stage.test.mjs). */
export const HEADER = ['people', 'goal'];
export const MAIN = [
  { kinds: ['memory'] }, //                                              银月's memory, while it plays
  { kinds: ['homing'] }, //                                              then the 鼎's province in ink (鼎归)
  { kinds: ['doors'] }, //                                               then 息壤's five doors, one by one
  { kinds: ['closed'] }, //                                              a chapter's ending card, until he puts it away
  { kinds: ['fight', 'seclusion', 'seclude'] }, //                      the fight, 闭关
  { kinds: ['meet', 'panel', 'value', 'born', 'breakthrough'], together: true }, // the scene waiting on a choice, its new faces first
  { kinds: ['board', 'duel', 'lundao'] }, //                             a game to play here
  { kinds: ['handed', 'quest', 'tale', 'road', 'offer'] }, //            the line, one at a time
  { kinds: ['building', 'empty'] }, //                                   the page's own notices
  { kinds: ['codex', 'creature', 'item', 'map', 'traits', 'gate', 'tribulation', 'treasure'] }, // what Ling showed
  { kinds: ['hexagram'], filler: true }, //                              the day's coins
];

/* A card's queue key — what 还有 N 件 › puts off to the end of the line. */
export const slotKey = c => `${c.card}:${c.id ?? ''}`;

/* A game the scene card waits on — a fight that is one of its exits (the
   大比's rounds), or the board an exit needs (the 秘境's 洛书): it stands under
   the scene card, in the same thing, never behind 还有 1 件 › with the scene
   card left without a choice (live, 2026-09-29: 马小宝's round showed its
   caption and no way to fight). */
export function sceneGame(look, c) {
  if (!look?.scene?.panel || (c.card !== 'duel' && c.card !== 'board')) return false;
  return (look.scene.exits ?? []).some(e => (c.card === 'duel' ? e.game?.kind === 'duel' && e.game.id === c.id : e.needs?.task === c.id));
}

/* The things one rank puts in MAIN, in its kinds' order: one each, or the
   whole rank as one. The scene's own games go with the scene's rank. */
function thingsOf(rank, r, cards, look) {
  const at = c => (rank.kinds.includes(c.card) ? rank.kinds.indexOf(c.card) : rank.kinds.length);
  const mine = cards.filter(c => (rank.together ? rank.kinds.includes(c.card) || sceneGame(look, c) : rank.kinds.includes(c.card) && !sceneGame(look, c)))
    .map((c, i) => ({ c, i })).sort((a, b) => at(a.c) - at(b.c) || a.i - b.i).map(x => x.c);
  if (!mine.length) return [];
  const group = rank.together ? [mine] : mine.map(c => [c]);
  return group.map((g, i) => ({ cards: g, key: slotKey(g[0]), rank: r, i, filler: Boolean(rank.filler) }));
}

/* The stage's list, cut into its slots. `skip` holds the keys he put off with
   还有 N 件 ›, oldest first: they go to the end of the line in that order. */
export function stageSlots(look, cards = [], { skip = [] } = {}) {
  const header = HEADER.flatMap(k => cards.filter(c => c.card === k));
  const things = MAIN.flatMap((rank, r) => thingsOf(rank, r, cards, look));
  const real = things.filter(t => !t.filler);
  const order = t => { const put = skip.indexOf(t.key); return put < 0 ? t.rank * 1000 + t.i : 1e6 + put; };
  const [now = null, ...queue] = (real.length ? real : things).sort((a, b) => order(a) - order(b));
  const roads = stageHolds(look, cards) && !look?.seclusion && !look?.director?.corridor;
  return { header, main: now?.cards ?? [], key: now?.key ?? null, queue: queue.map(t => ({ key: t.key, cards: t.cards })), footer: { roads, waiting: queue.length } };
}

/* What those cards already offer, as option keys the question is measured
   against. One clickable place for one thing (his law, 2026-09-17): an action
   on a card is never also an option in the chat, whichever side it came from.

   The keys match an `ask` option's own fields: `divine`, `ring`,
   `tale`, `move:<place>`, `exit:<id>`, `tame:<creature>` — and only
   those: a key no option can carry owns nothing (the `quest:` and `duel:`
   keys went, review 2026-09-24 — the question never offers 接下 or 出手). */
export function stageOwns(look, cards) {
  const owns = new Set();
  for (const c of cards ?? []) {
    if (c.card === 'hexagram' && !look?.divination) owns.add('divine'); // the coins, waiting
    if (c.card === 'quest') {
      const line = lineHere(look);
      if (line?.step === 'ring') owns.add('ring');
      if (line?.step === 'riddle') owns.add('ring'); // her riddle is answered on the card
    }
    // A duel card carries 出手 only; the creature's own card, once it is
    // beaten, carries the winning over (先降后收).
    if (c.card === 'duel') owns.add(`exit:${c.id}`);
    if (c.card === 'creature' && winnable(look?.place?.encounter) && look.place.encounter.creature.id === c.id) owns.add(`tame:${c.id}`);
    if (c.card === 'board') owns.add(`exit:${c.id}`);
    if (c.card === 'breakthrough') owns.add(`exit:${c.id}`); // the throw is the card's
    // A panel's choices are tapped under the picture.
    if (c.card === 'panel') for (const t of look?.scene?.panel?.taps ?? []) owns.add(`exit:${t.id}`);
    // The map draws every place as a chip that walks there, so the roads are
    // already clickable and the question does not repeat them.
    if (c.card === 'map') for (const p of look?.place?.places ?? []) if (!p.here) owns.add(`move:${p.id}`);
  }
  return owns;
}

/* An `ask` with everything the stage already offers taken out. Null when what
   is left is not a question worth asking — the chat says nothing and the stage
   has it all. */
export function askMinusStage(ask, owns) {
  if (!ask) return null;
  const key = o => (o.divine ? 'divine' : o.ring && !o.answer ? 'ring' : o.tale ? 'tale'
    : o.move ? `move:${o.move}` : o.exit && !o.answer ? `exit:${o.exit}` : o.tame ? `tame:${o.tame}` : null);
  const options = ask.options.filter(o => { const k = key(o); return !k || !owns.has(k); });
  // A question needs two ways out of it; fewer than that and the stage is the
  // only place worth looking.
  return options.length >= 2 ? { ...ask, options } : null;
}

/* Where 银月's body on the stage loads from: the engine's pet view. The
   engine's `engineUiUrl` (/shared/api.js) routes it through the relay's
   connect page when the page is served over linggen.dev — the bare origin
   would load the site's home page there. A /shared/api.js too old to export
   it gets the engine's own origin, as before. */

/// Her voice-only stage: the engine's pet view with `stage=1&body=0` — through
/// the engine's own engineUiUrl when /shared/api.js has it (a relayed page).
export function petStageUrl(api, origin) {
  const q = 'pet=1&stage=1&body=0';
  return typeof api?.engineUiUrl === 'function' ? api.engineUiUrl(q) : `${origin}/?${q}`;
}
