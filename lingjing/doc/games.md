# Lingjing — the small games

Every small game, for Hanli's design check (10-16). Systems live in `design.md` (§ 小游戏 in the
story, § 新小游戏); this file is the list: what each is, what is wrong, what to do, keep or cut.

**Summary.** 卷一 has 41 story boards (16 in 古一/古二, 19 in 古四 → 古七, 5 in 今线, 洛书 in 古三),
plus 9 daily boards, the 秘境 boards, the 密室 and the AI games. Played on scratch saves at 390
(a human-like bot, 200 ms reactions, and a look at every frame): none got stuck, no dead control —
the problem is the one Hanli named. Most beats are **a story choice with a button**: eight of the
16 prologue beats are won by the bot in under 8 s (射鹿 5 s, 喂饼 5 s, 算账 5 s, 忍字 5 s,
扔石听声 4 s, 认路 7 s, 攀 7 s, 算盘 6 s) — one obvious answer, no way to do it better, no stake.
What the fight has and they lack: **a visible stake** (hp → a fist closing, a patience meter),
**a read you get better at** (the foe's intent → the wind, a swing, a rhythm), **a number on every
hit**, and **a stamp at the end**. So: (1) a shared kit for every beat now — a one-line goal, an ink
pop or number on each action, a seal stamped on the win, the main control under the thumb; pure
UI, it ships without waiting; (2) **fewer and better**: keep six, cut the rest (below);
(3) new core loops only where marked, after his read.

**Keep in 卷一 (six):** 喂饼 → 割绳子 (built 10-16) · 射鹿 → 砸寨 `deer-wind` (10-20; was `deerarc`) · 接雨 ·
吹鹅毛 (new loop) · 喷嚏符 (already the most fight-like) · 顺风溜 → 几何冲刺 (after launch). Plus
**最后一罚** as 今线's one. **Second tier** (good timing reads; keep only if he likes them on
replay): 烙饼 · 拽 · 小周天 · 禹步. **Cut the rest** — each is a passage he can read in the time it
takes to play. (The rhythm rule, ≤1,500 字 between beats, is **not** met today: 7 stretches of the prologue
and 23 in 卷一 already run over — the cut below never adds one.) A cut board leaves its scene's
`show`/`offers`/`needs` (the passage stays).

**Card law (Hanli 10-16):** 小满 gets a card only for **his own art the book says he knows**, or a
thing the book names that he can use (符, a weapon, 牛脂甘露); never another person's art (阿禾's
are hers, played by her in the party); a tamed 灵宠 is a card. "得牌?" below: **yes** = the book
has it as his; **?** = the book is not clear, his call; **no**.

Length: the bot's time at 390 (a person takes about twice). Skip: 「算了，往下走」 shows only when
stuck — 75 s unwon, or the game's own `stuck` rule where noted; a skip pays nothing.

## Before 入门 — five boards (Hanli 10-16, second cut)

