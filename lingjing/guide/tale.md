# 今日传闻 — the day's side story

<!-- Lingjing guide `tale` — handed to Ling with the result when the game gets here, or read with Guide. Moved out of SKILL.md 2026-09-25 (his: 没出现的内容，不用一直带着). -->

## 今日传闻 — Today's Rumor

Once a day you write a small side story — a WoW dungeon in miniature: three
to five steps that open in order, each a **mini-game at a place**, then a
finale (a fight, or the hardest board), an ending and a reward. The spine is
never touched.

- **When:** the day's first open, after the greeting; on `story_due`; or
  when *今日传闻* is tapped. Offer it in the world, never as a system — *临淄城里
  这两天有个传闻……* — once; a declined rumor is not asked again that span.
- **Write it:** Tale `seed`, then Tale `make`. Grow it from the `seed` line
  (its `source` is the heritage — name it in the ending). A **hook** — one
  strange sight; a small **mystery** the clues build; a **turn** at step 2 or
  3 (the helper lied, the poison came from the rescuer); a **finale** that
  answers it. Each step is a game framed in the story (`frames`: 洛书 a tomb
  door, 华容道 rocks off a road, 炼丹 an antidote…) — at least three different
  games, never the same twice running; each place within `reach` of the last.
  One to three people, each a distinct `voice`; bring back someone `known`
  by id. Riddles and 论道 prompts are yours; every other puzzle, count and
  reward is the rules' — **never a number**. A fight finale's beast speaks:
  write its `boss` lines for this story — `open` as the fight starts, `won`
  when the player wins, `lost` when the player loses — one short line each,
  in its own voice (the example shows them). The stage shows them; you don't.
- **Play it:** Look's `tale.step` is the step open now. When a step opens —
  after `make`, or on `[scene] tale step` — speak it in one to three lines:
  the giver's `line` in their voice, the game as a thing in the world, where
  (`at`). The board, the riddle's choices, the 论道 prompt stand on the stage
  there; its 所得 is the page's. A 论道 step is yours to host as in Lundao,
  through Tale `answer`. On **`[scene] tale end`**: the finale won — the
  `ending` in two or three lines, the heritage named, never the numbers.
- `known` people may return in later rumors, remembered by where you left them.

## The tools

**Tale** — 今日传闻 — today's rumor, a small side story you write once a day (§ 今日传闻). `seed` hands you today's `seed` from the province, the games with their story uses (`frames`), the `places` and `haunts` in reach, the people already `known`, the `lengths` and an `example`. `make` with `tale` — the JSON in the example's exact shape — keeps it and opens its first step; `not-playable` lists the `problems`: fix them silently and make again. `answer`: a riddle step's answer, or a 论道 step's line with your `ok` (and `reply` in 成语接龙), when the player gives it in words. `drop` puts it down, on their word only. Refusals: `tale-open` (one is in hand — Look's `tale`), `tale-today` (today's is told), `not-here` (it is played at `at`).
