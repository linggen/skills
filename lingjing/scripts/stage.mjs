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

/* Whether the app may show its companion's body (the desktop corner's 3D
   girl) while this page is open: never. Hanli, 2026-10-14: 「游戏里不需要3D模型」
   (earlier the same day: not before 银月 is found). In the game she is the
   silver fox of the story and her voice-only stage; the girl never stands. */
export const companionShown = () => false;

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
  every: ['lang', 'books'],
  // `her`: 银月's 木牌 in the footer (2026-10-14) — she is the 古's; 今线 keeps only the 书 chip (九鼎录 · 读原著).
  main: ['name', 'realm', 'pool', 'wealth', 'omen', 'her', 'festival', 'weather', 'roads', 'errands', 'bag', 'tray'],
};
/* The footer's chips, in their order (Hanli, 2026-10-15: 「top bar and bottom bar both have too
   much widgets」): 银月's 木牌 · the festival · the sky (an icon and degrees) · 书 (九鼎录 and 读原著
   in one popover) · 事 · 物品. The roads and what waits are the footer's other row (footRowHtml).
   Each is a part of FURNITURE, so a 今 interlude keeps only what stands on every line. */
export const FOOTER = ['her', 'festival', 'weather', 'books', 'errands', 'bag'];
export const stands = (look, part) => !sideLineOf(look) || FURNITURE.every.includes(part);
/* On a side line the stage holds the scene alone: its picture, its people,
   the cards that name a value, the game it offers (`scene.games`) and the
   ending card — never the 古's goal, coins, errands, road or beasts. */
