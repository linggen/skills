---
type: design
reader: coding agent, contributors
guide: |
  How Lingjing is built. What it is and does is product-spec.md; how it looks
  and plays is prototype.html (scripted, no model). This file is the build.
status: 2026-09-11 — content, rules.mjs, SKILL.md, the Mac scene page and the first quests (Shifu's scan, Health's workout) built (build order 1–5); online — the cloud save and the 灵气 heartbeat — designed, next; the table (playing together) designed.
---

# Lingjing — design

## The shape in one diagram

```
 Mac: the app page                              Phone: the chat is everything
 ┌─ scene (scripts/index.html) ─┬─ stock chat ─┐  ┌─ phone chat (Flutter) ─┐
 │ status · Yinyue in the place │ Ling's words │  │ Ling's words           │
 │ focus card: creature, board, │ AskUser      │  │ the same cards, inline │
 │ map … · today's tasks        │ choices      │  │ choices · free text    │
 │ puzzles run here, no model   │ free text    │  │ puzzles, no model      │
 └──────▲───────────────────────┴──────┬───────┘  └───────────┬────────────┘
        │ content_block (Show)         │ messages             │
        │                              ▼                      ▼
 ┌─ session: Ling, skill lingjing ────────────────────────────────────────┐
 │  SKILL.md = the game-master rules                                      │
 │  context = rules + state brief + story + THIS scene only               │
 └──────┬─────────────────────────────────────────────────────────────────┘
        │ shell tools              data tool Show → a card on the scene
        ▼                          (Mac) or inline (phone)
 ┌─ scripts/rules.mjs ───────────────┐
 │  reads  content/  (authored)       │
 │  writes data/     (this player)    │
 │  refuses what the state disallows  │
 └───────────────────────────────────┘
```

Three rules hold the whole build together:

1. **Content is data, never prompt.** Chapters, scenes, creatures, rewards and
   answer keys are files. The model sees one scene at a time.
2. **The model proposes, the rules decide.** Ling changes the game only by
   calling a tool; `rules.mjs` checks every call against the state and the
   content, and its answer is final.
3. **The context holds only the moment.** Rules, a state brief, the story so
   far, the current scene, the last few messages. Never the game.

## Where things live

```
skills/lingjing/
  SKILL.md                 Ling's game-master rules + tool declarations
  scripts/
    index.html, lingjing.css, lingjing.js   the Mac scene (from prototype.html)
    cards.js, board.js     the cards Ling can Show; the alchemy board
    rules.js               the page's door to rules.mjs (/api/bash)
    chat-bridge.js, api.js the shared bridge copies
    rules.mjs              the rules engine, a CLI: node rules.mjs <verb> …
    run-js.sh              runs it under the bundled bun, else node
    content.mjs            loads + validates content/
  content/                 authored; ships with the skill
    realms.json            the ladder: 练气 1–9, 筑基 … with 修为 thresholds
    roots.json             灵根 kinds and their 修为 multiplier
    rewards.json           reward tables and caps (scene, branch, task, day)
    creatures.json         山海经 entries: name{zh,en}, source, quote{zh,en}, province
    herbs.json             alchemy tiles
    hexagrams.json         the day's omen (the eight doubled trigrams so far)
    art/<creature>.webp    one picture per creature, ink style (sketches as .svg)
    riddles/zh.json, en.json   answer keys the rules check
    tasks/world.json       in-world tasks
    branches.json          奇遇 templates and the daily cap
    terms.json             the game's words and provinces, zh + en
    chapters/00-prologue/  chapter.json · beats.md · scenes/*.json
    chapters/01-ji/        …
  data/                    this player; never in the repo — the cloud save mirrors it
    state.json · log.jsonl
  tests/
```

## Content

### A chapter

`chapter.json`:

```json
{ "id": "01-ji", "opens": "2026-10-01", "province": "冀", "gate": 1,
  "first_scene": "01-ji-arrive",
  "title": { "zh": "第一章 · 冀州之鼎", "en": "Chapter 1 · The Cauldron of Ji" },
  "summary": { "zh": "…", "en": "…" } }
```

