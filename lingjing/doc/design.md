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
status: 2026-09-30 — integrated (Hanli: 「可以」 to the plan): game systems only, current truth, each section tagged 【已建】 built · 【在建】 partly built · 【远景】 designed, not built — read off the code (scripts/, rules/, tests), not the text. The file as it stood before, 150k characters with every dated ruling log, is archive.md § doc/design.md as it stood 2026-09-30. 2026-10-15: the day's decisions written in (pace and economy, fights, boards, 秘境 reruns, 饭桶, AI mini-games, backdrops, phone, testing); the replaced § Pacing is in archive.md.
---

# Lingjing — design (the game)

## 规矩：设计可以大，建造只到当前卷 (Hanli, 2026-09-30)

The world is designed whole — nine 卷, three lines, nine 鼎缘人, 七情七境 — and
that is fine as a bible. **Only what the current 卷 needs gets built.** Every
section below says which it is; a 【远景】 section is a plan, not a promise.

**卷一 · 沉鼎 needs, and nothing else:** the road 石坳村 → 沉鼎观 → 漳水,
ending at the first 鼎 (the book's 古一 to 古九 — eight 古 回 since 2026-10-02, nine since 古七 was split in two, Hanli 2026-10-07; the game's chapters
`00-prologue`, `00-waimen`, `00-zhuji`, then `01-ji`); 练气 → 筑基; the pills 回春丹 ·
聚气丹 (the market's are 一道纹 — 钱掌柜: 「我这儿只出一道纹」; the furnace's 九转 never on a shelf) ·
筑基丹 (the sect's one 一转 and the furnace's 九转 — never on a shelf); the card fight; 差事; the 图鉴; 银月 (found,
asleep in the token, waking by the story). Everything past 筑基 and past 冀 —
元婴 and up, the other eight 鼎, the nine 鼎缘人, PvP, the table — waits for its
卷.

