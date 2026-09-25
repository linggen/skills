# 斗法 — fights, taming, the 本命法宝

<!-- Lingjing guide `fight` — handed to Ling with the result when the game gets here, or read with Guide. Moved out of SKILL.md 2026-09-25 (his: 没出现的内容，不用一直带着). -->

## Fights — 降妖

A fight is a **card game played on the scene**. **You never take a turn,
play a card or start a fight.** A duel exit, a creature at its haunt, a road
beast sits on the stage as its card; when the player wants to fight, say so
in a line and let the scene take it.

**The beast speaks on the stage** — its line as the fight opens, its last
word in the seal, and the fight's reason under the title. Never say them
again; tell the fight around them.

**While a fight is open you advance NOTHING.** Look carries `fight` exactly
as long as one runs; the rules refuse world-changing tools `in-a-fight`. You
may talk — name the beast, tell its heritage, answer what a word means.

When it ends the page says so:
- `[scene] won <id>` — **Look**, then Resolve the exit if it has one (at a
  haunt there is none). Look carries `bout` once: tell the finish from
  `bout.last` — the blow that landed, how close it was (`close`) — never a
  number. What it left (`bout.dropped`: what it carried, sometimes a 符, one
  new card) the stage shows as spoils: say it as a find, in a line — never
  Show it again. No `bout.last` (an old save): one plain line, nothing invented.
- `[scene] lost <id>` — it withdraws until tomorrow; nothing else is lost.
  Say it plainly from `bout`; no line for Yinyue.
- `[scene] withdrew <id>` — the beast ran out of cards: neither won nor
  lost, nothing paid; not a victory.

Asked how fights work, tell it in the world, never as formulas — the fight's
own card shows the hand, the numbers and the beast's intent. What the rules
hold: 气血 on both sides; 灵力 grows a crystal a round; a hand of 灵兽 and 功法;
五行 (金克木 · 木克土 · 土克水 · 水克火 · 火克金); 主灵根一击 once a round;
**杀招** at half its 气血 (name the move as the world's); **望气术** (a scroll,
服用 from 装备) reads the beast's intent — asked how to know, say once where it
is sold. **Only cards obtained** go in the deck — the roots' starter, Yinyue,
tamed beasts, a card from each win, and the 功法 of a root lent by a worn
sword or the treasure. **Gear counts**: a worn weapon strengthens
主灵根一击 (the 本命法宝 grows with its 重; only the bigger of the two
counts), a 法衣 gives 护体, a 佩 softens its element, and a 符 in the bag comes
into the hand, spent when played. Learned arts are not in fights. The day's
问卦 lifts or lowers its element's 功法, and at 吉 reads the beast's next move.

- **精英** (`elite` on the creature brief) is a beast with a harder deck —
  nothing else. **One fight a day with the same creature**; beaten today is
  `subdued-today`.

**At a haunt** (Look's `place.encounter` — its fight and what it `likes`):
降妖 is the duel card (出手 only); once beaten, the creature's own card offers
收服 · 喂它X / 献上X — it tames on a tap, and you hear nothing. **驯** asked in words — *喂它灵芝*, *驯服它*, *收了它*,
*献给它* — is **Tame**, never Trade `use` (which only puts a thing on Yinyue).
Food is fed, a thing offered (`likes.fed`) — never say a beast eats a bell.
**先降后收**: before it is beaten (`encounter.beaten`) Tame refuses
`not-beaten` — say it must be beaten first. A thing Yinyue wears can still be
offered. A tamed beast joins the `cast`, counts as 降 for errands, and fights
no more there.

**本命法宝** (past 结丹): the weapon and a 天材地宝 become the player's own
treasure, **named by the player**. The treasure card binds it: they pick the
material and type the name there. Asked in words, **Refine** — ask the name,
never name it. It grows with the story alone — one 重 each time a chapter
ends and each time a rumor's finale is won (`treasure_grew` on that result) —
nine 重 at most, never lost. Card `{card: "treasure"}`; Look's
`treasure`, `can_refine` with `refine_with` (the weapon in hand and the
materials held).

## The tools

**Tame** — At a creature's haunt (Look's `place.encounter`), feed it the thing it likes from the bag — `encounter.likes` — and it walks with the player from then on, once. The creature's card feeds it by itself on a tap; yours is the taming the player asks for in words (喂它灵芝, 收了它). The bag pays one; the result carries the `beat`, what was `paid` and its card to `show`. Refusals: `not-beaten` (its line), `needs-item` (its line names what it wants), `already-tamed`, `untameable`, `not-here`.

**Refine** — 炼化本命 — once, past the Core (结丹): the weapon in hand and one 天材地宝 from the bag become the player's own 本命法宝, and **the player names it**, as they named their 道号. The treasure card binds it by itself — the player picks the material and types the name there. Yours is the binding asked for in words: ask for the name in your own words first; never name it for them. Both the weapon and the material are spent, and a treasure is never lost. The result carries the `treasure` and its card to `show`. Refusals: `needs-tier` (its line), `no-weapon` (its line), `needs-material` (with `materials` — what the five are and how many are held), `not-in-bag`, `needs-name`, `already-bound` (its line names the one they have).
