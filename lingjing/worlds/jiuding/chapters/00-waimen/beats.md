# 第一章 · 外门 — beat sheet

The script is story/jiuding-lu/03-第三回.md (the book's 第三回, once 第一章 · 外门; approved by Hanli; his plan
of 2026-09-29: 「可以，按2天做，go」, 「可以，不打，go」). On the stage each scene is
its caption (two to four lines) and its choices — no picture: a story moment is
not illustrated (his ruling, 2026-09-29; pictures are for unfamiliar knowledge,
and figures.md lists where one would help). The passage (`story`) is the
book's own, turned to 你, and Ling tells it. The prologue already played the
book's § 一 公中, so the chapter opens on the morning after, with {伴}.

**Shape** (design.md § 剧情 × 开放世界): one goal — the 外门大比, counted down on
the goal line (`goal`: 腊月初八 until 周衡's 「大比，明日」, then 明日, then 今日) —
five key beats that lock the map (chapter.json `beats`, the entry scene of each
a waypoint), and the open world between: the grounds of 沉鼎观 only (`map`),
every other place refused with 「外门弟子，无令不得下山」. It ends on 「第二章 ·
即将开放」 (01-ji `coming`); the map stays this chapter's until 第二章 opens.

| Beat | Scenes (at) | Choices → mechanics |
|---|---|---|
| 入门第一课 | `wm-ahe` 阿禾 (外门) · `wm-jiangtang` 漏勺 (讲堂) · `wm-zhoutian` 小周天 (柴堆) · `wm-qingshi` 青石 (后山) | 认账 / 什么利息 (恩 阿禾) · 能。(「多打几次」) · 一呼一吸 (scene 修为 — 小周天 is 一层) · 把拳头塞进嘴里 / 喊出来 |
| 柴房 | `wm-chaifang` 二十三下 (柴房) · `wm-danlu` 丹炉 · `wm-diyilu` 第一炉 | 护住木牌，数着 / 攥紧拳头 (体力 −5): 仇 马小宝; the girl's 猪圈 by {外门·柴房} · 起名: 镇天神炉 · 九转金丹炉 · 乾坤一炉 纹丝不动 (greyed), 「你这饭桶」 咔哒 (`danlu`, save `furnace_name`) · 吞下去 (回春丹; the 九转 lecture — 藏经阁 hook) |
| 沉鼎秘境 | `wm-mijing` 石门 (秘境石门) · `wm-wangzuo` 往左往下 · `wm-kunzhen` 困阵 · `wm-xirang` 息壤 · `wm-chu` 出秘境 | 交 / 不交 (十月初一 公中, 仇) · the wall's 洛书 (`mijing-wall`, the chapter's one puzzle) · 扔一根萝卜 (needs 萝卜) / 走 · 吞下去 (`rise: 5` — 练气五层) · 今日到此 (mark `dabi-eve`) |
| 外门大比 | `wm-dabi` 开场 (正殿前) · `wm-lun1` 孙二狗 · `wm-fushi` 复试 · `wm-lun2` 马小宝 · `wm-juesai` 决赛 | 上台 (`needs.day_after: dabi-eve` — a real day) · 往后一倒 (only after 孙二狗's charm, `needs.quest`; 恩 孙二狗 → 复试) / 出手 (duel `foe-sunergou`) · 学声狗叫 (duel `foe-maxiaobao`) · 决赛 (duel `foe-shijie` → 筑基丹) |
| 拜师 | `wm-baishi` 扫帚停了 (山门) · `wm-caowu` 拜师帖 (后山) · `wm-heluo` 河洛剑诀 · `wm-jiaxin` 家信 | 跟上 · 写上名字 (恩 瞿老, 《黄庭经》) · 念开篇 (《河洛剑诀》, 「……你娘，是谁？」, the broom's 徐) · 今日到此 — ends |

**Threads** (quests/xu.json; people.json):

- silver 周衡 · 药园巡夜 (`xu-yaoyuan-shouye`): 狰 lives at the 药园 (`catch: shouye`).
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

**Pace**: day one — beats 1–3 and the threads, 体力 about spent, 「大比，明日」;
day two — prepare, then beats 4–5. Most of the realm is the story's (小周天,
息壤): no grinding gate.
