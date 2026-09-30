---
type: design
reader: coding agent, contributors
guide: |
  How Lingjing — the game of 《九鼎录》 — is built: its systems, as they are.
  What it is, in one page, is product-spec.md. The book and every world rule
  (道统, 境界, 丹药, 功法, 仙界, 九宫九州, 九鼎与大劫, people, the three lines,
  the 定例) live ONLY in story/jiuding-lu/DESIGN.md; the plot and the 扣子簿 in
  story/jiuding-lu/OUTLINE.md. This file links there and never restates them.
  Superseded designs and this file's history are in archive.md.
status: 2026-09-30 — integrated (Hanli: 「可以」 to the plan): game systems only, current truth, each section tagged 【已建】 built · 【在建】 partly built · 【远景】 designed, not built — read off the code (scripts/, rules/, tests), not the text. The file as it stood before, 150k characters with every dated ruling log, is archive.md § doc/design.md as it stood 2026-09-30.
---

# Lingjing — design (the game)

## 规矩：设计可以大，建造只到当前卷 (Hanli, 2026-09-30)

The world is designed whole — nine 卷, three lines, nine 鼎缘人, 七情七境 — and
that is fine as a bible. **Only what the current 卷 needs gets built.** Every
section below says which it is; a 【远景】 section is a plan, not a promise.

**卷一 · 沉鼎 needs, and nothing else:** the road 石坳村 → 沉鼎观 → 漳水,
ending at the first 鼎 (the book's 第一回 to 第十回; the game's chapters
`00-prologue`, `00-waimen`, then `01-ji`); 练气 → 筑基; the pills 回春丹 ·
聚气丹 · 筑基丹 (market and 九转); the card fight; 差事; the 图鉴; 银月 (found,
asleep in the token, waking by the story). Everything past 筑基 and past 冀 —
元婴 and up, the other eight 鼎, the nine 鼎缘人, PvP, the table — waits for its
卷.

## 设计原则 (his, 2026-09-18 → 30; they outrank anything below)

- **Walk the known patterns, invent no vocabulary.** An open-world RPG as
  《魔兽世界》 does it — tasks, gear and arts that grow with the player. His
  line: **AI 驱动、卡牌策略、动态故事、聊天框版的魔兽世界，但世界是凡人的世界。**
- **The fight is 《炉石传说》's** (§ 斗法). Mechanics from it, names from our heritage.
- **A novel you play.** The book 《九鼎录》 is the story; the game plays it. Its
  passage for each beat plays on the stage in a dialogue box; Ling speaks only
  for what the player types and for what the rules hand her (guide/tell.md).
- **Genshin's shape** (his, 2026-09-28/30): tasks drive the story in the open
  world; key beats lock the map, then it opens wider; **one main line — the
  player is 沈小满**; 阿禾 and 赵昂 are playable 传说任务 sealed inside their
  own quests; the nine 鼎缘人 join as playable characters. No character or
  gender pick at the start (story DESIGN § 四·五).
- **Content is data, never prompt. The model proposes, the rules decide. The
  context holds only the moment.** (§ The shape.)
- **Ling speaks only when needed** (his, 2026-09-22): what only changes the
  save is the page's (接下 · 交差 · 买 · 卖 · 服用 · 佩戴); the main story is
  authored, 今日传闻 is hers; she never invents an errand.
- **The page shows facts, the model tells** (2026-09-21): a button that wants
  Ling is 问询 and opens the ask bar; everything the page holds, it shows.
- **No "death", only "退"** — beasts withdraw into the mist, 银月 steps aside.

## The shape in one diagram 【已建】

```
 Mac: the app page                              Phone: the chat is everything
 ┌─ stage (scripts/index.html) ─┬─ stock chat ─┐  ┌─ phone chat (Flutter) ─┐
 │ status · the scene card ·    │ Ling's words │  │ Ling's words           │
 │ dialogue box · 图鉴 · fight ·│ AskUser      │  │ the same cards, inline │
 │ boards · the book (书)       │ free text    │  │ (later)                │
 └──────▲───────────────────────┴──────┬───────┘  └───────────┬────────────┘
        │ Show / Look / page verbs     │ messages             │
        │                              ▼                      ▼
 ┌─ session: Ling, skill lingjing ────────────────────────────────────────┐
 │  SKILL.md = the game-master rules; guide/*.md handed in when needed    │
 │  context = rules + Look's brief + story so far + THIS scene only       │
 └──────┬─────────────────────────────────────────────────────────────────┘
        │ shell tools (rules.mjs <verb>)     page_only `Verb` (the page's)
        ▼
 ┌─ scripts/rules.mjs + rules/*.mjs ──┐
 │  reads  worlds/<id>/ (authored)     │
 │  writes data/ (this player)         │
 │  refuses what the state disallows   │
 └────────────────────────────────────┘
```

1. **Content is data, never prompt.** Chapters, scenes, creatures, rewards,
   answer keys are files; the model sees one scene at a time.
2. **The model proposes, the rules decide.** Ling changes the game only by a
   tool; `rules.mjs` checks every call against state and content; its answer
   is final. A refusal is `{ok:false, refused, say}` and changes nothing.
