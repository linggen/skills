---
type: design
reader: coding agent, contributors
guide: |
  How Lingjing is built. What it is and does is product-spec.md; how it looks
  and plays is the live page (scripts/index.html); prototype.html is the
  archived first mock. This file is the build.
status: 2026-09-24 — redesign v2 steps 2–4 (redesign-v2.md § 四, § 十): 路上 (遇 · 拾遗 · 抉择 · 机缘 · 拦路 as one on-arrival system, rules/road.mjs), 差事 (errands and 榜文 one kind; no daily boards), 问卦 (起卦 · 望气 · 命格 one card) merged; 伤势 · 羁绊/谈心/疗伤 · 历练 · 温养/强化/写符 · the elite's own rules cut, 组牌 from 结丹 — save v5 migrates; the day resets 今日传闻, the 人间功课 pick and 问卦. Also 2026-09-24: rules split into scripts/rules/*.mjs; one writer at a time (state.json.lock, `busy`); a fight holds the world still (`in-a-fight`); nothing pays twice (`won-already`, `subdued-today`, made grants progress/wealth only and once, Go replay pays nothing); gear counts in the card fight (装备入局); hosted games and 论道 cost 3 体力; the page's verbs go through the declared page_only `Verb` tool; the cloud save is [data/state.json, data/worlds]. Before: 2026-09-23 伤势 · 羁绊 · 历练 · 机缘 · 抉择 · 精英 · 杀招 · 望气 · 组牌 · the mini-games and 论道; 2026-09-18 斗法 v3 (the card fight) and 差事; 2026-09-14–17 the world, places, catalog, made worlds, 银月 at 结丹. Superseded designs live in archive.md.
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
  SKILL.md                 Ling's game-master rules + tool declarations (Verb is the page's, page_only)
  scripts/
    index.html, lingjing.css, lingjing.js   the Mac scene
    cards.js, board.js     the cards Ling can Show; the alchemy board
    battle.js              the card fight (斗法 v3), pure, shared by the page and the rules
    battle-card.js, battle-anim.js, battle.css   the fight drawn on the scene
    duel.js, duel-card.js  the old 五行 bout (archive.md) — kept for its card and tests
    games/                 the hosted mini-games: 洛书 · 华容道 · 七巧 · 五子 · 象棋残局 (a module + css each)
    esc.js                 the one escape for world/save words put into innerHTML
    rules.js               the page's door to the rules: POST /api/skills/lingjing/tools/Verb
    chat-bridge.js, api.js the shared bridge copies
    rules.mjs              the rules CLI and its one door: lock, fight hold, dispatch
    rules/*.mjs            the rules by part: core (pay, riddles, stamina) · look · travel ·
                           tasks (boards, fights, 论道) · cards (decks, 得牌, gear) ·
                           companion (银月, her past, her lift by the story) · daily (greeting, 体力) ·
                           road (路上: 遇 · 拾遗 · 抉择 · 机缘 · 拦路) · errands (差事) · arms · fortune (问卦) ·
                           worlds · world · verbs · files · ask · chores · tale · did
    stage.mjs              what stands on the stage and what `ask` leaves to the chat
    state.mjs              the save: load, migrate, fitWorld
    run-js.sh              runs it under the bundled bun, else node
    content.mjs            loads + validates a world; `lint [world]`
  worlds/<id>/             one folder per world; the folder's name is its id
    world.json             the world card: id, title, premise, style, sources, companion
    names.json             the novels' names this world refuses, by book
    dictionary.json        the harness's ids → this world's words, zh + en; the provinces
    ladder.json            the tiers: 练气 1–9, 筑基 … with progress thresholds, pay, gate
    traits.json            灵根 kinds and their progress multiplier
    rewards.json           reward tables, 体力 (max, refill, costs), her lift by chapters (`bond.lifts`), story growth (`growth`); `_economy` has the math
    creatures.json         山海经 entries: name, source, quote, root, deck, signature, elite, likes
    cards.json             the fight's cards, starters, modes, `gear` rates
    herbs.json, arts.json, lundao.json, meets.json   alchemy tiles · learned arts · 论道 · 路上's finds, riddles, 抉择
    items.json             the catalog: kinds, prices, one effect each; art/items/<id>.webp
    hexagrams.json         问卦: the 64 hexagrams and what a grade does to the day's fights
    art/                   creatures, items, cards (art/cards/<id>.webp); plates/ the originals; CREDITS.md
    riddles/, tasks/, seeds/, places/, quests/   answer keys · in-world tasks · 传闻 seeds · places · 差事
    tale.json              今日传闻: the shape Ling writes to, its limits, each game's story uses
    chapters/00-prologue/ … 03-qing/   chapter.json · beats.md · scenes/*.json
  data/                    this player; never in the repo — the cloud saves state.json and worlds/
    state.json · log.jsonl · worlds/ (made worlds; their art/ stays on the device, cloud.skip)
  tests/                   node --test tests/*.test.mjs; tools/battle-sim.mjs is the balance gate
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
| `tale` · `task` · `quest` · `shop` | the day's side story, in-world tasks, real-life quests, the market | 传闻 · 功课 · 人间功课 · 坊市 | 传闻 · 军务 · 人间功课 · 市集 |
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

### 今日传闻 — Today's Rumor (his, 2026-09-24; replaced 奇遇)

Once a day Ling writes a small side story, like a WoW dungeon: **3–5 steps
that open in order, each a mini-game at a place, then a finale** (a fight at
a haunt, or the hardest board) and an ending. The spine is untouched; it
replaced Branch (three open-and-close tales a day, paid what Ling proposed).

- **Words are Ling's, numbers the rules'.** `Tale seed` hands her today's seed
  (the province she stands in, unused first, by the day), the games with their
  story uses (`tale.json` `frames`: 洛书 a tomb door, 炼丹 an antidote …), the
  places and haunts in reach, the people `known`. She writes title, hook, cast
  (1–3, each a voice), each step's game, place, giver, line and clue, a riddle
  or a 论道 prompt, the finale, the ending. `Tale make` lints it (`rules/
  tale.mjs lintTale`): places real, open, within the realm and `reach` roads of
  the last; creatures with a haunt, not in the cast; ≥3 different games, none
  twice running; lengths, the player's language, refused names — and **no
  number anywhere**, no reward key. Refused → `not-playable` with `problems`.
- **Pay:** each step the `tale` table, the finale `tale_end`, the whole never
  over `rewards.json tale.cap` (a fifth step eats into the finale); one drop
  from `tale.drops`, the highest tier at or below the realm. A step's board
  costs a hosted game's 体力; ~2.9 修为 per 体力 with an elite finale — just
  under a fight.
- **Play:** every board is its own instance (`tale:<id>:<n>`, dealt by the
  page from that id at the realm's level, +1 for a finale) — never the day's
  practice. Won at its place, the step hands itself in (所得) and the next
  opens, page-side; Ling gets one hidden `[scene] tale step` (or `tale end`)
  and speaks the step from Look's `tale`. It rides the book as one line (no
  slot) and the stage's queue beside the search's step.
- **One a day; an unfinished one stays** until done or put down (`drop`,
  unpaid); a missed day costs nothing. Look's `story_due` nudges Ling (no rumor
  today, or the open one quiet `story_due_minutes`) once a span. The cast of a
  finished tale joins `known`, and may return by id.

### A day

What a player does on an ordinary day — between chapters, which is most
days — is the game's real shape. The day resets three things and no more
(redesign-v2 § 四, 2026-09-24):

1. **问卦** (rules/fortune.mjs) — the day's one reading, on one card: three
   coins six times (三钱法; seeded by the day and the 道号, so a day never
   re-casts), the hexagram from `hexagrams.json` (all 64, graded 大吉 · 吉 ·
   平 · 凶 · 大凶). Nothing is asked first: it is always the day's fight
   luck. One effect set, locked at every fight's door that day — **卦力**,
   the lower trigram's element, its 功法 ±1/±2 by the grade; **望气**, at 吉
   and 大吉 the beast's next move read, as the scroll's 上卷 does; and **命格**
   (set once, on the same card, only if the player wishes: 生肖 and 日主 from a
   birthday read on this machine, or 随机) leans a reading whose lower trigram
   is the 日主's element one step the player's way and makes the root strike
   that element. It touches no 修为 and no 灵石. Yinyue reads it aloud.
2. **The day's 人间功课** — the workout and the one pick from the apps'
   menus, paid on sight (§ 人间功课).
3. **今日传闻** — Ling's one side story of the day, grown from a seed: the
   day's main dish.

Beside them, as much as 体力 allows: the spine when a chapter is open, the
errands in the book (a market's 榜文 among them), fights, and whatever the
road meets (§ 路上). No board stands for the day by itself — the mini-games
are 传闻's steps, a scene's boards, or a game a notice asks for.

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
  `buy` / `sell` only at a market, no 体力 (`shop` 0), the
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
  (`near`); a province still answers as before. A trip costs 体力 (3, +1 a road, at most 6) and returns the place, its `show` (the
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

### 降妖 — fighting a creature — archived

Superseded; the original is in archive.md. The card fight (`## 斗法 v3`) and `## Systems built 2026-09-21 → 24` hold what is true now.

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
  "tale": null, "known": [],
  "story": "青玄在泗水边醒来……",
  "stamina": 60, "stamina_at": "2026-09-11T12:00:00-03:00",
  "day": { "key": "2026-09-11", "progress": 70, "wealth": 10 } }
```

- `stage` counts from 0 within the realm; `xw` is what the current stage has
  earned toward its threshold, held at the threshold at a realm's peak.
- `story` — the story so far, ≤300 words (≤600 characters in Chinese),
  written by Ling through `Summarize`. The rules store it; they never read it.
- `day` — the day's totals for the caps; it rolls over at local midnight.
- `log.jsonl` — every change `{at, verb, args, before}`: the audit, and what
  `undo` restores.
- **Save version 5** (2026-09-24, redesign-v2): older saves migrate by a table
  of steps (state.mjs `MIGRATIONS`). v5 keeps everything held — the bag, the
  cards, the treasure and its 重 — and drops what only the cut systems read:
  `wounds`, `bond`, `tended`, `journey` (a journey still out ends with her
  simply back at the player's side, nothing invented), the day's 温养/写符
  marks and the treasure's `exp`.

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
| `Tale {action: seed \| make \| answer \| drop \| info, tale, answer, ok, reply}` | 今日传闻: hands the seed and the shape; lints and keeps Ling's tale; judges a riddle or a 论道 line; puts it down. The page's `win` (a step's board) and `turn` (a kept win) come through the same verb. | `tale-open`, `tale-today`, `not-playable` (`problems`), `not-here`, `not-this-step`, `wrong-answer` |
| `Summarize {text}` | Replaces the story. | `too-long` |
| `duel --id [--picks]` (the page's) | Starts a bout (stamina, the creature's moves) or settles it from the picks; records the win or the withdrawal. | `not-here`, `withdrawn`, `no-traits`, `not-started`, `not-your-root`, `unfinished` |
| `Move {place}` | Goes to a place by road; a province still answers. | `corridor`, `no-road` (with `near`, `toward`), `too-hard` (with `fitting`), `unknown-place`, `road-closed` — each with `here` |
| `Trade {action: buy \| sell \| use, id}` | Buys or sells at a market at the catalog's price, no 体力; `use` pays a pill's progress within its table or puts a wear on. | `unknown-item`, `no-market`, `not-for-sale-here`, `no-stones`, `not-in-bag`, `key-in-use`, `not-usable` |
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

## 功法 — swords, talismans and learned arts — archived

Superseded; the original is in archive.md. The card fight (`## 斗法 v3`) and `## Systems built 2026-09-21 → 24` hold what is true now.

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
| 武器 | 法器 | ✗ 剑留在世界里当装备，不进牌桌；它的 器攻 ×0.5 加到主灵根一击（装备入局，BUILT 2026-09-24） |
| 亡语 | 遗蜕 | ✗ 交互爆炸的源头，v2 |
| 冲锋 | 疾行 | ✗ 爆发数学，v2 |
| 换牌 | — | ✗ 开局就让人做看不懂的决定 |
| — | 符从背包带入 | ✓ 背包里有符 → 手里一张「符」牌，打出才从背包扣（BUILT 2026-09-24）；丹不带 |
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

1. **入口**在世界里：妖的巢、路上的妖、一个任务、一段奇遇。
2. **进门**扣体力（斗法 8，精英同价；小游戏 3 在交差时扣，论道 3 在开局扣），**锁定一份
   出战配置**（境界、主灵根、牌库、装备折算、今日问卦、银月）；锁定之后世界里
   发生什么都不改这一局 —— 可重放、可判定、可对战的前提。
3. **门内**画在主界面的场景位上，**聊天留着**（人可以边打边说）；世界停住：规则拒绝
   一切改世界的动作（`in-a-fight`，FIGHT_HOLDS），Ling 不推进任何东西。
4. **出门**规则按玩家的出牌重放、结算、写回存档；页面报 `[scene] won|lost|withdrew <id>`，
   所得由台上的战利品卡显示，Ling 只讲故事。开着过夜的一场，下次调用时按力竭退走结。
5. **中途退出 = 认输**：体力照扣，奖励没有。

**带进门的**：境界+主灵根 · 牌库 10（结丹之后组牌挑的，余下按曲线补）· 装备（每件一个数，
§ 装备入局）· 今日问卦（卦力、望气）· 银月（随已了结的章数抬她）。每一场都满血进门
（伤势 2026-09-24 砍掉，redesign-v2 § 四）。
**留在门外**：体力（进门时扣）· 灵石 · 修为 · 背包杂物（符除外）· 故事进度。
**文戏（灯谜、飞花令、下棋、问卦）什么都不带** —— 只带这个人和他的语言，
所以新玩家能赢老玩家。武戏带属性，文戏不带 (2026-09-18)。

### 体力，唯一的节流阀 (BUILT 2026-09-18; numbers 2026-09-24)

倒计时给人压力，体力不给 (his)。显示**状态与点数**（62/100），不是时钟。数字全在
`rewards.json → stamina`：

- **满 100，五小时回满**；用到 0 之后要歇到 **20**（`rest_at`）才再动 —— 最后一点仍能买
  一件事。银月（不是 Ling）叫人去歇。
- **价**：一趟路 3，每多一条路 +1，最多 6 · 一步故事 3 · 斗法 8（精英同价）·
  抉择 3 · 驯 3 · 小游戏 3（交差时扣；体力空了赢局照留，回满当天再付）· 论道 3（开局扣）·
  造景 5 · 造世界 10 · 增改 5 · 坊市 0。序章自己的步、路、仗不扣。
- **不扣**：说话、坊市、差事、问卦。
- **现实里的事回体力**：一件任务按它自己的分量回（默认 20）。
- **没有日上限** —— 2026-09-23 去掉修为/灵石日上限：只用体力限制（his）。
- 空了只说一句什么时候回来，不滚秒。

### 牌库：一副牌，不是一把牌 (BUILT 2026-09-18)

`deckFor` 按**费用曲线**发十张，而不是从你那几行里随手抓 —— 闸量过，会搭的牌组
赢 84%，随手抓的赢 47%。曲线**随境界弯**：练气上限六点灵力、一场约六回合，
五费牌在那里就是永远打不出来的牌（第一版照炉石十回合的曲线发，反而把赢的仗打输了）。

练气 `1 1 1 2 2 2 3 3 4 4` · 筑基 `1 1 2 2 2 3 3 4 4 5` ·
结丹 `1 2 2 2 3 3 4 4 5 5` · 元婴 `1 2 2 3 3 4 4 5 5 6`。

同一个人永远拿到同一副（洗法由道号定），无金根则一张金牌也进不来。

### Ling 何时开口 (his, 2026-09-22)

*只有必要的时候, 让agent说话, 比如推动剧情, 走故事分支. 要设计一些互动的chat内容.*

- **只改存档的点，是页面的事**：接下 · 交差 · 买 · 卖 · 服用 · 佩戴 由页面直接调规则，
  聊天里什么都不多；Ling 下次 Look 从存档里知道。
- **主线是写好的，支线是 Ling 的**：《九鼎》的章节、谜、赏是内容；今日传闻由 Ling 从州里的
  种子长出来，字是她的，数是规则的。差事她不编。
- **遇先起雾，Ling 先渲染气氛**：Move 发下的遇带 `veiled`，台上只有雾；Ling 写两三句
  （月黑风高……突然——），再 Meet `reveal`，卡与问题才上台。她那一轮结束仍未揭开，
  或页面开在雾上又无人说话（20 秒），页面自己揭开。

### 得牌 — 只用已经得到的牌 (his, 2026-09-22; BUILT)

*用户只能使用已经获得的牌, 包括银月, 法术, 武器等。* 灵根不再按五行白给牌。
`state.cards` 是他手里有的牌，出战的十张从这里按曲线挑。**灵根只管功法，不管灵兽** (his, 2026-09-22)：
没有金根就修不得金行功法，但金行灵兽照样能带 —— 韩立缺金根，照养噬金虫。

- **起手** — 测灵根那一刻，`cards.json` 的 `starter` 里属于他灵根的牌（四灵根正好十张，便宜朴素）。
- **银月** — 她认他那一刻；开局在手，不占十张。
- **灵兽** — 收服那一刻，它的牌归他。没收服的山海经妖，永远不在他的牌里。
- **每赢一场** — 一张他没有、用得上的牌（功法须合他的灵根，灵兽五行皆可），先挑那只妖的行；不会是山海经妖。
- **赏** — 任何 grant 可写 `card`（差事、场景），lint 查牌存在。
- **法器** 仍是戴着的装备，不进牌桌；它和本命法宝借的那一行，功法可以进牌库（§ 装备入局）。
- **五行** — 每张牌都有五行（his: align with 凡人），**丹药除外**（`pill: true`，谁都能服）。测试守着：新牌没配五行又不是丹药，测试就不过。
- **旧存档** 没有 `cards`：按"应有的"读（起手 + 银月 + 随行的妖），得第一张新牌时写下。

闸 § 带进门的：大吉 +4.8 · 吉 +2.0 · 凶 −2.1 · 大凶 −2.7；§ 装备入局（基 84.9%）：竹剑 +2.9 · 铁剑 +6.6 · 蓑衣 +1.1 · 玉珏对土妖 +6.1 · 符 +2.2 · 本命 一重 +8.0 / 九重 +11.0 · 全套 94.4%；任一样超过 15 点报越界，全套封顶 97%。

闸（`tools/battle-sim.mjs` § 起手）：只有起手十张 + 银月，练气 76.7% · 筑基 76.7% · 结丹 70.0%；
带上夫诸、狍鸮多 5–7 点。低于 50%（练气）闸报越界。

**妖的牌组也是内容**：闸发现精卫自带三张抽牌，五回合就把自己抽空、力竭遁走 ——
一场本该赢的仗成了平局。它的抽牌减到两张。性格可以强，但不能强到自尽。

### Build order

① 内核 `battle.js` + PvE 旋钮 + 平衡闸（纯规则，先不动现有的降妖）·
② 战斗 UI（整屏，聊天收起，wireframe 已画）· ③ 牌的内容与起手牌组 ·
④ 体力改造 · ⑤ PvP 旋钮（桌上的斗法）· ⑥ 团战。

## 斗法 v2 — 灵力、法器与本命法宝 — archived

Superseded; the original is in archive.md. The card fight (`## 斗法 v3`) and `## Systems built 2026-09-21 → 24` hold what is true now.

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
  once from the `haunt` reward row (25 · 10 since 2026-09-24) — no exit, so the page's
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
and the question leads with 交差.

**One thing to tap at a time — and why it kept coming back** (his, 2026-09-21:
an offer card on the stage and 何去何从 in the chat at once; "we fixed it several
times, still exists"). The stage had THREE hand-written descriptions: what is
drawn (`stageCards`), what each card owns (`stageOwns`), and — in the rules, by
itself — what counts as the stage holding something out (`stageWaiting`: a
shop, a beast, the bell). 09-18 merged the first two; the third was never
updated, so every new card reopened the bug (offers, the same evening; 拾遗,
today). Now each card kind DECLARES `holds` in `stage.mjs` `CARD_KINDS`, the
rules ask the drawn list (`stageHolds`), `stageWaiting` is gone, and a test
fails any kind that is drawn without saying. While something holds: no `ask`,
and the roads stand on the stage under the cards (quiet is never stuck). What
finishes it — 接下, 收下/不取 (`[scene] meet taken|passed`), a fight won —
brings the question in that same turn. The day's coins do not hold.

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

- **No grind.** 体力 is the only limit (the day caps went 2026-09-23); a 差事
  costs its walking, so "kill thirty boars" costs thirty fights of 体力.
- **No exclamation marks over the world.** A place holding one says so in one
  line of the director's brief, and Ling mentions it in her own words.
- **No quest text nobody reads.** The ask is one or two lines, in the giver's
  voice.
- **No invented errands.** Ling's own story is 今日传闻, linted and paid by
  the rules.

### Where they come from — three sources, one card

1. **Authored** — the province's own, as above.
2. **Templated — 榜文** (built 2026-09-21; since redesign-v2 simply *an
   errand the market board gives*, one kind with the authored ones, spoken
   the same way; a game notice picks one of the place's games by its id, and
   is the one way a place's game is played outside 传闻 and the story) — the 奇遇 seed mechanism with a
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

## 路上 — no arrival is empty (遇 built 2026-09-21; one system since 2026-09-24)

**redesign-v2 § 四: 遇 · 拾遗 · 抉择 · 机缘 · 拦路 are one thing — something
met on the road — in one book of rules, rules/road.mjs.** An arrival meets
AT MOST ONE, veiled until Ling has set the moment (Meet `reveal`), answered
by the one verb Meet with one refusal vocabulary (`nothing-here` · `gone` ·
`not-veiled` · `unknown-action`, and each kind's own), and drawn on the stage
as ONE card kind, `road` (mist, a find, the 机缘, a 抉择's ways; a
traveller's riddle is the chat's question, a road beast the duel card). The
**机缘** is a kind of it: still set once a day within two roads for three
real hours (the chance config and rewards `chance`), and arriving there while
it lasts it is that arrival's one thing, before anything the place holds;
`take` 收下 it (the Chance verb is gone). A 抉择's `wound` stake takes that
share of 体力 now (伤势 was cut). The sources stay as they were and are read
as they are: meets.json, a place's `meets`, the chance config.

The rest of this section is 遇 as built on 2026-09-21, still true:

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
places}`; finds are authored per province — 徐 冀 兖 青 written, `*` serves one
with none — and a find may say `at`, the places it belongs to (上党的参 on
太行, never at 碣石). A seed does NOT make a place its own: 在此逗留 is an
option, and a place offering only that was the empty arrival he complained of.

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

### The menu (2026-09-24)

Each app's file is its **menu**: every chore a player can do there, one entry
each, the whole menu always written (`done_at: null` until first seen). An
entry adds two fields to the ones above:

- **`pool: true`** — offered to the game's one-app-chore-a-day pick. An entry
  without it is a fixed chore (`health-workout`, the daily).
- **`device`** — `mac`, `phone` or `both`: where the player does it.

Each entry's `done_at` is stamped by its app at the moment it witnesses the
chore (a script's end, a verb's success, a page event), through one writer
per app that merges by id — other entries, and ids it does not know, stay.
Never faked: a phone action the Mac never sees has no entry.

| App | Entries |
|---|---|
| CFO (`cfo/scripts/quest.js`) | `cfo-import` week (both) · `cfo-review` day (both) · `cfo-sort` week · `cfo-invest` week (phone) |
| DJ (`dj/scripts/quest.mjs`) | `dj-fetch` day · `dj-sing` day · `dj-playlist` week · `dj-sync` week (both) · `dj-listen` day (phone) · `dj-karaoke` week (phone) |
| Shifu (`apple-shifu/scripts/quest.sh`) | `shifu-scan` · `shifu-security` · `shifu-clear` (both) · `shifu-backup` (both), all week |
| Health (`health/scripts/quest.mjs`) | `health-workout` day (fixed) · `health-report` week (phone: the week's letter read) · `health-doctor` week (phone) |

Phone-side chores arrive as phone facts: each app's SKILL.md `quests:` maps a fact kind to one of these ids, and the engine runs the app's own writer (`… stamp <id> <at>`).

### 人间功课 — one a day, and 开府 (built 2026-09-24, rules/chores.mjs)

Listing every menu entry flooded the book. The rules read the menus thus:

- **Fixed** (no `pool`, not `once` — the workout): a book line every day.
- **The day's pick**: ONE `pool` entry, highest hash of day + save
  (`state.created`) + id — the same on every device and reload; an entry
  appearing mid-day moves it only if it outranks it. Days alternate 💻/📱
  (parity of the day + the save); a `both` fits either; a day whose device
  has none falls to the other. Skipped: done or paid this period *before
  today* (so doing the pick never re-rolls the day), and phone entries while
  no phone is known — Linggen's `linggen-pair` milestone done, or a
  phone-only entry ever seen done (a `both` done proves nothing: it may have
  been the Mac).
- **Only the pick and the fixed show and pay.** Another pool chore done
  anyway is shown nowhere and refused `not-today` — one a day is the design,
  not a gate on living.
- **开府** (`period: "once"`, Linggen's twelve setup milestones and any app's):
  never a book line — its own section in the 事 popover (Quest `kaifu`, a
  page read), ✓ when `done_at` is set, 交差 once, then 已记. Pays on the
  `once` table (40 修为 + 20 灵石 at most, the entry's 体力) **once ever**:
  `state.chores[id].period === 'once'` in the synced save. Look carries one
  line (`kaifu: {done, of, ready, next}`); an undone one never nags — Ling
  may offer `next` when asked what to do.
- Look's `quests` and Progress's `chores` carry today's lines and 开府 as n/of.

## Access and pay

- **Sign in to play.** A signed-in player gets Linggen's free tier, then the
  $5 Linggen plan — the game is included, never sold apart.
- **Any model plays:** Linggen Cloud or the player's own, as in every app.
  On Linggen Cloud the game already travels like Health — the shared trial,
  then the plan's monthly pool (linggensite `llm.ts`).

## 体力 — the game's own stamina

**It keeps the game from taking too much of a day, and sends the player back
to the world.** Decided 2026-09-14 (then called 灵气/丹田), replacing the
token window: a number the rules own, like 修为 and 灵石, the same on every
model, refilled by the clock. It is the **only** limit on a day's play — the
修为/灵石 day caps went 2026-09-23.

- `state.stamina` and its clock, settled on every read, so two devices agree
  through the save alone. Look's `stamina`: `now`, `max`, `empty`, `rest_at`
  (back to 20, when an empty pool plays again), `full_at`, and `returns_at`
  for older pages.
- The prices, the refill and the rest line are `rewards.json → stamina`;
  the table is in `### 体力，唯一的节流阀` above.
- **Real life refills it:** a quest paid adds its own `qi` (default 20).
- **Empty:** the rules refuse `no-stamina` with the hour it returns and change
  nothing; Yinyue sends the player to rest. The market, errands and talk
  still work.
- The engine's token meter is not the game's: Lingjing declares only
  `cloud.save` (and `cloud.skip: [art]`).

### 闭关修炼 — offline seclusion (his, 2026-09-24: one pick; BUILT)

Time away from the game, spent on ONE thing. `rules/seclusion.mjs`, verb
`seclude` (page only, via `Verb`): `info` · `enter {focus: card|progress|treasure, id?, pill?}` · `leave`.

- **Hours are real**, from `state.seclusion.since` (the rules' clock, never
  the page's) to ctx.now, capped at 12; under 1 nothing grows (the clock's
  refill goes on as ever). A 聚气丹 taken going in counts the hours ×1.5.
- **One focus.** 法术: one ★ per 6 h counted, to ★3, the hours over kept per
  card (`state.card_stars`, `state.card_study`). 修为: 5 an hour through the
  `seclusion` table (60 a 12-hour night at 练气 — a day of play is ~170, an
  hour of fights ~375: playing stays better), held at the realm's peak.
  本命法宝: one 重 per 8 h, the hours over kept (`treasure.tempered`) — what
  the cut 温养 clicks did. Any focus: 8 h or more fills 体力.
- **★ in the fight** (battle.js `costOf` / `effectOf`, locked at the door as
  `setup.you.stars`): each star −1 灵力 while the card costs more than 1, then
  +1 to its number. The gate: every spell ★1 +1.9, ★2 +3.0, ★3 (the ceiling)
  +6.2 points — inside the gear band.
- **The world holds still** while one runs (`in-seclusion`, like a fight):
  nothing ends it but 出关. Look's `seclusion` is what 出关 would grow now;
  the stage is its card alone; nothing is asked.
- **The page:** 闭关 on the empty card and on a tap of the 体力 ring; the
  chooser; 出关 · 领取 first on opening — her greeting and Ling's 前情提要
  wait for the tap — then the count-up. 银月 hears `seclude` and `emerge` as
  facts (voice.js, asked); Ling reads `page_did`. No version bump: the fields
  are new and default absent.

## Systems built 2026-09-21 → 24

Each a few lines of code truth; the numbers live in the named data file.

- **装备入局 — gear in the fight** (rules/cards.mjs, `cards.json → gear`). Each
  worn thing is one number locked at the door: a weapon's 器攻 ×0.5 →
  主灵根一击 (竹剑 +1, 铁剑 +2); the 本命法宝 starts at its sword and grows +1
  per 4 重 — only the bigger of sword and treasure counts; the sword's root and
  the treasure's element are lent roots whose 功法 may enter the deck; a 法衣's
  防 ×4 → 护体, armor that takes blows first and never carries out as a wound;
  a 佩's 抗 ×2 off each blow of its element (at least 1 lands); a 符 in the bag
  → one talisman card in hand, spent from the bag when played. Learned arts
  (arts.json) are not in fights.
- **组牌 — the deck** (rules/cards.mjs `deckFor`). From 结丹 on (before, the
  roots deal the ten; a pick kept from before waits — redesign-v2) the player picks up to ten
  from the cards they own (`state.deck`); a card taken out stays out
  (`deck_out`); the rest is filled along the realm's curve. 银月 is in hand,
  never in the ten.
- **伤势 · 羁绊 · 历练** — cut 2026-09-24 (redesign-v2 § 四); what they were
  is in archive.md. Every fight begins whole; her card stands taller by the
  chapters ended (`rewards.json → bond.lifts`: +0/+1 at four, +0/+2 at five,
  +1/+1 at seven); the save migrates at v5.
- **机缘** — a kind of 路上 since 2026-09-24 (§ 路上).
- **遇 and 抉择** (rules/road.mjs since 2026-09-24 — § 路上; meets.json). An arrival where the place
  holds nothing deals a 遇, veiled until Ling sets the moment: a find, a
  traveller's riddle, a road beast, or a 抉择 — Ling writes 2–3 ways
  (difficulty, stake wound|coin, win/lose lines), the rules rolled each way
  when dealt, the player taps one (3 体力), the `trial` table pays a win; a
  `wound` stake loses that share of 体力.
- **精英 and 杀招** (battle.js, creatures.json). An `elite` beast is its
  harder deck and nothing else since 2026-09-24 (redesign-v2 § 四; its full
  气血, 12 体力, half-again pay and second card are in archive.md). Every beast
  has a `signature`: at half 气血 it gathers a round, then lets it go once.
- **望气** (battle.js `insight`). The beast decides its next turn at the start
  of the player's; a player who has read 《望气术》 (上卷 at 筑基: its shape;
  下卷 at 结丹: every move and number) sees it on the fight's card — and on a
  day whose 问卦 is 吉 or 大吉, the shape of it without the scroll.
- **Mini-games, 炼丹 and 论道** (rules/tasks.mjs, scripts/games/, lundao.json).
  炼丹 and 洛书 · 华容道 · 七巧 · 五子 · 象棋残局 · 论道 are played on the stage,
  level by realm — as 今日传闻's steps, as a scene's boards, and at a place
  that hosts one when an errand in the book asks for it there (a market's
  notice); never as a daily chore (redesign-v2, 2026-09-24). A hosted game
  costs 3 体力 when counted and pays only the errand; 论道 (飞花令 · 成语接龙
  · 对对联) takes its 3 体力 at `open`, three good answers count, three misses
  end it.
- **Economy** (`rewards.json → _economy`, 2026-09-24 after redesign-v2). A
  normal 练气 day was ≈179 修为 (fights 64, six games 30, story and errands
  20, the rumor 65); the cuts alone made it ≈147. Now a fight pays 30 and the
  rumor 15 a step, 30 its finale, 90 its cap: ≈170. A fight is still the best
  修为 per 体力 (3.75; a rumor's step ≈2.5); tests lock both.
- **本命法宝 and 符 grow with the story** (rules/arms.mjs `growTreasure`,
  `giveCharm`; `rewards.json → growth`). One 重 per chapter ended and per
  rumor finale (九重 the top); a 符 from each rumor finale and from one won
  fight in three. 温养 · 强化 · 写符 were cut (archive.md).
- **Rules integrity** (rules.mjs, rules/tasks.mjs). One writer at a time
  (`state.json.lock`, retried up to 5 s, then `busy`); while a fight is open
  the world-changing verbs refuse `in-a-fight`; a beast beaten today is
  `subdued-today`, a scene fight already won is `won-already`; made grants are
  progress and wealth only and each exit pays once; Go back into an ended
  chapter pays nothing; errands and offers carry `pays` (what would land now).
- **The page's door** (rules.js). Page verbs go through the declared
  page_only `Verb` tool (POST /api/skills/lingjing/tools/Verb, argv flags) —
  the same rules.mjs, refused when signed out.
- **One opening, facts to Yinyue.** When 银月 walks with the player the day's
  greeting is hers (the `greet` facts) and Ling gets nothing until the player
  speaks; else the page sends `[scene] opened` once. Gains, wins, losses, the
  reading and 命格 are handed to her as facts; she writes the words. 命格
  takes no hidden model turn.

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
