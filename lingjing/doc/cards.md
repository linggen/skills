# 斗法小队与卡牌出处 (卷一)

For Hanli's read (2026-10-16). **Built the same day** (「按文档全部照做」) — see § 0 for where the build differs from the plan below.

## 0. As built (2026-10-16)

- **Data.** Every card's 出处 is `from` in `worlds/jiuding/cards.json` (each source marked 书 or 游戏, with its one line); `owner` says which member plays it; the party is `worlds/jiuding/party.json`. The content lint refuses a card with no 出处 or a source that does not exist.
- **The book's names are new ids**, not renamed rows: 冰锥 `bingzhui`, 金刃 `jinren`, 土墙 `tuqiang`, 入隙 `ruxi`, 吐纳 `tuna`, 木草泥马 `mucao`, 痒痒针 `yangzhen`, 短飞剑 `feijian`, 火柴 `huochai` (火), 一箭 · 偏左半寸 `yijian`, 冰锥符 `bingzhuifu`, 镇岳符 `zhenyuefu`, 青光 `qingguang`, 山根桩 `shangen`, 铁箍板 `tiegu`. The old rows (水雾, 金爪, 土偶 …) stay as the beasts' own, so no beast's twelve cards changed; an old save's cards map to the new ids (`_renamed`, state.mjs).
- **Granting:** a scene left gives its `story` cards; a board won its `beat` card (射鹿 → 一箭, 吹鹅毛 → 吐纳); a beast beaten its own card, never one at random (a 机缘 gives none); 钱掌柜 sells 短飞剑 (60), 五雷符 (60, a 符 spent when played) and 参悟玉简 (80).
- **No starter at the 灵根 test.** The 三试 is a 试 of nerve: stand four of 蠪侄's turns, with a free 一滚 (dodge) and 石子; 蠪侄 holds one 碎金 (lookahead 90/10). Under ten held, a card goes in twice.
- **Pools gated:** the 蒙山 and 林子 beasts come from 第四回 (h05): with three cards, the 古三 pools were all-or-nothing. 狰 at the 药园 is won with the 萝卜 (no fight). 秦雁's two 试 are passed by standing (seven and eight turns). Every fight re-weighed by 气血 (`tools/reweigh.mjs`).
- **Party:** 银月 is a member who walks with him from 卷二; in 卷一 she sleeps in the 木牌 and is in no fight. The lead's 退 ends the fight (a member's only takes their cards out).
- **Not built:** the § 3 gap cards beyond 木藤 (短刀, 随风, 禹步, 喷嚏符, 猪蜻蜓, 自拍镜, 牛脂甘露, 遁符; 阿禾's 荆棘, 金疮膏; 分饼).

**In short.** In 卷一, 小满 fights alone in most of 第一回 to 第六回. The exception is 第五回: against 邹青松, 阿禾 helps from a crack in the wall. 孙二狗 joins for the 第七回 errands, and from 第八回 it is only 小满 and 阿禾. 银月 sleeps in the 木牌 and strikes once, in 第五回.

Of the 68 cards in `cards.json`:
- **20 are 小满's:** 6 arts the book gives him, 9 things he can use (符, weapons, pills), and 5 game-only arts won from beasts or bought.
- **12 belong to party members:** 9 to 阿禾, 2 to 孙二狗, 1 to 银月.
- **23 are 灵宠:** 2 from the book in 卷一 (狰, and 蛫 through the 踏马符), 5 small beasts won in fights, and 16 that wait for later 卷.
- **5 are beast-only or tokens.**
- **8 are misfits:**
  - 2 are other people's arts: 邹青松's 燎原, which stays his, and 秦雁's 五雷, which comes back as a 五雷符 he buys.
  - 6 have no owner in the book. Each gets a game source (a beast's reward), so none is cut.

**Starters:** before the 三试, 小满 holds only things and lessons (娘的饼, 一箭 · 偏左半寸, 吐纳), and every spell is taught in 第六回. So his first hand grows by twos and threes up to 第六回 (§ 4), not twelve cards at the 灵根 test.

Several cards want renaming to the book's word: 水雾→冰锥, 金爪→金刃, 土偶→土墙, 碎金→入隙, 小妖→木草泥马, 金针雨→痒痒针, 金梭→短飞剑, 剑影→火柴, 山精→山根桩, 鼓皮→铁箍板.

Sources are marked **书** (the book says it) or **游戏** (game-only: a shop or a fight reward). Every card is gained before it can be played. Quotes are from `story/jiuding-lu/0N-第N回.md`.

## 1. 斗法小队, 回 by 回

| 回 | Beside 小满 | Book |
|---|---|---|
| 第一回 | no fight; 爹 on the hunt | 「每走一百步，我在树上刻一道记号」 |
| 第二回 | 银月 as a voice only; the deer shot | 「往左偏半寸。」 |
| 第三回 | alone (三试 · 蠪侄): he rolls and throws a stone | 「往右一滚」 |
| 第四回 | no fight; 狰 is won with a 萝卜, not fought | 「把一根萝卜放在它面前」 |
| 第五回 | alone vs 蛫; vs 邹青松, **阿禾** from the wall crack, and **银月** strikes once | 「拔下两根毛」 |
| 第六回 | 大比, every bout alone | — |
| 第七回 | errands: **小满 + 阿禾 + 孙二狗** (犰狳, 鯥) | 「一年里他们揭的第七块牌」 |
| 第八回 | **小满 + 阿禾** (合窳) | 「孙二狗没有来」 |
| 第九回 | 双龙: alone, dodging; 老井: **小满 + 阿禾's roots** | 「沿着河岸一棵一棵埋下的藤」 |

The members:

| Member | 灵根 | Role on the board | Book |
|---|---|---|---|
| 小满 | 五行杂灵根 | attacks: 褚先生's five arts, 掐诀, 瞿老's 巽 (随风 · 入隙), the sword 火柴 | 「火弹、冰锥、金刃、木藤、土墙」(六) |
| 阿禾 | 木天灵根 | heals and binds, with 《阴符经》; also throws 师父's three 符 | 「观天之道，执天之行」(五) |
| 孙二狗 | 零层的杂灵根 | the wall: 山根桩 behind his iron-hooped board; he draws the hits | 「我是山……我是山……」(七) |
| 银月 | — | asleep in the 木牌 through 卷一; one strike (第五回) | 「本王是补锅匠」(四) |

## 2. Every card, by owner

Columns: card id · name → what it does → 出处 (where and when gained) · 书/游戏 · evidence.

### 2.1 小满's own arts: 6 (the book's)

| Card | Does | 出处 | | Evidence |
|---|---|---|---|---|
| huodan 火弹术 | 2费 火 3 dmg | 第六回 wm-qianye, 褚先生 teaches | 书 | 「丙丁涌出，聚炁成丸」 |
| shuiwu 水雾 → **冰锥** | 1费 水 2 dmg | 第六回 wm-qianye, 褚先生 (rename) | 书 | 「冰锥最快」 |
| jinzhua 金爪 → **金刃** | 2费 金 3 dmg | 第六回 wm-qianye, 褚先生 (rename) | 书 | 「又是一道金刃」 |
| tuou 土偶 → **土墙** | 1费 0/3 护主 | 第六回 wm-qianye, 褚先生 (rename) | 书 | 「身前拱起一片土墙」 |
| suijin 碎金 → **入隙** | 4费 金 5 dmg | 第七回 09-futian, 瞿老 at 七层 | 书 | 「石头也有缝。」 |
| wudao 悟道 → **吐纳** | 1费 draw 2 | 第二回 00-sleep, 银月's 《吐纳经》; won on the 吹鹅毛 beat (feather-breath) | 书 | 「吐是踩刹车」 |

Note: 小满's own 木藤 is missing. 青藤缚 is 阿禾's. See § 3.

### 2.2 小满's usable things (符 · weapons · pills): 9

| Card | Does | 出处 | | Evidence |
|---|---|---|---|---|
| huiqi 回气丹 | 2费 heal 5 | 第五回 wm-xirang (game grant today). The book's 回气丹 restores 灵力, so either change it to +灵力 or rename it **回春丹**; 第七回 09-furnace gives the recipe | 书 | 「丹田空了吞一颗」 |
| xiaoyao 小妖 → **木草泥马** | 1费 1/2 | 第四回 wm-diyilu, from the 饭桶 | 书 | 「认主。性烈，莫近火」 |
| jinzhen 金针雨 → **痒痒针** | 3费 sweep 2 | 第六回 wm-zhaojing, from the 饭桶 | 书 | 「痒痒针；一针见笑」 |
| jinsuo 金梭 → **短飞剑** | 1费 2/1 | 第七回 09-yishui, 钱掌柜's shop (in-game ≈ 60 灵石) | 书 | 「一拃来长，柳叶形」 |
| jianying 剑影 → **火柴** | 4费 5/3 | 第七回 09-snow, from the 饭桶 (the book's sword is fire; set the element to 火) | 书 | 「剑起火升，攻守兼备」 |
| huoya 火鸦 | 2费 3/1 | 第五回 wm-xirang: 邹青松's 赤铜葫芦 (the creature's `card` today) | 书 | 「一条火蛇扑了过来」 |
| luying 鹿影 → **一箭 · 偏左半寸** | 2费 3/2 | 第二回 00-deer, 爷爷的弓, won on the deer-wind beat | 书 | 「往左偏半寸。」 |
| talisman 符 | 1费 3 dmg, spent | the 货郎's stall (观内), 20 灵石 | 游戏 | 钱掌柜's 符箓 are canon |
| tama-fu 踏马符 | 1费 summons 蛫 | 第五回 wm-diyilu, from the 饭桶 (an item today) | 书 | 「足下一踏，马上便走」 |

### 2.3 小满's game-only arts (fight reward or shop): 5

| Card | Does | 出处 | |
|---|---|---|---|
| jixiao 饥啸 | 1费 +2 atk | won from 野猪 (its deck plays 3) | 游戏 |
| tunshi 吞噬 | 3费 土 5 dmg | won from 蝮蛇 (plays 3) | 游戏 |
| leiming 雷鸣 | 3费 木 4 dmg | won from 妴胡 (plays 2) | 游戏 |
| zhennu 震怒 | 4费 木 sweep 3 | won from 犰狳, 第七回 09-lingcao (the story fight) | 游戏 |
| canwu 参悟 | 3费 draw 3 | 钱掌柜's shop, a 玉简, ≈ 80 灵石 | 游戏 |

Spells won from a fight follow one rule: the beast was fighting with it, and he takes it after the win (杀人必摸尸, like 火鸦 from 邹青松). Each beast names its card, so nothing is random.

### 2.4 阿禾: 9 (her cards, played by her on the board)

| Card | Does | Her moment | | Evidence |
|---|---|---|---|---|
| qingteng 青藤缚 | 1费 木 2 dmg, binds | 第五回 vs 邹青松 · 第七回 犰狳 | 书 | 「一根藤」 · 青藤 (五 · 七 · 八) |
| tengmiao 藤苗 (+ 藤须 token) | 1费 1/1 + a 1/1 | 第五回: grains thrown into the crack | 书 | 「一粒一粒炸开了芽」 |
| chunsheng 春生 | 3费 three 藤须 | 第五回 | 书 | 「青藤一根挨一根」 |
| hantan 寒潭指 → **冰锥符** | 3费 水 4 dmg | 第五回, 师父's second 符 (高阶) | 书 | 「冰锥符，高阶的」 |
| luoshi 落石术 → **镇岳符** | 4费 土 5 dmg | 第五回, 师父's last 符 | 书 | 「画的是一座山」 |
| hanquan 寒泉 → **青光** | 3费 2/3, heal 3 | 第五回 · 第七回: her heal (loose) | 书 | 「观天之道，执天之行」 |
| peiyuan 培元 | 1费 +1/+1 | her heal on one member (loose) | 书 | 「指尖上一点青光」 |
| fengmao 风茂 | 3费 all +1/+1 | 第九回: the roots along the river (loose) | 书 | 「全长成了根」 |
| linmu 林母 | 5费 3/5, all +1/+1 | 第九回, the same (loose) | 书 | 「全长成了根」 |

### 2.5 孙二狗: 2

| Card | Does | His moment | | Evidence |
|---|---|---|---|---|
| shanjing 山精 → **山根桩** | 2费 1/4 护主 | 第七回 犰狳 | 书 | 「叫『山根桩』」 |
| gupi 鼓皮 → **铁箍板** | 2费 0/5 护主 | 第七回: his pine board | 书 | 「钉了三道铁箍」 |

### 2.6 银月: 1

| Card | Does | 出处 | | Evidence |
|---|---|---|---|---|
| yinyue 银月 | 2费 3/4, heal 2 | She becomes a party member, not a card, once the party lands. She sleeps through 卷一; her one strike is 第五回 | 书 | 「拔下两根毛」 |

### 2.7 灵宠 (收服所得): 23

**卷一:**

| Card | Does | 出处 | |
|---|---|---|---|
| zheng 狰 | 2费 2/2, draw | 第四回 wm-yaoyuan: 小狰 follows him (won with a 萝卜) | 书 |
| gui 蛫 | 3费 2/5 护主 | Not tamed in the book (it is the 门闩). Comes only through the 踏马符 jump, 第五回 | 书 |
| xianshi 衔石 | 1费 1/2 | won from 从从 (后山崖顶) | 游戏 |
| leipu 雷仆 | 2费 2/2 | won from 猕猴 | 游戏 |
| tongling 童灵 | 2费 2/2, draw | won from 赤狐 | 游戏 |
| jingang 金刚 | 5费 3/7 护主 | won from 狼 (elite) | 游戏 |
| shishou 石兽 | 4费 3/6 护主 | won from 精精 | 游戏 |

**Later 卷 (tamed in their own 卷, `creatures.json juan`):** 精卫 (2) · 狍鸮 (2) · 雷神 (2) · 无支祁 (4) · 夔 (3) · 狪狪 (3) · 防风氏 (5) · 长右 (5) · 巴蛇 (6) · 夔牛 (7) · 窃脂 (7) · 肥遗 (8) · 羬羊 (8) · 泰逢 (9) · 马腹 (9) · 夫诸 (9). These 16 are 游戏 until those 卷 are written.

### 2.8 Beast-only and tokens: 5

| Card | Whose |
|---|---|
| longzhi 蠪侄 | 第三回's trial beast. Not tamed in the book, so not his |
| jiushou 九首 | 蠪侄's heads, summoned by its 九首齐出 |
| shewei 蛇尾抽 · niaohui 鸟喙啄 | 犰狳's own blows |
| tengmiao_token 藤须 | 阿禾's 藤苗 token (listed with her) |

### 2.9 Misfits in 小满's hand: 8

| Card | Why | Proposal |
|---|---|---|
| fenghuo 燎原 | 邹青松's art: 「火出来，分成了四股」 | Foe-only (his deck). Not 小满's |
| wulei 五雷法 | 秦雁's 雷符, which she never throws | Make it a **五雷符** at 钱掌柜's, ≈ 60 灵石 (游戏), spent when played |
| liaotian 燎天 | a 6-cost fire spell; nobody in 卷一 | Won from 獙獙 (游戏); keep |
| yanxin 焰心 | +3 atk; nobody in 卷一 | Won from 鬿雀 (游戏); keep |
| chaoqi 潮起 · tingbo 停波 | water sweeps; read as 冰夷's | Won from 絜钩 and 軨軨 (游戏); keep |
| houtu 厚土 · zhuguang 珠光 | 息壤 · 息珠 are things he eats or feeds the 饭桶, not cast | Keep, as won from 当康 · 从从 (游戏); 息壤 stays the 五门 story beat |

## 3. Gaps: the book gives it, no card yet

**小满:**
- **木藤**: 1费 木 binds, his own: 「木藤不伤人，缠人」(六)
- **短刀**: 第五回, from a dead disciple: 「一把短刀，刀口缺了两个牙」
- **娘的饼**: heal, plus 「打不过就跑。跑，不丢人」(一)
- **随风**: dodge one blow: 「打不透的，别打。等它漏气」(七)
- **禹步**: 「猎户的脚」(七)
- **喷嚏符**: the foe skips a turn (六 wm-dabi)
- **猪蜻蜓**: push a body off the board: 「乘风而起，见木而栖」(六)
- **自拍镜**: turns a foe's signature back on itself (六 wm-juesai)
- **牛脂甘露**: a slip trap; the foe's next blow misses (六 wm-fushi)
- **遁符**: 40 灵石 at 钱掌柜's: 「四十块一道」(七)

**阿禾:**
- **荆棘**: binds and pierces (七)
- **金疮膏**: heal (七)

**秦雁** (a sparring foe):
- **剑气三尺** (七)

**Beasts with no card:**
- 犰狳: 第七回 story fight
- 鯥: 第七回, becomes the 顺风溜 shoes
- 合窳: 第八回
- 冰夷: 第九回

Proposed new cards from beats:
- deer-wind → 一箭 · 偏左半寸, which replaces 鹿影
- feather-breath → 吐纳, which replaces 悟道
- bread-share → 分饼, a heal tied to 银月

## 4. 小满's first hand: 第一回 to 第四回

He is a mortal until the 灵根 test (00-hall), and every spell is taught in 第六回. So the honest first hand is made of things and lessons:

| 回 | Scene | Gains | |
|---|---|---|---|
| 一 | 00-kitchen | **娘的饼** (new): 「打不过就跑」 | 书 |
| 一 | 00-chushan | 狐纹木牌: no card; it holds 银月 | 书 |
| 二 | 00-deer | **一箭 · 偏左半寸** (luying, on the deer-wind beat) | 书 |
| 二 | 00-sleep | **吐纳** (wudao, on the feather-breath beat) | 书 |
| 三 | 00-longzhi | the 三试: a dodge and a thrown stone | 书 |
| 四 | wm-diyilu | 木草泥马 · 回春丹 (九转) · 踏马符 | 书 |
| 五 | wm-xirang | 回气丹 · 火鸦 (葫芦) · 短刀 | 书 |
| 六 | wm-qianye | 火弹 · 冰锥 · 金刃 · 木藤 · 土墙 | 书 |

**The minimum for the early fights to be winnable:**
- **三试 (蠪侄)** is about nerve, and he never beats it in the book. Make it a survive-N-turns trial, with the 3 cards he holds plus a free 「一滚」 (dodge) and a 「石子」 (2 dmg). Today it uses 8 rootless starters; that goes.
- **wm-yaoyuan 狰** is a fight today, but the book wins it with a 萝卜. Make it a beat, not a fight.
- **第五回 蛫 · 邹青松**: his hand is about 7 things (饼 · 一箭 · 吐纳 · 木草泥马 · 回春丹 · 踏马符 · 短刀), plus 阿禾 on the board vs 邹青松. The deck allows **two copies of a card** (炉石's rule) until he holds ten, so a 7-card hand still makes a 10-card deck.
- **第六回 大比**: the five arts arrive, and the deck is a real ten from here.
- No more starter set at the 灵根 test. Old saves keep every card they hold.

Every early fight is re-weighed on the lookahead player (fight-band) when this is built.

## 5. 小队斗法: design (Hanli's pick, 2026-10-16)

**Both sides are symmetric.** Each side is a row of members, each with their own deck. A lone beast is a party of one, so the same shape serves PvE, a beast party, co-op and PvP.

- **One shared hand per side**, mixing the present members' cards. Each card carries its owner's seal.
- A card is played by its owner. A member who has **退** (withdrawn) can't play their cards; theirs drop from the shared hand.
- **One shared 灵力** per side.
- Every member stands in the side's row with their own 气血 and can be hit.
- 孙二狗's earth gives **嘲讽**: the beast must hit him first while he stands. 阿禾 heals and binds. 小满 attacks.
- 灵宠 stay **cards**: summoned as bodies onto the board, as minions are now. They are not members. 银月 is a member.
- **Multiplayer later:** each member's deck, hand-share and state are kept separate and owned. The shared hand is only the solo view; later each seat can be another human (co-op · PvP).

```js
side   = { id: 'you'|'foe', members: [member], hand: [cardRef], mana, board: [body] }
member = { id: 'xiaoman'|'ahe'|'sun'|'yinyue'|<creature id>, seat: 'p1'|null,  // a human seat, later
           root, hp, hpMax, armor?, ward?, taunt?: true,                          // 孙二狗: taunt
           deck: [cardId], owned: [cardId], gone: false }                         // gone = 退
cardRef = { id: cardId, owner: memberId, uid }                                     // the seal
card    = { ...cards.json row, owner: 'xiaoman'|'ahe'|'sun'|null }                 // null = anyone's 灵宠/符
setup   = { mode, seed, you: { members: [...] }, foe: { members: [...] } }         // a lone beast = members.length 1
```

**What changes in `battle.js`:**
1. **One hero → a row of members.** `sideOf` builds `members[]`. `hurt(st, side, n)` takes a member target, and a side is beaten when every member is 退.
2. **Draw from a deck per member** into the side's one hand: round-robin over the members still standing. `legal()` checks that the card's owner is still standing.
3. **Targeting.** Targets are `member:<id>` beside `minion:<uid>`. A taunting member counts as a 护主 body for `legal()` and for the foe AI (`aimFor`, `bestAttack`).
4. **A member's 退.** Their cards leave the hand, their deck stops drawing, and the stage says it. No death.
5. **Hero power.** It belongs to a member (小满's 主灵根一击), playable only while he stands.
6. **The 犰狳 feint and bind still work.** `feint` sits on the foe side, and it is a party of one. `bindAt` reads the card's `binds`, whoever owns it: 阿禾's 青藤缚 holds the sleeper, then 小满's blow goes in whole. The `pierce` elements are unchanged.
7. **Damage lands per member.** `dealt` and `clash` read the target member's root, not the side's. 嘲讽 and `ward` are per member.
8. **Replay contract.** Actions name a member: `play:<uid>@<target>` stays the same, and the card's owner is implied by its seal. Old setups with one `you` are read as a party of one.

## Counts

| Group | Cards |
|---|---|
| 小满 · arts (书) | 6 |
| 小满 · things (书 8 · 游戏 1) | 9 |
| 小满 · game-only arts | 5 |
| 阿禾 | 9 |
| 孙二狗 | 2 |
| 银月 | 1 |
| 灵宠 · 卷一 (书 2 · 游戏 5) | 7 |
| 灵宠 · later 卷 | 16 |
| beast-only and tokens | 5 |
| misfits (燎原 stays 邹青松's; 五雷 → a 符; 6 get a beast's reward) | 8 |
| **Total** | **68** |
