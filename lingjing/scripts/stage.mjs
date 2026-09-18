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
  // Where the story waits, and the road to it. A player who cannot see the
  // goal walks in circles asking for one (2026-09-18: four places, a map, and
  // 「where to go, what should do」) — the rules always knew, nothing said it.
  if (look.waypoint) head.push({ card: 'goal' });

  const line = lineHere(look);
  // Ling's own cards stand whatever else is true — she chose them. With none,
  // the day's coins fill the stage, unless a line is waiting on this spot.
  const cards = focus.length ? [...focus] : line ? [] : [{ card: 'hexagram' }];
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
    // The goal card walks the next road itself, so the question does not
    // offer that same place a second time.
    if (c.card === 'goal' && look?.waypoint?.toward) owns.add(`move:${look.waypoint.toward.id}`);
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
