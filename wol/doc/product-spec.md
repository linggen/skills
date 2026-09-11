---
type: product-spec
reader: coding agent, contributors
guide: |
  What The World of Linggen is and what each of its systems does, in one read.
  How it is built belongs in design.md (not written yet). The idea's first
  record is linggen-app/doc/app-ideas.md.
status: Design only, settled 2026-09-11. Nothing built.
---

# The World of Linggen

**A text game: you play it by chatting, and the world is the background.**

Ling runs a cultivation world drawn from China's public heritage; Yinyue is at
the player's side. You talk, take Ling's tasks, and grow. Real-life tasks, done in the other
Linggen apps, count as 修炼. Every part of the game happens inside one chat
panel, like Ling's today.

- **Genre:** AI chat game, 13+.
- **Languages:** English and Chinese at launch.
- **Session:** a few minutes, a few times a day, paced by 灵气.

## Story

**The main story is 《九鼎》.** 大禹 cast nine cauldrons, one per province,
bearing every spirit of that land. They vanished at the fall of 周. Since then
the 灵脉 have thinned. The player's 灵根 grows from real life, and that lets
them sense the cauldrons.

- **Opening:** a rain night on the 泗水 bank. A silver light in the water. The
  player reaches in and Yinyue wakes.
- **Nine chapters,** one per cauldron and province (冀 兖 青 徐 扬 荆 豫 梁 雍).
  Recovering a cauldron is the chapter's climax.
- **The main story is hand-written;** the model voices it and never changes its
  plot. Every player shares it.
- **Chapters are serialized (连载).** A chapter opens for everyone on a date,
  and it ships as data, not an app update.
- **Branch stories are AI-written per player:** province tales, 聊斋-style
  night tales, festival scenes on the real calendar, 奇遇, and the player's
  own week told as story.

## World

- **Sources:** China's public heritage only — 道教 cultivation terms,
  山海经, 佛教 parables, 周易, the dynasties. Never a novel's named
  characters, places or plot.
- **Map:** the nine provinces, each drawn from its 山海经 chapter.
- **灵兽:** the 山海经 bestiary, met in the story and collected, each with its
  ancient text.
- **Calendar:** events follow the real 24 节气 and festivals. Each morning
  brings one 周易 hexagram as the day's omen.
- **洞府:** the player's home base, which grows with them.

## Characters

- **The player:** takes a 道号 at the start, suggested by Yinyue.
- **Ling — the game driver.** Runs the world and narrates it, gives every task,
  and knows everything in the game: rules, story, map, state. Reads the
  cauldrons' inscriptions.
- **Yinyue — the player's pet and assistant.** Always at their side, helps
  them play. Name only, origin unspoken: she remembers nothing of who she is;
  each cauldron gives back one memory. She is the same Yinyue as in the rest of
  Linggen and remembers the player.
- **Everyone else:** NPCs, spirits and 灵兽, voiced by the model from the
  heritage.
- Yinyue's 3D model is the only 3D in the game; everything else is 2D in chat.

## Chat

- **One chat panel is the whole game.** Messages come from Ling (the world),
  Yinyue (the player's side) and NPCs, each attributed.
- **Cards appear inside the chat:** choices, task cards, creature cards, the
  map, puzzle boards.
- **Free text anytime.** Ask Ling anything about the world and get the answer
  in the player's language.
- **The rules own every number, the model owns the words.** Points, realms,
  灵气, inventory and world state are data; the model narrates around them.

## Task system

**Ling gives tasks; finishing one earns 修为 points.**

- **Real-life tasks** come from the other Linggen apps: scan your disk in Shifu,
  run a backup, keep a workout, sleep a full night.
- **In-world tasks** come from the story: answer a spirit's riddle, 炼丹, reach
  a province.
- **Daily and weekly** tasks.
- **Real tasks count only when the app confirms them.** Never self-reported.
- **Each task pays once per period.** Repeating it earns nothing more.
- **A real task is offered only when it is due.** No busywork.
- **Each app declares the tasks it offers** and their completion signal. The
  game names no app.

## Upgrade system

**修为 points reach a threshold, and the player rises a level.**

- **Nine realms, one per cauldron:** 练气 (Qi Condensation, layers 1–9) · 筑基
  (Foundation Establishment) · 结丹 (Core Formation) · 元婴 (Nascent Soul) ·
  化神 · 炼虚 · 合体 · 大乘 · 渡劫.
- **Levels inside a realm are automatic.** Crossing into a new realm is a 突破:
  a 雷劫 scene in the chat.
- **A realm breakthrough is paired with its cauldron's chapter.** A player who
  reaches the peak before the chapter opens holds there.
- **Pacing:** a realm takes weeks, so the full journey takes about a year.

## 灵气 system

**灵气 is the model's tokens.**

- **Rolling 5-hour window,** like Claude Code or ChatGPT.
- **Separate game budget.** It never draws on the Linggen Cloud quota the
  assistant uses.
- **Metered by cost,** so English and Chinese are charged fairly.
- **Shown as the 丹田:** full, half, low. Tokens are never shown.
- **When it runs out,** Ling says one line in the story. The story waits.
- **Rule-run puzzles cost no 灵气.** They stay playable as practice.
- **Real-life bonus:** a kept workout or a deep night refills a capped amount.
- **Paid plan:** a bigger 丹田 per window. Never power.

## Mini-games

**Every mini-game is an action in the world, played inside the chat.**

| Game | In the world |
|---|---|
| 连连看 | 炼丹 |
| 七巧板 | 布阵 |
| 华容道 | escaping a 秘境 |
| 洛书九宫 | breaking a cauldron's seal |
| 象棋 · 五子棋 | 斗法 |
| 飞花令 · 对对联 · 灯谜 · 成语接龙 | 论道 with a scholar spirit |

- The puzzles and boards are run by rules, with no model and no 灵气.
- Word games are judged by the model, with a separate set per language: in
  English, a riddle, a word chain, a line containing the keyword.

## Social

- **宗门:** family and friends, by invite only.
- **同修:** two friends keep a task together and both earn a bonus.
- **论道:** async quiz duels.
- **切磋:** async board games and same-board 连连看 races.
- **传音:** messages carried by Yinyue.
- **v1 is async.** Real-time play between friends online at once comes later.

## Economy

- **灵石** are earned in play and buy 丹药, 洞府 upgrades, and 法器 cosmetics
  for Yinyue.
- **Money buys a bigger 丹田,** nothing else.

## Never does

- Shows a token count.
- Sells loot boxes.
- Punishes a missed day or a broken streak.
- Pays points for a real task the app did not confirm.
- Sends raw health or finance data into the game. Apps pass the task's done
  or not done.
- Writes into another app.
- Lets strangers chat with players (v1).
- Uses a novel's named characters, places or plot.

## Open questions

- What 灵根 means under the points model. Suggestion: steadiness — its purity
  rises with weeks of kept 修炼 and speeds 修为.
- Playable without any Linggen app (real life as a bonus), or Linggen users
  only.
- Chinese title: 《灵根世界》?
- Surfaces: Mac app page first; the phone's place.
- Point values and realm thresholds.
- How Yinyue's memories end.