`beats.md` is the one-page beat sheet the author edits. Scenes are cut from
it; the model never reads the whole sheet.

- **Opening dates are local.** Chapters ship inside the skill through
  Linggen's normal skill update; `rules.mjs` refuses a chapter before its
  `opens`. The skill downloads nothing.
- **A realm gate** holds the player at the peak until the chapter opens: the
  realm in `realms.json` names its chapter (`foundation` has `gate: 1`). The
  prologue has none (`opens: null`, `gate: null`).

### A scene

A scene is a setup and its exits. Each exit has plain words (`means`) — what
Ling matches the player's text against — and the rules that apply.

```json
{ "id": "00-fuzhu", "chapter": "00-prologue",
  "place": { "zh": "泗水北岸 · 雾中", "en": "North of the Si · in the mist" },
  "setup": { "zh": "你沿泗水北行。雾里立着一只白鹿，头生四角。", "en": "…" },
  "cast": ["yinyue", "fuzhu"],
  "show": [{ "card": "creature", "id": "fuzhu" }],
  "lines": [{ "who": "yinyue", "text": { "zh": "是夫诸……", "en": "That's Fuzhu…" } }],
  "buttons": ["duel", "riddle", "around"],
  "exits": [
    { "id": "gift", "means": "gives or feeds it an herb, especially the lingzhi",
      "needs": { "bag": "lingzhi" }, "take": { "bag": "lingzhi" },
      "refuse": { "zh": "你身上没有灵芝。", "en": "You have no lingzhi on you." },
      "grant": { "table": "scene", "xw": 50, "ls": 10, "beast": "fuzhu" },
      "beat": [{ "who": "fuzhu", "text": { "zh": "……我跟你走。", "en": "…I will go with you." } }],
      "next": "00-north" },
    { "id": "around", "label": { "zh": "绕行", "en": "Go around" },
      "means": "avoids it or goes around it", "stay": true } ] }
```

The fields, as `scripts/content.mjs` checks them:

| Field | Means |
|---|---|
| `place`, `setup` | Where it is; what Ling narrates on entry — paraphrased, facts unchanged. `{daohao}` fills in the player's name. |
| `cast` | Who is present: `yinyue`, creature ids. |
| `show` | Cards `Show`n on entry: `creature`, `root`, `map`, `board`, `hexagram`, `gate`, `tribulation`. |
| `lines` | Hand-written spine lines spoken on entry, near verbatim. |
| `offers` | Tasks set here, and whether due quests appear beside them. |
| `buttons` | The exits shown as choices; every other exit is found only by typing. |
| exit `label` | The button's words. Required for a button. |
| exit `means` | Plain words Ling matches the player's text against. |
| exit `needs` / `take` | What must be in hand (`bag`) or done (`task`); what it uses up. A need carries a `refuse` line. |
| exit `grant` | 修为, 灵石, a creature — never over its table's cap. |
| exit `key` | A riddle; the rules check the answer, the model only extracts it. |
| exit `value` | A value the player gives — the 道号 — with offered choices. |
| exit `set` | State the rules set, e.g. `root: v1`. |
| exit `game` | A puzzle or duel whose win the page reports. |
| exit `beat` | Lines spoken when the exit is taken. |
| exit `next` · `stay` · `ends` | Exactly one: the next scene, stay here, or end the chapter. |

The lint also refuses a scene nobody can reach, a chapter with no ending, a
grant over its cap, a string missing a language and a creature without its
picture.

### Branch stories (奇遇)

Not authored scene by scene. A branch is a template:

```json
{ "kind": "province-tale", "max_turns": 6, "table": "branch",
  "may_not": ["spine", "cauldron", "yinyue-memory", "realm"] }
```

Ling writes the tale; the rules count its turns and pay from the capped
branch table when it closes.

## Player state

`state.json`:

```json
{ "version": 1, "lang": "zh", "daohao": "青玄",
  "root": ["wood", "water", "fire", "earth"],
  "realm": "qi", "stage": 0, "xw": 70, "ls": 10,
  "bag": {}, "beasts": ["fuzhu"],
  "chapter": "00-prologue", "scene": "00-north", "done_scenes": ["00-river", "…"], "ended": [],
  "tasks": { "alchemy-first": { "status": "done", "period": "once" } },
  "quests": { "shifu-scan": { "period": "2026-W37", "paid_at": "…" } },
  "branch": null,
  "story": "青玄在泗水边醒来……",
  "day": { "key": "2026-09-11", "xw": 70, "ls": 10, "branches": 0 } }
```

- `stage` counts from 0 within the realm; `xw` is what the current stage has
  earned toward its threshold, held at the threshold at a realm's peak.
- `story` — the story so far, ≤300 words (≤600 characters in Chinese),
  written by Ling through `Summarize`. The rules store it; they never read it.
- `day` — the day's totals for the caps; it rolls over at local midnight.
- `log.jsonl` — every change `{at, verb, args, before}`: the audit, and what
  `undo` restores.

## A turn — what the context holds

| Part | From | ~tokens | Cached |
|---|---|---|---|
| Ling's game-master rules | SKILL.md | 1,800 | yes |
| Tools | frontmatter | 900 | yes |
| State brief | `Look` | 150 | no |
| Story so far | the state's `story`, via `Look` | 400 | no |
| Current scene: setup + exits' `means` | `Look` / `Resolve` | 300 | no |
| Last ~10 messages | the session | 800 | no |

About 4.5k tokens a turn, most of it cached. Measured live on deepseek-flash:
~5k of context on the first turn, ~7k after the whole prologue. The next scene arrives inside
`Resolve`'s result and replaces this one.

- **One session per game day** (the app session rule: resume the latest under
  24 h, else fresh). A fresh session begins with `Look`.
- Long days fall to the engine's compaction; the story survives either way.

## Tools

Shell tools — `bash $SKILL_DIR/scripts/run-js.sh $SKILL_DIR/scripts/rules.mjs
<verb> --key={{key}} …` (run-js.sh finds the bundled bun, else node); each
prints one JSON object. A refusal is `{ok: false, refused, say}` — `say` is
the world's own line when the content has one — and never changes state.
Args travel as `--key=value`: the engine renders an omitted arg as nothing,
which would shift `--key value` pairs, so an empty value — or one left as a
literal `{{placeholder}}` — is dropped. Tool names must not collide with the
engine's built-ins (`Task` is its delegation tool): the provider refuses the
whole turn.

