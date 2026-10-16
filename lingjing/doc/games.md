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

**Keep in 卷一 (six):** 喂饼 → 割绳子 (building now) · 射鹿 → 愤怒小鸟 (after launch) · 接雨 ·
吹鹅毛 (new loop) · 喷嚏符 (already the most fight-like) · 顺风溜 → 几何冲刺 (after launch). Plus
**最后一罚** as 今线's one. **Second tier** (good timing reads; keep only if he likes them on
replay): 烙饼 · 拽 · 小周天 · 禹步. **Cut the rest** — each is a passage he can read in the time it
takes to play, and the rhythm rule (≤1,500 字 between beats) is met by the six plus the fights,
riddles and look-gates. A cut board leaves its scene's `show`/`offers`/`needs` (the passage stays).

**Card law (Hanli 10-16):** 小满 gets a card only for **his own art the book says he knows**, or a
thing the book names that he can use (符, a weapon, 牛脂甘露); never another person's art (阿禾's
are hers, played by her in the party); a tamed 灵宠 is a card. "得牌?" below: **yes** = the book
has it as his; **?** = the book is not clear, his call; **no**.

Length: the bot's time at 390 (a person takes about twice). Skip: 「算了，往下走」 shows only when
stuck — 75 s unwon, or the game's own `stuck` rule where noted; a skip pays nothing.

## 古一 · 古二 — the prologue's beats

