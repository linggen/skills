---
type: archive
reader: contributors
guide: |
  Designs Lingjing built and then replaced, kept for their reasons. Nothing
  here is true of the code now; design.md is.
---

# Lingjing — archived designs

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
  **In v3 (BUILT 2026-09-22):** the lower trigram's element, its 功法' damage and
  sweep `card` ±: 大吉 +2 · 吉 +1 · 凶 −1 · 大凶 −2 (never below 1), printed on the
  card as 卦 +n. The v2 `spell` numbers stay for the old bout.
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

## 灵气 — the game's own stamina (2026-09-14; renamed 体力, re-priced)

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

## A day, and 起卦 · 命格, as they were (2026-09-17 → 09-24)

> **Superseded 2026-09-24 by redesign-v2 (§ 四: 起卦 · 望气 · 命格 → 问卦; the day's practice boards stop being 功课).** design.md § A day is the current one.


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
3. **今日传闻** — Ling's one side story of the day, grown from a seed.
4. **Practice** — a board on the scene, no model; a hosted game costs 3 体力 when paid.
5. **The story waits** at its gate when a chapter is not yet open — said in
   one line, never nagged.

A few minutes. The spine moves on the days a chapter opens; the seeds and
the quests carry every other day.


## 伤势 · 羁绊 · 历练 · 机缘 as built (2026-09-23)

> **Cut or merged 2026-09-24 by redesign-v2 (§ 四, § 十 step 4).** 伤势: every fight begins whole, a loss only sends the beast away for the day. 羁绊 · 谈心 · 疗伤: no score; her card's lift comes from the chapters ended (`rewards.json → bond.lifts`). 历练: cut — a journey still out migrated to her being back at the player's side. 机缘: a kind of 路上 (design.md § 路上). Saves migrate at v5 (state.mjs).

- **伤势** (rules/companion.mjs). 气血 lost in a fight stays lost; it mends by
  the stamina clock (full in five hours) or a 回春丹; below a quarter the
  fight's door refuses `wounded`. A loss leaves the player at nothing.
- **羁绊** (rules/companion.mjs, `rewards.json → bond`). 相识 → 相知 → 相惜 →
  同心 at 0/20/50/100, capped 5 a day; grown by a win beside her, an elite
  beaten, a realm risen, her tending, a gift she wears, 历练, and Ling's one
  `Bond` a day. Each level lifts her card and her tending.
- **历练** (rules/daily.mjs). The player sends 银月 out from the 装备 card for
  2, 4 or 8 real hours, once a day, to a place within three roads; she brings
  finds, stones and (after eight hours) a card; called back early she brings
  a small share. She tells it herself.
- **机缘** (rules/daily.mjs). Once a day, somewhere within two roads, for three
  real hours; 收下 on the stage when the player stands there; pays the
  `chance` table and a card. Missed, it is gone.


## 精英's own rules (2026-09-23)

> **Cut 2026-09-24 by redesign-v2 (§ 四): an elite is its harder deck and nothing else** — the mode's share of 气血, a fight's 体力 (8), a haunt's pay, one card. The gate (tools/battle-sim.mjs) now asks only that an elite be harder than a plain beast by its deck, and flagged on 2026-09-24 that it is not yet (elite decks 86% vs plain 83% on the attentive line): the decks in creatures.json want retuning.

- **精英 and 杀招** (battle.js, creatures.json). An `elite` beast stands at its
  full 气血 and pays the `elite` table (half again, two cards). Every beast
  has a `signature`: at half 气血 it gathers a round, then lets it go once.


## The day's practice boards (2026-09-23 → 24)

> **Superseded 2026-09-24 by redesign-v2 (§ 四: 差事 · 榜文 · 功课棋局 → 差事).** A place's game opens only for an errand that asks for it; the errand pays.

- **Mini-games, 炼丹 and 论道** (rules/tasks.mjs, scripts/games/, lundao.json).
  炼丹 at a market and 洛书 · 华容道 · 七巧 · 五子 · 象棋残局 where a place
  hosts them: played on the stage, once a day, level by realm; the win is the
  page's `win`, paid at Practice `done` from the `game` table (5 修为, 10 灵石)
  for 3 体力 — an empty pool keeps the win until it refills that day. 论道 at
  稷下: 飞花令 · 成语接龙 · 对对联, three good answers pay 6 修为, three misses
  end it; 3 体力 at `open`.


## Economy as it stood before redesign-v2 (2026-09-24 morning)

- **Economy** (`rewards.json → _economy`). 修为 per 体力 at 练气: haunt 25/8 ≈
  3.1, elite 38/12 ≈ 3.2, a hosted game 5/3 ≈ 1.7, 论道 6/3 = 2.0 — the fight
  pays best even at its odds (a test locks it). A normal 练气 day ≈ 115, so
  练气's 810 takes about a week.
