---
type: product-spec
reader: coding agent, contributors
guide: |
  What Lingjing is and what each of its systems does, in one read.
  How it is built belongs in design.md. The idea's first record is
  linggen-app/doc/app-ideas.md.
status: Settled 2026-09-11; built through online (the prologue, the Mac scene, quests, the cloud save and 灵气 meter) as of 2026-09-14 — see design.md.
---

# Lingjing: The World of Linggen · 《灵境》

**A text game: you play it by chatting, and the world is the background.**

Ling runs a cultivation world drawn from China's public heritage; Yinyue is at
the player's side. You talk, take Ling's tasks, and grow. Real-life tasks, done in the other
Linggen apps, count as 修炼. On the phone the chat is the whole game; on the
Mac a scene beside the chat shows the same cards.

- **Genre:** AI chat game, 13+.
- **Languages:** English and Chinese at launch.
- **Session:** a few minutes, a few times a day, paced by 灵气.

## Story

**The main story is 《九鼎》.** 大禹 cast nine cauldrons, one per province,
bearing every spirit of that land. They vanished at the fall of 周. Since then
the 灵脉 have thinned. The player cultivates through real life, and that lets
them sense the cauldrons.

- **Opening:** a rain night on the 泗水 bank. A silver light in the water. The
  player reaches in and Yinyue wakes.
- **Nine chapters,** one per cauldron and province (冀 兖 青 徐 扬 荆 豫 梁 雍).
  Recovering a cauldron is the chapter's climax.
- **The main story is hand-written;** the model voices it and never changes its
  plot. Every player shares it.
- **Chapters are serialized (连载).** A chapter opens for everyone on a date,
  and it ships as data, not an app update. While the game is being built
  and tested no chapter is locked (2026-09-16); the dates are set at launch.
- **Branch stories are AI-written per player:** province tales, 聊斋-style
  night tales, festival scenes on the real calendar, 奇遇, and the player's
  own week told as story.

## World

- **Style: 修仙 · 凡人流.** The mortal with poor roots who climbs by
  diligence; nine realms, 灵根, 灵石, 丹药, 宗门, 秘境 — the 道教 and genre
  inheritance older than any novel. No name from any novel, ever.
- **Worlds.** 《九鼎》 is the first world and the shape of every other; a
  player starts inside a whole world, never builds first. A 山海经 world
  comes next; 三国, 易经, 黄帝内经 later — same rules, same Ling.
- **Open.** A province is places and roads, not a corridor. Wander; the
  rules turn you back from what is too hard, kindly, and Ling keeps the
  thread of the story in view.
- **Sources:** China's public heritage only — 道教 cultivation terms,
  山海经, 佛教 parables, 周易, the dynasties. Never a novel's named
  characters, places or plot.
- **Map:** the nine provinces, each drawn from its 山海经 chapter.
- **灵兽:** the 山海经 bestiary, met in the story and collected, each with its
  ancient text and a picture. A creature is never named without its picture.
- **Calendar:** events follow the real 24 节气 and festivals. Each morning
  brings one 周易 hexagram as the day's omen.
- **洞府:** the player's home base, which grows with them.

## Worlds

**One game, many worlds.** The way you play — talk to Ling, take tasks,
climb, fight, trade, keep 灵气 — is the same in every world. What changes is
the story and the words.

- **《九鼎》 is the built-in world** — 修仙 · 凡人流, the Nine Provinces, the
  山海经 bestiary. Everyone starts here, whole, with nothing to build.
- **Ask for another and Ling builds it while you wait** — *a 山海经 hunt*, *a
  三国 council*, *a 易经 reading* — a title, a map, a cast, the first scene,
  in under a minute; the rest is written as you play. Nothing to fill in;
  change anything by saying so.
- **Each world has its own words for the same things.** Where 《九鼎》 says
  修为, 灵石, 灵气, 境界, a 三国 world says 声望, 粮草, 精力, 官阶. Ling, the
  cards and every line use the world's words and no others.
- **Fights are never numbers.** In every world a contest resolves by its
  rule — 五行, 兵种, a board — never by hit points.
- **Never a novel's names.** A world in the *style* of the tales you love,
  never their characters, places or plot.
- Real-life practice counts in every world alike.

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
- Yinyue's 3D model is the only 3D in the game; on the Mac she stands in the
  scene. Everything else is 2D.

## Chat