3. **The context holds only the moment** (§ A turn).

## Where things live 【已建】

```
skills/lingjing/
  SKILL.md                 Ling's rules + tool declarations (Verb is page_only)
  guide/*.md               Ling's per-topic guides (tell, look, road, fight, tasks, tale…)
  scripts/
    index.html, lingjing.css, lingjing.js   the stage
    stage.mjs              what stands on the stage (CARD_KINDS declare `holds`)
    cards.js, codex.js, pouch.js, lu.js, dialogue.js, memory.js, inkmap.js, fx.js …
    battle.js              the card fight, pure, shared by page and rules
    games/                 洛书 · 华容道 · 七巧 · 五子 · 象棋残局
    read.html, read.js, read-md.js   the book reader (书)
    rules.mjs              the rules CLI: lock, fight hold, dispatch
    rules/*.mjs            the rules by part (core, look, travel, road, errands, tasks,
                           cards, arms, companion, memories, ledger, tell, hui, locks,
                           festival, weather, seclusion, chores, codex, tale …)
    state.mjs              the save: load, migrate (MIGRATIONS), fitWorld
    content.mjs            load + lint a world
    vendor/                pixi, gsap (pinned; skills don't phone home)
  worlds/<id>/             one folder per world (jiuding = 《九鼎》)
    world.json dictionary.json ladder.json traits.json rewards.json
    creatures.json cards.json items.json herbs.json arts.json codex.json
    people.json companion.json memories.json meets.json festivals.json
    places/ seeds/ quests/ riddles/ tasks/ templates/ art/
    chapters/<id>/         chapter.json · beats.md · scenes/*.json
  story/jiuding-lu/        the book: 01–10 回, book.json, classics.json,
                           DESIGN.md (world rules), OUTLINE.md (plot, 扣子簿), notes/archive/
  data/                    this player (never in git): state.json, log.jsonl, saves/, worlds/
  tests/                   node --test tests/*.test.mjs; tools/battle-sim.mjs = balance gate
```

## Worlds, the dictionary, made worlds 【已建】

- **The harness holds the systems, nameless; a world is a story laid over
  them** (decided 2026-09-14). Ladder, progress, wealth, stamina, traits, bag
  and catalog, tasks, quests, resolvers, boards, places, seeds, made scenes —
  one implementation in the rules, never regenerated by Ling. A world picks
  which it uses and what it calls them. 《九鼎》 (`worlds/jiuding/`) is the
  first and the example. **Numbers that grow, never numbers that fight** —
  outside the card fight there is no HP.
- **The dictionary.** Systems have ids fixed across worlds (`progress`,
  `tier`/`step`, `wealth`, `stamina`/`pool`, `traits`, `name`, `cast`,
  `contest`/`duel`/`debate`, `tale`/`task`/`quest`/`shop`, the furniture:
  `alchemy` `pill` `breakthrough` `tribulation` `abode` `cauldron` `omen`);
  `dictionary.json` gives each its words, zh + en. Rules, save, tools and
  tests speak ids; Look returns `words`. 修为 appears nowhere in code. A world
  may not rename ids, card kinds, reward keys or refusal codes.
- **Style of 《九鼎》: 修仙 · 凡人流, no names from any novel.** `names.json`
  lists the names a world refuses, by book; the lint walks every string and
  every made scene (`not-playable: names 黄枫谷 (凡人修仙传)`).
- **Made worlds** (2026-09-15). Ling writes an outline in the template's
  shape (`templates/made-world.json`): card (`base: jiuding`), renamed words,
  ≤4 new creatures, one province of 4–8 places, the opening scene; `lintMadeWorld`
  checks it; it lives in `data/worlds/<id>/` and merges over its base. Verbs
  `build` · `worlds` · `travel` (the other save parked in `data/saves/`) ·
  `art` · `amend`. A made world plays only once every picture and its map are
  painted (`building`, `still-building`); a map is painted once by FLUX with
  the layout in the prompt, names laid on top by the page.
- **Made scenes** (2026-09-14). `templates/made-scene.json` is a worked
  example; `Make` lints a scene against the made limits (grants from the
  `branch` table only, no `set`/`value`/`key`/`game`/`offers`, 1–4 exits, ≤3 KB,
  ten a player); `Enter`/`Leave`; they live in the save (`state.made`).

## Content

### A chapter 【已建】