| Tool | Does | Refuses |
|---|---|---|
| `Look` | Realm, 修为, 灵石, root, bag, creatures, the scene brief, story, the day's omen, offered tasks and due quests. Call at session start and when unsure. | — |
| `Resolve {exit, value?, answer?}` | Takes an exit: checks `needs` and the answer, sets the value, applies `take` and `set`, pays `grant`, advances; returns the beat (each line with its speaker's `name`), the next scene and `summarize: true` when the scene changed. A `game` exit needs the scene's recorded win. | `unknown-exit`, `needs`, `needs-answer`, `wrong-answer` (with the hint), `game-not-won`, `value-invalid`, `no-scene` |
| `Judge {key, answer}` | Checks an answer against the key, either language. | `unknown-riddle` |
| `Practice {action: list \| done \| check, id}` (verb `task`) | `list` the offered tasks and due quests; `done` pays an in-world task whose win the scene recorded; `check` pays a quest its app marked done this period. | `not-offered`, `already-done`, `not-won`, `not-done`, `already-paid` |
| `Branch {action: open \| turn \| close, kind, xw, ls}` | Opens a 奇遇, counts its turns, pays within the branch cap on close. | `branch-open`, `branch-cap`, `no-branch` |
| `Summarize {text}` | Replaces the story. | `too-long` |
| `Move {province}` | Travels. | `road-closed` |
| `Lang {lang}` | Switches zh / en. | — |

`init --lang` starts a game, and `undo` restores the state before the last
change — for the page and for testing, not for Ling. **`win --id` is the
page's alone:** the scene is the only witness to a board or a duel, so it
records the win (a game an exit of this scene names, or an offered task), and
Resolve or `Practice done` pays it and consumes it. No Ling tool can pass a
win — the same rule as quests: done is the witness's record, never
self-reported. Look marks a recorded win `won: true`, so a fresh session sees
one the chat was never told of; the page tells the chat `[scene] won <id>`. Env: `LINGJING_DATA`,
`LINGJING_QUESTS`, `LINGJING_NOW`.

Data tool — `Show {card, …}` (no `cmd`): its args reach the page as a
`content_block` and render as a card — creature, task, board, map, hexagram,
root test, chapter gate, tribulation. Choices are not cards: they go through
AskUser.

Prompt rules that ride in SKILL.md:

- Never state a number the rules did not return.
- Every change goes through a tool; words alone change nothing.
- Map the player's words to an exit's `means`; if none fits, answer and offer
  the way forward.
- Refuse out-of-bounds asks in the world's voice, never as a system message.
- End every reply with a way forward — choices, usually, through AskUser.
- Real-life requests belong to Yinyue outside the game.

## The screens

The look and flow are `prototype.html`. **One set of cards, two placements:**
the Mac shows them on a scene beside the chat, the phone inline in the chat.

**Mac — the scene on the left, the conversation on the right.** No engine
change.

- **The scene is the skill's app page:** the status strip, Yinyue's 3D model
  standing in the current place, the focus card (creature, board, map, root
  test, hexagram, chapter gate, tribulation) and today's tasks.
- **Ling drives it with `Show`,** a data tool: its args reach the page as a
  `content_block`, the way `PageUpdate` does today.
- **The conversation is the stock chat panel:** Ling's narration, the
  player's words, and choices through **AskUser** — its options are the
  buttons, its *Other* field is free text. A tapped option returns to Ling as
  the answer, so `Resolve` gets the exit exactly; *Other* text goes through
  Ling's matching.
- **Puzzles never touch the model.** The scene runs the boards, records a win
  with `rules.mjs win` through `/api/bash` (Health's door), then tells Ling
  `[scene] won <id>`: **as the answer to Ling's open AskUser** when one is
  pending — a new message would queue behind it for up to five minutes — else
  as a hidden message. Ling's tool pays it.
- **Built (step 4):** the status strip (道号, realm, 修为 bar, 灵石), the place,
  the focus card, today's practice. The scene reads Look after every writer
  tool and every turn; entering a scene puts its own `show` cards up (a
  creature is pictured even if Ling forgets), and an open board always sits
  on the scene — Ling says it is before the player, so it is. A fresh day
  sends a hidden `[scene] opened`; a reopened one (under 24 h) is silent. A
  brand-new game takes the machine's language. PageUpdate is not used.
- **Not yet:** Yinyue's 3D model (the moon holds her place — she renders in
  one surface at a time, so the game needs a call on where she lives while it
  is open); the 斗法 duel (the 夫诸 `duel` exit refuses until a board for it
  exists); 七巧板 and 华容道; the 丹田 ring (with the 灵气 heartbeat). The board
  is 4×4 — "pair the eight herbs" — not the 6×6 once planned.
- **A reopened day shows the day so far.** Text Ling writes between tool
  calls is saved as it is written (linggen `b1fec94`); until then only a
  turn's final reply was, and a game day — one long turn of narration and
  AskUser — reopened as an empty chat.

**Phone — the chat is everything.** The phone's own chat (Flutter) draws the
same cards inline, shows choices as buttons that send `[choice scene:exit]`,
and runs the same `rules.mjs` contract. Later.

## Pictures

A creature is never named without its picture — a player cannot know 夫诸
from its name.

- **One picture per creature,** `content/art/<id>.webp`, shipped in the skill.
- **One style:** ink wash. Where a classical woodblock illustration of the
  creature exists — the Ming and Qing illustrated editions of the 山海经 are
  old enough to be public — it is the source; otherwise the picture is drawn
  to match.
- `creatures.json` carries `art` and `art_source` for every entry; the content
  lint refuses a creature without both.
- **Shown on both screens:** large in the scene's focus card on the Mac,
  inline in the creature card on the phone.

## Real-life tasks — quests

Each app publishes its quest facts; the game only reads them.

`~/.linggen/quests/<app>.json`, written by the app itself when its state
changes:

```json
{ "app": "apple-shifu", "quests": [
  { "id": "shifu-scan", "title": { "zh": "清扫洞府 · 用 Shifu 扫描一次磁盘", "en": "…" },
    "period": "week", "due": true, "done_at": "2026-09-11T09:40:00-03:00", "reward": 30 } ] }
```

- **The game names no app.** An app joins by writing its file.
- **Done means the app's own record** — Shifu's last scan time, the night in
  Health's mirror. Never self-reported.
- **Only these facts cross** — due, done, when. No raw health or money data.
- Look marks a quest `done` when `done_at` falls in the current period and
  `paid` once that period is paid; `Practice check` pays the first and
  refuses the second — so a fresh session pays a quest the chat was never
  told of, the way it collects a recorded win.
- **Built (step 5): Shifu.** `apple-shifu/scripts/quest.sh` writes the file
  when a scan completes — the page's full scan, as it saves the scan, and the
  agent's `ScanDisk`. `done_at` is UTC; `due` stays true, since the scan is
  weekly by nature.
- **Built (step 5): Health's workout.** `health/scripts/quest.mjs` rewrites
  the file after every batch the mirror files: `health-workout`, daily, done
  when a workout of twenty minutes or more has ended today. The night came
  second and waits: a mirror can hold no night sleep at all (a Watch left off
  at night), and a quest that can never pay is busywork.

## Access and pay

- **Sign in to play.** A signed-in player gets Linggen's free tier, then the
  $5 Linggen plan — the game is included, never sold apart.
- **Any model plays:** Linggen Cloud or the player's own, as in every app.
  On Linggen Cloud the game already travels like Health — the shared trial,
  then the plan's monthly pool (linggensite `llm.ts`).

## 灵气 — the 5-hour budget

**It keeps the game from taking too much of a day.** Cost is the plan's job;
灵气 is a pace.

- **A rolling 5-hour window of tokens,** the same whatever model answers.
- **Counted in the cloud by heartbeat.** After each game turn the engine
  reports its tokens to linggen.dev; before the next it asks what is left.
  One counter, fed by the engine for every game turn — the proxy does not
  count it again.
- **The skill declares it; the engine names no game.** SKILL.md names the
  meter, and the engine applies it to any session bound to a skill that
  declares one. linggen.dev holds the window's size, so it changes without
  a skill update.
- **Empty:** the engine sends no new story turn. The scene says one line in
  the world and when 灵气 returns; the boards stay playable — they use no
  model.
- **The 丹田 ring** draws the engine's latest reading: full, half, low,
  empty. Tokens are never shown.
- **A pace, not a lock.** A modified client could skip the heartbeat; money
  is guarded by the plan's pool, not by this window.

## Online — the save in the cloud, the rules at home

**The rules run on the player's machine; the cloud stores and counts.**
Content ships in the skill and `rules.mjs` decides, as before — there is no
game server.

```
 player's machine                                linggen.dev
 ┌─ engine + skill ──────────────┐  save (versioned)  ┌─ per account ─────────┐
 │ rules.mjs → data/state.json   │ ─────────────────▶ │ the save: state,      │
 │ Ling's turns, any model       │ ◀───────────────── │ story, recent log     │
 │                               │  heartbeat: tokens │ the 灵气 window       │
 │                               │ ─────────────────▶ │ (10-min buckets)      │
 └───────────────────────────────┘  "what is left?"   └───────────────────────┘
```

- **One save per account:** `state.json`, the story and the recent log — a
  few KB. The Mac and the phone continue the same game; a new machine starts
  from it.
- **Written after every change.** A write names the version it read; a
  stale one is refused and the device re-reads, so two devices never
  overwrite each other silently.
- **What crosses:** the game's own state. From other apps, still only a
  quest's done and when — never Health or money data.
- **The cost of rules at home:** a player who edits files can fake their own
  progress. It matters only where players compare — a ranking, a duel
  between two players — and the server judges those moments when they come.

## Playing together — the table

**Several players in one chat, Ling as the host.** It is what makes this
game unlike every other app, and it asks the engine for things no app has.

### The room

- **Live, in a room.** One player's Linggen hosts the table — Ling on the
  host's models — and up to four friends join over WebRTC (the existing
  rooms). The host's 灵气 pays for the table.
