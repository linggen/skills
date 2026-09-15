---
type: design
reader: coding agent, contributors
guide: |
  How Lingjing is built. What it is and does is product-spec.md; how it looks
  and plays is prototype.html (scripted, no model). This file is the build.
status: 2026-09-14 — content, rules.mjs, SKILL.md, the Mac scene page, the first quests (Shifu's scan, Health's workout), online (the cloud save, sign in to play) 灵气 as stamina, 徐's seeds, made scenes, the dictionary, the worlds split, 徐's places (Move for real, the director's brief) the catalog (Trade, the 坊市 at 彭城, the item card), 降妖 (the 五行 bout on the scene) and chapter 1 (冀州, opens 2026-10-01; provinces open with chapters, the spine as waypoints, the breakthrough) built (build order 1–14); the table (playing together) designed.
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
    items.json             the catalog: kinds, prices, one effect each; art/items/<id>.svg
    hexagrams.json         the day's omen (the eight doubled trigrams so far)
    art/<creature>.webp    the classical woodcut on our paper (tools/frame.py); plates/ the originals; CREDITS.md
    riddles/zh.json, en.json   answer keys the rules check
    tasks/world.json       in-world tasks
    seeds/<province>.json  奇遇 seeds, one file per province
    places/<province>.json the province's places, roads and tiers
    branches.json          奇遇 templates and the daily cap
    chapters/00-prologue/  chapter.json · beats.md · scenes/*.json — the corridor
    chapters/01-ji/        the same — waypoints; opens 2026-10-01, gate 1
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
- **Built (step 15, 2026-09-15): made worlds.** A world of the player's is
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
  its picture, or be new and drawn on first appearance — both, his ruling.
  The page reads a made world's creatures and words over its base's; a
  creature not yet painted shows its look in words. Closed where the machine
  cannot draw (no GenerateImage). Live on Gemini Flash-Lite: 《青州山海猎》 in
  20 s (five places, 夫诸 in a cave); 《荆州泽国》 with an invented four-winged
  serpent, drawn in 16 s and shown. Open: amending a world in play (add a
  creature or a place — Build refuses `world-in-play`); the map card knows
  only the nine provinces; a weak model may skip reading the template and
  need several lint rounds.
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
| 练气 | 1,620 | 1 | ~20 |
| 筑基 | 1,500 | 1 | ~19 |
| 结丹 | 3,000 | 1 | ~37 |
| 元婴 | 6,000 | 2 | ~37 |
| 化神 | 10,800 | 3 | ~45 |
| 炼虚 | 18,000 | 6 | ~37 |
| 合体 | 28,500 | 9 | ~40 |
| 大乘 | 43,500 | 14 | ~39 |
| 渡劫 | 66,000 | 20 | ~41 |

About 315 diligent days end to end — the spec's year, with slack for the
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

1. **The omen.** Look brings the day's hexagram; Ling shows it and says its
   image in a line.
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
  thread is the pull.
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
  draws the province's places under the nine-province grid: here (Yinyue's
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
  never moves); an exit that `ends: "made"` comes home. Steps cost 灵气 as
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
| `Branch {action: open \| turn \| close, kind, xw, ls}` | Opens a 奇遇, counts its turns, pays within the branch cap on close. | `branch-open`, `branch-cap`, `no-branch` |
| `Summarize {text}` | Replaces the story. | `too-long` |
| `duel --id [--picks]` (the page's) | Starts a bout (stamina, the creature's moves) or settles it from the picks; records the win or the withdrawal. | `not-here`, `withdrawn`, `no-traits`, `not-started`, `not-your-root`, `unfinished` |
| `Move {place}` | Goes to a place by road; a province still answers. | `corridor`, `no-road`, `too-hard` (with `fitting`), `unknown-place`, `road-closed` |
| `Trade {action: buy \| sell \| use, id}` | Buys or sells at a market at the catalog's price, a visit's 灵气 each; `use` pays a pill's progress within its table or puts a wear on. | `unknown-item`, `no-market`, `not-for-sale-here`, `no-stones`, `not-in-bag`, `key-in-use`, `not-usable` |
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
- **Not yet:** Yinyue's 3D model (the moon holds her place — she renders in
  one surface at a time, so the game needs a call on where she lives while it
  is open); the 斗法 duel (the 夫诸 `duel` exit refuses until a board for it
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

## Pictures

A creature is never named without its picture — a player cannot know 夫诸
from its name.

- **One picture per creature,** `worlds/<id>/art/<id>.webp`, shipped in the
  skill. **Decided 2026-09-14 (his "fetch the three woodcuts"):** creatures
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
  fashion, but fine for the first version". Items stay drawn
  (`art/items/<id>.svg`, SVG brushwork); at thousands of items the plan is
  re-inked silhouettes from a CC-BY icon set (game-icons.net, credited) or
  an image model at authoring time — never hand-drawing them all. Sizes:
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
   `cloud.meter`.
8. A day: 徐's seeds in `content/seeds/`, `Branch open` picking by the day,
   the lint on seed creatures — the daily loop before more spine.
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
15. Server authority: `rules.mjs` in a Worker, content bundled, tools as
    endpoints, the save cloud-only — before any play where players compare.
16. The table: the engine's shared chat, then the first set of plays; 传音 ·
    同修 · 论道 through the cloud.

## Open

- **Idea — a healthy user gets a better Linggen.** Health kept (the facts
  the apps already record) earns more than game 灵气: a better Linggen
  overall. To talk through.
- Whether the plan's players get a larger 丹田.
- Offline play: the save needs the network.
- The phone.