Hanli 10-16 「入门前的怎么办? 减少数量, 推动剧情」: before 入门 only five boards stand —
**第一回** 接雨 `rain-basins` · 拽爹上崖 `fall-storm` · 喂饼 `bread-share`; **第二回** 射鹿 `deer-wind`;
**第四回** 洛书门 `gate-luoshu` (the village maps aside). Cut from their scenes (`show`, `offers`,
the exit's `needs`; each passage merged whole, `story_after` into `story`): 忍字 `masan-taunt`,
认路 `yinyue-way`, 烙饼 `kitchen-griddle`, 算账 `rent-scale`, 吹鹅毛 `feather-breath`, 练功
`halfyear-carry`, 忍 `xisui-hold`. Their tasks, modules and the three rope levels stay in the tree
(a save holding one offered lets it go on load). The cards still come: 「先看风，后看鹿」 with 射鹿;
「吐纳 · 先吐」 now from the 00-halfyear passage (爹's line), as a story card. No line read a cut
board's mark. The reading cap gives way here — the story is the point (tests/opening-beats.test.mjs
holds the five). **Relaxed 10-20** (Hanli: 「可以, 放宽, 把那三关加进去」): the three built 割绳子 levels
忍字 · 认路 · 算账 are back in their scenes (§ 读太长, below) — eight boards before 入门; the old weak boards (吹鹅毛,
练功 · 半年挑担, 忍 · 洗髓, 烙饼) stay cut. The same day two 气走经脉 levels broke the longest read (§ 读太长 › round two):
挑水上坡 in 00-halfyear (on 练功's old task id, a new level) and 今一's 边跑边念 — nine 古 boards before 入门, two 今.
Hanli 10-19 「留着」: 扔石听声 `cave-stone` (row `caveecho`, 00-cave, before 喂饼) stayed in 第一回 as a
sixth board — then, the same day, approved to go with 射鹿 · 等风: **cut again 10-19**, the 10-16 way —
00-cave's passage whole again (word for word), 喂饼 the scene's one board; the task (marked `cut`, so a
save holding it offered lets it go on load), row, module and bot stay for the 游戏厅.

## The throws — levels of 砸寨 (10-20)

Hanli 10-20: 「射鹿可以用砸寨代替. 其他投掷类都用砸寨的不同关卡代替」. Every throw in the story is a level of 砸寨, the one throw
kit (tools/zhazhai/src/data/throws.ts; a task's `deal.lv` names it; 游戏厅 `arcade.html?dev=1&game=zhazhai&lv=<key>`). A level
sets its place (a painted backdrop), its target (a body and a behaviour: `deer` bolts on a throw whizzing past and comes
back elsewhere, `gourd` shows its light only after a stone lands in the dark, `lu` turns every blow but at the wing root
while it breathes), props of wood and stone drawn as the things they are (log, boulder, pine, dead tree — a pine is
`fixed`: it takes an arrow and stands), and only the throws 小满 owns there (the card law). In story order, each tighter
than the one before — the share of a pull grid whose flight reaches the soft spot clear of what stands in the way
(tools/zhazhai/bot.mjs `windowOf`), times how much of the time it shows:

| beat | level | target | ammo | setting | room |
|---|---|---|---|---|---|
| 第二回 00-deer 射鹿 `deer-wind` | `deer-wind` | the stag, bolts | 箭 ×3 | the valley stream by day: a log on two stones, a pine, a dead pine leaning over it | 1.93% |
| 今一 j01-track 投一个给我看看 `jin-toulan` (10-20, the 调息 cut) | `toulan` | 马小宝's 摇杯 on a folding table behind the hoop | 篮球 ×3 (no trick) | the 百团大战 square: the portable hoop (a hidden backboard body under the painting) | 1.68% |
| 第五回 wm-anhe 暗河 `anhe-dark` | `anhe-dark` | 邹青松's gourd, lit by a stone | 石子 · 箭 · 石子 · 箭 | the dry underground river, dark: a boulder he crouches behind | 1.63% |
| 第六回 wm-qianye 讲堂试法 `qianye-qiajue` (10-20, the 调息 cut) | `jiangtang` | three straw dummies (`still`): behind a bench, behind a post, on a bench | 火弹 · 冰锥 · 金刃 · 火弹 — his 四层 (burst · split · dash, 金刃 cuts wood) | the back of the lecture hall | 1.49% |
| 古七 09-yishui 芦苇里那一等 `yishui-reed` | `yishui-reed` | the 鯥, its wing root on a breath | 短飞剑 ×3 (tap: dash) | the 沂水 shoal by night: driftwood on stones, 孙二狗's board and torch | 1.40% |

Bots (headless Chromium on the built bundle, a fake clock): a sensible hand (aims along the flight it knows, σ 0.6° and
1.2% of the draw; waits for a fled stag, the breath, the light) wins each 5/5 in two runs; a lazy one (a full draw at 45°,
never a tap) 0/5. The old 射鹿 board (`deerarc`, its forts, `throwkit`, `luwing`, smash.js, the old ink `deer.js`, their
bots, tests, art and sounds) was deleted with the port; the cut 扔石听声 (`cave-stone`) has no level.

**灵石 for a small game (Hanli 10-16):** after 入门, a board's first clear pays plain 5 · good 10 ·
best 15 (balance.json `boards`), on top of its grant, shown in the win line; a replay pays nothing,
before 入门 nothing. Rank: a task's `ranks`, else three 灵光 = best, else of its marks the first
best, the last plain, one between good; no marks = plain (a reading — his to change).

## Cut 10-16

Hanli 10-16 「按你说的删减吧」: the clearly weak beats go — his eight (扔石听声 · 听 · 忍字 · 认路 · 攀 ·
算账 · 算盘 · 追踪). No other row says a bot wins it in seconds with one obvious answer (the prologue
table is the only one with times; every other ≤8 s row is one of the six), so none was added.

- **Cut (5):** 追踪 `track` (00-heisong — the stone clue alone gates the chase), 听 `listen`
  (00-storm), 扔石听声 `stone` (00-cave), 攀 `climb` (00-cliff), 算盘 `abacus` (00-uncle). Board,
  task, registry row, bot, module and tests gone; a scene's passage split for its board (00-storm,
  00-cave) is whole again, word for word. A save holding one offered lets it go on load; one done stays.
- **Kept for the reading cap, replace with 割绳子 (3):** 忍字 `taunt`, 认路 `way`, 算账 `scale` — each cut
  would open a stretch over 1,500 字 or lengthen one already over (numbers in the column).
- **Rhythm** (`rhythm.mjs`): 23 stretches over the cap in 卷一 before (7 in the prologue), the same 23
  after, none longer — the stretches the cuts joined stay under: 黑松岭 → 拽 659 字, 认路 → 射鹿 1,457,
  练功 → 开山门 1,441; 拽 → 喂饼 1,241 (00-cave's whole passage now leads into 喂饼).
- **得牌 rows that died:** only 追踪's **? (his tracking)**. Every other cut row was **no**. The cards
  agent (doc/cards.md) picks another source for a tracking card, if Hanli wants one.

### 割绳子 slots (Hanli 10-16: 「不好玩的砍掉, 用割绳子代替」)

Fewer game types, on proven mechanics: where a beat was cut, or is kept only for the reading cap, a
割绳子 level goes in its place — level data for the 喂饼 module (being extended now: generated levels,
灵气泡, 荆棘, regrowing vines), not a new game. Until a slot's level exists its old beat stays (the
three cap rows), so the rhythm lint stays green; a cut slot already green stays empty until then.
Each slot: the scene, what the book drops or steers, the element it brings.

| slot | scene (task id to give it) | the book's reason | what falls / is steered → goal | element | priority |
|---|---|---|---|---|---|
| 算账 | 00-rent (`rent-scale` → `rentrope`) | 「肉二十斤，抵今年的。」 — the meat onto 马三's steelyard | the venison, hung by vines → swung onto a stone chute → the steelyard's pan (re-laid 10-20, round two) | 乌鸦 (race it: the other vine first) | **built 10-16 · in 00-rent again 10-20** |
| 忍字 | 00-masan (`masan-taunt` → `tauntrope`) | 「学声狗叫，给你舔一口。」 — 小满 won't beg | the 桂花糕 on its string → back into 马小宝's own mouth (the book's; a yard dog's until round two, 10-20) | 弹竹 (bounce it over), a puff | **built 10-16 · in 00-masan again 10-20** |
| 认路 | 00-yinyue (`yinyue-way` → `wayrope`) | 「先带本王出去。」 — out of the valley | the little fox, swung into a 灵气泡 → the moss at the valley mouth | 灵气泡 (swing in, pop), a puff along the roof | **built 10-16 · in 00-yinyue again 10-20** |
| 扔石听声 | 00-cave (cut; empty) | 「先往里扔一块石头，听了听」 | a stone → the shallow hollow (it must knock on rock, not fall in the deep one) | slab (the knock: hit the ledge) | 2 |
| 攀 | 00-cliff (cut; empty) | 右手抓一根荆条; 爹's hand at the top, 老周's rope | 老周's rope-end lowered → 小满's right hand | 荆棘 (thorns cut a vine they touch), regrowing vine | 2 |
| 追踪 | 00-heisong (cut; empty — the stone clue is the beat) | the prints break at the grey stone; the deer crossed the stream | a carved bark chip → the moss-scraped grey stone across the stream | wind (the stream's push, sideways) | 3 |
| 听 | 00-storm (cut; empty — 拽 follows at once) | the birds stop; the cloud presses down; back by the marks | — (leave empty: 拽 is the next scene's board) | — | — |
| 算盘 | 00-uncle (cut; empty) | the night's sums; 「五两银子，一年」 | five taels → 舅舅's purse (only if Hanli wants a beat here) | regrowing vine | 3 |

**The module's tools** (rope.js `ELEMENTS`, each data-declared, taught the first time with a ring and a line):
风 (puff) · 灵气泡 · 荆棘 · 会再长的藤 · 弹竹 · 双印 (twin seals) · 乌鸦 (crow) · 坠 (a weight on a strap under the thing, 拽 10-19; story only, not in the 饭桶's days). The 饭桶 brings them one a day
(days 2–8); the three story beats teach 弹竹 (忍字), 灵气泡 (认路) and 乌鸦 (算账). Not built yet, proposed:
浮空符 (flip the thing's gravity a moment — a 符 he owns, so the card law gates it), 磁石 (pulls metal: 火柴, 铜钱),
旋风 (spins and lifts it).

**Level-data proposals for the other slots** (each a 割绳子 level frozen from rope-gen.js with its tool, its book line
quoted, the page's skip and the task's pay — Hanli picks which to build):
- 攀 (00-cliff): 老周's rope-end lowered by vines to 小满's right hand; 荆棘 on the wrong swing, a regrowing vine
  that catches it again if he waits — 「右手抓一根荆条」.
- 追踪 (00-heisong): a carved bark chip carried by the stream's wind (a long puff band) to the grey stone across.
- 算盘 (00-uncle): five taels dropped through twin seals into 舅舅's purse — 「五两银子，一年」 (only if he wants a beat here).
- 扔石听声 (00-cave): going to the throw module (射鹿's), not this one.
- Second tier, if he finds them not fun: 烙饼 (the flatbread flipped onto a springy bamboo into the pan), 拽
  (爹's rope: cut his pack free so he swings to the ledge — **built 10-19**, `fallrope`, § 拽 below), 禹步 (a 灵气泡 carried square to square past 荆棘).

Also **replace with 割绳子 or another proven mechanic if it isn't fun** — Hanli plays and decides:
烙饼, 拽, 小周天, 禹步 (the second tier) and 吹鹅毛.

## 拽 · 拽爹上崖 — 割绳子 with a timed cut (built 10-19, `fallrope`)

Hanli 10-19 「拽爹的也不好玩」, and harder than 喂饼. 00-fall's `fall-storm` (id, title, line, grades kept)
plays one hand-made level on the kit: 爹 hangs over the drop on two ropes — 0 from a pine root out over the
drop, 1 from the root above the slope — his pack (**坠**, new in rope.js: a weight on a strap under the thing,
the strap cut like a vine) dragging under him. The ledge is on the cliff side, out past the end of his swing.
- **The read:** with the pack on, his swing in snags on the rock spur below (no order wins); rope 1 first
  swings him out over the drop. So: the strap, rope 0, and rope 1 **cut as he comes to the end of his swing
  toward the ledge** — a 0.40 s window ~1.1 s after the cut, early drops him in the drop, late swings him back.
- **The storm's gust** (the puff): tapped as he swings in, it carries him higher — the cut window widens to
  0.6–1.1 s and the third 灵光 lies only up there. Stars 3 → clean, 1–2 → steady, 0 → rough.
- A swing level (`air` 0.008 on the hung thing, never quickened): the swing is the clock; it keeps going a few
  times, so one lay gives two or three chances. A snag can be saved: strap, then the gust.
- **Hands** (bots/fallrope.js, the same `decide` in the node sims and in play-human's swing hand on the live
  page): casual 20/20 won in 90 s, median 31 s, most after 1–4 misses, ★3 on about half; sloppy 15/20,
  median 49 s; idle never. The first-ever 割绳子 the player meets (拽 comes before 喂饼) — the teach ring and
  line point at the strap.
- Art: 爹, the pack, the ledge, the spur and the storm cliff painted by local FLUX (tools/paint-rope-flux.py).

## 古一 · 古二 — the prologue's beats

| 回 · scene | game | the book | how it plays now | what's wrong | proposal | length | skip | 得牌? | cut 10-16 |
|---|---|---|---|---|---|---|---|---|---|
| 一 · 00-kitchen | 烙饼 `griddle` | 「一张厚，一张薄」 | call 「翻！」 when a side goes golden; thin then thick | a real timing read, but the brown is hard to see on the paper | second tier; kit: stronger browning, a pop on each call | 21 s | 75 s | no | **cut 10-16 (before 入门)** — module kept |
| 一 · 00-masan | 忍字 `taunt` | 「学声狗叫，给你舔一口」 | the taunt once, then said back piece by piece; wrong pieces and time close the fist | the right piece is easy to spot; the fist barely shows | **cut** (the passage carries it) | 5 s | 75 s | no | **cut 10-16 (before 入门)** — **back 10-20 as 割绳子 `tauntrope`** (§ 读太长) |
| 一 · 00-shiao | 接雨 `rain` ★ | 「一场雨接满十七个盆」 | tap a dripping spot to set a basin, tap a full one to bank it; 17 to fill | a full basin takes two taps (lift, set again); a leak gives no warning; the water in a basin barely shows; the cap is 110 s | **keep**; one tap swaps a full basin for an empty; a leak shows as a stain 1.5 s ahead; overflow splashes; 4 drips a basin → ~45 s | 38 s | 75 s | no | kept (the six) |
| 一 · 00-shiao, 00-xiuxian, 00-notice | 石坳村 `village*` | the village | a map with a few optional things; 「回家」 whenever | a stroll, not a game, and need not be | keep as the map (not counted as a beat) | free | own 「回家」 | no | — (the map) |
| 一 · 00-kitchen | 烙饼 `griddle` | 「一张厚，一张薄」 | call 「翻！」 when a side goes golden; thin then thick | a real timing read, but the brown is hard to see on the paper | second tier; kit: stronger browning, a pop on each call | 21 s | 75 s | no | kept (second tier) — replace with 割绳子 or another proven mechanic if it isn't fun (his play) |
| 一 · 00-masan | 忍字 `taunt` | 「学声狗叫，给你舔一口」 | the taunt once, then said back piece by piece; wrong pieces and time close the fist | the right piece is easy to spot; the fist barely shows | **cut** (the passage carries it) | 5 s | 75 s | no | kept — **replace with 割绳子** (cut, 村口 → 灶间 reads 1,866 字 > 1,500) |
| 一 · 00-shiao | 接雨 `rain` ★ | 「一场雨接满十七个盆」 | **打地鼠 (10-16, Hanli: 「一个或2个地方漏雨, 只能相应的盆」)**: a leak pops up — its stain 0.9 s before the first of 4 drops — then stops, and another pops up elsewhere. **Harder 10-19 (「同时放两个盆, 或者快一点」)**: the first two leaks come alone (the teaching), then two open together (≤0.25 s apart) — two basins to set — and from a quarter of the night a pair or three; quicker (drops 0.5→0.4 s, leaks 2.4→1.2 s). A basin goes only where it leaks now (a dry tap is a wasted trip, the hand busy 0.5 s); when the leak stops the basin goes to the 水缸 and is back by itself — no running out, no covering spots ahead. 17 leaks caught to win (~29 s at a person's pace). **Fail**: 19 puddles (`FLOOD`, the head shows `地上 n / 19`, red in the last five) before the fifth watch lose the night — 娘: 「屋里成河了！」, the same night again after a 1.5 s calm; 3 floods → the skip | (old board: six basins down at the start won it; basins ran out at 16/17; it never failed) | N re-picked 10-19, 60 seeds, one night's puddles (a hand taps its pace after the stain, ~0.35 s after its last tap): bot 0 · 0.6 s median 2, max 5 (never floods) · 1 s median 18, 16/60 reach 19 · 1.3 s median 27, 60/60 · away 3 s in 8 median 25, 57/60 · away 5 s in 10 60/60 · idle floods at ~11 s (was FLOOD 40: one at a time to a quarter of the night, 0.6 s max 3, nobody but the idle lost) | ~29 s | 75 s or 3 floods | no | kept (the six) |
| 一 · 00-shiao, 00-xiuxian, 00-notice | ~~石坳村 `village*`~~ | the village | (was: a map with a few optional errands — shoo hens, name prints, pick 艾草, guess prices, guess the tale) | homemade quizzes (Hanli 10-16: 「轰鸡这几个小游戏, 不太好玩」, 「这几个要不要删掉? 有用吗?」) | — | — | — | no | **cut 10-16** — the passages carry 阿禾's cabbage, 吴婆婆, 爹's knee; code, bots, tasks gone; the map painting stays at art/backdrop/village.webp |
| 一 · 00-heisong | 追踪 `track` | 「一百步刻一道」 | pick the deer's sign of five; walk; 刻 at 100 steps | the count is on screen — wait for 100, tap | **cut** (or: the count fades at 50, keep it in your head) | 22 s | 75 s | ? (his tracking) | **cut** |
| 一 · 00-storm | 听 `listen` | 「鸟忽然全停了」 | say 「不对」 when the birds stop, then pick the sign | the cue is only text; the how-line gives the sign | **cut** (拽 follows straight after) | 11 s | 75 s | no | **cut** |
| 一 · 00-fall | 拽 `storm` → **`fallrope`** | 拽爹上崖 | (was: three pulls in the lulls between gusts) **割绳子 since 10-19** (Hanli: 「拽爹的也不好玩」): 爹 over the drop on two ropes, his pack (坠) on a strap under him; the strap first, the outer rope, the last rope cut at the end of his swing toward the ledge, or the storm's gust swung in first (§ 拽 below) | (was: one timing tap, no read) | built | casual ~30 s | 75 s | no | **replaced 10-19** — `storm` kept in the 游戏厅 |
| 一 · 00-yinyue | 认路 `way` | 「崖壁上一段划了一道」 | a small grid seen a step around him; follow his marks | the marks lead straight | **cut** | 7 s | 75 s | no | **cut 10-16 (before 入门)** — **back 10-20 as 割绳子 `wayrope`** (§ 读太长) |
| 一 · 00-cave | 扔石听声 `stone` | 「先往里扔一块石头」 | a stone into each of three hollows; go into the one that knocks | the how-line names the right sound; one decision | **cut** | 4 s | 2 wrong | no | **cut** (its passage whole again: 1,148 → 1,241 字 before 喂饼) |
| 一 · 00-cave / 00-fox | 喂饼 `bread` ★ | 那张厚饼，分它一半 | seven pieces: to the fox or to himself | two buttons, nothing moves | **built 10-16** → 割绳子 physics puzzle: the 饼 on vines in the cave, cut them (tap or swipe) so it swings to the fox's mouth; four levels (一根藤 · 两根藤 · 石板 · 洞口风), a 饼角 a star (3), the order of cuts is the answer, never the timing; instant retry | 5 s | 75 s | no (银月 is already a card) | kept (the six) |
| 二 · 00-deer | 射鹿 `deer` ★ | 「风。往左偏半寸。」 | set the aim (‹ = left), hold to draw, let go in a lull | the skill is pressing ‹ once; a static target | **keep** → 愤怒小鸟 drag-and-arc (`deerarc`, the beat since 10-16; **10-19 physical**: real bodies, breakables, the juice — § below; the story plays 静 · 风 only, step 下一处) → **狩猎瞄准 `deerhunt`** (built 10-19, 游戏厅; the beat once Hanli has played it) | 5 s | 3 misses | yes — 先看风，后看鹿 (爹's lesson to him) | kept (the six) |
| 二 · 00-cliff | 攀 `climb` | 「右手抓一根荆条」 | each reach, pick the branch in leaf; rest on the stone | a two-way pick, always readable | **cut** | 7 s | 2 slips | no | **cut** |
| 二 · 00-sleep | 忍 `xisui` | 「疼，别喊」 | hold to grit while three sticks burn | holding a button for half a minute | **cut** (the 洗髓 passage is stronger read) | 27 s | 75 s | no | **cut 10-16 (before 入门)** — module kept |
| 二 · 00-rent | 算账 `scale` | 皮抵欠，肉二十斤抵租 | hand the hide; tag cuts (weights shown) to 20 斤; 称 | the weights are printed — a sum, not a weigh | **cut** (or: rough weights, a live beam, 马三 waits three weighs) | 5 s | 75 s | no | **cut 10-16 (before 入门)** — **back 10-20 as 割绳子 `rentrope`** (§ 读太长) |
| 二 · 00-halfyear | 吹鹅毛 `feather` ★ | 「吐气，毛不许动」 | press and draw slow circles, 20 s a breath, three breaths | circling a mouse is a chore; the feather barely moves; the pad sits far from the feather | **keep**, new loop: hold to breathe out, let go to ease — keep the breath inside a band; too strong the feather shakes and flies, too weak the chest bursts; the band narrows as the count climbs (needs his go) | 23 s | 75 s | yes — 吐纳 · 先吐 (the scroll's, his) | **cut 10-16 (before 入门)** — module kept |
| 二 · 00-halfyear | 练功 `carry` | 挑水上坡不喘 | step when the swinging buckets pass the middle | fine, but the same beat as 吹鹅毛's scene | **cut** (one beat a scene) | 15 s | 75 s | ? (one breath card with 吹鹅毛) | **cut 10-16 (before 入门)** — module kept |
| 二 · 00-uncle | 算盘 `abacus` | 「一笔一笔地算账」 | three sums on the beads | arithmetic, not play | **cut** | 6 s | 4 wrong | no | **cut** |
| 三 · 00-luoshu | 二试 `luoshu` | 洛书九宫 | fill the magic square | a puzzle; the test the book sets | keep (a test, not a beat) — **the one 九宫格 in the story** (Hanli 10-19: 「9宫格出现一次就可以了」) | ~60 s | 75 s | no | — (a test) |

## Pruned 10-20 — the 饭桶's old play and the trial games

Hanli 10-20: 「喂饭桶那个没啥玩的好像」, then 「试做或者不要的, 可以删了吧?」. **Deleted** (module, bots, tests, CSS,
art only they used, games.json row): 割藤 `fantongcut`, 烙饼 `laobing` (+ its 9 pictures and paint tool), 喂饭桶 · 开炉夜
`fantongqianye`, 喂饭桶 · 那粒息珠 `xizhurope` (ropebeats' 喂息珠), 扔了干净's old board `fantonghuochai` (its 大场面 stays),
the 饭桶 stops `games/fantong.js` and the feed puzzle (`fantong-puzzle.js`, fantong.json `puzzle`). **Told**: wm-luobo
(the 秘境's spoils, the radish, the pill) and wm-zhaojing's 开炉 (the fourth press, the five feeds) read in the book's
words; 藏息 is wm-zhaojing's one board. **Kept**: the free 饭桶 in the pouch (feeds straight in), what it eats and spits
(fantong.json), its art, the comic item set, the rope kit. **秘境**: 拾遗 plays 撒豆成兵, the run's board a short 守炉
(shoulu `realm: mijing`, three levels of three waves, 犰狳 then 合窳), the 奇遇's 割藤 is 撒豆成兵 — each dealt the next
level after the last he won (rules/climb.mjs). Reading cap: wm-chu{景=ershisan} → wm-qianye 1,337 · 1,494 → **2,831**
(over; a set piece for the radish and the pill would break it); wm-zhaojing (藏息) → wm-laba{景=diche} 103 · 466 → 1,130.
The 游戏厅's groups lost 「试作」: 投掷 · 气走经脉 · AI.
**Back 10-21** (Hanli: 「agree」 — the reading cap): the 饭桶's first feed, the 牛骨头 at wm-diyilu, as a 割绳子 level of the rope kit
(`niugurope`, ropebeats.js; the pot's eating, steam and 「嗝」 seal restored there as `potTarget`) — a puff to finish, not order alone (§ 读太长).

## 读太长 — the reading cap, stretch by stretch (10-20)

Hanli 10-20: 「剧情连续阅读太长的地方, 你处理一下, 看是否可以加个小游戏等」 — under the standing rule (10-19), each fill a level of
a proven kit that fits the book's action there, else a 大场面; never across a key emotional moment. Measured by
`scripts/rhythm.mjs` (the lint's warnings; cap 1,500 字 of the box's own passages between two beats). **The tool now
counts a set piece laid under a paragraph** (`{景=id}`) as a beat, as it already counted an exit's `setpiece`: 银月's two
(00-yinyue), 沉鼎山 (00-gate), 底册 (wm-laba), 扔了干净 (09-snow) and the new 二十三下. "Before" below is origin/main
`e46b81c2` by the tool as it was; the 10-19 sweep's three (6,414 · 2,773 · 1,635) were the same stretches, counted to the
pieces. 21 stretches of 卷一 ran over (by either count); 20 after — 1,635 gone, 6,367 down to one stretch of 2,556.

| stretch (before) | before | after | what went in, and why it fits |
|---|---|---|---|
| wm-xirang/swallow → wm-qianye (古五 → 讲堂) | 6,367 | 2,556 · 1,150 · 1,337 · 1,494 | **气走经脉 · 息壤** (`xirang-wumen`, wm-kaikai): 银月's 「你推着它们走一圈。」「他便推…木、火、土、金、水，转了一圈」 is the kit's own move — five 关 in the 相生 order (木 heaves up · 火 beats · 土 the heaviest 浪头 · 金 the narrowest · 水 turns), between 罚球 and 掐诀 on the ladder (n 6). Live at 390 (play-human, casual): 3/3 won, 4–9 岔气, 50–79 s — 罚球 2/2 with 7, 77–95 s; a first, narrower cut lost 0/2 (15–23 岔气) and was eased. The 息壤 paragraphs moved whole from the swallow passage to open wm-kaikai. **大场面 · 二十三下** (`{景=ershisan}`, wm-chu): the 23 blows at the stone door, counted, the last a tap — the book's own big moment, no kit's verb (FLUX: the ledge, the fist). 息壤's 五门俱开 card moved from wm-xirang's way on to wm-kaikai's (after 「息壤，都长进了他身子里」), so it never stands before the earth is scattered. **割绳子 · 喂息珠** (`luobo-xizhu`, new scene wm-luobo, the woodshed): 「喂进饭桶，兴许开出一颗筑基丹来」 — feeding the 饭桶 is already the kit's daily frame; 灵气泡 and the woodpile's 荆棘 (seed xizhu-3, harder than 喂饼 · 洞口风); the burp, the radish and the pill read after it. The first 2,556 (the dark-river fight's telling, the kill) waits on **a 砸寨 level for the port agent** (below). |
| wm-jiaxin → end of 古六 | 1,635 | 486 · 1,149 | **气走经脉 · 后山** (`baishi-houshan`, wm-baishi): 「山路越走越窄，窄得只容得下一只脚，小满跟在后头，气也不粗」 — 瞿老 testing his breath on the way up; switchbacks narrowing to 34, the 金线 the whole climb, a turning cliff wind (n 9, after 藏息). Live at 390: 3/3 won, 1–5 岔气, 42–83 s — 藏息 2/2 with 1–7; a narrower first cut (to 31) lost 0/2. Its 修为 is 念开篇's (cut 10-19). 家信, 收徒 and 「我娘教的」 stay read. |
| j07-dark → 09-snow (黑地 → 扔了干净) | 3,533 | 2,928 | not filled. 今三 (沈芒's world: the breath kit only). Its action is the 闭关三日 squats (the lesson is that he should not have done them), the hospital and 阿禾's silence — a game there breaks it; the one kit action, 「十投二」 free throws, is its last 60 字. The count is lower only because 扔了干净's piece now counts. |
| 00-shiao → 00-heisong/carve | 4,767 | 4,767 | before 入门: five boards (Hanli 10-16, 「减少数量, 推动剧情」); the built 忍字 · 算账 · 认路 割绳子 levels wait off-scene. His call (taste note 1) — **he said yes 10-20: below.** |
| 00-cave → 00-deer | 3,166 | 1,721 | before 入门; 银月's two pieces now count (00-yinyue). |
| 00-deer → j01-retest | 12,867 | 12,867 → 1,206 · 3,385 · 5,255 · 3,106 | before 入门 (古二 and 今一's first two scenes) — 10-20: 算账, then 挑水上坡 and 边跑边念 (§ round two below). |
| j01-retest → 00-luoshu | 3,382 | 2,571 | before 入门; 沉鼎山's piece now counts. |
| 00-longzhi/subdue → end | 3,018 | 3,018 | 入门 itself (the hall, 外门, the door of the 秘境) — before 入门. |
| start → wm-zhoutian (古四) | 2,035 | 2,035 | not filled (阿禾's debt, the first lesson) — no kit's verb. |
| wm-zhoutian → j04-line | 12,328 | 2,968 · 9,360 | **守炉 · 药园巡夜** (`yaoyuan-xunye`, wm-yaoyuan; 10-20, 守炉's first story level — Hanli: a new level a 回 from 古四 on, at its climax): the second night's passage cut at 「天地再大，他只认得脸上的风。」, the board the dark he waits through, then 丑时 and the 狰 (`story_after`), then the 萝卜. The 药园's spiral road from the west cliff's foot; **野猪 only** (the 狰 is the book's to tame, never fought), 剑阵 · 火符, four waves, hpMul 2.6, ~3 min. Tuned live: at 3.2 (the human bot's 20/20, 14/20 ★3) a plain first-timer's hand — a fixed plan, a look every 1.6 s, 银月 never ordered — lost the board at 390 and kept 5 fire at 1440 (the sim agreed: 11/20); at 2.6 that hand wins 20/20, mostly ★2–3, the human bot keeps every fire, `none` loses (tests/game-shoulu.test.mjs `firstTimer`). Its lead card: the book's two lines the box's cut leaves out (the pawprints from the west cliff; tonight it can only come west, into his arms). Both sides still over: the 2,968 is 小周天's telling and 青石 before it; the 9,360 is the rest of 古四 (the 狰, the 柴房's 二十三下, the 饭桶, 第一路) and 今二's gym (2,702 + 1,050). **10-21 (Hanli: 「agree」): 割绳子 · 喂饭桶 · 一根牛骨头** (`diyilu-niugu`, wm-diyilu, game `niugurope`) — the 饭桶's first feed, 「喂它，它吐东西」 … 「一根伙房熬汤剩下的牛骨头，一样一样往里扔」: the passage cut after 「…把饭桶抠了出来。」 (the box's cut and the book's alike — the landing rule), the board in the woodshed (three strings from the beam, the 柴墩, the door's draught; the two side strings first in either order, the last over the block lays it there, the puff blows it in; the other four orders hit the floor and no order of cuts alone feeds it — a scratch casual hand wins in 33 s median, 61 s at 80%), 「头一样，扔了根柴火棍」 on read after it. 9,360 → **2,552 · 6,808**: the far side is 第一路's telling, 留给爹 (2,318) and 今二's gym — still over. |
| j04-line → wm-wangzuo/open | 4,668 | 4,668 | not filled (今二's dog, the 秘境's door, the 蛫 wall). |
| wm-lun2/dodge → wm-juesai/face | 1,651 | 1,651 | between two duels (秦雁 · 马小宝); 151 over, the final's lead-in. Left. |
| wm-juesai/face → wm-jiaxin | 3,414 | 3,414 | the 10-19 sweep's call: the story's point (猪蜻蜓 cut). |
| start → j07-dark (今三) | 2,348 | 2,348 | 今线; 黑地十一步 is the beat at its end. |
| 09-furnace → 09-lingcao/fight | 2,175 | 2,175 | the 10-19 sweep's call (定风 → 灵草谷). |
| 09-lingcao/fight → 09-yishui | 1,893 | 1,893 | not filled (钱掌柜's shop, 秦雁's spar, 随风 — 随叶 already plays it). |
| 09-futian/spar → 09-cliff/take | 4,676 | 4,676 | 古八 (瞿老's 筑基 lesson) into the 筑基 piece. |
| 01-ji: start → j09-final | 2,888 | 2,888 | 今四; 最后一罚 at its end. |
| j09-final → 01-altar/send | 4,689 | 4,689 | 今四's 冬至, 第九回's arrival. |
| 01-rise/stand → 01-deep/seal | 2,164 | 2,164 | not filled. |
| 01-deep/seal → end | 3,129 | 1,383 · 1,746 | 卷一's last pages (the cauldron). **10-21 (古九's per-回 pass):** 斗法 · 老井 — the take passage split at 「脚底下的水，不响了。」 into 01-laojing, the 试 on its way on `dodge` (foe-laojing). |

**砸寨 levels to make (the port agent's; Hanli 10-20: 「其他投掷类都用砸寨的不同关卡代替」):** wm-xirang/swallow, the dry
暗河 — 「小满搭上一支，左手在地上摸了一块石子，往左边黑里一丢。『嗒』。铜塞子『啵』地一响，葫芦嘴里亮起一团红光…他一箭奔那团红光去
了」: a stone thrown into the dark to make the gourd open, then the arrow at its light, 邹青松 behind the rocks, four in the
dark; it would cut the 2,556 at ~650.
**Done (the port, 10-20):** 砸寨 `anhe-dark`, placed: wm-xirang's swallow passage is split at 「黑里射不着人」 into a new
scene `wm-anhe` (its board, then the rest of the passage word for word; the fight's spoils and `was_rise` stay on swallow).
The cut falls where the book throws, so the stretch reads 386 · board · 2,170 — still over the cap after the board.

### Before 入门: 忍字 · 认路 · 算账 back (10-20)

Hanli 10-20 「可以, 放宽, 把那三关加进去」 (taste note 1 above): the 10-16 five-board rule relaxed for the three
割绳子 levels built 10-16 — each at its book moment, played at the end of the passage that leads into it, every
way on waiting for it (the choice stays his), the grade (★3 · less) only a mark no line reads yet; nothing paid
before 入门 (lockedOf), no card moved. 忍字 · **00-masan**, on 马小宝's 「学声狗叫，给你舔一口」 (where he endures;
the 桂花糕 off the 弹竹 to the yard dog) · 认路 · **00-yinyue**, on 「先带本王出去」 (the fox in a 灵气泡 to the moss
at the valley mouth) · 算账 · **00-rent**, its passage split again after 马三's 「母鹿长角？……称肉！」 (the book's
words, as before 10-16: 「秤称完了…」 is `story_after`). Two `done_line`s fitted to the levels (忍字 「那声狗叫，你没学。」,
was the old board's 「…还在马小宝手里」, which the dog contradicted; 认路 「出谷的路，认出来了。」, was the grid's 「崖壁上的道道…」),
认路's refuse 「她还坐在草地上，等你带她出谷。」. The old boards stay cut: 吹鹅毛, 半年挑担, 洗髓忍疼 (and 烙饼).
Measured by rhythm.mjs (cap 1,500), origin/main `4104f3ba` → after; 卷一's stretches over the cap 20 → 19.

| stretch (before) | before | after | the level |
|---|---|---|---|
| 00-shiao → 00-heisong/carve | 4,767 | 1,081 · 3,686 | 忍字 at 00-masan; the rest (the taunt said back, the egg, the kitchen, 前山, 断碑, 黑松岭) still over |
| 00-yinyue{景=tengyun} → 00-deer | 1,721 | 264 · 1,457 | 认路 at 00-yinyue |
| 00-deer → j01-retest | 12,867 | 1,206 · 11,661 | 算账 at 00-rent; the rest (马三 takes the bow, 鼎湖, 洗髓, 半年 2,190, 舅舅, 开山门, 今一's track 2,127 and lab 2,622) is still the longest read before 入门 |

**The 割绳子 ladder in story order, re-laid 10-20 after the live hand.** The first pass put the 10-16 levels back as they
were, and play-human's casual hand at 390 found it upside down: 忍字 (now the first 割绳子 a player meets) lost 0/2 in 90 s,
because its 10-19 level fed only on a cut within 0.4 s of the puff, a reflex. 算账 (the last) was won 2/2 in 5–12 s.
`52e04c40` re-laid both. **忍字**: cut it, the 桂花糕 rests on a slab, puff it off, it bounces off the 弹竹 into the dog.
A plain cut still misses (Hanli 10-19: 「道具的风用不上」), and the puff works any time after it rests (★3, one arc); the
teach line names the puff. **算账**: the crow 4,388 → 2,400 ms. The safe way is the crow's vine first, the meat
rests on the slab, then the puff (★2); ★3 only by racing the crow, cutting the other vine first and the crow's vine
1.2–2.3 s later. Live, casual hand, 390, 3 seeds (the installed build, scratch saves):

| in story order | level | won | time | ★ |
|---|---|---|---|---|
| 1 · 00-masan | 忍字 (1 string, slab, puff, 弹竹) | 3/3 | 9 · 10 · 29 s | 3 · 3 · 3 |
| 2 · 00-fall | 拽 (timed last cut; 10-19 sims) | casual 20/20 | median 31 s | about half ★3 |
| 3 · 00-cave | 喂饼 (four levels) | — | — | — |
| 4 · 00-yinyue | 认路 (2 vines, 灵气泡, puff) | 3/3 | 25 · 36 · 44 s | 3 · 2 · 2 |
| 5 · 00-rent | 算账 (2 vines, crow 2.4 s, slab, puff) | 3/3 | 5 · 7 · 12 s | 2 · 2 · 2 |

忍字 → 认路 rises. **算账 does not, for the win:** one low swipe cuts both vines at once, the meat lands on the slab and
one puff finishes it, and no slab width tried stopped that. Its ★3, the race with the crow, is the hardest move before
入门, but the hand never earned it. Making the win itself harder needs a new layout (his call, taste note).

### Before 入门, round two (10-20): the 11,661 broken · 算账 re-laid · 忍字 to 马小宝

Under the standing rule (10-19) and Hanli's 「放宽」: after 算账 the longest read before 入门 was 00-rent → j01-retest,
**11,661 字** (马三 takes the bow, 鼎湖, 洗髓, 半年 2,190, 舅舅, 开山门, 今一's track 2,127 and lab 2,622). Two 气走经脉 levels,
each where the book breathes, neither across a key moment:

- **挑水上坡** (`halfyear-carry`, level `tiaoshui`, n 3), **00-halfyear**: the passage split after the winter's practice — the
  feather night, the belly breath, 「深」 circled, and the book's carrying, restored to the cut (「到了冬月，他挑水从四担挑到了六担，
  上坡不喘，只好装喘，「蓄」字外头又多了一个圈；…自己穿一件单褂」 — it also sets up the 单褂 the mirror scene reads). The game is that
  climb under the yoke. 冬月廿二's man in white and 正月初五's mirror read whole after it (`story_after`): the mirror is the
  emotional moment of 古二, and the board never touches it. On the cut 练功's task id (title 「练功 · 挑水上坡不喘」, marks even ·
  panting kept); a new level, not the old board (deleted 10-19). 吹鹅毛 stays cut.
- **边跑边念** (`jin-paobu`, level `paobu`, n 4), **j01-track**: the dawn run on the outside lane — 「边跑边能说整句话——这是规矩」,
  the channels recited, 雷老师's 「念得出整句，就是速度对了。接着念。」. The 金线 is the talking pace; the 穴 the three channels
  he can say, then 「足……足……」 a narrow stretch. Pays nothing (今). Chosen over the lab (j01-anatomy): the 膈肌 table sits
  inside 刘桂芝's moment (the card, the bow), and the dorm's book-on-belly lies right against 先吐's own lesson; the run is a
  breath act of its own and leaves the most even split.

The ladder: 挑水 is now the first 气走经脉 a player meets, so n 3 (after the two cut 古二 levels, both 游戏厅-only), 边跑边念
n 4, 先吐 on moved up two. Sims (bots/qimai.js HANDS.live, 24 runs): 洗髓 23/24, 1.7 岔气, 38 s · **挑水 24/24, 1.9, 39 s** ·
**边跑边念 24/24, 2.7, 40 s** · 先吐 21/24, 2.8, 44 s. Live: play-human casual at 390 on scratch saves (installed build, headed): 挑水 3/3 in 41 · 52 · 44 s (1–3 岔气), 边跑边念 3/3 in 53 · 57 · 47 s (4 岔气 each) — 先吐 on the 10-19 run 2/2 in 46–51 s, so the live hand finds 边跑边念 about as hard as 先吐; the sims keep it just under.

| stretch (before) | before | after | what went in |
|---|---|---|---|
| 00-rent → j01-retest | 11,661 | 3,385 · 5,255 · 3,106 | 挑水上坡 at 00-halfyear, 边跑边念 at j01-track |
| 00-halfyear → j01-track | 5,255 | 2,695 · 2,568 | 水桶落井 at 00-notice (Hanli 10-20: 「可以, 把水桶那关也加上」) |

Still over: 3,385 (马三's bow, 鼎湖, 银月 into the 木牌, 洗髓 — 洗髓 is the night she leaves, and its old board was cut as
a held button), 5,255 (the man in white, the mirror, 舅舅's 「沉鼎」, the notice, 今一's first day — the mirror and the 木牌
lighting at 「沉鼎」 are the two moments of 古二; the one kit action between, 00-notice's 「心口底下那只卡了一夏天的水桶，忽然
『咯噔』一声，自己往下走了」, became the third 气走经脉 level, 水桶落井 (`notice-shuitong`): the passage ends on the book's 「再往下，便没了。」, the rest of 00-notice is its `story_after`, and the 5,255 is 2,695 · 2,568) and 3,106
(马小宝's dunk, the scales, the 十投一 — and the lab).

**算账 re-laid** (the live hand won it in 5–12 s with one low swipe: play-human's cut hand swipes each vine's lowest
segment, where both vines meet, and both went at once). Now the slab is a chute off to the side and the meat must be
swung onto it: the other vine first, the meat swings out on the crow's vine, the crow's vine cut before the crow gets
down (2.8 s) — anywhere from 0.6 s on puts it on the chute and into the pan. Both at once: straight to the floor. The
crow's vine first: it hangs over the floor on the other. Waiting: the crow takes it. ★3: the cut as the swing reaches its
far end (1.05–1.5 s), through the 灵光 there. No puff any more. Its stolen line is 「乌鸦叼走了。再来——它那根藤，要赶在它前头断。」
and the teach line names the order. Found by a scratch search on rope.js; a node imitation of play-human's cut hand: the old
level 9 s median (30/30), the new **37 s** (53/60 within 90 s). Live: casual at 390, 3 seeds: won 3/3 in 39 · 21 · 55 s, ★2 each (was 5 · 7 · 12 s).

**忍字 agrees with the book.** Both of 00-masan's ways on end with 马小宝 「当着他的面，把那块桂花糕一口塞进嘴里，腮帮子鼓得像
两个包子」; the game fed it to a yard dog. The level, mechanic and grades are unchanged; the target is now 马小宝's open mouth
(a new local-FLUX sprite, art/games/xiaobao.webp, in the dog's ink-and-wash), title 「忍字 · 那块桂花糕」, how 「划断绳，让
桂花糕落回马小宝自己嘴里——不学狗叫，也不伸手」, eat 「他一口塞进嘴里，腮帮子鼓得像两个包子。」, done 「桂花糕进了马小宝自己的嘴。
那声狗叫，你没学。」. The dog's picture went (nothing else drew it). Live: casual at 390: 6/6 in 12 · 9 · 21 · 33 · 11 · 9 s, ★3 each (two runs of 3); the end frame shows him, cheeks full.

| in story order (割绳子) | level | live won | time | ★ |
|---|---|---|---|---|
| 1 · 00-masan | 忍字 → 马小宝 (unchanged level) | 6/6 | 9–33 s | 3 each |
| 4 · 00-yinyue | 认路 | 3/3 (10-20) | 25 · 36 · 44 s | 3 · 2 · 2 |
| 5 · 00-rent | 算账, re-laid (chute, crow 2.8 s) | 3/3 | 21 · 39 · 55 s | 2 · 2 · 2 |

**For the 砸寨 port agent (throws, not built here):** 今一 has two throws in j01-track — 阿禾's 「你投一个给我看看」 (the ball
over the rim and the board, into 马小宝's 摇杯: 「球飞得很高，很有信心…砸翻了马小宝的摇杯」) and the 罚球 at the end
(「他投了十个，只进了一个」). If 今线 takes 砸寨 levels at all (so far it plays only the breath kit), the first is the one —
but it lies only ~500 字 before 边跑边念, so it adds play more than it breaks a read. His call.

## 调息 cut (10-20)

Hanli 10-20: 「调息感觉太多了」, then 「可以」 to the audit's plan: of the 15 气走经脉 story boards, 8 stay (水桶落井 · 小周天 · 息壤 ·
藏息 · 先吐 · 罚球 · 黑地十一步 · 最后一罚), 3 become games in the same slot, 4 are told.

- **Told** (board, task row, qimai row, level and emblem gone; a split passage merged back word for word): 挑水上坡
  `halfyear-carry` (00-halfyear; a save holding it offered lets it go, done stays — look skips a task whose row is gone),
  后山 `baishi-houshan` (wm-baishi), 随叶 `jiuge-sui` (09-jiuge — 禹步 is now its one board, after the whole lesson),
  顺风溜 `xie-wind` (09-xie; the boots still come with the way on). 古七's board 修为 is +10, not +20.
- **砸寨 · 讲堂试法** (`qianye-qiajue`, `jiangtang`): after 「第二天他教咒。」 the spells thrown at straw dummies, four for his
  四层 — 「扔一回，丹田便空一截」. New throws: 火弹 (burst), 冰锥 (tap: three), 金刃 (tap: dash; 金克木), each painted.
- **守墙关 · 药园巡夜 · 开春** (`furnace-ding`, levels/shouqiang.json `yaoyuan-spring`, `story: "09-furnace"`): 野猪 and 狰
  only; 兽潮 (tideRows) and the 游戏厅 ladder skip a `story` row, and it names no 下一关. Sims: human 37/40, sharp 22/24.
- **砸寨 · 投一个给我看看** (`jin-toulan`, `toulan`): j01-track cut on 阿禾's 「你投一个给我看看。」 — the ball over the board,
  the 摇杯, the dawn run (边跑边念, told) after the game. A save holding `jin-paobu` offered is given the ball instead.
- The qimai ladder renumbered 1…13 (feather · xisui · 水桶 · 先吐 · 罚球 · 小周天 · 息壤 · 藏息 · 黑地 · 最后一罚 · 试作 ×3).

| stretch | before | after |
|---|---|---|
| 00-rent → 00-notice (第二回) | 3,385 · 2,695 | **6,080** (the accepted cost) |
| 00-notice → j01-retest (今一) | 2,568 · 3,106 | 1,980 · 3,694 |
| wm-jiaxin → end (古六) | 486 · 1,149 | 1,635 |
| 09-snow → 09-furnace (古七) | 605 · 331 · 1,343 | 936 · 1,343 |
| 09-yishui → 09-futian (古七) | 1,122 · 497 | 1,619 |
| wm-luobo → wm-zhaojing, 09-furnace → 09-lingcao | — | unchanged (the game in the same slot) |

## The weak-board sweep (10-19, the standing rule)

Hanli 10-19 approved a standing rule (「我和 agent 照规矩直接处理, 可以, 按你说的做」): each remaining weak board (the 判断
and 剧情 types, and anything button-only like them) becomes (a) a level of a proven kit where one fits the book's action —
割绳子 · 气走经脉 · 射鹿 throw/smash · 打地鼠 (接雨) · 五子棋 · 你画我猜 —, else (b) the book's told passage (merged whole,
the board cut the 10-16 way), or (c) a short 大场面 where the moment is strongly visual (FLUX art, its own pace, forced
自动, never skipped by 跳过). No new homemade mechanics, no quizzes, no big-button taps. Every old row is marked
`replaced` (the new game's id, `setpiece` or `cut`) and folds into the 游戏厅's 旧版; every dropped task is `cut` (a save
holding it offered lets it go on load); ids, grants and the marks later lines read are kept.

| board | where | decision | why |
|---|---|---|---|
| 讲堂三日 `qiajue` | wm-qianye `qianye-qiajue` | **(a) 气走经脉 · 掐诀** (level `qiajue`, n 6) | 「一句话走一截路，八句话，正好从肩膀走到指头尖…落一个字，气就停在半道上」 is the kit's own model: the chant's eight lines are the arm's eight 穴 (checkpoints), the elbow 窄 with the spark's push, 午文 the last 关. The passage now tells day one (the hand, 「火弹，掐午文」) before it and day three (the 扣) after it |
| 相克 `xiangke` | wm-qianye `qianye-xiangke` | **(b) cut** | a quiz. The 五句 are the passage's (story_after); the way on (`eve`) writes the mark `xiangke` the 大比's three bouts read for their hint |
| 底册 `diche` | wm-laba `laba-diche` | **(c) 大场面 `diche`** | 「看完烧了」 — the page under the lamp, its three lines lit (卢方 · 秦雁 · 祁长松's four words), carried to the 灶口, curling black (setpieces/diche.js, ~4 s, `{景=diche}` on the book's own sentence, now in the passage). The way on (`go`) writes `diche` (望气 and the hints at the 卢方 and 秦雁 bouts) |
| 顺风溜 `wind` | 09-xie `xie-wind` | **(a) 气走经脉 · 顺风溜** (level `wind`, n 10) | the boots' 「鳃」 open and close on a thread of qi; the glide low (「脚离地不过一尺」), the north wind turning (`flip`): 迎着风 it slides, against it 「噗」; 墙根 the last 关. The 几何冲刺 runner it was earmarked for is not built; this is today's kit |
| 晨脉 `pulse` | j07-guan `jin-pulse` | **(b) cut** | counting a pulse lying still fits no kit; the way on (`out`) already tells the 六十九 |
| 认方 `recipe` | 09-furnace `furnace-recipe` | **(b) cut** | a memory puzzle; story_after merged back (word for word), 定风 the scene's one board; its 聚气丹 comes with the way on (`fire`) |
| 念开篇 `kaipian` | wm-heluo `heluo-kaipian` | **(b) cut** | a recall drill (was 「Hanli's call」 below; the rule now covers it); the rhyme is the way on's own passage, the scroll still granted |
| 下崖 `descend` | 秘境 凶崖 `mijing-descend` | **(b) cut** | two holds to pick; the climb is told as the 断崖下 room's line (05-第五回.md's paragraph whole); the 犰狳 on the stair still holds the way down |
| 拾遗 `gather` | 秘境 暗河 `mijing-gather`, rerun `mijing-rerun-gather` | **(a) 割藤** (`fantongcut`, as 奇遇 · 割藤) | four of nine glowing cracks, button-only → the 秘境's own 割绳子: the 灵芝 (story) or the room's find (rerun, rules/rerun.mjs runRow) hung on the vines; the rerun's cache on three 灵光 (was the `rich` grade); ids and pay kept |
| 守夜 `shouye` | 药园 (the 狰's catch) | **(b) cut** | a guess among four spots; wm-yaoyuan already catches the 狰 with its radish (`tame`); the 狰 still runs from a raised hand; a cut catch board is never offered (rules/tasks.mjs) |
| 喂饭桶 `fantongqianye` · `fantonghuochai` | wm-zhaojing · 09-snow | **left** | another agent's (扔了干净 → a 大场面, `huochai`) |
| 写信 `letter` | wm-jiaxin | — | replaced by 家信 · 画给娘看 (drawguess) 10-19 |

**Deleted 10-19** (Hanli: 「射鹿 · 等风 没用在游戏中的, 都删了吧」 — delete, not fold into 旧版): every board nothing in play
uses — row, module, bot, tests, its CSS and dead art: 射鹿 · 等风 `deerhunt`; the old boards the story replaced — 拽 `storm`,
射鹿 `deer` (row only), 烙饼 `griddle`, 练功 `carry`, 吹鹅毛 `feather`, 忍 `xisui`, 小周天 `zhoutian`, 藏息 `mirrortongpu`,
随叶 `leafsui`, 定风 `leafding`, 闻焦 `huohousmell`, 猪蜻蜓 `zhuqingting`, 写信 `letter`, 芦苇 `reed`, 一千米 `qianmi`, 罚球 `faqiu`,
黑地 `dark`, 最后一罚 `lastshot` (with their shared breath.js · leaf.js · huohou.js · mirror.js), 扔石听声 `caveecho` (and
art/games/stone/); this sweep's 讲堂三日 `qiajue`, 相克 `xiangke`, 底册 `diche`, 晨脉 `pulse`, 认方 `recipe`, 念开篇 `kaipian`,
顺风溜 `wind`, 下崖 `descend`, 拾遗 `gather`, 守夜 `shouye`; and the orphan modules 算账 `scale`, 忍字 `taunt`, 认路 `way`.
Every task id stays (`cut`), so an old save holding one offered lets it go. **Kept:** `deer.js` (deerarc.js imports it),
the 文 as `games/wen.js` (the 密室's 铜掌; qiajue.js deleted), `yubu.js` (禹步), `throwkit` (the throw kit's own 游戏厅
sandbox), the 气走经脉 试作 levels (the kit's climb), art/games/feather/ (rope-art.js draws with it). **Left for their
agents:** the 割绳子 trio `rentrope` · `tauntrope` · `wayrope` (their scenes lost the boards 10-16; the code is in
ropebeats.js, off limits to this sweep) and the two 喂饭桶 boards. The arcade's 旧版 fold is empty now; its code stays for a
row replaced later.

**Rhythm** (rhythm.mjs, cap 1,500 字): wm-xirang → 讲堂三日 6,187 → 6,414 (+227, day one told; over before);
讲堂三日 → 藏息 789; 开炉夜 → 喷嚏符 848 (the 底册 piece between); 黑地十一步 → 喂饭桶 (09-snow) 2,444 → 2,773 (晨脉 cut;
over before); 禹步 → 定风 1,343; **家信 → the end of 古六 1,635 — a new stretch over the cap** (念开篇 cut).

## 古四 → 古七

**Cut 10-19** (Hanli: 「时机, 调息不好玩的可以删掉或者改进」): 猪蜻蜓 (wm-laoyin) and 闻焦 (09-year), the 10-16 way —
the passage whole, the task marked `cut` (a save holding it offered lets it go), the row and module kept in the
游戏厅. 喷嚏符 stays. Their pay goes with them (猪蜻蜓 修为 +5, 闻焦 灵石 +3), so `balance.mjs --fit` raised 练气
五–九层 by 50 each to hold 古六/古七's days. Rhythm: 大比 决赛 → 家信 now reads 3,414 字 without play (was 1,571 +
1,843), and 定风 → 灵草谷 2,175 — over the 1,500 cap, as the story's point here.

| 回 · scene | game | the book | how it plays now | what's wrong | proposal | skip | 得牌? | cut 10-16 |
|---|---|---|---|---|---|---|---|---|
| 四 · wm-zhoutian | 小周天 `zhoutian` | 冲三关 | in · out · still; push only in the stillness; 玉枕 wants three | a real timing read | second tier | 75 s | yes — 小周天 | **→ 气走经脉 · 小周天 (10-19)** — module in the 游戏厅 |
| 五 · wm-kunzhen | 困阵 `wuziqi` (was `luoshu`) | 「正中那个是空的」 | **五子棋 since 10-19**: the eye's stone has fifteen lines under its face, the binding plays white (公道, ai 2); five in a row holds the eye down | — | done 10-19 (§ 五子棋 below) | 75 s | no | — |
| 六 · wm-qianye | 讲堂三日 `qiajue` | 掐、咒、扣 | tap the 文, the eight lines in order, hold the 扣 | three drills | **cut** | 6 wrong | yes — 掐诀 (褚先生 teaches him) | **→ 气走经脉 · 掐诀 (10-19, the sweep)** — module in the 游戏厅 |
| 六 · wm-qianye | 相克 `xiangke` | 五句 | answer an element with what overcomes it | a quiz | **cut** | 5 misses | ? | **cut 10-19 (the sweep)** — the 五句 told, the mark from the way on |
| 六 · wm-zhaojing | 藏息 `mirrortongpu` | 镜光扫过来 | hold 「吐」 long and slow as the light passes | a timing hold | **cut** | 3 flares | ? (藏息 his?) | **→ 气走经脉 · 藏息 (10-19)** — module in the 游戏厅 |
| 六 · wm-zhaojing | 喂饭桶 `fantongqianye` | 开炉夜 | press the lid open, feed things | a sequence | **cut** (the free 饭桶 feed stays) | 75 s | ? (饭桶 is a thing he uses) | kept until replaced |
| 六 · wm-laba | 底册 `diche` | 看完烧了 | read each line twice, burn it | reading | **cut** | 4 | no | **→ 大场面 `diche` (10-19, the sweep)** — the mark from the way on |
| 六 · wm-dabi | 喷嚏符 `sneeze` | 让一拳 | watch the shoulder, 让; a touch of 送气; 推 mid-sneeze | a read with three verbs — the most fight-like | **keep** | 5 | yes — 喷嚏符, a 符 | kept (the six) |
| 六 · wm-laoyin | 猪蜻蜓 `zhuqingting` | 等风掉头 | wait; 拍 as he steps behind | one timing tap | **cut** | 4 misses | ? | **cut 10-19** (Hanli: 「时机, 调息不好玩的可以删掉或者改进」) — no board before 摸出那个油纸包; task `cut`, row and module in the 游戏厅 |
| 六 · wm-jiaxin | 写信 `letter` | 擦了又写 | write line by line, erase what must not be said | a choice | **cut** | 75 s | no | kept until replaced |
| 六 · wm-heluo | 念开篇 `kaipian` | 戴九履一 | each line of the verse into the nine squares | a recall drill | **cut** | 6 wrong | no | **cut 10-19 (the sweep)** — the rhyme is the way on's passage |
| 七 · 09-snow | 喂饭桶 `fantonghuochai` | 扔了干净 | drop two scraps in | two taps | **cut** | 75 s | no | **→ 大场面 扔了干净 (10-19)** (Hanli: 「「扔了干净」这一幕改成大场面」) — `{景=huochai}` on the way on's chewing paragraph (setpieces/huochai.js); task `cut`, row `replaced: "setpiece"`, module in the 游戏厅 |
| 七 · 09-jiuge | 随叶 `leafsui` | 跟着它走 | hold 随左 / 随右 with the leaf | a tracking hold | **cut** | 75 s | ? | **→ 气走经脉 · 随叶 (10-19)** — module in the 游戏厅 |
| 七 · 09-jiuge | 禹步 `yubujiuge` | 九格 | left, right behind, step in — one to nine | a rhythm | second tier | 5 trips | yes — 禹步 | kept (second tier) — replace with 割绳子 or another proven mechanic if it isn't fun (his play) |
| 七 · 09-furnace | 认方 `recipe` | 三张方子 | match heaps, leads, pills | a memory puzzle | **cut** | 5 ash | no | **cut 10-19 (the sweep)** — passage whole, the 聚气丹 on the way on |
| 七 · 09-furnace | 定风 `leafding` | 看见它起来 | wait for the rising leaf; 挪半步 | one timing tap | **cut** | 75 s | ? | **→ 气走经脉 · 定风 (10-19)** — module in the 游戏厅 |
| 七 · 09-year | 闻焦 `huohousmell` | 半口气 | say it when the scent turns scorched | one timing tap | **cut** | 3 lost | ? (火候) | **cut 10-19** — 09-year's passage whole again (story_after merged), 伏天 needs 清明 only; task `cut`, row and module in the 游戏厅 |
| 七 · 09-yishui | 芦苇里那一等 `reed` | 「放剑」 | loose when the wing-root shows | one timing tap | **cut** | 4 wasted | no | kept until replaced |
| 七 · 09-xie | 顺风溜 `wind` | 背后有风 | read the wind, turn, 退一步 | a read and a tap | **keep** → 几何冲刺 one-tap runner, after launch | 3 puffs | yes — 顺风溜 | **→ 气走经脉 · 顺风溜 (10-19, the sweep)** — module in the 游戏厅 |

## 古八 (10-21)

The per-回 pass (design.md § Per-回 › 古八; tasks/h09.json): fewer, better — one board, one fight, both in 09-dabi.

| 回 · scene | game | the book | how it plays | 得牌? |
|---|---|---|---|---|
| 八 · 09-dabi | 守炉 · 丹房看炉 `danfang-kanlu` (level `danfang-kanlu`) | 一开炉十天半月，丹师一步离不得 — the 看炉 is his | 守炉's 古八 story level on the 后山 · 丹房 map: 野猪 up the road, the 后山's 鬿雀 diving at the furnace (game-only, like 兽潮); 剑阵 · 火符 · 雷符 (雷 from wave 3); five waves, hpMul 1.4 — a first-timer's plain hand wins losing a little fire, all fire loses to the birds; gives the 十年黄精 (the 九节聚气方's 君) on a win or a skip | no |
| 八 · 09-dabi/dabi | 腊八 决赛 (card fight `dabi-final`, `foe-jiuceng`) | 金刃一口气一口气发的，发一道，喘一口……等到第十一道 | the 内门 九层圆满, alone on the stage, a 金 burst deck; 火柴 dealt into his hand (「小满的火柴进去了」, so no curve-dealt ten is a wall); ~49% bare over ten save seeds (15–67%), more with pills (fight-band) | — |

Told, not played: 《金丹》 (a recitation — a quiz), the 挑料 (a pick), 定风's candle and 进退's pine bough (no kit's verb),
the 回家 night (09-qulao, the 回's heart) and the 筑基 (09-cliff: its 突破 card and 大场面). The 九节聚气 night is
the player's own 饭桶 feed (fantong.json recipes `jiujie`: the 十年黄精 alone → three 三转聚气丹), never a board.
Rhythm: 09-futian/spar → 09-cliff/take 4,676 → 1,625 · 3,051 (the second is the 大比's telling, 入秋, 瞿老 and the night home
— left: the 回's heart).

## 五子棋 in the 九宫格's place (10-19)

Hanli 10-19: 「五子棋是好游戏, 可以放进去. 可以替代9宫格游戏」, then 「9宫格出现一次就可以了」. The 洛书 square is
played **once**, at 洛书门 (`gate-luoshu`, 00-luoshu, 第四回 — the first 九宫格 in story order, the book's own
二试); every other 九宫格 slot deals 五子棋 (games/wuziqi.js, mechanic 棋牌):

| where | task (id kept) | the frame (the board's line; the book's passage untouched) | rival |
|---|---|---|---|
| 困阵 · wm-kunzhen (第五回) | `mijing-zhenyan` | 石面底下刻着纵横十五道——前人布这困阵，布的是一盘棋，阵自己执白。银月：「连成五颗，阵眼才压得死。」 | 公道 (ai 2), named 「阵」 on a loss |
| 执事堂 · 周衡's 差事 | `guan-zhishi-ledger` → board `wuziqi` | 「对了一上午的账，眼都花了。」…「陪我下一盘，换换眼睛。五个连成一线就算——让你执黑。」 (was 对账 · 九格) | by the realm |
| the place game (8 hosts: 执事堂 · 云龙山 · 碣石 · 濮水 · 崂山 · 陇山 · 巫峡 · 震泽) | `wuziqi` (daily) | — (the notice's) | by the realm |
| 秘境 奇遇 | `qiyu-wuziqi` (weight 1, 洛书's) | 岔口: two stone pots, 「与石对弈，胜者自取。」 · 凶崖: a board cut in a ledge, the bones of one before with a white stone in hand · 暗河: a pebble board, 「赢一局，取一物。」 | by the realm |
| 今日传闻 | tale.json `wuziqi` (its three frames) | the example's 云龙山 step: the old Taoist opens only after a game | by the realm (+1 the last step) |

**The rival rises** (games/wuziqi.js `ai`; a story task names it in `deal.ai`, else Look's realm level 1–3 + 1):
1 新手 (blocks only fives — the 游戏厅's easy, no story slot) · **2 公道** (the 困阵, and every place game at
realm level 1 — the first two realms: plays its own lines at 0.4 of their worth, makes a four only 30% of the times it could, misses
your open three 70% of the time, a second thought on 40% of its quiet moves; never blind to a five, nor to your four) ·
**3 稳当** (reads every pattern both ways, no slips: realm level 2) · **4 老辣** (3 plus one reply looked ahead over its
eight best: realm level 3, and a tale's last step from level 2). Node sims, 100 games each, a greedy hand (bots/wuziqi.js; no
lookahead, no 跳三 — a person's 跳三 the AI does not read, so a real hand does better):

| rival | newbie hand | casual hand | careful hand |
|---|---|---|---|
| 1 新手 | 91/100 (6 moves) | 97 | 98 |
| 2 公道 | 22 | 33 (+23 drawn) | 45 (+43 drawn) |
| 3 稳当 | 8 | 18 | 35 |
| 4 老辣 | 8 | 16 | 30 |

(A "draw" is the greedy sim filling the board; a person ends a game long before.) A loss is never a dead end:
「再来一局」 deals a fresh board against the same rival at once; the stuck skip (75 s unwon) as every board.

**Grade:** stars by his own stones on the win — ≤ 12 ★★★, ≤ 20 ★★, more ★ (`starsFor`); the 困阵 task has
`stars: 3`, so the small-game 灵石 ranks best · good · plain by them (it was always plain as 洛书). No marks
(洛书 had none; no later line reads one). **The board:** every point is a button — a stone, or the board after the
end, is refused and rings the seal-red refusal (no dead tap); the last stone wears a seal-red dot; his stone drops
in, the rival's answers 0.26 s later; the five that ended it ring in 灵 light (seal red on a loss); a faint black
stone under the mouse (hover only); no undo; the move count in the foot. Animations play only for a move just made
(the stage repaints by replacing its nodes). **Old saves:** a save holding 困阵 offered deals the 五子棋 on load
(boards are the page's, never the save's); a 秘境 run that already rolled 奇遇 · 洛书 still deals it (qiyu.json
`retired`: never drawn again); a 传闻 already made with a 洛书 step still deals it (tale.json `retired`: not in
the seed, refused by the lint). **Kept in the 游戏厅:** the 洛书 module, its bot, and its two rows (二试 · 洛书九宫,
the daily 洛书 · 破一道鼎封) — the daily task stays, now hosted nowhere. **Left as they are (not the 洛书 game):**
念开篇 · 洛书 (`heluo-kaipian`, wm-heluo — the rhyme 戴九履一 into nine squares is the book's own moment, 瞿老
hearing his mother's rhyme; a 五子棋 has no ground there), the 密室's 洛书 lid (one mechanism of a room), 禹步's 九格
(footwork). Hanli's call if any of these should go too. — 10-19, the sweep: 念开篇 cut under the standing rule (a recall drill).

## 今线 — the breath games (games/breath.js)

No cards — 今线 is not 小满's world. They already have a stake (the heart rate) and a read (the breath).

| 回 · scene | game | the book | how it plays | proposal | skip | cut 10-16 |
|---|---|---|---|---|---|---|
| 今一 · j01-retest | 一千米补测 `qianmi` | 先吐 | out clean, then in; run | cut | 2 tries | **→ 气走经脉 · 先吐 (10-19)** — module in the 游戏厅 |
| 今二 · j04-line | 罚球 `faqiu` | 吸四吐六 | in four, out six, shoot on the out | cut (最后一罚 is the same, better) | 75 s | **→ 气走经脉 · 罚球 (10-19)** — module in the 游戏厅 |
| 今三 · j07-dark | 黑地十一步 `dark` | 领着喘 | step when the ankle is centred; lead his breath | cut | 2 falls | **→ 气走经脉 · 黑地十一步 (10-19)** — module in the 游戏厅 |
| 今三 · j07-guan | 晨脉 `pulse` | 坑填平了才许摸球 | count the morning pulse | cut | 75 s | **cut 10-19 (the sweep)** — the way on tells it |
| 今四 · j09-final | 最后一罚 `lastshot` | 带着怕投 | two long outs, shoot at the end of one | **keep** | 3 misses | **→ 气走经脉 · 最后一罚 (10-19)** — module in the 游戏厅 |

Since 10-19 the 今线's four boards are played as 气走经脉 levels (below); the modules above stay in the 游戏厅.

## 气走经脉 — the breath kit (built 10-19; in the story 10-19)

Hanli 10-19 approved: the seven 调息 games (吹鹅毛 · 洗髓 · 藏息 · 一千米补测 · 黑地十一步 · 罚球 · 最后一罚) all make one
move — watch a ring or bar, hold and let go to keep it centred; no route, no obstacle, no climb. 「割绳子 works,
homemade mechanics don't」, so the breath gets a proven genre: **hold-to-rise** (the helicopter game, Jetpack
Joyride). `games/qimai.js` (+ qimai.css, bots/qimai.js, tests/qimai.test.mjs); one games.json row a level
(`id: qimai`, `mechanic: 调息`, `data.level`, the level in `levels`), each beside the old game it replaced.
Hanli 10-19 after playing: 「气走经脉 可以, 游戏类型不错, 提高一点难度?」 and 「洗髓和吹鹅毛都是一样的…可以用类型, 但不同关卡, 越往后面越难」 —
so the second pass made it one clear notch harder and gave every level its own layout, signature, look and title card.

- **Play:** a 气 bead travels left → right along a meridian drawn in ink. Hold (mouse, touch, or Space) = 吸, it
  rises with momentum; let go = 吐, it sinks. A soft ring on each breath, an ink trail, the 成 seal on the win.
- **Fail:** a wall costs one 气 (of three); the third is 岔气 — at once back to the last 关 or 穴 passed, 气 full.
- **Stars:** through · no wall touched · the 金线 kept (within `goldTol` of it for `goldNeed` of its length; 10/70% by default).
- **Elements** (data per level, each taught the first time it comes into view with a ring and a line): 窄脉 · 关窍 ·
  乱流 (and a **turning** 乱流, `flip`: the wind changes way every so often, its arrows turn) · 金线 · 浪头 · 心跳乱流
  (with `jitter`: the beat comes early or late, seeded) · 暗.
- **Its own look:** `look` {tint, ink, trail, glyph} — the paper's tint, the channel's ink, the trail's colour and a big
  faint character behind the channel; a title card (`title` + the book's line) stands over the board until the first breath.
- **In the story (10-19):** the ten boards below (掐诀 and 顺风溜 joined in the weak-board sweep) play their level through the module's own mount (`meta.beat: 'mount'`,
  beat-host.js), the task ids, marks and pay unchanged; the row that names the task (`task`) is the one dealt (look.mjs
  dealOf). A level's `grades` turn its stars into the task's grades (★2–3 = the clean one: no wall touched). Old saves
  holding a board offered load as ever (only the module behind the task changed). **Left cut:** 吹鹅毛 (00-halfyear) and
  洗髓 (00-sleep) — their scenes lost their boards 10-16 (before 入门: five boards); their levels stay in the 游戏厅. **10-20 (the reading cap before 入门):** two more story levels, n 3 and 4 (the rest moved up two) — 挑水上坡 in 00-halfyear
  on the cut 练功's task id `halfyear-carry` (a new level, beside the still-cut 吹鹅毛), and 今一's 边跑边念 `jin-paobu` in j01-track.

| n | level · in the story | what makes it its own | elements | sim, the live-fitted hand (24 runs, ≤ 90 s) | live casual, 1440 + 390 |
|---|---|---|---|---|---|
| 1 | 吹鹅毛 (古二 · cut) | a gentle long wave, the 金线 nearly all the way; warm paper, 羽 | 宽脉 → 40 · 金线 | 24/24, ★1 mostly, 0 岔气, 25 s | 4/4, ★1, 0–2 岔气, 23–34 s |
| 2 | 洗髓 (古二 · cut) | four 浪头 surges, each heavier — a long hold or the floor; 墨绿 water, 髓 | 浪头 ×4 · 金线 | 24/24, 1 岔气, 37 s | 4/4, ★1, 1–8 岔气, 29–85 s |
| 3 | 挑水上坡 · `halfyear-carry` (古二, the reading cap 10-20; the first in the story) | the book's carrying under the yoke, 「从四担挑到了六担，上坡不喘」: a channel climbing in three slopes, the buckets' swing three 浪头, 缸口 a 34 关, the 金线 the even breath at the top; yoke-wood paper, 担 | 浪头 ×3 · 关 · 金线 | 24/24, 1.9 岔气, 39 s (the live-fitted hand) | 390 story 3/3, 1–3 岔气, 41–52 s, ★1 (10-20) |
| 4 | 边跑边念 · `jin-paobu` (今一, the reading cap 10-20) | the dawn run, 「边跑边能说整句话」: the 金线 the talking pace most of the lap (tol 9, 65%), the 穴 the channels he can say (手太阴 · 手阳明 · 足阳明), then 「足……足……」 a narrow 32 with a surge; plum, 念 | 金线 · 窄 · 浪头 | 24/24, 2.7 岔气, 40 s | 390 story 3/3, 4 岔气 each, 47–57 s, ★1 (10-20) |
| 5 | 先吐 · `jin-qianmi` (今一) | the airway: three 窄脉 runs (33) with the panting push up between open stretches; track brick, 吐 | 窄脉 · 乱流 | 22/24, 2 岔气, 46 s | 游戏厅 3/4 (4–9 岔气); story 2/2 at 390, won 46–51 s |
| 6 | 罚球 · `jin-faqiu` (今二) | 吸四吐六 front and centre: one 金线 the whole court (tol 8, 72%) through a heart out of time; amber, 罚 | 心跳 (jitter) · 金线 | 20/24, 3 岔气, 49 s | 游戏厅 3/4 (4–7 岔气); story 2/3 |
| 7 | 小周天 · `zhoutian-sanguan` (古四) | up the spine from the floor to the roof through 尾闾 32 · 夹脊 27 · 玉枕 22, then down the front: one circuit; dusk blue, 周 | 三关 · 乱流 · 金线 | 24/24, 2 岔气, 44 s | 游戏厅 4/4 (1–4 岔气, 36–52 s); story 390 2/2 |
| 8 | 息壤 · `xirang-wumen` (古五, the reading cap 10-20) | 「你推着它们走一圈」: five 关 named for the five doors in the 相生 order — 木 a push up, 火 a heart out of time, 土 the heaviest 浪头, 金 the narrowest (24), 水 a turning current — then the 金线 as his hands stop shaking; earth paper, 壤 | 关 ×5 · 乱流 + 转向 · 心跳 · 浪头 · 金线 | 23/24, 7 岔气, 62 s (the sim's hand finds it easier than 罚球; the live hand does not) | 390 story 3/3, 4–9 岔气 |
| 9 | 掐诀 · `qianye-qiajue` (古六, the sweep) | the arm, shoulder to fingertip: the chant's eight lines its eight 穴, the elbow 窄 (30) with the spark's push, 午文 a 28 关 at the end; cinnabar, 午 | 窄 · 乱流 + 转向 · 关 · 金线 | 24/24, 3 岔气, 38 s | — |
| 10 | 藏息 · `zhaojing-mirror` (古六) | the thinnest breath: 窄脉 the whole way (34), the mirror's light as pushes that start to turn, the thread tight (tol 6, 75%); firelight, 藏 | 窄脉 · 乱流 + 转向 · 金线 | 15/24, 5 岔气, 45 s | 游戏厅 2/4 (2–8 岔气) |
| 11 | 后山 · `baishi-houshan` (古六, the reading cap 10-20) | up the back of the mountain behind 瞿老: switchbacks, the channel narrowing 50 → 34, the 金线 the even breath the whole climb, a cliff wind that turns past 半山; mountain green, 径 | 窄 · 转向乱流 · 金线 | 24/24, 2 岔气, 56 s | 390 story 3/3, 1–5 岔气 |
| 12 | 随叶 · `jiuge-sui` (古七) | the 金线 is the leaf's way down, one long swing the whole level, and the wind turns under it; snow grey, 巽 | 转向乱流 · 金线 | 15/24, 6 岔气, 68 s | 游戏厅 1/4 (5–12 岔气) |
| 13 | 定风 · `furnace-ding` (古七) | leaves spinning: the wind turns fast, a 浪头 gust, then the half step aside — a 26 关 at the end; dawn, 风 | 转向乱流 · 浪头 · 关 | 12/24, 6 岔气, 71 s | 游戏厅 1/4 (6–13 岔气) |
| 14 | 顺风溜 · `xie-wind` (古七, the sweep; Hanli on the old board: 「这个也不好玩」) | the glide a foot off the floor (a low channel, 窄 34), the north wind turning three times, faster each; the three 「噗」 (逆风, the gills only puff) are 关 to thread with the wind at his back, 墙根 the last; slate green, 溜 | 转向乱流 · 关 ×4 · 金线 | 19/24, 11 岔气, 72 s | — |
| 15 | 黑地十一步 · `jin-dark` (今三) | dark switchbacks — sharp bends seen only in a small round, his panic beating in the second dark; slate, 黑 | 暗 · 窄 · 心跳 | 5/24, 7 岔气, 55 s | 0/4 (7–11 岔气) |
| 16 | 最后一罚 · `jin-lastshot` (今四) | all 今线 taught, faster (104): two hearts out of time, a 浪头, a turning push, the thread to shoot on (tol 6, 75%); red, 惧 | 心跳 · 浪头 · 转向 · 金线 | 4/24, 8 岔气, 56 s | 0/4 (9–15 岔气) |
| 17 | 冲脉 (试作) | straight up and down the body: steep zigzags, two 浪头, turning currents, two 关 | everything but 暗 | 2/24 | — |
| 18 | 带脉 (试作) | round the waist: narrow, heart, dark, turning wind, one late 关 | 窄 · 心跳 · 暗 · 转向 · 关 | 2/24 | — |
| 19 | 大周天 (试作) | the whole body at 110: three 关 (玉枕 22), every element, the longest run | everything | 3/24 | — |

Live (play-human on 9527, 10-19, casual 2 seeds × 1440 mouse + 390 touch; the story rows on `ph-*` saves at 390 — the
first 1440 story runs met the old modules still cached and are left out): the arcade 试作 casual 0/4 each (8–16 岔气);
sloppy won only 吹鹅毛 1/2 and 小周天 2/2; idle 0/all. The live hand is harsher than the sim's past 藏息.
A story beat played live to the win on `cc-*` saves by a steady hand: 小周天 at 1440 and 390 (→ wm-qingshi), 先吐 at
1440 and 390 (→ 00-gate), 藏息 at 1440 (grade still, mark mirror-still; the 饭桶 board next).
A practised hand (sims) clears every level, ★3 rare past 先吐; the sloppy hand wins 1–2 and 5 most times and little
after; idle never wins. `n` is story order (古七 before 今三), and the climb follows it. Tune with
`HANDS.live` (bots/qimai.js, fitted 10-19 to play-human's casual hand on 9527).
**His call:** whether the late story levels (藏息 on) are too much for a first play — a casual hand sees the
75 s 「算了，往下走」 there about half the time; the feel (fall/rise 260, damping 3); paintings (the looks are ink in code).

## Daily boards, 秘境, 密室 (not story beats; no card)

**喂饭桶 · 开炉** (`kailu`, 10-20; Hanli: 「现在可以, 但东西太少, 以后在扩吧. 装备武器饰品都可以出」): the 饭桶's lottery, in
the 物品 panel once he holds it (古四) and in the 游戏厅 (`daily`, a sample pot, no save; `?force=best`). Up to three things
and 0–3 灵石 into the mouth (the steam takes the pot's lean colour), 压盖 on a gold puff lifts the grade a notch, 「咔哒」 and
out it spins: 凡 grey ~70 · 有用 blue ~25 · 珍品 purple ~4 · 逆天 gold ~1 for a plain pot. No cap (Hanli 10-20: 「饭桶就是
什么都出的」): the odds of high things rise smoothly with the pot's 品阶 (its best input) and his realm, 灵石 add to it.
Pity: five 凡 in a row, the next is 有用 or better. Quirks: 3% it spits the pot back, 4% two things. The first of each
thing lands in the 饭桶图鉴 (录). 古七's 方子, three 方子残页 → 回气丹; the book's 火柴 / 顺风溜 are guards, never drops;
饱嗝令 waives the next hosted game's 灵气. All data: fantong.json (rows, tiers, odds); rules/fantong.mjs (on a save) and
rules/fantong-roll.mjs (pure); the Phaser play tools/kailu/ → games/kailu/; the pane fantong-kailu.js.

炼丹 (pair herbs) · 押宝 (four doors, three bets) · 华容道 (秘境) · 七巧 · 五子 ·
残局 · 密室 (he sees the mechanisms, 银月 reads the pages). 守夜 (药园) and 下崖 (秘境) cut 10-19 (the sweep); 拾遗 (秘境,
and the rerun's) was a 割藤 10-19 → 10-20; now 撒豆成兵 (the story's) and a short 守炉 (the rerun's), § Pruned 10-20.
洛书 was the same square three times (二试, 困阵, daily); since 10-19 it is played once, at 洛书门 —
the daily's eight hosts, 困阵, the 奇遇 and the 传闻 deal 五子棋 (§ below).

## AI games (the model talks; the rules hold the secret and the score; no card)

- **二十问** — 银月 thinks of an ordinary animal; yes/no in the chat; guess within twenty.
- **讨价还价** — haggle with a keeper in the chat; the rules hold the floor and the mood.
- **断案** — ask the people, find the proof, name who did it.
- **对对子** — being built 10-16 by another agent.
- **画猜 · 你画我猜** — prototype 10-16 (`drawguess`, group AI · 试作; Hanli: 「玩家画AI猜, 试一下吧」); in the story 10-19 (below).
  A word from 卷一 (弓 鹿 狐狸 饼 盆 白菜 鸡 葫芦 剑 山 月亮 灯), 60 s, an ink brush on rice paper; 笔 / 擦 (an eraser, its ring
  the size it rubs; Hanli: 「给个橡皮擦工具吧, 撤一笔没啥用」) · 清空. A rub is a paper change: the next look sends it.
  When the hand rests 2.5 s, or on 画好了, the paper (448 px PNG) goes to Ling through the engine's chat
  `images`; she answers a line zh + en and a 猜 line; the page checks the 猜 word against the word's
  spellings (games.json `data.words`) — never the model's say. One look out at a time, four a round.
  A blind model: the engine's vision gate refuses the first look (a blank sheet, her opening line), and
  the game says so and doesn't start (live: deepseek-flash, refused in 0.4 s, no tokens). Live 10-16 on
  gpt-6-luna, scripted strokes, 17 rounds at 1440 (mouse, zh and en) and 390 (touch): 11 won (弓 · 灯 ×3 ·
  鹿 · 月亮 ×2 · 山 · 盆 · 鸡 · 剑; 5 at the first look), lost 饼 ×2 (a circle with dots read as a smiling
  face), 白菜 ×2 (a leaf), 葫芦 (a snowman), 狐狸 (a table); 29 looks, 2.0–8.6 s, median 3.5 s.
  **Cost:** ~8.7k prompt tokens a look (Ling's lingjing prompt and 40 tools; the picture ~250), ~20–80
  out, none cached on this path; her opening look once a page; a typical round of two looks ~17.5k,
  at most four ~35k. A trimmed agent for small AI games would cut most of it (an engine question).
  - **猜者 灵 / 银月** (Hanli: 「游戏里可以让yinyue猜」): a switch over the paper. 银月 guesses as her guest turn at
    Lingjing's table (`place.yinyue`: Voice · AppTool · Story — no memory tools, no capture nudge in a skill
    session), her proud 妖王 voice, her lines on the paper only, in the same throwaway round session (deleted at
    round end; its folder is gone from disk, so no scan or dream sees it). Gated as in the world: until the save
    has met her the engine answers `absent` and runs no turn — 「还没遇见银月。」 (`unavailable`, pet off:
    「银月不在。」). Her prompt here is lighter than Ling's (~7.9k chars + 3 tools vs 18.4k + 40 tools).
    **Unverified:** her guesses, tokens and latency — the live save has not met her (10-16); measure once a save
    reaches 00-yinyue. Her lines in the right-hand chat as hers wait on an engine change (chat-bridge
    `addMessage` takes no agent; the embed shows it as the assistant) — Hanli's call.
  - **In the story (10-19; Hanli: 「ai游戏放到游戏中吧, 还挺好玩的. 但要结合剧情」, 「秘境里也放一个. AI猜都是Yinyue猜」,
    「秘境里可以有随机游戏」, 「AI猜画可以多放几个地方」).** The guesser is always 银月, in her 妖王 voice (the code hands
    her the picture and one line of where they are, `data.context`; her words are hers). No opening look in the
    story (a look is ~8.7k tokens): the first guess says whether the model can see. **Every look is a turn in
    the game's own chat (10-19):** 「@银月 我画了一样东西，你猜是什么？」 with the picture (`/api/chat` `images`),
    her reply in the chat as hers and in the paper's bubble; no throwaway session, so a look never restates
    her earlier guesses. A 测试存档 has that chat too, bound to its save (SKILL.md `session-params`);
    `&her=stub` answers on the page (a marked miss, then the word), `&chat=off` (the crawlers) asks no one.
    The 游戏厅's 试玩 of 画猜 opens the game page itself (`index.html?save=arcade-drawguess&seed=ji-home&board=drawguess`,
    arcade-board.js) with the board on the stage and the chat beside it; the old side panel is gone.
    - **第六回 · 家信 · 画给娘看** (wm-jiaxin, task `jiaxin-letter`, was 写信 · 擦了又写): 娘 cannot read, so beside
      three of the letter's own lines he draws — 「盆可以收起来了，十七个都收。」 a basin · 「给我爹买一副护膝，狗皮的。」
      爹's bow · 「我在这里很好。」 the moon over the mountain (games.json drawguess `sets.jiaxin`). She is out that
      night (the 火锅) — and now so in the save too: asleep in the 木牌 since 00-xiuxian, she wakes on wm-laoyin
      `final` and sleeps again on wm-jiaxin `rest` (else the engine would answer `absent`). A line counts once she names it; three looks a line, then it is written in words only and
      the next line comes — no fail. Grade all · some · none (灵石 15 · 10 · 5, first clear, after 入门). She cannot
      be asked (blind model, no engine, a 测试存档): 「就写字吧」 writes it in words (`written`, plain). ≤ 9 looks ≈ 78k
      tokens, a typical letter 4–5 looks ≈ 40k. The book's passage untouched; 孙二狗's 恩仇簿 line kept;
      games/letter.js stays in the 游戏厅.
    - **Where she is awake (10-19, Hanli: 「平时和剧情对齐, 只有在小游戏里需要时醒着」):** as the book has it —
      asleep in the 木牌 from 00-xiuxian through 卷一, out the 家信 night (wm-laoyin `final` → wm-jiaxin `rest`) —
      and for the round of a board that declares `needs: "her"` (tasks 家信 · 本王考考你 · 奇遇 你画我猜, tale.json's
      drawguess, qiyu.json's entry). Those are offered from the 木牌; the round's start holds her out
      (`hergame --hold=1 --task=<id>`, rules/hergame.mjs: `companion.awake` written, 5 min TTL, each round renews),
      its end lets her go. The 游戏厅's 画猜 with her as the guesser holds as `arcade:drawguess` (presence only).
      二十问 and 问卦's coins are no her-game: they wait for the book to wake her.
    - **本王考考你** (rules/kao.mjs, task `benwang-kao`): on a night (19:00–06:00) she is beside him (the 木牌 too), after
      入门, out of any run or fight — a light offer: its board stands only on an empty stage, beside the coins
      (as 二十问), or while a round is under way. Each round counted as it begins (`kao open`), 3 a night; the word
      is the rules', one of games.json drawguess `met` the save has met (饼 · 木牌 · 鹿 · 饭桶 · 牙签 · 火锅 · 镜子 ·
      狰 · 犰狳 · 鯥, each open after its scene or with its beast), never twice a night, a word never cleared
      first. A word's first clear pays the small-game 灵石 by its looks (1 → 15, 2 → 10, 3 → 5); a miss is
      another round. ≤ 3 looks a round: ≤ 9 looks ≈ 78k tokens a night.
    - **秘境 · 奇遇** (rules/qiyu.mjs, worlds/jiuding/qiyu.json; a pool, not one spot): as a rerun of the 外圈 is
      entered, each room (岔口 · 凶崖 · 暗河) rolls 0.3 — about one room a run; a hit draws by weight 你画我猜 3
      (once 银月 is met, the 木牌 too; words 鼎 灵芝 人参 犰狳 蛇 钥匙) · 撒豆成兵 3 (割藤 until 10-20; the next level each
      time, rules/climb.mjs) · 华容道 2 · 七巧 1 · 五子棋 1 (洛书 until 10-19), never the game the room before drew nor the last run's last. Each entry
      has 2–3 frames grounded in the rooms (the 岔口's carved 「凶」 crack, the 凶崖's steps, the dry 暗河's
      flat stone…) — the board's line, facts only. A win pays a find from the run's own `finds` (as 拾遗) and its
      first clear ever the small-game 灵石. A drawing round ≤ 3 looks ≈ 26k tokens. On a 测试存档:
      `rerun enter --qiyu=<task>` forces one into the first room.
    - **今日传闻**: tale.json `drawguess` (`needs: "her"`) — a mute witness who can only sign what he saw, a
      child's half-washed drawing on a wall, a ghost that answers only to a picture. In the seed and past the
      lint once 银月 is met and on her line, the 木牌 too (rules/tale.mjs, never the prompt); Ling may name the
      thing (`word`, one of the 卷一 words), else the rules deal it. ≤ 3 looks a step.
    - **断案**: no clean slot — its witnesses talk, and 画猜 runs one way (he draws, she names); a witness who
      draws for him would need the model to draw. Not built.
  - **画符 (idea, not built):** draw a talisman the book teaches (五雷符 …) stroke by stroke in its order;
    the page checks order and shape from the strokes themselves (no model), Ling only says how it looks.

## 手势斗法 — one grammar for every hand move (Hanli 10-21: 「OK, 你写进文档, 然后可以开始做了」)

His ask: 「不只是剑诀往前戳, 一些手势都可以类似处理, 往前拍或者戳就是攻击. 复杂手印, 结成就自动攻击. 设计一下. 看怎么好玩.」
**The shape picks the move; the motion throws it.** Camera only — without one nothing is offered and the game plays as before.

**Three tiers**
| Tier | How | Moves |
|---|---|---|
| 小招 | a shape, then a push (掌, 拳) or a jab (指) toward the lens | 剑诀 + 戳 → 飞剑 (one beast, fast) · 单剑指 + 戳 → 点穴 (freezes one a few seconds) · 推掌 + 推 → 掌风 (pushes a row back) · 拳 + 推 → 拳劲 (a ground slam, stuns those near) |
| 法术 (五法, the book's 第六回) | pinch the 文 → close into a fist (扣, the spell held) → push the palm forward (拍) to release | 火弹 午文 · 冰锥 子文 · 金刃 酉文 · 木藤 卯文 · 土墙 玉清诀; a held spell leaks and fades (the book: 扣得久了，自己就散了) |
| 大招 | a sequence of seals; it fires itself the moment the last seal forms — no push | the four-seal 火蛋 now; two-hand moves in 卷二 |

**What makes it play**
1. **No aiming, a direction.** The target is picked (the beast he tapped, else the nearest); the hand's place in the frame picks the lane — push on the left, the left lane. Never a crosshair (tried 10-21: too hard).
2. **灵力, not only a cooldown.** One 丹田 bar: 小招 cheap, 法术 mid, 大招 dear; it refills slowly, so the hand rests most of the time (his 10-21 rule: 「让用户大部分时间在休息」). A 大妖 stepping out fills it and lights the button (「手印攻击高, 可以引导玩家用于打boss」); small beasts are the cards' and towers' job.
3. **五行 combos (the book's 第六回).** 木藤 roots, then 金刃 cuts for double (「木藤不伤人，缠人，缠住了，才轮得到别的」); 冰锥 into 火弹 bursts into white steam over an area; the counter element (木得金而伐 …) hits harder.
4. **Two hands, two held spells (Mac, the book's 10-09 canon — 小满's edge).** Left fist holds 火, right holds 冰, push both: 双法. 卷二.
5. **Feel.** The move leaves 小满's hand the instant of the push; a held fist glows its element (拳心透红是火，透白是金，透青是木，透一点墨色是水，透黄是土); the ink hand in the hint glows with it.

**Order with the book:** before 古六 the 小招 only, learned from the hint; 古六's 讲堂 teaches the 文, the 扣 and the five 法术 one by one; after it the 五法 and combos; two-hand 双法 in 卷二. Each move is data (`moves`: shape, motion, cost, effect, `from` gate).

**First:** 法术试炼 in the 游戏厅 — every tier, 扣 then 拍, the combos, the 灵力 bar — for his hands; then 守墙关 and the 古六 lesson take what passes.

## 结印 — hand seals at the camera (10-21)

Hanli 10-21: 「做一个测试一下, 好玩的话, 可以在守墙里面, 让用户结印发火弹帮忙打怪」, then 「很好玩啊」「可以作为lingjing的一个亮点」
「放进去」 — in 卷一's launch scope. Two homes: the 游戏厅 prototype (`jieyin`, group 主力, type 结印) and **守墙关's helper**
(below). The player makes 掐诀 seals at the camera; **推掌 · 剑诀 · 申文 · 午文** in order cast a
火蛋 at the boar (three drive it off); a wrong seal held = 走火 (a charred egg pops, back to the first seal; stars count
走火). Level 2 is the shape of 古六's 讲堂 teaching level (one seal at a time, 褚先生's line for each, a wrong one only
tried again).

- **Seeing:** MediaPipe Hand Landmarker on the device (vendor/mediapipe/, VENDOR.md; 0.10.35 — 1.x phones metrics home).
  The camera opens only on 开始 and is stopped (its tracks) on pause, end and leave.
- **Judging:** rules, not a model — worlds/jiuding/levels/jieyin.json `seals` (straight / folded fingers, thumb tip on a
  fingertip, two points apart) and `judge` (thresholds; a seal counts held 0.3 s, a wrong one is 走火 only held 0.6 s).
  The seals are the 古六 canon that the points can see: 午 (middle tip, 火), 巳 (index tip), 申 (little tip), 剑诀, 推掌.
  Left out: 子文 / 雷局 (the thumb hidden behind the fingers) and 合十 (two hands occluding).
- **No camera** (none, denied, no WebGL, the model fails): 结印 is not offered — one line, and the game leaves
  (Hanli 10-21: 「没摄像头时, 就不用用户结印帮打, 游戏像现在这样打就OK」). No tap stand-in.
- **Reusable:** games/jieyin/eye.js (`available` · `loadModel` · `openEye`), judge.js, sequence.js (`sequence` | `one`),
  pose.js (each seal's icon from its rule). 守墙关 later: `available()` false → no 结印 button at all.
- **The library (10-21 later, Hanli: 「可以多设计一些"印", mac上可以用双手, iPhone只有单手」):** 17 seals, each `hands: 1 | 2`.
  One-hand (12): 推掌 · 剑诀 · 巳 · 午 · 申 · 未 (fingertips) · 卯 (index middle joint, 木) · 玉清诀 (middle finger's middle joint,
  土) · 酉 (little finger's top joint, 金) · 子 (ring root, 水) — the 古六 掐诀 canon, a joint judged by `nearest` (the thumb on
  THIS joint, not its neighbour 2 cm away) · 单剑指 · 犄角诀. Two-hand, a Mac's (5): 离火印 (thumbs and index tips touching, a
  triangle, palms apart) · 双掌 · 双剑 (side by side, level, apart) · 承剑 (a flat palm, a 剑诀 upright above it) · 天地印 (palms
  stacked, a gap) — none interlocked; each hand's shape on its own points, how they stand on the picture (`between`).
  Device sets (data `sets`): coarse pointer + small screen → one-hand seals only, else both; every move a sequence per set
  (the 火蛋: phone 推掌 · 剑诀 · 申文 · 午文, Mac 双掌 · 承剑 · 离火印 · 午文). `lv=3` 试印 tries every seal the device may make.
  Left out: a fist / 雷局 (the thumb's depth reads poorly), 合十 and interlocked fingers (hands hide each other).
- **No camera picture (10-21, Hanli: 「最好不显示摄像头…手部动作的提示」):** the video only feeds the model. The hand hint
  (games/jieyin/hint.js `handHint(container, { lang, size, seals, knobs })` · `update({ image, aspect, target, progress, right })` ·
  `fizzle()` · `destroy()`) draws the tracked hands in ink where the camera sees them (mirrored), lights an edge a hand nears,
  says which edge a lost hand left by, too far / too near, both hands for a two-hand seal; the seal to make beside it, the hold
  ring round the drawn hand. Compact in a corner (守墙关), large for teaching. Knobs: jieyin.json `hint`.
- **Power (10-21, Hanli: 「好，加上」):** the model at most 15 fps, the camera asked for 320×240 (ideal), 1 hand on a phone, 2 on a
  Mac only when the sequence has a two-hand seal (jieyin.json `eye`, sets.js `eyeFor`; a game may ask for more fps — 隔空指点's
  poke). Measured on 9527 (M2 Max, a synthetic canvas the detector finds no hand on, so the palm detector runs every frame):
  ≈8.3 ms a frame on GPU and ≈22 ms on CPU, the same at 640×480 / 2 hands and 320×240 / 1 hand — the model scales every frame to
  its own input size. The saving is the rate (≈30 → 15 runs a second: about half the model's time) and the smaller capture.
- **In the story — 古六's 讲堂** (Hanli 10-21: 「古6教学结手印那里可以做教学关卡」, 结印 in 卷一 「放进去」): wm-qianye's
  board `qianye-qiajue` declares an `alt` (tasks/h08.json; design.md § A board's other way): where the device has a
  camera it plays level `jiangtang` — the first day's seals in the passage's order (推掌 · 巳 · 午 · 申 · 剑诀, each
  hint 褚先生's line; a miss only tried again), then the four once (`cast`, `forgive`: no 走火) and a 火蛋 into 砸寨's
  straw dummy in the 讲堂 (`art`). One-hand only and the book's, so the same on a phone and a Mac. The hand hint
  large (no camera picture). No camera → 砸寨 · 讲堂试法 as before. Same task id either way: the grade (the alt's
  `deal.grades`, stars → tight · loose), marks, 修为 and the way on are one beat. Stars from misses (★3 none, ★2 ≤3).
- **After Hanli's camera test (10-21: 「单手的识别准确率高一些. 但要旋转一下手…双手的需要标注左右手」):** every seal (each part of a
  two-hand one) declares `face` (palm / edge / back to the lens) and `up`; its icon is drawn that way, mirrored as the player sees,
  with a facing line under it; judge.js `facingOf` reads it live (palm normal + MediaPipe's handedness, swapped back:
  `orient.handedSwap`) and the hand hint asks a hand turned otherwise to turn (brush arrow, 「手转一下」, after `orient.turnMs`) —
  only while the shape is not yet made (the judge itself reads any facing). Two-hand seals are labelled 左手 / 右手 (icons,
  how-lines, hint); `sides.either` true (either way round) for all five, fixed sides a data switch. Every Mac step takes its
  one-hand stand-in (`judge.also`), so one hand casts every move; the Mac 火蛋 双掌 · 双剑 · 申文 · 离火印 (Hanli: 「双手版离火印挺酷.
  双剑也不错」; both widened). A stronger two-hand cast (离火印 finish: a bigger 火蛋; 双剑: two swords) is the move's `bonus.on`,
  off pending his call.
- **掐 · 扣 · 松 (10-21, 古六's 第三天):** games/jieyin/spell.js — a spell's 文 pinched, the fist closed over it holds it (any fist;
  `spells.kou`), the hand opened casts it (`cast` event with the spell id); held past `fadeMs` (8 s) it leaks away; one hand holds
  one. 五行 `moves.wuxing`: 火弹 午 · 冰锥 子 · 金刃 酉 · 木藤 卯 · 土墙 玉清; `moves.feijian`: 剑诀 alone. The fist glows the spell's
  colour in the hand hint (`held`). Game effects are the host's (守墙关).
- **Tested:** the judge on synthetic hands (pose.js), not recorded ones; real-camera recognition is Hanli's to try.

### 结印 in 守墙关 — spells for the 大妖 (§ 手势斗法)

Hanli 10-21, in order: 「放进去」 · 「最好不显示摄像头」 · 「别让用户太累」 · 「加一个手势的冷却, 让用户大部分时间在休息」 ·
「不然打小怪, 结手印太频繁很累」 · 「手印攻击高, 可以引导玩家用于打boss」 · 「古6是系统学习, 前面可以出现简单的, 比如剑诀」 ·
隔空指点 「很不错, 加进去」.

- **Only for the 大妖** (shouqiang.json `jieyin.when`: boss | elite | always; boss). Ordinary waves are the cards' and
  talismans' job: the 结印 button is hidden. A 大妖 steps out → the button appears, calls (big, pulsing) and 小满 says
  `say` (「大妖来了——结印！」, plus 「它属土，木藤克它。」 when a move here overcomes its element). The 大妖 falls → dark,
  camera off; the next one asks for a tap again. Levels with a 大妖 today: 山门 (L1, wave 10) and 药园 L4 (wave 7) —
  the 兽潮 nights and the story's 药园巡夜 have none, so no 结印 there until a boss or an `elite` is marked in data.
- **Rest most of the time:** `cool` 10 s of game time between spells. While resting the hint steps away (nothing asks
  for the hand), the button wears an ash ring burning down and reads 「歇一歇」, the camera idles at 15 fps; ready → the
  hint is back, the button glows, 小满 says 「好了，结印！」. Ready with no seal tried for `idle` 60 s → the camera closes.
  (The 灵力 bar of § 手势斗法 replaces the plain cooldown when the jieyin module lands it.)
- **The moves** (`jieyin.moves`, each a `shape` and its numbers; gated by `from`):
  - **飞剑** (小招, `from` none): 剑诀 held at the lens + a jab toward it — 隔空指点's `judge3d` (counts the fingers
    pointed at the camera) and `poke` (zhidian.json knobs, the same data); the eye runs at poke.fps 30 only while it is
    armed. One beast, 320. First time on a device: 「比个剑诀，飞剑就出去」 (localStorage, never the save).
  - **火弹** (大招, after 古六): jieyin.json `moves.huodan`, this device's set (phone 推掌 · 剑诀 · 申文 · 午文; Mac
    双掌 · 承剑 · 离火印 · 午文, and the phone's one-hand sequence too); fires on the last seal; a wrong one = 走火 (the
    charred egg). 火 · 矛: its beast 420 and ½ to every beast on the line through it.
  - **冰锥 · 金刃 · 木藤 · 土墙** (the book's five, after 古六): effects ready (冰 针 one beast 380, fast; 金 镰 a row
    across the road 200 + slow; 木 绳 holds 3 s, no damage; 土 墙 pushes back 120 px, never the 大妖); offered once the
    jieyin module's 五法 (文 → 扣 → 拍) lands — a move with no seals on the device is not offered.
- **Gate:** `from: { marks: [qiajue-tight, qiajue-loose] }` — 古六's 讲堂三日 (qianye-qiajue) written into the save. The
  story hands its marks in (`data.marks`, lingjing.js mountData); the 游戏厅 gives none → every move. Story levels and
  兽潮 before 古六: 飞剑 only.
- **Hard on the 大妖:** × `bossMul` 4; × `counter` 1.5 on a beast whose element (creatures.json `root`) the spell's
  overcomes (`beats`, 素问: 木得金而伐，火得水而灭，土得木而达，金得火而缺，水得土而绝; 合窳 is 土 → 木藤).
- **Target:** the beast he tapped; else the 大妖 in reach (`aim: boss`); else the one nearest the wall — below the range line.
- **Sims** (30 nights, BOTS.human, a move made in 4 s once ready; `sim(…, { seals, spell })`): see status 10-21.
- **Unchanged:** no camera / refused / no WebGL / no SIMD / model fails → no button; the same game (tested: the block's
  presence changes no sim). Camera off on pause, hidden page, × , level end, leave. Dev: `?dev=1&feed=1` (hands from the
  console: `jieyinFeed(world, image)`), `&jy=always` (spells every wave), `&hands=1|2`.
- **Tested:** tests/game-shouqiang-jieyin.test.mjs — offered only with a 大妖, target order, rest, bossMul and 相克, the
  five shapes, gates, the cue, the same game without casts, balance, no camera → nothing, movesFor, big moves in step,
  the button's life (call, tap, rest, ready, dark), idle close, the jab → 飞剑 and the seals → 火弹 / 走火.

## 隔空指点 — jab the 剑诀 at the screen (test game, 10-21)

Hanli 10-21: 「剑诀目前是手指朝上, 如果手指指向屏幕, 是否可行. 一个用户隔空双指点屏幕的demo视频, 也许能引起兴趣」;
「好，先做试玩」; after his real-camera try: 「测试了剑诀往前戳, 不好操作」「或者往前戳触发攻击, 但自动瞄准也可以」. 游戏厅
only (`zhidian`, group 主力, type 结印); not in the story. The player holds **剑诀** to the camera (fingers at the lens or
up) and **jabs toward it**: a 火蛋 flies and **aims itself** — at the beast the player tapped while it is in view, else
the one nearest the bottom (小满's side), of those the one nearest getting away (守墙关's 结印 rule); a ring marks the
next one. 野猪 · 犰狳 · 鬿雀 (守墙关's art) cross the 山道 on three lanes; 60 s, stars at 6 · 10 · 14 hits (ends early at
★★★). The 准星 that followed the fingers (the first cut) is gone. Numbers: worlds/jiuding/levels/zhidian.json; the
seal's shape: jieyin.json `seals.jian`.

- **剑诀 at the lens** (games/jieyin/judge3d.js, `judge3d`): judge.js loses a pointed 剑诀 once the landmarker squashes
  depth — palm up and fingers bent forward its reach ratio sinks to 1.03–1.09 (< 1.2); the whole hand turned, its
  hand-length shrinks and the tips read apart. judge3d reads each finger's own bend (middle + end joints) on the 3D
  world points, the tips' gap in palm-widths. Loose on purpose: straight < 65°, folded > 70°, tips < 0.8 palm-widths,
  held for 0.4 s after last seen. Synthetic hands, up to straight at the lens, depth ×0.3: index/middle 0–12°,
  ring/little 132–157°, tips 0.51. Refused: the index alone, the ring finger up, an open palm, a fist, a fresh V.
- **The jab** (zhidian/poke.js, `poke`): the hand's size in the picture (three palm lengths) ≥ ×1.12 its smallest in
  the last 300 ms, 剑诀 held, 350 ms apart; sideways movement does not matter. Fires on ×1.15 over 0.3 s, ×1.2 over
  0.4 s, ×1.3 over 0.5 s (at 15 fps too); silent on drift nearer ≤ 30 %/s, a 5 % tremble, rocking ±8 % about once a
  second, a 1.2 s push, no 剑诀.
- **Seeing**: as 结印 (eye.js, on the device), asked for 30 fps and one hand (eye.js's default is 15). The camera's
  picture is never shown — 结印's hand hint (jieyin/hint.js handHint) in the corner, 剑诀 its target, the ring full
  while held; its "closer" cue comes at a quarter of 结印's (a pointed hand looks short). Camera only after 开始; off
  on pause, hidden page, end, leave. No camera / denied / no WebGL: one line, nothing else.
- **Tested** on synthetic hands (pose.js turned and depth-squashed, near-misses, a bot through the whole pipe to ★★★);
  the live page by the dev feed (`?dev=1&feed=1`, `zhidianFeed.bot()` — synthetic hands, no camera). Real-camera play
  is Hanli's: `arcade.html?dev=1&game=zhidian`.

## 撒豆成兵 · 守山门 — the defence crowd game (prototype, test-only, 10-21)

Hanli 10-21, of a crowd-gate ad (a lane walled with 「+1」 gates, a small blue squad at the bottom, a red horde of
hundreds coming down, a boss with an HP bar; then three lanes — blue +1 safe, the horde in the middle, yellow +99 on the
right — and the boss charging down into the squad): 「好像比我们的撒豆成兵好玩一点」, 「好, 做一版. 这个是在防守, 现在的
撒豆成兵是在进攻.」. 游戏厅 only (`sadoushou`, group 主力, type 塔防, tiled right after 撒豆成兵 to compare); not in the
story, not in the 秘境 pool. 撒豆成兵 (`sadou`, the attack run) is unchanged.

- **Play:** 小满 on the 山门 at the foot of a pseudo-3D road. Aim left/right (the mouse's x, a drag on touch, A/D ·
  ←/→) and HOLD to scatter (press, Space): each bean is a 豆兵 that runs UP the road. **The lane is the decision:** left a
  wall of small +1 / +2 gates (safe, steady), the middle a ×2 — from 第二关 a 符门 that flips ×3 / ÷2 —, the right +5 then
  a gold **+99** that lights again only after its cool (rich, and the tide runs past it — from 第三关 waves come down the
  right lane alone and shut its gates; traps (−1) join the left). Near a foe a 豆兵 turns to it, so any lane meets the
  horde. A 豆兵 at a wave's front strikes once (its weight) and is spent: both big numbers grind down. Then the 大妖
  walks out with an HP bar over its head; every few seconds it shows a red line where the stream runs, steps over, and
  **charges** down it (lightning aura, large as it nears the wall), knocking the 豆兵 on it aside — move the stream off
  the line. A wave or the 大妖 at the wall hurts it; the wall at 0 is the loss. Stars: the wall left (75% · 40%) and ★★★
  only inside the level's par time.
- **Levels** (worlds/jiuding/levels/sadoushou.json, data; each sends only the beasts the book has shown by its `hui`):
  守山门 · 野猪下山 (h04, 1,650 野猪, 蠪侄) · 松林狰吼 (h05, 狰 in the tide, the 符门, 蠪侄) · 药园夜袭 (h07, 犰狳,
  a trap, waves down the rich lane, 合窳) · 黑松岭鬿雀 (h09, fast 鬿雀, 合窳). 狰 is beyond the brief's 野猪/犰狳/鬿雀:
  it is the book's (h05) and 守墙关 has its art.
- **Balance** (tests/game-sadoushou.test.mjs; 40 seeded first-time humans — 0.45 s late, a worse lane one time in four,
  out of the charge three times in five): wins 40 · 32 · 32 · 22 of 40 (sloppy: 28 · 18 · 5 · 4); aiming where the
  stream multiplies wins every seed, aiming into the traps or never moving loses every level.
- **Engine** games/sadoushou/core.js (headless; the 豆兵 typed arrays bounded by `cap`, past it they run as weight so
  the count stays true); **play** tools/sadoushou/ → games/sadoushou/sadoushou.min.mjs (Phaser, the shared vendor
  build): the road and the ink mountains painted once into one texture, pooled sprites (≤ 520 豆兵, ≤ 380 beasts), no
  per-frame depth sort. **Art** all shared: 撒豆成兵's 豆兵 and road, 守墙关's wall, beasts and 小满, 守炉's 银月, the
  story's backdrop `cloudy-day`; the gates drawn in code. No new painting.
- **Speed** (Playwright, GPU headless Chromium on the Mac, ?fps=1): 1440×900 avg 59.7 fps (min 56) and 390×844 at 3×
  avg 59.7 (min 57), with 380 beasts + ~105 豆兵 drawn at the peak. Not measured on a real phone.
