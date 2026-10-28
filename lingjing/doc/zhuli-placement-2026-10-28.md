# 主力 in the story, small boards cut: the plan (2026-10-28)

Hanli, 2026-10-28, in order:
- 「主力这几个剧情里放进去了吗? 让每个关卡剧情里出现一次」
- 「主力的意思是多用」
- 「故事里请多用主力的塔防类游戏, 拳皇也算主力」
- 「主力塔防作为兽潮的游戏. 故事里的战斗可以用格斗」
- 「打地鼠什么的太小的游戏, 减少安排」
- 「气走经脉也少一点」
- 「拼图也少一点」
- 「游戏厅改成两个视图, 1个是按照类型排, 第二个按照故事排」
- 结印: teaching only in the story; in play it is the dock inside TD (his 10-21 rule 「把结印放到现有的塔防类游戏中」).

## What 主力 means now

| Group in the 游戏厅 | Boards | In the story |
|---|---|---|
| **兽潮** | 撒豆成兵 · 撒豆成兵 · 守山门 · 守墙关 · 守炉 | The hourly 兽潮 games. In the story only at a defense beat, each time its own `story:` level (兽潮 never deals a story level). Ladder levels stay 兽潮's. |
| **主力** | 格斗 · 抚琴 · 太鼓 | 格斗 at one-on-one fights; 抚琴 and 太鼓 at music beats. |
| **结印 · 练习** | 结印 · 法术试炼 · 隔空指点 · 施法特写 | Benches. In the story, only the teaching beat 讲堂 · 一印一印 (wm-qianye, camera `alt`). In play 结印 is the dock inside the TD boards. |

The story's backbone: 格斗 at fights, TD at defense beats, 抚琴/太鼓 at music beats, and the strong classics (象棋残局 · 五子 · 华容道 · 照着走 · word games) between.

**Small boards** (the cap is 1–2 a 回): 打地鼠 · 割绳子 · 投掷 · 配对.
**气 boards** (the cap is 1 a 回, only where 气 moves through the body): 调息 (气走经脉) and 几何冲刺.
**拼图** (the cap is 1 a 回, only where something is pieced back together).

## The rule for each cut

- **A gate pool's board** (wm-dianmao, 09-suifeng, 09-nianyao, 09-shenshi, 09-dingfeng, 09-yanceng) may be dropped: the pool's boards are back to back, so the reading cap does not move. It costs gate minutes, which the refit measures.
  - A 拼图 that spaces two 棋牌 apart (五子 and 象棋 are both 棋牌) is swapped for a 华容道 on the same task id rather than dropped, so no two 棋牌 meet.
  - A board an exit waits on (`needs.task`) is swapped, never dropped.
- **A narrative board is never dropped.** Each one breaks a passage the book runs long without it. A dry run that removes them adds fifteen stretches over the 2,200-字 cap; the longest is 6,279 (wm-tama → wm-kaikai). So a narrative board is swapped on its own task id (id, pay, marks and saves kept) where the passage gives a 主力 or a classic its action. Otherwise it is kept, with its reason below.
- Every new level is its own: a 华容道 level with its own id and layouts (solver-proved), a 照着走 level, a 守墙关 `story:` level, a 格斗 level. None deals a layout an earlier board dealt (`tests/arcade-rhythm.test.mjs`), and each is harder than the one before it of its kit.

## Per 回, before → after

| 回 | Small boards | 气 boards | 拼图 | 主力 (塔防 · 节奏 · 格斗) | Boards |
|---|---|---|---|---|---|
| 第一回 | 2 | 1 | 0 | 4 | 8 |
| 第二回 | 4 | 2 | 0 | 2 | 11 |
| 今·一 | 2 | 2 | 0 | 0 | 6 |
| 第三回 | 1 | 2 | 0 | 1 | 7 |
| 第四回 | 3 | 4 → 2 | 2 → 0 | 1 → 2 | 18 → 17 |
| 今·二 | 2 | 2 | 0 | 0 | 5 |
| 第五回 | 6 | 2 | 0 | 0 | 13 |
| 第六回 | 4 | 1 | 0 | 1 (+ 结印 teaching) | 13 |
| 今·三 | 2 | 1 | 0 | 0 | 5 |
| 第七回 | 3 → 2 | 0 | 4 → 0 | 1 → 3 | 23 → 25 |
| 第八回 | 1 | 3 → 1 | 3 → 0 | 1 | 24 |
| 今·四 | 2 | 2 | 0 | 0 | 6 |
| 第九回 | 0 | 2 | 0 | 1 | 7 |

