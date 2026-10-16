# The player steers — restart, saves, worlds

<!-- Lingjing guide `steer` — handed to Ling with the result when the game gets here, or read with Guide. Moved out of SKILL.md 2026-09-25 (his: 没出现的内容，不用一直带着). -->

## The player steers

Carried out in the world's words — never a tool, a file or an id:

- **Begin again** (重来 / restart): Look {said: their words} — its `ask` is
  the one question, *从头再来？此番修行尽数散去。* / *Begin again? Everything of
  this journey is let go.* — 从头再来 · 再想想 (*Begin again* · *Not yet*).
  AskUser exactly it. Yes → **Restart**, then say nothing more this turn: the page opens a fresh chat for the new game and asks you for its opening there (anything said now lands in the old chat and is cleared from view); 再想想 →
  Look {said: 再想想}, nothing changes. Unasked, Restart is refused
  `not-confirmed`; the question holds ten minutes.
- **To a scene** ("back to the river"): **Go** with the scene id from Look's
  chapter; its first call is refused `not-confirmed` with the `ask`
  (*直接去河伯祠？路上的事就此略过。* — 去 · 再想想) — AskUser it, call again only
  on 去; then play it as just entered. Not yet open: say when. Going back into an
  ended chapter pays nothing again.
- **The map** (看地图): `Show {card: map}`; nothing moves.
- **Another world**: **Worlds**, then **Travel**; their own through **Build**.
- **Saves**: **Saves** lists them — read them in words (*昨日 · 邺城*; a named
  one by its title). **Save** on their word with a title in their words.
  **Load** and **Forget**: the first call is refused `not-confirmed` with
  the `ask` (*回到9月24日的邺城？*) — AskUser exactly it, and call again only
  on its first option. After a Load, as after a Restart, say nothing more:
  the fresh chat asks for the scene.
- **Take it back** (悔棋): Look {said: their words} carries the one question
  (*悔棋：收回上一步？*); on 收回, **Undo**, then Look.
- **Stuck** (卡住了, 过不去, 玩不了, 没反应; 怎么办 about the game, not the story):
  Look {said: their words} carries the one question when the rules find
  something to mend (*这一关先放下，往下走？不得好处，也不失什么。* — 就这么办 ·
  再想想); else call **Unstick**, whose first call asks the same way. AskUser
  exactly it; call Unstick again only on its first option. Back: `fixed` —
  say in one line, in the world, what changed (*这一关先放下了*, *你回到了外门*),
  never a board, a bug or a tool; `fixed: []` with nothing asked: nothing is
  broken — give the nearest concrete thing from Look. It never pays and never
  skips a scene; 悔棋 takes it back.

Never restart, go, load, undo or forget unasked — the rules hold it too. A refusal (`not-open`,
`unknown-save`, `not-named`) is told in the world.

## The tools

**Restart** — Begin this world again from its first scene — name, realm, bag and story all gone; the other worlds' saves untouched. Only after the player has said so and answered one AskUser confirming it. Answers with the fresh Look.

**Go** — Straight to a scene by id, when the player asks for it — any scene of a chapter that has opened (Look's chapter and scene ids, e.g. 01-cauldron), or one of the player's made scenes. The road is not walked. Refuses `not-open` (with when) and `unknown-scene` (with the scenes there are).

**Unstick** — Run the game's health check on the save and mend only what is safe: a story board he cannot win ends with no grade and no reward (the stage's 「算了，往下走」), a fight left open, against a beast he has tamed, or not offered here is closed (nobody won, nothing paid), he is put at the place his scene is played at, a passage never told is owed again. Answers `fixed` (each `kind` and what it names) and `left` (what it cannot mend — the builder's). Nothing to mend: it changes nothing.

**Undo** — Take back the last change of the game — a move, an exit, a load, a restart — on the player's word, after one AskUser confirming it. Answers with what was undone; Look after it.

**Saves** — The games the player keeps, newest first: `day` saves the rules keep by themselves (each day's closing state, two weeks back), `named` ones the player asked for, and `world` saves parked by Travel. Each with its world, chapter, `where` and `at`. "Continue from yesterday" is the `day` save of that date.

**Save** — Keep the game as it stands under a title in the player's words, on the player's word.

**Load** — Take up a kept save by id from Saves: it becomes the game in play (a save of another world parks this one first). Only after one AskUser confirming it. Answers with its Look and `loaded`.

**Forget** — Let a named save go, after one AskUser confirming it. Day and world saves are the rules' own and stay.

**Worlds** — Every world there is — the built-in ones and the player's — with which one this save plays and which have a save waiting.

**Travel** — Go to another world by id. This save is kept where it stands; the other world's is taken up where it stood, or begun. Answers with the new world's Look.
