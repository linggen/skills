# 外门 · 古五至古八 — beat sheet

The script is story/jiuding-lu/04-第四回.md … 06-第六回.md (the book's 古四 to 古六 — 古五 to 古八 before the 2026-10-02 renumbering, once 第一章 · 外门, then 第三回 until 卷一 was split into ten on 2026-09-30; approved by Hanli; his plan
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
| (thread → spine) | `wm-yaoyuan` 小狰 (药园, 十月初十; no beat — the story carries him there after 青石) | 摊开两只手，放下萝卜: a trial bout with 狰 (duel `yaoyuan-zheng`, retry — a test, not a kill), won → the 萝卜, it sleeps at his feet, `cast: zheng` (then 周衡's 守夜 errand hands itself in at 外门: 灵石十) |
| 柴房 | `wm-chaifang` 二十三下 (柴房, 十月十二夜; 古四 since 古六 folded in, 2026-10-02) · `wm-danlu` 丹炉 · `wm-diyilu` 第一炉 (十月十三, 舅舅's letter in his coat) | 护住木牌，数着 / 攥紧拳头 (体力 −5): 仇 马小宝 · 起名: 镇天神炉 · 九转金丹炉 · 乾坤一炉 纹丝不动 (greyed), 「你这饭桶」 咔哒 (`danlu`, save `furnace_name`) · the one pill: 留给爹 (the book: `mend-pill-9` into the bag for 01-tower's 老胡, half a month on a broken rib, 练气二 sat out in the 药园) — one way only, the book's (the 吞下去 branch was cut with 一夜伤好); 十月廿八 盘账: 褚先生 finds the bone unhealed |
| 沉鼎秘境 | `wm-mijing` 石门 (秘境石门) · `wm-wangzuo` 凶崖往下 · `wm-kunzhen` 困阵 · `wm-xirang` 息壤 · `wm-kaikai` 开开 (第二夜, 老蔫's death — its own panel since 2026-10-02; the call is now 「沈小满——」 once, the id stays) · `wm-chu` 出秘境 | 交两块 / 不交 (冬月初一 公中, 仇) · the 蛫 at the wall's foot (古五, 2026-10-02: no 洛书 board — the 蛫 is the latch): 硬撬 (`pry`, snubbed in-world: it bites, the wall stays shut, mark `mijing-pry`) / 把水倒给它 (`open`, duel `mijing-gui`, retry — he turns it over, pours it his three days' water, it crawls into its hollow and the wall opens) · 「三天。」 (the book: he knows the 阵眼, leaves the six; 老蔫 dies the second night; the 萝卜 branch cut, 修改单-片三 2026-10-02) · 不藏了 (古五 2026-10-02: the chase — duel `mijing-zou` vs `foe-zou` 邹青松, a trial outlasted, retry; 踏马的符 `tama-fu` — the 饭桶 spat it out in 古四 for one of 银月's hairs, he never tried it and kept it in his belt fold (2026-10-02: 「这个用完就没了，留在秘境里用。」); the bag gets it at `wm-wangzuo` `open` (one item per exit, 古四's two are taken) — is a one-use charm card that calls the 蛫 as a 护主 against his 杀招 四蛇合围; the turn — the leap, 银月's two hairs, his knife — is the exit's passage; then `rise: 4` — 练气四层: 银月 has him sit in the 息壤 among the four 鼎坑 (planted, not eaten, 2026-10-03; the exit id stays `swallow`), the five doors are the book's five memories; 杀人必摸尸 (2026-10-03): the win drops 邹青松's 储物袋 (foe-zou `drops`: 下品储物袋, 赤铜葫芦, 敛息符 ×2, 回春丹 ×3, 龙须草, 紫须芝, the letter; `card` 火鸦), the exit grants the 短刀 `duan-dao`, the 钱袋's 9 灵石, the 回气丹 card and `more` — the dead 九层's 聚气丹 ×5 and 内门图, the 鼎苔 scraped clean (3). 阿禾's 话分两头 now plays inside wm-xirang's passage, before 邹青松 reaches the wall (time order)) · 没有动 (the book: 「沈小满——」, he sits buried to the chest in the growing 息壤 — 土一破，须子便断; 老蔫's qi ebbs first and the 阵 keeps only his robe; he climbs and falls; the climb out of the earth closes this exit's passage) · 今日到此 (mark `dabi-eve`; no notebook line — only 阿禾 writes, 2026-10-03; 马小宝's 「拴在一根绳上」 carries the 孟有田 debt) |
| 宗门大比 (内门外门一起比; the bracket rebuilt 2026-10-03 to the book) | `wm-qianye` 大比前夜 (腊月初七 — 钱掌柜's board 一赔一百, he hefts the bow: 「这木头……我叫不出名字……一个名字，我照价收」 — no pawn; 马小宝's mirror, 褚先生 checks the 修为 (四层), the five plain spells taught that month, the eve on the 大通铺; its exit plays 腊八粥 and 阿禾 withdrawing) · `wm-dabi` 开场 (五行台, 腊月初八; the plain 擂台 rules — off the stage / yield / the 执事 judges you can't go on, at half-incense the 执事 judges 上风, no killing, 前四 into the 内门名册, 头名 the 筑基丹; the 观主 arrives; its exit plays R1, 外门 何七 off the stage at a push) · `wm-lun1` 孙二狗 vs 内门六层 卢方, watched (he stays below — a step up would put him out — then pulls 孙二狗 up from the steps: 恩 孙二狗) · `wm-fushi` R2 vs 卢方 (金刃/土墙; fire for show, wood eats earth; the third palm cracks his rib, hanging from the rim with his hand ground underfoot he waits for the wind and flips him off by the ankle) · `wm-lun2` R3 vs 秦雁 (her 法器 sword, 冰锥; thirty moves, the thunder talisman never drawn; the thrust taken through his left arm, her scabbard seized, she lands off first) · `wm-juesai` 半决 vs 马小宝 (a crude 火弹 doused; he watches the 斑, not the mirror, circles, reads the 公中 at every dodge with the outer court counting along; cornered at the edge he catches the last beam bare-handed, 马小宝 collapses drunk dry, 马三 turns away on the boat) · `wm-laoyin` 掌心 (圈里一横 branded, 「……你拿手接了」); its exit `final` is the 决赛 vs 祁长松 (九层, 土 rooting, 土盾 eats his spells, 「我不碰你」) told as a passage — the palm taken at the last finger of incense, the 猪蜻蜓 slapped on his back, both flown into the two 柏; 祁 lands on one foot on the edge, he hangs upside down in the west 柏: 「……祁长松，胜。」 — a LOSS, no 筑基丹 · `wm-jiaxin` 大比那夜 (the pill to 祁长松, 观主 「前四，进内门名册」, 瞿老's long look at the box, 褚先生 「掌上那个，不是反噬」; 周衡 settles 「另议」 ten stones; 阿禾's one 文 lost — 「一文。利息另算。」; 孙二狗 「倒了七回，起来了七回」 and the letter; 银月's one overheard line from the cracked mirror: 「叫徐州那个，十月去邺城等着。」) | 上台 (no real-day wait: the eve is `wm-qianye`) · 攥着拳，不跨 (`hold`, 恩 孙二狗) · 看他的脚，等风 (`flip`, duel `foe-lufang`, retry) · 看她的脚，撑过三十招 (`dodge`, trial `foe-shijie`, outlasted) · 看他的脸，报公中的账 (`face`, duel `foe-maxiaobao`) · 攥着拳上台 (`final`, a passage; grants nothing) · 今日到此 |
| 拜师 | `wm-baishi` 扫帚停了 (山门, 腊月十一) · `wm-caowu` 拜师帖 (后山) · `wm-heluo` 河洛剑诀 | 跟上 · 写上名字 (恩 瞿老, 《黄庭经》) · 念开篇 (《河洛剑诀》, 「……你娘，是谁？」, the broom's 徐, 「筑基丹，你没拿着。」「想拿么？」「想。」「……拿着了，吃之前，先来问我。」, the cup still face down) — ends |

**Threads** (quests/xu.json; people.json):

- silver 周衡 · 药园巡夜 (`xu-yaoyuan-shouye`): since 2026-09-30 the scene `wm-yaoyuan` tames 小狰 in the story, so the errand's `tame zheng` is met there and it hands itself in at 周衡. The 守夜 board below stays for its haunt (`catch: shouye`).
  Never fought — struck at, it `runs` with 银月's 「打什么打，带萝卜了没有」. The
  守夜 board (scripts/games/shouye.js): four ways in, it never comes where you
  waited nor the way it came (「它在进步」, 「贼不认字」), caught within three nights.
  Then Tame with a 萝卜 (坊市, 1 灵石). Handed in: 灵石 ten.
  Then 药园残株 (`xu-yaoyuan-canzhu`): 小狰's nose, the 炼丹 board → 聚气丹.
- silver 孙二狗 · 护身符 (`xu-sun-charm`, 七巧 at the 柴房): the charm he wears into the 大比 (its string snaps under 卢方's seven falls).
- silver 阿禾 · 利息 (`xu-ahe-lixi`, 坊市): two 萝卜 and a word to 渡口 → a 符
  for the 大比 (a card in the fight).
- pressure 马小宝: the 公中 (prologue 00-waimen, 秘境门口) and the woodshed; paid back
  in the semi-final, the 公中 read out line by line.
- grey: 藏经阁 (the top floor's lock; the token's 「……九鼎……神丹……」 on arrival),
  泗水北岸's 夫诸, the 渡口 and 外门 errands, the market.

**Pace**: one sitting can play it through — no real-day wait (2026-09-30); 体力 is the only brake. Most of the realm is the story's (小周天,
息壤): no grinding gate.
