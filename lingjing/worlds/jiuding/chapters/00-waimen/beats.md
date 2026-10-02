# 外门 · 古五至古八 — beat sheet

The script is story/jiuding-lu/05-第五回.md … 08-第八回.md (the book's 古五 to 古八, once 第一章 · 外门, then 第三回 until 卷一 was split into ten on 2026-09-30; approved by Hanli; his plan
of 2026-09-29: 「可以，按2天做，go」, 「可以，不打，go」). On the stage each scene is
its caption (two to four lines) and its choices — no picture: a story moment is
not illustrated (his ruling, 2026-09-29; pictures are for unfamiliar knowledge,
and figures.md lists where one would help). The passage (`story`, and each
exit's) is the book's own text, third person, verbatim paragraphs, played by
the dialogue box (rules/tell.mjs); caption, setup, recap and buttons speak to
the player as 你 (story DESIGN §四·五 人称分工). Realigned to the new book
2026-09-30. Where the game lets a thread go undone (小狰 is still an optional
errand), the passages leave out the lines that need it — marked in the lane's
report. Since the same day 小狰 is the story's (`wm-yaoyuan`), so the 柴房, the 秘境 公中 and the 大比 keep their 狰 lines whole.

**Shape** (design.md § 剧情 × 开放世界): one goal — the 外门大比, counted down on
the goal line (`goal`: 腊月初八 until 周衡's 「大比，明日」, then 明日) —
five key beats that lock the map (chapter.json `beats`, the entry scene of each
a waypoint), and the open world between: the grounds of 沉鼎观 only (`map`),
every other place refused with 「外门弟子，无令不得下山」. It ends on 「第二章 ·
即将开放」 (01-ji `coming`); the map stays this chapter's until 第二章 opens.

| Beat | Scenes (at) | Choices → mechanics |
|---|---|---|
| 入门第一课 | `wm-ahe` 阿禾 (外门, 九月初十) · `wm-jiangtang` 漏勺 (讲堂) · `wm-zhoutian` 小周天 (柴堆, 九月十七; the exit waits on the 三关 board `zhoutian-sanguan`) · `wm-qingshi` 青石 (后山) | 认账 / 什么利息 (恩 阿禾) · 能。(「多打几次」) · 一呼一吸 (scene 修为 — 小周天 is 一层) · 咬住拳头 / 喊出来 |
| (thread → spine) | `wm-yaoyuan` 小狰 (药园, 十月初十; no beat — the story carries him there after 青石) | 摊开两只手，放下萝卜: a trial bout with 狰 (duel `yaoyuan-zheng`, retry — a test, not a kill), won → the 萝卜, it sleeps at his feet, `cast: zheng` (then 周衡's 守夜 errand hands itself in at 外门: 灵石十, the 复试's price) |
| 柴房 | `wm-chaifang` 二十三下 (柴房, 十月十二夜; 古四 since 古六 folded in, 2026-10-02) · `wm-danlu` 丹炉 · `wm-diyilu` 第一炉 (十月十三, 舅舅's letter in his coat) | 护住木牌，数着 / 攥紧拳头 (体力 −5): 仇 马小宝 · 起名: 镇天神炉 · 九转金丹炉 · 乾坤一炉 纹丝不动 (greyed), 「你这饭桶」 咔哒 (`danlu`, save `furnace_name`) · the one pill: 留给爹 (the book: `mend-pill-9` into the bag for 01-tower's 老胡, half a month on a broken rib, 练气二 sat out in the 药园) / 吞下去 (branch: mends overnight, 练气二, 「爹的膝盖，欠着」 — no pill) |
| 沉鼎秘境 | `wm-mijing` 石门 (秘境石门) · `wm-wangzuo` 往左往下 · `wm-kunzhen` 困阵 · `wm-xirang` 息壤 · `wm-chu` 出秘境 | 交两块 / 不交 (冬月初一 公中, 仇) · the wall's 洛书 (`mijing-wall`) and the 蛫 in the drip-pool at its foot (duel `mijing-gui`, retry — the book's 蛫, 古七: it guards the wall, and gives way once he pours it his three days' water) · 「三天。」 (the book: he knows the 阵眼, leaves the six; 老蔫 dies the second night) / 在崖脚放一根萝卜 (branch, needs 萝卜; 古线改版 2026-10-02) · 吞下去 (`rise: 5` — 练气五层; the five doors are the book's five memories) · 今日到此 (mark `dabi-eve`) |
| 外门大比 | `wm-qianye` 大比前夜 (腊月初七 — the book's 古八 opening: 钱掌柜's board 一赔一百, 马小宝's mirror, 褚先生 checks the 修为 and he passes by 封火, the eve on the 大通铺; its exit plays 腊八粥 and 阿禾 withdrawing) · `wm-dabi` 开场 (五行台, 腊月初八) · `wm-lun1` 孙二狗 · `wm-fushi` 复试 (孙二狗 beaten, no stones, 周衡 won't pay ahead, he pawns 爷爷's bow at 钱掌柜's — the darkest hour; 古线改版 2026-10-02) · `wm-lun2` 复试 vs 秦雁 · `wm-juesai` 决赛 vs 马小宝 (the mirror caught in his palm: 圈里一横 branded) · `wm-jiaxin` 大比那夜 (周衡 settles, the bow redeemed — 阿禾's thirty 文, 孙二狗, 话分两头 赵昂 and the cracked mirror at 太华, the letter) | 上台 (no real-day wait since 2026-09-30: the eve is `wm-qianye`, with its rumour of 马家's trees) · 往后一倒 (only after 孙二狗's charm, `needs.quest`; 恩 孙二狗 → 复试) / 出手 (duel `foe-sunergou`) · 只躲，不还手 (duel `foe-shijie`, 2026-09-30: she was the final) · 学声狗叫 (duel `foe-maxiaobao` → 筑基丹; the final since 2026-09-30) · 今日到此 |
| 拜师 | `wm-baishi` 扫帚停了 (山门, 腊月十一) · `wm-caowu` 拜师帖 (后山) · `wm-heluo` 河洛剑诀 | 跟上 · 写上名字 (恩 瞿老, 《黄庭经》) · 念开篇 (《河洛剑诀》, 「……你娘，是谁？」, the broom's 徐, 「那颗丹，吃之前，先来问我」, the cup still face down) — ends |

**Threads** (quests/xu.json; people.json):

- silver 周衡 · 药园巡夜 (`xu-yaoyuan-shouye`): since 2026-09-30 the scene `wm-yaoyuan` tames 小狰 in the story, so the errand's `tame zheng` is met there and it hands itself in at 周衡. The 守夜 board below stays for its haunt (`catch: shouye`).
  Never fought — struck at, it `runs` with 银月's 「打什么打，带萝卜了没有」. The
  守夜 board (scripts/games/shouye.js): four ways in, it never comes where you
  waited nor the way it came (「它在进步」, 「贼不认字」), caught within three nights.
  Then Tame with a 萝卜 (坊市, 1 灵石). Handed in: 灵石 ten — the 复试's price.
  Then 药园残株 (`xu-yaoyuan-canzhu`): 小狰's nose, the 炼丹 board → 聚气丹.
- silver 孙二狗 · 护身符 (`xu-sun-charm`, 七巧 at the 柴房): sets up 往后一倒.
- silver 阿禾 · 利息 (`xu-ahe-lixi`, 坊市): two 萝卜 and a word to 渡口 → a 符
  for the 大比 (a card in the fight).
- pressure 马小宝: the 公中 (prologue 00-waimen, 秘境门口) and the woodshed; paid back
  in round two, 「利息，另算」.
- grey: 藏经阁 (the top floor's lock; the token's 「……九鼎……神丹……」 on arrival),
  泗水北岸's 夫诸, the 渡口 and 外门 errands, the market.

**Pace**: one sitting can play it through — no real-day wait (2026-09-30); 体力 is the only brake. Most of the realm is the story's (小周天,
息壤): no grinding gate.
