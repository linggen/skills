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
  find: { holds: true }, //        收下 — something by the road
  trial: { holds: true }, //       抉择 — the ways Ling wrote, until one is taken
  veil: { holds: true }, //        a 遇 not yet revealed: mist, until Ling has set the moment
  item: { holds: true }, //        a shelf to buy from
  quest: { holds: look => Boolean(lineHere(look)) }, // the search's step, only when it can be taken on this spot
  // A beast that can still be met today. Won, withdrawn or tamed, its card is a record, not an ask.
  duel: { holds: (look, card) => { const e = look?.place?.encounter; return !e || e.game?.id !== card.id || !(e.won || e.withdrawn || e.tamed); } },
  hexagram: { holds: false }, //   the day's coins: optional, never what an arrival is about
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
  // Where the story waits — one slim line, no buttons. It was a whole card
  // with the book under it until 2026-09-21, and three tall cards crowded the
  // stage (his: 「current UI is crowded」); the card and the book now open from
  // a chip on the top bar, and this line keeps the 09-18 promise that the goal
  // is never out of sight.
  if (look.waypoint) head.push({ card: 'goal' });
  // 差事 offered where he stands: ONE card, a row each (his, 2026-09-22 — two
  // tall errand cards and a shelf crowded 彭城; WoW's list of what an NPC has).
  if (look.offers?.length) head.push({ card: 'offer' });

  // 遇: something found on the road is on the stage until it is taken or left
  // (a traveller's riddle is the chat's question; a road beast is a duel card).
  if (look.place?.meet?.veiled) head.push({ card: 'veil' });
  else if (look.place?.meet?.kind === 'find') head.push({ card: 'find' });
  else if (look.place?.meet?.kind === 'trial' && look.place.meet.options) head.push({ card: 'trial' });

  const line = lineHere(look);
  // Ling's own cards stand whatever else is true — she chose them. With none,
  // the day's coins fill the stage, unless a line is waiting on this spot.
  // An errand offered here is what the stage is about: the place's creature
  // card gives way to it, and comes back once it is taken (his, 2026-09-21).
  const shown = look.offers?.length ? focus.filter(c => c.card !== 'creature') : focus;
  // The day's coins fill an empty stage; a 遇 standing here is not empty.
  const cards = shown.length ? [...shown] : line || look.offers?.length || look.place?.meet ? [] : [{ card: 'hexagram' }];
  const has = (kind, id) => cards.some(c => c.card === kind && (id === undefined || c.id === id));

  if (!line) {
    // An open board is always before the player: Ling tells them it is, so it
    // must be.
    const board = (look.tasks ?? []).find(t => t.kind === 'board' && t.status !== 'done' && !t.won);
    if (board && !has('board', board.id)) cards.push({ card: 'board', id: board.id });
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

   The keys match an `ask` option's own fields: `divine`, `ring`, `write`,
   `linger`, `move:<place>`, `exit:<id>`, `tame:<creature>`. */
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
      owns.add(`duel:${c.id}`);
      const beast = look?.place?.encounter?.game?.id === c.id ? look.place.encounter : null;
      if (beast?.creature?.id) owns.add(`tame:${beast.creature.id}`);
    }
    if (c.card === 'board') owns.add(`exit:${c.id}`);
    // 接下 is on its own card, and so is 交差 — never in the question too.
    if (c.card === 'offer') for (const o of look?.offers ?? []) owns.add(`quest:${o.id}`);
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
  const key = o => (o.divine ? 'divine' : o.ring && !o.answer ? 'ring' : o.write ? 'write' : o.linger ? 'linger'
    : o.move ? `move:${o.move}` : o.exit && !o.answer ? `exit:${o.exit}` : o.tame ? `tame:${o.tame}` : null);
  const options = ask.options.filter(o => { const k = key(o); return !k || !owns.has(k); });
  // A question needs two ways out of it; fewer than that and the stage is the
  // only place worth looking.
  return options.length >= 2 ? { ...ask, options } : null;
}