const SIDE_CARDS = new Set(['meet', 'panel', 'people', 'value', 'born', 'closed', 'replay']);
const replayBoard = (look, id) => (look.tasks ?? []).some(t => t.id === id && t.replay && t.status !== 'done');
// …and a board left on the line and chosen again (再试一回 — the rules offer only the line's own, rules/skips.mjs).
const onSide = look => c => SIDE_CARDS.has(c.card) || (c.card === 'board' && ((look.scene?.games ?? []).includes(c.id) || replayBoard(look, c.id)));

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
  // 地图展开 (2026-10-14): a chapter's map, walkable for the first time, unfolding — the page's own moment.
  unfold: { holds: true },
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
  // AI mini-games (rules/aigames.mjs): 二十问 with her, 讨价还价 at a keeper's shelf, 断案 where a case is — never hold the roads.
  twenty: { holds: false }, haggle: { holds: false }, case: { holds: false },
  duizi: { holds: false }, //     对对子 at the teacher's (rules/duizi.mjs): offered, or a round under way
  handed: { holds: false }, //     所得 — told, never waiting on him; the roads stay
  board: { holds: false }, //      a standing practice, offered for days — not this arrival's business
  // A board left on an earlier day, offered again (rules/skips.mjs): optional — 再试一回 or 改日, never asking.
  replay: { holds: false },
  // 刷副本 (rules/rerun.mjs, Look's `rerun`): at the door with the rooms open, the way in; inside, the rooms and the way out — optional, never holds.
  rerun: { holds: false },
  goal: { holds: false }, building: { holds: false }, empty: { holds: false },
  // 下一步: where the story goes and the one tap toward it, when nothing else stands (withNext).
  next: { holds: false },
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
/* Where the offer to replay a board stands: its own card only where no scene card carries it among its choices. */
export const replayOnCard = look => Boolean(look?.replay && !look.scene?.panel);

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
  // …but while a scene card stands, its errands are among the scene's own choices (cards.js
  // panelActsHtml, 「接下差事：…」): one place to tap, never a card queued behind the way on
  // (Hanli, 2026-10-14 — 外门's 修屋顶 sat behind every scene card, never seen).
  if (look.offers?.length && !look.scene?.panel) head.push({ card: 'offer' });
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
  // A fight Ling Showed stands only while it is up here — a scene's exit, the beast the place deals now, the fight
  // held open: a pool deals another after each fight, and the old beast's card drew nothing (live 2026-10-27, the
  // 后山 after a loss: a blank stage with 「还有：斗法 +1」).
  const fightUp = c => c.card !== 'duel' || look.place?.encounter?.game?.id === c.id || look.fight?.game === c.id || (look.scene?.exits ?? []).some(e => e.game?.id === c.id);
  const kept = focus.filter(showable).map(c => boardOf(look, c)).filter(c => fightUp(c) && !inHead(c) && !(c.card === 'board' && boardDoneToday(look, c.id)));
  const shown = look.offers?.length ? kept.filter(c => c.card !== 'creature') : kept;
  // The day's coins fill an empty stage; a 遇 standing here is not empty.
  const naming = head.some(c => c.card === 'value' || c.card === 'born' || c.card === 'breakthrough');
  // A picture-book beat is not an empty stage either.
  // Before a story gate the coins are not his yet (Look's `locked`, rules/locks.mjs);
  // nor while 银月 sleeps in the token — the card asks her to throw them (his, 2026-09-29).
  const coins = !(look.locked ?? []).includes('divine') && herAwake(look);
  const cards = shown.length ? [...shown] : line || naming || look.scene?.panel || look.offers?.length || look.place?.meet || !coins ? [] : [{ card: 'hexagram' }];
  const has = (kind, id) => cards.some(c => c.card === kind && (id === undefined || c.id === id));
  // 二十问 offered fills an empty stage beside the coins (rules/aigames.mjs): never over a scene's business.
  if (has('hexagram') && look.twenty && !look.twenty.open && !look.twenty.outcome && look.twenty.rounds_left) cards.push({ card: 'twenty' });
  // 本王考考你 (rules/kao.mjs) is as light: offered only on an empty stage — or standing while a round is under way.
  for (const b of (look.tasks ?? []).filter(t => t.light && t.kind === 'board' && t.status !== 'done' && !t.won)) {
    if ((has('hexagram') || b.open) && !has('board', b.id)) cards.push({ card: 'board', id: b.id });
  }

  if (!line) {
    // An open board is always before the player: Ling tells them it is, so it
    // must be.
    // 论道: the scholar is here (offered), or a game is under way today.
    const word = (look.tasks ?? []).find(t => t.kind === 'word' && t.status !== 'done');
    if ((word || (look.lundao && look.lundao.outcome === 'open')) && !has('lundao')) cards.push({ card: 'lundao' });
    // AI mini-games: a haggle or a case where he stands; 二十问 once played today (offered, it fills an empty stage below).
    if (look.haggle && !has('haggle')) cards.push({ card: 'haggle' });
    if (look.case && !has('case')) cards.push({ card: 'case' });
    if (look.duizi && !has('duizi')) cards.push({ card: 'duizi' });
    if (look.twenty && (look.twenty.open || look.twenty.outcome) && !has('twenty')) cards.push({ card: 'twenty' });
    // 刷副本: the door's way in while the rooms are open, and the run's own card inside (rules/rerun.mjs).
    if (look.rerun && (look.rerun.inside || (look.rerun.open && look.rerun.here)) && !has('rerun')) cards.push({ card: 'rerun' });
    // Every board open here: the story's, an errand's, and the games this place hosts.
    // A place's game open only as practice (Look's `practice`) waits in the tray for his 开局 — never dealt by itself.
    for (const board of (look.tasks ?? []).filter(t => t.kind === 'board' && t.status !== 'done' && !t.won && !t.light && !t.practice)) {
      if (!has('board', board.id)) cards.push({ card: 'board', id: board.id });
    }
    // A fight the scene offers, and a creature at its haunt with no scene
    // running: both are on the stage, like a board.
    // …but a scene's fight won, its way on untaken, is done: the scene card carries that way on
    // (「接着 ›」, cards.js panelActsHtml — wonWayOn), never the beaten beast's 出手 again.
    const won = look.scene?.panel ? wonWayOn(look) : null;
    for (const e of look.scene?.exits ?? []) {
      if (e.game?.kind === 'duel' && e.id !== won?.id && !has('duel', e.game.id)) cards.push({ card: 'duel', id: e.game.id });
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
  // A board left on an earlier day, offered again — the rules say when (Look's `replay`: the stage
  // idle, its line, one a day). ONE place draws it (replayOnCard): with a scene card it is one of the
  // scene's choices, after its ways on (cards.js panelActsHtml — in the box or on the card); with none, its
  // own card. Both drew it once (live 2026-10-26: 再试一回 twice over the 兽潮 board).
  const again = replayOnCard(look) && !line ? [{ card: 'replay', id: look.replay.task }] : [];
  const all = [...meet, ...panel, ...people, ...head, ...cards, ...again, ...closed].filter(c => !(c.card === 'board' && boardWaits(look, c.id)));
  const staged = sideLineOf(look) ? all.filter(onSide(look)) : all;
  return withNext(look, staged.filter(c => !duplicate(look, c, staged)));
}

/* Who a fight card pictures: the creature of the scene's own fight (its exit's
   `game.creature`), or of the beast at its haunt. */
export function duelCreature(look, c) {
  if (c?.card !== 'duel') return null;
  const exit = (look?.scene?.exits ?? []).find(e => e.game?.kind === 'duel' && e.game.id === c.id);
  if (exit?.game?.creature) return exit.game.creature;
  const e = look?.place?.encounter;
  return e?.game?.id === c.id ? e.creature?.id ?? null : null;
}

/* One thing to tap (Hanli, 2026-10-14, at 三试: the fight card pictured 蠪侄 and
   「还有 1 件 ›」 queued 蠪侄's own 图鉴 card behind it — which should he tap?). A
   card that only TELLS — a 图鉴 entry, a creature's card — is dropped when another
   card on the stage already pictures the same face; it stays in the 九鼎录's 图鉴.
   A beaten beast's card that carries 收服 is not telling, and stays. */
const TELLS = new Set(['codex', 'creature']);
function duplicate(look, c, cards) {
  if (!TELLS.has(c.card) || !c.id) return false;
  if (c.card === 'creature' && winnable(look?.place?.encounter) && look.place.encounter.creature.id === c.id) return false;
  return cards.some(o => o !== c && duelCreature(look, o) === c.id);
}

/* A scene's boards are played one after another, in `show` order (batch two, 2026-10-14:
   00-halfyear's 吹鹅毛 before 练功): a board waits while one
   before it in the scene's `show` is still open — on the stage and in the tray. */
export function boardWaits(look, id) {
  const order = (look?.scene?.show ?? []).filter(c => c.card === 'board').map(c => c.id);
  const at = order.indexOf(id);
  if (at <= 0) return false;
  const open = bid => (look.tasks ?? []).some(t => t.id === bid && t.status !== 'done');
  return order.slice(0, at).some(open);
}

/* A scene's fight won and its way on not yet taken (2026-10-15: 蠪侄 beaten
   at 00-longzhi, and nothing on the stage moved him on — the Resolve was left
   to Ling, who told the finish and stopped). The way on is mechanical, so it
   is the page's: the exit whose duel the save holds won (Look's exit brief
   `won`), when exactly one waits — that exit, else null. A fight still open
   (`look.fight`) holds it. */
/* A scene's way on that is a card of its own, not a tap the story view can
   hold at its last beat: the name (`value`), the 生辰 (`born`, roots unread),
   a cauldron's throw (`breakthrough`), a fight not called by the scene's
   words. While one waits, the story view never holds its last beat for the
   scene's choices (cards.js panelActsHtml inBox) — it is put away, and the
   card stands (2026-10-15: 00-hall's passage ended on 「…他把手放在测灵石上。」
   with only its 看 list, the 生辰 card hidden behind it). */
export function cardHoldsWay(look) {
  const taps = new Set((look?.scene?.panel?.taps ?? []).map(t => t.id));
  return (look?.scene?.exits ?? []).some(e => e.value || (e.born && !e.born.kept) || e.breakthrough?.odds
    || (e.game?.kind === 'duel' && !e.won && !taps.has(e.id)));
}

export function wonWayOn(look) {
  if (look?.fight) return null;
  const ways = (look?.scene?.exits ?? []).filter(e => e.game?.kind === 'duel' && e.won);
  return ways.length === 1 ? ways[0] : null;
}

/* The kinds the PAGE draws for itself, from Look alone: the scene's panel and
   people, the goal line, the name and 生辰 cards (the scene's exits), a world
   being painted, an empty pool. Never Ling's to Show — the `show` verb drops
   them (rules/verbs.mjs) and the stage drops them from what she showed. */
export const PAGE_OWNS = new Set(['meet', 'panel', 'people', 'goal', 'value', 'born', 'building', 'empty', 'memory', 'homing', 'doors', 'unfold', 'closed', 'next', 'rerun']);

/* Never a blank stage (Hanli, 2026-10-15: 「没有空白webUI的情况……webUI要提示下一步的事情，不要让
   玩家不知道下面该做什么」). When nothing in main is a step or a thing to do — no scene card, no
   game, no errand, no fight, only the coins or nothing at all — the page's own 下一步 card
   stands: the story's goal line and one tap toward it (cards.js next). Not in a fight or 闭关,
   which hold the whole stage. Nor on a side line: 下一步 is the 古's — its road, its errands, the
   货郎 — and the 古 place he left must not leak onto 沈芒's stage (Hanli, 2026-10-15: 「今线没完就
   跳回了古，然后又跳回了今」 — after the 罚球 board, 「去沉鼎秘境 · 石门」 stood a moment in 今 · 二).
   There 下一步 is the 今 scene's own (sideStep): its ways on, never the 古's goal — and with none
   to name, nothing. */
export function withNext(look, cards) {
  if (!look || look.fight || look.seclusion || cards.some(c => c.card === 'next')) return cards;
  if (sideLineOf(look) && !sideStep(look).length) return cards;
  const doing = cards.some(c => sceneGame(look, c) || (!TELLS_ONLY(look, c) && MAIN.some(r => !r.filler && r.kinds.includes(c.card) && r.kinds[0] !== 'next')));
  return doing ? cards : [...cards, { card: 'next' }];
}
/* A side-line scene's own next step: its ways on (the scene card's taps), none turned down. */
export const sideStep = look => (sideLineOf(look) ? (look.scene.panel?.taps ?? []).filter(t => !t.spent) : []);
/* A card that only tells — an entry, a beast already won over, the roots, a gate's or a
   treasure's record — is no thing to do: 下一步 stands before it (the crawler, 2026-10-15: after
   药园's fight the stage held 狰's 已收服 card and nothing said 柴房 was next). A shelf, the map's
   roads and a beast still to win over are things to do. */
const TELLING = new Set(['codex', 'creature', 'traits', 'gate', 'tribulation', 'treasure']);
const TELLS_ONLY = (look, c) => c.card === 'replay' /* optional: 下一步 still stands */ || TELLING.has(c.card) && !(c.card === 'creature' && winnable(look?.place?.encounter) && look.place.encounter.creature.id === c.id);
export const showable = c => Boolean(c) && !PAGE_OWNS.has(c.card);

/* 此地 · 此刻 · 行 — the stage in FIXED SECTIONS (Hanli, 2026-09-29: the same
   小人书 panel was drawn twice, because the stage was one list). The layout
   stays put; only what fills each slot changes.

   HEADER (此地) is the page's own: the place line and the people. The goal
   reads in the 事 book (BOOK; Hanli, 2026-10-15: 「top bar … too much widgets」).
   MAIN (此刻) holds EXACTLY ONE thing, the first of these ranks with anything
   in it — replaced, never stacked. Everything else in MAIN's ranks waits in the
   queue, and the footer counts it (还有 N 件 ›). A `together` rank is one thing
   (the panel and the scene's own choice card under it); a `filler` rank stands
   only when nothing else does (the day's coins).
   FOOTER (行): `roads` — while something holds (the chat is quiet then); the page
   also stands them whenever the chat asks nothing (lingjing.js roadsFree) — the count
   of what waits; the page adds the ask bar and the chips.

   Every kind in CARD_KINDS lives in exactly one slot (tests/stage.test.mjs). */
export const HEADER = ['people'];
/* The goal's slot: the top of the 事 chip's book (cards.js bookPopHtml), never the bar. */
export const BOOK = ['goal'];
export const MAIN = [
  { kinds: ['memory'] }, //                                              银月's memory, while it plays
  { kinds: ['homing'] }, //                                              then the 鼎's province in ink (鼎归)
  { kinds: ['doors'] }, //                                               then 息壤's five doors, one by one
  { kinds: ['unfold'] }, //                                              then a chapter's map unfolding, the first time it can be walked
  { kinds: ['closed'] }, //                                              a chapter's ending card, until he puts it away
  { kinds: ['fight', 'seclusion', 'seclude'] }, //                      the fight, 闭关
  { kinds: ['meet', 'panel', 'value', 'born', 'breakthrough', 'replay'], together: true }, // the scene waiting on a choice, its new faces first; a board left, offered again, under it
  { kinds: ['board', 'duel', 'lundao', 'twenty', 'haggle', 'case', 'duizi', 'rerun'] }, //  a game to play here
  { kinds: ['handed', 'quest', 'tale', 'road', 'offer'] }, //            the line, one at a time
  { kinds: ['building', 'empty'] }, //                                   the page's own notices
  { kinds: ['next'] }, //                                                where the story goes, when nothing else is a thing to do
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
  // …and a board the scene stands itself (`show`), though no way on waits on it: the first of two (吹鹅毛, batch two).
  if (c.card === 'board' && (look.scene.show ?? []).some(s => s.card === 'board' && s.id === c.id)) return true;
  // …and a board left on an earlier day that he chose to try again (再试一回, rules/skips.mjs): it stands
  // with the scene card, so the box steps aside for it — the scene's ways on stay his to take.
  if (c.card === 'board' && replayBoard(look, c.id)) return true;
  // 兽潮's night is not the scene's (Hanli, 2026-10-26: 「Mac上游戏界面需要独占UI」): a board up takes the stage alone
  // (queue.js gameAlone), so a tide standing up by itself beside the scene card would hold the story until it is
  // played. It waits in the tray (开局) and, opened, stands alone; the scene's choices come back after it.
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

/* Is what stands in MAIN the step to take — the way on (Hanli, 2026-10-14: the
   player only ever sees ONE thing to tap)? The scene card and its choices, a game
   an exit needs (sceneGame), a name, a 生辰, 渡劫's throw, a fight, 闭关 and its
   chooser, the page's moments, a 「完」, the road's answer, the line's step on this
   spot — or anything else that holds the stage. While it is, the footer counts
   nothing: what waits behind it stands once that step is taken. */
const STEP_KINDS = new Set(['panel', 'value', 'born', 'breakthrough', 'fight', 'seclusion', 'seclude', 'memory', 'homing', 'doors', 'unfold', 'closed', 'road']);
export const mainIsStep = (look, main = []) => main.some(c => STEP_KINDS.has(c.card) || sceneGame(look, c) || (c.card === 'quest' && Boolean(lineHere(look))));

/* The stage's list, cut into its slots. `skip` holds the keys he put off with
   还有 N 件 ›, oldest first: they go to the end of the line in that order.
   The footer's `next` is the first thing waiting, named only when nothing on
   the stage needs a tap (the page adds one more: the box holding the scene's
   choices itself, at its last beat — lingjing.js footRowHtml). */
export function stageSlots(look, cards = [], { skip = [] } = {}) {
  const header = HEADER.flatMap(k => cards.filter(c => c.card === k));
  // 刷副本's card (the door's way in, the run's rooms and way out) rides under whatever stands — never queued behind a board or a fight.
  const rider = cards.find(c => c.card === 'rerun') ?? null;
  const things = MAIN.flatMap((rank, r) => thingsOf(rank, r, rider ? cards.filter(c => c !== rider) : cards, look));
  const real = things.filter(t => !t.filler);
  const order = t => { const put = skip.indexOf(t.key); return put < 0 ? t.rank * 1000 + t.i : 1e6 + put; };
  const [now = null, ...queue] = (real.length ? real : things).sort((a, b) => order(a) - order(b));
  const roads = stageHolds(look, cards) && !look?.seclusion && !look?.director?.corridor;
  const main = [...(now?.cards ?? []), ...(rider ? [rider] : [])];
  const step = mainIsStep(look, main);
  const waits = queue.map(t => ({ key: t.key, cards: t.cards }));
  return { header, main, key: now?.key ?? null, queue: waits, footer: { roads, step, waiting: step ? 0 : waits.length, next: step ? null : waits[0] ?? null } };
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