The game's data unit (not the book's 回): `chapter.json` (`id`, `opens`,
`province`, `gate`, `first_scene`, `title`, `summary`, and since 2026-09-28
`locks` — systems kept shut until a scene opens them — and `map` — what the
chapter opens of the map), `beats.md` (the one-page beat sheet), `scenes/*.json`.
Scenes carry `hui`, the book's 回 they play (rules/hui.mjs; the game says
卷/回, never 章 — 5b955c4). Built: `00-prologue` (27 scenes, 第一回–第四回),
`00-waimen` (21, 第五回–第八回), and `01-ji` … `09-yu` (six scenes each) — **the
old spine**, written before the book (银月's old bell backstory); `01-ji` is
to be rewritten from 第九回–第十回, the rest wait for their 卷.

- **Opening dates are local** — `opens` refuses a chapter before its day
  (unset while building). **A realm gate** holds the player at the peak until
  the gated chapter; **the breakthrough** is an exit flag (`breakthrough:
  true`, refused `not-at-peak`), shown as the tribulation card.
- **Story gates** (rules/locks.mjs): a chapter's `locks` shut a system; its
  verb refuses `not-yet` with the chapter's line and Look carries nothing of
  it — no cultivation, errands or 开府 before the sect (story DESIGN).

### A scene 【已建】

A setup and its exits; each exit has plain words (`means`) Ling matches the
player's text against, and the rules that apply. `content.mjs` checks every
field. The fields:

| Field | Means |
|---|---|
| `place`, `setup` | Where; what Ling narrates on entry. `{name}` fills the save's 名字; `{兄姐}`, `{伴}` (阿禾 · 石头) follow the name card's gender, `{灵根}` the roots — **to change** (§ Follow-ups). |
| `cast`, `show`, `lines` | Who is present; cards Shown on entry; hand-written lines. |
| `story` · exit `story` | The book's passage for the beat (zh + en), played by the dialogue box; Ling is handed only what she is owed (`tell`, rules/tell.mjs, guide/tell.md). |
| `panel` | The scene card, in words: a 2–4 line `caption` under the place (no picture since 2026-09-29). |
| `people` · `her` | Who the people strip shows; 银月's form before she walks with the player. |
| (Look's `scene.meet`) | Derived, not written: the 图鉴 entries whose `first.scene` this is, while none was met before. |
| `offers`, `buttons` | Tasks set here; the exits shown as taps (the rest are found by typing). |
| exit `needs` / `take` / `grant` | What must be held or done; what it uses up; what it pays (never over its table's cap). |
| exit `key` | A riddle or a pool: the day's is one unseen, `choices` offered; a miss brings the `hint`, a second shuts it till tomorrow. |
| exit `value` · `born` | The 名字 (+ gender) card; 生辰 → 灵根 (rules/roots.mjs, private, skippable). |
| exit `game`, `stamina`, `mark`, `ledger`, `set` | A board or fight the page witnesses; toil that costs 体力; a remembered choice; 恩仇簿 entries; state set. |
| exit `joins` · `sleeps` · `wakes` · `memory` | 银月 found, asleep in the token, woken; a colour memory granted (only from a 鼎). |
| exit `next` · `stay` · `ends` | Exactly one. |

The lint also refuses an unreachable scene, a chapter with no ending, a
string missing a language, a creature without its picture.

### Pacing 【已建】

Tables and caps are in base 修为; each tier carries a `pay` multiplier
(`ladder.json`), applied last: `paid = min(grant, cap) × root speed × pay`.
Thresholds: 练气 810 · 筑基 1,500 · 结丹 3,000 · 元婴 6,000 … 渡劫 66,000
(first pass; ~305 diligent days end to end). 体力 is the only daily limit
(the day caps went 2026-09-23). The economy is `rewards.json → _economy`: a
练气 day ≈170 修为; a fight is the best 修为 per 体力 (3.75); tests lock it.

### 境界 in the game 【已建】

The world's nine realms and their names are story DESIGN § 道统 (补丁①).
`ladder.json` says 合道 (Union with the Dao) · 归真 (Return to Truth) since
2026-09-30; the ids stay `body` · `maha` and names derive from ids, so saves
need no migration. 地仙 · 天仙 after 渡劫 is content for after the finale.

## The open world 【已建】

- **Places** — `places/<province>.json`, each `{id, name, tier, roads, has,
  line, map}`; `has`: a creature, seeds, a `shop`, a scene. **`Move {place}`**
  checks road and tier: `no-road` (with `near`, `toward`), `too-hard` (with
  `fitting` — 银月's 「还不是时候」), `unknown-place`, `road-closed`, `corridor`,
  each with `here`. Move walks the whole road (`via`), stopping only where a
  scene stands, and reads a name half said. A trip costs 体力 (3, +1 a road, ≤6).
- **The spine as waypoints.** A scene runs only where it stands (`atScene`;
  `not-at-scene`); Look's `waypoint` and the director's `thread` name the next.
  A corridor chapter (`corridor: true`) walks the player itself.
- **Ling as director.** Look's `director`: `here`, `near`, `too_hard`,
  `closed`, `thread`, `pool`, `seed`, and `choice` — the question Ling offers
  verbatim (the thread's place first, the other roads, 在此逗留, 问问银月).
- **Provinces open with their chapters** (`provinceOpen`); the map card draws
  the 禹贡九州图 plate (`world.atlas`), places as points, the player a dot.
- **The map opens in steps** (his, 2026-09-29): a chapter's `map` says what it
  opens — 序 石坳村 and 蒙山; 外门 the small area round 沉鼎观; then one road
  徐 → 冀; at 下山 (after 卷一) the whole 九州 unrolls (`unroll`). The beta
  ships through `00-waimen`.

### 剧情 × 开放世界 — tasks drive the story, key beats lock the map 【在建】

His rule (2026-09-28): 「通过任务，在开放世界中驱动剧情；关键剧情的时候关闭开放
世界探索，走剧情；走完之后才开放地图探索。」 Built: chapter `locks` and `map`,
the goal line with its countdown (`00-waimen` counts to the 大比), errands
that open beats. **Not yet:** a key beat as a declared lock (`state.lock =
{beat, since}` — the map shut while it runs), thread colours (gold 主线,
silver 人物线, grey 杂务), 银月's fragments placed on the map (from 下山 on),
dated world events.

### 路上 — no arrival is empty 【已建】

One system (rules/road.mjs, 2026-09-24): an arrival where the place holds
nothing of its own deals AT MOST ONE thing met on the road, veiled until Ling
sets the moment (Meet `reveal`; the page lifts it after her turn or 20 s):
**拾遗** (a find, 收下 on its card, no model turn), **路人问** (a riddle from the
road's pool), **拦路** (a nearby haunt's beast, same fight), **抉择** (Ling
writes 2–3 ways; the rules rolled each; 3 体力; a `wound` stake costs 体力),
and the daily **机缘** (within two roads for three real hours). Drawn by day,
place and save — a reload rerolls nothing; once per place per day; only where
the player stops. An arrival's order: what it finished (errands `met`, 交差
leads), what the place holds, else one 遇. Sources: `meets.json`, a place's
`meets`, the chance config.

### At a creature's haunt 【已建】

Look's `place.encounter` (no scene here): the creature, its fight
(`haunt:<id>`), `won`/`withdrawn` today, `tamed`, `likes`. A win pays the
`haunt` row once a day (`subdued-today`); **驯** takes the thing it likes
from the bag and adds it to the cast (`needs-item`, `already-tamed`,
`untameable`). Every card ends with a button (问询 at least).

## Items, the 储物袋 【已建】

- `items.json`: `{id, kind, name, about, art, buy, sell, sold, effect?}`.
  Kinds 丹药 · 武器 · 装备 · 法器 · 宝物 · 钥匙 · 材料 — for the shelf only.
  Effects: a key (`needs.bag`), a pill (pays `progress` through `pay`), a wear
  (`state.wear`), a pouch (+room); gear counts in the fight only as § 斗法 says.
- **`Trade {buy|sell|use, id}`** at a market (a place with `shop`), catalog
  prices, no 体力: `no-market`, `not-for-sale-here`, `no-stones`,
  `not-in-bag`, `key-in-use`, `not-usable`, `bag-full`.
- **储物袋** (2026-09-25): room in slots by realm (`pouch.by_tier`: 24/36/48/60),
  bigger pouches used once; story things take no slot; what does not fit
  waits at the 洞府 (`state.held`, 待取). The pouch panel (pouch.js): tabs,
  tiles, 服用 · 佩戴 · 卖 · 丢, the deck pane.

### 丹药 in the game 【在建】

The grades — 阶 by realm, 转 一至九, 品 by toxin, 仙丹, the furnace's origin and
its rule (always the owner's-realm 九转; 破境丹 one 阶 above), where herbs come
from — are story DESIGN § 六·五. **Built:** the furnace's pills are their own
items with `zhuan: 9` (`mend-pill-9` 第一炉, `qi-pill-9` from 药园残株), three
times the market pill's 修为, never sold; the pouch draws the 丹纹 (nine gold
strokes). **Not yet:** `tier`/`zhuan` on every made pill with a tamed effect
curve (the story's ×10ⁿ is never the game's number), 丹毒, 炸炉 for mortal
furnaces, the furnace making 破境丹, 仙丹 after the finale.

## 斗法 v3 — one card game, 《炉石传说》's shape 【已建】 (PvE; PvP and the raid 【远景】)

His direction (2026-09-18): *战斗系统参考炉石传说……那我们跟炉石对齐。* `battle.js`
is the pure core; the page draws it on the stage beside the chat.

- **Cards, v1: two kinds.** 灵兽 · 同道 (attack/health, 五行, **护主** = taunt,
  **入阵** = battlecry) and 功法 (one-shot: damage, sweep, heal, draw, buff).
  The hero power is **主灵根一击** (cost 2, once a turn). 银月 is a 3/4 minion
  in hand from the start, not in the ten. Weapons stay gear; 亡语, 冲锋,
  mulligan and 相生 discounts are v2.
- **The numbers** (gated, 2026-09-18): 气血 练气 20 · 筑基 26 · 结丹 32 · 元婴 40,
  a beast 0.7 of the player's; 灵力 from 1, +1 a turn, cap 6/8/10/10; hero
  power 1/2/2/3; deck 10, hand 3, draw 1, four on the board; **the beast has
  12 cards and withdraws when it runs out** (no win, no reward); 五行 ×1.5 /
  ×0.75; ~1.2 damage per cost single, ~0.7 each sweep.
- **The deck** (`deckFor`): ten along the realm's cost curve (练气 `1 1 1 2 2 2
  3 3 4 4` … 元婴 `1 2 2 3 3 4 4 5 5 6`), the same ten for the same save;
  from 结丹 the player picks (组牌, `state.deck`, `deck_out`).
- **得牌 — only cards obtained** (his, 2026-09-22): the starter of the roots at
  the root test, 银月 when she joins, a tamed beast's card, one card per win
  (a 功法 must fit the roots; beasts any element), `grant.card`. **灵根 binds
  功法, not 灵兽.** Every card has an element except pills. Old saves read the
  cards they should have.
- **Bosses: the legend is the verb** (2026-09-25): each tamed boss card carries
  its own 入阵 (夫诸 flood, 狍鸮 bite, 雷神 thunder, 无支祁 **chain**, 巴蛇
  **swallow**, 肥遗 **drought** …; battle.js EFFECTS).
- **精英** is its harder deck only; every beast has a `signature` gathered at
  half 气血 and let go once; **望气** shows the beast's next move (《望气术》
  上卷 at 筑基, 下卷 at 结丹, or a 吉 reading).
- **装备入局** (2026-09-24, `cards.json → gear`): each worn thing is one number
  locked at the door — a weapon's 器攻 ×0.5 onto the hero power, the 本命法宝
  (+1 per 4 重; the bigger of the two counts), lent roots whose 功法 may enter
  the deck, a 法衣's 护体, a 佩's ward, a 符 in the bag as a talisman card.
- **银月's card grows** with the realm (`rewards.json → her_card`) and by the
  ③ ⑥ ⑨ cauldrons (月华 · 月障 · 月落).
- **★ from 闭关** (§ 体力): each star −1 灵力 while cost > 1, then +1 to its number.
- **The door contract** (every fight and mini-game): entered from the world;
  pays 体力 at the door (a fight 8); **locks a loadout** (realm, roots, the ten,
  gear, the day's reading, 银月) that nothing outside changes; the world holds
  still (`in-a-fight`, FIGHT_HOLDS; Ling pushes nothing); the rules replay the
  plays and settle; the page reports `[scene] won|lost|withdrew <id>`; leaving
  is conceding. Word games (灯谜, 飞花令, 论道) carry nothing in — a new player
  can beat an old one.
- **The balance gate** (`tools/battle-sim.mjs`): a reading player wins ~76%
  in 12½ half-turns; the right element is worth ~36 points; gear full set
  ≤97%; each boss card −0.4…+5.3; **decision entropy** — most turns should
  sit at a 5–15% spread among the top three moves. Any bound crossed is a
  failing test.
- **Modes** (`battle.js` knobs): PvE today. PvP (levelled, no realm
  suppression, 10 each) and the raid (a boss with aggro; pull · help · damage)
  are 【远景】 — the table (§ Playing together) comes first.
- **Cards are pictured** (7 山海经 plates, 45 FLUX); the art never pushes the
  rule text off a small card.

## 差事 — the task system, 《魔兽世界》's loop 【已建】

**接 · 记 · 追 · 交** — accept, log, track, turn in (his ask, 2026-09-18).

- **Data, never invention:** `quests/<province>.json` (`from`, `say`, `need`,
  `grant`, `opens`, `then`); Ling voices the giver, never writes the terms.
  `need.kind` only what the rules see: `subdue` · `tame` · `carry` · `visit` ·
  `board` · `answer` · `chore`.
- **The loop:** 接下 where the giver stands (the page's tap) → `state.quests` →
  one `advance(state, event)` at every verb that can tick → **交差 where the
  player stands, the moment it is done** (his: no walking back) — except an
  errand from a person, handed where that person is (`not-with-giver`) → 撂下.
- **At most three open.** The 事 chip on the top bar (`事 3`, seal-red `可交 1`);
  the stage keeps one slim goal line; a row opens where it lies from `Quest
  info`, never Look. Arriving is an event (`met`, each with its `seen`).
- **Three sources, one card:** authored; the market's daily 榜文 (a template +
  a target within three roads, winnable, id = the whole errand); real-life
  chores (below), which take no slot.
- **Not copied:** grind, exclamation marks over the world, text nobody reads,
  invented errands.
- **One thing to tap at a time:** each stage card kind declares `holds` in
  `stage.mjs`; while something holds, no chat question; a test fails any
  kind drawn without saying.

## A day, 今日传闻, real-life chores 【已建】

- **The day resets three things** (redesign-v2, 2026-09-24): **问卦** (one
  reading, 三钱法 seeded by day and save; 卦力, 望气 at 吉, and 命格 if the
  player wishes — fight luck only), **the day's 人间功课**, and **今日传闻**.
  Beside them, as 体力 allows: the spine, errands, fights, the road.
- **今日传闻** (2026-09-24, replaced 奇遇): Ling writes a 3–5 step side story
  from a seed (`Tale seed`: province, games with their story uses, places,
  people known); `Tale make` lints it (real open places within reach, ≥3
  different games, lengths, language, refused names, **no number anywhere**);
  each step a board instance at its place, then a finale; pay from the `tale`
  tables, capped; one a day, an unfinished one stays.
- **Mini-games, 炼丹 and 论道** are played on the stage, levelled by realm — as
  传闻's steps, a scene's boards, or where an errand asks (3 体力); never a
  daily chore. 论道: 飞花令 · 成语接龙 · 对对联.
- **Real-life chores** (`~/.linggen/quests/<app>.json`, each app's **menu**):
  the game names no app; done is the app's own record (`done_at`), never
  self-reported; only due/done/when cross. The book shows the **fixed** chore
  (the workout) and **one pick a day** from the `pool` entries (hash of day +
  save + id; alternating 💻/📱); others done anyway are `not-today`. **开府**
  (`period: "once"`, the setup milestones) is its own section, paid once ever.
  Apps: CFO, DJ, Shifu, Health (writers named in each app).

## 体力 and 闭关 【已建】

- **The only limit on a day** (`rewards.json → stamina`): 100, full in five
  hours; empty rests until **20** (`rest_at`); shown as points, never a clock.
  Prices: a road 3 (+1 a road, ≤6), a story step 3, a fight 8, a 抉择 3, 驯 3,
  a mini-game 3 (at the count), 论道 3 (at open), make a scene 5, a world 10,
  amend 5; the market, errands, talk and 问卦 are free; the prologue's own steps
  cost nothing. A real-life chore refills its own amount (default 20).
  Empty: `no-stamina` with the hour; 银月 sends the player to rest.
- **闭关** (2026-09-24, rules/seclusion.mjs, page-only `seclude`): real hours
  (≤12) on ONE focus — 法术 (one ★ per 6 h, to ★3), 修为 (5 an hour, a 聚气丹
  ×1.5), 本命法宝 (one 重 per 8 h); 8 h fills 体力; the world holds still
  (`in-seclusion`); 出关 · 领取 on opening.

## 银月 in the game 【已建】

Who she is, her memories and the book's use of her: story DESIGN and OUTLINE
§ 五·五 · 银月的记忆. The game:

- **Found by the story**, not a quest: `joins` at the valley's dawn, `sleeps`
  in the fox token, `wakes` for beats; `companion.awake` is what the engine's
  presence reads (SKILL.md `absent_until`) — asleep, she is out of the chat,
  off the stage and out of fights, and her rare word is the story's.
- **Facts to her, words by her:** gains, wins, the reading, 命格, 闭关 are
  handed to her as facts (voice.js); the day's greeting is hers when she walks
  with the player, else the page sends `[scene] opened` once.
- **Her memories are the only colour** (哇时刻 ③, 2026-09-29): a memory comes
  only from a 鼎 (`memory: n` on the exit that brings it home; rules/memories.mjs);
  it takes the stage's main slot, one picture blooming from ink to colour in
  ~4 s, her lines under it, Ling silent but one line; the album in 录; the
  ninth sets `state.colour` and the ink comes off every picture. Only
  `art/memories/` may be colour (lint + tests). **Painted:** memory 1.
  **To paint:** 2–8 (tools/paint-memories.py; the draft prompts are verbatim in archive.md § doc/design.md as it stood 2026-09-30 § ③). Fragments (a place's
  `fragment`) are built, none placed yet.
- **The old 银月-at-结丹 quest** (the bell, the water, her riddle) is archived;
  its verb `ring` and the `alone` lines still run for chapters 01–09.

## 恩仇簿 — the world remembers you 【已建】

Rules/ledger.mjs (哇时刻 ⑤, 2026-09-29): an entry `{who, kind: 恩|仇|诺, what,
said, chapter, day, at}` in the save; `said` is the player's own words
(≤30 chars) and must be in what they typed (`LINGGEN_USER_WORDS`) — the rules
refuse anything else. Ling writes through **Remember** (`keep`/`break` settle a
诺); authored exits write `ledger`; scenes fill `{恩人}` `{仇人}` and their
`said`. Guide `tell`: real moments only, one callback a chapter.

## 图鉴 — the one picture system 【已建】

His ruling (2026-09-29): 「不用小人书的方式了，图片作为图鉴，展示人物、生物、物品、
武功、经脉、穴位等。银月一章一图就好。」

- **A picture shows what the reader does not know; the plot is never
  illustrated; the hero is never drawn.** (An audit found 23 of 28 小人书
  panels wrong.)
- **One codex, book and game:** `codex.json` resolved by `codex.js` — one
  entry per subject (kind, name, 1–3 lines, picture, credit, source, `marks`,
  `first {book, scene}`); people, creatures, items and arts are linked from
  their own files. Kinds: 人物 · 生物 · 物品 · 武功 and knowledge figures (经脉 ·
  穴位 · 洛书 · 五行, animated marks). An item has an entry only if unfamiliar
  or a named story object.
- **First appearance:** the book's `[words]{注=id}` puts the card after the
  paragraph of first appearance; the game's scene `meet` puts it in the main
  slot before the scene card; 录 has 图鉴 with empty slots for the unmet.
- **Pictures:** one house style (fine ink 白描, soft grey wash, warm aged paper,
  one subject, no text), checked by eye, re-rolled until right. 山海经
  creatures painted from their classical line, the woodcut kept as 「原图」
  (`art_plate`; plates from 胡文煥, 蔣應鎬 1597, 《古今圖書集成》, Commons,
  credited in `art/CREDITS.md`). Painters: Codex's image tool (2026-09-29) and
  local FLUX since Codex's quota ran out (his 「用flux吧」).
- `by_hero` gives 阿禾 two portraits by the hero's gender — **to change**
  (§ Follow-ups).

## The stage, the dialogue box, the book 【已建】

- **The stage is the skill's page:** the status strip (name, realm, 修为, 灵石,
  体力 ring), the scene card (place, caption, choices), the people strip, the
  goal line, one focus card at a time (creature, board, fight, map, item,
  codex, road, memory, homing …), the 事 chip, the 录 book, 书.
- **Taps are the page's; typed words are Ling's** (2026-09-29): a scene's
  choice Resolves on the page and Ling reads it in Look's `page_did`; the chat
  field says 「你想怎么做？」 (invite.js); Ling resolves free text against the
  exits. Buttons that want her are 问询 (the ask bar).
- **The dialogue box** (dialogue.js, 2026-09-29): the book's passage for the
  beat plays a paragraph at a time, speaker by speaker, in both languages,
  sized to the view; a scene's own passage restarts only in that scene.
- **Yinyue on the stage:** one device, one Yinyue. The game stage is
  voice-only (`?pet=1&stage=1&body=0`, engine a250a04) — no 3D body in the
  game.
- **The book** (`scripts/read.html`, 书 chip): `story/index.json` names the
  books (aliases for old ids), `book.json` the 卷/回 with 回目, `classics.json`
  the classics at each 回's end; `[words]{注=id}` and `《书》{典=id}` marks.
- **Choices are one question:** the chat owns the question; while an AskUser
  is open the stage hides every button of the same name.

## 哇时刻 — wow moments (his, 2026-09-29) 【在建】

His order of value: **5 > 3 > 1 > 7 > 6 > 2 > 4**.

1. **鼎归 · 地图晕开** 【已建】 — a 鼎 taken home spreads its 州 like ink on
   宣纸 (rules/inkmap.mjs, inkmap.js, fx.js in WebGL, SVG otherwise): mist ·
   wash · ink with rivers, a red seal and a moon; ~7.4 s, tap to skip; **御剑**
   to a homed 鼎 for 1 体力; 卷轴 unroll at 下山. Lesson: a reward must brighten,
   never darken.
2. **大场面** 【远景】 — one per 卷 at most, the whole stage.
3. **银月的记忆是彩色的** 【已建】 — § 银月 in the game.
4. **山海经 图录** 【已建】 — the 图鉴's creature pages; the readable picture book later.
5. **世界记得你** 【已建】 — § 恩仇簿.
6. **真实世界进游戏** 【已建】 — § 真实世界.
7. **你自己的小人书** 【远景】 — each chapter prints the player's own version.

Not borrowed: gacha.

## 真实世界 — festivals and weather 【已建】

- **节日** (rules/festival.mjs, calendar.js, `festivals.json`): Chinese
  festivals and the 二十四节气, plus 元旦 and 圣诞 (told in-world, a 西域胡商's
  feast), reckoned locally on the real day only; each is one data entry —
  stage dressing, Ling's opening line, a festival task, a small gift, 银月's
  greeting.
- **天气** (rules/weather.mjs): the engine's `weather` sense (the skill never
  goes online) hands the reading for the city the player set once; drawn as a
  layer (snow · rain · fog); said once when it changes; never harder, at most
  a texture.

## 画面效果 — PixiJS + GSAP 【在建】

The page stays web UI; **PixiJS** paints what must be drawn (ink wicking,
grain, particles, ink to colour); **GSAP** times one moment. Vendored, pinned
(`scripts/vendor/`); loaded only for a moment; one canvas per moment,
destroyed after; words never painted; no WebGL → the SVG/CSS version; one
module, `fx.js`. **Built:** the 鼎归 pilot. **Next, in order:** her colour
memories in WebGL, weather particles, the big set pieces, chapter transitions.

## Player state 【已建】

`data/state.json`, ids only (save **version 5**, `MIGRATIONS` in state.mjs):
`name`, `traits`, `tier`, `step`, `progress`, `wealth`, `stamina` +
`stamina_at`, `bag`, `cast`, `cards`, `deck`, `chapter`, `scene`,
`done_scenes`, `place`, `quests`, `chores`, `tale`, `known`, `ledger`,
`memories`, `companion`, `marks`, `story` (≤600 characters, Ling's
`Summarize`; the rules never read it) … `log.jsonl` records every change
`{at, verb, args, before}` — the audit and what `undo` restores. One writer
at a time (`state.json.lock`, then `busy`).

## A turn — what the context holds 【已建】

SKILL.md (~1.8k tokens, cached) · tools (~0.9k, cached) · Look's brief
(~150) · the story so far (~400) · this scene (~300) · the last ~10 messages
(~800): about 4.5k tokens a turn, most cached. Guides ride only when a result
names them. **One session per game day** (resume under 24 h, else fresh,
beginning with Look); long days fall to the engine's compaction.

## Tools 【已建】

Shell tools: `bash $SKILL_DIR/scripts/run-js.sh $SKILL_DIR/scripts/rules.mjs
<verb> --key=value …`, one JSON object each; an empty or `{{placeholder}}` arg
is dropped; no tool name may collide with the engine's built-ins. Declared
(SKILL.md): **Look · Progress · Story · Resolve · Judge · Practice · Tale ·
Move · Trade · Lundao · Tame · Refine · Ring · Divine · Lang · Make · Enter ·
Leave · Build · Restart · Go · Undo · Saves · Save · Load · Forget · Worlds ·
Travel · Amend · Art · Meet · Quest · Show · Remember · Guide**, and the
page's **Verb** (`page_only`, POST /api/skills/lingjing/tools/Verb — the same
rules.mjs, refused when signed out).

- **Ling drives** (his, 2026-09-16): restart, go to a scene, the map, worlds,
  saves — every one a logged verb; the destructive ones (Restart, Load,
  Forget, Undo) wait for one AskUser.
- **The library** — `data/saves/<id>.json`: day saves (two weeks), named
  saves, parked worlds.
- **The page is the only witness** to a board or a fight: it records the win;
  no Ling tool can pass one; Look marks it `won: true`.
- **Show** is a data tool: its args reach the page as a card.
- SKILL.md's laws: never a number the rules did not return; every change
  through a tool; map words to an exit's `means`; refuse in the world's
  voice; end with a way forward; real-life requests are Yinyue's.

## Online 【已建】 · server authority 【远景】

- **The rules run on the player's machine; the cloud stores.** SKILL.md
  `cloud: {save: [data/state.json, data/worlds], skip: [art]}`; sign in to
  play (the gate); the page syncs on entering and after a win; a write names
  the version it read, a stale one re-reads; conflict copies are kept. Only
  the game's state crosses — from other apps only a chore's done and when.
- **Rules at home cost nothing** while a cheat cheats only their own game.
- **【远景】 Server authority**, the moment players compare (a ranking, the
  table, trade): `rules.mjs` in a Worker on linggen.dev, content bundled into
  the site (chapters deploy on their date), tools as endpoint calls, the save
  cloud-only. Kept true now so nothing blocks it: rules pure inside, content
  through one loader, one verb one JSON answer, the page writes nothing but a win.

## Playing together — the table 【远景】

Several players in one chat, Ling as host (up to four friends over WebRTC
rooms; the host's models). Rewards land in each player's own save through
their own rules. Rounds by default, free talk that never wakes Ling, the first
tap answers a group AskUser. **Three judges:** a key (riddle, creature,
corpus), a board (the page witnesses), Ling (one turn for a couplet or a plan).
Teams: one, two, or each alone. **First set:** 灯谜 race, 山海经 guess, 飞花令,
奇遇 together, 斗法. **The engine needs:** a shared chat with members, the
speaker on every message, talk that is not a turn, group AskUser, a shared
board channel; later private cards and team chat. None of it names the game.
The full plan: archive.md § doc/design.md as it stood 2026-09-30 § Playing together.

## Access and pay 【已建】

Sign in to play; Linggen's free tier, then the $5 plan — the game included,
never sold apart. Any model plays (Linggen Cloud or the player's own).

## Memory, languages, testing 【已建】

- **No memory recall** in the game's session: its memory is the save and its
  `story`; a skill-bound session is the skill's on every surface (linggen
  `73a6cf5`). The game writes nothing into Yinyue's memory.
- **Languages:** `lang` in the state; every authored string `{zh, en}`; the
  player's own words set the language (`Lang`); English uses the fandom's
  terms (Qi Condensation, Foundation Establishment, Core Formation, Nascent Soul).
- **Testing:** the rules are pure and node-tested; the content lint; a
  model-free playthrough; the balance gate; **live checks use a scratch save**
  (`?save=test`, rules `--save=test`, `&seed=fresh|real|<fixture>`) — the page
  opens no chat and the player's save is never touched.

## Follow-ups from the 2026-09-30 rulings 【远景】

The book fixed the hero as **沈小满** (male) and **阿禾 = 周禾** (female), third
person, no gender marks, and the game follows 原神 (story DESIGN § 四, § 四·五).
The code still assumes a player-chosen name and gender here:

- the 名字 card — `value` exits with `gender: true` (`00-shiao`), `cards.js`,
  SKILL.md § the name card (line ~715: 「An exit with `value` (the 名字, with 男 · 女)」);
- `state.mjs` — the name/gender fields and the `{name}` `{兄姐}` `{伴}` fills
  (`{伴}` = 阿禾 · 石头 by gender), `people.json`'s `ban` slot, `festivals.json`'s `{伴}`;
- `codex.js` / `codex.json` `by_hero` (阿禾's two portraits), `read-md.js`
  (the book page filling `{name}` and `{男|女}` from the save);
- guide/tell.md (fit the words to the save's name and gender — kept until the code changes);
- the book: 第一回 and 第三回–第十回 still carry `{name}`/`{他|她}` marks and first
  person (第二回 is done).

## Open

- **Chapters 01–09 are the old spine** (银月's bell backstory, 冀 opening without
  the sect): `01-ji` to be rebuilt from 第九回–第十回; the rest wait for their 卷.
- **Flash-Lite lessons (2026-09-15):** a weak model tells a side story in one
  breath, drops authored lines in a long session, skips the last button.
- Offline play (the save needs the network) · the phone's chat · whether the
  plan's players get a larger 体力 pool · a healthy user gets a better Linggen
  (to talk through).
