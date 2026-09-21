---
type: design
reader: coding agent, contributors
guide: |
  How Lingjing is built. What it is and does is product-spec.md; how it looks
  and plays is prototype.html (scripted, no model). This file is the build.
status: 2026-09-16 — 功法 built (swords lend a root, 符 from 桑皮纸, five learned arts, teachers, the rescue); exits walk the one road to the next scene; creatures at their haunts (降妖 once a day, 驯 by what they like — `place.encounter`, Tame), every card with buttons, the stage speaks (taps are words to Ling), the choice as a law (director `choice`), every bout winnable; chapter 3 (青) built, no chapter locks while building; 2026-09-15 — chapter 2 (兖) built; 2026-09-14 — content, rules.mjs, SKILL.md, the Mac scene page, the first quests (Shifu's scan, Health's workout), online (the cloud save, sign in to play) 灵气 as stamina, 徐's seeds, made scenes, the dictionary, the worlds split, 徐's places (Move for real, the director's brief) the catalog (Trade, the 坊市 at 彭城, the item card), 降妖 (the 五行 bout on the scene) and chapter 1 (冀州, opens 2026-10-01; provinces open with chapters, the spine as waypoints, the breakthrough) built (build order 1–14); the table (playing together) designed.
---

# Lingjing — design

## 设计原则 (2026-09-18 — his, and they outrank anything below)

- **走已有的套路，不发明新词。** 开放世界 RPG 的模式是现成的 —— 技能树、加点、
  装备与功法随人成长 —— 我们照着走，参考《魔兽世界》(World of Warcraft)。
  一句话的定位是他写的：**AI 驱动、卡牌策略、动态故事、聊天框版的魔兽世界，
  但世界是凡人的世界。**
- **斗法照《炉石传说》(Hearthstone)。** 一场战斗是一局卡牌对战：灵力每回合
  长一格、手里有牌、场上有灵兽、法术与符是一次性的。机制取炉石，名字与世界
  取我们自己的heritage。见 `## 斗法 v3`；2026-09-17 那套回合制五行对拼作废。

*In English, for the agent reading this: follow the patterns open-world RPGs
already have (skill tree, points, gear and arts that grow with the player —
World of Warcraft as the reference), and build the fight as a card game in the
shape of Hearthstone. Invent no new vocabulary; the invention goes into the
world, which is 凡人's, not into the mechanics.*

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
 │  reads  worlds/<id>/ (authored)    │
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
    duel.js, duel-card.js  the 五行 bout (shared with the rules) and its card
    rules.js               the page's door to rules.mjs (/api/bash)
    chat-bridge.js, api.js the shared bridge copies
    rules.mjs              the rules engine, a CLI: node rules.mjs <verb> …
    run-js.sh              runs it under the bundled bun, else node
    content.mjs            loads + validates a world; `lint [world]`
  worlds/<id>/             one folder per world; the folder's name is its id
    world.json             the world card: id, title, premise, style, sources
    names.json             the novels' names this world refuses, by book
    dictionary.json        the harness's ids → this world's words, zh + en; the provinces
    ladder.json            the tiers: 练气 1–9, 筑基 … with progress thresholds, pay, gate
    traits.json            灵根 kinds and their progress multiplier
    rewards.json           reward tables and caps (scene, branch, task, day)
    creatures.json         山海经 entries: name{zh,en}, source, quote{zh,en}, province
    herbs.json             alchemy tiles
    items.json             the catalog: kinds, prices, one effect each; art/items/<id>.webp
    hexagrams.json         the day's omen (the eight doubled trigrams so far)
    art/<creature>.webp    the classical woodcut on our paper (tools/frame.py); plates/ the originals; CREDITS.md
    riddles/zh.json, en.json   answer keys the rules check
    tasks/world.json       in-world tasks
    seeds/<province>.json  奇遇 seeds, one file per province
    places/<province>.json the province's places, roads and tiers
    branches.json          奇遇 templates and the daily cap
    chapters/00-prologue/  chapter.json · beats.md · scenes/*.json — the corridor
    chapters/01-ji/        the same — waypoints; gate 1 (opens: null while building; 2026-10-01 at launch)
    chapters/02-yan/       the same; gate 2 (筑基 → 结丹; 2026-11-01 at launch)
    chapters/03-qing/      the same; gate 3 (结丹 → 元婴; 2026-12-01 at launch)
  data/                    this player; never in the repo — the cloud save mirrors it
    state.json · log.jsonl
  tests/
```

## Worlds — systems are fixed, story is the only dynamic part

**Decided 2026-09-14**, in three steps: "the template is not just one scene,
it is a predefined game… a world"; "when Ling builds a new world or scene it
should reuse our systems — fight, 修炼, economy — Ling only needs to invent
a story"; "the architecture could be the same in all worlds, but the
content needs to align with the world". A player never builds before
playing: they start inside a world that is already whole. 《九鼎》 —
everything in `worlds/jiuding/` — is the first world and the example.

- **The harness holds the systems, with no names.** The ladder and
  progress, wealth, stamina and its costs, traits, the bag and the catalog,
  tasks and real-life quests, the contest resolvers, the boards and word
  games, places and roads, seeds, made scenes — one implementation in
  `rules.mjs`, never regenerated, never touched by Ling. What a world can
  change is which of them it uses and what it calls them (§ The
  dictionary).
- **A world is a story laid over the systems.** `world.json` (id, title,
  style, sources), `dictionary.json`, a ladder, its reward tables, a cast
  with art, seeds, places and roads, chapters, the key sets its word games
  judge by, which resolver its contest uses. 《九鼎》's is the 九鼎 spine;
  a 山海经 world's is the bestiary itself — find, picture, tame, learn the
  line; a 三国 world's is a council and a campaign, its contest resolved by
  兵种相克 or a board. Same rules, same Ling, the world's own words.
- **Ling invents story, never systems.** Asked for a world in a line — *a
  山海经 hunt in 青州* — Ling writes the **outline** first: title, premise,
  eight places, the cast drawn from the bestiary, the first scene — about 2k
  tokens, under a minute — and the player starts. Each next scene is written
  when an exit needs it, while they play (§ Made scenes). Nothing is asked;
  the player changes anything afterwards by saying so.
- **The lint is the bug catcher.** Outline and scenes go through the same
  check authored content does — exits resolve, grants within caps, cast
  only from the bestiary with art, roads to real places, both languages
  where required — and `not-playable` sends Ling back to fix, silently. What
  the lint cannot judge is prose; the running summary and the fixed systems
  keep even a small model coherent.
- **Numbers that grow, never numbers that fight.** A world may name
  `progress` 武力 for a general, but a fight resolves by a table or a board
  in every world — no HP, ever. That is what keeps a new world cheap to
  balance: it has nothing to balance.
- **Built (step 10b):** `content/` → `worlds/jiuding/`, one folder per
  world, the folder's name its id. `world.json` is the world card (id, title,
  premise, style, sources); `loadWorld(id)` loads it, `listWorlds()` names
  the shipped ones; `state.world` says which the save plays (version 3; a
  version-2 save was always 《九鼎》 and migrates to it); `rules.mjs` loads
  the save's world, `init --world=<id>` starts a fresh save in another and
  refuses `unknown-world` with the list; Look carries the `world` card and
  the page reads content and art from `worlds/<id>/` once it knows. The lint
  runs per world (`node content.mjs lint [world]`, all when unnamed) and
  checks the card. `names.json` lists the novels' names the world refuses,
  by book; the lint walks every string of the world — and every scene Ling
  makes, `not-playable: names 黄枫谷 (凡人修仙传)` — and refuses one that
  contains any; `_` notes are skipped. Built-in worlds are authored; a
  player's world is Ling's; both play identically. One story in play per
  save; a new world starts a fresh save (the account keeps several).
- **Built (step 14b, 2026-09-15): made worlds.** A world of the player's is
  laid over 《九鼎》 and lives in the skill's `data/worlds/<id>/`, holding only
  what Ling wrote: the card (`base: jiuding`, its province, its opening
  scene's id), the words it renames, its new creatures, one province of
  places, the opening scene. `loadWorld` merges base then overlay: ladder,
  rewards, herbs, items, riddles, tasks, branches are the base's; the map is
  the made province alone; the one chapter is a stub with no spine, so the
  province opens at once and the story is the opening scene (entered the
  moment the save begins) plus what Ling makes next. `templates/made-world.json`
  is the example and carries the rules; `lintMadeWorld` checks an outline the
  way authored content is checked, plus the made limits (4–8 places, roads
  both ways, a start, ≤4 new creatures with a root, words only for ids the
  harness has, the opening scene through the made-scene lint, no novel's
  names); a missing `base` or `id` takes the only answer there is. Verbs:
  `build` (nothing → template + rules + cost; an outline → lint → folder →
  travel), `worlds`, `travel` (the save in play is parked under
  `data/saves/<world>.json`, the other's restored or begun; `undo` steps back
  across it), `art` (the file GenerateImage wrote, moved beside the world and
  written into the creature's card). Cast may come from the bestiary, with
  its picture, or be new and painted — both, his ruling (painted while
  building since the same day, below).
  The page reads a made world's creatures and words over its base's; a
  creature not yet painted shows its look in words. Closed where the machine
  cannot draw (no GenerateImage). Live on Gemini Flash-Lite: 《青州山海猎》 in
  20 s (five places, 夫诸 in a cave); 《荆州泽国》 with an invented four-winged
  serpent, drawn in 16 s and shown. **Amend** (same day) changes a world in
  play by the player's word: a creature and the place it haunts, or a place
  with roads the rules lay back, checked as the outline is, charged to the
  save; it takes what a model hands over — quotes escaped once, a bare
  string for a name (Han → zh, else en), the existing place under `place`
  read as *where*. Live: 泥玄, a jade-feathered turtle, added to 芦岸 and
  painted. **Its map** (same week): a made world's place `show` ends with
  `{card: "map"}`, and the map card draws that one province from its roads —
  rows by roads from the start (`place.province.start`), each row under the
  places it is reached from, every place's `roads` in Look's `places`
  (`scripts/roadmap.js`, laid out on the page, no coordinates written by
  anyone); here, the roads out and beyond the tier marked as the chips are.
  **A refused Move went nowhere:** live on Flash-Lite, Ling described the
  turtle at 芦荡 while the rules held the player one road short, so every
  Move refusal carries `here`, and `no-road` carries `toward` — the first
  road on the shortest way through places the player may enter (null when
  none) — and SKILL.md forbids describing a place before a Move there comes
  back ok. **The painted map** (same day, his "can we build a map by flux?"
  → "yes, go"): FLUX paints the province once and the page lays the names
  and roads on top. Tested first: an edit pass over a layout sketch drew the
  same picture as words alone (22 s against 13 s), so the prompt carries the
  layout — each place said where the road map puts it ("Top center:
  Clearwater Pool. …"), rows spread the way a painter reads left and top
  (`placeWords` in `scripts/roadmap.js`), the made-picture style line, no
  writing asked for (one seed still painted false characters). Look's
  `world.paint_map` held GenerateImage's arguments until the map was
  painted (now `building`, below); `Art {creature: map, file}` keeps the picture as `art/map.png` in
  `world.json` with the positions it was painted for, so a place Amend adds
  later gets a name on the old picture and moves nothing; `Art {creature:
  map}` with no file gives the arguments again. SKILL.md carries the rule
  beside `summarize: true` — in the Worlds steps alone Flash-Lite skipped it.
  Live on Flash-Lite: 《荆州泽国》 painted in 13.8 s, every name on its place.
  The same run found the opening scene following the player to 芦荡 (a made
  scene with only a staying exit never ends); walking away now leaves a
  made scene (§ Made scenes). **Only building paints** (same day, his "20
  seconds is ok for building mode, but not ok for playing mode"): a made
  world plays once every creature it made has its picture and its map is
  painted. `paintList` is GenerateImage's arguments for each (a creature's
  from its `look` and the style line, the map's as above), each with the
  `creature` Art takes back; Look carries it as `building`; the story's
  verbs (resolve, judge, duel, branch, move, trade, make, enter, leave)
  refuse `still-building` with the list; Art answers what is left, or
  `ready`; Amend answers `paint` for a beast it adds. Build still travels at
  once — Art works on the world in play — so a new world opens in building
  mode and the scene shows *painting the world, n to go*. A made scene's
  new things are drawn while it is made, before Enter. Measured the same
  day: a painting is 20–25 s warm or cold (a cold model costs ~3 s, the
  network check 0.3 s), so there is no warm-up. Open: a weak model may skip
  reading the template and need several lint rounds.
- **Style of 《九鼎》: 修仙 · 凡人流 — no names from the book.** Decided
  2026-09-14 ("use 凡人流 style, no names from the book"). The *system* is
  道教 and genre inheritance older than any novel — nine realms 练气 to 渡劫,
  灵根 with 天灵根 and 伪灵根, 灵石, 丹药, 法器, 宗门, 秘境, 妖兽, the mortal
  with poor roots who climbs by diligence — and 灵境 is built on it:
  four-root 伪灵根 for all, 灵石 counted in tens, a 坊市, a 宗门 to join.
  What is never used is any named character, place, item, technique or plot
  of 《凡人修仙传》 (or any living author's novel): that is licensed IP, and
  the recognition it would buy is exactly the part that cannot be had. The
  world card may say the style; the lint's names list refuses the rest.

## The dictionary — one id, a name in every world

**Decided 2026-09-14** ("we need a dictionary, give it an id with different
name in each world"; "ids are same among worlds"). The harness's systems
have **ids**, fixed across worlds; each world's `dictionary.json` gives
every id its words, zh and en. The rules, the save, the tools and the tests
speak only ids; Look returns `words` in the player's language; Ling, the
cards and the rules' own lines use nothing but those words. 修为 appears
nowhere in code.

| id | system | 《九鼎》 | a 三国 world |
|---|---|---|---|
| `progress` · `next` | the number that climbs; the next threshold | 修为 | 声望 |
| `tier` · `step` | the ladder (`ladder.json`: tiers, steps, thresholds, `pay`, `gate`) | 境界 · 练气一层 | 官阶 · 白身 |
| `wealth` | money | 灵石 | 粮草 |
| `stamina` · `pool` | the pace and its vessel (`rewards.json → stamina`) | 灵气 · 丹田 | 精力 · 体力 |
| `traits` | speed modifiers (`traits.json`, or none) | 灵根 五行 | 天赋 |
| `name` | the player's name in the world | 道号 | 表字 |
| `cast` | the creatures and people with cards | 灵兽 | 武将 |
| `contest` · `duel` · `debate` | the resolvers | 降妖 · 斗法 · 论道 | 攻城 · 单挑 · 舌战 |
| `branch` · `task` · `quest` · `shop` | the encounter, in-world tasks, real-life quests, the market | 奇遇 · 功课 · 人间功课 · 坊市 | 机缘 · 军务 · 人间功课 · 市集 |
| `alchemy` · `pill` · `breakthrough` · `tribulation` · `abode` · `cauldron` · `omen` | the world's furniture | 炼丹 · 丹 · 突破 · 雷劫 · 洞府 · 鼎 · 卦 | — |

- **The save is ids:** `{ name, traits, tier, step, progress, wealth, stamina,
  stamina_at, bag, cast, … }` (version 3; older saves migrate on read —
  `migrate` in `state.mjs`).
- **Content is ids:** grants say `progress` and `wealth` and `cast`; a scene
  sets `traits`; the value exit's field is `name`; the card kind is `traits`.
  Card *kinds* (creature, traits, map, board, hexagram, gate, tribulation)
  are the harness's, like ids; their titles come from the words.
- **Real-life quests are the same in every world:** an app's file carries
  `reward` (progress) and `stamina`, never a world's word.
- **What a world may not rename:** the ids, the card kinds, the reward
  tables' keys, the refusal codes. What it must: every word in
  `dictionary.json`, the ladder, the provinces (or its map's regions).

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

### Pacing — rewards scale by realm

**Decided 2026-09-14.** The tables and caps are written in base 修为 and
never change; each realm carries a `pay` multiplier in `realms.json`, applied
last: `paid = min(grant, table cap) × root speed × realm pay`, and the day
cap counts base 修为 before the multiplier. So a 化神 奇遇 pays like one, and
the prologue's numbers stay as they are.

With a diligent day at about 80 base (a kept workout and three 奇遇) and the
thresholds as written:

| Realm | 修为 to cross | `pay` | Days |
|---|---|---|---|
| 练气 | 810 | 1 | ~10 |
| 筑基 | 1,500 | 1 | ~19 |
| 结丹 | 3,000 | 1 | ~37 |
| 元婴 | 6,000 | 2 | ~37 |
| 化神 | 10,800 | 3 | ~45 |
| 炼虚 | 18,000 | 6 | ~37 |
| 合体 | 28,500 | 9 | ~40 |
| 大乘 | 43,500 | 14 | ~39 |
| 渡劫 | 66,000 | 20 | ~41 |

About 305 diligent days end to end — the spec's year, with slack for the
days a chapter is not yet open. Without the multiplier the same tables took
six years. The numbers are a first pass; the shape is the decision.

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
| exit `key` | A riddle, or a pool of them (2026-09-17). The rules pick the day's — one this play has not seen, by the day and the 道号; asked is seen, and a play never asks one twice until its pool is spent. Each riddle offers `choices` (three or four, one right) as the question's options; a miss is kept — the first brings the `hint`, the second shuts the riddle until tomorrow (`riddle-closed`). The model only extracts the answer. |
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

**A branch grows from a seed.** A template alone gave Ling one line to write
from ("a legend of the province"), which is the same tale by the third day.
A seed is one authored line — a creature, a place, a thing from that
province's 山海经 chapter — and Ling only fleshes it out.

`worlds/<id>/seeds/<province>.json`, thirty to fifty a province:

```json
{ "province": "徐",
  "seeds": [
    { "id": "xu-01", "kind": "province-tale", "creature": "fuzhu",
      "line": { "zh": "雾里一头四角白鹿，踏水不湿。", "en": "A four-horned white deer in the mist, walking on the water dry-shod." } },
    { "id": "xu-02", "kind": "night-tale",
      "line": { "zh": "泗水渔翁夜得一鲤，鲤能言。", "en": "A Si River fisherman nets a carp at night; the carp can speak." } } ] }
```

- **The rules pick the seed, by the day.** `Branch open` chooses from the
  player's province, unused first (`state.seeds_used`), seeded by the day
  key, and returns the line to Ling; the same day reopens the same seed.
  Ling never chooses.
- **A seed with a creature shows its card** — the picture rule holds in
  branches too. A seed's `creature` must exist in `creatures.json`, with art;
  the lint refuses one that does not.
- **A seed is a beginning, not a plot.** What happens is Ling's; the template's
  `may_not` still holds; the reward table and the day cap are unchanged.
- **The prologue's province is 徐,** so 徐 ships first.

### A day

What a player does on an ordinary day — between chapters, which is most
days — is the game's real shape:

1. **The day's cast (起卦, built 2026-09-17).** The 今日卦象 card waits with
   three coins and 起一卦 until it is cast, and the director's choice offers
   it too. 所问何事 — 问修行 · 问斗法 · 问财运 — then the rules throw three
   coins six times (三钱法; seeded by the day and the 道号, so a day never
   re-casts) and read the hexagram from `hexagrams.json` (all 64: 卦辞 and
   大象 from Wikisource's 周易, graded 大吉 · 吉 · 平 · 凶 · 大凶). The grade
   does the asked thing for the day: 修为 ×1.5/×1.2/×0.8 (大凶 also a
   60-second rest between story steps), 灵石 ×1.5/×1.2/×0.8/×0.5, or a
   bout's lower-trigram root turning draws to wins (吉 ×1, 大吉 ×2) or wins
   to draws (凶 ×1, 大凶 ×2). Yinyue reads it aloud on the stage. The numbers
   are his to set.
   **命格 (built 2026-09-17, his design):** beside the roots, set once and only
   if the player wishes — on the 灵根 card, never in the chat: a birthday typed
   there is read by the page-only `fate` verb on the machine, and only the
   生肖 (turning at 立春, by the day) and 日主 (the day's stem, its element)
   are kept; or 随机, or 不必了 (still settable later). The four roots stay the
   same for everyone. The 日主 element: once a bout a lost round with that
   root stands as a draw; a cast whose lower trigram is that element leans
   its grade one step the player's way (吉→大吉, 凶→平, 大凶→凶; `fated`).
2. **A due quest, if any** — the workout kept, the scan run — paid on sight.
3. **One 奇遇 from a seed,** offered by Ling as the way forward when the spine
   has nothing new. Up to `per_day`.
4. **Practice** — a board on the scene, no model, no 灵气.
5. **The story waits** at its gate when a chapter is not yet open — said in
   one line, never nagged.

A few minutes. The spine moves on the days a chapter opens; the seeds and
the quests carry every other day.

### Items — the catalog

灵石 is money, and money needs things to buy. The bag already exists
(`bag: {lingzhi: 1}`; exits `needs.bag` / `take.bag`; tasks `gives.bag`) —
the prologue runs on an item. The catalog gives every item a name, a
picture, a price and one effect.

`worlds/<id>/items.json`:

```json
{ "id": "lingzhi", "kind": "material",
  "name": { "zh": "灵芝", "en": "Lingzhi" }, "art": "art/items/lingzhi.webp",
  "buy": 30, "sell": 10,
  "effect": { "key": true } }
{ "id": "qi-pill", "kind": "pill",
  "name": { "zh": "聚气丹", "en": "Qi-gathering pill" }, "art": "…",
  "buy": 80, "sell": 20,
  "effect": { "xw": 20, "table": "puzzle" } }
{ "id": "moon-bell", "kind": "artifact",
  "name": { "zh": "银月铃", "en": "Silver-moon bell" }, "art": "…",
  "buy": 200, "sell": 60,
  "effect": { "wear": "yinyue" } }
```

- **Kinds:** 丹药 `pill` · 武器 `weapon` · 装备 `gear` · 法器 `artifact` ·
  宝物 `treasure` · 钥匙 `key` · 材料 `material`. Kinds are for the shelf and
  the card; they carry no rules of their own.
- **Three effects, and no fourth.** A *key* is needed by an exit
  (`needs.bag`); a *pill* pays 修为 on use, from a capped table; a *wear*
  changes how Yinyue or the 洞府 looks (`state.wear`). **Never a number
  that fights** — no attack, no defence, no durability. The game has no
  combat; 斗法 is a board. A sword is a thing you own, show and sell.
- **`Trade {action: buy | sell | use, id}`** — the rules check the 灵石, the
  bag and the catalog price; Ling never names a price. `sell` is refused for
  a key the story still needs (`key-in-use`).
- **A 坊市 in each province** — a scene with a `shop` exit that stays; its
  shelf is the catalog filtered by province. Ling shows the shelf with an
  `item` card; the player says what they want.
- **Rewards can be things:** an exit's `grant` or a task's `gives` names an
  item id, checked against the catalog.
- **The lint:** every item pictured; every `needs.bag`, `gives.bag` and
  `grant.item` names a catalog item; a price never below its sell price.
- **Built (step 12):** `worlds/jiuding/items.json` — eight for 徐 (灵芝 ·
  聚气丹 · 人参 · 竹剑 · 蓑衣 · 玉鱼 · 渡牌, and 银月铃 sold only in 冀), each
  `{id, kind, name, about, art, buy, sell, sold, effect?}` with an ink sketch
  in `art/items/`. The effect key is `progress` (the id, not 修为); an item
  may have none — a sword is a thing you own. **The market is a place**, not
  a scene: 彭城 has `shop`, and Look's `place.shelf` is the catalog `sold` in
  the province, each with its prices and how many are `held`; `place.show`
  carries the shelf as one `{card: "item", ids}`. **`Trade {action, id}`**:
  `buy` / `sell` only at a market, a visit's 灵气 (`shop` 5) each, the
  catalog's prices; `no-market` (*这里没有坊市*), `not-for-sale-here` (with
  the shelf), `no-stones` (*灵石不够* + price), `not-in-bag`, `key-in-use`
  (*这东西还有用处，先留着* — an exit of the chapter's undone scenes still
  `needs.bag` it), `not-usable`. `use` anywhere: a pill pays `progress`
  through `pay` (capped, sped, tiered) and is spent; a wear sets
  `state.wear[slot]` (yinyue / abode) and stays in the bag — selling it
  takes it off. Selling never counts toward the day's wealth cap: it
  converts, it does not earn. `grant.item` on an exit or a branch puts the
  thing in the bag (`paid.item`). Look's `bag` now carries names. The `item`
  card draws one thing or a shelf with prices and *在囊中 ×n*; the dictionary
  gained the market words and the seven kinds. The lint: kind, art on disk,
  whole prices with buy ≥ sell, `sold` provinces known, exactly one effect
  of the three, a pill within its table, a wear on a slot; every bag
  reference names a catalog item (herbs stay the board's tiles only).

### The open world — places, roads, tiers, the director

**Decided 2026-09-14** ("what you said about open world game is correct";
the prologue stays a corridor and the world opens after 夫诸). A province
is a map of places, not a chain of scenes.

- **Places** — `places.json` per province, eight to twelve: 泗水岸, 彭城,
  云龙山, 圯桥, 淮水渡口, the 坊市 … each with `roads` to neighbours, a
  `tier` (the realm index it asks for), and what is there: a creature, a
  seed pool, a shop, a spine scene when the chapter is open.
- **`Move {place}` for real.** The rules check the road and the tier
  against the player's realm. Too hard is refused in the world — *雾更浓了；
  银月：还不是时候* — and the refusal carries a fitting place, so Yinyue's
  "let's go back to the ford" is the rules' hint, spoken kindly. Nobody is
  stuck; nobody is lectured. A lost fight costs nothing already.
- **The spine as waypoints.** Chapter scenes attach to places; the player
  reaches them by wandering. Ling holds the *thread* — the next waypoint —
  and says it when the player idles. A sandbox without pull is aimless; the
  thread is the pull. An exit taken toward the next scene walks the player
  there itself when it stands one road away (2026-09-16, his "no need to
  click twice": *去蓬莱* means go; asking which road again was a second
  click) — farther off, the road waits as before.
- **Ling as director.** Each turn Look carries a small *director's brief*:
  what is near, what is too hard, the thread, the 丹田, today's seed. Ling
  improvises inside it — a 奇遇 here, a creature there, a road mentioned —
  and the rules still decide every outcome. A tabletop game master with a
  prepared spine.
- **Risk, named:** more freedom for Ling means more variance on a small
  model. The brief stays tight; every refusal carries its line; a weak
  model still lands on rails.
- **Built (step 11):** `worlds/<id>/places/<province>.json` — eleven for
  徐 (泗水岸 · 泗水北岸 · 彭城 · 云龙山 · 淮水渡口 · 圯桥 · 泗口 · 吕梁洪 ·
  沛泽 · 微山湖 · 徐山), each `{id, name, tier, roads, has, line}`; `start`
  names the first. `has` is what is there: `creature` (with its card),
  `seeds` (the province's pool), `shop` (the 坊市, step 12), `scene` (a
  chapter's, step 14). A scene carries `at`, its place; the corridor walks
  the player (`settlePlace` on every scene change); `state.place` is the
  save's stand when no scene runs; a save from before places starts where
  its province starts. `chapter.json → corridor: true` keeps Move waiting
  (`corridor`: *先把眼前的事做完*) until the chapter ends. **`Move {place}`**
  by id, name or English: `no-road` (its line + `near`), `too-hard` (*雾更浓
  了，看不见路* + `fitting` + Yinyue's *还不是时候。先回X吧*), `unknown-place`
  (`near`); a province still answers as before. A move costs no 灵气 — what
  is done at the place does — and returns the place, its `show` (the
  creature) and a fresh brief with `summarize`. **Look** carries `place`
  (what is there, `roads` with `too_hard`, the province's `places` with
  here/road/too_hard for the map) and **`director`**: `here`, `near`,
  `too_hard`, `corridor`, `thread` (the scene's setup while one runs; else
  the next chapter, its province, its first place and `opens`; null when
  the spine is unwritten), `pool` (full/half/low/empty as the ring), `seed`
  (today's, only where seeds grow and a branch may still open). The map card
  draws the province's places on the world map (2026-09-17: the 禹贡九州图
  plate, `world.atlas`; each place's authored `map` is its point — points
  only, never lines, a road is not straight; up close on the player's
  province, 九州全图 at a tap, where the player is a dot and a province with
  places opens up close, its points alike — the page-only `atlas` verb reads
  them, never Look; a made world's draws its roads instead — step 14b): here
  (Yinyue's
  colour), a road away (Ling's), beyond the tier (dashed, faint). The lint:
  roads both ways within the province, tiers on the ladder, a creature with
  its card, a scene that exists, every place reached from the start, every
  `at` a place of the chapter's province. SKILL.md gained *The director's
  brief*. 坊市 as a place: built (12). Spine waypoints: built (14).
- **Built (step 14) — chapter 1 and the waypoints.** `chapters/01-ji/`
  (opens 2026-10-01, gate 1, `corridor: false`): six scenes at four places
  of 冀 — the Zhang, Ye and its market, the River Lord's shrine where the
  "god" is 狍鸮 (fight it, answer the sorceress, or send her in as 西门豹
  did), the deeps with the 洛书 seal, the cauldron, the end pointing east
  to 兖. `places/ji.json` (nine, 漳水南岸 the start; 泗水北岸 has the road
  north — roads may cross provinces, the lint allows it), `seeds/ji.json`
  (twenty), 狍鸮 and 精卫 with sketches, two riddles, 铁剑 and 筑基丹 sold in
  冀. **Provinces open with their chapters** (`provinceOpen`: a chapter of
  the province with `opens` null or past; a province with no chapter stays
  behind the mist): Move into a closed one is `road-closed` with the
  province's line; the director's `closed` lists such roads; `place.roads`
  carry `closed`. **Waypoints** (`atScene`): outside a corridor a scene runs
  only where it stands — Look's `scene` is null and `waypoint` (and the
  thread: *路通向X*) names the place; Resolve elsewhere refuses
  `not-at-scene`; Move onto the place returns the scene with its cards;
  `settlePlace` carries the player only in a corridor. **Look wakes the
  story** (`wake`): when the save waited on a chapter that has since
  opened, the `look` verb advances into it and writes — the one change
  Look makes. **The breakthrough** is an exit flag: `breakthrough: true`
  with a `refuse` line; refused `not-at-peak` (with the peak step) unless
  the player stands at the last step of their tier with the threshold met
  and the next tier's `gate` is the chapter's; taken, tier → next, step 0,
  progress 0, then the exit's grant pays into the new tier; the result
  carries `breakthrough {from, to, tier}` and the exit shows the tribulation
  card. The lint: a breakthrough needs its line and a gated chapter whose
  gate a tier carries.

- **Chapter 2 built 2026-09-15 —** 《兖州之鼎》 (`chapters/02-yan/`, opens
  2026-11-01, gate 2): the same shape as chapter 1, six scenes at four
  places of 兖 — the Pu with its fisherman who chose the mud (庄子), Puyang
  and its market inside the Mulberry Gate, 雷泽 where 雷神 (龙身人头，鼓其腹)
  beats a drum it cannot stop because the cauldron woke beneath it (fight
  it, its root wood; answer its riddle 雨落田上 = 雷; or yield the shore as
  舜's lake-folk did), the deeps with the 河图 seal (三八 belong in the east),
  the cauldron where the peak of 筑基 forms the Core and Yinyue's second
  memory surfaces (the hand had a cauldron's pattern and counted to nine),
  the end pointing east to 青. `places/yan.json` (nine, 濮水 the start; the
  road in is from 邺城), `seeds/yan.json` (twenty), 雷神 and 蠪侄 (1597
  plates since 09-16), two riddles, 固基丹 and 桑皮纸 sold in 兖. Chapter 1's closing
  thread now names chapter 2 and its day.

- **Chapter 3 built 2026-09-16 —** 《青州之鼎》 (`chapters/03-qing/`, gate 3,
  no lock while building): the same shape, six scenes at four places of 青
  — the Wei with 太公's straight hook, 临淄 and the 稷下 argument with the
  market inside the Ji Gate, 蓬莱 where the city on the sea is the light of
  夔 (《大荒东经》: ox-shaped, hornless, one-legged, light like sun and moon,
  voice like thunder) calling for the 夔 it thinks answers it (fight it, root
  water; its riddle 一日一月 = 明; or 孔子's word 夔一而足), the deeps under
  流波山 with the 八卦 seal (伏羲's chart: 离 in the east), the cauldron
  where the peak of 结丹 forms the 元婴 (paid double into the new tier) and
  Yinyue's third memory (salt water — this sea; *等九鼎聚齐*; a name not
  hers), the end pointing south to 徐 where the player woke. `places/qing.json`
  (nine, 潍水 the start; the road in is from 凫丽 — 徐's since 2026-09-17, when the places were set to the 禹贡: 大野泽, 凫丽 and 空桑 to 徐, 定陶 to 豫, closed until its chapter), `seeds/qing.json` (twenty),
  夔 and 狪狪 from the 1597 蔣應鎬 plates (卷十四 p. 211, 卷四 p. 91; FLUX
  drew 夔 horned and four-legged four times — his ruling: 山海经 creatures
  are found, not drawn), two riddles, 齐盐 and 齐纨 (a wear for Yinyue)
  sold in 青.

### Made scenes — the template, and Ling as the maker

**Decided 2026-09-14** ("let's build a template, a predefined scene as an
example; the user doesn't need to build before starting a game; tell Ling
to build the same scene as the template when the user wants a new one").
The world is open to the player's own scenes, and the rule that makes it
safe is the one the whole game runs on: **the model proposes, the rules
decide — extended to authoring.** Ling writes content in the same shape the
authored content has; the same lint checks it; the same rules play it.

- **The template** is a whole worked scene, `worlds/<id>/templates/made-scene.json`
  — the Huai ferry: a place, a setup, Yinyue's line, three exits (one that
  stays, one that needs the lingzhi, one that ends) — with `_rules` beside
  it. `Make` with nothing returns it; Ling reads it only when making.
- **`Make {scene}`** checks the scene as authored content is checked
  (`lintMade`: the scene lint against the player's other made scenes as its
  chapter) plus what a made scene may not do: grants only from the `branch`
  table, no `set` / `value` / `key` / `game` / `offers`, one to four exits,
  three buttons, `ends` only `"made"`, under 3 KB, ten scenes a player.
  `not-playable` carries the problems; Ling fixes and tries again. Costs
  灵气 (`make` 5).
- **`Enter {scene}` / `Leave`** — the player steps into a made scene; the
  spine keeps its place (`state.made.at` overrides `sceneOf`; `state.scene`
  never moves); an exit that `ends: "made"` comes home, and so does walking
  away (decided 2026-09-15, his "yes, go"): a Move that goes leaves the made
  scene and says `left`; Enter brings it back where the player stands. In
  a corridor Move still waits, made scene or not. Steps cost 灵气 as
  anywhere; grants pay through the same capped tables.
- **Made scenes live in the save** (`state.made.scenes`), so they sync and
  play on any device; a few at a time. The player changes one not yet
  entered by asking — Ling Makes it again with the same id.
- **Themes** — a 山海经 hunt, a 易经 reading, a 三国 council, a 黄帝内经
  diagnosis — are what Ling writes into that shape from the heritage;
  later, *packs* (a source, its terms, a key set, its cards) give each theme
  authored bones. A living author's novel is never a theme.
- **Not yet:** made scenes with a board or a riddle of their own; sharing a
  made scene with another player; packs.

### 降妖 — fighting a creature

> **Superseded 2026-09-17 by `## 斗法`** — the five-round 五行 bout became a
> turn-by-turn fight. What still holds: the exit, the witness rule, one try a
> day, the grant, and a loss costing nothing.

**Decided 2026-09-14.** Fighting a creature is a game the scene runs, like
the alchemy board: no model, no 灵气, no fighting numbers. Words: **斗法** is
cultivator against cultivator (the table, *duel*); **降妖** is against a
creature (*subdue*). A creature is not an NPC — NPCs are people Ling voices;
creatures are their own class, with a card. 妖兽 is the hostile stance, 灵兽
the tameable one; the same card can offer both (夫诸: feed it, or fight it).

- **The 五行 duel.** Every creature carries a root in `creatures.json`
  (`root: "water"` — the lint requires it). A bout is best of three won
  rounds, at most five: each round the player picks one of their roots; the
  creature's move is drawn by the rules, seeded by the day and the round,
  leaning to its own root. 相克 wins the round (木克土 · 土克水 · 水克火 ·
  火克金 · 金克木); the reverse loses it; anything else is a draw and counts
  for no one. Deterministic for the day: retrying the same picks gives the
  same bout.
- **On the scene:** a `duel` card — the creature, its root shown, the
  player's roots as buttons, the rounds as they fall. On the phone the same
  card inline. The page runs it, as it runs the board.
- **The exit:** `game: { kind: "duel", creature: "fuzhu" }` on an exit that
  `stay`s. The page records the outcome with `rules.mjs win --id` or
  `rules.mjs lost --id` and tells Ling `[scene] won <id>` / `[scene] lost
  <id>` — the same witness rule as the board; no Ling tool can claim a
  fight. Ling narrates from the result and never rolls a round itself.
- **A loss is free, and the creature withdraws until tomorrow** — one
  attempt per creature per day (`state.duels[creature] = {day, outcome}`);
  the exit refuses a second try with its own line (*夫诸隐入雾中，明日再来*).
  "I want to fight it again" tomorrow maps to the same exit.
- **A win pays once,** from the exit's `grant` — 修为, 灵石, a catalog `drop`,
  sometimes the creature itself; a fight after a win is practice and pays
  nothing. Losing never costs 灵石 or 修为.
- **The 夫诸 `duel` exit becomes `subdue`** with this game when it is built;
  its 象棋 endgame stays a later, harder form of the same exit type.
- **Built (step 13).** `scripts/duel.js` is the bout, pure and shared by
  the page and the rules (`scripts/package.json` makes the folder ES
  modules): `BEATS`, `creatureMoves(root, seed)` (five for the day, the
  creature's own root six times in ten, seeded by day · creature · 道号),
  `roundOf`, `bout(picks, moves)` — best of three in five, a draw for no one,
  five rounds settle by the tally. `creatures.json` carries `root` (夫诸:
  water; the lint requires one the traits know). An exit's `game` is an
  object `{id, kind: duel | board, creature}` (`gameOf` reads a bare string
  as a board); a duel exit carries its `withdrawn` line. **Two calls, both
  the rules':** `duel --id` *starts* — refuses `withdrawn` today, charges
  the bout's 灵气 (10), opens `state.duels[creature] = {day, outcome: open}`
  and returns the creature's `moves`; `duel --id --picks=wood,fire,…`
  *settles* — the rules replay the bout with the same moves and record
  `won` (into `wins`, for Resolve) or `lost` (the creature withdraws:
  Resolve and a new start refuse `withdrawn` until tomorrow; a loss costs
  nothing more). There is no `lost` verb to claim: the page relays picks,
  the rules decide. Refusals: `not-here`, `no-traits`, `no-stamina`,
  `not-started`, `not-your-root`, `unfinished`. Look's exit brief carries
  `game`, `won`, `withdrawn` and `duel` (the creature with its root, the
  player's roots, today's bout). The scene draws every duel exit as a card
  (`duel-card.js`): begin → the roots as buttons → the rounds as they fall →
  the outcome; then `[scene] won <id>` / `[scene] lost <id>` to Ling, as a
  board's win goes. 夫诸's `duel` exit is now `subdue` (降妖 · 五行).

## Player state

`state.json`:

```json
{ "version": 2, "lang": "zh", "name": "青玄",
  "traits": ["wood", "water", "fire", "earth"],
  "tier": "qi", "step": 0, "progress": 70, "wealth": 10,
  "bag": {}, "cast": ["fuzhu"],
  "chapter": "00-prologue", "scene": "00-north", "done_scenes": ["00-river", "…"], "ended": [],
  "tasks": { "alchemy-first": { "status": "done", "period": "once" } },
  "quests": { "shifu-scan": { "period": "2026-W37", "paid_at": "…" } },
  "branch": null,
  "story": "青玄在泗水边醒来……",
  "stamina": 60, "stamina_at": "2026-09-11T12:00:00-03:00",
  "day": { "key": "2026-09-11", "progress": 70, "wealth": 10, "branches": 0 } }
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
| `Branch {action: open \| turn \| close, kind, xw, ls}` | Opens a 奇遇, counts its turns, pays within the branch cap on close. The engine's `LINGGEN_USER_TURNS` counts the player's messages: the tale's turns are those sent since it opened, whatever Ling reported; without the count, the player's words count (the same words twice are one turn). | `branch-open`, `branch-cap`, `no-branch` |
| `Summarize {text}` | Replaces the story. | `too-long` |
| `duel --id [--picks]` (the page's) | Starts a bout (stamina, the creature's moves) or settles it from the picks; records the win or the withdrawal. | `not-here`, `withdrawn`, `no-traits`, `not-started`, `not-your-root`, `unfinished` |
| `Move {place}` | Goes to a place by road; a province still answers. | `corridor`, `no-road` (with `near`, `toward`), `too-hard` (with `fitting`), `unknown-place`, `road-closed` — each with `here` |
| `Trade {action: buy \| sell \| use, id}` | Buys or sells at a market at the catalog's price, a visit's 灵气 each; `use` pays a pill's progress within its table or puts a wear on. | `unknown-item`, `no-market`, `not-for-sale-here`, `no-stones`, `not-in-bag`, `key-in-use`, `not-usable` |
| `Lang {lang}` | Switches zh / en. | — |

| `Restart` (verb `init`) | Begins the world in play again; the save it replaces is logged. | `unknown-world` |
| `Go {scene}` | Straight to a scene of an opened chapter (a made scene goes through Enter); the chapter's earlier end is forgotten. | `not-open`, `unknown-scene` |
| `Undo` | Restores the state before the last change — Ling's on the player's word, the page's and the tests' otherwise. | `nothing-to-undo` |
| `Saves` · `Save {title}` · `Load {id}` · `Forget {id}` | The library (below). | `no-title`, `unknown-save`, `not-named` |

**Ling drives** (his ruling 2026-09-16: "ling can do restart, pick a scene,
go to map, all control of the game, change the world, load from storage,
like continue play yesterday"): every one of these is a rules verb, logged
so `undo` brings the game back, and the destructive ones — Restart, Load,
Forget, Undo — wait for one AskUser in the world's words. The map is
`Show {card: map}`; worlds are Worlds / Travel / Build.

**The library — `data/saves/<id>.json`** `{ id, kind, title, at, state }`:
`day` saves the rules keep by themselves — a new day's first move parks the
last play day's closing state under its date, two weeks kept — so
"continue from yesterday" is `Load 2026-09-15`; `named` saves on the
player's word (`n-<time>`); `world` saves parked by Travel (an older bare
parked state reads as one). Load of another world's save parks the game in
play first and lets that world's parked copy go. The library is local for
now; the cloud carries `state.json` alone (open: the library follows the
player too — `cloud.save` taking a folder).

`init --lang` starts a game, and `undo` restores the state before the last
change. **`win --id` is the
page's alone:** the scene is the only witness to a board or a duel, so it
records the win (a game an exit of this scene names, or an offered task), and
Resolve or `Practice done` pays it and consumes it. No Ling tool can pass a
win — the same rule as quests: done is the witness's record, never
self-reported. Look marks a recorded win `won: true`, so a fresh session sees
one the chat was never told of; the page tells the chat `[scene] won <id>`. Env: `LINGJING_DATA`,
`LINGJING_QUESTS`, `LINGJING_NOW`.

Data tool — `Show {card, …}` (no `cmd`): its args reach the page as a
`content_block` and render as a card — creature, board, map, hexagram,
root test, chapter gate, tribulation; `item` (a shelf or one thing) when the
catalog comes. Choices are not cards: they go through AskUser.

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
- **Yinyue on the stage (2026-09-15).** One device, one Yinyue: a device
  shows one 3D model of her, and that one carries her voice; the engine's
  presenter lock keeps it so. Devices are independent — a Mac and a phone
  each have their own Yinyue and may both speak at once. The scene loads the engine's own pet view (`/?pet=1`)
  with `stage=1`, and a stage outranks a pet corner, so she walks over from
  the desktop window or the web tab while a scene has her and goes back when
  it ends. The page never draws a second Yinyue; the moon stands in only
  until the view has loaded.
- **Not yet:** the 斗法 duel (the 夫诸 `duel` exit refuses until a board for it
  exists); 七巧板 and 华容道. The board is 4×4 — "pair the eight herbs" — not
  the 6×6 once planned.
- **Built (step 6):** SKILL.md declares `cloud: {save: data/state.json,
  meter: lingjing}` (linggen `cab317c`, skill-spec § Cloud). The page reads
  `GET /api/skill-cloud/lingjing` with every Look — `{signed_in, meter}`.
  Signed out: **the gate** — nothing of the game shown, one button; the
  daemon opens the browser (`POST /api/account/login`), the page polls
  `/api/account` and enters once signed in. On entering it calls
  `POST /api/skill-cloud/lingjing/sync` first, so a new machine reads the
  account's save before Look; a won board syncs again at once. The **丹田
  ring** in the status strip draws the reading as full / half / low / empty
  (a number never); no reading yet — signed in, site out of reach — draws a
  faint ring. **Empty** puts one line at the top of the scene — 丹田已空，先去
  调息。灵气回满于 HH:MM — and the boards stay. An engine without the route
  answers the web index page: the page treats non-JSON as "no cloud" and
  plays from the file, as before. *Superseded 2026-09-14 for the ring: 灵气
  is the rules' own stamina (§ 灵气), read from Look; the sign-in gate and the
  save sync stay as built.*
- **Built (step 7):** 灵气 as stamina. `rewards.json → qi` (max 100, full
  in 5 h, costs step 10 · branch 15 · duel 10 · shop 5, quest refill 20 by
  default); `state.qi` / `state.qi_at`, settled by the clock on every read
  (`settleQi`, whole points, remainder kept; a save from before wakes full);
  Resolve charges a moving exit after every other check, Branch open charges
  its cost, a refused action is `no-qi` with `say` (the hour it returns) and
  `returns_at`; Practice `check` refills the app's own `qi` (Health's workout
  30, Shifu's scan 20) else the default, capped, reported as `qi`. Look carries
  `qi: {now, max, step, empty, returns_at}`; the ring and the empty card draw
  from it; SKILL.md dropped `cloud.meter`. 44 tests.
- **Built (step 8):** the seeds. `worlds/<id>/seeds/xu.json` — forty for 徐,
  thirty province tales and ten night tales, each one line zh/en with its
  `source` (禹贡, 史记, 论语, 山海经, 苏轼, the Liaozhai manner); only 夫诸
  names a creature, the rest describe by sight until their cards exist.
  `content.mjs` loads `seeds/*.json` by province and lints kind, province,
  creature and both languages. `Branch open` picks from the player's
  province and kind, unused first (`state.seeds_used`), by a hash of the day
  and the 道号 — the same day reopens the same seed — and returns `seed
  {id, line, source, creature}` plus `show` for a creature's card; the tale
  grows from it. SKILL.md tells Ling to begin from the line and, at the
  close, to say the source in a line. 45 tests.
- **Built (step 9):** made scenes — the template, `Make` (template when
  empty; else lint + keep, 灵气 5), `Enter`, `Leave`; `sceneOf` reads
  `state.made.at` first; a made exit's `next` moves within made scenes and
  `ends` comes home; `pick` falls back across languages so a scene in one
  language plays. SKILL.md: the three tools and "Making scenes". 46 tests.
- **Built (step 10a):** the dictionary. `worlds/<id>/dictionary.json` (ids → zh/en,
  provinces); `realms.json` → `ladder.json` (tiers, steps); `roots.json` →
  `traits.json`; `terms.json` gone. State keys are ids (save v2, `migrate`
  on read); rewards tables and day caps keyed `progress`/`wealth`;
  `rewards.stamina`; grants `progress`/`wealth`/`cast`; `set.traits`; the
  value field `name`; the `traits` card. Look: `tier {id, step, name}`,
  `progress`, `next`, `wealth`, `stamina {…}`, `traits`, `cast`, `name`,
  `words` (always, the player's language, plus `tiers` and `provinces`).
  Refusal `no-stamina`; its line uses `words.pool`. Branch close args
  `progress`/`wealth`; quests carry `stamina`. The page's labels come from
  `look.words`. SKILL.md speaks ids and `words`. 47 tests.
- **A reopened day shows the day so far.** Text Ling writes between tool
  calls is saved as it is written (linggen `b1fec94`); until then only a
  turn's final reply was, and a game day — one long turn of narration and
  AskUser — reopened as an empty chat.

**Phone — the chat is everything.** The phone's own chat (Flutter) draws the
same cards inline, shows choices as buttons that send `[choice scene:exit]`,
and runs the same `rules.mjs` contract. Later.

## The stage speaks — taps are words to Ling

- **Built (2026-09-16).** Seen live on gpt-5.6-terra: a Move, a Summarize,
  silence — the player stood at the Pu with no way on; the market showed
  Buy 260 and a chip named Puyang, and neither took a tap. Two fixes, one
  rule: **a tap is a word to Ling.** The page never trades, moves or pays
  by itself; a tap sends the player's own line into the chat (*Buy Mulberry
  paper*, *Go to Puyang*, *Tell me about: Temper the body*) and Ling calls
  Trade, Move or tells the practice, the rules deciding as ever. When Ling
  is waiting on a question, the line is its answer (the same path a board
  win takes). One tap at a time: the tapped thing dims until Ling's reply
  ends. Buy greys when the stones are short, Sell when none is held — from
  Look. Boards and bouts stay the page's own play, as before; a real-life
  quest never gets a Done button (its app is the only witness).
- **The choice is a law, and the rules build it.** SKILL.md said "nearly
  always one AskUser"; Terra read that as optional between scenes, where it
  had to assemble the options itself from `near`. Now Look's `director`
  carries `choice` — header (here), question (*何去何从？* / *What now?*),
  options in order: the thread's place first, the other roads, *在此逗留*
  when today's seed grows here, *问问银月* when fewer than two — and Ling
  offers it verbatim, exactly as it offers a scene's `buttons`. A tapped
  label is its `move`, `linger` or `ask`. Every reply ends with one AskUser;
  the one silence is AskUser back with no answer. Summarize once a turn.
- **Every bout is winnable.** A 木水火土 player before 雷神 (木) could only
  draw or lose: nothing but 金 overcomes 木. `creatureMoves(root, seed,
  roots)` now deals at least two moves the player's roots overcome, which
  rounds drawn by the same hash; the card tells the 相克 ring in a line
  and says two wins (the Chinese hint said three).

## 功法 — swords, talismans and learned arts (designed and built 2026-09-16)

> **Effects superseded 2026-09-17 by `## 斗法`** — the pieces are the same
> (a worn sword, a 符 written from paper, arts learned from a companion), but
> each does something in the fight now, not to a round. See 斗法's *What
> today's pieces become*.

His question after losing to 蠪侄 with no 金 root: "can user learn some
功法, 法术, or attack by sword?" Today a player has roots, the 五行 bout,
items with three effects (pill, wear, key) and the story; a sword in the
market does nothing. Three pieces, all inside the rules and the bout card —
no fighting numbers, the rules decide, heritage only. Ling narrates, the
page plays; every effect is deterministic and capped per bout.

1. **A weapon lends a root.** A weapon item gains `effect: {root: "metal"}`
   (铁剑 → 金, 竹剑 → 木; later blades by their metal or wood). Worn in a
   new `weapon` slot of `state.wear` (Trade `use` on a weapon wears it, as
   the bell is worn by Yinyue), the bout offers that root beside the
   player's own: `duelBrief.roots` gains `{id, name, from: "iron-sword"}`
   and the card draws it marked as the sword's. `duel --picks` accepts it
   while the weapon is worn. Nothing else changes: the ring, the moves, the
   day-hash. This makes every creature beatable by craft, and the market
   matter; it does not touch the root test.
2. **符 from 桑皮纸.** A new item `talisman` (符, kind `charm`, not sold —
   made). A `write` verb (Ling's *写符*) at a place with a 坊市 or an
   altar, or anywhere at 结丹 and above: one 桑皮纸 becomes one 符, costs
   `shop` stamina, one a day. In a bout the card shows a 符 button beside
   the roots when one is held; `duel --picks` takes `talisman` as a pick:
   that round is won outright, the 符 is spent, once per bout. The paper's
   own line already says it: 写符最好.
3. **功法 — learned arts, tier-gated.** A small catalog `worlds/<id>/arts.json`,
   from 道教 heritage, each one bout effect, one line of source, never a
   number: 五雷法 (a draw becomes a win, once per bout; 结丹+), 遁法 (one
   lost round is taken back, once; 筑基+), 借势 (one pick counts as the root
   it generates by 相生 — 木生火 火生土 土生金 金生水 水生木 — once; 练气+),
   later 御剑 (the worn sword's root may be picked twice in a row) and 符水
   (a 符 also refills 10 灵气). Learned, never bought: a scene exit
   `grant.art`, a 奇遇 close that offers one from the branch table, or a
   tamed creature teaching its own (夫诸 → 遁法, 雷神 → 五雷法). `state.arts`
   holds ids; Look's `arts` lists them with `about`; the bout card shows
   each learnable art as a button when its condition holds this round,
   greyed with its reason otherwise; `duel --picks` takes `art:<id>` tokens
   in the sequence, the rules replay and refuse `art-used`/`art-not-known`/
   `art-needs-tier`. The dictionary carries the words; made worlds may
   rename, never invent effects (the systems are fixed).

Build order: 1 with 2 first (they use items already sold — 铁剑 in 冀,
桑皮纸 in 兖), then 3 with five arts and one teacher creature per chapter.
Tests: a 木水火土 player beats a 金 creature with the 铁剑 worn; a 符 wins
its round and is spent; an art refuses out of tier and twice in a bout.
SKILL.md: Trade `use` on a weapon says it is worn; *写符* → Inscribe (renamed from Write 2026-09-17: the engine's file tool took the name); the
bout section names the 符 and the arts as the scene's buttons (Ling never
plays them). Open for his call: whether a worn sword also changes the
creature's lean (a 金 blade drawing 木 moves), and whether 斗法 at the
table uses the same arts.

**Built 2026-09-16, all three pieces, as the rules read them now.** One
truth for the page and the rules: `duel.js` takes the pick sequence and a
*kit* (own roots, the sword's root, the 符 held, the arts known with
`ready`) — `legal` says what may come next, `offers` lists it for the card,
`bout` replays and refuses by name. The sequence carries an element, the
符's id, or `art:<id>`; a pick after the decision is not played, not
refused. Rulings made while building, his to flip:
- **A breath between strokes.** The sword's root may not be picked two
  rounds running — otherwise 御剑 would mean nothing. With 御剑 it may.
- **遁法 takes a lost round back to a draw**, not a replay — a replay
  against a move already seen would be no contest. Played right after the
  loss, even the second: a decided bout that an art could still turn waits
  (`rescue`) for the player's word — the art, or *认了*.
- **借势 is played before the pick** it changes; 五雷法 and 遁法 after the
  round they change. 符水 and 御剑 are passive.
- **Teachers, one a chapter, so the arts are reachable in order:** 夫诸 →
  借势 (练气; joins in the prologue, so every player has one art), 狍鸮 →
  遁法 (筑基), 精卫 → 符水 (筑基), 雷神 → 五雷法 (结丹), 夔 → 御剑 (元婴). The
  design said 夫诸 → 遁法; swapped so the prologue companion teaches the
  练气 art. A creature teaches as it joins (`pay` with `cast`, Tame) — and
  a save from before today learns from its cast on the next Look. An exit
  may still `grant.art`; the 奇遇 offer is not built.
- **写符** needs a market (no altar exists in the places) or 结丹, one
  桑皮纸, a visit's stamina, one a day (`day.written`); the choice offers
  *写一道符* whenever it would be allowed. The 符 is a made thing: no
  price, sold nowhere, `made: {from, at, anywhere_from}`; Trade refuses to
  sell or "use" it. 符水 refills 10 灵气 when a 符 is cast (`CHARM_REFILL`).
- **The sword does not change the creature's lean** (the open call —
  moves still come from the player's own roots, so a bout is winnable
  without one). 斗法 at the table is not built.
- Cards: the item card says *佩之借金* and has a *佩戴* button (also for
  wears — the bell had none); the traits card lists the arts learned under
  the roots, greyed with the realm they wait for; the bout card draws the
  sword's root dashed, the 符 red with its count, the arts as buttons with
  a hint, each greyed with its why. 符 art painted by FLUX (640×480).
- Tests: 100 (six new: the sword and its breath, the 符, the five arts on
  the engine; the sword in the bout and the teaching in the rules; 写符
  end to end with 符水; the linter on arts and made things).

## 斗法 v3 — 一局卡牌，照《炉石传说》(designed 2026-09-18; building)

His direction, in order: *开放世界RPG都是一个套路…参考魔兽世界* · *AI驱动, 卡牌
策略, 动态故事, 聊天框版魔兽世界, 但世界是凡人的世界* · *战斗系统参考炉石传说* ·
*我们尽量严格遵守炉石传说的模式, 好处是多人对战会更公平, 老玩家和新玩家可以一起
对战* · *那我们跟炉石对齐*.

**世界的规矩，先于规则：没有"死"，只有"退"。** 妖退进雾里，随从退下阵前，银月
退到一边。全游戏不出现死字 (2026-09-18, his)。

### 牌型 — 炉石的形，我们的名（v1 砍到两种）

**v1 只有两种牌：随从与功法。** 他的判断是这套设计的起点：*现在的战斗不太好玩儿,
估计没人愿意玩下去, 这是我用炉石当战斗系统的原因* —— 老的斗法缺五样：每局都一样、
局内没有积累、没有真正的选择（闸能算出唯一最优解）、成长看不见、没有意外。手牌、
场面、灵力曲线、新牌即新动词、顶牌，恰好补上这五样。

| 炉石 | 我们 | v1 |
|---|---|---|
| 随从 | **灵兽 · 同道** | ✓ 攻/血、五行、两个关键词：**护主**（嘲讽）· **入阵**（战吼） |
| 法术 | **功法** | ✓ 一次性，有五行：伤害、群伤、回气血、抽牌、加成 |
| 英雄技能 | **主灵根一击** | ✓ 每回合一次，费 2 |
| 武器 | 法器 | ✗ 剑留在世界里当装备，只给英雄技能 +1；不进牌桌 |
| 亡语 | 遗蜕 | ✗ 交互爆炸的源头，v2 |
| 冲锋 | 疾行 | ✗ 爆发数学，v2 |
| 换牌 | — | ✗ 开局就让人做看不懂的决定 |
| — | 符/丹从背包带入 | ✗ 战斗与背包解耦，v2 |
| — | 相生减费（势） | ✗ 第一版只上相克 |

一句话讲得完规则：**每回合灵力多一点，出随从、放功法、用你那一行的法术，
克它的行打双倍，把它打退。**

**银月是一张随从**，3/4，入阵回 2 气血；开局在手，不占牌库；被打到 0 是退到一边，
下一局照来。全游戏没有"死"，只有"退"。

### 一局的数字（v1 — 闸调过一轮，2026-09-18）

气血 练气 20 · 筑基 26 · 结丹 32 · 元婴 40；**PvE 里妖是人的 0.7** ·
灵力起 1，每回合 +1，上限 6 / 8 / 10 / 10 ·
**主灵根一击 1 / 2 / 2 / 3**（费 2）—— 白给的东西要在同费法术之下 ·
**牌库 10 · 起手 3 · 每回合抽 1 · 阵前 4 位** ·
**妖十二张，抽空即力竭遁走**：不胜不败、不给奖励，所以要打赢才有赏 ·
反噬（自己抽空）掉 1、2、3… ·
**五行 ×1.5 / ×0.75**，灵兽互殴同样算 ·
单体伤害约 1.2 点/费，群伤约 0.7 点/费每个 —— 曲线按**克制翻倍之后**算。

**闸调出来的五件事**（每一件都是数据说的，不是手感）：

1. 妖 0.7 气血是对的，但**不能靠弱妖求快** —— 曾经把它设成 0.7 又让英雄技能过强，
   结果无脑乱丢牌也能赢 81%。
2. **英雄技能曾是全场最强的牌**（2 费 2–5 点、克制还翻倍，而同费法术只有 3 点），
   降到 1/2/2/3。
3. **"妖只有八张"要了它的命**：它在被打退之前先抽空，55–66% 的仗打成平局。十二张。
4. **让空牌库放它的血，等于让"什么都不做"能赢**（0%→11.7%）。改成遁走、不给赏。
5. **五行 ×2 太重**：带克它那一行的牌组赢 92.9%，带被克的只赢 18.3% —— 选行等于
   替玩家把仗打完了。收到 ×1.5/×0.75 之后是 90.5% / 54.8%。

**现在的成绩**：无脑路线 16% · 3% · 0%；会读场的 **75.9%**，一场 **12 个半回合**
（约六个你的回合）；**选对五行值 35.7 个百分点**；会搭牌只比随手抓高 4.2 点 ——
所以**构筑的价值在对位上，不在流派上**：你走到它的巢前，知道今天打谁。

**牌 52 张**，五行各有活法：金锐（攻高身薄）· 木众（铺场，靠数量与全体加成）·
水缓（挡、养、拖）· 火烈（一口气打穿）· 土厚（站得住）。

### 好玩这件事，能测的那一半我来守

三条不是引擎能给的，得靠内容：**每张牌要有不同的动词**（20 张都是"打 N 点"就是
换皮）· **每只妖要有性格**（它那 8 张牌就是它的人格）· **每局至少一个关键回合**。

能量化的部分进平衡闸，尤其这一条新指标 —— **决策熵**：会打的 AI 眼里，一回合排名
前三的选择胜率差多少。差 >20% = 无脑只有一条路；差 <3% = 怎么打都行，一样无聊；
**健康是多数回合落在 5–15%**。它能自动指出"这张牌让局面变呆板了"。

### 三种模式，一个内核，三组旋钮

炉石只有 1v1 天梯，PvE 与团战它没做（佣兵战纪是另起的一套）。我们不写三套代码。

| | **PvE 降妖** | **PvP 斗法** | **团战 妖王** |
|---|---|---|---|
| 目标局长 | **3–5 回合** | 5–8 | 8–12 |
| 境界 | **压制生效** | **拉平，无压制** | 压制生效 |
| 气血 | 妖 ≈ 人的 0.7 | 双方同数 | 妖王 = 人数 × 基数 |
| 牌库 | 你 10 · 妖 **12，抽空即力竭退走** | 各 10 | 各 12 |
| 先后手 | 你先手，多抽一张 | 战力定先手，后手补一张 | 按战力轮转 |

**境界压制（只在 PvE）**：高一境 你 ×1.5 / 它 ×0.7；高两境 ×2 / ×0.5；低一境反过来
—— 越级有风险也有彩头。**妖的 12 张硬上限**保证日常一场绝不拖成持久战 (2026-09-18, his 加；
八张是闸推翻的第一版 —— 它在被打退之前先抽空，一半以上的仗打成平局)。

**PvP 为什么不带境界**：公平只能来自同一条灵力曲线和同样十张牌。境界只决定你能带
哪些牌，而高境界的牌费用也高 —— 老玩家牌多 ≠ 必赢，这是他要的。

**团战**（炉石没有，照魔兽的铁三角）：一个妖王，各人自己的手牌与阵前；每轮末妖王
出手一次，打它最恨的人（仇恨 = 谁打得最狠）；于是有**引仇 · 援手 · 伤害**三种活法；
妖王过半血换一副牌；队友之间可递符递丹。

### 斗法在主界面里 — 以及 Ling 在这一段该闭嘴 (2026-09-18)

他看过卡面之后定的：**斗法就画在主界面的场景位上**（左边的聊天留着，人可以边打边说），
而不是另开一个页面。这不是布局选择，是规矩选择 —— 一旦聊天和战斗同框，就必须说清楚
谁在推进游戏：

- **一场仗开着的时候，Ling 不推进任何东西。** 不 Resolve、不 Move、不开场景、不结算、
  不给赏。她可以答话、可以讲这只妖的来历、可以解释牌面 —— 但世界在这一段是停的。
  *他的话：「ling需要知道战斗中, 不推游戏走下一步, 不然就乱了」*
- **知道的方式是存档，不是消息**：`state.fight = { id, creature, at }` 开局写入、
  结束清掉，Look 的简报里带 `fight: { open: true, … }`。一条隐藏消息会丢，存档不会。
- **场景仍是唯一的见证人**：胜负由页面判定，照旧报 `[scene] won <id>` / `lost`；
  Ling 收到之后才重新动起来（说那句 beat、结算、给赏）。
- 力竭遁走是第三种结局：`[scene] withdrew <id>` —— 不胜不败，不给赏。

**牌面**：每张牌有图。山海经的七只妖用古本原图（他 2026-09-16 的规矩：那些让模型画
不如去找），其余四十五张由本地 FLUX 画在宣纸上，`worlds/<id>/art/cards/<id>.webp`。
图在牌上是背景，不能把规则的字挤下去 —— 牌很小，图把字挤掉就等于让人输掉这一局。

### 问题归聊天，台上不重复 (2026-09-18)

同一个去处同时出现在场景卡和聊天的 AskUser 里 —— 一个动作两个可点的地方，违反
2026-09-17 那条法。**聊天拥有问题**，所以：**AskUser 开着的时候，台上收起每一个
与它答案同名的按钮**（濮水的「郱城」在 AskUser 里就不再出现在卡上），而跟问题无关的
东西照旧 —— 说说、起一卦、卡片自己的动作。Ling 说下一句话时，台上的按钮自己回来。

### 副本契约 — 战斗与每个小游戏共用

1. **入口**在世界里：妖的巢、一个任务、一段奇遇。
2. **进门**扣几点体力，**锁定一份出战配置**（境界、牌库、装备、灵兽、今日卦、银月）；
   锁定之后世界里发生什么都不改这一局 —— 可重放、可判定、可对战的前提。
3. **门内**独立 UI（整屏，聊天收起），世界时间不流动。
4. **出门**结算，写回存档，回世界 UI，Ling 说一句。
5. **中途退出 = 认输**：体力照扣，奖励没有。

**带进门的只有六样**：境界+主灵根 · 牌库 12 · 装备 · 灵兽 · 今日卦 · 银月。
**留在门外**：体力（进门时扣）· 灵石 · 修为 · 背包杂物 · 故事进度。
**文戏（灯谜、飞花令、下棋、起卦）什么都不带** —— 只带这个人和他的语言，
所以新玩家能赢老玩家。武戏带属性，文戏不带 (2026-09-18)。

### 体力，唯一的节流阀 (BUILT 2026-09-18)

倒计时给人压力，体力不给 (his)。丹田显示**状态与点数**（充盈 62/100），不是时钟 ——
一个能拿来盘算"今天还打不打得起一场"的数字。

- **一场斗法 10 点**，一步故事 10、一段奇遇 15、逛坊市 5；满 100，按钟点回（五小时回满）。
- **次数不限**：一天能打好几只妖，只要体力够。但**同一只妖一天只应一次** —— 它退进雾里。
- **现实里的事回体力**：一件任务按它自己的分量回（默认 20）—— Shifu 扫盘、Health 走够步数。
  这是别的游戏抄不走的钩子。
- **收益本来就有日上限**（修为 240 · 灵石 60），所以放开次数不会失控。
- 空了只说一句"什么时候回来"，不滚秒。

### 牌库：一副牌，不是一把牌 (BUILT 2026-09-18)

`deckFor` 按**费用曲线**发十张，而不是从你那几行里随手抓 —— 闸量过，会搭的牌组
赢 84%，随手抓的赢 47%。曲线**随境界弯**：练气上限六点灵力、一场约六回合，
五费牌在那里就是永远打不出来的牌（第一版照炉石十回合的曲线发，反而把赢的仗打输了）。

练气 `1 1 1 2 2 2 3 3 4 4` · 筑基 `1 1 2 2 2 3 3 4 4 5` ·
结丹 `1 2 2 2 3 3 4 4 5 5` · 元婴 `1 2 2 3 3 4 4 5 5 6`。

同一个人永远拿到同一副（洗法由道号定），无金根则一张金牌也进不来。

**妖的牌组也是内容**：闸发现精卫自带三张抽牌，五回合就把自己抽空、力竭遁走 ——
一场本该赢的仗成了平局。它的抽牌减到两张。性格可以强，但不能强到自尽。

### Build order

① 内核 `battle.js` + PvE 旋钮 + 平衡闸（纯规则，先不动现有的降妖）·
② 战斗 UI（整屏，聊天收起，wireframe 已画）· ③ 牌的内容与起手牌组 ·
④ 体力改造 · ⑤ PvP 旋钮（桌上的斗法）· ⑥ 团战。

## 斗法 v2 — 灵力、法器与本命法宝 (designed 2026-09-17; BUILT 2026-09-17; SUPERSEDED 2026-09-18 by 斗法 v3)

**Why.** His question on the 五行 bout: *如果是金妖，用户一直出火就能赢，对吗？*
— yes: run over 5,000 days, always countering the creature's root wins 92%
(木 creatures 35% — no 金 without the 铁剑); *is it a kind of rolling game?* —
yes, the moves are hidden and fixed for the day, so the only decision is the
counter. His direction: *结丹修身可以炼化本命武器，然后用物品强化攻击，也可以穿
装备获得防御。可以设计五行法力攻击，物理攻击等* · *learn from 凡人's fighting
system, arm system* · **所有攻击都消耗灵力。生命值耗尽，或者灵力耗尽，战斗失败。**
This replaces the rounds of `### 降妖` above and the bout effects of `## 功法`
once built; the exit, the witness rule, one try a day and the grant stay.

**What we take from 凡人修仙传 — its mechanics, never its names.** A fight
is a contest of 法力: every 法器 and 法术 draws on it, and running dry loses.
Arms climb with the realm — 法器 for 练气 and 筑基, the 本命法宝 refined at
结丹 and grown by 温养 and materials, 灵宝 later. 护体灵光 takes a blow
before the body. 符箓 are the one-shot anyone can carry; pills restore
mid-fight; 妖兽 come by 阶 and drop 妖丹 and 材料 that make better arms. Our
names stay our heritage's: no person, treasure, beast or art from the novel.

### The fight

His rules, in his words: **所有攻击都消耗灵力。生命值耗尽，或者灵力耗尽，战斗失败。**
· **fight is round by round, stronger side first; each creature has a level
the same as the player; on the player's turn: 法术, 物理攻击, 符箓, or 辅助
(增强进攻或者防守); the creature has 灵力, 生命值 too.**

- **Turns.** Round by round, one side then the other. The side with the higher
  **战力** moves first for the whole fight; a tie goes to the player. 战力 is one
  number on the card — realm step, weapon 攻, 法衣 防, 法术 — so arms and gear
  can buy the first move.
- **An even match by birth.** Every creature fights at the player's own level
  (realm and step): its 气血, 灵力, 攻, 防 and 法术 come from the same realm
  table as the player's, then its **lean** shapes them — *thick-hided* (防 and
  气血 up, 法术 down), *warded* (抗 up), *quick* (战力 up, 攻 down), *fierce*
  (攻 up, 防 down). What wins is what the player brings and how they read it:
  the weapon and the 本命法宝, gear, arts, the 符 held, the day's cast.
- **Both sides: 气血 and 灵力.** Every attack spends 灵力 — the creature's too.
  A side at 0 气血 or 0 灵力 loses. 灵力 is the fight's own pool, full at the
  start (not 灵气, which stays the day's pace). There is no free rest.
- **The player's turn — one of four:**

| choice | 灵力 | effect |
|---|---|---|
| **法术** · one of their roots | 4 | 法术 × 相克 (×2 if it overcomes the creature's root, ×½ if overcome) − 抗 of that element (at least 1) |
| **物理攻击** — the worn weapon | 2 | 器攻 − 防 (at least 1); no 五行 |
| **符箓** — a 符 held | 0 | 12, ignores 防 and 抗; spent; once a fight |
| **辅助** — 聚势 or 护体 | 1 | 聚势: the next attack ×1.5 · 护体: the next blow taken is halved |

- **The creature's turn** comes from its **pattern** in `creatures.json`
  (cycled, the start drawn by day · creature · 道号): 击 (物理), 法术 of its
  root, 蓄 (its next attack doubled), 护体, 甲 (its 防 up for a round). Its
  stance stays on the card after its turn — *蓄势*, *护体* — so the player reads
  it before choosing: 护体 against a gathered blow, 法术 against 甲, 物理 when it
  is warded. It spends 灵力 as the player does, and can run dry and lose.
- A blow landing: 护体 halves first, then 防 (物理) or 抗 (法术 of that element).

**Numbers — as the gate settled them (`duel.js`, never shown as formulas):**

| realm | 气血 | 灵力 | 法术 | 攻 | 防 (a creature's hide) |
|---|---|---|---|---|---|
| 练气 | 22 | 22 | 4 | 3 | 3 |
| 筑基 | 32 | 32 | 6 | 4 | 4 |
| 结丹 | 46 | 46 | 8 | 6 | 6 |
| 元婴 | 62 | 62 | 11 | 8 | 8 |

A step within a realm adds 2 气血 and 2 灵力. A creature's lean moves its
numbers by about a quarter: 厚皮 (气血 ×1.25, 防 +1, 法术 ×0.75) · 避法
(抗 = half its 法术, against every element) · 迅捷 (战力 ×1.25, 攻 ×0.75) ·
凶猛 (攻 ×1.25, 防 −1).

**What the gate changed, and why** (each was a hole it found, not a taste):

- **A 法术 costs its own 法术** — 4 at 练气, 11 at 元婴; a strike half that, a
  辅助 a quarter. With flat costs, 法术 outgrew the pool and rote casting won
  48–85% at 结丹 and up. Costing what it is worth gives *one* economy at every
  realm: a 法术 into nothing is 灵力 for 气血 one for one, into what it
  overcomes it is two for one, and a pool is one fight long.
- **灵力 = 气血 at every realm**, so that economy breaks even. (Design had the
  pool below the body; that made 练气 exact and every realm after it loose.)
- **A creature's pool is twice the table.** His rule — 灵力 out and you lose —
  made *turtling* a winning line: 护体 costs 1, the creature's turns average
  more, so a player who never attacked won ~100%. A beast's breath is longer;
  now waiting one out loses.
- **A 符 is 法术 ×3** (12 at 练气, as designed) so it stays a great blow at 元婴
  instead of a rounding error. 符水 gives back 法术 ×1.5 in 灵力 — inside the
  fight, not as the day's 灵气 (it used to refill 灵气 10; that is gone).
- **聚势 and 护体 are held, not stacked** — you cannot raise a guard that is
  already up. Without this, a cheap stance could be spammed forever.
- **借势 rides the cast** instead of costing its own turn: one turn, one blow,
  a breath more 灵力 — and it is *not* once a fight. This is the whole answer
  to being born without a creature's counter: as its own turn it halved the
  player's damage *rate*, and every such birth lost every fight. 五雷法 and
  御剑 stay once a fight.
- **防 and 抗 never negate** — a blow always lands at least 1 — but they do not
  cap either; a half-floor made 物理 dominant (rote striking 84%).

**Where it stands after tuning** (`node tools/duel-sim.mjs`, every creature ×
every root set × 5 steps × 5 days, at all four realms): every rote line under
30% · the attentive line 82–99% armed, 80% bare · 灵力 alone decides under 18%
· no creature is unbeatable for any birth once 借势 is known. A player who
never learned 借势 and carries no 符 cannot beat a creature they lack the
counter for — 借势 is the prologue companion's own art, so that is the
prologue's job, not a hole.

**The gate (a build test by simulation, like today's):** for every creature
at the player's level, any single choice repeated wins under 30%; an
attentive line (护体 against 蓄, 法术 into 甲, 物理 into wards, the counter
root otherwise, 聚势 before the finishing blow) wins over 75%; a player with
only their four roots and a starting weapon can win against every creature,
木 ones included; neither side can win by making the other spend 灵力 alone.

### Arms — 法器, 本命法宝, gear

- **法器 (练气, 筑基).** `kind: weapon` items gain `攻` (竹剑 2, 铁剑 3); worn in
  `wear.weapon` as today. A weapon's `root` still lends that element: 施法 with
  it at 法术 − 2 (借器施法) — how a 木水火土 player reaches 金.
- **Gear.** `kind: robe` 法衣 (`防`, worn in `wear.robe`; 蓑衣 becomes 防 1) and
  `kind: pendant` 佩 (`抗: {element: n}`, `wear.pendant`). The player's slots;
  Yinyue's wear (铃, 齐纨) stays hers.
- **本命法宝 (结丹 and up).** *炼化本命*: once, at 结丹 — the worn weapon and one
  core material become the player's bound treasure (`state.treasure = {name,
  base, element, level, exp}`). The material sets its element: 精金 金 · 雷击木 木
  · 寒玉 水 · 火精 火 · **息壤** 土 (the 山海经's own: 鲧窃帝之息壤以堙洪水). The
  player names it, as the 道号 is named. It is the weapon from then on:
  **物理攻击** hits with 器攻 = base + level, and the **法术** of its element gains
  + level (the treasure amplifies its own element).
- **温养** — once a day, a tray task *温养本命* (no model, a tap): +1 exp.
  **强化** — Trade `use` a material on it: 妖丹 by 阶 (+3 / +6 / +10 exp), the
  core materials (+5). Level 1–9 (一重 … 九重), each needing more exp. A
  treasure is never lost; 反噬 is his later call.
- **Drops.** Every win drops the creature's 妖丹 (一阶/二阶/三阶); `drops` in
  `creatures.json` adds a material (蠪侄 → 精金). 妖丹 sells at a 坊市 or feeds
  the treasure; the 结丹 markets sell the core materials — 灵石 and fights now
  feed arms.

### What today's pieces become

- **Roots** — which 施法 the player can cast; the root test finally matters.
- **符** — 12, ignores 防/抗, once a fight (was: a round won).
- **Arts** join the four choices: 借势 — a 辅助: the next 法术 counts as the
  element its root generates · 五雷法 — a 法术: 木 at double 法术, ignores 抗,
  6 灵力, once · 御剑 — 物理攻击 strikes twice for its cost · 遁法 — passive: a
  blow that would end the fight leaves 1 气血, once · 符水 — passive: a 符箓
  also gives +6 灵力. Teachers unchanged.
- **The day's cast (问斗法)** — 吉: its root's 施法 +2 法术 (大吉 +4); 凶: −2 (大凶 −4).
- **命格 日主** — once a fight, a blow of that element taken is halved.

### The card, the rules, Ling

- **Card:** both sides' 气血 and 灵力 bars, 战力 and who moves first, the
  creature's stance above its picture; on the player's turn the four choices as
  buttons (法术 with a root each and a borrowed one · 物理攻击 · 符箓 · 辅助,
  and the arts under them), each greyed with its why (not enough 灵力, none
  held, used); the turns as a short log (*法术·火 → 16* / *蠪侄 蓄势* /
  *蠪侄 重击 → 护体减半，受 7*). Phone: the same card inline.
- **Rules:** `duel.js` stays pure and shared — `fight(actions, creature, kit)`
  replays and refuses by name; `duel --picks` carries the player's choices (`cast:fire`, `strike`,
  `talisman`, `assist:focus`, `assist:guard`, `art:<id>`); the creature's turns
  are the rules' own. Look's duel brief
  adds both sides' numbers and the next intent. No engine change.
- **Ling** narrates the outcome and the finishing blow from the result, in
  the world, never a formula; the fight itself is played on the card.

**Build order:** ~~(1) the fight~~ **BUILT** — `fight()` in `duel.js`, the realm
table, leans and patterns for the seven, the card (both pools, the stance, the
turns, the four choices), the gate as `tools/duel-sim.mjs` and
`tests/duel.test.mjs`; the arts, 符, cast and 日主 as modifiers. ~~(2) Gear~~
**BUILT** — 攻 on 竹剑 2 and 铁剑 3, 防 1 on the 蓑衣, `kind: robe` and
`kind: pendant` with `wear.robe` / `wear.pendant`, and the lint that keeps arms
to one number each. **No 佩 is in the catalog yet** — the kind, the slot and 抗
all work — **and 玉珏 now fills it** (抗 土 2, sold at 徐). ~~(3) The 本命法宝~~
**BUILT** — `refine` (once, past 结丹: the worn weapon + one 天材地宝, and the
player names it, as they name their 道号), `nourish` (温养, the card's own tap,
once a day, +1), 强化 through Trade `use` (妖丹 一阶 +3 · 二阶 +6 · 三阶 +10 ·
a 天材地宝 +5), nine 重 at 10 + 5×(n−1) each, the treasure as the weapon in
`duel.js` (器攻 = base + 重, and its own element's 法术 + 重), drops on every
win (the 妖丹 of the realm met at, plus what the creature carries: 蠪侄 精金 ·
雷神 雷击木 · 夔 寒玉 · 精卫 火精 · 狪狪 息壤), the `treasure` card, and the five
天材地宝 on the later shelves. Nine plates painted by the local FLUX on
2026-09-17.

**战力 counts** the realm and step, the weapon's 攻, the 法衣's 防 and the
法术 — a 迅捷 creature adds a quarter. **Still his calls:** the numbers above,
now that the gate holds them; 反噬 (a treasure is never lost today); whether a
tamed creature fights beside the player later; whether 御剑 should be once a
fight (it is) or a standing way of striking; and whether 温养 belongs on the
tray beside the day's practice rather than only on the treasure's card.

## 银月 joins at 结丹 (designed and built 2026-09-17)

**His rulings:** *Yinyue should be in the game after user 结丹, give user a
task to get Yinyue. before that, don't show Yinyue.* Where the task lives —
**anywhere at 结丹**, not tied to a chapter. Her early lines — **Ling's
narration**. The task — **the bell, the water, her riddle**.

**Before she joins, the game never shows her.** No model on the stage (the
moon stays as scenery), no voice (the stage speaks no cheer and no cast
reading), no *问问银月* (the filler is *看看四周*, and a second word to Ling
when two are needed), no gifts she wears (Trade `use` on a `wear: yinyue`
item refuses `no-companion`). Ling narrates the cast, the hints and the wins.
SKILL.md's Yinyue rules (her glad line, her riddle rule, her reading of the
cast) apply only when Look's `companion.yinyue` is there. Linggen's own
Yinyue outside the game is untouched.

**Content.** Chapters 00–02 (her 32 lines): each becomes narration (`who:
ling`) — *是夫诸……它出现的地方会发大水。小心。* → *雾里立着夫诸，传说它一出现，
便有大水。* Her memory thread (the hand that laid her in the water, the nine
counted, the salt sea) is held back and told after she joins. From chapter 03
on, a line of hers carries `alone`: the narration for a player who has not
freed her yet; the rules pick one. The story already told in a save stays as
told.

**The quest — 月下之约, anywhere, the moment the tier becomes 结丹:**
1. **The call.** On the breakthrough into 结丹 (or the next Look of a save
   already there) the rules open `state.story_quests.yinyue = {step: "bell"}`.
   Ling tells it in the world: the new 丹 hums at night, and far off a wolf
   answers the moon. The tray shows the quest card with its one next step.
2. **The bell.** Hold 银月铃 (*系在银月颈上*). While the quest waits, every 坊市
   sells it, not only 邺城's — the player may be anywhere.
3. **The water.** At any place tagged `water` in `places/<p>.json` (漳水 ·
   漳渊 · 濮水 · 雷泽 · 潍水 · 蓬莱 · 流波山 · 成山头 · 泗水 · 淮水 · 泗口 ·
   吕梁洪 · 沛泽 · 微山湖 · 大野泽), the choice offers *摇一摇铃* — the `ring`
   verb: the moon on the water breaks and closes, and a figure stands where
   it closes. Not a wolf and no clan: she carries the name and nothing else
   (his standing rule).
4. **Her riddle.** One of a small pool `yinyue` in `riddles/` (the moon, a wolf,
   a bell, water), with `choices` and a hint, the same rules as every riddle:
   a miss brings the hint, a second shuts it until tomorrow. Answered, she
   joins: `state.companion.yinyue = {joined: <day>}`, the bell is worn by her
   (`wear.yinyue`), and her first line is her name. From then the stage loads
   her model, her voice is on, and her memory thread begins.

**Rules and page.** `companionOf(state)`; Look carries `companion` and
`story_quests` (step, where, what it needs); the `ring` verb (refuses
`not-water`, `no-bell`, `not-yet`) returns the riddle as `ask`, answered by
`ring --answer`; the fillers and Trade read `companion`; lines pick `alone`.
The page draws Yinyue on the stage and speaks her line only with
`companion.yinyue`; the tray shows the quest card. No engine change.

**Saves:** a save already at 结丹 without her (his) gets the call on its
next Look.

**Built 2026-09-17, all three pieces.** The world declares her in
`world.json` → `companion` (id, the realm `from`, the `bell`, her `riddles`,
the `call` / `water` / `meet` lines, the `join` beat, the `grant`); a world
without that block has no companion. `state.companion` is absent before the
call, `{}` while she is searched for, `{joined}` after — `wake` opens it at
the realm. The prologue's silver light in the river is now the bell itself
(00-river's `reach` grants it), so the player has carried it all along; a
sold one is on every 坊市 shelf while the search is open. `ring` refuses
`not-water`, `no-bell`, `not-yet`, asks her riddle from the pool (a miss →
`hint`, a second → shut till tomorrow), and on the right answer joins her,
ties the bell at her neck (`wear.yinyue`) and pays the grant. Until then:
`spoken` turns her lines into narration (a line's own `alone`, or nothing),
the cast drops her, the filler is a second look instead of a word to her,
her gifts refuse with `no-companion`, the stage stands empty and speaks
none of her lines. Chapters 00–02 are rewritten as narration and her memory
thread starts when she joins; chapter 03's lines carry `alone`. 118 tests.

## At a creature's haunt — the world outside the spine

- **Built (2026-09-16).** His "it just lets the user move from a place to
  another; when a creature shows, can't fight or tame it?" — a creature at
  a place with no scene was a portrait. Now Look's `place.encounter`
  (`encounterOf`, only when no scene runs here) carries the creature, its
  bout (`game: haunt:<id>`, `duel` brief), `won`/`withdrawn` for today,
  `tamed`, and `likes` {item, held}. **降妖 at the haunt:** the `duel` verb
  accepts `haunt:<creature>` when the player stands there and it is not
  tamed; the same bout, same day-hash moves; a win is paid by the rules at
  once from the new `haunt` reward row (20 · 10) — no exit, so the page's
  `[scene] won haunt:x` means Look and say what was paid; `subdued-today`
  keeps it to once a day. **驯 by what it likes:** `creatures.json` gained
  `likes` (人参 for the man-eaters 狍鸮/蠪侄, 玉鱼 for 精卫, the bell for 雷神,
  齐盐 for 夔, 齐纨 for 狪狪, 灵芝 for 夫诸); the `tame` verb takes one from
  the bag, adds the creature to the cast, pays the haunt row; refusals
  `needs-item` (its line names the thing), `already-tamed`, `untameable`,
  `not-here`. The choice leads with `降妖 · X` and `喂X…` when they are open.
- **Every card has buttons.** His rule the same day: "all cards on the
  left should have buttons, at least an explain button". `acts()` in
  cards.js: every card ends with 说说 (a word to Ling about what it is:
  creature, omen, item, task, gate, tribulation, roots, board, map), plus
  its own: 喂它X on a creature at its haunt (greyed when not held), 走向下一鼎
  on an open gate, Buy · Sell · 服用 on an item, Make the pill on a board.
  Whole-card taps are gone; a button is the affordance.

## Pictures

A creature is never named without its picture — a player cannot know 夫诸
from its name.

- **One picture per creature,** `worlds/<id>/art/<id>.webp`, shipped in the
  skill. **His ruling 2026-09-16: a 山海经 creature is found, not drawn** —
  "those are hard for a llm" (夔 came out horned and four-legged four
  times; the 1597 plate is hornless on one leg). All seven creatures are
  the classical plates again (the five FLUX paintings of 09-15 replaced —
  雷神 and 蠪侄 from the 1597 edition, pages 200 and 94), laid on our paper
  by `tools/frame.py`; FLUX only for what no edition drew — items, made
  worlds. **Since 2026-09-15 the creatures are painted** by the local picture
  model ahead of time (his picks from candidate sheets: 夫诸, 狍鸮, 精卫;
  captions *Drawn in Lingjing*), the woodcuts below kept in `art/plates/` as
  the reference and in `CREDITS.md`; FLUX draws two antlers where the text
  says four, and no human face on 狍鸮. Before that: **Decided 2026-09-14 (his "fetch the three woodcuts"):** creatures
  are the classical woodcuts — public domain plates from the illustrated
  山海经 editions (胡文煥 Ming, 蔣應鎬 1597) and 《古今圖書集成·禽蟲典》
  (Qing, 1725), fetched once from Wikimedia Commons at authoring time and
  laid on our paper by `tools/frame.py` (crop, multiply onto a warm ground
  with grain, the red seal); `art/plates/` keeps the untouched originals;
  `art/CREDITS.md` and each creature's `art_source` carry the edition and
  the Commons file; `art_caption` {zh,en} names the edition in small type
  under the picture on the card. Nothing is fetched at play time. **Finding a
  plate by name, not by browsing (learned 2026-09-14):** the Qing
  encyclopaedia's animal volume is 535 named vector plates on Commons (one
  `allimages` query with the filename prefix lists them all); 胡文煥's book
  has a table of contents, so page = position; 蔣應鎬's 1597 edition puts
  its plates inside the text, so only the pages of the creature's 經 need
  rendering (Commons renders any PDF page as a thumbnail on demand). No one
  edition draws every creature, and editions disagree — 夫諸 is a goat in
  the encyclopaedia and a deer in 1597; pick per creature, prefer the
  reading the text describes. His ruling on the look: "not fancy, very old
  fashion, but fine for the first version". Items were drawn as SVG
  brushwork until 2026-09-15, when he judged them poor ("your svgs are poor,
  redraw them by flux"): items are painted by the local picture model too
  (`art/items/<id>.webp`, 640×480), authored ahead of time like the
  creatures — an image model at authoring time is the plan at thousands. Sizes:
  a woodcut lands at 40–150 KB; art beyond a few hundred pictures ships
  per chapter.
- **One style:** ink wash. Where a classical woodblock illustration of the
  creature exists — the Ming and Qing illustrated editions of the 山海经 are
  old enough to be public — it is the source; otherwise the picture is drawn
  to match.
- `creatures.json` carries `art` and `art_source` for every entry; the content
  lint refuses a creature without both.
- **Shown on both screens:** large in the scene's focus card on the Mac,
  inline in the creature card on the phone.

## 差事 — the task system, 照《魔兽世界》(designed 2026-09-18)

His ask, after walking four places with nothing to do: *should we let user take
tasks, use task to guide user, 参考魔兽世界的任务系统*. The pieces were all
here — a spine, 功课, 奇遇, a waypoint — and none of them was a thing the
player **takes**. That is the whole difference: WoW's log is a list the player
chose, each line with a counter, so there is never a moment of "what now".

**接 · 记 · 追 · 交** — accept, log, track, turn in. Everything below serves
that loop and nothing else.

### 一件差事 — data, never invention

`worlds/<id>/quests/<province>.json`. Ling writes the giver's WORDS; the terms
and the reward are authored (his law 2026-09-15: skills ship missions, the
engine runs them — she never generates one).

```json
{ "id": "xu-longzhi-hunt",
  "title": { "zh": "沛泽的蠪侄", "en": "The Longzhi of Pei" },
  "from": { "place": "pengcheng", "who": "market-elder" },
  "say": { "zh": "沛泽边上有三只蠪侄，商队不敢走夜路了。", "en": "…" },
  "need": [{ "kind": "subdue", "creature": "longzhi", "n": 3 }],
  "grant": { "table": "quest", "progress": 40, "wealth": 20, "item": "bamboo-sword" },
  "opens": { "tier": "foundation", "after": "xu-first-errand" },
  "then": "xu-longzhi-hunt-2" }
```

`need.kind` may only be something **the rules already see**, because the rules
are the only writer and a counter nobody can verify is a lie:

| kind | ticks on |
|---|---|
| `subdue` | a 降妖 WON against that creature (the scene reports it) |
| `tame` | a creature joined the cast |
| `carry` | N of an item in the bag, checked at 交差 |
| `visit` | Move reaching a place |
| `board` | a 炼丹 board won |
| `answer` | a riddle answered |
| `chore` | a real-life 功课 marked done by its own app |

### The loop

1. **接下** — standing where the giver is, Look carries `offers`; the stage
   draws the 差事 card: the ask in the giver's line, what it pays, one button.
   Not tapping is declining — a decline needs no button.
2. **记** — `Quest take --id` writes `state.quests[id] = { took, need: [{…, have: 0}] }`.
3. **追** — one `advance(state, event)` in the rules, called by every verb that
   could move a counter. Nothing ticks anywhere else.
4. **交差 — where he stands, the moment it is done** (his ruling, 2026-09-18:
   交差任务时, 不要让用户跑地图, 直接当前页面交). This is the one place we do
   NOT copy WoW: no walking back to the giver. The line in the book turns into
   a 交差 button the instant the count is met, anywhere; the rules pay from the
   capped table and offer `then`, the next link. A chain still walks the player
   across a province — it just never walks them backwards.
5. **撂下** — `Quest drop --id`, WoW's abandon, no penalty.

### 事簿 — three lines, not twenty-five

**Where it stands (his, 2026-09-21: 「current UI is crowded」).** The book is
not on the stage. A **事 chip on the top bar** — `事 3`, turning seal-red with
`可交 1` the moment a line can be handed in, so a result is never behind a
click — opens a popover with the goal and the rows. The stage keeps the goal
as **one slim line with nothing to tap**; its road is the chat question's to
offer. An errand offered where he stands takes the place's creature card's
place, which returns once it is taken. A shelf stays: it is something to do.

**Arriving is an event** (his, 2026-09-21: 「when arrived a place, can we
trigger something, instead of let user go to another place without doing
anything」). Move's result carries `met` — the errands this arrival finished,
each with its authored `seen` (what is there: the old man swimming 吕梁洪) —
and the question leads with 交差. A 奇遇 does not keep overnight: a tale
opened on an earlier day counts as closed, because one left open on 09-14
had shut every seed out of every place for a week.

**What the page knows it shows; the model is for telling** (his, 2026-09-21:
five 说说 buttons, each a 12k-token turn for facts the page already held). A
row of the book opens where it lies — the giver's words, what it pays, the
next link, 撂下 — read by the page from `Quest info`, which never rides Look.
Every button that does want Ling is **问询**, and it never speaks at once: it
opens the one ask bar with its line (「说说夫诸」); left empty that line is
sent, with a question it goes as `说说夫诸：…`. The bar stands outside the
stage's repaint, so streaming never takes the field from under his hands.

**He names a place, he is walked there** (2026-09-21: 「去泗水」 and the chat
asked 何去何从 again). Move walks the whole road (`via`), stops only where a
scene stands, reads a name half said (not counting where he stands), and
refuses only a wrong target. Ling never asks where to go when she was told.


The goal card is the log: the spine's waypoint first, then the open 差事, each
one line — `沛泽的蠪侄 2/3 · 沛泽` — with the road toward it.

**At most three open.** A chat game cannot show a log of twenty-five, and the
one-thing-at-a-time law says it should not try. Taking a fourth asks which to
put down. In Ling's context the whole book is three lines, about 40 tokens.

### What we do NOT copy

- **No grind.** The day caps (修为 240 · 灵石 60) already hold; a 差事 pays
  inside them, so "kill thirty boars" pays for three.
- **No exclamation marks over the world.** A place holding one says so in one
  line of the director's brief, and Ling mentions it in her own words.
- **No quest text nobody reads.** The ask is one or two lines, in the giver's
  voice.
- **No invented errands.** Improvisation stays 奇遇, which already has its own
  capped table and its turn count.

### Where they come from — three sources, one card

1. **Authored** — the province's own, as above.
2. **Templated — 榜文** (built 2026-09-21) — the 奇遇 seed mechanism with a
   counter: a template plus today's place or creature, so a province is never
   empty. `quests/templates.json` holds the terms; each **market** posts one a
   day, its target within three walkable roads, of the market's own province,
   and winnable (never a beast in the cast or already met today — the first
   sample posted a bounty on his own 夫诸, and 凫丽山 eight roads off). The id
   is the whole errand, `daily-<day>-<template>-<target>`, so the save holds
   nothing new; taken, it stays until done or put down — only the posting
   turns with the day.
3. **Real life** (built 2026-09-21) — the `~/.linggen/quests/<app>.json` 功课
   ride the book on the goal card, with `kind: "chore"` and their witness (the
   app, and when it saw the thing done). They take **no slot** — nobody took
   them, life gave them — and `Quest turn` pays one exactly as `Practice
   check` does, so 交差 is one word. Paid for its period, the line leaves; the
   practice tray keeps only the world's boards. This is the hook no other game has: 扫一次
   洞府 is a quest in a cultivation world, and Shifu says when it is done.

### The word collision, and the migration

Three things are called tasks today. They separate:

| now | becomes |
|---|---|
| `state.quests` (the apps' 功课) | `state.chores` |
| `tasks` (boards, 炼丹) | 功课 stays the word for a board task |
| — | `state.quests` = 差事, the new book |

Save version 4, with a migration that moves the old key.

### Build order

① the schema, the lint, and four authored 差事 for 徐州 · ② `Quest`
(take/turn/drop) + `state.quests` + the book in Look · ③ `advance()` at every
verb that can tick one · ④ the cards (offer + the book inside the goal card) +
SKILL.md · ⑤ templated 差事 · ⑥ the 功课 move onto the same card.

## 遇 — no arrival is empty (built 2026-09-21)

His, after an afternoon of walking 泗水北岸 ↔ 吕梁洪: *can we make sure a place
triggers an event — a fight, a question, a cast, anything — instead of just go
from a place to another.* An arrival is dealt, in this order:

1. **What it finished** — an errand met there: its `seen`, and 交差 leads.
2. **What the place holds** — a scene, an errand offered, a haunt's beast not
   yet met today, a market, a tale to begin. Any of these IS the arrival.
3. **Otherwise one 遇** from `worlds/<id>/meets.json`, by weight: **拾遗** (a
   thing or a few 灵石 by the road; 收下 on its own card, the page takes it —
   no model turn), **路人问** (a riddle from the ROAD's pool, never a scene's —
   the lint refuses one that is; it is the chat's question, `meet` table 20
   修为, wrong gives the hint and asks again), **拦路** (a beast of a haunt he
   may enter stands on this road exactly as at its own haunt: the same duel
   card, the same fight, the same once-a-day).

**What is fixed stays fixed; what roams is authored to roam** (his, 2026-09-21:
a creature at 泗水 is always met at 泗水, a market is found where it is — *and*
creatures move, so some places may deal a wandering one). A place says which
遇 it may deal — `"meets": ["riddle", "find"]` on a ferry, `["beast", "find"]`
on a marsh; unsaid, any. A wandering beast is one of THIS province's haunts,
else of a province a road away: 蠪侄 of 凫丽山 on the road at 沛泽, never 夔
of 蓬莱.

Drawn by the day, the place and the 道号 — a reload rerolls nothing. **Once per
place per day**, so to-and-fro is no farm; a second arrival is just the place.
**Only where he stops**: a place walked through on a long Move deals nothing
(his pick). The day's coins already fill an otherwise empty stage, so 问卦 is
not in the deck; they step aside while a 遇 stands. `state.meets = {day,
places}`; finds are authored per province (`*` serves one with none — 冀 兖 青
still want their own).

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

## 灵气 — the game's own stamina

**It keeps the game from taking too much of a day, and sends the player back
to the world.** Decided 2026-09-14, replacing the token window: 灵气 is a
number the rules own, like 修为 and 灵石 — the 体力 of every mobile game —
not tokens and not turns. Tokens differed by provider (5.5k an exchange on
Gemini, ~2k cached elsewhere), moved with engine changes, and meant nothing
to the player; a stamina bar is the same on every model, visible, and
refills by the clock.

- **丹田 holds 100.** It refills by the clock, full in five hours (20 an
  hour), never over 100. `state.qi` and `state.qi_at` (when it was last
  settled); the rules settle the refill on every read, so two devices agree
  through the save alone.
- **Actions cost it, from `worlds/<id>/rewards.json → qi`:** a story step (an
  exit that moves the scene or ends a chapter) **10** · opening a 奇遇
  **15** · a 降妖 bout **10** · a 坊市 visit **5**.
- **The prologue is free** (decided 2026-09-15, his "yes, make the prologue
  free"): a chapter marked `free: true` asks nothing for its own steps and
  bouts, so a new player finishes the opening in one sitting — it had spent
  70 of 100. Making a scene, a 奇遇 or the market inside it still cost.
- **Free:** questions and chatter, a board played as practice, Look,
  buying and selling, a real-life quest checked. Talk costs nothing — but
  nothing advances without 灵气, which is the point.
- **Real life refills it:** the quest facts the apps already write — a kept
  workout **+30**, a full night **+30**, a Shifu scan **+20** — paid with the
  quest, capped at 100. The "healthy user gets a better Linggen" idea, in
  its natural unit.
- **Empty:** the rules refuse the action (`no-qi`, with the hour it returns)
  and change nothing; Ling speaks the line — *丹田已空，先去调息，戌时再来* —
  and turns the player to the world. The story waits; the boards stay.
- **The 丹田 ring** draws `state.qi` from Look: full, half, low, empty.
- **The engine's token meter is not the game's.** `cloud.meter` stays a
  general facility for any skill that wants a token pace; Lingjing declares
  only `cloud.save`. The scene stops reading `/api/skill-cloud` for the
  ring.

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
  progress — `state.json`, the catalog's prices, `rules.mjs` itself all sit
  in their folder. It matters only where players compare — a ranking, a
  duel, trade between players — and it costs nothing here: money never buys
  power, so a cheat cheats only their own game.

### The road to server authority

**Decided 2026-09-14: rules at home for v1; the rules move to the cloud
when players meet.** Trade between players, a ranking, or the table is the
moment a cheat starts to hurt someone else — and the moment the rules leave
the player's machine.

What moves, and how little:

- **`rules.mjs` runs in a Worker on linggen.dev.** It is pure and reads
  content through one loader, so the move is mechanical: the same verbs,
  the same JSON answers, the state read and written in D1 instead of a
  file.
- **Content is bundled into the site.** Chapters, seeds and the catalog
  deploy on their date without a skill release — serialized chapters,
  finally the way the spec says.
- **The skill's tools become one endpoint call each,** the same names and
  args, the account token as auth. SKILL.md changes only its `cmd:` lines;
  Ling's rules do not change at all.
- **The save lives only in the cloud;** `data/` on the machine becomes a
  cache. 灵气 moves with the rules — it is state.
- **The scene still witnesses a board** — it reports the win to the site
  instead of the file.

What stays true now, so nothing built before then blocks it: rules pure and
file-free inside; content through one loader; every tool one verb with one
JSON answer; the page writes nothing but a win. Offline play is the price,
already on the open list.

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
- **One device, one Yinyue.** Each player's own Yinyue stands on their own
  screen, held by their own engine's presenter lock, and every player's
  Yinyue speaks on her own player's device at the same time. The table needs
  nothing new for that. If other players' Yinyue ever appear at the table,
  they are figures with their words as text — only the player's own Yinyue
  speaks aloud on that device.

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
| **Key** | The rules check the answer against a key shipped in the world — a riddle's answer, a creature, a poem corpus — in either language | none |
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
and per-player grants; the world grows keys, corpora and clue sets.

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
the new language. In English play Look carries `words` (the world's `dictionary.json`:
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
6. Online: the cloud save and the 灵气 meter — the skill declares them, the
   engine reports and asks, linggen.dev counts and keeps the save. ✓
7. 灵气 as stamina: `qi`/`qi_at` in the state, costs and refills in
   `rewards.json`, `no-qi` refusals, the ring from Look; SKILL.md drops
   `cloud.meter`. ✓
8. A day: 徐's seeds in `content/seeds/`, `Branch open` picking by the day,
   the lint on seed creatures — the daily loop before more spine. ✓
9. Made scenes: the template, `Make` / `Enter` / `Leave`, the made lint. ✓
10. The dictionary and the ids: `dictionary.json`, `ladder.json`, `traits.json`,
    every internal key renamed to its id, save version 2 with migration. ✓
    Then worlds: `content/` → `worlds/jiuding/`, `world.json` with the style,
    `state.world`, the loader by world id, the lint per world, the names
    list. ✓
11. Places: `places.json` for 徐, `Move` for real, tiers and the fitting
    place, the director's brief in Look, the map card by places. ✓
12. The catalog: `worlds/<id>/items.json` for 徐, the `Trade` tool, the 坊市
   as a place, the `item` card, the lint. ✓
13. 降妖: creature roots, the 五行 duel on the scene, `lost`, the withdraw
   rule; the 夫诸 exit renamed `subdue`. ✓
14. Chapter 1 — 冀州, with its seeds, its creatures pictured, its 坊市. ✓
    14b. Made worlds: Build, Worlds, Travel, Art, Amend; the made world's
    road map. ✓
15. Server authority: `rules.mjs` in a Worker, content bundled, tools as
    endpoints, the save cloud-only — before any play where players compare.
16. The table: the engine's shared chat, then the first set of plays; 传音 ·
    同修 · 论道 through the cloud.

## Open

- **From the first full playthrough (2026-09-15, Flash-Lite, clock 10-02,
  a scratch engine).** Fixed then: a 奇遇 pays only after two turns in the
  player's own words (`min_turns`, `said`, the closing words count); the
  question is one short line with narration and `paid` in the reply; a
  tapped place is a Move; a road is closed only when Move says so; the
  prologue's last beat no longer promises a road that is already open.
  His calls: the prologue spent 70 of 100 stamina in the first sitting
  (made free the same day); the cauldron wants the peak of 练气 the day chapter 1 opens — 练气
  halved to 810 on 2026-09-15 (50–130 a layer; a real day earns 80–110,
  so about a week); Flash-Lite still tells a 奇遇 in
  one breath (a turn count from the engine would let the rules know a real
  player turn), drops authored lines in a long session, and skips the
  chapter's last button; the engine shows a provider's raw 429 as Ling's
  words, and a one-option AskUser costs a round trip.
- **Idea — a healthy user gets a better Linggen.** Health kept (the facts
  the apps already record) earns more than game 灵气: a better Linggen
  overall. To talk through.
- Whether the plan's players get a larger 丹田.
- Offline play: the save needs the network.
- The phone.
