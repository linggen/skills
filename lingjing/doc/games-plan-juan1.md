# 卷一 — the small-game lineup, 回 by 回 (revised 10-21)

Hanli 10-21: 「7个游戏可以防止阅读过长. 现在把每回的小游戏统一安排一下, 用塔防作为主力, 然后是砸寨, 割绳子, 等」, then
「塔防类只是类型, 可以安排到各种地方」 and 「宗门大比, 修士斗法都可以用塔防类代替. 也可以有我们的fight系统. fight系统更好」.
A plan, not a build. Revised by the main session's calls (his 「按你的建议来」) on the first draft (`7a9ba2b5`).

**The rules this plan keeps**
- **塔防 is a type.** It goes wherever a 回 fits it: a road where beasts catch up, a night camp, a 秘境 room, a night's
  watch. The scene frames it, the beasts are only those the book has shown by that 回 (creatures.json `hui`: 野猪 h01 ·
  狰 h05 · 犰狳 合窳 h07 · 鬿雀 猲狙 h09 · 冰夷双龙 h10), and no named person does what the book says they did not.
- **About 2 塔防 per 古回**, 守炉 (a point) and 守墙关 (lanes, a wall) taking turns, each a new and harder level.
- **6–7 boards per 古回**; the same kit never back to back; at most 2 of any other kit in a 回. 今线 stays light (no
  beasts; 0–2 boards).
- **Fights stay fights.** Duels with people — 宗门大比, 修士斗法 (蠪侄's 三试, 邹青松, 卢方, 秦雁, 马小宝, 腊八 final,
  老井) — stay on the card fight system, the preferred one. They are listed, never counted as boards. Beasts that come
  in numbers, or that he holds off to protect someone, are 塔防: the 冰夷's dragons (古九) and the 犰狳 (古七).
- **蠪侄** stays a fight: one beast on a chain, and the trial is nerve (站住四个回合). The one behind him, 石蛋, dies,
  so a 塔防 there would be a level made to lose. **犰狳** becomes 塔防: 「进，是它的嘴；退，是孙二狗的命」 — he holds it
  off a friend while 阿禾's vines bind it.
- 砸寨 still needs a throw in the book and 割绳子 something hung or delivered. Lengths are rhythm.mjs's (cap 1,500 字),
  measured on `d025bf58`.

Marks: **keep** · **new** · **swap** (same moment, another kit) · **cut** · **moved**. 炉 = 守炉, 墙 = 守墙关.

## The lineup