第七回's 主力 3 counts 09-futian's bout, now a 格斗 board where the card fight stood.

Where a 回 is still over a cap after this plan, see **Over the cap, kept: for Hanli** below. Each of those boards plays the passage's own action. Swapping it would need a new kit or a new fighter's frames.

## The swaps

### 主力

| Board (task) | 回 · scene | Was | Now | Why it fits |
|---|---|---|---|---|
| `xunye-duanlei` 断肋 | 第四回 · wm-xunye | 几何冲刺 | **守墙关** story level `xunye` (药园, 野猪 only; his rib broken, so the wall is thin) | 「那天夜里，子时……爬到药园，在巡夜簿上十三夜那一格，按了一个手印」: the half month of night watches is a defense beat. It is harder than 守白菜 and 抬鹿下山, and gentler than 药园巡夜 · 开春 (第七回). |
| `fangshi-liuyun` 流云剑 · 整座崖 | 第七回 · 09-fangshi | 打地鼠 | **格斗** level `liuyun` (秦雁 on the cliff, no stage edge; outlast her sword) | 「这回的台子是整座崖，没有台边」 and 「头一场，不到二十招，她的剑尖便停在了他心口上」. The bout is to stand through her sword. Its end lines end where the book does: her point rests at his heart. |
| `futian-spar` (new; was the exit's card duel `futian-qinyan`) | 第七回 · 09-futian | 斗法 | **格斗** level `futian`: the cliff again, twenty-four moves, heavier | 「秦雁照旧一月上来一回」: her monthly bout, a one-on-one duel with a person. The way on waits on it; the card fight is gone, so the bout is played once. |

### Classics

| Board (task) | 回 · scene | Was | Now | Why |
|---|---|---|---|---|
| `dianmao-jiangtang` 讲堂 | 第四回 · wm-dianmao (pool) | 拼图 | **华容道** `tiaoshui` · 挑水 · 矮石墙外头 (the water carriers' pieces, 井台's) | Spaces 象棋 → 五子. |
| `dianmao-yaoyuan` 墙里的药园 | 第四回 · wm-dianmao (pool) | 拼图 | **华容道** `shiqiang` · 矮石墙 · 墙里的药园 | Spaces 五子 → 五子. |
| `suifeng-shanmen` 山门 | 第七回 · 09-suifeng (pool; the exit waits on it) | 拼图 | **华容道** `shanmen` · 山门 · 扫帚靠回墙角 | The exit's board; swapped, not dropped. |
| `nianyao-yaoyuan` 夜里的药园 | 第七回 · 09-nianyao (pool) | 拼图 | **华容道** `yaoyuan-ye` · 夜里的药园 · 东角那三棵禾 | Spaces 象棋 → 五子. |
| `nianyao-jingshi` 正殿 | 第七回 · 09-nianyao (pool) | 拼图 | **华容道** `zhengdian` · 正殿 · 屋脊的瓦缝 (the rubble's pieces: rafter, bricks, tiles) | Spaces 象棋 → 五子. |
| `shenshi-qingshen` 轻身 | 第八回 · 09-shenshi (pool; the exit waits on it) | 几何冲刺 | **华容道** `laosong` · 老松 · 挂在树杈里 (「一头扎进了老松的树杈里，挂在那里，上不去，下不来」) | The exit's board. |
| `suifeng-yading` 崖顶 | 第七回 · 09-suifeng (pool) | 拼图 | **华容道** `kehen` · 老松 · 那一道刻痕 | Spaces 五子 · 秦雁 from 照着走; keeps 年四's sitting. |
| `futian-suifeng` (new) | 第七回 · 09-futian | — | **照着走** level 5 (4 → 16, between 年五's 2 and 年六's 3) | 「他自己站在巽那一格上……把随风那一式一遍一遍地走」, on the board's own clifftop. It keeps 年五's sitting now that 秦雁's bout is one board. |
| `shenshi-jiangtang` 讲堂 | 第八回 · 09-shenshi (pool) | 拼图 | **华容道** `shenshi` · 讲堂 · 下了课 (the crowd's pieces) | Keeps 年六's sitting. |
| `yanceng-mingce` 执事堂 | 第八回 · 09-yanceng (pool) | 拼图 | **华容道** `mingce` · 执事堂 · 内门的名册 (the crowd's pieces) | Keeps 年八's sitting. |
| `dingfeng-yading` 崖顶的蜡烛 | 第八回 · 09-dingfeng (pool) | 拼图 | **华容道** `lazhu` · 崖顶的蜡烛 · 等它吹完 | Spaces 五子 → 五子. |
| `dingfeng-songzhi` 一剑出去 | 第八回 · 09-dingfeng (pool; the exit waits on it) | 几何冲刺 | **照着走** level 4 (6 → 20 squares, the quickest yet; on 瞿老's own cliff, the board's painting) | The exit's board; it follows 象棋, so it is not a 棋牌. |

New 华容道 layouts come from a seeded generator, each grid proved by `huarong.js solve` and asserted in `tests/game-huarong.test.mjs`: 第四回 14 · 16 · 17, 第七回 17 · 18 · 19, 第八回 18 · 19 · 20 moves (the story's cap is 20).

### Dropped (pool boards only)

`dianmao-tiaoshui` (几何冲刺) only. The other pool 拼图 became 华容道 after all: dropping them made the refit cut 古八's layers so short that a day's 秘境 passed a fifth of 七层 (`tests/mijing.test.mjs`).

### 拼图 in the 观内 pools

| Place | Pool before | Pool after |
|---|---|---|
| 外门 | 拼图 · 五子 | 华容道 · 五子 |
| 讲堂 | 五子 · 拼图 | 五子 · 华容道 |
| 药园 | 捉虫 · 拼图 | 捉虫 · 华容道 |
| 藏经阁 · 柴房 · 饭堂 | 拼图 kept | The east wall's 杂役 tags piece a worm-eaten scroll, a rotted door god and the stove god back together there, and a tag asks its place to host the board. |

象棋 stays at the 执事堂 only: it has three endgames a level, so it is not spread over the pools (`tests/guan-rotation.test.mjs`).

## Over the cap, kept: for Hanli

| 回 | Board | Kind | Why it stays |
|---|---|---|---|
| 第一回 | 接雨 · 拽爹 · 喂饼 | small | Hanli kept these on 10-21 (「第一回 keeps 接雨 · 忍字 · 拽爹 · 认路 · 喂饼」). |
| 第二回 | 上崖 · 射鹿 · 肉上秤 · 按断口 | small | Each is the passage's own action. 射鹿 was his pick (「射鹿可以用砸寨代替」). Before 入门 no classic or 主力 has a fitting beat. |
| 第二回 | 洗髓 (调息) · 水桶落井 (几何冲刺) | 气 | 洗髓 is one of the two 调息 he kept on 10-27. 水桶落井 is his first 气 settling: 「那一缕热沉过心口，沉到肚脐」. |
| 第三回 | 三百级 · 测灵石 (几何冲刺) | 气 | 三步一吸三步一呼 on the steps; the 气 hidden at the stone. |
| 第四回 | 小周天 · 铁刷子 (几何冲刺) | 气 | The first 周天; 褚先生's probe through the channels. |
| 第四回 | 一拳 · 一根萝卜 · 一根牛骨头 | small | The punch at the 青石, the 狰 taming, and the 饭桶's first feeding. |
| 第五回 | 别踩第三块 · 凶崖 · 隐身符 · 暗河 · 谷粒 · 一根萝卜 | small | 暗河 and 踏马符 (几何冲刺) are 邹青松's fight. They move to 格斗 once he has frames (below). The rest are the 秘境's own actions. 别踩第三块 would fit 照着走, but that board is painted as 瞿老's clifftop, not the 秘境's gallery. |
| 第六回 | 喷嚏符 (何七) · 接镜 (马小宝) · 风掉头 (祁长松) | small | Each is a 大比 bout's climax. They move to 格斗 once those fighters have frames. |
| 今·一 · 二 · 四 | one 几何冲刺 over the cap each | 气 | 沈芒's line is about breath. 那一圈 · 卧推 · 最后一罚 are its own runs. A swap would want a 今-line classic. |
| 第九回 | 一口气 · 嗓子 (几何冲刺) | 气 | The breath held to the bottom of the 漳水; 阿禾's 气 sent into the girl's throat. |

## 格斗: every story fight

| Fight | 回 · scene | Foe | Beast or person | Today | Plan |
|---|---|---|---|---|---|
| 坑底的小银狐 | 第一回 · 00-fox | foe-yinhu | beast | 斗法 | stays 斗法 |
| 蠪侄 | 第三回 · 00-longzhi | longzhi | beast | 斗法 | stays 斗法 |
| 蛫 | 第五回 · wm-wangzuo | gui | beast | 斗法 | stays 斗法 |
| 邹青松 (the 黄袍 with the 赤铜葫芦) | 第五回 · wm-xirang | foe-zou | person | 斗法, then 暗河 投掷 and 踏马符 几何冲刺 | → 格斗; **needs 邹青松's frames** |
| 何七 (大比 first round) | 第六回 · wm-dabi | — (board 喷嚏符) | person | 打地鼠 | → 格斗; **needs 何七's frames** |
| 卢方 | 第六回 · wm-fushi | foe-lufang | person | 斗法 | → 格斗; **needs 卢方's frames** |
| 秦雁 (大比) | 第六回 · wm-lun2 → wm-yingjian | foe-shijie | person | 斗法 (30 moves) → 格斗 (迎剑 · 那三分) | **Kept as is.** The card duel is the 30 moves and 迎剑 is the same bout's climax, in 格斗 already. Making both 格斗 would play one bout twice, back to back. |
| 马小宝 | 第六回 · wm-juesai → wm-jiejing | foe-maxiaobao | person | 斗法, then 接镜 打地鼠 | → 格斗; **needs 马小宝's frames** |
| 祁长松 (final) | 第六回 · wm-fengtou | — (board 风掉头) | person | 打地鼠 | → 格斗; **needs 祁长松's frames** |
| 犰狳 | 第七回 · 09-lingcao | qiuyu | beast | 斗法 | stays 斗法 |
| 秦雁 · 流云剑 | 第七回 · 09-fangshi | (board) | person | 打地鼠 | **→ 格斗 now** (`liuyun`) |
| 秦雁 · monthly bout | 第七回 · 09-futian | foe-shijie | person | 斗法 | **→ 格斗 now** (`futian`) |
| 九层师兄 (腊八 final) | 第八回 · 09-laba | foe-jiuceng | person | 斗法 | → 格斗; **needs 九层师兄's frames** |
| 冰夷双龙 | 第九回 · 01-rise | foe-shuanglong | beast (dragons) | 斗法 | stays 斗法 |
| 老井 (太一宫's white-robed steward) | 第九回 · 01-laojing | foe-laojing | person | 斗法 | → 格斗; **needs 老井's frames** |
| 雷神 · 夔 · 无支祁 · 防风氏 · 巴蛇 · 夔牛 · 肥遗 · 泰逢 | 卷二–九 bosses | — | beasts and gods | 斗法 | stay 斗法 |

**Frames to paint next**, in book order: 邹青松, 何七, 卢方, 马小宝, 祁长松, 九层师兄, 老井. Each turns its bout to 格斗 and frees a small board in 第五回 and 第六回.

## 抚琴 and 太鼓

太鼓 is in the story at 00-chushan and 01-altar. The 太鼓 agent is wiring 抚琴 into the story now, so this plan places neither. No other passage plays drums or a tune: the 大比's 铜锣 only keeps time, and the 秘境's 三下锣 opens a door.

## The 游戏厅

Two tabs in the header, remembered per viewer:
- **按类型**: the grid with the type filter. At the top: 兽潮, then 主力 (格斗 · 抚琴 · 太鼓), then 结印 · 练习. The story's boards are grouped by their kind.
- **按故事**: the 节奏 page folded in. One section a 回 (第一回…第九回, 今·一…今·四), boards in reading order. Each row shows its kind, a 主力 mark and its level; a tap plays it. The page keeps the reading bars, the counts and the warnings.

The old 节奏 link (`?view=rhythm`) opens 按故事.

## Gates and the model (after the refit)

`tools/balance.mjs` now counts a 格斗 board (`model.fight_games`) at a fight's minutes and retries, not a board's: it stands where a card fight stood. Without that, 古七's light player read 7.7 days, under the 8–21 band.

| Gate | Session wait before | After |
|---|---|---|
| wm-chaifang (第四回) | 10m | 10m |
| wm-qianye (第六回) | 7m | 7m |
| 09-furnace (第七回) | 0 | 1m |
| 09-futian (第七回) | 9m | 9m |
| 09-dingfeng (第八回) | 3m | 0 |
| 09-yanceng (第八回) | 0 | 6m |
| the rest | 0 | 0 |

Typical arrival is 100% at every gate, before and after.

## Second pass, 2026-10-28 evening: 主力 is the main content

Hanli, reading the 按故事 counts (「小游戏 25 · 斗法 1 · 大场面 1 · 主力 3」): 「我看还不是以主力游戏为主啊」 · 「这个华容道有点多了」, then 「主力最少占1半吧」 · 「主力游戏数量占80% 也行」 · 「尽力让主力游戏多吧, 除非剧情需要其他类型」. The first pass above had swapped 拼图 for eleven new 华容道 instead of 主力. This pass makes every board of a 古 回 a 主力 塔防 level unless the story itself calls for another kind, and leaves at most one 华容道 a 回.

**Rule.** A board stays non-主力 only if the passage plays it (a conversation, a riddle the plot turns on, a game the text sets, the 结印 teaching beat, a mark the story reads) or Hanli kept it by name. Nothing is kept "for variety": the 五子 · 象棋残局 · 照着走 boards of the 观内 pools, which no passage plays, are all 塔防 now.

**The levels.** 63 boards swapped on their own task ids (id, pay, marks of the others and saves kept; the task's `how` and, where it named the old game, its title are the only text changed; the book's text is untouched). Each is a story level `zl-<task>` of one of three 兽潮 kits: 守炉 (`games.json` shoulu levels), 守墙关 (`levels/shouqiang.json`), 撒豆成兵 · 守山门 (`levels/sadoushou.json`); each dealt by the kit's own tide maker (games/<kit>/tide.js) from a seed named for its task, with the beasts of its 回 only (no 狰 in 古四), its tier climbing with the book (古二 0 → 古九 0.93), a layout of its own (守炉's roads at least 35 px apart from every other level's), and bot-proved: the human-like hand wins at least 11 of 12 plays, a hand that does nothing loses (`tests/story-zhuli.test.mjs` re-proves them on other seeds). The level's lead is the scene's first caption (the book's own line) and one instruction line. Before 入门 (古二, 古三) there are no talismans: 守炉 takes the `skin` of 泗水路 (弹弓 · 火把, 小满 the hero with no skills), 撒豆成兵 has no 结印; 守墙关 stands only from 古四. No two adjacent boards of a kit: each slot takes the least used kit of its 回 that its neighbours do not play. The replaced boards' game rows stay in the 游戏厅 under 旧版 (`replaced`).

**Per 回, before → after** (boards · 主力 · 华容道):

| 回 | Before | After |
|---|---|---|
| 第一回 | 8 · 4 · 0 | 8 · 4 · 0 |
| 第二回 | 11 · 2 · 0 | 11 · 6 · 0 |
| 第三回 | 7 · 1 · 1 | 7 · 4 · 1 |
| 第四回 | 17 · 2 · 3 | 17 · 13 · 1 |
| 第五回 | 13 · 0 · 1 | 13 · 7 · 1 |
| 第六回 | 13 · 1 · 0 | 13 · 6 · 0 |
| 第七回 | 25 · 3 · 5 | 25 · 18 · 0 |
| 第八回 | 24 · 1 · 6 | 24 · 16 · 1 |
| 第九回 | 7 · 1 · 1 | 7 · 4 · 0 |

**Kept non-主力, with the story's reason** (every 对话 board, a conversation with a person, is the scene itself and is not listed; `tests/story-zhuli.test.mjs` holds this list):

| Board | 回 | Why it stays |
|---|---|---|
| 接雨 · 喂饼 | 第一回 | The passages' own actions; Hanli kept them on 10-21. (忍字 is 几何冲刺, 主力 since the 今线 pass below.) |
| 射鹿 | 第二回 | The bow and the wind are the passage (Hanli: 「射鹿可以用砸寨代替」). |
| 洗髓 | 第二回 | One of the two 调息 Hanli kept (10-27). |
| 人堆 (华容道) | 第三回 | The crowd to slip to the back of; the 回's one 华容道. |
| 洛书 | 第三回 | 娘's nine chestnuts: the riddle the second trial turns on. |
| 井台 (华容道) | 第四回 | The 回's one 华容道. |
| 困阵 (五子) | 第五回 | 「前人留下的一盘棋」: a game of the passage itself. |
| 七八个口子 (华容道) | 第五回 | The crowd on the riverbank; the 回's one 华容道. |
| 踏马符 | 第五回 | 邹青松's fight, a 几何冲刺 (主力 since the 今线 pass below); it may go to 格斗 once he has frames. |
| 讲堂试法 | 第六回 | The 结印 teaching beat; its grades are the marks the dock's moves wait on. |
| 家信 | 第六回 | The picture drawn for 娘 is the passage. |
| 禹步 · 随风那一式 | 第七回 | 瞿老: 「照着我的脚，走一遍」; walked on the clifftop over and over. |
| 芦苇里那一等 | 第七回 | The throw from the 浮木; its stars mark the reed. |
| 七块碎灵石 (华容道) | 第八回 | The 回's one 华容道. |
| 一剑出去 | 第八回 | 瞿老's cliff, the steps the sword goes by. |
| 恬惔虚无 | 第八回 | The second 调息 Hanli kept; 「真气从之」 is the passage. |

**Left.** 第六回 is at 6 of 13: every other board there is a conversation, the 家信, or the 结印 teaching beat. Its card fight with 卢方 (wm-fushi) can become a 格斗 board (his frames exist: 7 of 14), but the exit carries the 相克 hints, the 看他的脚 refusal and eleven tests, so it is a change of its own. 邹青松's fight and 踏马符 wait for his frames. 抚琴 has no passage yet; 太鼓 plays at 寿宴 and 河伯娶妇.

**接雨 (the `rain` kit) in the story** (Hanli: 「接水那个小游戏, 你用到了好几个地方, 不太合适, 看是否能换成主力. 或者不换也要把里面水滴什么的改成和情节一致」). Fourteen of its fifteen 古 uses are 主力 now; the one that stays is the board the kit was made for.

| Board | 回 | Was | Became |
|---|---|---|---|
| 接雨 · 十七个盆 | 第一回 | 接雨 | **Kept**: 「屋顶漏雨，一场雨接满十七个盆」 — the water is the passage. |
| 上崖 · 一根一根 | 第二回 | 接雨 / 打地鼠 | 撒豆成兵 · 守山门 (`zl-cliff-shangya`) |
| 银色的血 · 八道断口 | 第二回 | 接雨 / 打地鼠 | 撒豆成兵 · 守山门 (`zl-xiuxian-xue`) |
| 腿缝里 · 钻过去 | 第三回 | 接雨 / 打地鼠 | 守炉 (`zl-steps-tuifeng`) |
| 一拳 · 大青石 | 第四回 | 接雨 / 打地鼠 | 撒豆成兵 · 守山门 (`zl-qingshi-yiquan`) |
| 一根萝卜 · 别动 | 第四回 | 接雨 / 打地鼠 | 守墙关 (`zl-yaoyuan-luobo`) |
| 一把谷粒 · 藤 | 第五回 | 接雨 / 打地鼠 | 守墙关 (`zl-anhe-guli`) |
| 别踩第三块 · 翻板 | 第五回 | 接雨 / 打地鼠 | 守炉 (`zl-shiting-fanban`) |
| 凶崖 · 往下爬 | 第五回 | 接雨 / 打地鼠 | 守墙关 (`zl-wangzuo-xiongya`) |
| 隐身符 · 比草叶还轻 | 第五回 | 接雨 / 打地鼠 | 撒豆成兵 · 守山门 (`zl-xirang-yinshen`) |
| 喷嚏符 · 让一拳 | 第六回 | 接雨 / 打地鼠 | 撒豆成兵 · 守山门 (`zl-dabi-sneeze`) |
| 接镜 · 最后一道 | 第六回 | 接雨 / 打地鼠 | 守炉 (`zl-jiejing-mirror`) |
| 风掉头 · 猪蜻蜓 | 第六回 | 接雨 / 打地鼠 | 守墙关 (`zl-fengtou-pig`) |
| 头几夜 · 看的是药 | 第七回 | 接雨 / 打地鼠 | 守炉 (`zl-year-kanlu`) |
| 捉虫 · 阿禾那一小条地 | 第八回 | 接雨 / 打地鼠 | 守墙关 (`zl-yanceng-zhuochong`) |

The 今 boards that use the kit (捡球递水 · 红薯 · 冬至夜 · 皮褶卡钳 · 纸垫 · 晨脉) were re-skinned earlier (their own beam, basin and spots: a ball, a basket, a wrist); no water drops fall where the scene has none. 捉虫 · 药园的架子底下 is the 药园 practice, not a story board.

**Gates after the pass** (node tools/numbers.mjs --apply --write; typical arrival 100% at every gate): session waits 柴房 10m · 大比前夜 8m (was 7) · 09-futian 9m · 09-yanceng 6m, the rest 0. The model counts a 塔防 board at a board's two minutes like every other; the swapped 守炉 levels play 2 to 4.6 minutes in the sim (the bot), so a sitting runs a little longer than the model says in 古七 and 古八.

## 今线 (2026-10-28 night): 主力 in 沈芒's interludes

Hanli: the 今 line also uses 主力, by the same rule as the 古 line, with an agreed framing (no real-life 塔防 reskin: too much new art). A 今 board is 主力 where its scene can frame one: a character on a phone (the level keeps its art; it is "the phone game"), music playing, a run, an arcade or a judo class. Nothing is kept "for variety". The 今 line's task ids and pay are unchanged (a 今 board pays the 今 line's 修为: rules/lines.mjs).

**What the 今 text can frame.** Read through all four 回 (twelve scenes with a board): phones are in nearly every scene, but a lull with a phone in hand (a place a game could be played) is in one: 今三's last scene, j07-chenmai, bed seventeen, the livestream, the phone on his chest. Music playing (the 街舞社's speakers at the 百团大战, 马小宝's headphones in the dark, the stands' stamping and the 「百分之一」 chant) all sit under boards that are 几何冲刺 already, or under a 对话. There is no arcade, band or judo class in the 今 text.

**几何冲刺 is a 主力 kit** (Hanli: 「踏马符的几何dash也好玩」). It has a `main` row of its own in `games.json` (the kit's tile in the 游戏厅, under 主力), which is how `tools/arcade-rhythm.mjs` reads 主力 off the registry (a kit of 兽潮 or 主力). So the 今 line's seven laps and breaths count as 主力 as they stand, and so do the two 古 dash boards (忍字 and 踏马符), which left the kept lists above. The 古 per-回 counts become 第一回 8 · 5, 第五回 13 · 8.

**Per 今 回, before → after** (boards · 主力; 对话 boards counted in the boards, not in the half):

| 回 | Before | After | 主力 boards |
|---|---|---|---|
| 今·一 | 6 · 0 | 6 · 2 | 那一圈 (the 1000 m lap) · 十二正经 (「一条，绕着人跑三圈」), both 几何冲刺 |
| 今·二 | 5 · 0 | 5 · 2 | 卧推 · 吸四吐六, both 几何冲刺 |
| 今·三 | 5 · 0 | 5 · 2 | 闭眼单脚站 (几何冲刺) · **十七床 · 手机里那一局 (守炉; was 晨脉 · 六十九, 打地鼠)** |
| 今·四 | 6 · 0 | 6 · 2 | 手环 · 吸四吐六 · 最后一罚 (几何冲刺) |

Half or more of every 今 回's non-chat boards (2 of 4 · 2 of 4 · 2 of 3 · 2 of 4) is 主力. The one new level: `zl-jin-chenmai`, a 守炉 story level of j07-chenmai (talismans from 入门 on: 剑阵 · 火符 · 寒符; 野猪 · 狰 · 犰狳, all met by 第六回; tier 0.6, between 古六's and 古七's; its own road and spots, the road more than 35 px from every other, bot-proved: the human hand 12 of 12, a hand that does nothing loses). The board's title, `how`, done line and replay name the phone round on bed seventeen, and the way on's refusal reads 「手机里那一局还没打完」; the book's text, the pay and the id stay. The scene's way on still tells the morning of 六十九. The old 晨脉 row is 旧版 (`replaced: shoulu`).

**Kept non-主力, with the passage's reason** (the 对话 boards are the scenes themselves and are not listed: 古籍部 · 讲喘气的书, 六一七 · 别拍, 妈's video call, 黑地里 · 跟着我喘, 阿禾 · 那条线, 决赛前夜 · 正在输入, 随车的大夫; `tests/story-zhuli.test.mjs` holds this list):

| Board | 回 | Why it stays |
|---|---|---|
| 投一个给我看看 (砸寨) | 今·一 | 阿禾's line at the 百团大战 stall: the ball over the rim onto 马小宝's shaker. The shot is the passage. |
| 皮褶卡钳 · 别抖 (打地鼠) | 今·一 | The three pinches in the equipment room; no phone, music or run to frame a game. |
| 捡球递水 (打地鼠) | 今·二 | Fifty-seven minutes of chores at the end of the bench: he is working, not playing. |
| 投篮 · 白线上 (砸寨) | 今·二 | The empty gym and the white line; the free throws are the 今 line's spine. |
| 纸垫 · 一捻一捻 (打地鼠) | 今·三 | 严老师's needle practice: the class itself. |
| 红薯 · 篮下 (打地鼠) | 今·四 | The stray dog under the basket in the cold. |
| 冬至夜 · 先听 (打地鼠) | 今·四 | The night after the ambulance, listening to his own pulse in the dark; a game here is wrong in tone. |

**Left.** 抚琴 and 太鼓 are not placed in the 今 line: the beats that carry music (the stamping and the chant under 手环 · 吸四吐六, the 「百分之一」 chant at 最后一罚) are already 几何冲刺 boards,, and 抚琴 and 太鼓 are wired into the 古 story on their own track. 格斗 has no 今 scene with an arcade or a class. If Hanli wants more 主力 in the 今 line the seven kept boards are the pool, and each would need a framing line the book does not give.
