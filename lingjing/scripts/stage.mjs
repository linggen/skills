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
  offer: { holds: true }, //       接下 — the errands held out where he stands, one card
  road: { holds: true }, //        路上 — what this arrival met: mist until told, then 收下 a find or the
  //                               day's 机缘, or the ways of a 抉择, until it is answered
  item: { holds: true }, //        a shelf to buy from
  quest: { holds: look => Boolean(lineHere(look)) }, // the search's step, only when it can be taken on this spot
  // 传闻's step where he stands: its board, its riddle, its 论道. A fight finale's own duel card holds instead.
  tale: { holds: look => Boolean(taleHere(look)) && look.tale.step.game !== 'duel' },
  // A beast that can still be met today. Won, withdrawn or tamed, its card is a record, not an ask.
  duel: { holds: (look, card) => { const e = look?.place?.encounter; return !e || e.game?.id !== card.id || !(e.won || e.withdrawn || e.tamed); } },
  hexagram: { holds: false }, //   the day's coins: optional, never what an arrival is about
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

/* The stage, in order, as one list. `focus` is what Ling last showed (the save
   holds it, so a reload puts the same cards back); `fight` is a 斗法 the page
   is playing out. The page draws `building`, `empty` and `quest` itself; every
   other kind is cards.js's. */
export function stageCards(look, { focus = [], fight = false } = {}) {
  if (!look) return [];
  // A fight takes the whole column: she is in it as a card, and the cards need
  // the room (design.md § 斗法在主界面里).
  if (fight) return [{ card: 'fight' }];
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
  const kept = focus.map(c => boardOf(look, c)).filter(c => !(c.card === 'board' && boardDoneToday(look, c.id)));
  const shown = look.offers?.length ? kept.filter(c => c.card !== 'creature') : kept;
  // The day's coins fill an empty stage; a 遇 standing here is not empty.
  const cards = shown.length ? [...shown] : line || look.offers?.length || look.place?.meet ? [] : [{ card: 'hexagram' }];
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
    if (haunt && !haunt.tamed && !has('duel', haunt.game.id)) cards.push({ card: 'duel', id: haunt.game.id });
  }
  return [...head, ...cards];
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
    // A duel card carries 出手 and, when the creature can be tamed, the feeding.
    if (c.card === 'duel') {
      owns.add(`exit:${c.id}`);
      const beast = look?.place?.encounter?.game?.id === c.id ? look.place.encounter : null;
      if (beast?.creature?.id) owns.add(`tame:${beast.creature.id}`);
    }
    if (c.card === 'board') owns.add(`exit:${c.id}`);
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