- **The chat carries the game.** Messages come from Ling (the world), Yinyue
  (the player's side) and NPCs, each attributed.
- **One set of cards, two placements:** task cards, creature cards, the map,
  puzzle boards. On the phone they arrive inside the chat. On the Mac they sit
  on the scene — the space left of the chat, with Yinyue standing in the
  current place.
- **Choices are asked in the chat** on both screens.
- **Free text anytime, in the player's language.** Buttons are shortcuts;
  typing is always allowed.

**Free chat.** The model proposes, the rules decide: Ling replies in words and
changes the game only through game tools — resolve a scene, give a task, open
a branch, move the player. The rules check every call and refuse what the
state does not allow.

- **Free text resolves scenes.** Ling maps the player's words to one of the
  scene's exits — feeding 夫诸 an herb tames it, if the herb is in hand. A
  creative answer the model judges right counts.
- **A question changes nothing.** Ling answers from the heritage and the
  player's state.
- **Curiosity can open a branch (奇遇).** A branch never touches the main
  story; its rewards come from a small capped table.
- **Out of bounds is refused in the world** — *冀州的路还没开*,
  *天地灵石，从不白给*. Words never change state.
- **Real life goes to Yinyue, outside the game,** never on game 灵气.
- **A scene of your own.** Ask for one — a ferry tale, a 山海经 hunt, a
  三国 council — and Ling builds it from a template while you wait, the
  rules check it, and you play it like any scene. You never build; you ask.
- **Every reply ends with a way forward** — usually choices.
- **A running story summary** keeps free chat consistent across days.
- **The rules own every number, the model owns the words.** Points, realms,
  灵气, inventory and world state are data; the model narrates around them.

## A day

Most days fall between chapters. An ordinary day is: the omen; a due
real-life quest paid on sight; one 奇遇 grown from an authored seed — a line
from the province's 山海经, its creature pictured; a board to practise on.
A few minutes. The spine moves on the days a chapter opens; seeds and
quests carry every other day.

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
  Rewards scale with the realm — a task in 化神 pays more 修为 than the same
  task in 练气 — so the later, larger realms take weeks too, not years.

## 灵根

**灵根 is the player's 五行 roots — 金 木 水 火 土, alone or mixed. It sets how
fast 修为 grows.**

- **Fewer roots, faster cultivation:** one root (天灵根) is fastest; the more
  roots are mixed, the slower 修为 builds from the same task.
- **v1: every player has the same 灵根 — four roots, 木 水 火 土** (a 伪灵根).
  Everyone starts slow and climbs by diligence.
- Ling reveals it at the 测灵根 scene near the start.

## 灵气 system

**灵气 is the game's stamina** — a number of its own, like every game's 体力,
not tokens and not turns.

- **丹田 holds 100** and refills by the clock, full in five hours.
- **A pace, not a price.** It keeps the game from taking too much of a day
  and sends the player back to the world.
- **Actions cost it:** a story step, a 奇遇, a 降妖 bout, a 坊市 visit.
  Talking, asking, practising on a board, buying and selling are free — but
  nothing advances without it.
- **Real life refills it:** a kept workout, a full night, a Shifu scan.
- **Shown as the 丹田:** full, half, low, empty. Never a number.
- **When it runs out,** one line in the story says so and when it returns.
  The story waits.
- **Sign in to play:** Linggen's free tier, then the $5 Linggen plan — the
  game is included. Progress is saved to the account, so it follows the
  player to any device.

## Mini-games

**Every mini-game is an action in the world, played inside the chat.**

| Game | In the world |
|---|---|
| 连连看 | 炼丹 |
| 七巧板 | 布阵 |
| 华容道 | escaping a 秘境 |
| 洛书九宫 | breaking a cauldron's seal |
| 五行相克 (best of three) | 降妖 — fighting a creature |
| 象棋 · 五子棋 | 斗法 — cultivator against cultivator |
| 飞花令 · 对对联 · 灯谜 · 成语接龙 | 论道 with a scholar spirit |

- The puzzles and boards are run by rules, with no model and no 灵气.
- **降妖:** every creature has a 五行 root; the player picks from their own
  roots each round, 相克 wins. A loss costs nothing, but the creature
  withdraws until tomorrow — one try a day. A win pays once: 修为, 灵石, a
  thing, sometimes the creature itself. No fighting numbers, ever.
- Word games are judged by the model, with a separate set per language: in
  English, a riddle, a word chain, a line containing the keyword.

## Social

- **宗门:** family and friends, by invite only.
- **同修:** two friends keep a task together and both earn a bonus.
- **论道:** async quiz duels.
- **切磋:** async board games and same-board 连连看 races.
- **传音:** messages carried by Yinyue.
- **v1 is async.** Then the table: friends play live in a room one player
  hosts, Ling as host — riddles, 飞花令, side stories, 斗法; one team, two
  teams or each alone.

## Economy

- **灵石** are earned in play and buy things from a catalog: 丹药, 武器,
  装备, 法器, 宝物, 钥匙, 材料 — each with a picture and a price. Things also
  come as task rewards, and sell back for 灵石.
- **A thing does one of three things:** opens a way (a key the story needs),
  pays 修为 when used (a pill), or changes how Yinyue or the 洞府 looks. Never
  a fighting number — the game has no combat, so no stats, no durability.
- **Money buys the Linggen plan,** never power.
- **The rules run on the player's machine until players meet.** A cheat
  fakes only their own game. Trade between players, a ranking or the table
  moves the rules to the cloud first.

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
- Uses hit points, or any number that fights.

## Open questions

- 灵根 after v1: whether players differ, and how.
- Playable without any Linggen app (real life as a bonus), or Linggen users
  only.
- Surfaces: Mac app page first; the phone's place.
- Point values and realm thresholds.
- How Yinyue's memories end.