- **Rewards land in each player's own save.** The table announces a grant;
  each player's own Linggen applies it through its own rules, within the
  reward tables and the day's caps. No machine writes another account's
  save, and a generous host cannot hand out a realm.
- **Apart, through the cloud.** 传音, 同修 and 论道 challenges need no one
  online at once; a room lives only while its host is online.

### How a table plays

```
[Ling]  a question, a task, a moment — the round opens
[青玄]  告
[云舟]  an egg?
[Ling]  青玄 answered first — 告. 修为 +20
```

- **Rounds, by default.** Ling opens a round, the players answer, the round
  closes, Ling announces. Ling drives; a round costs Ling about two turns
  however many play.
- **Free talk, any time.** Players talk to each other in the same chat; it
  never wakes Ling, who reads it when the next round opens.
- **Choices: anyone may tap.** An AskUser at the table takes the first tap,
  and the chat says who — *云舟 chose 绕行*.
- **Stragglers never hold the table.** A round has a time limit.

### Three judges

Every play is judged one of three ways, so a reward is fair however many
play:

| Judge | How | Model |
|---|---|---|
| **Key** | The rules check the answer against a key shipped in `content/` — a riddle's answer, a creature, a poem corpus — in either language | none |
| **Board** | The scene witnesses the win, as it does for 炼丹 | none |
| **Ling** | No key — a couplet, a plan, a creative act: everyone answers within the time limit, and Ling reads them all in one turn and picks, paying from the capped tables | one turn |

