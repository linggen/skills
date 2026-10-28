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
| 第五回 | 6 → 5 | 2 | 0 | 0 | 13 |
| 第六回 | 4 | 1 | 0 | 1 (+ 结印 teaching) | 13 |
| 今·三 | 2 | 1 | 0 | 0 | 5 |
| 第七回 | 3 → 2 | 0 | 4 → 0 | 1 → 3 | 23 |
| 第八回 | 1 | 3 → 1 | 3 → 0 | 1 | 24 → 22 |
| 今·四 | 2 | 2 | 0 | 0 | 6 |
| 第九回 | 0 | 2 | 0 | 1 | 7 |

第七回's 主力 3 counts 09-futian's bout as 格斗 (step 4 below, its own commit).

Where a 回 is still over a cap after this plan, see **Over the cap, kept: for Hanli** below. Each of those boards plays the passage's own action. Swapping it would need a new kit or a new fighter's frames.

## The swaps

### 主力

| Board (task) | 回 · scene | Was | Now | Why it fits |
|---|---|---|---|---|
| `xunye-duanlei` 断肋 | 第四回 · wm-xunye | 几何冲刺 | **守墙关** story level `xunye` (药园, 野猪 only; his rib broken, so the wall is thin) | 「那天夜里，子时……爬到药园，在巡夜簿上十三夜那一格，按了一个手印」: the half month of night watches is a defense beat. It is harder than 守白菜 and 抬鹿下山, and gentler than 药园巡夜 · 开春 (第七回). |
| `fangshi-liuyun` 流云剑 · 整座崖 | 第七回 · 09-fangshi | 打地鼠 | **格斗** level `liuyun` (秦雁 on the cliff, no stage edge; outlast her sword) | 「这回的台子是整座崖，没有台边」 and 「头一场，不到二十招，她的剑尖便停在了他心口上」. The bout is to stand through her sword. Its end lines end where the book does: her point rests at his heart. |
| 09-futian's 秦雁 bout (exit `spar`, card duel `futian-qinyan`) | 第七回 · 09-futian | 斗法 | **格斗** level `futian` (the cliff again; longer, she is seventh-layer harder) | 「秦雁照旧一月上来一回」: her monthly bout, a one-on-one duel with a person. Its own commit after `liuyun` lands. If it cascades, it is listed as pending. |

### Classics

| Board (task) | 回 · scene | Was | Now | Why |
|---|---|---|---|---|
| `shiting-fanban` 别踩第三块 | 第五回 · wm-shiting | 打地鼠 | **照着走**, its own level `fanban` (the easiest: short runs) | The 翻板 gallery is a path to repeat step by step: 照着走's own action. |
| `dianmao-jiangtang` 讲堂 | 第四回 · wm-dianmao (pool) | 拼图 | **华容道** level `jiangtang` | Spaces 象棋 → 五子. |
| `dianmao-yaoyuan` 墙里的药园 | 第四回 · wm-dianmao (pool) | 拼图 | **华容道** level `yaoyuan` | Spaces 五子 → 五子. |
| `suifeng-shanmen` 山门 | 第七回 · 09-suifeng (pool; the exit waits on it) | 拼图 | **华容道** level `shanmen` | The exit's board; swapped, not dropped. |
| `nianyao-yaoyuan` 夜里的药园 | 第七回 · 09-nianyao (pool) | 拼图 | **华容道** level `yaoyuan-ye` | Spaces 象棋 → 五子. |
| `nianyao-jingshi` 正殿 | 第七回 · 09-nianyao (pool) | 拼图 | **华容道** level `zhengdian` | Spaces 象棋 → 五子. |
| `shenshi-qingshen` 轻身 | 第八回 · 09-shenshi (pool; the exit waits on it) | 几何冲刺 | **华容道** level `laosong` | The exit's board. |
| `dingfeng-yading` 崖顶的蜡烛 | 第八回 · 09-dingfeng (pool) | 拼图 | **华容道** level `lazhu` | Spaces 五子 → 五子. |
| `dingfeng-songzhi` 一剑出去 | 第八回 · 09-dingfeng (pool; the exit waits on it) | 几何冲刺 | **照着走**, its own level (the longest runs yet) | The exit's board; it follows 象棋, so it is not a 棋牌. |

New 华容道 layouts: each grid is proved by `huarong.js solve`. The fewest moves climb by 回: 第四回 < 第七回 < 第八回.

### Dropped (pool boards only)

`dianmao-tiaoshui` (几何冲刺) · `suifeng-yading` (拼图) · `shenshi-jiangtang` (拼图) · `yanceng-mingce` (拼图).

### 拼图 in the 观内 pools

| Place | Pool before | Pool after |
|---|---|---|
| 外门 | 拼图 · 五子 | 象棋 · 五子 |
| 讲堂 | 五子 · 拼图 | 五子 · 象棋 |
| 饭堂 | 拼图 · 华容道 | 象棋 · 华容道 |
| 柴房 | 华容道 · 拼图 · 赶黄鼠狼 | 华容道 · 赶黄鼠狼 |
| 药园 | 捉虫 · 拼图 | 捉虫 · 华容道 |
| 藏经阁 | 华容道 · 拼图 | Kept. The scriptures are pieced together there. |

The east wall's 杂役 tags keep their 拼图: a worm-eaten scroll, a rotted door god and a stove god are each pieced back together.

## Over the cap, kept: for Hanli

| 回 | Board | Kind | Why it stays |
|---|---|---|---|
| 第一回 | 接雨 · 拽爹 · 喂饼 | small | Hanli kept these on 10-21 (「第一回 keeps 接雨 · 忍字 · 拽爹 · 认路 · 喂饼」). |
| 第二回 | 上崖 · 射鹿 · 肉上秤 · 按断口 | small | Each is the passage's own action. 射鹿 was his pick (「射鹿可以用砸寨代替」). Before 入门 no classic or 主力 has a fitting beat. |
| 第二回 | 洗髓 (调息) · 水桶落井 (几何冲刺) | 气 | 洗髓 is one of the two 调息 he kept on 10-27. 水桶落井 is his first 气 settling: 「那一缕热沉过心口，沉到肚脐」. |
| 第三回 | 三百级 · 测灵石 (几何冲刺) | 气 | 三步一吸三步一呼 on the steps; the 气 hidden at the stone. |
| 第四回 | 小周天 · 铁刷子 (几何冲刺) | 气 | The first 周天; 褚先生's probe through the channels. |
| 第四回 | 一拳 · 一根萝卜 · 一根牛骨头 | small | The punch at the 青石, the 狰 taming, and the 饭桶's first feeding. |
| 第五回 | 凶崖 · 隐身符 · 暗河 · 谷粒 · 一根萝卜 | small | 暗河 and 踏马符 (几何冲刺) are 邹青松's fight. They move to 格斗 once he has frames (below). The rest are the 秘境's own actions. |
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
