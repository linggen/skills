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

**Keep in 卷一 (six):** 喂饼 → 割绳子 (built 10-16) · 射鹿 → 愤怒小鸟 (the beat since 10-16, `deerarc`) · 接雨 ·
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
holds the five).

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
| 算账 | 00-rent (`rent-scale` → `rentrope`) | 「肉二十斤，抵今年的。」 — the meat onto 马三's steelyard | the venison, hung by vines → the steelyard's pan (the beam tips as it lands) | 乌鸦 (cut its vine first), a puff | **built 10-16** |
| 忍字 | 00-masan (`masan-taunt` → `tauntrope`) | 「学声狗叫，给你舔一口。」 — 小满 won't beg | the 桂花糕 on its string → the yard dog's mouth, never 马小宝's hand | 弹竹 (bounce it over), a puff | **built 10-16** |
| 认路 | 00-yinyue (`yinyue-way` → `wayrope`) | 「先带本王出去。」 — out of the valley | the little fox, swung into a 灵气泡 → the moss at the valley mouth | 灵气泡 (swing in, pop), a puff along the roof | **built 10-16** |
| 扔石听声 | 00-cave (cut; empty) | 「先往里扔一块石头，听了听」 | a stone → the shallow hollow (it must knock on rock, not fall in the deep one) | slab (the knock: hit the ledge) | 2 |
| 攀 | 00-cliff (cut; empty) | 右手抓一根荆条; 爹's hand at the top, 老周's rope | 老周's rope-end lowered → 小满's right hand | 荆棘 (thorns cut a vine they touch), regrowing vine | 2 |
| 追踪 | 00-heisong (cut; empty — the stone clue is the beat) | the prints break at the grey stone; the deer crossed the stream | a carved bark chip → the moss-scraped grey stone across the stream | wind (the stream's push, sideways) | 3 |
| 听 | 00-storm (cut; empty — 拽 follows at once) | the birds stop; the cloud presses down; back by the marks | — (leave empty: 拽 is the next scene's board) | — | — |
| 算盘 | 00-uncle (cut; empty) | the night's sums; 「五两银子，一年」 | five taels → 舅舅's purse (only if Hanli wants a beat here) | regrowing vine | 3 |

**The module's tools** (rope.js `ELEMENTS`, each data-declared, taught the first time with a ring and a line):
风 (puff) · 灵气泡 · 荆棘 · 会再长的藤 · 弹竹 · 双印 (twin seals) · 乌鸦 (crow). The 饭桶 brings them one a day
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
  (爹's rope: cut his pack free so he swings to the ledge), 禹步 (a 灵气泡 carried square to square past 荆棘).

Also **replace with 割绳子 or another proven mechanic if it isn't fun** — Hanli plays and decides:
烙饼, 拽, 小周天, 禹步 (the second tier) and 吹鹅毛.

## 古一 · 古二 — the prologue's beats

| 回 · scene | game | the book | how it plays now | what's wrong | proposal | length | skip | 得牌? | cut 10-16 |
|---|---|---|---|---|---|---|---|---|---|
| 一 · 00-kitchen | 烙饼 `griddle` | 「一张厚，一张薄」 | call 「翻！」 when a side goes golden; thin then thick | a real timing read, but the brown is hard to see on the paper | second tier; kit: stronger browning, a pop on each call | 21 s | 75 s | no | **cut 10-16 (before 入门)** — module kept |
| 一 · 00-masan | 忍字 `taunt` | 「学声狗叫，给你舔一口」 | the taunt once, then said back piece by piece; wrong pieces and time close the fist | the right piece is easy to spot; the fist barely shows | **cut** (the passage carries it) | 5 s | 75 s | no | **cut 10-16 (before 入门)** — module kept |
| 一 · 00-shiao | 接雨 `rain` ★ | 「一场雨接满十七个盆」 | tap a dripping spot to set a basin, tap a full one to bank it; 17 to fill | a full basin takes two taps (lift, set again); a leak gives no warning; the water in a basin barely shows; the cap is 110 s | **keep**; one tap swaps a full basin for an empty; a leak shows as a stain 1.5 s ahead; overflow splashes; 4 drips a basin → ~45 s | 38 s | 75 s | no | kept (the six) |
| 一 · 00-shiao, 00-xiuxian, 00-notice | 石坳村 `village*` | the village | a map with a few optional things; 「回家」 whenever | a stroll, not a game, and need not be | keep as the map (not counted as a beat) | free | own 「回家」 | no | — (the map) |
| 一 · 00-kitchen | 烙饼 `griddle` | 「一张厚，一张薄」 | call 「翻！」 when a side goes golden; thin then thick | a real timing read, but the brown is hard to see on the paper | second tier; kit: stronger browning, a pop on each call | 21 s | 75 s | no | kept (second tier) — replace with 割绳子 or another proven mechanic if it isn't fun (his play) |
| 一 · 00-masan | 忍字 `taunt` | 「学声狗叫，给你舔一口」 | the taunt once, then said back piece by piece; wrong pieces and time close the fist | the right piece is easy to spot; the fist barely shows | **cut** (the passage carries it) | 5 s | 75 s | no | kept — **replace with 割绳子** (cut, 村口 → 灶间 reads 1,866 字 > 1,500) |
| 一 · 00-shiao | 接雨 `rain` ★ | 「一场雨接满十七个盆」 | **打地鼠 (10-16, Hanli: 「一个或2个地方漏雨, 只能相应的盆」)**: a leak pops up — its stain 0.9 s before the first of 4 drops — then stops, and another pops up elsewhere; one at a time for the first quarter of the night, then quicker and up to two at once. A basin goes only where it leaks now (a dry tap is a wasted trip, the hand busy 0.5 s); when the leak stops the basin goes to the 水缸 and is back by itself — no running out, no covering spots ahead. 17 leaks caught to win (~49 s at a person's pace). **Fail**: 40 puddles (`FLOOD`, the head shows `地上 n / 40`, red in the last ten) before the fifth watch lose the night — 娘: 「屋里成河了！」, the same night again after a 1.5 s calm; 3 floods → the skip | (old board: six basins down at the start won it; basins ran out at 16/17; it never failed) | N by play, 60 seeds, one night's puddles: bot 0 · 0.6 s hand max 3 · 1 s max 18 · 1.3 s max 28 · away 3 s in 8 max 29 (live at 0.7 s: 29) — none reach 40, which leaves the half-attentive hand room; idle floods at ~31 s; away 5 s in 10 42/60, tapping every spot in turn 53/60, missing 1 leak in 3 25/60 reach 40; live at 0.6 s: 0 puddles, dry in 50 s | ~49 s | 75 s or 3 floods | no | kept (the six) |
| 一 · 00-shiao, 00-xiuxian, 00-notice | ~~石坳村 `village*`~~ | the village | (was: a map with a few optional errands — shoo hens, name prints, pick 艾草, guess prices, guess the tale) | homemade quizzes (Hanli 10-16: 「轰鸡这几个小游戏, 不太好玩」, 「这几个要不要删掉? 有用吗?」) | — | — | — | no | **cut 10-16** — the passages carry 阿禾's cabbage, 吴婆婆, 爹's knee; code, bots, tasks gone; the map painting stays at art/backdrop/village.webp |
| 一 · 00-heisong | 追踪 `track` | 「一百步刻一道」 | pick the deer's sign of five; walk; 刻 at 100 steps | the count is on screen — wait for 100, tap | **cut** (or: the count fades at 50, keep it in your head) | 22 s | 75 s | ? (his tracking) | **cut** |
| 一 · 00-storm | 听 `listen` | 「鸟忽然全停了」 | say 「不对」 when the birds stop, then pick the sign | the cue is only text; the how-line gives the sign | **cut** (拽 follows straight after) | 11 s | 75 s | no | **cut** |
| 一 · 00-fall | 拽 `storm` | 拽爹上崖 | three pulls in the lulls between gusts | fine | second tier; kit only | 12 s | 75 s | no | kept (second tier) — replace with 割绳子 or another proven mechanic if it isn't fun (his play) |
| 一 · 00-yinyue | 认路 `way` | 「崖壁上一段划了一道」 | a small grid seen a step around him; follow his marks | the marks lead straight | **cut** | 7 s | 75 s | no | **cut 10-16 (before 入门)** — module kept |
| 一 · 00-cave | 扔石听声 `stone` | 「先往里扔一块石头」 | a stone into each of three hollows; go into the one that knocks | the how-line names the right sound; one decision | **cut** | 4 s | 2 wrong | no | **cut** (its passage whole again: 1,148 → 1,241 字 before 喂饼) |
| 一 · 00-cave / 00-fox | 喂饼 `bread` ★ | 那张厚饼，分它一半 | seven pieces: to the fox or to himself | two buttons, nothing moves | **built 10-16** → 割绳子 physics puzzle: the 饼 on vines in the cave, cut them (tap or swipe) so it swings to the fox's mouth; four levels (一根藤 · 两根藤 · 石板 · 洞口风), a 饼角 a star (3), the order of cuts is the answer, never the timing; instant retry | 5 s | 75 s | no (银月 is already a card) | kept (the six) |
| 二 · 00-deer | 射鹿 `deer` ★ | 「风。往左偏半寸。」 | set the aim (‹ = left), hold to draw, let go in a lull | the skill is pressing ‹ once; a static target | **keep** → 愤怒小鸟 drag-and-arc, after launch; now UI/stuck fixes only | 5 s | 3 misses | yes — 先看风，后看鹿 (爹's lesson to him) | kept (the six) |
| 二 · 00-cliff | 攀 `climb` | 「右手抓一根荆条」 | each reach, pick the branch in leaf; rest on the stone | a two-way pick, always readable | **cut** | 7 s | 2 slips | no | **cut** |
| 二 · 00-sleep | 忍 `xisui` | 「疼，别喊」 | hold to grit while three sticks burn | holding a button for half a minute | **cut** (the 洗髓 passage is stronger read) | 27 s | 75 s | no | **cut 10-16 (before 入门)** — module kept |
| 二 · 00-rent | 算账 `scale` | 皮抵欠，肉二十斤抵租 | hand the hide; tag cuts (weights shown) to 20 斤; 称 | the weights are printed — a sum, not a weigh | **cut** (or: rough weights, a live beam, 马三 waits three weighs) | 5 s | 75 s | no | **cut 10-16 (before 入门)** — module kept |
| 二 · 00-halfyear | 吹鹅毛 `feather` ★ | 「吐气，毛不许动」 | press and draw slow circles, 20 s a breath, three breaths | circling a mouse is a chore; the feather barely moves; the pad sits far from the feather | **keep**, new loop: hold to breathe out, let go to ease — keep the breath inside a band; too strong the feather shakes and flies, too weak the chest bursts; the band narrows as the count climbs (needs his go) | 23 s | 75 s | yes — 吐纳 · 先吐 (the scroll's, his) | **cut 10-16 (before 入门)** — module kept |
| 二 · 00-halfyear | 练功 `carry` | 挑水上坡不喘 | step when the swinging buckets pass the middle | fine, but the same beat as 吹鹅毛's scene | **cut** (one beat a scene) | 15 s | 75 s | ? (one breath card with 吹鹅毛) | **cut 10-16 (before 入门)** — module kept |
| 二 · 00-uncle | 算盘 `abacus` | 「一笔一笔地算账」 | three sums on the beads | arithmetic, not play | **cut** | 6 s | 4 wrong | no | **cut** |
| 三 · 00-luoshu | 二试 `luoshu` | 洛书九宫 | fill the magic square | a puzzle; the test the book sets | keep (a test, not a beat) | ~60 s | 75 s | no | — (a test) |

## 古四 → 古七

| 回 · scene | game | the book | how it plays now | what's wrong | proposal | skip | 得牌? | cut 10-16 |
|---|---|---|---|---|---|---|---|---|
| 四 · wm-zhoutian | 小周天 `zhoutian` | 冲三关 | in · out · still; push only in the stillness; 玉枕 wants three | a real timing read | second tier | 75 s | yes — 小周天 | kept (second tier) — replace with 割绳子 or another proven mechanic if it isn't fun (his play) |
| 五 · wm-kunzhen | 困阵 `luoshu` | 「正中那个是空的」 | the 洛书 square again | the same puzzle as 二试 | **cut** (or a different fill) | 75 s | no | — (a test) |
| 六 · wm-qianye | 讲堂三日 `qiajue` | 掐、咒、扣 | tap the 文, the eight lines in order, hold the 扣 | three drills | **cut** | 6 wrong | yes — 掐诀 (褚先生 teaches him) | kept until replaced |
| 六 · wm-qianye | 相克 `xiangke` | 五句 | answer an element with what overcomes it | a quiz | **cut** | 5 misses | ? | kept until replaced |
| 六 · wm-zhaojing | 藏息 `mirrortongpu` | 镜光扫过来 | hold 「吐」 long and slow as the light passes | a timing hold | **cut** | 3 flares | ? (藏息 his?) | kept until replaced |
| 六 · wm-zhaojing | 喂饭桶 `fantongqianye` | 开炉夜 | press the lid open, feed things | a sequence | **cut** (the free 饭桶 feed stays) | 75 s | ? (饭桶 is a thing he uses) | kept until replaced |
| 六 · wm-laba | 底册 `diche` | 看完烧了 | read each line twice, burn it | reading | **cut** | 4 | no | kept until replaced |
| 六 · wm-dabi | 喷嚏符 `sneeze` | 让一拳 | watch the shoulder, 让; a touch of 送气; 推 mid-sneeze | a read with three verbs — the most fight-like | **keep** | 5 | yes — 喷嚏符, a 符 | kept (the six) |
| 六 · wm-laoyin | 猪蜻蜓 `zhuqingting` | 等风掉头 | wait; 拍 as he steps behind | one timing tap | **cut** | 4 misses | ? | kept until replaced |
| 六 · wm-jiaxin | 写信 `letter` | 擦了又写 | write line by line, erase what must not be said | a choice | **cut** | 75 s | no | kept until replaced |
| 六 · wm-heluo | 念开篇 `kaipian` | 戴九履一 | each line of the verse into the nine squares | a recall drill | **cut** | 6 wrong | no | kept until replaced |
| 七 · 09-snow | 喂饭桶 `fantonghuochai` | 扔了干净 | drop two scraps in | two taps | **cut** | 75 s | no | kept until replaced |
| 七 · 09-jiuge | 随叶 `leafsui` | 跟着它走 | hold 随左 / 随右 with the leaf | a tracking hold | **cut** | 75 s | ? | kept until replaced |
| 七 · 09-jiuge | 禹步 `yubujiuge` | 九格 | left, right behind, step in — one to nine | a rhythm | second tier | 5 trips | yes — 禹步 | kept (second tier) — replace with 割绳子 or another proven mechanic if it isn't fun (his play) |
| 七 · 09-furnace | 认方 `recipe` | 三张方子 | match heaps, leads, pills | a memory puzzle | **cut** | 5 ash | no | kept until replaced |
| 七 · 09-furnace | 定风 `leafding` | 看见它起来 | wait for the rising leaf; 挪半步 | one timing tap | **cut** | 75 s | ? | kept until replaced |
| 七 · 09-year | 闻焦 `huohousmell` | 半口气 | say it when the scent turns scorched | one timing tap | **cut** | 3 lost | ? (火候) | kept until replaced |
| 七 · 09-yishui | 芦苇里那一等 `reed` | 「放剑」 | loose when the wing-root shows | one timing tap | **cut** | 4 wasted | no | kept until replaced |
| 七 · 09-xie | 顺风溜 `wind` | 背后有风 | read the wind, turn, 退一步 | a read and a tap | **keep** → 几何冲刺 one-tap runner, after launch | 3 puffs | yes — 顺风溜 | kept (the six) |

## 今线 — the breath games (games/breath.js)

No cards — 今线 is not 小满's world. They already have a stake (the heart rate) and a read (the breath).

| 回 · scene | game | the book | how it plays | proposal | skip | cut 10-16 |
|---|---|---|---|---|---|---|
| 今一 · j01-retest | 一千米补测 `qianmi` | 先吐 | out clean, then in; run | cut | 2 tries | kept until replaced |
| 今二 · j04-line | 罚球 `faqiu` | 吸四吐六 | in four, out six, shoot on the out | cut (最后一罚 is the same, better) | 75 s | kept until replaced |
| 今三 · j07-dark | 黑地十一步 `dark` | 领着喘 | step when the ankle is centred; lead his breath | cut | 2 falls | kept until replaced |
| 今三 · j07-guan | 晨脉 `pulse` | 坑填平了才许摸球 | count the morning pulse | cut | 75 s | kept until replaced |
| 今四 · j09-final | 最后一罚 `lastshot` | 带着怕投 | two long outs, shoot at the end of one | **keep** | 3 misses | kept (the six) |

## Daily boards, 秘境, 密室 (not story beats; no card)

炼丹 (pair herbs) · 押宝 (four doors, three bets) · 洛书 (鼎封) · 华容道 (秘境) · 七巧 · 五子 ·
残局 · 守夜 (药园) · 下崖 / 拾遗 (秘境) · 密室 (he sees the mechanisms, 银月 reads the pages).
Fine as they are; 洛书 is the same square three times (二试, 困阵, daily).

## AI games (the model talks; the rules hold the secret and the score; no card)

- **二十问** — 银月 thinks of an ordinary animal; yes/no in the chat; guess within twenty.
- **讨价还价** — haggle with a keeper in the chat; the rules hold the floor and the mood.
- **断案** — ask the people, find the proof, name who did it.
- **对对子** — being built 10-16 by another agent.
- **画猜 · 你画我猜** — prototype 10-16, 游戏厅 only (`drawguess`, group AI · 试作; Hanli: 「玩家画AI猜, 试一下吧」).
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
  - **画符 (idea, not built):** draw a talisman the book teaches (五雷符 …) stroke by stroke in its order;
    the page checks order and shape from the strokes themselves (no model), Ling only says how it looks.