The host's scene watches a keyed round the way it watches a board: it checks
each answer as it arrives, records the first right one with `rules.mjs`, and
tells Ling `[scene] round won by <player>`. Wrong guesses and table talk
never reach the model.

### Teams

Every play runs as **one team** (the table against the world; all earn),
**two teams**, or **each for themselves**. In v1 teams plan in the open, like
a party game at one table.

### The plays

| Play | What happens | Judge | Modes |
|---|---|---|---|
| 灯谜 race | Ling reads a riddle; the first right answer wins | Key | teams · solo |
| 山海经 guess | A creature revealed clue by clue; fewer clues, more 修为 | Key | teams · solo |
| 飞花令 | Teams take turns with a classical line holding the word (月, 花 …) | Key — the corpus checks it is real and unrepeated | two teams |
| 成语接龙 | Each idiom starts where the last ended (English: a word chain) | Key — an idiom list | two teams |
| 对对联 | Ling gives a first line; each team writes the second | Ling | two teams |
| 奇遇 together | A side story; each player says what their character does; Ling resolves the round | Ling, with party exits in the rules | one team |
| 守鼎 | A creature attacks the cauldron; each picks a move by their 五行 root; the rules resolve it by 相生相克 | Key — a rule table | one team |
| 斗法 | 象棋, 围棋, 五子棋 — one against one, or teams taking turns | Board | 1v1 · two teams |
| 连连看 race | The same board for everyone; first to clear wins | Board | solo · teams |
| 九宫 seal | Each holds part of the 洛书 numbers; they must talk to break it | Board | one team |
| Who am I | One holds a secret creature card; the rest ask yes-or-no | Key | solo · teams |