| 回 | # | scene | book line | kit | mark | 塔防 level (beasts) |
|---|---|---|---|---|---|---|
| **古一** | 1 | 00-shiao | 「头天夜里下过一场雨……一直下到五更天」 | 接雨 | keep | |
| | 2 | 00-shiao (after the passage) | 「这颗白菜，我种了八十一天……撵了四十回鸡」 | 塔防 墙 | new | **守白菜** — lite: one lane through the 篱笆缝, 芦花鸡 (a new row, harmless), 阿禾's 竹竿; the teacher |
| | 3 | 00-masan | 「学声狗叫，给你舔一口」 | 气走经脉 (忍字) | swap (rope → breath) | |
| | 4 | 00-fall | 「他爹的左膝盖在这里软了一下，整个人便往崖外一歪」 | 割绳子 (fallrope) | keep | |
| | 5 | 00-cave (story split at the fire) | 「火堆挡在洞口，野兽便不敢进来」 · 「守火的人不能睡」 | 塔防 炉 | new | **守火** — the cave mouth, 野猪; the fire burns down unless fed; no hero (银月 is the sick fox), 小满 tends it |
| | 6 | 00-cave (after the passage) | 「那张厚饼——沈家最后的一点白面」 | 割绳子 (bread) | keep | |
| | — | 00-yinyue | 「先带本王出去」 | 认路 (wayrope) | **cut** | |
| **古二** | 1 | 00-deer | 「先看风。」 | 砸寨 (deer-wind) | keep | |
| | 2 | 00-deer (way-on split at 「抬了一头鹿。」) | 「那副门板，到底没有白扛，抬了一头鹿。」 | 塔防 墙 | new | **抬鹿下山** — the 溪边 path at dusk, the 门板 behind the line; 野猪 drawn by the blood; 爹 and 老周 carry, 小满 holds |
| | 3 | 00-rent | 「肉二十斤，抵今年的。」 | 割绳子 (rentrope) | keep | |
| | 4 | 00-halfyear (split at 「自己穿一件单褂。」) | 「夜里坐在柴垛上，手脚也不冷了」 | 塔防 炉 | new | **雪夜柴垛** — the 柴垛 where he sits each winter night, 野猪 down from 蒙山 in the snow; more of them, at night |
| | — | 00-halfyear | 「那团光，一寸一寸地挪。然后，朝小满挪了过来。」 | 大场面 镜光 | new (approved) | |
| | 5 | 00-notice | 「心口底下那只卡了一夏天的水桶……『咯噔』一声」 | 气走经脉 (水桶落井) | keep | |
| **今一** | 1 | j01-track | 「你投一个给我看看。」 | 砸寨 (toulan) | keep | |
| | 2 | j01-retest | 先吐 | 气走经脉 | keep | |
| **古三** | 1 | 00-gate (split after the road) | 「九月初七，沈小满跟着舅舅，走在往泗水去的大路上」 | 塔防 炉 | new | **泗水路** — the road camp's fire on the way to 泗水 (three days), 野猪; the first with a party to keep (舅舅) |
| | 2 | 00-luoshu | 「横着加，竖着加，斜着加，都要一样。」 | 洛书 (the one 九宫格) | keep | |
| | | | also: 大场面 沉鼎山 · fight 蠪侄 (三试) — keep | | | |
| **古四** | 1 | wm-zhoutian | 「尾闾，夹脊，玉枕」 | 气走经脉 (小周天) | keep | |
| | 2 | wm-yaoyuan | 「天地再大，他只认得脸上的风。」 | 塔防 炉 | keep | **药园巡夜** — 野猪, 剑阵 · 火符, 4 waves (as built) |
| | 3 | wm-diyilu | 「喂它，它吐东西」 | 割绳子 (niugurope) | keep | |
| | 4 | wm-diyilu (way-on split at 「自己坐出来的。」) | 「那以后的半个月，沈小满是断着一根肋骨巡的夜」 | 塔防 墙 | new (approved) | **断肋巡夜** — 阿禾's 一尺地 in its 红线; nights as waves of 野猪; no 银月 (she has gone dark); the win is the 二层 |
| **今二** | 1 | j04-line | 吸四吐六 | 气走经脉 (罚球) | keep | |
| **古五** | 1 | wm-wangzuo (split at 「还没长牢。」) | 「他顺着崖壁往下爬。」 | 塔防 墙 | new | **凶崖** — a 秘境 ledge on the way down, 犰狳 up the rock, 合窳 the 大妖 (隔空指点, the plain jab) |
| | 2 | wm-wangzuo | 「打不过的，不打。给它下坠子。」 | 割绳子 (坠) | swap (fight → board, approved) | |
| | 3 | wm-kunzhen | 「正中那一个是空的」 | 五子棋 (困阵) | keep | |
| | 4 | wm-anhe | 「葫芦一开，就有光。」 | 砸寨 (anhe-dark) | keep | |
| | 5 | wm-kaikai | 「你推着它们走一圈。」 | 气走经脉 (息壤) | keep | |
| | 6 | wm-chu (split at 「是孙二狗。」) | 「他掉头往回走，走到那块第三石板跟前，一脚踩了上去，掉进了坑里。」 | 塔防 炉 | new | **坑底** — the pit under the 第三石板 before the door shuts, 孙二狗 the one kept; 犰狳 · 合窳 come to the rim until 秦雁's 剑鞘 |
| | | | also: fight 邹青松 · 大场面 二十三下 — keep | | | |
| **古六** | 1 | wm-qianye | 「扔一回，丹田便空一截」 | 砸寨 (讲堂试法; 结印 teaching where a camera is) | keep | |
| | 2 | wm-qianye (after the passage) | 「小满五样都学了……哪一样，都扔得出来。」 (the month he still walks the 药园) | 塔防 墙 | new | **腊月巡夜** — the 药园 in the snow; the 五法 join 隔空指点; 犰狳 · 合窳 the 大妖 |
| | 3 | wm-zhaojing | 「照妖，照妖……」 | 气走经脉 (藏息) | keep | |
| | 4 | wm-dabi | 「一拳当胸打过来」 | 喷嚏符 | keep | |
| | 5 | wm-laoyin (end of the passage) | 「火弹、冰锥、金刃撞上去……弹了开去。」 | 砸寨 | new (approved) | |
| | 6 | wm-jiaxin (split at 「是有点漏。」) | 「今晚火锅——耶～～」 | 塔防 炉 | new | **火锅夜** — the 柴墩 and its 漏 锅, 野猪 · 狰 drawn by the 牛脂甘露; 银月 awake, the hero again |
| | 7 | wm-jiaxin | 「娘，我倒了七回，起来了七回。」 | 家信 (你画我猜) | keep | |
| | | | also: 大场面 底册 · fights 卢方 · 秦雁 · 马小宝 — keep | | | |
| **今三** | 1 | j07-dark | 领着喘 | 气走经脉 (黑地十一步) | keep | |
| **古七** | 1 | 09-jiuge | 「这叫禹步。」 | 禹步 | keep | |
| | 2 | 09-furnace | 「好容易熬到开了春，药园开了园。」 | 塔防 墙 | keep | **开春** — 野猪 · 狰 (as built) |
| | 3 | 09-year (split at 「一股脑喂了进去。」) | 「他从药园的篮子里倒出两根紫玉参的断须」 | 割绳子 (喂饭桶) | new | |
| | 4 | 09-lingcao | 「进，是它的嘴；退，是孙二狗的命。」 | 塔防 炉 | swap (fight → board) | **灵草谷** — the 田埂 at night, 孙二狗 the one kept, 犰狳 the 大妖 with its 装睡 (plain blows glance) |
| | 5 | 09-yishui | 「它眼里只有那一团亮，和亮底下那块板子」 | 砸寨 (yishui-reed) | keep | |
| | | | also: 大场面 扔了干净 · fight 秦雁 (崖顶) — keep | | | |
| **古八** | 1 | 09-dabi | 「替丹房的闵丹师看炉、碾药」 | 塔防 炉 | keep | **丹房看炉** — 野猪 · 鬿雀, 雷符 from wave 3, 5 waves |
| | | | also: 腊八 final · 大场面 筑基 — keep | | | |
| **今四** | 1 | j09-final | 带着怕投 | 气走经脉 (最后一罚) | keep | |
| **古九** | 1 | 01-arrive (split after 瞿老's sixteen words) | 「第十天，十月初七傍晚，三人到了漳水边上。」 | 塔防 炉 | new | **邺城路** — ten days' road, the camp of three (阿禾 · 周衡), 鬿雀 · 猲狙 · 野猪 |
| | 2 | 01-altar (way-on split at 「拖上了岸。」) | 「一根青藤从她袖口里钻出去，缠住了岸边一株老柳的根……小满赶忙跳下去接应」 | 割绳子 | new | |
| | 3 | 01-rise | 「从他两边绕过去，直扑他身后的河岸。豆腐西施站在那里」 | 塔防 墙 | swap (fight → board, approved) | **漳水立起** — the bank the wall, 豆腐西施 behind it, 浪头 down the lanes, 双龙 the 大妖 (隔空指点 + 五法); held, the dragon touches his forehead and draws back. The hardest |
| | | | also: fight 老井 · 大场面 张 (three) · the seal (a riddle) — keep | | | |

Building notes: a board hangs on a scene, so every "split" above is a scene split the wm-anhe way, or a scene's
second board after its `story_after` (守白菜, 喂饼, 腊月巡夜). 守火 moved before 喂饼 onto the earlier fire line, so the two
割绳子 of 古一 no longer sit back to back. 「他把她扔进了漳水里」 stays told; the rope level is the hauling out.

## Counts

| 回 | 塔防 | 砸寨 | 割绳子 | 气走经脉 | other | boards | fights · 大场面 |
|---|---|---|---|---|---|---|---|
| 古一 | 2 | – | 2 | 1 | 接雨 | **6** | – · 2 |
| 古二 | 2 | 1 | 1 | 1 | – | **5** | – · 1 |
| 今一 | – | 1 | – | 1 | – | **2** | – |
| 古三 | 1 | – | – | – | 洛书 | **2** | 1 · 1 |
| 古四 | 2 | – | 1 | 1 | – | **4** | – |
| 今二 | – | – | – | 1 | – | **1** | – |
| 古五 | 2 | 1 | 1 | 1 | 五子棋 | **6** | 1 · 1 |
| 古六 | 2 | 2 | – | 1 | 喷嚏符 · 家信 | **7** | 3 · 1 |
| 今三 | – | – | – | 1 | – | **1** | – |
| 古七 | 2 | 1 | 1 | – | 禹步 | **5** | 1 · 1 |
| 古八 | 1 | – | – | – | – | **1** | 1 · 1 |
| 今四 | – | – | – | 1 | – | **1** | – |
| 古九 | 2 | – | 1 | – | – | **3** | 1 · 3 |
| **卷一** | **16** (3 →) | **6** (5 →) | **7** (6 →) | **9** (8 →) | 6 | **44** (28 →) | 9 fights |

No kit back to back anywhere in the 卷, inside a 回 or across one. Under 6 boards: 古二 5 · 古三 2 · 古四 4 · 古七 5 ·
古八 1 · 古九 3 — each limited by the mix rule (a third 塔防 or a second rope would sit next to its twin) or by the book (no
throw, nothing hung). 兽潮 at 沉鼎观 carries the 塔防 volume from 古四 on. **撒豆成兵** stays a candidate: if its defence v2
wins his comparison, it is the obvious 5th board for 古四 (wm-qingshi, 后山 at night: 「墙外是后山，他一口气冲了上去」).

## The 塔防 ladder

| # | level | 回 | kit | beasts | what makes it harder |
|---|---|---|---|---|---|
| 1 | 守白菜 | 古一 | 墙 lite | 芦花鸡 | the teacher: one lane, no loss but leaves |
| 2 | 守火 | 古一 | 炉 | 野猪 | the fire is the hp and burns down; no hero |
| 3 | 抬鹿下山 | 古二 | 墙 | 野猪 | dusk, two lanes along the 溪 |
| 4 | 雪夜柴垛 | 古二 | 炉 | 野猪 | night, snow slows his towers |
| 5 | 泗水路 | 古三 | 炉 | 野猪 | a party to keep (舅舅) besides the fire |
| 6 | 药园巡夜 | 古四 | 炉 | 野猪 | as built: 4 waves, hpMul 2.6 |
| 7 | 断肋巡夜 | 古四 | 墙 | 野猪 | no 银月; nights as waves |
| 8 | 凶崖 | 古五 | 墙 | 犰狳 · 合窳 (大妖) | the first armour and the first 大妖; 隔空指点 the plain jab |
| 9 | 坑底 | 古五 | 炉 | 犰狳 · 合窳 | the kept one cannot move; a timer (the 秘境's door) |
| 10 | 腊月巡夜 | 古六 | 墙 | 野猪 · 狰 · 犰狳 · 合窳 (大妖) | the 五法 arrive; mixed fast and armoured |
| 11 | 火锅夜 | 古六 | 炉 | 野猪 · 狰 | 银月 back as hero; leaping 狰 in numbers |
| 12 | 开春 | 古七 | 墙 | 野猪 · 狰 | as built (sims: human 37/40) |
| 13 | 灵草谷 | 古七 | 炉 | 犰狳 (大妖, 装睡) | a 大妖 that feints; plain blows glance |
| 14 | 丹房看炉 | 古八 | 炉 | 野猪 · 鬿雀 | as built: flyers, 雷符 from wave 3, 5 waves |
| 15 | 邺城路 | 古九 | 炉 | 鬿雀 · 猲狙 · 野猪 | flyers and fast biters together |
| 16 | 漳水立起 | 古九 | 墙 | 浪头 · 冰夷双龙 (大妖) | the last: water lanes, two 大妖, 隔空指点 + 五法 |

New beast rows: 芦花鸡 (古一) and 浪头 · 双龙 (古九). 狼 and 熊 have no `hui`, so no story level fields them.
**隔空指点** (Hanli 10-21, approved): the camera extra on a 守墙关 level with a 大妖 — 凶崖 (古五, the plain jab), 腊月巡夜
(古六, the 五法 join) and 漳水立起 (古九), plus the dailies (守山门, 合窳夜). Not a board.

## Reading cap (1,500 字)

| stretch | now | with the plan |
|---|---|---|
| 00-shiao → 00-masan (古一) | 1,081 | 640 · 441 |
| 00-fall → 00-yinyue (古一) | 1,241 · 815 | 1,198 · 43 · 815 |
| 00-yinyue{tengyun} → 00-deer (古一, 认路 cut) | 264 · 1,457 | **1,721** |
| 00-deer → 00-rent (古二) | 1,206 | 322 · 884 |
| 00-rent → 00-notice (古二) | **6,080** | **3,385** · 1,185 · **1,510** (雪夜柴垛, 大场面 镜光) |
| j01-retest → 00-gate{chending} (今一 → 古三) | 811 | 768 · 43 |
| wm-diyilu → j04-line (古四 → 今二) | **6,808** | **1,898** · **4,910** (断肋巡夜; the second is 今二's gym) |
| j04-line → wm-wangzuo (今二 → 古五) | **4,668** | **4,246** · 422 (凶崖, then the 蛫) |
| wm-chu{ershisan} → wm-qianye (古五 → 古六) | **2,831** | 428 · **2,403** (坑底) |
| wm-qianye → wm-zhaojing (古六) | 789 | 575 · 214 |
| wm-juesai/face → wm-jiaxin (古六) | **3,414** | **1,571** · **1,654** · 189 (决赛, 火锅夜) |
| 09-furnace → 09-lingcao (古七) | **2,175** | **1,564** · 611 |
| j09-final → 01-altar (今四 → 古九) | **4,689** | **2,092** · **1,873** · 724 (邺城路, 捞巫祝) |

卷一 over the cap: 27 stretches → 32, but the 字 past the cap fall **38,387 → 29,049** and the longest read **6,808 →
4,910**. Still over, and why: 古一's 3,686 (村口 → 黑松岭, 古一 decided at 6) · 古三's 2,571 · 3,018 (the climb; 石蛋 and
测灵) · 古四's 2,035 · 2,968 · 2,552 (a 塔防 in each would make three in a row with 药园巡夜 and 断肋; the 柴房 beating) ·
古五's 2,170 (the fight's telling) · 古六's 1,651 · 1,635 · 古七's 1,893 · 1,619 (银月 burns herself at the 渡口) ·
古八's 1,625 · 3,051 (回家) · 古九's 2,164 · 1,746 (老胡; 柳湾) · 今线's (3,694 · 2,348 · 2,928 · 2,888; modern day, breath
only).

## For Hanli — three questions

1. **忍字 as 气走经脉 makes 9 breath levels**; the 调息 cut held them at 8. (Kept as rope, 古一 would have three 割绳子.) —
   *Recommend: accept 9.*
2. **Before 入门 the plan adds three more boards** (抬鹿下山, 雪夜柴垛, 泗水路, on top of the decided 守白菜 · 守火 and the
   认路 cut): thirteen 古 boards before 入门, against the 10-16 「减少数量, 推动剧情」. They pay nothing there. — *Recommend: yes; they break the
   prologue's longest reads.*
3. **古八 stays at one board.** A second 塔防 (a 揭牌 on the 后山, 猲狙) would sit next to 看炉 with only reading between,
   and the rest of 古八 is 回家 and 筑基. — *Recommend: keep one; 兽潮 and the 腊八 final carry it.*