| 回 · scene | game | the book | how it plays now | what's wrong | proposal | length | skip | 得牌? |
|---|---|---|---|---|---|---|---|---|
| 一 · 00-kitchen | 烙饼 `griddle` | 「一张厚，一张薄」 | call 「翻！」 when a side goes golden; thin then thick | a real timing read, but the brown is hard to see on the paper | second tier; kit: stronger browning, a pop on each call | 21 s | 75 s | no |
| 一 · 00-masan | 忍字 `taunt` | 「学声狗叫，给你舔一口」 | the taunt once, then said back piece by piece; wrong pieces and time close the fist | the right piece is easy to spot; the fist barely shows | **cut** (the passage carries it) | 5 s | 75 s | no |
| 一 · 00-shiao | 接雨 `rain` ★ | 「一场雨接满十七个盆」 | tap a dripping spot to set a basin, tap a full one to bank it; 17 to fill | a full basin takes two taps (lift, set again); a leak gives no warning; the water in a basin barely shows; the cap is 110 s | **keep**; one tap swaps a full basin for an empty; a leak shows as a stain 1.5 s ahead; overflow splashes; 4 drips a basin → ~45 s | 38 s | 75 s | no |
| 一 · 00-shiao, 00-xiuxian, 00-notice | 石坳村 `village*` | the village | a map with a few optional things; 「回家」 whenever | a stroll, not a game, and need not be | keep as the map (not counted as a beat) | free | own 「回家」 | no |
| 一 · 00-heisong | 追踪 `track` | 「一百步刻一道」 | pick the deer's sign of five; walk; 刻 at 100 steps | the count is on screen — wait for 100, tap | **cut** (or: the count fades at 50, keep it in your head) | 22 s | 75 s | ? (his tracking) |
| 一 · 00-storm | 听 `listen` | 「鸟忽然全停了」 | say 「不对」 when the birds stop, then pick the sign | the cue is only text; the how-line gives the sign | **cut** (拽 follows straight after) | 11 s | 75 s | no |
| 一 · 00-fall | 拽 `storm` | 拽爹上崖 | three pulls in the lulls between gusts | fine | second tier; kit only | 12 s | 75 s | no |
| 一 · 00-yinyue | 认路 `way` | 「崖壁上一段划了一道」 | a small grid seen a step around him; follow his marks | the marks lead straight | **cut** | 7 s | 75 s | no |
| 一 · 00-cave | 扔石听声 `stone` | 「先往里扔一块石头」 | a stone into each of three hollows; go into the one that knocks | the how-line names the right sound; one decision | **cut** | 4 s | 2 wrong | no |
| 一 · 00-cave / 00-fox | 喂饼 `bread` ★ | 那张厚饼，分它一半 | seven pieces: to the fox or to himself | two buttons, nothing moves | **keep** → 割绳子 physics puzzle (another agent, building now) | 5 s | 75 s | no (银月 is already a card) |
| 二 · 00-deer | 射鹿 `deer` ★ | 「风。往左偏半寸。」 | set the aim (‹ = left), hold to draw, let go in a lull | the skill is pressing ‹ once; a static target | **keep** → 愤怒小鸟 drag-and-arc, after launch; now UI/stuck fixes only | 5 s | 3 misses | yes — 先看风，后看鹿 (爹's lesson to him) |
| 二 · 00-cliff | 攀 `climb` | 「右手抓一根荆条」 | each reach, pick the branch in leaf; rest on the stone | a two-way pick, always readable | **cut** | 7 s | 2 slips | no |
| 二 · 00-sleep | 忍 `xisui` | 「疼，别喊」 | hold to grit while three sticks burn | holding a button for half a minute | **cut** (the 洗髓 passage is stronger read) | 27 s | 75 s | no |
| 二 · 00-rent | 算账 `scale` | 皮抵欠，肉二十斤抵租 | hand the hide; tag cuts (weights shown) to 20 斤; 称 | the weights are printed — a sum, not a weigh | **cut** (or: rough weights, a live beam, 马三 waits three weighs) | 5 s | 75 s | no |
| 二 · 00-halfyear | 吹鹅毛 `feather` ★ | 「吐气，毛不许动」 | press and draw slow circles, 20 s a breath, three breaths | circling a mouse is a chore; the feather barely moves; the pad sits far from the feather | **keep**, new loop: hold to breathe out, let go to ease — keep the breath inside a band; too strong the feather shakes and flies, too weak the chest bursts; the band narrows as the count climbs (needs his go) | 23 s | 75 s | yes — 吐纳 · 先吐 (the scroll's, his) |
| 二 · 00-halfyear | 练功 `carry` | 挑水上坡不喘 | step when the swinging buckets pass the middle | fine, but the same beat as 吹鹅毛's scene | **cut** (one beat a scene) | 15 s | 75 s | ? (one breath card with 吹鹅毛) |
| 二 · 00-uncle | 算盘 `abacus` | 「一笔一笔地算账」 | three sums on the beads | arithmetic, not play | **cut** | 6 s | 4 wrong | no |
| 三 · 00-luoshu | 二试 `luoshu` | 洛书九宫 | fill the magic square | a puzzle; the test the book sets | keep (a test, not a beat) | ~60 s | 75 s | no |

## 古四 → 古七

| 回 · scene | game | the book | how it plays now | what's wrong | proposal | skip | 得牌? |
|---|---|---|---|---|---|---|---|
| 四 · wm-zhoutian | 小周天 `zhoutian` | 冲三关 | in · out · still; push only in the stillness; 玉枕 wants three | a real timing read | second tier | 75 s | yes — 小周天 |
| 五 · wm-kunzhen | 困阵 `luoshu` | 「正中那个是空的」 | the 洛书 square again | the same puzzle as 二试 | **cut** (or a different fill) | 75 s | no |
| 六 · wm-qianye | 讲堂三日 `qiajue` | 掐、咒、扣 | tap the 文, the eight lines in order, hold the 扣 | three drills | **cut** | 6 wrong | yes — 掐诀 (褚先生 teaches him) |
| 六 · wm-qianye | 相克 `xiangke` | 五句 | answer an element with what overcomes it | a quiz | **cut** | 5 misses | ? |
| 六 · wm-zhaojing | 藏息 `mirrortongpu` | 镜光扫过来 | hold 「吐」 long and slow as the light passes | a timing hold | **cut** | 3 flares | ? (藏息 his?) |
| 六 · wm-zhaojing | 喂饭桶 `fantongqianye` | 开炉夜 | press the lid open, feed things | a sequence | **cut** (the free 饭桶 feed stays) | 75 s | ? (饭桶 is a thing he uses) |
| 六 · wm-laba | 底册 `diche` | 看完烧了 | read each line twice, burn it | reading | **cut** | 4 | no |
| 六 · wm-dabi | 喷嚏符 `sneeze` | 让一拳 | watch the shoulder, 让; a touch of 送气; 推 mid-sneeze | a read with three verbs — the most fight-like | **keep** | 5 | yes — 喷嚏符, a 符 |
| 六 · wm-laoyin | 猪蜻蜓 `zhuqingting` | 等风掉头 | wait; 拍 as he steps behind | one timing tap | **cut** | 4 misses | ? |
| 六 · wm-jiaxin | 写信 `letter` | 擦了又写 | write line by line, erase what must not be said | a choice | **cut** | 75 s | no |
| 六 · wm-heluo | 念开篇 `kaipian` | 戴九履一 | each line of the verse into the nine squares | a recall drill | **cut** | 6 wrong | no |
| 七 · 09-snow | 喂饭桶 `fantonghuochai` | 扔了干净 | drop two scraps in | two taps | **cut** | 75 s | no |
| 七 · 09-jiuge | 随叶 `leafsui` | 跟着它走 | hold 随左 / 随右 with the leaf | a tracking hold | **cut** | 75 s | ? |
| 七 · 09-jiuge | 禹步 `yubujiuge` | 九格 | left, right behind, step in — one to nine | a rhythm | second tier | 5 trips | yes — 禹步 |
| 七 · 09-furnace | 认方 `recipe` | 三张方子 | match heaps, leads, pills | a memory puzzle | **cut** | 5 ash | no |
| 七 · 09-furnace | 定风 `leafding` | 看见它起来 | wait for the rising leaf; 挪半步 | one timing tap | **cut** | 75 s | ? |
| 七 · 09-year | 闻焦 `huohousmell` | 半口气 | say it when the scent turns scorched | one timing tap | **cut** | 3 lost | ? (火候) |
| 七 · 09-yishui | 芦苇里那一等 `reed` | 「放剑」 | loose when the wing-root shows | one timing tap | **cut** | 4 wasted | no |
| 七 · 09-xie | 顺风溜 `wind` | 背后有风 | read the wind, turn, 退一步 | a read and a tap | **keep** → 几何冲刺 one-tap runner, after launch | 3 puffs | yes — 顺风溜 |

## 今线 — the breath games (games/breath.js)

No cards — 今线 is not 小满's world. They already have a stake (the heart rate) and a read (the breath).

| 回 · scene | game | the book | how it plays | proposal | skip |
|---|---|---|---|---|---|
| 今一 · j01-retest | 一千米补测 `qianmi` | 先吐 | out clean, then in; run | cut | 2 tries |
| 今二 · j04-line | 罚球 `faqiu` | 吸四吐六 | in four, out six, shoot on the out | cut (最后一罚 is the same, better) | 75 s |
| 今三 · j07-dark | 黑地十一步 `dark` | 领着喘 | step when the ankle is centred; lead his breath | cut | 2 falls |
| 今三 · j07-guan | 晨脉 `pulse` | 坑填平了才许摸球 | count the morning pulse | cut | 75 s |
| 今四 · j09-final | 最后一罚 `lastshot` | 带着怕投 | two long outs, shoot at the end of one | **keep** | 3 misses |

## Daily boards, 秘境, 密室 (not story beats; no card)

炼丹 (pair herbs) · 押宝 (four doors, three bets) · 洛书 (鼎封) · 华容道 (秘境) · 七巧 · 五子 ·
残局 · 守夜 (药园) · 下崖 / 拾遗 (秘境) · 密室 (he sees the mechanisms, 银月 reads the pages).
Fine as they are; 洛书 is the same square three times (二试, 困阵, daily).

## AI games (the model talks; the rules hold the secret and the score; no card)

- **二十问** — 银月 thinks of an ordinary animal; yes/no in the chat; guess within twenty.
- **讨价还价** — haggle with a keeper in the chat; the rules hold the floor and the mood.
- **断案** — ask the people, find the proof, name who did it.
- **对对子** — being built 10-16 by another agent.