**The game is 卷一, walled by data** (Hanli, 2026-10-05: 「游戏只到卷一……地图上后面8个州显示
灰色的，或者不能去就好了」; 卷一 plays wider instead — roaming, towns and markets, beasts).
Every chapter says its 卷 (`chapter.json` **`juan`**, 1 unsaid; 02-yan … 09-yu say 2 … 9 by
OUTLINE § 二). A chapter **waits** while `coming` or its `opens` is still to come; the 卷
open are those below the lowest that waits (world.mjs `juanOpen`, never below 1). Anything of
the world may say its 卷 the same way — **`juan`** on a creature, an item, a seed, an errand, a
road find, a 传闻 drop — and one of a 卷 not open is never met, shelved, found, dropped,
told or offered (`ofJuan`, applied where each is dealt: a haunt and the road's beasts, a shelf,
the road's finds, a beast's drops, a tale's seed and drop, an errand's offer). A province opens
only with a chapter of an open 卷 (`provinceOpen`): past 卷一 the other seven are shut —
greyed on the map, and a tap or a road there says the chapter's `map.beyond` line (「观主那张
舆图上，只画着徐、冀两州……」, `shutSay`). The lint refuses a `juan` that is not a 卷 number and a
卷一 errand that asks for a later beast or pays a later thing. When 卷二 is written, its chapter
drops `coming` and its things open with it — no code changes.

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
  gender pick at the start (story DESIGN § 四·五) — built 2026-09-30 (§ Follow-ups).
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
    games/                 洛书 · 华容道 · 七巧 · 五子 · 象棋残局 · 守夜 ·
                           暴雨 · 射鹿 · 洗髓 · 小周天 (the last four run in time: live-games.js)
    read.html, read.js, read-md.js   the book reader (书)
    book-diff.js           「只看改动」: what changed since a 回 was confirmed (rules/changes.mjs)
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
  tests/                   node --test tests/*.test.mjs; tools/battle-sim.mjs fight sims; tools/balance.mjs + worlds/jiuding/balance.json the economy model (§ Pacing)
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
卷/回, never 章 — 5b955c4). Built: `00-prologue` (27 scenes, 古一–古三),
`00-waimen` (21, 古四–古六), `00-zhuji` (6, 古七 + 古八 — one 回 until the 2026-10-07 split; 古七 h11 is 09-snow · 09-furnace · 09-year, 古八 h09 09-dabi · 09-qulao · 09-cliff, so 「第七回 · 完」 stands on 09-dabi: the winter, the furnace's
九转, the year as the book's four seasons — each exit a layer by `rise`, the last
`{layer: 9, full: true}`, in order by `needs.mark`, offered `once`, free of 体力 (主线, 2026-10-01) —
瞿老's last disciple, and the 筑基 on the cliff, `09-cliff`) and `01-ji` (7, 古九:
the two failed plans, the wedding, **冰夷's two dragons test him at `01-rise`** —
`foe-shuanglong`, a trial fought again at once — the seal, the first 鼎 with memory 1
and no breakthrough, 柳湾); both rebuilt from the book 2026-09-30 (his: 照这样重做冀州).
`02-yan` … `09-yu` (six scenes each) are **the old spine**, written before the book
(银月's old bell backstory), and wait for their 卷 (`juan` 2 … 9; 02-yan `coming`).
卷一's last card says what he did and then only 「卷二待续」 — no teaser of 卷二
(2026-10-05); the wait reads 「卷二 · 即将开放」.

- **Opening dates are local** — `opens` refuses a chapter before its day
  (unset while building). **A realm gate** holds the player at the peak until
  the gated chapter; **the breakthrough** is an exit flag (`breakthrough:
  true`, refused `not-at-peak`), shown as the tribulation card.
- **Story gates** (rules/locks.mjs): a chapter's `locks` shut a system; its
  verb refuses `not-yet` with the chapter's line and Look carries nothing of
  it — no cultivation, errands or chores before the sect (story DESIGN).
  `locks` is a list of gates `{until, systems, say}` (one object still reads
  as one); what is shut is the union of the gates not yet reached, and a shut
  verb says its own gate's line. 卷一's prologue (Hanli, 2026-10-22 「ok」):
  **开府 opens on meeting 银月** (`00-yinyue`), the rest on 入门 (`00-waimen`);
  between them the 事 chip holds the one open 一次 step alone, and the 灵石 a
  step pays are owed (`state.owed`) and land on the move the second gate opens.

### A scene 【已建】

A setup and its exits; each exit has plain words (`means`) Ling matches the
player's text against, and the rules that apply. `content.mjs` checks every
field. The fields:

| Field | Means |
|---|---|
| `place`, `setup` | Where; what Ling narrates on entry. `{name}` fills the world's hero (people.json `hero`: 沈小满 · Shen Xiaoman, by the text's language); `{兄姐}` (师兄), `{伴}` (阿禾) and the other `address` words are fixed; `{灵根}` the roots. |
| `cast`, `show`, `lines` | Who is present; cards Shown on entry; hand-written lines. |
| `story` · exit `story` | The book's passage for the beat (zh + en), played by the dialogue box; Ling is handed only what she is owed (`tell`, rules/tell.mjs, guide/tell.md). |
| `weather` · `_weather` | The story's sky here, one of rules/weather.mjs `KINDS` (clear · cloudy · fog · rain · snow · storm), tagged once where the scene's own text names it — `_weather` quotes the phrase. No field → the real weather. Never inferred at runtime. |
| `panel` | The scene card, in words: a 2–4 line `caption` under the place (no picture since 2026-09-29). |
| `people` · `her` | Who the people strip shows; 银月's form before she walks with the player. |
| (Look's `scene.meet`) | Derived, not written: the 图鉴 entries whose `first.scene` this is, while none was met before. |
| `offers`, `buttons` | Tasks set here; the exits shown as taps (the rest are found by typing). |
| exit `needs` / `take` / `grant` | What must be held or done; what it uses up; what it pays (never over its table's cap). |
| exit `key` | A riddle or a pool: the day's is one unseen, `choices` offered; a miss brings the `hint` and greys that answer; it never shuts (2026-10-15); its 留 · ✕ stand from the first moment (11-03; Resolve `pass`: the way on, no reward). |
| exit `value` · `born` | A name the player gives on the page's card (none ships since the hero was fixed; a `gender` on it is refused); 生辰 → 灵根 (rules/roots.mjs, private, skippable). |
| exit `game`, `stamina`, `mark`, `ledger`, `set` | A board or fight the page witnesses; toil that costs 体力; a remembered choice; 恩仇簿 entries; state set. |
| exit `joins` · `sleeps` · `wakes` · `memory` | 银月 found, asleep in the token, woken; a colour memory granted (only from a 鼎). The book's sleep is hers to keep: she is out of the 木牌 otherwise only for a round of a board that declares `needs: "her"` (a task row, a 传闻 game, 奇遇 entry; offered from the 木牌 — the page's `hergame` hold, rules/hergame.mjs; Hanli, 2026-10-19). |
| exit `next` · `stay` · `ends` | Exactly one. |

The lint also refuses an unreachable scene, a chapter with no ending, a
string missing a language, a creature without its picture.

### Pacing and the economy 【已建】 (Hanli, 2026-10-15)

**Target: ~30 minutes a day, one 回 a week** (Genshin's rhythm). Why: the story is the reward;
a 回 should last, not be binged.

**修为 grows with the layer** (Hanli 2026-10-16, option A — higher beasts and practice give more):
balance.json `layer_pay` scales the routine tables (功课, a haunt's or pool's fight, 闭关) by the step he
stands on — 练气 `1 1 1.2 2.4 3 3.2 3.35 3.45 3.55 3.6`, a smooth climb (a near-tripling between two
layers reads as a glitch); the story's grants are never scaled. It is front-loaded: 古六 holds him on
三层–四层 right after 古五's 二层 and a layer never costs less than the one below, so 三层 must pay
about twice 二层 for 古六 (thirteen scenes to read too) to fit a week. Fitted (`--fit`) so every 回 from
古四 is 5–7.5 typical days (古四 5.5 · 古五 4.5 · 古六 7.2 · 古七 6.0 · 古八 5.7) — 古五 a little fast,
its band's low end 4.5 (`bands.except`). A fight's
修为 past the 回's mark still turns to 灵石 at `convert.rate` — the scaled amount, so a higher layer's
overflow pays more.

| | |
|---|---|
| Daily routine (~15–20 min) | 功课 · 饭桶 (1 h cooldown) · 妖兽出没 at 后山 · 上山路 (one fight a batch since 2026-11-02, was 3; 1.5 h after it is fought; below) · other pools' fights (rest after 5 wins in a row) · 兽潮 (20 h cooldown, any hour, ≤ ~20 min, below) · 本王考考你 (1 round a day since 2026-11-02, was 3; any hour) |
| Story + its boards (~1 h a 回) | unlimited, at the player's pace, up to the 回's stage quest |
| A 回 | typical ≈4–7 days (古六 ≈7.4: thirteen scenes behind its quest), heavy ≈3–5, light ≈10–16 (体力 on) |
| 古一–古三 | fast — no quest; a first sitting or two |

- **The book's full text (2026-10-26).** The box plays every passage whole (the 节本 cut is retired), so
  reading takes about twice as long. The 层 are held at their numbers (`model.fit.hold` h05 · h07 · h08)
  and the bands of 古四 (≤ 8) and 古六 (≤ 10.5), and 古一–古三's ≤ 5 days, widened until the new small
  games land — then re-fit, Hanli's call.
- **冷却事件 — three cooldown events** (Hanli 2026-10-28: 「按你说的来」) 【在建】: 兽潮 (塔防, 1 h), 比武切磋 (格斗, 3 h, after
  宗门大比) and 妖兽出没 (斗法 at 后山 · 上山路, 1.5 h), each on a 主力 game. One mechanism, rules/events.mjs (balance.json
  `events.<id>`): the cooldown runs from completion (won, lost or skipped); a waiting event waits and never stacks; announced
  once (the tray or the 主页), never nudged; the day's first `full` (2) pay in full, then play_pay.replay's 50 · 10%.
  **妖兽出没** 【已建】 (rules/yaoshou.mjs): the two pools hold a batch of `batch` fights (1 since 2026-11-02, Hanli: 「降妖等也是, 都一局就可以了」; was 3); each settle takes one (won, lost or run dry),
  the last completes it, `yaoshou skip` lets it go; the pool waits between batches (world.mjs poolRestLeft, so the encounter,
  换一只, the match and the errands' hints wait with it); Look `yaoshou` (left/of, or the wait), a `waits` row, one 主页 row
  while a batch is up elsewhere. Pay: the fight's own (the beast's replay share kept) × the batch's day share. The model
  (tools/balance.mjs `--events`) plays the batches on 卷一's maps.
- **Every cooldown waits the same way** (2026-10-26; since 11-02 the tray draws them from Look's `tray`, § The stage): Look's `waits` lists each one he is waiting out —
  兽潮's, a pool at rest where he stands — as `{ id, title, shut, wait_min }`, the line in the
  world's words (the task's `shut`, creatures.json `hunt.rest_say` or a pool's own); the tray
  draws one row shape (cards.js waitRowHtml): name, line, 「约 N 时辰后」/「约 N 刻后」 ("back in about N h / min"),
  nothing to start. The 饭桶 keeps its own pane, which shows its full phase.
- **One model for every number.** `worlds/jiuding/balance.json` holds the 层 thresholds, the pay
  tables, the fight-to-灵石 rate and the cooldowns; content.mjs
  (`withBalance`) lands them where the rules read them. `node tools/balance.mjs` plays a light, a
  typical and a heavy player (`model.players`: minutes, sittings, what each does daily) through 卷一
  day by day and prints days per 回; `--fit` re-derives the 练气 thresholds the quests hold
  (练气 [0, 250, 480, 500, 520, 540, 560, 1150, 1170, 1190]); tests/balance.test.mjs holds the bands.
  The model plays 体力 on, as players will have it (on again since 2026-11-02).
  The model's minutes, reading speed and players are guesses — **balance changes are hand-played
  on the live page**.
- **修为 stage quest (阶段任务)** (rules/gates.mjs; ladder.json `caps.hui.<回>.gates`): the 回's next
  stage waits on 圆满 of the layer he holds — refused `stage` in the world's words; the 事 book
  shows it with progress, 下一步 and Ling point to the work that raises 修为; 银月 says her word
  when it fills. Only where he can walk away to earn it (never inside a beat's lock) — or, inside a sealed instance,
  where its own room hosts the work (practice boards; the lint holds it):
  古四 the 柴房 night @一层 · 古五 the 秘境's door @二层 and the 石室 @四层 · 古六 the 大比's eve @四层 · 古七 定风 @四层,
  the 沂水 night @五层, the autumn @六层 · 古八 腊八 @八层, 入秋 @九层. While a quest is ahead, grinding stops at
  the layer it asks (rules/cap.mjs heldBy; a gate is passed with its scene, or by a stay that marks it — 腊八). 古九
  has none. A scene passed is never gated again.
  **The 层 matches the book wherever it states one** (Hanli 2026-10-28: 「故事里是4层圆满, 游戏里保持一致」): a gate right
  before the beat, the layer earned by play there, the bar stepping with the text. 古五's 石室 (2026-10-31), two gates: wm-kaikai's
  way on (`sit`) on 三层圆满 right before 「第二天晌午，他冲开了第四层」, and wm-xiqi's (`draw`; the scene split off for 老蔫's climb
  and fall) on 四层圆满 right before 「第三天天快亮…再吸半天，第五层的门槛也许便摸得着了」 — the passages split word for word. Inside
  the 秘境 the 石室 hosts its two 主力 levels as practice (`shishi-lingqi` · `shishi-yinshen`), each gate says so in its own `say`,
  and a gated scene whose room hosts practice is waited in, never at its way in (gates.mjs entryGate · roomWorks). The rooms
  before it still have him at 二层, so 古五's cap holds there (`holds: [{layer: 2, until: 'wm-kaikai'}]`, rules/cap.mjs heldBy).
  The survey of every level 卷一 states (2026-10-31) found the rest matched by the gates already there (古四 一层 → wm-yan's 二层;
  the 秘境 door's 二层; 古六's 「四层了」; 古七 五 · 六 · 七层; 古八 七 · 八 · 九层圆满; the cliff's 筑基). Not gated: wm-baoming's 「二层巅峰」,
  which the cauldron drains in the same passage (二层 left empty) — a bar cannot be taken back. tools/balance.mjs plays a sealed
  instance on its own sources only.
  **Handed in** (2026-10-16, Hanli: 「七层圆满的任务大成了应该可以交任务拿奖励」): met, the row is 可交 with 交差 and
  pays balance.json `pay.stage` (60 灵石 — at 圆满 修为 cannot rise), once; then 已交. A quest behind him never
  handed in (crossed before stage quests paid, or walked through) is paid once on the next load, with a
  补发 row in the 事 book (rules/gates.mjs settleStages). The open row is never a layer he has passed.
- **The story never raises 修为 or 层** (Hanli, 2026-10-16: 「要让玩家去刷经验/修为等. 不要直接跳层」). No `rise`
  but 入门 (the 小周天, 零层 → 一层: 零层 holds no 修为, so nothing is skipped), no 修为 in a choice's grant, no
  `fill` to 圆满 (the 九转 lands 筑基小成, not its 圆满) — content.mjs lintEarned refuses them. Every rise the book
  had is a stage quest at that choice, or, inside a locked beat (第一路's 二层, 息壤's 四层), the next gate on asks
  that layer or more; `was_rise` keeps the old layer for the v8 migration. A choice's label names the beat,
  never a layer (「入秋」, not 「入秋 · 九层圆满」).
- **At 圆满, 修为 from fights and the 秘境 pays as 灵石** at `convert.rate`; it never spills into the
  next layer. The per-回 cap (§ 境界) still holds.
- **Where 修为 comes from:** 功课, fights (haunts, pools, 降妖/驯 errands, 榜文 · 降妖), the
  秘境, pills, 今日传闻, 闭关, the road's riddle/机缘, the story's grants and rises. **Chores pay
  灵石:** an errand declares `work` — `cultivation` (its core is a fight) or `labor` (the `labor`
  table: 修为 0, ≤20 灵石, maybe an item); the day's real-life pick pays 灵石 (`life`, ≤10), a 开府
  milestone 20 灵石. 闭关 is in the model: the typical and heavy players seclude 8 h a night (40 修为).
- **Every hand-in visibly gains 修为 or 灵石.** 零层's 功课 pays 5 灵石.
- **Old saves** keep their 层 and how full it stood (state v10 `paceLayer`, `thresholds_were` by
  version: a v8 save is read against the oldest ladder it was played on).

**格斗 in the story — every 大比 bout** 【已建】 (Hanli, 2026-10-28: 「故事里的战斗可以用格斗」; 2026-10-31): 古六's 宗门大比 is
bout after bout of 格斗 (games/fighter.js; doc/games.md § 格斗), each its own opponent painted frame by frame — 何七 (his 稳
emptied, the 喷嚏符 as the 符文) · 卢方 (the tallow on the rim, hook the stamp) · 秦雁 (thirty moves stood, then 迎剑's edge and
palm) · 马小宝 (the beams no guard stops, then six at the edge, the last caught) · 祁长松 (the final, lost in the book: stood through
his 护体灵光 until the wind turns). Ids, pay and marks kept; 阿禾's 底册 and 相克 reach the bout as lines on its lead card by his
marks (look.mjs dealOf `hints`). His hands carry two 结印 spells beside the KOF four: I 飞剑 (a sword on the 结印's loop onto her)
and U 符文 (a talisman that binds her where it lies), each its cooldown and its number. The story's other person fights followed
(10-31): 邹青松's chase (outlast; the fire snakes no guard stops), the 腊八 final against 九层师兄 (one blade, one breath), 老井 on the
河滩 (outlast; the finger, the mirror's beam) — each painted, each its own stage; the beasts and gods stay 斗法.

**切磋 · 演武场 — the daily bout** 【已建】 (Hanli, 2026-10-28: 「宗门大比的剧情过后, 可以弄一个每天一次的日常比武切磋, 让用户玩格斗…
和兽潮并列的一个时间触发游戏, 冷却3小时」): beside 兽潮, a plot the game alone has. After the 大比 beat (wm-jiaxin), at 沉鼎观,
a fellow disciple waits on the 演武场 for a bout of 格斗 (a sparring stage: her 稳 emptied she yields; the incense out, the
steadier wins). One bout a cooldown — 3 h from its end, won, lost or put down; a bout waiting is the same bout however
long. Bout n is dealt from the save's seed and n: the opponent met least (never last bout's when another is open), a
style never last bout's (稳守 · 抢攻 · 连招 · 运气: the AI's knobs), the climb by his realm, a frame line (who challenges,
why). Pays a fixed share of the layer × ★, the day's first two in full, then the replay's falling share. Rules:
rules/qiecuo.mjs; the knobs: tasks/world.json `qiecuo`, balance.json `events.qiecuo` (the cooldown events' one mechanism, rules/events.mjs); the opponents'
levels: games.json's 切磋 row (the 游戏厅's too).

**兽潮 — the daily tide at 沉鼎观** 【已建】 (Hanli, 2026-10-20: 「兽潮塔防可以作为游戏里才有的一个情节. 比如每天固定时间有兽潮
攻击沉鼎观. 在游戏里交代一下就好了」; 2026-10-26 「好, 按这样改」: players missed the clock window, so a cooldown as the 秘境
rerun has): a plot the game alone has, never the book's. 银月 tells it once, on the first night's lead (every so
often the 九鼎 veins swell and draw the beasts down; the outer disciples man the wall). Rules: rules/shouchao.mjs;
the knobs: tasks/world.json `shouchao`, its cooldown balance.json `events.shouchao` (§ 冷却事件, rules/events.mjs, since
2026-10-31; a save counted before keeps its clock).
- **When**: at any hour, once a cooldown — offered again `events.shouchao.every_h` (1 h since 10-28) after the last night counted (it was 20 h, so
  the same time tomorrow is open; inside it `win`/`task done` are refused `shut` in the world's words with
  `left_min`; Look keeps the row through the whole cooldown, past midnight, with `wait_min` and `shut`, and carries it in
  `waits` — § Pacing's one waiting row), from 古四's 小周天 (wm-zhoutian, his first 灵力); only at
  沉鼎观, never inside a beat's lock, the 秘境, a rerun or a fight.
- **Cost and pay**: its minutes in 体力 (5, `tide`; § 体力), taken as the night is counted — a lost night costs nothing, an empty pool
  shuts the board. By stars: 1★ 修为 10 + 灵石 5 · 2★ 20 + 10 + an herb · 3★ 30 + 15 + an herb (修为 on the
  `haunt` table, layer-scaled, past the 回's mark as 灵石; 灵石 the small-game ranks). A night missed is never
  punished: the seniors hold, only its pay is gone.
- **Words**: no time of day (2026-10-26, the coordinator for Hanli): titled 「兽潮 · 第N潮」 / "tide N", done line
  「兽潮退回了山里，墙下只剩爪印。」, the rows' leads time-free.
- **Levels**: each night the next row of 守墙关's table (levels/shouqiang.json) with a `tide` number and no `story`,
  whose beasts are all of his 回 (creatures.json `hui`, book order); a won night moves on, a lost one comes again.
  Past the rows: the rise on the last that fits (+1.5% `difficulty`, +0.002 `growth`, gaps −1% a night; a boss of his
  回 in the row's boss's place). A row added later is played first. Rows now: 兽潮 1–3 (野猪 · 狰, 古四), 4 (犰狳,
  古五), the 山门 (鬿雀 · 合窳, 古八).

### Pay — fixed numbers by the formula 【已建 2026-11-02】

Hanli 2026-11-02, on 1022 修为 in 68 minutes (1.5 layers at 练气四层): 「不要按照百分比给.... 给太多了」, then 「我是说参考百分比的
数值. 不能直接给百分比」; the formula, 「这套公式基本可以, 先记下来, 以后在调整吧」. **This supersedes 10-27's 「按照百分比奖励」:
nothing pays a share of the layer at runtime; % of the layer and minutes of play stay only as the reference tools/numbers.mjs
prints.** (rules/playpay.mjs; balance.json `master.xiuwei` → `play_pay.xiuwei`, derived by `node tools/numbers.mjs --apply`.)

- **Levels.** Each 层 is one level (零层 0, pays none) — past 练气 too since the nine 层 (2026-11-02: 筑基一层 L10 … 九层
  L18, 结丹九层 L27; levelOf); before, a realm's step of three 层 counted three (筑基小成 L12, 中成 15, 大成 18). A realm up: ×`sittings.realm` 1.3 to S and ×`rate.realm` 1.2 to R.
- **Sittings per level** S(L) = 2 × 1.1^(L−1); a sitting is 100 体力 ≈ 100 minutes. **修为 per 体力** R(L) = 2 × 1.05^(L−1).
  **Need** need(L) = R(L) × 100 × S(L) — the reference the ladder is read against (练气一层 400 by the formula, 470 on the
  ladder; 九层 1267 against 1010). The ladder's thresholds are not moved by this.
- **Reward** = R(content level) × 体力 cost × difficulty (normal 1 · elite 1.5 · boss/副本 2; a first clear +50%) × ★ (0.6 ·
  0.8 · 1.0) × level gap (−15% a level he stands above it, floor 20%; +10% a level below, cap +30%) × replay (the same thing
  the same day 100 · 50 · 10%) × 灵根 · 签 ×1.2 · 宜 ×1.3 (core.mjs amountsOf), × the realm's `pay` (ladder.json, 元婴 ×2 up).
  At 练气一层: a board (3 体力) 6, a fight (4) 8, a 兽潮 night (5) 10; a story board's first clear 9.
- **Content level** is his own unless the thing declares `level` (a task, a grant): place `tier` (0–2) is too coarse to be a
  level and beasts carry none, so routine play stands at his level (gap 1); none is assigned by hand yet.
- **No 体力 of its own**, priced in 体力-units at the same R (`master.xiuwei.units`): 人间功课 a day 5 (≈10), a week 10, a
  month 15; a day's east-wall tags 5 together; a night's 闭关 23.5 (47 at 练气一层); an errand's work its 5 minutes. A pill is
  its 转's share of 470 as units at R(1) (一转 ≈ 14 at 一层), riding R so 「抵N日打坐」 holds; what the book authors (a scene's,
  a quest's, a rumor's) is the number written. 切磋 a bout's 体力 × R × ★; 圆满 → 灵石 flat (`convert.rate`).
- **The story's 圆满 gates** (agent's pick, Hanli approved 2026-11-02 「可以, 按你说的做」): fixed pay made each gate days of
  grinding (第五回 ~40 typical days). A `gate` lump (`grant: {table: 'gate', progress}`, balance.json `pay.gate`) on the way
  into each gate scene — the only 修为 the story grants (content.mjs lintEarned) — and no replay falloff inside a sealed
  instance (`play_pay.replay_sealed`): each gate is about one to two days at his pace, every 回 in its band. Values and
  model days in status.md.
- Open (status.md): above 筑基 the formula's S grows fast (a 结丹 step ≈ 62 sittings) while the ladder's need and the
  realms' `pay` do not follow it; retuned with 卷二.

### 数值系统 — one validator, then a master table 【phase 1 · phase 2 已建】 (Hanli, 2026-10-27)

Hanli: 「所有物品, 任务的数值请写一个工具进行校验 … 全局校验游戏数值, 平衡战斗力, 游戏难易, 时长的. 以后我们调整难度,
进度可以统一调整, 不必单个物品调.」 The trigger was the 九转聚气丹's card: a fixed +60 while 练气一层 asks 470, and
「坊市的聚气丹抵半日打坐；它抵三日」 that nothing checked.

**Phase 1 (built): `node tools/numbers.mjs`.** It reads every number the way the rules read it, and changes none.
- **The pay comes from the rules themselves.** The tool sets a save at each layer and asks `paysOf`, `playGrant`,
  `errandGrant` and `chorePlay` what that layer pays, so the units follow any change to the pay rules.
- **The units:**
  - 修为: a share of the layer where he meets the thing, and the minutes of board play it equals there;
  - 灵石: minutes of the typical player's income, and the 回 by which he has earned a shelf's price;
  - a fight: the lookahead bot's win rate against its band (tools/story-fights.mjs);
  - time: the hours a layer asks, by the play rule (games pay 60% of the 修为 over 35% of the time), with and
    without a daily 功课, against the target, plus the model players' days per 回 and per layer.
- **Where a thing is met:**
  - a 回 holds him on its stage quest's layer, else on its cap's;
  - an item's first 回 is the earliest of a scene's grant, an errand, a board's gift, a shop on that 回's map, the
    开炉 pools, or a rerun's drops;
  - 零层 pays nothing, so anything met there is weighed at 一层.
- **Text checks:** a 「抵N日」 claim is checked against N nights of 闭关 at that layer, as the rules pay a night; the
  table of patterns is in the tool. Because 闭关 grows with the layer, the check is repeated on every layer.
- **Outputs:**
  - `--write` writes worlds/jiuding/levels/numbers.json for the 游戏厅's 数值 page (arcade-numbers.html?dev=1): the red
    list, four curves, and a table per source;
  - `--check` fails on hard errors only (a NaN, a negative, a price with no item, a buy-back over the price, a layer
    under the one below), and tests/numbers.test.mjs runs it;
  - the red list never fails a push;
  - the pace targets are read from balance.json `play_pay.hours` and `play_pay.games`, added with the percentage pay on
    2026-10-27; the fight bands and the red-list limits are `TARGET` and `LIMITS` in the tool until phase 2.

**Phase 2 (built 2026-10-27, Hanli 「数值系统继续做吧」): `balance.json` `master`, everything else derived.**
- **The knobs** (`master`; tools/master.mjs reads them):
  - `lines.gu` — a line is a ladder of its own (古 · 今 · 未来 each their own 修为 and realms, Hanli 10-27). 古 and 今
    are built (`lines.jin`, 2026-10-28: its own `need`, `hours` and `games`, below § each line its own 修为); 未来 gets a
    row of its own, with its own pace, when its pay is built.
    - `need`: 练气一层 470, ×1.1 a layer, ×1.3 into the next realm. Every pay is a share of the layer, so these are the
      numbers he reads, never the pace. 筑基一层 (1310) is above 练气九层 (1010); nine 层 a realm past 练气 since 2026-11-02.
    - `hours`: a layer's play hours (the games' rate), a curve (练气 2 h +0.5 h a layer; 筑基 4 h, +2 h a realm), then
      **fitted**: in the book's order a 回 whose typical days fall outside its band has the hours of the layers it grinds
      scaled until it lands (master.mjs fitHours). Today 古六's 三–四层 fit to ~1.0–1.2 h and 古八's 七–九层 to ~1.4–1.6 h:
      those 回 are long on reading, so their layers must go fast.
    - `games` 60% over 35% · `errand` 15% over 10% · `chore` (人间功课, 古-line income — Hanli 「算古线吧」) a day's 10%, a
      week's 20% · `seclusion.night` a night's 闭关 = 10% of the layer (ruling a: it was 40 × `layer_pay`, 23% at 四层;
      `layer_pay` is gone) · `pills` 一转 5% · 三转 15% · 九转 30% of the layer, ¼ a realm past its 阶.
  - `difficulty`: the fight bands (story 30–62%, pool 25–68%) and the bot's slack.
  - `economy`: `income` 3 灵石 a minute; a 修为 pill costs 5 minutes of income per 1% (聚气丹 75); gear 8 · 7 · 8 minutes a
    point (法器 · 法衣 · 佩); a shop buys back a third; `convert` 灵石 per 修为 past the mark, read at 练气一层, so the same
    at every layer.
- **Overrides**: `overrides` rows `{path, value, why}` (today the 妖丹's two-thirds buy-back), laid on last and listed.
- **`node tools/numbers.mjs --apply`** prints what the knobs make against balance.json (the fit, then the rows); `--write`
  writes it and runs the model, the red list and numbers.json again. tests/numbers.test.mjs holds the dry run empty, so
  no derived number is hand-set. `balance.mjs --fit` is retired.
- **Texts that state an amount**: a pill's card says what lands at his layer (「服下：修为 +N」, errands.mjs itemBrief);
  「抵半日打坐」 · 「抵三日」 are ratios that now hold at every layer (a pill and a night are both shares), and the test
  holds each at every 练气 layer.
- **The gate rule** (Hanli 10-27, at 古五's 渡口: 「渡口前应该让玩家接近2层圆满」): a 修为 gate never keeps him where there
  is little to do — the grind belongs in the content before it. `hours.fit.gates` (now wm-mijing) is fitted so the player
  who plays the book straight through (`model.session`: long sittings, no nights, no 功课) comes to it ≥ 88% full (二层
  0.77 h). Every gate is on the red list where its wait — the 修为 still owed on arrival ÷ a minute of what is reachable
  there — passes `LIMITS.gate_wait` (40 min), with what is reachable listed. The fit never makes a layer dearer than the
  curve: a 回 short of its band (古七, 4.5 days) is short on its book, and dearer layers would only lengthen its gates.
- **The model**: at 圆满 a 秘境 rerun is all 灵石, so the model runs one only while its 修为 lands (`model.rerun.at_full`);
  the story's boards pay their play pay on the way (`model.story_stars`), as the rules do.
- **Old saves** (state v13): the 层 kept, the bar and its stretch as full as they stood (ladder.json `thresholds_were["13"]`).

### 境界 in the game 【已建】 · each line its own 修为 【今 已建 2026-10-28; 未来 待建】 (Hanli, 2026-10-27)

**Each line has its own 修为 and ladder** (story `宇宙.md` § 三条线，各自一套修为与境界). 古, 今 and 未来 don't advance together, so one bar can't line up across them.
- Every line has nine realms under its own names:
  - 古: 练气…渡劫;
  - 今: 新生 · 立身 · 成器 · 立业 · 通达 · 担当 · 有容 · 知命 · 从心;
  - 未来: 应物…无上.
- Thresholds fit each line's own play time, and each line starts from zero.
- Its boards and errands pay its own 修为. The 今 boards stop paying nothing.
- The top bar keeps the character's name and that line's realm.
- **Levels never repeat across lines.** A game type may recur, but the layout or level does not, and difficulty continues from what the player has played (`rules/climb.mjs` counts across lines).
- **Items and cards** are per line.
- 人间功课 pays the 古 line's 修为 (Hanli, 2026-10-27: 「算古线吧」), the main line.
- **Built for 今 (2026-10-28, Hanli 「今线修为可以开始做了」; rules/lines.mjs):**
  - `ladder.json` `lines.jin`: its hero (`jin-shenmang`, 沈芒) and nine realms — 新生 九层 from 一层 (no 零层: no story
    lifts it), three steps (小成 · 中成 · 大成) a realm above, with 古's `phases` and `full` words. Tier ids are the line's
    own (`xinsheng` …), so `layers` and `play_pay.hours` key them beside 古's. No caps, no stage gates, no throw yet.
  - The save: the 古 stays the save's own `tier` · `step` · `progress` · `stretch` (no old save moves); 今 is
    `lines.jin {tier, step, progress, stretch?}`, from zero (state v14; fitWorld fills a line never held, and starts over
    one on a tier the line lost).
  - Pay: every 今 board (one shown or offered on a 今 scene, wherever it is replayed) pays the 今 its minutes by the same
    share of the layer as 古's (playpay.mjs playGrant on the 今 ladder), never 灵石, never the roots' speed or a cap. The
    古's story locks are the 古's: 沈芒's line counts from 今 · 一's first board, before 入门.
  - Look: `tier` · `progress` · `next` stay the 古's; `lines.jin` carries the 今's (hero, tier, progress, next). The strip
    (stage.mjs `barOf`, FURNITURE `line`) reads 「沈芒 新生一层 · 修为 x/y」 on a 今 scene. A 今 rise is one plain fact on the
    page (新生一层 → 新生二层): no seal, no rays, no 银月 (she is away). The 主页 and its gate bar stand on the 古 only.
  - Numbers: `master.lines.jin` (新生一层 300, the curve 1 h +0.25 h; `games` share 1 over time 0.5 — boards are the 今's
    whole 修为), fitted by tools/master.mjs `fitLine` so a reader who plays every 今 board of 卷一 at the model's ★ ends
    1.4 layers up (新生二层, four tenths); the numbers report's 今 column (`lines.jin`) shows where each 今 回 leaves him.
  - The phone runs the same rules; it shows no realm bar (its 主页 card reads `home.gate`, which never stands on a 今).
- **Design only (今 has no fights or shops yet):** items and cards per line — a line's bag, cards and shops its own; and a
  breakthrough between 今 realms (新生 → 立身) is not built: at 新生九层 the bar fills and waits.

The world's nine realms and their names are story DESIGN § 道统 (补丁①).
`ladder.json` says 合道 (Union with the Dao) · 归真 (Return to Truth) since
2026-09-30; the ids stay `body` · `maha` and names derive from ids, so saves
need no migration. 地仙 · 天仙 after 渡劫 is content for after the finale.

- **练气 in nine 层, every realm above it in three steps** (Hanli,
  2026-10-09; the stage words are the Daoist 小成/中成/大成 of 《钟吕传道集》,
  replacing 初期/中期/后期): 练气 has 一层 … 九层, and `phases` names them three
  by three — 一至三层 小成, 四至六层 中成, 七至九层 大成 (state.mjs `phaseName`:
  练气四层 is 练气中成; Look's `tier.phase`). 筑基 and every realm past it have
  no 层: their three steps are 小成, 中成, 大成 themselves (筑基中成).
  `full` is **圆满**, the full point of any step (`fullName`: 练气二层圆满,
  筑基中成圆满, 筑基大成圆满) — nothing more goes in until the next step; Look's
  `tier.name` says it whenever the step is full (`realmName`: held at a cap
  or the realm's top). Only the realm's last step at 圆满 is tried for a
  breakthrough, and its short form (`peakName`: 筑基圆满, 练气圆满) is the word
  the cauldron's gate and the breakthrough's `from` use (「鼎气要结丹圆满」,
  筑基圆满 → 结丹小成). Was 大圆满 until 2026-10-09 (a Tibetan Buddhist term).
  巅峰 is the spoken word for the same point (外门's 「九层巅峰」, 小满's
  「二层巅峰」) and never appears in a table. The ladder's history, all carried
  exactly in saves: past 练气 three steps until 2026-10-03; nine 层 from then
  (save v6, `threeToNine`, each old step split into three 层 summing to it);
  three steps again since 2026-10-09, with the pre-10-03 thresholds (save v7:
  `migrate` marks `ladder9`, `fitWorld` runs `nineToThree` — 层 1–3 → 小成,
  4–6 → 中成, 7–9 → 大成, the 修为 of the 层 already passed in that step, from
  `ladder.json → layers_were`, added to what it held; 结丹一层 · 222 is
  结丹小成 · 222, 筑基九层 filled is 筑基圆满). A v5 save is already on three
  steps and is never marked `ladder9`.
- **Nine 层 to count, three 段 to read, past 练气** (Hanli approved 2026-11-02:
  「以后可以仍然按层数算1-3=小成, 4-6=中, 7-9=大」 · 「9层用于计算, 小, 中, 大成用于显示」 ·
  「练气的UI不改了, 保持现在这样吧. 筑基以后再分3段UI吧」). Every realm past 练气 has nine 层
  again (`steps`, one threshold each, the master table's: balance.json `layers`, tools/master.mjs
  reads the step count from the ladder; each 段 asks what its step asked on three — `stagesSplit`, below) and `display: "stages"`: 一至三层 小成, 四至六层 中成,
  七至九层 大成 (`phases`, ids `stage_ids` xiao · zhong · da; state.mjs `stageOf`). Every name of a
  step reads the realm and the 段 — 「筑基 · 中成」, "Foundation Establishment · Middle Attainment"
  (`stepName`; `phaseName` the same) — so Ling, the 事 book, the gates and the breakthrough's `to`
  (「结丹 · 小成」) say the 段, never the 层; 圆满 only on the 段's last 层 filled (「筑基 · 小成圆满」 at
  三层; `fullName`), the realm's 圆满 (`peakName` 筑基圆满) as before. Look adds, on 筑基 and above
  only, `tier.realm`, `tier.duan` {id, name, at (the 层's place in the 段, 1–3), marks (its three
  thresholds), trial?} and `tier.layer` (「第四层」, the tooltip's): the strip's three-segment bar
  (stage.mjs duanOf, 47879a65) — 练气's Look, bar and names are unchanged (「练气四层」). A 层 inside a
  段 is the bar's: a pay's `levels` drops a step whose name does not move, and the rise seal fires on
  a 段 change only. **The 段 trial**: the step into 四层 and into 七层 is a light throw, no pill
  (ladder.json `breakthrough.duan`: base 75 + the realm throw's 体力 · 闭关 · 银月 · 五行 rows,
  floor/cap shared), thrown by the pay that carries him over the 段's last 层 (core.mjs pay's door,
  rules/breakthrough.mjs `duanPass`/`duanTried`, seeded as the realm throw); a failure costs only
  the hour (`cooldown_hours` 1): the 层 stays full, the 修为 counts on past its mark, and the next pay
  after the hour throws a new die. Look's `tier.duan.trial` gives the chance on the 段's last 层
  (`again_at` while it cools); a pay's result carries `duan`. A load never steps through a 段 door
  (cap.mjs settleHeld). 九层圆满 into the next realm is the realm throw, unchanged; 练气 has no 段
  trial. The caps' 筑基 is 三层 (h09's `story`, h10): 古九 grinds the whole of 小成. Old saves (v15,
  `stagesCarry`): every older carry runs on the three-step ladder it was written for (`ladderOf14`,
  `thresholds_were["14"]`), then step k is 段 k and the 修为 it held walks through the 段's 层 to the
  same point of it (小成 · 0 is 一层 · 0, 655 of 1310 is 二层 · 255, 筑基圆满 is 九层圆满, waiting at the
  cliff still), the stretch shared over the 层 by size. **The pace is kept** (the coordinator's call,
  Hanli delegated 2026-11-02: nine 层 are a way of counting, 「not a 4× grind」): each 段 asks exactly
  what its step asked on three (balance.json `master.lines.gu._need_stages`, `need.stage_split` 1.1;
  tools/master.mjs `stagesSplit`: 筑基 400 · 440 · 470 | 440 · 480 · 520 | 480 · 530 · 570, 4,330 in all;
  古九's grind to 三层 1,310 as before), so a 段's first 层 may ask less than the 层 below it (the
  numbers check reads a realm in 段 by 段); every 层 of a 段 pays at the 段's level (playpay.mjs
  levelOf: 筑基一至三层 L12, as 筑基小成); 气血 grows half a point a step as before, a sixth a 层
  (state.mjs hpStep). tools/balance.mjs's days per 回 are 38d5d800's to the tenth. The book's own
  「四层」 prose stays as written.
- **修为 caps per 回** (Hanli, 2026-10-05: 「游戏里修炼有个上限吧? 和故事对齐」;
  rules/cap.mjs, `ladder.json → caps`): each 古 回 declares how far the
  player's own work reaches (`tier` + `layer`, a 层 of 练气 or a step above it) and, where its scenes carry him
  further, its `story` — 古三 一层 · 古四 二层 · 古五 四层 (二层 until the 石室) · 古六
  四层 · 古七 六层 · 古八 九层 (story 筑基小成, the breakthrough) · 古九 筑基小成; a 今 interlude takes the 古
  before it; after 卷一 the save waits in 古九's chapter, so 筑基小成 holds
  until 卷二 gets its caps. At the cap the step fills (圆满) and further
  修为 from fights and the 秘境 pays as 灵石 (2026-10-15; § Pacing). **The way on is the story** (Hanli 11-03; agent's
  picks, Hanli delegated 11-03): Look's `capped` carries the world's line (`say`: the story opens the next step; what is
  earned past the mark is kept) and `story` (rules/cap.mjs capStory: `here` in the story's scene, else the goal line's
  words, place and road). The top bar shows no count then — one chip 「走剧情破境 › / Story next ›」 in the count's own
  room (no wider: the bar gives), its title the numbers and the line; a tap opens the 事 book at the story goal, which
  wears 「破境在此」 there, on the stage's goal line and on 下一步 (in the scene: 「剧情就在此处 · {place}」). A 修为 pill
  is refused `xw-full` with `caps.pill` (the card's `effProgressCapped`); at a 段 door it keeps the generic line. 银月
  reads `capped.story` off Ling's Look (SKILL.md `others_read`; Progress carries it too) — hers to tell, at most once a
  day while he grinds on capped (`place.yinyue.text`). The book makes no jumps since 2026-10-16 (§ Pacing): every layer is
  ground, each 回's stage quests hold the way on, and the cliff's 筑基 is his own throw. A
  breakthrough past `story` is refused `past-cap` (「火候未到」), and the lint
  refuses such data. A save already past its cap is never pulled down: it
  fills its own step and waits.
- **渡劫 odds** (rules/breakthrough.mjs, `ladder.json → breakthrough`): 筑基
  follows the book — `base` 10 (没丹硬冲，十个里只冲得过一个), `floor` 5. A pill
  weighs by its 转 (`pill.by_zhuan`, items.json `zhuan`): the sect's 一转下品
  官丹 +25 (still more fail than pass on it alone), the furnace's 九转 +80
  (near-certain, held at the `cap` 95); 鼎苔 raw +10 (`bonus_of`); a pill
  with no `zhuan` adds `bonus`.

## The open world 【已建】

- **Places** — `places/<province>.json`, each `{id, name, tier, roads, has,
  line, map}`; `has`: a creature, seeds, a `shop`, a scene. **`Move {place}`**
  checks road and tier: `no-road` (with `near`, `toward`), `too-hard` (with
  `fitting` — 银月's 「还不是时候」), `unknown-place`, `road-closed`, `corridor`,
  each with `here`. Move walks the whole road (`via`), stopping only where a
  scene stands, and reads a name half said. A trip costs 体力 (1 a road, ≤4; § 体力),
  except toward the story (§ 体力: 主线赶路不扣体力).
- **The spine as waypoints.** A scene runs only where it stands (`atScene`;
  `not-at-scene`); Look's `waypoint` and the director's `thread` name the next.
  A corridor chapter (`corridor: true`) walks the player itself.
- **Ling as director.** Look's `director`: `here`, `near`, `too_hard`,
  `closed`, `thread`, `pool`, `seed`, and `choice` — the question Ling offers
  verbatim (the thread's place first, the other roads, 在此逗留, 问问银月).
- **Provinces open with their chapters** (`provinceOpen`, a chapter of an open 卷
  only); the map card draws the 禹贡九州图 plate (`world.atlas`), places as points,
  the player a dot; a shut province (the atlas verb's `locked`) is filled grey and
  its name greyed (inkmap.css) — here grey reads as locked, which it is.
- **The map opens in steps** (his, 2026-09-29): a chapter's `map` says what it
  opens — 序 石坳村 and 蒙山; 外门 the small area round 沉鼎观; and at `01-ji`
  (after the Foundation) all of 卷一: home, the temple's area, 泗水 and 彭城, the
  road north from 泗水北岸 to 漳水南岸, and 冀 round 邺城 (2026-10-05). It holds after
  `01-ji` ends while 卷二 waits. A place of an open province the map leaves out is
  greyed (`closed`) and refused with `map.say`; a province of a later 卷 with
  `map.beyond`. The whole 九州 unrolls (`unroll`) only with 卷二's 下山.

### 观内 — 外门弟子，无令不得下山 【已建】 (2026-10-15)

Hanli (2026-10-15, 「可以，按你的建议做」; supersedes the 10-05 free-play area for 外门 and
the 内门 years): `00-waimen`'s and `00-zhuji`'s map is 沉鼎观 itself — 外门, 饭堂, 讲堂, 柴房,
演武场, 正殿, 执事堂, 藏经阁, 药园, 后山崖顶, 山门 — with `home` (外门). Below the mountain is
refused with `map.say` and greyed. Two ways past it, only the places on the way (world.mjs
`leaveOf`): **the story** — the spine's scene standing off the map (石门 for the 秘境); and **a
令** — an errand declaring `pass: {to, also?}` (the 执事堂's tags: 收船, 彭城的药钱, 云龙山的八味,
吕梁洪的水声, 林子里的蠪侄) hangs one in `state.pass`. One at a time; spent once the errand is
done or dropped and he is back inside, so never stranded. A save standing off every way is set
down at `home` with `map.back` (`back_story` when a scene left him there), said once. The 观's
chores (quests/guan.json — 码柴, 蒸屉, 对账, 晒经) pay 灵石; the night watch and the beasts pay
修为. 打妖的红牌五层以下不许揭 (古七): 林子里的蠪侄 asks `opens.layer` 练气五层. The 去往 list opens
on the painted 观 (places' `plate`, art/map/guan.webp — paint-guan.py seed 47; scripts/plate.js).
**货郎上山** (Hanli, 2026-10-15: 「按A做, 货郎上山摆摊」): the 坊市 being shut, a pedlar pays the
观 its 摊钱 (古六's precedent: 外人上不得山, 钱掌柜 let up at 大比) and sets up at the 演武场 for a
day, every third local day (places' `has.visitor`: `visits {every, offset}`, rules/visiting.mjs),
only while a walled map (`home`) holds the place. A shop's shape (`name · keeper`, `goods`, one
`odd` turning by visit), catalog prices; `buys {kinds, rate}` takes herbs and hides at 0.6 of
钱掌柜's. No 押宝. Look `visitors` feeds the 事 row, the 下一步 line and the plate seal's mark.
Not 石坳村's 走南路的货郎 (古二). No 符: a made thing is sold nowhere.
**今日棋局 · 东墙的杂役** (Hanli 2026-10-27: 「好像没什么任务能做, 感觉卡在了一个小地图」 → 「可以, 加吧」): each 观 place keeps a
pool of two or three of the kit's practice boards (places' `has.games_pool {from, today}`: 外门 拼图·五子, 讲堂 五子·拼图,
藏经阁 华容道·拼图, 柴房 华容道·拼图, 饭堂 拼图·华容道, 执事堂 五子·残局 beside 周衡's 灯谜); today's stand
there, the same on every device (rules/rotation.mjs, by the day and the place). **Dealt one at a time** (Hanli 2026-11-04:
「只有之前的玩了才发新的」 — the phone's 今日棋局 held seven unplayed, one a place): of all the plate's pool boards, ONE stands
as practice (rotation.mjs `plateDealt`, `state.plate_deal[plate]`), the same on Mac and phone; it stays through the day
turns until played — won, lost, ✕ or 留 — and only then is the next dealt (locks.mjs `played`). The tray, the 时辰 draw and
the plate's captions (Look `boards`) show only it; a board an errand asks for is hosted where the errand puts it. 执事堂's east wall (quests/wall.json, 07-第七回's 乌木牌) posts three 杂役 a day from twelve —
a board at a 观 place (the tag stands it there whatever the day's set) or a fetch-and-deliver walk — by the day and the
save's seed, never a tag two days running; `work: labor` pay; one undone lapses at day's end (rules.mjs fits the save).
Only boards that deal a new level a sitting — 象棋 only at 执事堂 (three endgames a level); 洛书 keeps its one gate.
**Not yet:** sparring at the 演武场 — it wants a duel with a person outside a scene (people are
fought only in the story's scenes; a pool never holds one), so it waits for person duels.

### 秘境 mode — a sealed instance 【已建】 (2026-10-15)

Hanli (2026-10-15, 「yes」): inside the 沉鼎秘境 the game played like any place — 阿禾's 坊市
errand in the 事 book, 观 places in 去往, the 寒露 chrysanthemums underground. A key beat may
declare `sealed` (chapter.json): from the scene after its entry through its last he is inside
(world.mjs `sealedOf`). Its `places` (rooms: real places on a `sealed` plate, drawn in ink by
plate.js) are the whole map; a room in `opens` stays hidden until that scene is done; a way out
is refused with `say` (「秘境未开，出不去。」). Not carried: each scene stands in its room, the
story sets him there as it is reached (the first one he walks down to from `home`), and between
scenes he roams the open rooms. The world outside is frozen, not lost (rules/sealed.mjs): the
errands in hand, the 令 (`state.pass`, untouched), chores and 开府, the 货郎, the 机缘, festival,
节气 and the sky are kept out of Look; errands count nothing; Quest, Tale, Meet, Seclude, 论道 and
御剑 are refused `sealed`. The save carries `sealed {id, since, scene}`; on the way out a 机缘
still live at the door gets back the time it had left. Look's `sealed`: the header (`label` and
the book's own `days` — 「沉鼎秘境 · 第二夜」), the room, and the scene's `goal` (the 事 book's
goal line and 下一步). The stage shows the rooms' paintings (backdrops.json `places` by room id);
the sealed tier outranks festival and 节气 (atmos.js `stagePick`), with no weather, season, wind or
particles. Nothing names the 秘境: the 外门大比 or a later 秘境 declares the same — sealed mode is a reusable shape, not this 秘境's code.
**At the door, not yet in** (Hanli 10-27 at 渡口: 「上面显示剧情是秘境里, 对吧」): while the story stands at the sealed beat's
entry scene, or a scene after it at the same door before the first room, Look's `door` (world.mjs `doorOf`) names the door's
place, the instance and the stage quest that opens it; the top line reads 「渡口　沉鼎秘境 · 石门 · 练气二层圆满即开」 and the
主页 says the same. A board hosted on the open map never wears a 秘境 title (华容道's own is 「挪出一条路」; the 岔口's is 「挤出石厅」).
**Rooms as a small dungeon** (Hanli, 2026-10-15: 「秘境太短了, 里面多加点战斗和小游戏等」): each room
holds something between the beats, in the book's places and never against it — 岔口 华容道
「挤出石厅」 (a stall board); 凶崖 the 犰狳 on the stair (pool `mijing-ya`, 见人则眠) and 下崖
(games/descend.js — the drip, the wet hold, the unknit rib), and it **holds the way down**
(places' `has.guard {holds, won {n, say}, task {id, say}}`: the walk stops there, Move refuses
`guarded`; pool wins counted in `state.hunted`); 断崖下 the 蛫 (the scene's); 崖壁 the 困阵's 洛书
(「九个小坑，正中那个是空的」 — 「三天。」 waits on it, `needs.task`); 石室 邹青松 (the scene's
trial); 暗河 合窳 and 犰狳 (pool `mijing-anhe`) and 拾遗 (games/gather.js — herbs and ore in the
cracks, 灵芝 and 灵石). Fights pay the haunt table (修为), boards their grants, gleaning stones and a
herb; their sums are balance.json's. A natural player: about 20 minutes inside.
**Reruns** (Hanli, 2026-10-15) — **retired 2026-10-28** (Hanli: 「按你说的来」): the outer rooms no longer reopen; the
day's cooldown events are 兽潮 · 比武切磋 · 妖兽出没 (§ Pacing), and the 秘境 comes back as a roguelite map run (§ 秘境探险).
A save inside a run leaves it on load (state.mjs fitWorld runLeft). What it was: after the story run the **outer rooms** (岔口 · 凶崖 · 暗河)
reopen **3 h after the last run ends** — one slot of the daily routine, through 古七/古八 too (the
rerun's `also`: the same 观). Each run rolls its spawns
(now and then an elite), its finds (鼎苔, 灵草, ore, a rare cache) and drops, gear among them. The
inner story rooms (断崖下 · 崖壁 · 石室) never repeat. A rerun is sealed the same way.
**In the economy** (2026-10-21): tools/balance.mjs plays the run as the routine slot it is — its beasts' 修为 on
the haunt table (layer-scaled; past the mark he may not leave, 灵石 at `convert.rate`), its spoils (drops by the
drop table, an elite's own odds; the 拾遗 find; the cache on three stars) valued by rules/rerun.mjs `runsPay` at a
shop's `sell`, a share sold (balance.json `model.rerun`); the spoils are never 修为, so no 回's days move. Over the
days it stands open the rerun is 修为 37–48% of a player's day and 灵石 65–81% (the typical player's one fight slot);
a run's spoils ≈ its fights' own 灵石 (0.94×). tests/balance-rerun.test.mjs holds the bands (`model.rerun._share`)
and checks `runsPay` against the rules' own rolls. 鼎苔 sells for nothing and the 饭桶 refuses it: counted apart.

### 剧情 × 开放世界 — tasks drive the story, key beats lock the map 【在建】

His rule (2026-09-28): 「通过任务，在开放世界中驱动剧情；关键剧情的时候关闭开放
世界探索，走剧情；走完之后才开放地图探索。」 Built: chapter `locks` and `map`,
the goal line with its countdown (`00-waimen` counts to the 大比), errands
that open beats.

**Key beats lock the map** (built 2026-10-21). A chapter declares its key
beats (chapter.json `beats`: an entry scene, walked to, then the scenes it
locks, a `title` and its own `say`). From the scene after the entry to the
last the story carries him; the save carries `lock: {beat, since}` (world.mjs
fitLock — stamped going in, `since` kept through the beat, let go on the scene
after; a sealed beat, the 秘境, stamps `sealed` instead); Look's `lock` gives
`beat`, `title`, `say`, `since`; Move refuses `corridor` in the beat's words;
the page greys every walk with that reason — the map's dots, the 去往 chip (a
tap shows the beat and its line, no turn), the 事 book's 去. The picks: the
prologue is a corridor whole; 外门's five (入门第一课 · 柴房 · 沉鼎秘境 (sealed) ·
外门大比 — the goal line's · 拜师); 筑基 (09-qulao → 09-cliff, beats.md's
「the key beat」); 河伯娶妇 (01-altar → 01-cauldron, one night from the 祠 to the
鼎; 邺城's errands stand on either side of it, `opens.before/done: 01-rise`).
tests/beat-lock.test.mjs walks every one.

**Threads** (built 2026-10-21): every errand declares `thread` — `person`
silver 人物线 (someone's own life: 阿禾, 孙二狗, 周衡's game, 古九's people of
邺城), `chore` grey 杂务 (a wall tag, a steward's job, a 榜文), `main` gold 主线
(an errand the story itself waits on; none yet). The goal line and the 阶段任务
are gold without data. The 事 book draws a line down each row's left edge in
its colour; the map and the 观's painted plate ring the place where a thread
is met (cards.js threadsAt — the goal's place gold, an errand's next count
silver or grey; the strongest wins). Linted to the three.

**An errand's words** (built 2026-10-28, rules/errand-line.mjs; Hanli: 「彭城的药钱,
没有提示」): every need is a step with its own place — 「带一株灵芝 · 彭城有卖 · 30灵石」
(where it is sold, from the shops he can walk to), 「在柴房玩「华容道 · …」」, 「到上山路降服蠪侄」 —
and a walk of steps says what is fetched (`need.do`, `{place}` in it: 「先到饭堂提一壶茶 · 再把茶送到讲堂」;
counted in order). Who takes it: `to: { place, who }` (彭城坊市的老丈) or a person giver. One next act
(`go`: move · buy · play · turn) for the 事 book, the 主页's 待办 and the phone. Items may say a `unit` (株 · 根).
tests/errand-line.test.mjs audits every errand.

**Approved, not built (Hanli 2026-10-23: 「先批准设计」; built with 卷二, not before the 卷一 launch) — 银月's fragments on the map (from 下山 on).** The
rules are there (a place's `fragment`, kept once where he stops,
rules/memories.mjs); none is placed. Place one per province of 卷二, never on
the story's road nor in a key beat's scenes — off the waypoint's path, so only
roaming finds it; the map draws nothing until it is found (no marker: the
find is the reward). Once that province's 鼎 is home, she may feel it — Look
`fragment_near` within two roads, a fact she words (「这附近……有我的东西」),
never a page arrow. Found: 录's album counts 残片 n/9 beside the memories — the only reward (no 灵石 or 修为; the find is the reward).
卷一 has none (the 观 is walled; 下山 opens the 九州).

**Proposal, not built — dated world events.** world.json `events`: `{id,
after: scene, days, at: place|province, thread, say, opens: errand|pool|visitor}`
— once `after` is behind him, the event stands `days` real days (the clock
the goal line already keeps, `mark_days`), a row in the 事 book in its
thread's colour with its countdown, its place ringed on the map; while a key
beat locks the map its clock does not run. Examples from the book: 邺城's
河伯 wedding day (after 01-arrive, the 十八); a 货郎's fair; a pool's beast
season. **Open: does a missed event pass without him** (the world moves on,
the 恩仇簿 remembers 迟了) **or wait for him?**

### 路上 — no arrival is empty 【已建】

One system (rules/road.mjs, 2026-09-24): an arrival where the place holds
nothing of its own deals AT MOST ONE thing met on the road, veiled until Ling
sets the moment (Meet `reveal`; the page lifts it after her turn or 20 s):
**拾遗** (a find, 收下 on its card, no model turn), **路人问** (a riddle from the
road's pool), **拦路** (a nearby haunt's beast, same fight), **抉择** (Ling
writes 2–3 ways; the rules rolled each; 1 体力; a `wound` stake costs 体力),
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

### 游荡的怪 — a stretch's pool, fought again and again 【已建】 (2026-10-05)

His: 「一片地方一个游荡怪物池，可重复打」. A province's places file declares
`pools: {id: {name, beasts: [{creature, weight, deck?}]}}`; a place joins one by
`has.pool` (a haunt or a pool, never both — linted). Where no scene runs, one
beast of the pool is up (world.mjs `poolBeast`: drawn by the day, the save, the
place and the fights settled there today, `state.duels['hunt:<place>'].n`); every
settle — won, lost, run dry — draws the next, each win paid by the `haunt` table with its drops and a card; each
fight its own shuffle (`game.deal`, cards.mjs fightSetup). A pool's beast is never
tamed there, never runs (`catch` is the story's), and a person or a boss is never
in one — bosses stay the story's single fights (冰夷双龙, the 大比). Only beasts of
an open 卷. 卷一's pools: **蒙山** (蒙山前山 · 断碑 · 黑松岭) 野猪 · 狼 · 熊, a
hunter's trade; **山门外的林子** (上山路) 蠪侄 · 狼 (古三); **药园外** (后山崖顶) 狰 run
wild · 野猪; **泗水边** (泗水岸 · 北岸) 蛫 (古五); **太行山口** 天马 · 领胡 and **漳水下游**
(柳湾) 人鱼 — the three of 《山海经 · 北次三经》 (马成之山 · 阳山 · 决决之水), used by no
later 卷 (story DESIGN/OUTLINE checked), quoted in their 图鉴 entries and
`unpainted` (no picture claimed; the lint lets an `unpainted` creature stand
without one). An errand for a pool's beast points to its stretch (`hauntsOf`).
Weighed to the fight's win band (§ 斗法: ~60% first try, from balance.json; the 2026-10-05
蛫 band of ~87% is retired). 天马 is 金 (马成之山「其状如白犬而黑头」, white is metal). 蠪侄 and 狰 are the story's
own fights too (古三's wood, the 药园): a pool entry may carry its own `deck`, how the
pool deals that beast (world.mjs `foeOf`, by the game's `hunt`; linted twelve known
cards), and the scene's game keeps the creature's — 蠪侄 99 · 98 → 87 · 88 (more 金梭,
two 羬羊 in front), 狰 99 · 97 → 90 · 84 (领胡's fire, one 山精). tests/hunt.test.mjs
locks the two apart.

**Farming rules** (Hanli, 2026-10-15):
- A pool beast beaten **rests 30 min** before the next comes. A beast he has **tamed is never drawn**.
- Pay: the haunt table's 修为 every win; once the layer is 圆满, 灵石 instead (§ Pacing). No daily
  thinning (Hanli, 2026-10-16: the 10-15 note meant only the 圆满 rule) — 体力 is the day's limit.
- Draws avoid what he met lately and favour the unmet and unowned; a duplicate drop converts to
  灵石 or materials.
- **Enough to farm:** ~10–12 beasts and ~30 finds per grinding 回. More 卷一-fitting 山海经 beasts
  (pictured from the classical woodcut plates, never painted; never a later 卷's creature) and
  painted ordinary animals (狼, 野猪, 熊 …).

## Items, the 储物袋 【已建】

- `items.json`: `{id, kind, name, about, art, buy, sell, sold, effect?}`.
  Kinds 丹药 · 武器 · 装备 · 法器 · 宝物 · 钥匙 · 材料 — for the shelf only.
  Effects: a key (`needs.bag`), a pill (pays `progress` through `pay`), a wear
  (`state.wear`), a pouch (+room); gear counts in the fight only as § 斗法 says.
- **`Trade {buy|sell|use, id}`** at a market (a place with `shop`), catalog
  prices, no 体力: `no-market`, `not-for-sale-here`, `no-stones`,
  `not-in-bag`, `story-keep`, `not-usable`, `bag-full`, `worn-elsewhere`, `not-wearable`.
- **按店进货 — a shelf is a shop's** (Hanli, 2026-10-05): a place's `has.shop` may
  be `{name, keeper, goods: [item ids], opens: {done: <scene>}, shut}` — its own
  goods only, nothing until `opens.done` is behind him (`shut` is what Look says
  meanwhile), the shelf card titled `name · keeper` (look.mjs `shopOf`,
  `shopOpen`); `shop: true` (older data, a made world) is still the province's
  shelf by items' `sold`. Before the 灵石 (the prologue's `wealth` lock) a shelf
  shows nothing. The people and the goods are the book's: 坊市 = **钱掌柜的摊子**
  (押宝 · 收当: 聚气丹 of one ring, 回春丹, 萝卜, the pawned 竹剑 · 蓑衣 · 望气术上卷;
  his **押宝** board, `games/yabao.js`, a `stall` (tasks.mjs `stallHere`: a hosted board played wherever its place stands, once a period, for its own pay, no errand needed) — four 门, three bets, his
  two habits read off a miss, a win pays a one-ring 聚气丹); 彭城 = **南门药铺**
  (灵芝 · 人参 · 回春丹; a plain apothecary — **济世堂** is the book's, in the 县城
  where 舅舅 keeps its accounts, 古二–古四, and the 县城 is not on the map, so no
  shop of the game takes its name; Hanli 2026-10-05); 石坳村 = the **货郎** (干粮 · 蓑衣 · 短刀);
  邺城 (古九) = the 东街市, and its own streets as places a road off the city:
  **老胡家豆腐坊** (shut under the 河伯's seal until the 漳水), **城南裁缝铺**,
  **香烛铺**, **城东客栈**, and **三老宅** (empty after the 漳水, found things only);
  downstream, **柳湾** (the fishing village under the willows). 冀's errands are
  古九's people (`quests/ji.json`), kept to the story's time by `opens.before` /
  `opens.done` (a scene ahead / behind): the innkeeper and the old drummer before
  the 漳水; 刘船匠's boat that does not leak and 老胡's bowl for 柳湾 after.
- **储物袋** (2026-09-25): room in slots by realm (`pouch.by_tier`: 24/36/48/60),
  plus the one bigger pouch he wears (Hanli 2026-11-04: 「储物袋不要叠加了…只能有一个
  储物袋吧」): 换上 takes it from the bag and swaps out the one he wore, which goes
  back in the bag as a thing to sell or drop; refused `pouch-short` when the
  smaller one would not hold what he carries. Named in the worn row's 储物袋 cell
  with its 格数 — 「下品储物袋 · 30 格」; 换上 says the room it gives, Hanli
  11-02. An old save with several on it wears the biggest on load (the first of a
  tie); the rest go into the bag, or to the door's queue. Story things take no slot. **Full** (Hanli 2026-11-02: 「待取感觉应该
  删掉」 — 待取 at the 洞府 made the pouch's size mean nothing; the shape is the
  agent's pick, Hanli delegated 11-02): what a fight, an errand, a grant, a
  秘境 or the 饭桶 gives waits at the door (`state.full_offer`, a short queue
  of { id, n, from }), Look's 「储物袋满了」 card on the bag's own tile — 丢一样
  换它 (the bag's grid; a tile drops that stack for it), 收下 once there is
  room, 不要了; nothing stashed, nothing silently lost, nothing else waits on
  it. A find on the road and a purchase are refused, as before. An old save's
  `held` goes into the bag on load while there is room, the rest to the card.
  The pouch panel (pouch.js): 储物袋 · 饭桶 · 旁炉 · 牌组; the tabs and grid
  are one component (bagGridHtml) — the 饭桶's 开炉 page and the card's swap
  draw the same bag. Tiles, 服用 · 佩戴 · 卖 · 丢. A story thing (`story: true`, e.g.
  紫须芝 carried back to 阿禾, 邹青松's letter) takes no slot, like a key.
- **剧情要用** (Hanli 11-03): every freeSlot thing (a key, `story`, her bell, a key the open chapter needs,
  a taken errand's carry) is never tossed, swapped out or sold — one refusal, `story-keep` (pouch.mjs
  `storyKeep`); its card says 「剧情要用 · 不占格」, no 丢 or 卖, and its dashed tile's tooltip says the
  same. `story: true` marks a thing only the story hands over that something later reads or the book
  tells him to keep: 爷爷的弓, 《吐纳经》 (Ling reads its 功课 daily), 《黄庭经》, 《河洛剑诀》 (agent's
  pick, Hanli delegated 11-03). Goods a shop or a beast gives again are not marked; the derived rules
  cover them while the story needs them. What he or she wears takes no slot either (wear.mjs).
- **杀人必摸尸** (the author, 2026-10-03: 「小满杀人后要捡走东西。游戏玩法」):
  a kill leaves 所得, in the book and the game alike. A foe's `drops` may be a
  list (an id twice is two of it); `card` names the card its win deals (not
  yet held) instead of the day's pick. **摸到的兵器，须是打斗里亮过相的** —
  no weapon the fight never showed. 邹青松 (古五, foe-zou): 下品储物袋 (+6),
  赤铜葫芦 (weapon, fire, 器攻 3) with its fire snakes as 火鸦, 敛息符 ×2 (a story
  charm, no fight effect yet), 回春丹 ×3, 紫须芝, the letter; the exit pays the
  钱袋's 9 灵石 and the 回气丹 card.
- **No shelf sells a 筑基丹** (2026-10-03, the book: 全观一年一颗, the 宗门大比
  champion's prize): `foundation-pill` (一转, `zhuan: 1`) and
  `foundation-pill-9` are `sold: []` — a gift, the sect's, or the furnace's.

### 丹药 in the game 【已建】

The grades — 阶 by realm, 转 一至九, 品 by toxin, 仙丹, the furnace's origin and
its rule (破境丹 one 阶 above its owner), where herbs come from — are story DESIGN § 六·五.
The furnace's pills are their own items (`mend-pill-9` 第一炉, `qi-pill-9` from 药园残株, the 饭桶's
三转s), never sold; the pouch draws the 丹纹 (nine gold strokes).

- **阶 and 转 on every pill** (2026-10-21): items.json `tier` (the realm it is for, a ladder id — 一阶 `qi`,
  筑基丹 `foundation`, 破境丹 `core`) and `zhuan` (一至九); the lint refuses a pill without them. A pill that pays
  修为 names its family (`of`), and balance.json `pills` sets the pay — `base` (its 一转 一阶) × `by_zhuan` × `by_tier`,
  folded onto `effect.progress` by content.mjs withBalance (no pill carries its own number, as with prices). **Tamed**:
  一转 ×1 · 三转 ×1.5 · 九转 ×3 (a quarter more a 转) and one 一阶's worth more a 阶 — the story's ×9 and ×10 are never
  the game's. The curve keeps the numbers the game had (聚气丹 20, 三转 30, 九转 60), each within its table's cap.
  Breakthrough pills declare no family (the throw reads their 转, ladder.json `by_zhuan`); the 丹囊's fight pills keep
  their `effect.fight` (the bands).
- **丹毒 and 补转** (rules/dandu.mjs; balance.json `dandu`): a 修为 pill eaten — 服用 from the pouch, the 闭关 pill, a
  breakthrough's pill — owes the turns its furnace left out (`owed` by 转: 一转 8, 二转 7, 三转 6; 中品 看体质 and 上品
  none — no 中品 pill in 卷一), `state.dandu`. Each turn owed takes one off the 体力 pool's top (state.mjs `staminaMax`,
  at most `cap` 30; the refill rate and the rest mark follow it, so he never rests for good). **闭关 = 补转**: the body
  makes up `cure_per_hour` 4 turns an hour, whatever the focus (the 出关 card says it). A pill of 九转 clears every turn
  owed (九转反能化毒). Look's `dandu` says it in the world's words; the pouch shows it. The 丹囊's 回春丹 · 回气丹 owe
  nothing for now (the one question for Hanli, status.md).
- **The furnace's 破境丹 is one 阶 above its owner** (fantong.json `breach` rows): the 饭桶's 筑基丹 rows open only while
  he is 练气 — none once he has laid the foundation; 结丹's come with 卷二's rows.
- **方子 that give more than one** (fantong.json recipes `n`): 古八's 九节聚气 — the 十年黄精 fed alone gives three
  三转聚气丹, the book's pot (§ Per-回 › 古八).
- **炸炉 · the 旁炉** 【已建】 (2026-10-31; rules/panglu.mjs, worlds/jiuding/panglu.json; tests/panglu.test.mjs): the
  book's 凡人丹炉十炉炸七 belongs to a furnace he tends himself — the 丹房's 旁炉, his from 09-laba (「料你自己碾，火你自己看。
  炼糊了，碾了做药引。」). It stands where a place `has.furnace` (the 药园: the 丹房's scenes stand there), opens once
  `after` (09-laba) is done, and shows as the 储物袋's 旁炉 tab (Mac panglu.js; phone lingjing_today.dart). One herb a
  batch, from `herbs` (the 丹房's 下脚料 黄精烂根 · 黄芪残株 and the plain herbs of the hills — none a shelf sells, so no
  shop arbitrage); `per_day` 2 batches (the book: 一个月三四炉). The rules roll each batch from `bands` by how many
  batches this save has fired (`state.panglu.n`), seeded by the save, the day and that count (firing again never
  re-rolls): 炸 (nothing; the herb and 2 体力, rewards.json stamina.cost `panglu`) · 糊 (药引 `yaoyin`, a material — a herb
  to the 饭桶) · 一转 (the 聚气丹) · 二转 (`qi-pill-2`, 5.5% of the layer). 炸 falls and pills rise with the count
  (40 · 30 · 20 · 10% 炸 at 0 · 4 · 8 · 16 batches); 闵丹师's 「首尾武，中间文」 is said on the batch that reaches `lesson`
  (8), and only bands from it have 二转. A batch pays no 修为 — a pill eaten does (丹毒 as any). Never the 饭桶's
  lottery: the 饭桶 is 老君's and never 炸s. tools/numbers.mjs meets its pills at 古八 (h09); the pacing model does not
  count it (two batches a day, ≤ ~5% of a layer at the best band). The odds, `lesson`, `per_day`, one pill a batch and
  the 药园 as the furnace's place: the agent's picks (Hanli delegated, 10-31).
- **仙丹** 【已建】 (2026-10-31; tests/xiandan.test.mjs): 仙阶, no 纹, its own glow (story § 六·五); never in 卷一. One item,
  `xian-pill` (仙丹, family `qi`): `tier: "xian"` — a 阶 off the ladder that balance.json pills `by_tier` names (the
  lint lets such a pill stand only with no `zhuan`); its share `by_tier.xian` 0.4 of the layer (above 九转's 0.3; from the
  master table, master.lines.gu.pills.xian); never `below` him at any realm (仙气自己找路, playpay.mjs pillBelow); it
  clears 丹毒 as a 九转 (balance.json dandu `clears_tiers`). The pouch draws it with no 纹 and a glow (`glow` on its
  brief). The 饭桶 gives one only after 卷一's last scene: a pool row with `after: "01-end"` (rules/fantong.mjs rowOpen),
  so the 图鉴 of a 卷一 save never counts it. The share, one item, and the pool row (weight 1, 品阶 4): the agent's picks
  (Hanli delegated, 10-31).

**丹囊 — 灵石 buys pills for fights** (Hanli 2026-10-16, 「灵石要有用」): at a fight's door he packs up to
three pills from the bag (his last pick remembered); in the fight each is a free action, one a turn
(battle.js § pills): **回春丹** +10 气血 to the member he chooses (himself, 阿禾, 孙二狗), **回气丹** +3 灵力
now (the book's 「丹田空了吞一颗」). A pill taken leaves the bag at the settle, win or lose; the beast
never has one; the pouch is kept per member for a later seat. Sold at 南门药铺, 钱掌柜's, 冀's 东街市 and
every province shelf: **回春丹 15 · 回气丹 10**. **Every shop price lives in balance.json `prices`** (folded
onto the items; items.json carries none). The fights are weighed so the lookahead player wins about
**45% with no pill and about 65% with two** — never a money wall (tests/fight-band*.test.mjs, both ways).
`tools/balance.mjs --wealth` prints the 灵石 flow per player (pills a fight: light ½, typical 1, heavy 1½).
**伤势 does not carry:** every fight begins at full 气血 (cut 2026-09-24), so a 回春丹 matters only inside one.

### 饭桶 — free play 【已建】 → superseded by 开炉 (2026-10-20)

Built as 喂饭桶 · 开炉: up to three things and 灵石 (10 a 层 of his realm) in, the lid pressed, one thing out, 1 h cooldown — games/kailu.js,
rules/fantong-roll.mjs, fantong.json; doc/games.md § 喂饭桶 · 开炉.
On one page with the bag (Hanli 2026-11-02; fantong-kailu.js): the 饭桶 (its canvas, three places, 灵石, 开炉) and the
储物袋's own tabs and grid — side by side on the Mac and a phone held sideways, stacked on a phone held upright (开炉
held at the bottom); a tap picks a tile and shows what it is (kind · effect · about, the 储物袋's lines; held back, why) with 「放进饭桶」, which puts it in the first empty place (Hanli 11-02: 「防止玩家丢错东西进饭桶了」); a drag on the Mac drops it straight in; a tap on a place returns
it; what may not go in stays, dimmed, with the rules' reason (`held_back`: 穿着 · 剧情要用 · 留 n 个X用 · 开炉要用),
and with three in the rest say 最多三样. While it chews and reveals the bag folds away.

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
- **得牌 — only cards obtained, every one from somewhere** (his, 2026-09-22; 2026-10-16: 每张牌都在剧情里收集或者购买):
  each card's `from` (cards.json, 书 or 游戏) — a scene left, a board won (射鹿 → 一箭, 吹鹅毛 → 吐纳), the beast that
  fought with it beaten, a thing bought at 钱掌柜's, a beast tamed. Nothing at random, no starter at the root test (娘的饼 ·
  一箭 · 吐纳 come on the road, 褚先生's five at wm-qianye); under ten held, two of a card. A card gained shows big over the
  stage with its line of 出处 and flies into the 物品 chip (card-reveal.js), then wears 新 in the hand until played. The
  full table and the as-built notes: **doc/cards.md**. **灵根 binds 功法, not 灵兽.** Every card has an element except
  pills, 符 and a mortal's own skill (before the stone). Old saves keep every card they held, renamed ones mapped.
- **小队** (cards.md § 5, 2026-10-16): each side is a row of members with their own decks drawn in turn into one shared
  hand, one 灵力; a card is played by its owner (its seal in the hand); a member at 0 is 退 and their cards leave the
  hand; 孙二狗 guards (嘲讽), 阿禾 heals the most wounded and binds; the lead's 退 is the side's. Who stands with him is
  party.json (`by_hui`: 古七 阿禾 + 孙二狗, 古八 on 阿禾; a scene says its own), 银月 from 卷二. A lone beast is a party
  of one; the model keeps each member apart so a seat can later be another person's.
- **Bosses: the legend is the verb** (2026-09-25): each tamed boss card carries
  its own 入阵 (夫诸 flood, 狍鸮 bite, 雷神 thunder, 无支祁 **chain**, 巴蛇
  **swallow**, 肥遗 **drought** …; battle.js EFFECTS).
- **精英** is its harder deck only; every beast has a `signature` gathered at
  half 气血 and let go once; **望气** shows the beast's next move (《望气术》
  上卷 at 筑基, 下卷 at 结丹, or a 吉 reading).
- **装睡** (2026-10-16, a beast's `feint`, battle.js § asleep): for its first `turns` turns it
  lies still — plays nothing, strikes nothing, never gathers. A blow not of a `pierce` element
  glances (lands `lands`, counted); with `pierce_binds`, a card that `binds` (青藤缚, 无支祁) played
  at the beast holds it — that turn every blow goes in. It wakes with its 杀招, `per_glance` harder per glance. The
  stage says 装睡 and 擦过. 犰狳's 见人则眠 is one (a trap, never a heal: 金克木 goes in); any
  shell-hider or dead-player declares the same.
- **装备入局** (2026-09-24, `cards.json → gear`): each worn thing is one number
  locked at the door — a weapon's 器攻 ×0.5 onto the hero power, the 本命法宝
  (from 结丹 only — 练气 and 筑基 carry 法器 in the weapon slot; a treasure a
  save holds below 结丹 is kept but unread: no card, growth, 温养 or lent root,
  arms.mjs `boundOf`; +1 per 4 重; the bigger of the two counts), lent roots whose 功法 may enter
  the deck, a 法衣's 护体, a 佩's ward, a 符 in the bag as a talisman card.
- **银月's card grows** with the realm (`rewards.json → her_card`) and by the
  ③ ⑥ ⑨ cauldrons (月华 · 月障 · 月落), and by what she wears (§ 银月 in the game).
- **★ from 闭关** (§ 体力): each star −1 灵力 while cost > 1, then +1 to its number.
- **The door contract** (every fight and mini-game): entered from the world;
  pays 体力 at the door (a fight's 4); **locks a loadout** (realm, roots, the ten,
  gear, the day's reading, 银月) that nothing outside changes; the world holds
  still (`in-a-fight`, FIGHT_HOLDS; Ling pushes nothing); the rules replay the
  plays and settle; the page reports `[scene] won|lost|withdrew <id>`; leaving
  is conceding. Word games (灯谜, 飞花令, 论道) carry nothing in — a new player
  can beat an old one.
- **Win rate** (Hanli, 2026-10-15): a first try wins **~60%** (band 52–68%; tutorial fights may
  sit easier); geared ≈70%. Difficulty comes from the foe, never from penalties. A story fight
  retries at once; a field beast lost to is locked for the day. The band lives in balance.json;
  `tools/battle-sim.mjs` checks it (replaces the old ~76% reading-player gate). Decision entropy
  still holds: most turns a 5–15% spread among the top three moves.
- **Deck 10** (3 in hand at start, 银月 extra) at every realm for now; bigger decks by realm later.
- **Foe AI never plays a card with no effect.**
- **The board, read plainly:** one legal target → a tap acts at once; every body has its own id
  (twins never confused); HP shows current/max; 参悟 and the like show their 反噬 cost when the
  deck is empty.
- **A hit, in order:** travel → hit with its element's effect + the number → fade → reflow. Five
  element hit effects, one each.
- **Persons are persons:** 卢方, 邹青松 … are a 比试, and beaten 「他退了下去」. A beast's win line
  is one of twenty, picked by the fight's seed.
- **Portraits** crop to head and shoulders for `art/people/`.
- **Gear** (兵器 · 法衣 · 佩) comes in 普通 · 精良 · 稀有, small bonuses only — the 秘境 reruns' drop tables
  (rewards.json `drop_tables`) are kept for the roguelite to come; nothing drops from them since 2026-10-28.
- **Modes** (`battle.js` knobs): PvE today. PvP (levelled, no realm
  suppression, 10 each) and the raid (a boss with aggro; pull · help · damage)
  are 【远景】 — the table (§ Playing together) comes first.
- **Cards are pictured** (7 山海经 plates, 45 FLUX); the art never pushes the
  rule text off a small card.

## 差事 — the task system, 《魔兽世界》's loop 【已建】

**接 · 记 · 追 · 交** — accept, log, track, turn in (his ask, 2026-09-18).

- **Data, never invention:** `quests/<province>.json` (`from`, `say`, `need`,
  `work`, `grant`, `opens`, `then`); Ling voices the giver, never writes the
  terms. `work` is `cultivation` (a fight; pays 修为) or `labor` (杂役; the
  `labor` table, 灵石 only) — § Pacing.
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

### 小游戏 in the story — boards that run in time 【已建】 (2026-09-30)

From the 卷一 fun audit (his: 「先并行做1到4」): the book's hands-on moments are
played, not read. Four modules, one each in `scripts/games/`, pure like the
others (`meta`, `newGame(seed)`, `act`, `html`) plus **`tick(state, ms)`**: while
the state is `live`, `live-games.js` steps it (100 ms) and repaints only its own
`[data-game]` host. A control marked **`[data-g-hold]`** is pressed and held
(pointerdown → `{g:'hold'}`, pointerup/cancel anywhere → `{g:'release'}`); taps
stay `[data-g]`. Mobile-first (hold and tap, no keys), no native dialogs,
seeded (the board's seed is the day's, the save's `seed`, the task id).

| game | task id | scene | the play | the book it plays |
|---|---|---|---|---|
| `fallrope` | `fall-storm` | 00-fall (h01) | 割绳子 (2026-10-19): cut the pack's strap, the outer rope, then the last rope as 爹 swings to the ledge — or puff the storm's gust into the swing first; the old pull-in-the-lulls `storm` stays in the 游戏厅; `grade` clean · steady · rough from the 灵光 | 小满 hauls 爹 back, then the mud gives |
| `deer` | `deer-wind` | 00-deer (h02) | hold to draw (1.2 s to full; past 4 s the swollen wrist shakes it down), let go in the still wind; a miss → the stag drinks again; 2 misses or 15 s → 银月 「风。往左偏半寸。」 and more wind is forgiven | 「先看风，后看鹿」 |
| `xisui` | `xisui-hold` | 00-sleep (h02) | hold to grit — three sticks of incense burn only while held; holding spends breath, a trough gives it back; letting go (or running out) on a wave restarts the stick; then 「蹦一下」 into the beam | 「疼，别喊」 |
| `zhoutian` | `zhoutian-sanguan` | wm-zhoutian (h05) | on the 三关 figure: in · out · still; push the qi only in the stillness; 尾闾 and 夹脊 open at one push (银月 dug them), 玉枕 wants three, a push out of time sets it back one | 「最后那半道，得你自己撞」 |

**A board's other way — `alt`, chosen by the device** 【已建】 (2026-10-21, 古六's 讲堂): a task row may declare
`alt: [{ needs: { camera: true }, game, deal, title?, how? }]`. The rules only hand it on in Look (words picked) and lint
it (known needs — `camera` today —, a known game, its `grades` among the task's `marks`); the PAGE chooses
(`scripts/caps.js`: probed once before the first Look, never a permission prompt; the first alt whose needs it meets is
laid over the row, else the row untouched). The task id never changes, so the win, grade, marks, pay and way on are one
beat on every device — a save never forks. A starred mount game with no grade of its own is graded by its deal's
`grades` (lingjing.js beatSettled). Never a dead end: the alt's deal carries `instead` (the row's title); a game that can't go on (`unable`: the camera
refused or failing) or is left for it (`instead`: 「改用…」 after a few misses) hands the row's own board back
(caps.js `fallBack`, lingjing.js fallBackFrom) — same task, same pay; the stuck rule holds on both. Dev seams: `?dev=1&feed=1` counts as a camera, `?dev=1&caps=none` as none.

**The opening's beats** (Hanli, 2026-10-14: 「每看一会儿剧情就要有游戏可以玩」 — the game is played, not
read-and-tap): six more boards in the prologue, each the book's own action where its scene stands —

| game | task id | scene | the play | grade → |
|---|---|---|---|---|
| `rain` | `rain-basins` | 00-shiao (h01) | the night's drips move; set and lift basins until seventeen are full; the fifth watch ends it anyway | dry · wet (mark) |
| ~~`track`~~ | ~~`track-marks`~~ | 00-heisong | cut 10-16 (doc/games.md); the stone clue alone gates `carve` | — |
| `bread` | `bread-share` | 00-cave | seven pieces of the flatbread, to the fox or to himself; the corner always kept | none · little → 自己吃, half · most → 分它一半 (`needs.grade`) + mark |
| `deer` | `deer-wind` | 00-deer (h02) | as above, and the aim: dead on skims the antlers, 偏左半寸 hits | clean · steady · rough |
| `scale` | `rent-scale` | 00-rent | the hide, then cuts on the steelyard to twenty 斤; light is never taken | exact · over (mark); 装傻 / 照实说 both wait, his choice |
| `feather` | `feather-breath` | 00-halfyear | the breath out as a slow, steady stroke (`[data-g-drag]`): stop and it bursts, rush and it flies; three breaths | still · shaky (mark) |

**Batch two** (Hanli, 2026-10-14: 「都可以，按你的单子做」) — each short (under half a minute), forgiving,
and put away by its ✕ (or kept by 留) at any moment (§ Skip below). The rhythm counts a split passage's rest (`story_after`) after its board.

| game | task id | scene | the play | grade → |
|---|---|---|---|---|
| `taunt` | `masan-taunt` | 00-masan | 忍字: 马小宝's taunt heard once, then said back piece by piece from near misses (猫叫, 咬一口, 「汪！」); a wrong piece and every second close the fist | word · fist (mark); 原样说回去 / 攥紧拳头 both wait, his choice |
| `griddle` | `kitchen-griddle` | 00-kitchen | 烙饼: the passage split after 「一张厚，一张薄」; he minds the fire and calls 「翻！」 when a side goes golden — early she waits, late it scorches, silent she turns it; thin then thick | golden · scorched (mark) |
| ~~`listen`~~ | ~~`storm-listen`~~ | 00-storm | 听: cut 10-16 (doc/games.md); the passage whole again | — |
| `fallrope` | `fall-storm` | 00-fall | 拽 (割绳子 since 2026-10-19; the ink pull board `storm` kept in the 游戏厅): 爹 over the drop on two ropes, his pack (坠) under him snagging the swing on a rock spur — the strap, the rope out over the drop, then the last rope cut at the end of the swing toward the ledge (a ~0.4 s window), or the storm's gust swung into first (wider, the third 灵光) | clean · steady · rough (3 · 1–2 · 0 灵光) |
| ~~`stone`~~ | ~~`cave-stone`~~ | 00-cave | 扔石听声: cut 10-16 (doc/games.md), back on the throwing board the same day (`caveecho`), cut again 10-19 (task `cut`; row and module in the 游戏厅); the passage whole again, 喂饼 the scene's one board | — |
| `way` | `yinyue-way` | 00-yinyue | 认路: the valley a small grid seen a step around him, the grass glowing where he walked; his marks on the cells by the cliff are the only way from the cave to the moss; a rock only stops him; after 30 steps she points | straight · wandered (mark) |
| ~~`climb`~~ | ~~`cliff-climb`~~ | 00-cliff (h02) | 攀: cut 10-16 (doc/games.md) | — |
| `carry` | `halfyear-carry` | 00-halfyear (second of two) | 练功: the fifth and sixth loads up the slope — step as the buckets swing through the middle; on the swing it slops and the breath climbs; out of breath he stops a beat; after the winter's passage, before 开春 | even · panting (mark) |
| ~~`abacus`~~ | ~~`uncle-abacus`~~ | 00-uncle | 算盘: cut 10-16 (doc/games.md) | — |
| `xisui` | `xisui-hold` | 00-sleep | 忍: the 2026-09-30 洗髓, redrawn in ink (the washtub going green to black, the pain as rings, the three sticks in their pot, the token on its branch); at 75 s the moon has gone over and the sticks are burned; a skip | — |

**Two boards in one scene** (00-halfyear; 00-cave until 扔石听声 was cut 10-16): they play in `show` order — `story`, the first board, `story_after` (owed when the first is counted, tasks.mjs), the second board, the ways on. A later board waits while one before it is open, on the stage and in the tray (stage.mjs `boardWaits`), and the rules refuse its win until then (`board-waits`); an exit waits on the last.

A game ends `won` always, with its `grade`; the page sends it with the win (`win --grade`), the
task's **`marks`** (grade → mark) write it, and an exit's **`needs.grade`** takes only that grade —
the page taps a way on for him only when exactly one waits on the board. **A game and the story are never on the stage at once** (Hanli, 2026-10-14: 「小游戏，和剧情不要同时显示」): a board waits for its passage to the beat it belongs at (its last; a game mid-passage has the passage split — 接雨, 吹鹅毛 — the rest on the way on), the box steps wholly aside while it is played (queue.js `onStage`, boxGivesWay `game`), and the played board closes for the box to come back. A save standing in a scene
since given a board is offered it on load (state.mjs fitWorld). **Rhythm** (rhythm.mjs, content.mjs
`warnings`): along a chapter's main line, no more than **2,200** zh characters of passage between two
play beats (a board or fight on the stage, a riddle, a look-gate, the 突破 card, a set piece) — about
five minutes at 450 字/min; a warning list for now. (1,500 until 2026-10-26, when the box began
playing the book's full text — Hanli: the 节本 cut kept the setups and dropped the payoffs and his
voice; players can skip. The stretches over it are doc/games.md § 全文后的小游戏.) **地图展开**: a chapter's map unfolds once per save on its map card — at its first
map card in a corridor (00-chushan's tree), the moment it can be walked outside one (Look's
`jiuding.unfold`, verb `unfolded`; the page's `unfold` moment, after 鼎归).

**How a scene uses one** (the pattern of `gate-luoshu`): the task is in
`tasks/world.json` (`kind: board`, `game`, `period: once`, a small `task` grant);
the scene declares `"show": [{ "card": "board", "id": "<task id>" }]` and
`"offers": { "tasks": ["<task id>"] }`, and the exit that goes on declares
`"needs": { "task": "<task id>" }` with a `refuse` line. The win goes through
`win` → `payWin` like any board. Every one of the four only ever ends in a win
(the book does not fail there), so the gate never shuts the story. Try one
alone: `scripts/try-game.html?dev=1&game=storm|deer|xisui|zhoutian&lang=zh|en`.

**Standalone, then embedded** (Hanli, 2026-10-16). One contract for every small game
(`games/mount.js`): `mount(container, { data, lang, reducedMotion }) → Promise<{ won, grade?, stars? }>`
— it knows nothing of the story, the save or the pay. A pure board module (html · act · tick) gets it
from `mountPure`, and the story page keeps drawing those itself; a game that keeps only `mount` is laid into its board card by `beat-host.js`, mounted once, and its result goes the
way every board's win does (`onWin` → the rules' `win` → the pay → `beat-won.js` `beatWon(id, {grade})`,
the one hook the 得牌 reveal listens on). Every game is listed in `worlds/jiuding/games.json`. Test
pages, never linked in the game and blank without `?dev=1`: the 游戏厅 `scripts/arcade.html?dev=1`
(all of them, tap to play, phone and Mac) and the try page above.

**Skip, timing, art** (Hanli, 2026-10-15; the way out rewritten 11-03: 「跳过, 我们统一改成右上角的关闭按钮了. 不需要卡住」 · 「还是加一个按钮好一些, 可能用户想丢掉, 可能想以后玩」):
- **Two ways out, top right, from the first moment**, on every board on every surface (the stage, the 游戏厅, the phone):
  **留** (留着以后玩) then **✕** (不玩了). No stuck wait, no question asked, mid-fight or mid-clock alike. No module draws its own skip.
  A story fight's card, a scene's riddle and a 传闻 step board carry the same pair; on a fight or a riddle both pass it.
- **✕ puts it away, and never pays** (2026-11-04, Hanli at 执事堂's 象棋残局: 「点关闭, 结果给奖励了」): a story board goes on
  as after a win and never comes back; a board he chose, an errand's too, is put down (收手) — no pay, no 体力, the errand
  still open to play later; a 游戏厅 board is dealt again.
- **No paid skip anywhere** (2026-11-04, under the 11-03 rule): the 10-27 跳过 · 酬减半 for an errand's board is gone
  (rules/tasks.mjs; `play_pay.skip` dropped). `skip` or `leave` on an errand's board puts it down, unpaid; he may drop
  the errand on the wall as ever. A lost board costs its 体力 in full, practice included (`task lost`, which the page now
  sends for a pure board's own loss and a mount board's loss dealt again in place too).
- **留 keeps it**: the story goes on exactly as on ✕, and the board waits in 「收着的棋局」 (the 事 book, the tray's
  「收着 n」, Look's `kept`) — at most 20, each with 丢; never offered by itself: a kept board never stands on the stage
  again until he takes it up (Look's task `kept`, stage.mjs — 2026-11-04 「点留没有用」, an errand's board was dealt again at
  once). Taken up and won, it pays its grant once; an errand met by it takes it off the list.
- **A skip pays nothing** — no grant, grade or mark. What the story needs lives in the task's
  `gives` (paid even on a skip); rewards live in `grant`. Skipping never blocks progress.
- **Timing taps act on pointerdown**; every window ≥250 ms; 回看 opens over a board and pauses it.
- **Board art never takes the full stage** — only the story view and fights do.

### Per-回 gameplay plan 【在建】 (Hanli, 2026-10-15)

Every 回 gets a gameplay pass so play keeps pace with reading: the book's own actions as boards in
their scenes (`tasks/h<nn>.json`), fights, and enough beasts and finds to farm its stage quest.
古六 is first (building now: its boards in tasks/h08.json); the rest follow in order.
- **古八 done** (2026-10-21, tasks/h09.json): one board, one fight, both in 09-dabi — **守炉 · 丹房看炉** (`danfang-kanlu`,
  守炉's 古八 story level: 闵丹师 cannot leave the lit furnace, the 后山's 鬿雀 dive at it; it gives the 十年黄精, the
  九节聚气方's 君, fed to the 饭桶 for three 三转聚气丹 — the book's night, played) and the **腊八 final** on the way on
  (`foe-jiuceng`, a 九层圆满 whose 金刃 gasp between blades; 火柴 in hand from the first turn, the book's sword; ~49% bare over ten save seeds, more with pills). Told: 《金丹》 and the 挑料
  (a quiz, a pick), 定风's candle and 进退's pine bough (no kit's verb), the 回家 night (09-qulao) and the 筑基 (09-cliff,
  its card and 大场面). The 后山's 猲狙 · 鬿雀 (`from: h09`) and 兽潮 farm the two stage quests (八层 · 九层).

| 回 | Boards | Farming | Done |
|---|---|---|---|
| 古四 (h05) | 小周天 (气走经脉) · 药园巡夜 (守炉) — no more | 后山崖顶: + 狼 · 熊 from h05 → 9 after the 狰 is tamed; 32 things to find or loot in 观内 | 10-21 |
| 古六 (h08) · 古七 (h11) | tasks/h08.json · h11.json | 后山崖顶's beasts by `from` | 10-15 / 10-20 |
| 古八 (h09) | — | — | the 丹药 agent's |
| 古九 (h10) | 斗法 · 老井 (01-laojing, a 试 with 阿禾; the take passage split word for word) | none: no stage quest, all of 卷一's map open | 10-21 |
| 今线 | audited 10-21: the four kept boards (先吐 · 罚球 · 黑地十一步 · 最后一罚) and 投篮 (砸寨) stay; nothing added — the actions left (j04-gym's 卧推 「绷住，推，吐」, j04-dog's 吸四吐六, j01-anatomy's 三圈经络, j09-dongzhi's 静坐听心) are all breath, a sixth 调息 against 「调息感觉太多了」, or a key emotional moment (j07-guan's hospital, j09-dongzhi's 马小宝) | — | 10-21 |

### 新小游戏 — proven mechanics, the book's actions (Hanli, 2026-10-16)

Small games stay between passages, or the player only reads; the weak ones go. New ones borrow
mechanics millions already love (the mechanic only; names and art are ours), each from a book action:

| Mechanic | Where | Status |
|---|---|---|
| 割绳子 physics puzzle | 喂饼 (第一回 00-cave, its one board): cut vines, use wind and stones so the 饼 reaches the hurt fox (银月's first meeting) | **built** 2026-10-16 (`games/bread.js`, levels in `games.json`; 饼角 = stars on the save, `stars` in Look) |
| 愤怒小鸟 · 砸寨 | every throw in the story as a level of 砸寨 (tools/zhazhai): 射鹿 (第二回), 暗河 (第五回), 芦苇里那一等 (古七) — place, target and ammo per level, the card law | **the beats** since 2026-10-20 (doc/games.md § The throws; the old 射鹿 board `deerarc` deleted) |
| 几何冲刺 one-tap runner | 顺风溜 (古七): the shoes' run down the mountain, forgiving (checkpoints, skippable) | after the first launch |

Rules: 60–90 s, one thumb, instant retry; three stars (stars set the reward, a balance.json knob);
fewer and better (keep five or six great ones in 卷一, cut the rest); local only, no LLM in the loop;
physics from a small vendored MIT library (matter.js), no network.

### AI mini-games 【已建 · 二十问 · 讨价还价 · 对对子; 断案 cut 2026-10-27】 (Hanli, 2026-10-15/16)

**The AI talks, plays roles and judges fuzzy things against a rubric; the rules decide outcomes
and pay (capped).** Token cost counts in the daily routine: a few rounds a day, on a cheaper model.

| | Game | Shape |
|---|---|---|
| **Now** | 二十问 | 银月 thinks of an **ordinary animal** (猫, 狗, 牛, 喜鹊, 狐狸 …), he asks yes/no; a win records it in 录 as a known animal (not the 图鉴) |
| **Now** | 砍价 | a 砍价 button by every shelf item; the shop's own panel, the keeper voiced there (2026-10-28); the price band is the rules' |
| **Now** | 断案 | 药园灵草案, 河伯娶妇's 账; the truth is fixed by the rules, the AI plays the suspects |
| **Cut** | 密室 | cut 2026-10-27 (Hanli: 「这个游戏, 3关都玩不明白, 去掉吧…一般人没有这个背景知识. 教学关得让玩家能学会」): the 干支 dial · 掐诀 hand · 洛书 lid room asked for knowledge a player meets for the first time there; board, rules and room data deleted |
| Later | 天干地支教学 | a teaching board must teach from zero first (no prior knowledge), then test — what 密室 lacked; no game yet |
| Later | 猜灯谜 | festivals, both ways |
| Later | 银月的心事 | her questions → 恩仇簿; no win or loss |
| Later | 斗嘴 | with 马小宝, judged by rubric |
| **Built** | 对对子 | 卷一: 褚先生 at the 讲堂 after 古六, 一字 → 五言 (2026-10-16, below); 七言 and the 绝对 are the 稷下先生's, a later 卷 — a row of data. English (2026-11-02): a rhyming-couplet ladder, opposites → heroic couplets |
| Later | 论道 · 飞花令 | with the 稷下先生, 银月 joins |
| Later | 说书接龙 | 吴婆婆讲古 |
| Later | 下棋陪聊 | the engine moves, 银月/Ling talk |

**Built 2026-10-15** (rules/aigames.mjs, worlds/jiuding/aigames.json, aigames-cards.js, guides
`twenty` · `haggle` · `case`; numbers are declared defaults for balance.json):
- **二十问** — 银月's pet tool `Twenty` (tier read; it keeps the count on the save) is the only
  reader of the animal; 30 animals with aliases, unknown ones first; 20 questions, hints from 15,
  2 rounds a day, a game's 体力 at open; the guess box (page) or her call is checked by name/alias
  (longest match); a win pays `game` (5 灵石) and goes into 录 (识得的动物). Only while she is awake.
- **砍价** (Hanli 2026-10-28, was 讨价还价 — a stage card Ling played in the chat) — a 砍价 button by
  every shelf item's 买, at every shop (aigames.json `keepers`, `*` the default; 周衡 keeps the 执事堂's
  store). It opens the shop's own panel (kanjia.js on npc-talk.js): the keeper's face and lines, his
  patience (3 beads), the arguments he HOLDS as buttons (我常来 — a past buy here; 别家才卖 N — his own
  cheaper deal elsewhere; 这是一转的 · 有瑕疵 — the pill's grade, a declared flaw; 买两件 — goods he can pay
  two of), one counter-offer on a slider (taken within `counter.reach` of the ask, never under the floor;
  lower costs a bead), 成交 (bought at once, Trade's buy path) and 不买了. The floor (75–85% of list) is in
  no answer. One haggle a thing a day (a deal or a walk-off leaves it at list price); no other daily count.
  The keeper's words come from a hidden call in his `voice` (npc-line.js), in a side session the panel
  owns (npc-ask.js) — never the story's chat. 银月 says once when he is first short of a shelf thing
  (hersay.js `short`): try 砍价, or that it cannot go that low; the 主页's buy way reads 「差 X · 可砍价」.
- **断案 · 药园那株紫玉参** — 周衡 at the 执事堂 after `wm-diyilu`; five people (三 suspects, 阿禾 and
  周衡 witnesses) Ling plays from declared knows/hides; clues by asking (person × topic) or the
  card's look-around; 8 questions and 1 accusation a day; the card's 指认 is judged by ids
  (马小宝 + 巡夜簿 + one of 数 · 食盒 · 刀口); solved pays `task` and writes 阿禾 恩 · 马小宝 仇.

**对对子, built 2026-10-16** (rules/duizi.mjs, scripts/couplet.js, aigames.json `duizi`, tones.json, guide `duizi`):
- **Main:** 先生出上联 (《声律启蒙》, 《笠翁对韵》, a few Tang lines — each oriented so the 上联 ends 仄), he writes the 下联 on the card. A ladder 一字对 → 二字对 → 三字对 → 五言对; 3 good answers open the next rung. 3 paid rounds a day (a game's 体力 each).
- **One 联 a sitting** (Hanli 2026-11-02, 「可以, 按你说的做」): the three a day stay (`rounds`), but a graded round ends the card — 收下 (Duizi `close`, the page's; kept on the save, so a reload or the phone never brings it back), no 再来. The next 联 comes when the 时辰 pool draws 对对子 again: its pool row rests one 时辰 (rules/aside.mjs `HER_POOL`, `cooldown_min: 0` — out of the row for the rest of the 时辰 it was played in, back in the very next 时辰's draw); the offer (rungs, 请先生出上联) stands on the stage only while the pool has it drawn here (stage.mjs `duiziUp`). The tray reads 「今日 n 联」 and leaves the row once the three are used. The reverse likewise: one a 时辰 (Look's `duizi.rev_now`). Ladder, pay, 银月's buttons and English unchanged.
- **The rules check the form**, live as he types and again on submit: 字数; the 下联 ends 平 (新韵, tones 1–2 平; tones.json from pypinyin's dictionary by tools/tone-table.py — a polyphone or an unknown character is never failed); 不重位; 不抄字 (a rung's `allow`, particles free).
- **Ling grades only the rubric** (tool Duizi, 0–2 each): 词性对仗 · 意思工整 · 意境/巧, the classic 下联 to judge by (never said before the grade; the card shows it after). The marks combine both: 工整 (≥5, form holds) · 对上了 (≥3, form holds) pay and count; 差一点 · 没对上 do not. A broken form never pays.
- **Reverse:** he sets a 上联 (1–5), the teacher answers through Duizi `answer` (the rules check its form); 2 a day, no pay.
- **银月**, awake only: one hint a round, her own 下联 (pet tool Couplet), checked, never scored. Asleep in the token, absent.
- **Teachers and rungs are data** (`teachers` with `at` · `after` · `juan`): the 稷下先生 (七言, 绝对) is a row when his 卷 opens.
- **English: a rhyming-couplet ladder** (Hanli 2026-11-02, 「可以, 按你说的做」; aigames.json `duizi.english`, scripts/rhyme.js, rhymes.json from the CMU Pronouncing Dictionary). The same teacher, place, limits, marks and pay; an English save meets the English ladder — Opposites (one word) → Rhyming pairs → Short lines → Heroic couplets (ten syllables; Pope, Dryden, Shakespeare's couplets as the classic answers). The rules check syllables, the rhyme on the last stressed syllable and copying (an unknown word never failed); Ling grades contrast · fit · wit.

## A day, 今日传闻, real-life chores 【已建】

- **The day resets three things** (redesign-v2, 2026-09-24): **问签** (one
  签 a real day — § 问签 below; it replaced 问卦's fight luck on 2026-11-02),
  **the day's 人间功课**, and **今日传闻**.
  Beside them, as 体力 allows: the spine, errands, fights, the road.
- **今日传闻** (2026-09-24, replaced 奇遇): Ling writes a 3–5 step side story
  from a seed (`Tale seed`: province, games with their story uses, places,
  people known); `Tale make` lints it (real open places within reach, ≥3
  different games, lengths, language, refused names, **no number anywhere**);
  each step a board instance at its place, then a finale; pay from the `tale`
  tables, capped; one a day, an unfinished one stays.
- **Mini-games, 炼丹 and 论道** are played on the stage, levelled by realm — as
  传闻's steps, a scene's boards, or where an errand asks (a practice board's 3 体力); never a
  daily chore. 论道: 飞花令 · 成语接龙 · 对对联.
- **Real-life chores** (`~/.linggen/quests/<app>.json`, each app's **menu**):
  the game names no app; done is the app's own record (`done_at`), never
  self-reported; only due/done/when cross. The book shows the **dailies**
  (fixed: no `pool`) and **one pick a day** from the `pool` entries (the
  weeklies and monthlies; hash of day + save + id; alternating 💻/📱 when he
  has both); others done anyway are `not-today`.
- **The set, 2026-11-02** (Hanli 「任务设计可以, 按你说的做」). Principles: always
  finishable (an app publishes `due: false` when a chore can't be done now,
  and the rules hide it — never shown as not done); ≤3 taps except real-life
  acts; device-filtered (rules/chores.mjs `playerDevices` · `fitsDevices`, the
  one helper 开府 shares: a Mac-only player never sees a phone row, nor wins
  one as the pick). Row fields: `id kind period device due how open title
  reward stamina pool done_at` (`how` {zh,en}, ≤20 words, shown on the 事 row
  as 怎么做 beside the app's button). Daily: 问安 linggen-greet (engine, a
  message to 银月 that day) · 炼体 health-steps (5000 steps, the phone's fact) ·
  养神 health-sleep (≥7 h, the phone's fact; due only with recent sleep data,
  and steps and sleep both only once a phone has sent the fact) · 核账
  cfo-review · 琴心 dj-listen (a song to its end) · 巡山 shifu-glance (Mac, the
  System page). Weekly pool: 分账 cfo-sort (due: something uncategorised) · 观宝库
  cfo-invest · 问诊 health-report (due: this week's letter) · 清扫洞府 shifu-scan ·
  护阵 shifu-security · 扫尘 shifu-clear (due: a clearable) · 点歌 dj-pick (a play
  from the agent's suggested set). Monthly/event pool: 清点府库 cfo-import (due:
  imported before) · 藏珍 shifu-backup (due: a destination and photos not kept)
  · 求医问药 health-doctor (due: a note worth a doctor newer than the last read).
  Six dailies, so only `gongke.json` `shares_per_day` (1) of a day's dailies
  pays its share of the layer in 修为 (10%); the rest pay 灵石, 体力 and
  meaning. With the pick now always a weekly or monthly (20–30%, the old pick
  10–30%), a day's chore 修为 is 0–10 points of a layer above the old. **Hanli 11-02:
  「按你建议1项吧」** — one share a day, confirmed. `per_day` unchanged. **一次**
  (`period: "once"`, 开府 — the first steps, redesigned 2026-11-02; § 开府).
  The 事 book is one list, every row tagged (差事 · 一次 ·
  每日 · 每周 · 令), grouped 可交 → 已接 → 可接, 已交 folded.
  Apps: CFO, DJ, Shifu, Health (writers named in each app).
- **开府 — the first steps 【已建】** (Hanli, 2026-11-02: 「任务设计可以, 按你说的做」). Linggen's
  `linggen.json`, kept by the engine (`linggen/src/server/milestones.rs`), one row per step, each with
  `title`, `how` (怎么做, ≤ 20 words), `device`, `open` (the exact page; an app's from its SKILL.md
  `app.entry`) and, for 问道 / 问天, `ask` (the line its button says to 银月 in one tap; empty — open
  a box to her):

  | id | title | how | Mac | phone | seen by |
  |---|---|---|---|---|---|
  | linggen-chat | 问道 · 跟银月说句话 | 在聊天里打一句话给她 | ✓ | ✓ | a person's message to Yinyue (the engine's event stream; the phone's `yinyue-chat` fact) |
  | linggen-ask-news | 问天 · 问她今天有什么大新闻 | 点「问问她」 | ✓ | ✓ | her turn ran WebSearch (event stream; the phone's `yinyue-search` fact when her web_search ran) |
  | linggen-voice | 唤银月 · 听见她的声音 | 点她话旁边的喇叭 | ✓ | — | her voice on and a surface holding her (the phone has no voice yet) |
  | cfo-open | 算账 · 打开 CFO 看看账本 | 点「去 CFO」 | ✓ | ✓ | CFO's entry page served; the phone's `cfo-open` fact |
  | dj-play | 听琴 · 在 DJ 里放一首歌 | 点「去 DJ」，再点一首 | ✓ | ✓ | an audio file served by DJ; the phone's `dj-play` fact (a counted play) |
  | health-open | 望气 · 打开 Health 看一眼今天 | 点「去 Health」 | — | ✓ | the phone's `health-open` fact |
  | linggen-notify | 开灵讯 · 允许银月发通知 | 点「允许」 | — | ✓ | the phone's `linggen-notify` fact (iOS permission granted) |
  | shifu-scan-first | 洒扫 · 让 Shifu 扫描一次 | 点「去 Shifu」，再点「扫描」 | ✓ | — | Shifu's own `shifu-scan` row ever done |
  | linggen-image | 灵眼 · 拖一张图给银月看 | 拖一张图进聊天框，@银月 发给她 | ✓ | — | a person's message to Yinyue carrying a picture |
  | linggen-pair | 结缘 · 手机和 Mac 结契 | 扫一下二维码 | both | both | a paired device; device `pair`: listed only with both |

  - **Devices.** The list holds only the rows the player's devices can do (rules/chores.mjs
    `playerDevices` · `fitsDevices`, the one device filter): the host the rules run on
    (`LINGJING_HOST`, `phone` in the phone bundle), and the other once a `pair` row — or a row only
    it can do — was ever done. Mac-only 7, phone-only 6, both 10; 「开府 n/N」 counts that N. A step
    seen on both devices is one row (files.mjs `oneRowEach`: the latest `done_at`).
  - **Hand in at once.** Every done row is 可交 now — each its own 交差, and 「全部交差 · n」 (Quest
    `turn`, `id: "kaifu"`) for all. Only the **hint** of an undone row drips: one more a day, in
    world.json `kaifu.order` (`state.kaifu.shown` and `shown_on`, written like the stand —
    chores.mjs `kaifuFit`). All revealed and done, more waiting: 「还有 n 件 · 明日再揭一件，做了随时可交」 (the hint waits, never the hand-in — 「下一件明日开」 read as one; Hanli 11-02). A retired id an app's file still holds (world.json `kaifu.retired`) is never listed or counted. 跳过 is gone.
  - **Pay.** 50 灵石 each, as the row says (`once` table, capped at 50) — and no 体力 since 2026-11-02 (§ 体力: no quest pays it); the card says the 灵石
    (Look's `pays` carries no `stamina`), and so does the hand-in line.
  - **Progress.** 「开府 3/7」 is the group's own line in the 事 panel, never beside one row (Hanli:
    「这个让linggen记住你的任务没写明怎么完成」).
  - **The other device.** All handed in on a one-device player's: one uncounted card — on the Mac
    「手机上也能随身修炼 · App Store」 (the apps.apple.com link), on the phone 「Mac 上还有灵境的大画面 ·
    linggen.dev」 (world.json `kaifu.other`). Paired, 结缘 and the other device's rows appear.
  - **Retired** (the engine drops them from `linggen.json`): linggen-model, -account (sign-in comes
    before the game), -memory, -remote, -mission, -browser, -chatgpt, -phone-chat (→ linggen-chat);
    CFO's cfo-first-stock (→ cfo-open). A save keeps what it was paid for them.
- **人间功课 as cultivation 【已建】** (Hanli, 2026-10-22: 「游戏里还要有和其他app如cfo,
  shifu, health等互动」 → 「可以」): each menu entry names its `kind`, a plain
  word of the app's (body · heal · rest · ledger · sweep · ward · song · greet); the
  world's `gongke.json`, keyed by kind, is what it means in the book —
  练功 · 调息 · 养神 · 算账 · 洒扫 · 护山 · 琴心 · 问安 — with facts for 银月 (`about`,
  never shown) and a little on top of the chore's own pay (`chore_kind`
  table: ≤10 灵石, ≤6 修为) and a chore-only thing: 晨练符 (body: used, 修为
  +8), 安神香 (heal/rest: 闭关 hours ×1.25), 净炉符 (sweep: the next 开炉 a
  grade up, spent), 护山阵旗 (ward: worn at the 洞府, the 护山大阵 stands on
  the board). 算账's `week`: handed in on 2 days of an ISO week → 宗门月俸,
  30 灵石 once (`chore_week`). `per_day` caps what meanings add (15 灵石, 10
  修为, 2 things). Paid with the chore's own hand-in, so once per occurrence;
  never 体力-gated, never needed by the main line; 开府 takes none; no kind →
  as before. Rules: rules/gongke.mjs (names no app). **On the 事 book** (Hanli
  2026-11-02: 「人间功课也在物品UI里显示, 应该在任务里吧. 任务里已经有了」 — the
  物品 panel's tab is gone; 事 is their one place), from 入门 on: each of today's
  chores' rows carries its meaning, the app's title, 💻/📱, a seal 已做 hh:mm (the
  app's time), what it adds with its meaning's share and thing, one tap (交差, or
  the app's page); a paid one sits in 已交 with 已领 hh:mm; over the chores, the
  ward, the week rows, the day against its cap (gongke.js). Labels only; on a hand-in the facts go
  to 银月 (lingjing.js tellGongke) and she says it — asleep in the 木牌, its
  drowsy word from hersay.js's pool, once a chore a day. The apps' files carry
  `kind` from each app's next write; until then a chore shows with no meaning. A scratch save may hold its
  own menus (`data/saves/<name>/quests/`) for a live check. Steps and sleep
  come from the phone's HealthKit totals as facts (`health-steps`,
  `health-sleep`; the Mac mirror's samples overlap Watch and iPhone), the Mac
  publishing only their `due`.

## 问签 v1 — the day's opener 【已建】 (Hanli, 2026-11-02: 「可以, 按你说的做」 — the rewards, then the v1 scope)

Replaces 问卦 (三钱 · 卦力 · 望气 at 吉 — removed). rules/fortune.mjs · rules/almanac.mjs · worlds/jiuding/qian.json ·
qian-card.js · qian-page.js · guide/qian.md (银月) · guide/divine.md (Ling) · tests/qian.test.mjs.

- **Once a real day, fixed, never in a pool.** One 签 seeded by the day and the save (undo cannot fish). (v1 placement — the stage filler and the top bar's chip — replaced by v2's modal.) The 签筒 stands with 银月 asleep or away too.
- **Rewards.** A day 修为 speed by the grade — 上签 ×1.2, 中签 ×1.0, 下签 ×1.0, never below 1 — in `amountsOf` beside
  the roots' speed, so `paysOf` and every card's shown pay already hold it. One **宜 kind** named by the 签
  (v1: `kinds[(n − 1) mod 4]`; v2: the 签's own `kind`, by meaning): 斗法 (卡牌 · 降妖: mechanic 斗法, table haunt) · 守御 (塔防 · 兽潮: mechanic 塔防/结印, 兽潮's
  `play: tide`) · 文 (灯谜 · 棋局 · 解谜: mechanic 对话/棋牌/解谜/你画我猜) · 武 (格斗 · 切磋: mechanic 格斗/投掷, 切磋's
  `play: qiecuo`); that kind's 修为 ×1.3 today. **The 宜 hook** for the 时辰 pool: `yiWeightOfEntry(content, state, now, row)` on a pool row (a board by its
  mechanic, 对对子 · 银月出题 as 文), over `yiWeightOf(content, state, now, game)` → `qian.json yi.weight` (2), else 1.
- **黄历, the rules' facts.** 干支 (年 at 立春, 月 by the 节 — the 节 day the new month's — 日 from the JDN), 建除 (建 the
  day of the month's branch, 《協紀辨方書》卷四; one officer stands two days at each 节, 疊兩值日), 冲 and 三煞, and each
  officer's 宜 · 忌 read from the gods 卷四 sets on it, quoted in qian.json `almanac.officers[].from`. These are the 建除
  宜忌 alone; a printed almanac's longer list adds other 神煞. Tested against published almanacs (qian.json `_about`).
- **生辰**, asked once on the card (skippable): 生肖 by **立春**, 日主, 星座 — kept in the save; the date never.
  A 命格 set from a birthday before 星座 were read may take it once more for the 星座.
- **The ritual.** Tap the 签筒 (Mac); on a phone, a shake (DeviceMotion, asked for on iOS inside the first tap) or a tap.
  One 签 drops; its 签诗 inks in line by line. Optional ask: 事业 · 感情 · 出行 · 学业 · 其他, or a line of his own (≤20).
- **The set.** 观音灵签, all 100, 签诗 and grade quoted from 吉祥宝聚寺 (BW Monastery, Singapore) per 签; cross-checked
  against buyiju (same set; readings differ in 50, grades in 10 — the temple's kept); no 典故 titles (unconfirmed).
- **解签 by 银月.** The page hands her the facts (签, grade, 签诗, 黄历, his signs, his question, the game effects) and her
  rules (guide/qian.md § 银月 · 解签: playful, 宜/忌 only, money · health · law only 宜谨慎, a bad 签 lands on something
  doable, ≤ about 80 字). Not here (not met, or 今线): the card shows the 签诗 and the 宜忌, no reading.
- **签谱** (100 cells, a count each), **连签** (签筒: 竹 → 青玉 at 3 → 朱漆 at 7 → 鎏金 at 30), **应验** (from 17:00, 银月
  may ask once; his answer — Ling's Divine or her Qian tool, `action: verify` — pays the small `game` table 3 修为 · 5 灵石
  and is kept in the save, the last 30; not answering costs nothing).
- **English:** the same mechanics; the Chinese verse with the game's own plain gloss (no faithful free translation found).
- **Agent's picks (Hanli delegated 11-02):** 生肖 by 立春, not 春节 · the set's own three grades (上 ×1.2, 中 and 下 ×1.0 —
  the temple grades no finer) · 宜 by the 签's number · 宜 ×1.3 on 修为 only, 灵石 untouched (but at 圆满 the 修为 past the mark turns to 灵石, so speed and 宜 scale that 灵石 too) · the day's speed on the 古
  line only (a 今 board pays its own line, as the roots' speed does) · 对对子 not yet in 宜文 (its pay carries no tag;
  duizi.mjs was left to the 对对子 agent — one `play: 'duizi'` on its `mark.pay` joins it) · an old save that cast 问卦
  today may still draw today's 签 · 应验 kept in the save, not in memory (only 银月 writes memory; the save is hers to
  read) · the birthday's date never kept, only its signs · 签谱 shows an undrawn 签 by its number only.
- **Phone:** the bundle carries all of it (deterministic, no fs); the Flutter app draws no 签 card yet, so the phone
  pays the day's speed and 宜 but shows nothing of the 签 until it does; and there is no phone path for
  her reading (hersay.js has no 签 moment, so `Lingjing.her` gives none). Tarot is v2.

## 问签 v2 — one full reading, 替人求签, a share image 【已建】 (Hanli, 2026-11-02: 「可以, 按你说的做」)

Over v1 (below). rules/fortune.mjs · qian.json · qian-reading.js · qian-facts.js · qian-share.js · tests/qian2.test.mjs.

- **Where it stands** (Hanli 11-02: 「上面已经过于拥挤了, 算卦的换个地方吧, 每日一次, 放最下面吧, 每天用户第一次打开自动弹出来,
  如果不摇, 放下面卡片, 摇过了就可以不显示了」): no chip on the top bar. The 签 card is a modal over the stage
  (lingjing.js qianModalHtml): it pops up by itself on the first open of a day not yet drawn (once a day, per save, this
  browser), the 签筒 wobbling under 「还没摇 · 点签筒摇一摇」. Closed unshaken, the tray's 问签 card waits until he shakes
  (rules/aside.mjs); it never fills the stage any more (stage.mjs). Shaken, the full reading shows in the same modal; closed,
  nothing of the 签 stays on screen. **Today's 签 again** — agent's pick: one quiet line in the 书 popover, 「今日签 · 第N签
  上签」, which opens the modal (替人求签 and the 签谱 from there).
- **No 「想问什么」.** The ask picker and the free line are gone; one shake gives one complete card. An old save's
  `ask` / `ask_text` stay in its draw, read by nothing.
- **The card:** 第N签 · grade; the 签诗 (verbatim, inked in); the **白话签解** (`jie`, marked 「白话签解（灵境自译）」 —
  the game's own plain rendering of what the verse says, written once per 签 into qian.json, all 100 in zh; the English
  is the v1 `gloss`); **五项运势** (事业 · 感情 · 财运 · 出行 · 健康, one line each); today's 黄历 宜忌 — **no 宜 row on a day
  without 宜** (and no 忌 row on a day without 忌; never 「无大事」); the 修为 and 宜 kind (his card only); 银月's one line.
- **五项** are rules-side (fortune.mjs `aspectsOf`): each 签 holds one tone per 项 (`luck`: up · even · slow, read from
  the verse), the line is `aspects.list[i].lines[tone][(n + i) mod 3]`, then today's 黄历 adds the first act the 项 reads —
  出行 「今日忌远行」/「今日宜出行」, 财运 「今日忌出财」…, 事业 宜办事 · 谋划 / 忌上任 · 诉讼, 感情 宜会亲友 · 议婚 · 宴饮 /
  忌结亲. **财运 speaks 宜/忌 only, never a decision. 健康 stays light** (宜早睡 · 少熬夜 · 多喝水) and reads no 黄历 act.
- **The 宜 kind follows the 签's meaning**, not `(n − 1) mod 4`: each 签 is tagged once (`kind`) by the rule in qian.json
  `_about` — 斗法 a match of wits, a rival, a trap or empty words; 守御 waiting, keeping still, holding the old; 文 learning
  and 功名, an upright heart, a patron who sees hidden worth, family and song; 武 rising by effort, the Dragon Gate, the road,
  the horse and the sword; the last line (the counsel) decides a tie. 守御 31 · 文 25 · 斗法 22 · 武 22.
- **银月's line**, personal: his 生肖 against today, landing on one of the five (qian-facts.js; guide/qian.md § 银月 · 解签).
  The ask goes first, then the facts, under the engine's 300-character moment cap. She is told to use no name and nothing
  of the save — the line is printed on the share image. Her line is caught from the chat (the moment's own path) and kept
  on the card for the day in this browser, never in the save. Not here, or no answer in 30 s: the card stands without it.
- **替人求签** (`divine action: friend`, the page's alone — Ling and 银月 are refused): a 称呼 (required, ≤12) and an
  optional birthday (its 生肖 · 星座 read in the rules, the date let go — never in the save, never in the log); that
  person's 签 is seeded by 称呼 + day + save, the same all day; at most 3 people a day (`friends.per_day`; the same person
  again takes no second place; the count keeps a hash, not the name); never 修为, never the 宜, his own 签 untouched. Kept
  friends (称呼 and signs, newest first, at most 12) re-ask in one tap and can be deleted (`forget_friend`); 「不保存」 keeps
  nothing. Her line talks about the friend (「你那位朋友属牛……」).
- **The share image** (qian-share.js, a canvas page-side, 1080 wide): number and grade, the 签诗 as four ink columns right
  to left, the 签解, the five, today's 宜忌, her line, the date, 「灵境 · linggen.dev」; a friend's card adds 「替 X 求签」.
  `shareLines` reads only those fields: never a birthday, a sign, his 名字 or his 修为 (tested on the drawn text). Fixed 宣纸
  colours, not the theme's. Fonts: the game ships no CJK web font (its --serif is a system stack), so there is no subset to
  miss a glyph — the first of Noto Serif SC / Songti SC / STSong the browser has, else serif.
  分享 (`navigator.share` with the PNG, shown only where `canShare({files})`), 拷贝图片 (an image/png ClipboardItem),
  保存图片 (a download); each also shows the picture under the buttons, so a shell that saves nothing still shows it.
  The PNG is made before any tap (Safari shares and copies only inside the tap).
- **No 出处 link** (Hanli 11-02: it opened the temple's page mid-game and read as a bug). The 签谱 ends with one plain line,
  「签文出自观音灵签（据新加坡宝聚寺所传本）」; the per-签 URLs stay in qian.json as the record. The share image has no source line.
- **Phone:** the bundle carries it all, and `Lingjing.her('qian' | 'qian_friend', look, {result})` gives her facts
  (qian-facts.js) for the phone's own Yinyue; the Flutter card is linggen-mobile's.
- **Agent's picks (Hanli delegated 11-02):** the 五项 as three tones × three lines per 项 rather than 500 free phrases (the
  verse's meaning in the tone, the variety in the line) · the English 签解 is the v1 gloss · a 忌 row hidden too on a day
  without 忌 · the 宜 kind's tie-break by the last line · 12 kept friends · the friend's 称呼 kept out of the log even when
  kept · her line kept per browser, not in the save · a 签 drawn before v2 shipped may read another 宜 kind now (its tag).

## 体力 and 闭关 【已建】

- **体力是控制单次游戏时长的: 1 体力 ≈ 1 分钟** (Hanli 2026-11-02, a standing rule: 「体力是控制单次游戏时长的」 · 「或者简单点, 给用户100体力, 1体力玩大约1分钟?」). The pool (`rewards.json → stamina`) is **100**; a spent pool rests until whole (`rest` 100); shown as points. A full pool is about 100 minutes of the acts that spend it — reading the book's text and walking the story's road spend nothing, so a real sitting runs longer.
- **Each act costs its minutes** (`stamina.cost`, × `per_minute` 1; state.mjs `staminaCost`, `boardCost`), never typed twice. **A board costs its own minutes** (Hanli 2026-11-04: 「小游戏有一些时间比较长的, 你看一下体力扣的是否对」; `game` and `shouchao` → `board`): its game's (balance.json `play_pay.game_minutes`: 守墙 5 · 守炉 3 · 撒豆 2 · 撒豆成兵 1 · 拼图 1 · 抚琴 1 · 押宝 1), else its kind's (`play_pay.minutes`: 打地鼠 · 调息 · 开炉 · 结印 · 格斗 · 对话 · 配对 · 你画我猜 1; 割绳子 · 投掷 · 节奏 · 斗法 2; 几何冲刺 · 记忆 · 塔防 · 解谜 · 棋牌 3), else `default` 3 (对对子 · 论道 · a 传闻 board) — measured on his save (tests/fixtures/play-minutes.json, the median of a board's first frame to its end; a kind not played is the design's guess); it pays by the same number (R × 体力). A 兽潮 night its kit's; 本王考考你 a 你画我猜's; a card fight (`duel` → `fight`) 2; 切磋 2 (a 90-second bout); a 旁炉 throw 1; a 抉择 / 驯 / 换一只 1; a road 1 (+1 a road, ≤4); make a scene 5, a world 10, amend 5. **Reading the story is free** (Hanli 2026-11-04: 「剧情保持不扣」; `step` 0 — was the scene's text at 450 字/分 + 1); an exit's own `stamina` (toil) still costs. **The story's steps and boards cost no 体力; its card fights do** (2 an attempt — Hanli 2026-11-04: 「剧情里的战斗还是扣体力吧」), and spent, a story fight's ✕ · 留 still walk the story on. Free too: the shop, hand-ins, the bag, talk, 问签, the story's road (主线赶路), the prologue's own steps, 人间功课. A 秘境 run costs its rooms' minutes (each fight room a card fight's 2 at the door, each board room its board's as it is cleared); its 秘境令 stays the gate. When it is taken: a board as its win is counted, **and a board lost in full** (`task lost`, the page as the board ends unwon: a hosted board its minutes, a 兽潮 night its kit's, 切磋's bout its 2 — it was played; a loss on a spent pool still stands); a board left with ✕ or 留 costs nothing (the rules do not know the minutes played); a haunt's or a pool's card fight at every open, each retry in full. Look carries every kind's (`stamina.costs`).
- **No clock refill** (Hanli 2026-11-02: 「体力不要自动回, 只有闭关才回. 或者体力卡」): `refill.clock_hours` null — a spent pool stays spent. It comes back two ways only:
  1. **闭关** — while one runs the pool rises at the whole pool in `refill.seclusion_hours` (**2 h** since 2026-11-04, Hanli: 「刚刚闭关12分钟, 体力加20, 这个调整一下吧」 · 「可以, 2小时回满」 — 12 minutes +10, an hour +50; was 1 h), **linear on real minutes** (agent's pick, Hanli delegated 11-02: linear, so the chip reads true all through and a sitting ended early keeps what it brought; a pill multiplies 修为's hours, never 体力's; under `min_hours` nothing else grows, 体力 does). Look settles it live (state.mjs `settleStamina`, from the later of `stamina_at` and the sitting's start); 出关 settles it to the minute. The old rule (`seclusion.rest_hours` 8 h filled it) is gone; `rest_hours` is now only the night 修为 is reckoned by.
  2. **Time away counts as 闭关, for 体力 only** (Hanli 11-02: 「如果体力用完, 用户没有点闭关就下线, 我们可以自动给用户闭关吗?」; agent's pick, recorded: auto-闭关 pays 体力 only, a real 闭关 still pays its 修为 too, so entering one stays worth it): a gap of `refill.away_min` (10) minutes or more since the last player call (`last_seen`, stamped by every call of the page's and Ling's — Look included, never 银月's), at the 闭关 rate, capped at the top (state.mjs `awayFit`, run in rules.mjs before the verb, written, never logged). Spent or only partly used, the Mac or the phone (the same bundle). The save keeps `away` until the page's next Look, which tells it once — 「你下线这段时间自行闭关 N 分钟，体力 +X」 — and takes it off.
- **No quest pays 体力** (Hanli 11-02: 「完成任务不奖励体力」): `refill.quest` false — a chore, a 开府 row or an app's quest pays none, whatever its row says (chores.mjs `questStamina`); the 事 cards show none. The apps' rows dropped their `stamina` (dj, cfo, health, apple-shifu; the engine's milestones.rs).
- **Empty**: `no-stamina`, 「体力耗尽了。闭关，或回到现实里歇一歇，约 HH:MM 回满」 (the hour a 闭关 begun now would fill it); 银月 sends the player to 闭关 or to rest. The tray is one card, 「体力耗尽 · 闭关约 N 分钟回满」, with 闭关 and 喂饭桶; inside one, 「闭关中 · 约 N 分钟体力回满」. **闭关 on a spent pool stands behind every gate** (rules/locks.mjs: the prologue keeps 闭关 shut, but not from a spent pool — the sitting is marked `spent` and its card stands); it has no cooldown of its own (the 小游戏池's 4 h is only the 时辰 draw's).
- **The numbers at 100**: 带伤 is under half the pool (breakthrough `body.share`), the breakthrough's wound 30% (30), a 抉择's wound 10–35% — all shares of the pool; 丹毒's cap stays 30 (now 30% of the pool, as at the old launch value of 100).
- **体力卡 — gone** (Hanli 11-03: 「体力卡删掉」): the test-only card left for 2.0, its 重置冷却 hook with it; a save that held one drops it on load (state.mjs fitWorld `RETIRED_ITEMS`).
- **体力 is ON since 2026-11-02** (Hanli: 「你把体力也打开加回来吧」; `LINGJING_STAMINA_LIMIT=0` still turns it off for a run). That morning's testing numbers (150, full by the clock in 1 h, `refill.quest` 30) were replaced the same day by the rules above. Was: **体力 is OFF while we test** (Hanli, 2026-10-01: 「我是说先不要用体力限制我们测试的时长」): nothing spends 体力, nothing is refused for it, the pool reads full — `staminaLimited` in state.mjs.
- **主线赶路不扣体力** (Hanli, 2026-10-01: 「可以，主线赶路不扣体力」): a trip toward
  the place the goal line names (Look's `waypoint`) is free — the place itself or
  one on a shortest road to it (rules/errands.mjs `onStoryRoad`); 古七–古八's
  seasons carry no toil price (伏天, where 古七 turns into 古八, pays a story step, as 入秋 does). Why: 卷一's play-through hit two 5–6 h lockouts
  on the story path. 体力 is for side errands, roaming and cultivation.
- **闭关** (2026-09-24, rules/seclusion.mjs, page-only `seclude`): real hours
  (≤12) on ONE focus — 法术 (one ★ per 6 h, to ★3), 修为 (an hour's share of the layer, a 聚气丹
  ×1.5), 本命法宝 (from 结丹; one 重 per 8 h); 体力 comes back all through it, whole in an hour (above); the world holds still
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
- **She wears gear like him** (Hanli 11-03): her own 法器 · 法衣 · 佩 (`wear["yinyue.<slot>"]`,
  rules/wear.mjs). Any weapon, robe or pendant goes on her (`trade use … on: her`); her own things
  in the slot they name (items.json `slot`: the bells 佩, 齐纨 法衣). One copy is worn in one
  place (`worn-elsewhere`); two held, both. On her card (`her_card.gear`, agent's pick): 器攻 ×
  0.34 → 攻, 防 × 0.5 → 气血 (each +1 at most, a realm step's size), 抗 × 1 off that element's blows
  on her card (battle.js `minionLands`, at least 1); a thing's own `lift` on top. The gear panel
  shows her three slots; 「戴上 · 佩」 and 「给银月 · 佩」, 卸下 per slot. v16 moved her one slot.
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
  illustrated.** (An audit found 23 of 28 小人书 panels wrong.) The hero,
  沈小满, now has a 图鉴 portrait like everyone else (2026-09-30, once the name
  and gender were fixed); the dialogue box still never shows his face.
- **One codex, book and game:** `codex.json` resolved by `codex.js` — one
  entry per subject (kind, name, 1–3 lines, picture, credit, source, `marks`,
  `first {book, scene}`); people, creatures, items and arts are linked from
  their own files. Kinds: 人物 · 生物 · 物品 · 武功 and knowledge figures (经脉 ·
  穴位 · 洛书 · 五行, animated marks). An item has an entry only if unfamiliar
  or a named story object.
- **First appearance:** the book's `[words]{注=id}` puts the card after the
  paragraph of first appearance; the game's scene `meet` puts it in the main
  slot before the scene card; 录 has 图鉴 with empty slots for the unmet.
- **A card says only what the reader knows at its first appearance** (Hanli,
  2026-09-30): nothing from a later 回 — no later name, identity or reveal (the
  pit fox is 小银狐 until she names herself; the token has no 银月 in it yet) —
  and no 「你」: a card names 沈小满. Card lines are static (no unlock by 回).
- **Pictures:** one house style (fine ink 白描, soft grey wash, warm aged paper,
  one subject, no text), checked by eye, re-rolled until right. 山海经
  creatures painted from their classical line, the woodcut kept as 「原图」 — but the
  山海经 beasts added for farming (2026-10-15) show the woodcut plate only, never a painting
  (`art_plate`; plates from 胡文煥, 蔣應鎬 1597, 《古今圖書集成》, Commons,
  credited in `art/CREDITS.md`). Painters: Codex's image tool (2026-09-29) and
  local FLUX since Codex's quota ran out (his 「用flux吧」).
- `by_hero` {male, female} can pick an entry's picture by the hero's gender;
  none uses it since the hero is fixed (阿禾 is the girl, one portrait).

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
- **先放一放 — the book set aside** (Hanli, 2026-10-26: 「能跳出来去玩小游戏, 玩完后在回来接着读」; rules/aside.mjs):
  mid-passage the box offers 先放一放 when something may be played meanwhile; its place (the passages left, the
  beat) goes on the save, so a reload or the phone takes it up; 接着读 rebuilds the beats from the book at that
  beat. Meanwhile one declared rule (`ASIDE_KINDS`) says what may be played, each only when its own system has it
  open: a skipped board (all of the line's, at once), 人间功课, 饭桶 · 开炉, a pool's
  fight where one stands (the pool's own rule keeps it off while he stands in a scene), 兽潮, 闭关, 银月's games,
  今日传闻, 问签. The story's own board, the scene's choices, Move
  and anything of a later scene wait (refused `aside`). Never inside a key beat's lock. Before 入门 only a skipped
  board can be open, so the control shows only after one was left.
- **手边的棋局 — the tray** (Hanli, 2026-11-02: 「可以, 按你说的做」, and the merge 「1,2 可以合并? 用边框颜色区分一下?」;
  rules/tray.mjs, cards.js trayHtml): one row under the stage, scrolling sideways (the phone too). First what opens
  here — the 回's story boards (gold border; the old exclusions kept: done, played today, on the stage, `boardWaits`,
  the aside's own board), then the timed and daily games that open here or anywhere (jade, 开局) — then those a walk
  away (jade, 去X ›, only where Move would take him), and last, muted, the cooldowns back
  within hours (「约 N 时辰后」; a game done for today is not in it). Each game declares its entry in the one registry
  with 先放一放 (rules/aside.mjs `PLAY_KINDS` `tray`: what is left, where, its opener, the stage card it would repeat);
  Look carries `tray`; the page draws whatever comes. Empty, 「手边无局，随处走走。」. Agent's picks (Hanli delegated
  11-02) in status.md.
  **小游戏池** (Hanli's design, 11-02: 「可以, 按照你设计的做吧」; rules/pool.mjs): the repeatable small games (对对子, 银月出题,
  饭桶, 闭关, the practice boards on his map) are a pool, each declaring its cooldown, its 时辰's lean (a weight),
  its 体力 cost and the verb that plays it. Each 时辰 draws three (seed: save + day + 时辰); played, a game leaves the row
  and rests its cooldown. **An unplayed game waits** (2026-11-04, Hanli's 「冷却的小游戏」: 「89 分后换」 changed it unplayed):
  the row holds one game, saved (`pool_hold = {draw, game}`, pinned at rules.mjs's door after a pool play, and once for an
  older save from the 时辰 of its last play): it stands through every 时辰 until that game itself is played (won, lost, ✕,
  留 — the `played` door stamps each) — another game played moves nothing; then the next of the same draw; all of it
  played, the draw of the 时辰 after it. No countdown is told: the heading reads 「小游戏 · 玩过一局才换下一局」. The world's events, 问卦 and the story's boards stand outside it. No title line over the row
  (Hanli 11-02); the 时辰 is a footer chip, 「未时 · 47 分换一批」; 体力 spent, one 闭关 card; all three played,
  「这个时辰的都玩过了」. The tray holds games only: what the 事 book lists (差事, 机缘, 货郎) is declared `in: 'shi'`.
  **Only boards that differ each play** (Hanli 11-02, on 周衡's 灯谜 won four times: 「这个人参的灯谜我是否玩过几次了?」):
  a board with one fixed content leaves the pool — and the tray — once won; one that varies stays. A board says which in
  its data (rules/pool.mjs boardVaries): a content pool in its deal (`deal.pool` · `deal.riddles` · `deal.deck`) varies,
  whatever else it says — the hook 周衡's 灯谜 comes back on once its deal carries a riddle pool; else `varies: true | false`
  on the task (a seeded deal or a foe the data cannot show: 五子 · 残局 · 配丹 · 洛书); else a ladder (`climb` or
  `deal.levels` of two or more) varies; else it is fixed. Won is `pool_won` (stamped when a board is counted done, kept
  apart from the draw's rest `pool_played`), or a win an older save kept (★ `stars`, the task done). An errand that still asks for
  the board's win keeps it in. Every hosted board declares or infers it (tests/pool-varies.test.mjs).
  A deal with a content pool carries what the board deals the next by: `seed` (the save's) and `n`, his wins of it
  before this play (`pool_wins`, counted as `task done` counts it; an older save won by its ★ alone counts one) — so a
  replay never asks again what he has won (rules/pool.mjs poolDeal, Look's dealOf).
- **Yinyue on the stage:** one device, one Yinyue. The game stage is
  voice-only (`?pet=1&stage=1&body=0`, engine a250a04) — no 3D body in the
  game.
- **The book** (`scripts/read.html`, 书 chip): `story/index.json` names the
  books (aliases for old ids), `book.json` the 卷/回 with 回目, `classics.json`
  the classics at each 回's end; `[words]{注=id}` and `《书》{典=id}` marks.
- **只看改动** (Hanli 2026-10-05): each 回 is marked against the version last
  confirmed — blocks aligned by LCS, a rewritten one by sentence, `{注=…}`
  `{典=…}` and spaces ignored (book-diff.js, by rule). The list of changes
  stands right (a drop-down when narrow), the count in the contents. Each
  change is confirmed on its own (「✓ 确认这一处」 at its end, or ✓ in the
  list; never the whole 回), the rest still marked; 撤销 takes back the last
  confirm, one at a time.
  One store for the Mac and the phone: data/reader/<book>/ (verb `changes`,
  rules/changes.mjs); the first confirmed versions come from git once
  (`node lingjing/tools/reader-base.mjs`, default 93e20ac0 = 「10-04 上午」).
- **Phone** (Hanli, 2026-10-15): at ≤600 px wide, or ≤860×700, the chat folds into a bottom
  sheet with an unread dot; the header is at most two rows; popovers open as bottom sheets; boards
  are capped to the screen's height; a 亮相 portrait never covers the words.
- **Choices are one question:** the chat owns the question; while an AskUser
  is open the stage hides every button of the same name.

## 哇时刻 — wow moments (his, 2026-09-29) 【已建】 (7 【远景】)

His order of value: **5 > 3 > 1 > 7 > 6 > 2 > 4**.

1. **鼎归 · 地图晕开** 【已建】 — a 鼎 taken home spreads its 州 like ink on
   宣纸 (rules/inkmap.mjs, inkmap.js, fx.js in WebGL, SVG otherwise): mist ·
   wash · ink with rivers, a red seal and a moon; ~7.4 s, tap to skip; **御剑**
   to a homed 鼎 for 1 体力; 卷轴 unroll at 下山. Lesson: a reward must brighten,
   never darken.
2. **大场面** 【已建 · 卷一】 — one per 卷 at most, the whole stage. 卷一's is
   **漳水立起** (古九; Hanli 2026-09-30): `setpiece.js` (the runner) +
   `setpieces/zhang.js` (the piece), Pixi + GSAP from fx.js's loaders, ink only,
   words never painted. Seven beats in the book's order, each tied to a verbatim
   line of 09-第九回.md (tests/setpiece.test.mjs holds it): `still` 2.8 s · `rise`
   4.8 s (the river stands, a thousand fish leap, twenty boats on the bare bed) ·
   `bingyi` 3.6 s (冰夷 on his two dragons rises through a pale pool) · `trial`
   5.2 s (the left dives, the right sweeps, both stop a foot from the boy with his
   arms open before the tofu girl) · `fall` 3.4 s · `seal` 4.6 s (the 洛书 stones,
   six and eight swapped, then traded; five pressed home; the ring lights; a beam)
   · `ding` 4.2 s (the 鼎 rises and shrinks; dusk; the token's second tail) —
   28.6 s. A beat plays, then holds for a tap (the dialogue box's next passage;
   `auto` runs on); a tap mid-beat finishes it; skip ends. Reduced motion: each
   beat's last frame. No WebGL: an SVG still per beat. After it the page plays
   what exists — 银月's memory 1, then 鼎归 — never drawn twice.
   **Declaration** (on the exit that raises 漳水; `story.mjs` carries it on the node):
   `"setpiece": "zhang"` (or `{ "id": "zhang" }`). **Page wiring** (the scene lane):
   a `setpiece` view slot ranked first; in `storyMoment(n)`, `const id =
   setpieceOf(n)` → `playSetPiece(slot, id, { lang, still: stillMotion(), onBeat,
   onDone })`, and hold `memory`/`homing` until `onDone` (they are already
   `YIELDS`). **Preview:** `scripts/setpiece.html?name=zhang` (`&auto=1`,
   `&still=1`, `&lang=en`; `&raf=timeout` for a tab whose frames are parked).
   **筑基天象** 【已建】 (2026-09-30; mid-size, not the 卷's 大场面; rebuilt on paintings the same day — his: the code-drawn one was 「太假」): scripts/setpieces/zhuji.js on setpieces/painted.js (shared with 漳水立起: camera moves over each painting, the 鼎归 ink-bleed soak into the next, nothing pictorial drawn in code). Seven paintings, art/setpiece/zhuji-a,b,c,d1,d2,e1,e2.webp (tools/paint-zhuji.py), in two worlds never mixed (his: 「筑基的图片在小满旁边画了个台子, 其实应该是内景的台子吧」): outside (a, b, e2) monochrome ink; inside him (c, d, e1) a small cosmos — dark void, faint stars, nebula-like ink, the black lake afloat. a 锅盖云 (gather) · b 一缕光 (light) · c 丹田台 (tai; the five Chinese gateways' glows light in turn) · d1→d2 那扇门 (door; the unreadable note soaks into 「今日放学」 as the camera pushes in) · e1 四桩 (zhu; the camera eases back into the cosmos) · e2 星垂 (stars → settle; he opens his eyes — the cliff soaks in from where he sits over the receding cosmos, the camera rises to the low stars, and the night closes under 「几道纹？」「……一道。」). **Declaration** (on `09-cliff`): `"setpiece": "zhuji"`, played by setpiece.js like any piece. Preview: `scripts/setpiece.html?name=zhuji`; stills: `scripts/setpiece-stills.html?name=zhuji`.
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
- **Which picture the stage takes** (Hanli, 2026-10-15): a sealed instance's backdrops outrank
  all; then a **festival** (outdoor scenes only) > the **place's painting** (节气 tint and particles;
  indoors, tint only) > the **节气 picture** > **weather** (atmos.js `stagePick`).
- **天气** (rules/weather.mjs): the engine's `weather` sense (the skill never
  goes online) hands the reading for the city the player set once; drawn as a
  layer (snow · rain · fog); said once when it changes; never harder, at most
  a texture. **The plot never follows the real weather** (Hanli, 2026-10-14):
  a scene whose story names its sky declares it (`weather`, § A scene), and
  there Look's `weather` is the story's — `source: "story"` (else `city` /
  `season`), no temperature (that is the real city's), never `new`, so Ling
  never announces the real sky over the book's. The chip's popover still
  sets the city for every other scene.

## 画面效果 — PixiJS + GSAP 【已建】

The page stays web UI; **PixiJS** paints what must be drawn (ink wicking,
grain, particles, ink to colour); **GSAP** times one moment. Vendored, pinned
(`scripts/vendor/`); loaded only for a moment; one canvas per moment,
destroyed after; words never painted; no WebGL → the SVG/CSS version; one
module, `fx.js` (and its `fx-*.js` parts). **Built:** the 鼎归 pilot; 卷一's 大场面 (`setpiece.js`, § 哇时刻 ②);
**画活** (`fx-alive.js`, 2026-10-21): a still painting on the stage — the place's, the sky's, a beast's 出场 —
drawn on a MeshPlane whose grid bends where the painting has something that moves: trees and grass sway from
their roots (with the stage's wind), cloth from its rail, water shimmers, smoke and flame waver up, mist
drifts, a beast breathes. Declared per painting in backdrops.json `alive` (kind + box + amp;
`alive_creature` for every beast), tuned on `scripts/alive.html?art=<path>&boxes=1`. A painting is not a
moment (Hanli 2026-10-21: 「同意」 — living layers stay while the painting or the weather stands; if a phone runs hot, 20 fps or only the big trees and water): its canvas lives while it stands (30 fps, asleep under a set piece or a hidden tab), goes with its
cross-fade, and lies over the CSS still, which is the fallback (no WebGL, reduced motion). A struck body's
picture squashes under the blow (fx.js `squash`, Web Animations — a plate is too small for a mesh).
**Her colour memories in WebGL** (`fx-memory.js`, 2026-10-21): the colour soaks into her picture
the way ink wicks through 宣纸 — torn front, a warm light rim, a glow where it began, a slow push in — on
the card's own clock (`--mem-age`), one canvas over the picture's box, gone at the bloom's end; the CSS
bloom is the fallback. Preview: `scripts/fx.html?moment=memory&n=1`.
**Weather particles in WebGL** (`fx-weather.js`, 2026-10-21): the sky's three — snow in three depths
with a cool rim (it reads on white paper), rain as fine leaning streaks with rings on the lower stage, fog as
two sheets of paper-cloud drifting — carried by the stage's wind, laid right after atmos.js's CSS layer
(whose spans of those kinds step aside), 30 fps, asleep in a fight or under a set piece, gone when the layer
is laid again. Petals, leaves, fireflies and a festival's own stay CSS. Preview:
`scripts/fx.html?moment=weather&kind=snow|rain|fog&wind=0.6`.
**Chapter transitions** (`fx-hui.js`, 2026-10-21): when 「新的一回」's seal rises, fresh 宣纸 soaks over the
stage's painting from the middle (a light rim), the seal stands on a blank title page, then the painting
soaks back in — 3.6 s, the seal's own time; a seal tapped away sends the painting back at once. Nothing on
a pale stage (今线), no WebGL, reduced motion: the seal alone. Preview: `scripts/fx.html?moment=hui`.
Each 卷's 大场面 comes with its 卷 (§ 规矩).

## Player state 【已建】

`data/state.json`, ids only (save **version 7**, `MIGRATIONS` in state.mjs; v6 = nine 层 a realm, v7 = 练气 nine 层, three steps above it):
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
- **The cloud is for subscribers (11-03; agent's pick, Hanli delegated 11-03).**
  Hanli: 「订阅用户才存云端, 非注册付费用户, 只可以本地同步」, 「应该鼓励用户订阅」.
  A sign-in still opens the game; the account's cloud copy is kept only while
  subscribed (a trial counts), and a lapsed copy is kept, never deleted, until
  a resubscribe. Free accounts sync phone ↔ Mac only. The phone reaches the
  cloud itself (HTTPS) as well as the Mac (WebRTC), cloud first.
- **One winner rule, declared:** SKILL.md `cloud.further` — scenes done, realm,
  layer and 修为 (within one realm and save version), the later story move,
  the later write; a tie to the other side; the loser kept as a copy. The
  engine (Mac ↔ cloud) and the phone (↔ cloud, ↔ Mac) read the same
  declaration (`tools/further.mjs` ships it to the phone).
- **Encouraging, tactfully:** the engine and the phone hand facts only —
  `cloud: on|off|lapsed`, `kept_at`, `synced_at`, `rose_local_at` (the first
  realm/layer rise while local-only), and on the phone "away from the Mac with
  progress it lacks". 银月 words them, never mid-play, one a day at most; a
  settings line says where the save lives.
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
- **Seeded saves:** `rules.mjs seed --save=<n> --at=<scene|回|秘境>` builds a realistic save by
  playing forward (guide/testing.md); play-testers run one per 回, in parallel.
- **Coverage, in layers** (tools/README.md): the invariant checker (`rules/health.mjs`), the
  state-space explorer, policy sweeps (all-win · all-skip · lose-retry · random), and the page
  crawler — a human-like bot per board and dead-control detection 【在建】.
- **Unstick** (Ling's tool, guide/steer.md): runs the checker on the live save and applies only
  safe repairs — skip a stuck board with no reward, move him to the scene's place, re-tell owed
  passages, clear a stale lock, reopen a road. Never grants, never jumps ahead; asks once;
  undoable. Ling offers it when the player says he is stuck.

## Follow-ups from the 2026-09-30 rulings

The book fixed the hero as **沈小满** (male) and **阿禾 = 周禾** (female), third
person, no gender marks, and the game follows 原神 (story DESIGN § 四, § 四·五).

- ✅ **【已建】 the game follows** (2026-09-30): no 名字 card and no 男 · 女 —
  石坳村 goes on by a plain tap (`begin`); `people.json` `hero` names him and
  `newState` / `fitWorld` put him on every save (an old card-named save loads as
  沈小满, a boy); `{name}` fills him by the text's language; `slots.ban` and the
  `address` words are fixed; 阿禾's portrait pair went (`ahe-boy.webp` deleted);
  the book page fills the fixed hero; daily draws are seeded per save (`seedOf`: the save's own `seed` — its creation time, or once the name an old save was given), not by the now-shared name; SKILL.md and guide/tell.md say so. The
  value card stays for a scene that names a thing (tests/naming.test.mjs runs it
  on the old exit, tests/fixtures/name-card-exit.json).
- **Still open:** the prologue's scene passages still say 「这个少年，就是你」 and
  speak to 你 (the book is third person now); the book's 古二–古八 (renumbered 2026-10-02) still carry
  `{name}`/`{他|她}` marks and first person; every draw seeded by `state.name`
  (the deck's order, the day's riddle, notices, 传闻, road meets, 论道) is now the
  same for every player — seed them by the save's `created` if that matters.

## Open

- **Chapters 02–09 are the old spine** (银月's bell backstory); `00-zhuji` and `01-ji`
  follow the book since 2026-09-30; the rest wait for their 卷.
- **Flash-Lite lessons (2026-09-15):** a weak model tells a side story in one
  breath, drops authored lines in a long session, skips the last button.
- Offline play (the save needs the network) · the phone's chat · whether the
  plan's players get a larger 体力 pool · a healthy user gets a better Linggen
  (to talk through).

## 秘境探险 — the map run 【已建 · 第一重 played】

(Hanli, 2026-10-28, option A 秘境令; 「每个秘境给个名字? 和故事对应上?」)
The classic roguelite act (Slay the Spire's map, Hades' boons), at the stone door after 古五's 秘境 passage (the passage
itself untouched). `worlds/jiuding/mijing.json` (the nine 重, rooms, beasts, boons, 奇遇) · `rules/mijing.mjs` · the
card `scripts/mijing.js` · numbers `balance.json master.mijing`.
- **The key:** one 秘境令 a run. It drops from wins in the cooldown events (兽潮 a night, a pool's beast now and then,
  比武切磋 once built: `keyDrop(content, s, ctx, 'qiecuo')`), under the day's cap. The 秘境 has no cooldown of its own.
- **The map:** 3–4 rows of 6–8 rooms with branches, a 大妖 at the head; every room on a way to it. First row 妖兽, a 灵泉
  before the 大妖, a 守关 in the second row, a 奇遇 past the first. Rooms: 妖兽 / 凶兽 / 大妖 (the card 斗法, the
  page's own room), 守关 (守墙关 · 撒豆成兵 · 守山门 · 守炉 levels), 机关 (华容道 · 拼图 of the 重's painting), 奇遇 (data decides,
  银月 says it), 灵泉 (rest or temper a 功法), 宝箱, 心魔 (10-31: 格斗 against 沈小满's own shadow, level `xinmo` — his sheet
  washed dark, his clips for a foe's moves (`look.clips`), his own moves turned on him: 掌心火, the 绝's fire, the 飞剑; weight 6).
- **The run:** 气血 carries (a fight's door takes it as `wounds`, a board costs it by its stars, never below 1; 撤 off a
  board costs a quarter). Boons lie on what each game reads. The 大妖 clears it: all the loot, 灵石, pills, an arm, its
  card (the 大妖's gift, else a beast of the 重's he lacks), the next 重 open. Death or leaving keeps the loot by the depth reached. 修为 is the minutes cleared at a low
  share of the games' rate (a day's two runs about a tenth of a 练气 layer).
- **The nine 重** follow the book's places, each open once its scene is passed: 凶崖 · 暗河 · 石室 (古五: the 沉鼎秘境 itself, 第一重 its 凶崖), 灵草谷 ·
  九格崖 (古七), 孤崖 (古八), 漳渊 (古九), 雷泽 (卷二), 九鼎 (九鼎篇终).
