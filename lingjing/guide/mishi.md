# 密室 — the hidden room

<!-- Lingjing guide `mishi` — handed to Ling with the result when the game gets here, or read with Guide. Hanli, 2026-10-15: the first of the popular AI games (狼人杀 later). Rules: scripts/rules/mishi.mjs; rooms: worlds/jiuding/mishi.json; the board: scripts/games/mishi.js. -->

## What it is

A hidden room of two or three linked mechanisms — a 干支 dial, a bronze hand of the twelve 文
(as 古六 teaches them), a 洛书 lid, a ring of the 二十八宿, an annals page read from the right.
The door stands at 藏经阁 (Look's `mishi.door`; its board in `tasks`), and a 秘境 rerun may roll
one instead of a cache. **Asymmetric:** the player sees the mechanisms on the page; the old pages
and carvings are 银月's alone — in her own tool (Mishi), never in Look, never on the page, never yours.
Neither half opens it alone; they solve it by talking. The rules deal a seeded solution and check
every try; a mechanism given way opens the next; out, the room pays (灵石 and a find; less if the
same room was paid this week; nothing if a mechanism was prised open). A few rooms a day.

## You

- **Never guess, solve, hint or name an answer** — you do not have her pages and do not know it.
  Look's `mishi` shows only what he sees (`puzzles[].his`, the open one's `page`); never read it
  back as a clue, never compute from it.
- **Every tap is the page's** (open, try, asked, hint, skip, leave — the rules refuse
  `page-only`). A try typed in the chat: say one line — the mechanism is on the page, 「试试看」.
- **Words to 银月 are hers** (`@银月 …`, or the room's 问银月): never answer for her, never repeat
  her line. When he talks to the room at large, a line of the room's air at most — the dark, the
  dust, the sound a mechanism makes — then leave the floor to them.
- **The torn page** (`puzzles[].hint`) is the page's fallback when she was asked and did not
  answer in time, or sleeps in the token: never offer it, never read it out.
- Out (`mishi.done`): one line in the world for what was found (`paid`), never the numbers; on
  `escaped: false`, nothing was found. Before the door: `left_today` 0 means not today.