**The first set:** 灯谜 race, 山海经 guess, 飞花令, 奇遇 together and 斗法 —
all three judges, all three modes. Word games keep a set per language; 飞花令
and 成语接龙 ship public-domain corpora (in English, a word chain; a "line
with the word" is Ling-judged).

### What the engine needs — none of it names the game

1. **A shared chat with members** — one session several people are in;
   today a room gives each guest a private one. The largest piece.
2. **The speaker on every message** — Ling reads `[青玄] 告`.
3. **Talk that is not a turn** — table messages are saved and shown to all
   without waking the model.
4. **AskUser for a group** — the first tap answers, and the chat names who.
5. **A shared board channel** for 斗法 and 连连看 race, on the existing
   topics.
6. Later: **private cards per player** (九宫 seal, Who am I) and
   **team-only chat**.

`rules.mjs` grows rounds, party exits ("any one player holds the lingzhi")
and per-player grants; `content/` grows keys, corpora and clue sets.

## Memory

- **No memory recall.** SKILL.md declares no `memory-context`: the game's
  memory is `state.json` and its `story`, and nothing in ling-mem belongs in
  Ling's context.
- **A skill-bound session is the skill's on every surface.** Until linggen
  `73a6cf5` the engine read that from the request's `skill_name`, which the
  phone never sends: turns typed into a Lingjing session ran as the user's —
  core block plus full recall — and pulled notes about *building* the game,
  answer keys included, into Ling's context (seen live 2026-09-11). It now
  falls back to the session's stored skill. Typing `/lingjing` inside an
  ordinary chat is still that chat — the game is played in its own session.
- Game events live in `data/`, not in ling-mem.
- Yinyue reads the player's name from core memory; the game writes nothing
  into her memory.

## Languages

`lang` is in the state; every authored string is `{zh, en}`. **The player's
own words set the language:** Chinese characters mean `zh`, English words with
no Chinese mean `en`, anything else (an emoji, a tapped option) changes
nothing; Ling calls `Lang` before answering, and `Lang` returns the scene in
the new language. In English play Look carries `terms` (`content/terms.json`:
修为 cultivation, 灵石 spirit stones, 灵根 spirit root, the provinces …), and no
Chinese appears inside an English sentence. Word games and riddles keep a set
per language. English uses the fandom's terms (Qi Condensation, Foundation
Establishment, Core Formation, Nascent Soul).

## Testing

- **`rules.mjs` is pure** and node-tested: exits, needs, caps, chapter gates,
  once-per-period, refusals.
- **A content lint**: every `next` exists, every `grant` fits its table, every
  string has both languages, every `key` exists, every creature has its
  picture.
- **A playthrough without a model**: the prologue driven by exit ids alone,
  asserting the state at the end.

## Build order

1. Content schemas and the prologue (泗水 → 测灵根 → first tasks → 夫诸) as data. ✓
2. `rules.mjs` with its tests and the content lint. ✓
3. SKILL.md — Ling's rules and the tools. ✓ (the prologue played live)
4. The Mac scene page and its `Show` cards; choices through AskUser. ✓
5. Quests: Shifu's scan ✓, Health's workout ✓; Health's night waits for sleep in the mirror.
6. Online: the cloud save and the 灵气 heartbeat — the skill declares its
   budget, the engine reports and asks, linggen.dev counts and keeps the save.
7. Chapter 1 — 冀州.
8. The table: the engine's shared chat, then the first set of plays; 传音 ·
   同修 · 论道 through the cloud.

## Open

- **Idea — a healthy user gets a better Linggen.** Health kept (the facts
  the apps already record) earns more than game 灵气: a better Linggen
  overall. To talk through.
- 灵气 refills from a workout or a deep night — the heartbeat could carry
  the quest fact; how much, and capped how.
- The window's size, and whether the plan's players get a larger one.
- Offline play: the save and the heartbeat need the network.
- The phone.
