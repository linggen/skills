# 斗法 card audit, 2026-11-12 (analysis only)

Step 2 of v4's fitting order (design.md § 斗法 v4): the cards weighed without gear. Nothing here changes a card, a number, a rule or a test
threshold; every change below is a **proposal, not applied**. Tools: `tools/duel-audit.mjs` (`cards` · `fights` · `mirror`), `--bare-gear` on
`tools/duel-lines.mjs` and `tools/story-fights.mjs` (default off, today's output unchanged), `tests/duel-audit.test.mjs`. Even rules on in memory
(`withRules`), 40 seeds `band|0..39`, no party, the save as the road leaves it at each stop. 36 story fights are reached by the even rules.

## 1. The cards on paper

One formula for every card (v3's yardstick, 1.2 damage per cost single, 0.7 per target sweep):
`points = (atk + hp + effect) / (1.2 x cost + 2)` for a body, `effect / (1.2 x cost)` for a spell (`1.4 x cost` for a sweep);
effect = damage n, sweep 2n (two bodies), heal n, draw 1.2n, buff its atk+hp, rally 2x, summon n x token, 护主 +1; chain / swallow / drought are
judged (2.4 / n+3 / 4n). 1.00 is on the curve. 89 cards can be in a deck (tokens, pills, charms and the 7 mortal-only skills left out);
† marks a companion's or a person's own card. The full table is the appendix; `node tools/duel-audit.mjs cards` reprints it.

### 15 most over (paper)

| id | name | kind | cost | 攻/血 or effect | points | mirror Δ (200) | mirror rank of 30 |
|---|---|---|---|---|---|---|---|
| yinyue | 银月 † | minion | 2 | 3/4 入阵 heal 2 | 2.05 | +23.4 | 3 |
| wudao | 悟道 | spell | 1 | draw 2 | 2.00 | -11.9 | 29 |
| bashe | 巴蛇 | minion | 5 | 4/5 入阵 swallow 3 | 1.88 | +10.5 | 4 |
| tieji | 铁蒺藜 | spell | 1 | damage 1 + draw 1 | 1.83 | -18.9 | 30 |
| bingzhui | 冰锥 | spell | 1 | damage 2 | 1.67 | -5.0 | 21 |
| chunsheng | 春生 † | spell | 3 | summon {"id":"tengmiao_token","n":3} | 1.67 | -10.1 | 25 |
| houtu | 厚土 | spell | 2 | rally {"atk":0,"hp":2} | 1.67 | +9.5 | 5 |
| jixiao | 饥啸 | spell | 1 | buff {"atk":2,"hp":0} | 1.67 | -6.1 | 24 |
| peiyuan | 培元 † | spell | 1 | buff {"atk":1,"hp":1} | 1.67 | -1.9 | 15 |
| qingguang | 青光 † | spell | 2 | heal 4 | 1.67 | +0.5 | 9 |
| qingteng | 青藤缚 † | spell | 1 | damage 2 | 1.67 | -5.0 | 22 |
| shuiwu | 水雾 | spell | 1 | damage 2 | 1.67 | -5.0 | 23 |
| zhuguang | 珠光 | spell | 2 | heal 4 | 1.67 | +0.5 | 10 |
| feiyi | 肥遗 | minion | 4 | 3/4 drought 1 | 1.62 | +36.8 | 1 |
| huochai | 火柴 | minion | 4 | 6/5 | 1.62 | +28.2 | 2 |

### 15 most under (paper)

| id | name | kind | cost | 攻/血 or effect | points | mirror Δ (200) | mirror rank of 30 |
|---|---|---|---|---|---|---|---|
| jiushou | 九首 | minion | 3 | 3/1 | 0.71 | -11.6 | 28 |
| mutang | 木藤 | spell | 1 | damage 1 | 0.83 | -4.5 | 18 |
| fenghuo | 燎原 † | spell | 5 | sweep 3 | 0.86 | +4.2 | 8 |
| longzhi | 蠪侄 | minion | 4 | 4/2 | 0.88 | -10.4 | 26 |
| qiezhi | 窃脂 | minion | 3 | 3/2 | 0.89 | -11.0 | 27 |
| leipu | 雷仆 | minion | 2 | 2/2 | 0.91 | -0.7 | 14 |
| huoya | 火鸦 | minion | 2 | 3/1 | 0.91 | +8.0 | 7 |
| huoshe | 火蛇 | minion | 2 | 3/1 | 0.91 | +8.0 | 6 |
| houer | 猴儿 | minion | 2 | 2/2 | 0.91 | -0.7 | 13 |
| xiaoyao | 小妖 | minion | 1 | 1/2 | 0.94 | -4.6 | 20 |
| xianshi | 衔石 | minion | 1 | 1/2 | 0.94 | -4.2 | 17 |
| tianmaju | 天马驹 | minion | 1 | 2/1 | 0.94 | +0.0 | 12 |
| mucao | 木草泥马 | minion | 1 | 1/2 | 0.94 | -4.6 | 19 |
| liuzu | 六足犬 | minion | 1 | 1/2 | 0.94 | -4.2 | 16 |
| jinsuo | 金梭 | minion | 1 | 2/1 | 0.94 | +0.0 | 11 |

The mirror columns are section 4: win-rate points over a par card of the same cost, 200 seeds, SE about 2 points. The under list is crowded at 0.94
(eight 1-cost vanilla bodies tie), so its cut at fifteen is arbitrary inside the tie.

## 2. What gear is worth (no pills in either column; the bare column strips the worn robe and weapon and the 符 in the bag)

The 丹囊 (pouch) pills are never carried by `duel-lines` (`pill_pick` is dropped), so both columns are pill-less. 娘的饼 (heal 4, cost 1) is a card the
story deals into his ten and stays in the bare run. Run time: 64 s with gear, 62 s bare (36 fights x 3 lines x 40 seeds). Columns: lookahead / careful / plain win %.

| fight | gear L/C/P % | bare L/C/P % | turns g/b | gear worth L/C/P |
|---|---|---|---|---|
| gui@wm-wangzuo/open | 100/50/0 | 100/32/0 | 17.7/17.4 | +0/+18/+0 |
| qiuyu@09-lingcao/fight | 98/65/57 | 42/8/8 | 10.0/10.8 | +55/+58/+50 |
| qiuyu@mijing-ya | 25/0/0 | 8/0/0 | 12.0/11.2 | +18/+0/+0 |
| heyu@mijing-anhe | 100/60/2 | 50/0/0 | 17.5/17.7 | +50/+60/+2 |
| qiuyu@mijing-anhe | 25/0/0 | 0/0/0 | 13.0/10.7 | +25/+0/+0 |
| yezhu@mengshan | 100/75/5 | 98/57/5 | 16.1/15.5 | +3/+18/+0 |
| lang@mengshan | 28/2/0 | 25/2/0 | 12.1/11.1 | +3/+0/+0 |
| xiong@mengshan | 100/95/0 | 100/88/0 | 15.8/15.5 | +0/+7/+0 |
| longzhi@songlin | 50/10/0 | 30/8/0 | 10.8/10.1 | +20/+3/+0 |
| zheng@yaoyuan-wai | 100/55/5 | 92/48/5 | 11.7/11.2 | +7/+8/+0 |
| yezhu@yaoyuan-wai | 100/62/0 | 88/2/0 | 15.3/15.8 | +12/+60/+0 |
| lang@songlin | 28/2/0 | 25/2/0 | 12.1/11.1 | +3/+0/+0 |
| gui@sishui | 100/100/70 | 95/40/2 | 12.1/17.5 | +5/+60/+68 |
| renyu@sishui | 100/100/52 | 75/10/2 | 14.1/17.6 | +25/+90/+50 |
| heyu@sishui | 100/100/72 | 100/55/5 | 12.1/16.2 | +0/+45/+68 |
| tianma@taihang | 100/72/28 | 85/10/10 | 12.0/13.2 | +15/+62/+18 |
| linghu@taihang | 100/100/85 | 100/92/55 | 11.3/13.1 | +0/+7/+30 |
| renyu@liuwan | 100/100/52 | 75/10/2 | 14.1/17.6 | +25/+90/+50 |
| heyu@liuwan | 100/100/72 | 100/55/5 | 12.1/16.2 | +0/+45/+68 |
| chihu@yaoyuan-wai | 100/75/15 | 90/28/8 | 9.9/10.2 | +10/+48/+8 |
| shanli@yaoyuan-wai | 90/38/0 | 8/0/0 | 14.6/10.4 | +82/+38/+0 |
| mihou@yaoyuan-wai | 80/32/5 | 72/20/5 | 12.6/12.1 | +8/+12/+0 |
| fushe@yaoyuan-wai | 95/15/0 | 48/0/0 | 16.6/16.7 | +48/+15/+0 |
| congcong@yaoyuan-wai | 100/82/2 | 98/65/2 | 14.9/14.4 | +3/+17/+0 |
| xiegou@yaoyuan-wai | 100/100/10 | 82/5/5 | 11.8/10.7 | +18/+95/+5 |
| lang@yaoyuan-wai | 72/22/0 | 68/15/0 | 8.9/9.3 | +5/+8/+0 |
| xiong@yaoyuan-wai | 100/95/0 | 100/88/0 | 15.8/15.5 | +0/+7/+0 |
| lingling@yaoyuan-wai | 78/25/0 | 68/8/0 | 17.2/16.6 | +10/+18/+0 |
| cangying@yaoyuan-wai | 88/18/12 | 78/18/8 | 10.4/10.6 | +10/+0/+5 |
| yuanhu@yaoyuan-wai | 98/48/25 | 72/12/8 | 12.7/13.3 | +25/+35/+18 |
| jingjing@yaoyuan-wai | 100/62/5 | 57/10/0 | 17.5/17.8 | +43/+52/+5 |
| chai@yaoyuan-wai | 100/90/70 | 98/62/22 | 10.2/11.9 | +3/+28/+48 |
| bibi@yaoyuan-wai | 100/90/78 | 90/50/35 | 10.2/11.3 | +10/+40/+43 |
| dangkang@yaoyuan-wai | 100/100/85 | 92/8/2 | 13.5/17.6 | +7/+92/+82 |
| geju@yaoyuan-wai | 95/60/38 | 42/0/2 | 9.9/11.2 | +52/+60/+35 |
| qique@yaoyuan-wai | 100/92/55 | 100/75/20 | 11.2/13.2 | +0/+18/+35 |
| **mean of 36** | 87/61/25 | 71/27/6 | | +17/+34/+19 |

**Cards and levels alone give lookahead 71, careful 27, plain 6; the worn set adds 17, 34 and 19 points** (87 / 61 / 25 with it). Gear is worth most to the line
that does not plan. In the early fights it decides, a grey robe's 护体 4 on 气血 21-30 and the weapon's +2 on the root strike are worth more than a level. Where it
decides a fight for lookahead (swing of 40 points or more): 山狸 90 to 8, 犰狳 灵草谷 98 to 42, 合窳 暗河 100 to 50, 蝮蛇 95 to 48, 猲狙 95 to 42, 精精 100 to 57.
For careful it turns 人鱼, 当康 and 絜钩 from 100 into 5-10. Against the band (about 45% for lookahead bare) the bare line is already 26 points too high:
what is missing is not gear.

## 3. The lopsided fights without gear (lookahead 95 or more, or 30 or less)

Level difference is 0 in every one (a story fight's beast stands at his level), and so is 气血. Costs are the sums of the two ten-card decks. "Dry" is who first pays 反噬.

| fight (bare L/C/P) | level | his ten cost | beast ten cost | who runs dry first |
|---|---|---|---|---|
| 犰狳 暗河 0/0/0 | 3 | 14 | 18 | neither: the fight ends first |
| 犰狳 凶崖 8/0/0 | 2 | 14 | 16 | neither |
| 山狸 8/0/0 | 1 | 16 | 15 | he does (turn 11, in 35% of fights) |
| 狼 蒙山 · 林子 25/2/0 | 1 | 14 | 15 | neither |
| 蠪侄 林子 30/8/0 | 1 | 14 | 14 | neither |
| 熊 蒙山 · 崖顶 100/88/0 | 1 | 14 | 14 | he does (turn 13.6) |
| 野猪 蒙山 98/57/5 · 从从 98/65/2 | 1 | 14 | 14 | he does |
| 蛫 秘境 100/32/0 | 2 | 14 | 15 | he does |
| 蛫 · 合窳 泗水 95-100/40-55/2-5 | 10 | 25 | 27 | he does (turn 15.3) |
| 领胡 太行 100/92/55 | 10 | 25 | 25 | the beast (turn 13.9 against 15.6) |
| 豺 98/62/22 | 5 | 20 | 20 | the beast (turn 12, in 25%) |
| 鬿雀 100/75/20 | 7 | 22 | 24 | both (15 / 16, in 40-45%) |

The three furthest from the middle:

- **犰狳 暗河 (L3, 0 / 0 / 0; 犰狳 秘境 凶崖 8%).** His ten: 吐纳 x2, 娘的饼 x2, 木草泥马 x2, 狰 x2, 一箭 x2 = 14. The beast's: 木草泥马 x2, 风茂 x2, 雷鸣, 雷仆 x2, 培元,
  藤苗 x2 = 18. The budget (13 + 1.5 x level) lets the beast spend 18 where his road hand is cheap filler: two cards that only draw, two that heal 4, two 1/2 bodies, and 一箭
  (3 for 2) his only blows. Same level, same 气血, four more cost on the other side. This is the deck budget outrunning his collection, not one card out of line.
- **山狸 (L1, 8 / 0 / 0; 90 with gear).** Its ten is 冰锥 x2 and 水雾 x3, five 1-cost blows of 2 (1.67 points, the top of the paper list), with 鹿影 x4 (3/2 for 2) and 伏狸:
  all ten cards over the curve, and the costs (15 against 16) do not show it. The robe is what held it.
- **熊 (L1, 100 / 88 / 0).** Its ten is 土偶 x2 and 土墙 x2 (0/3 walls), 饥啸 x3 (+2 attack with no body to stand on), 吞噬, 熊崽, 珠光: six cards that threaten nothing. A line that
  plays a body and a blow wins; only the first-card line cannot (0%). A ten of walls and buffs is a free fight, and the budget (14) does not notice.

## 4. The mirror

Two identical sheets (foundation, level 10, 气血 30, no root, no gear, no pill). Deck A is a par ten on the curve 1 1 2 2 2 3 3 4 4 5, in two bases (a mix of bodies and
blows, and bodies only); the cards under test are never in either, and a card is weighed against every card of its cost in the base (the delta is the mean). B is A with
one card swapped in. Both seats play the `careful` line (rewritten for either seat in the tool), every deal twice with the seats swapped, so the first move cancels. Delta = B's
win rate minus 50. A card of identical stats scores exactly 0 (天马驹, 金梭: the control). 30 cards x 200 seeds took 69 s; all 84 cards at 400 seeds took 350 s; the two agree within 2 points.

**The ranking agrees with the paper figures poorly: Spearman 0.05 over the 30 (0.11 over all 84).** Where it is about bodies they agree: 肥遗 (+37), 火柴 (+28), 银月 (+23), 石兽 (+14),
巴蛇 (+10) are over on paper and in play. Where it is about verbs they do not:

- **Draw is a liability in a ten-card deck.** 悟道 (paper 2.00) -12, 铁蒺藜 (1.83) -19, 参悟 (1.00) -19, 泰逢 -33, 精卫 -18. Take the draw off 铁蒺藜 and it goes from -19 to -5: every
  card drawn brings 反噬 a turn nearer.
- **Dear single blows are a tempo loss.** 寒潭指 · 雷鸣 · 冰锥符 (4 for 3) -19, 落石术 -20, 五雷法 (6 for 5) -33, 燎天 (8 for 6) -32. The same 4 damage at cost 2 is -2; 燎天 at cost 4 is 0.
  In the mirror a blow is worth about **2 damage per cost**, not 1.2. The 1-cost blows (冰锥, 水雾, 青藤缚) sit at -5, level with a vanilla 1/2 body (-4.5).
- **Sweeps are strong**: 停波 +21, 金针雨 +17, 震怒 +14, 潮起 +14, 痒痒针 +10 (0.95-1.07 on paper). The bases are body-heavy, and so is the game.
- 4-cost bodies average +13 and 5-cost spells -16: the curve has a shelf at cost 4.

## 5. Proposals (not applied; every number measured in the mirror at 200 seeds, SE about 2-3 points)

1. **Fix the dear and the cheap by cost, not by number.** 寒潭指 · 雷鸣 · 冰锥符 cost 3 to 2 (-19 to -2); 燎天 cost 6 to 4 (-32 to 0); 五雷法 cost 5 to 4 (-33 to -7); 泰逢 cost 5 to 4
   (-32 to -2); 精卫 cost 3 to 2 (-18 to -4); 悟道 · 参悟 cost 2 (-12 and -19 to -7). Raising the damage instead barely helps (寒潭指 4 to 6: -19 to -13). Restate v3's yardstick as about
   2 damage per cost for a single blow and count draw as 0, not +1.2 a card.
2. **Trim what is over:** 火柴 6/5 to 4/3 (+28 to +9), or cost 5 (to -1); 肥遗 cost 5 and 3/3 (+37 to +3); 银月 cost 3 (+23 to +5); 石兽 3/6 to 3/4 (+15 to +5); 停波 sweep 3 to cost 5 (+21 to -8) or
   to sweep 2 (+9); 金针雨 sweep 2 to 1 (+17 to +2).
3. **Measure the beasts' tens by the mirror, not by the cost budget alone, before step 4:** 犰狳 18 against his 14, 熊 six dead cards, 山狸 ten cards over the curve. Gear should come down
   from 17 / 34 / 19 points to about a level (a level is not yet measured: `mirror --level 10` against `--level 11` is the next run).

Caveats: the mirror is one setting (foundation, 30 气血, two par bases) and one line (`careful`); cost-3 and cost-4 deltas depend on what sits at that cost in the base; the judged verbs
(chain, swallow, drought) are guesses on paper; 40 seeds per fight is +-7 points. The fight-length rule (one heal, a damage cap) is not in the mirror.

## Appendix: all 89 cards on paper, with the mirror delta at 400 seeds ("in base" = part of a par ten, not tested)

| id | name | kind | cost | 攻/血 or effect | points | mirror Δ (400) |
|---|---|---|---|---|---|---|
| yinyue | 银月 † | minion | 2 | 3/4 入阵 heal 2 | 2.05 | +23.5 |
| wudao | 悟道 | spell | 1 | draw 2 | 2.00 | -11.8 |
| bashe | 巴蛇 | minion | 5 | 4/5 入阵 swallow 3 | 1.88 | +8.0 |
| tieji | 铁蒺藜 | spell | 1 | damage 1 + draw 1 | 1.83 | -17.8 |
| bingzhui | 冰锥 | spell | 1 | damage 2 | 1.67 | -4.8 |
| chunsheng | 春生 † | spell | 3 | summon {"id":"tengmiao_token","n":3} | 1.67 | -9.9 |
| houtu | 厚土 | spell | 2 | rally {"atk":0,"hp":2} | 1.67 | +9.7 |
| jixiao | 饥啸 | spell | 1 | buff {"atk":2,"hp":0} | 1.67 | -7.1 |
| peiyuan | 培元 † | spell | 1 | buff {"atk":1,"hp":1} | 1.67 | -1.9 |
| qingguang | 青光 † | spell | 2 | heal 4 | 1.67 | +1.4 |
| qingteng | 青藤缚 † | spell | 1 | damage 2 | 1.67 | -4.8 |
| shuiwu | 水雾 | spell | 1 | damage 2 | 1.67 | -4.8 |
| zhuguang | 珠光 | spell | 2 | heal 4 | 1.67 | +1.4 |
| feiyi | 肥遗 | minion | 4 | 3/4 drought 1 | 1.62 | +35.8 |
| huochai | 火柴 | minion | 4 | 6/5 | 1.62 | +27.2 |
| wuzhiqi | 无支祁 | minion | 5 | 5/5 入阵 chain 1 | 1.55 | -9.3 |
| kui | 夔 | minion | 5 | 4/6 护主 入阵 drain 1 | 1.53 | +0.7 |
| fangfeng | 防风氏 | minion | 5 | 3/8 护主 | 1.50 | -11.9 |
| kuiniu | 夔牛 | minion | 5 | 4/4 入阵 rally {"atk":1,"hp":1} | 1.50 | -1.1 |
| linmu | 林母 † | minion | 5 | 3/5 入阵 rally {"atk":1,"hp":1} | 1.50 | -9.6 |
| shishou | 石兽 | minion | 4 | 3/6 护主 | 1.47 | +14.2 |
| gui | 蛫 | minion | 3 | 2/5 护主 | 1.43 | +1.5 |
| hanquan | 寒泉 | minion | 3 | 2/3 入阵 heal 3 | 1.43 | -5.2 |
| sanhuo | 散火诀 | spell | 1 | sweep 1 | 1.43 | +10.9 |
| taifeng | 泰逢 | minion | 5 | 4/5 入阵 draw 2 | 1.43 | -32.6 |
| tongtong | 狪狪 | minion | 3 | 1/6 护主 | 1.43 | +0.4 |
| leishen | 雷神 | minion | 6 | 4/5 入阵 sweep 2 | 1.41 | -3.3 |
| tunshi | 吞噬 | spell | 3 | damage 5 | 1.39 | -16.9 |
| jingang | 金刚 | minion | 5 | 3/7 护主 | 1.38 | in base |
| toulang | 头狼 | minion | 5 | 3/7 护主 | 1.38 | +0.0 |
| fuli | 伏狸 | minion | 2 | 0/5 护主 | 1.36 | +1.1 |
| gupi | 鼓皮 | minion | 2 | 0/5 护主 | 1.36 | -3.1 |
| shangen | 山根桩 † | minion | 2 | 1/4 护主 | 1.36 | +10.5 |
| shanjing | 山精 | minion | 2 | 1/4 护主 | 1.36 | +10.5 |
| tiegu | 铁箍板 † | minion | 2 | 0/5 护主 | 1.36 | -3.0 |
| xiongzai | 熊崽 | minion | 2 | 1/4 护主 | 1.36 | +10.5 |
| huodan | 火弹术 | spell | 2 | damage 3 | 1.25 | +2.5 |
| jinren | 金刃 | spell | 2 | damage 3 | 1.25 | -2.1 |
| jinzhua | 金爪 | spell | 2 | damage 3 | 1.25 | -2.1 |
| qianyang | 羬羊 | minion | 3 | 2/4 护主 | 1.25 | -2.4 |
| tengmiao | 藤苗 † | minion | 1 | 1/1 入阵 summon {"id":"tengmiao_token","n":1} | 1.25 | -0.8 |
| tuou | 土偶 | minion | 1 | 0/3 护主 | 1.25 | -5.6 |
| tuqiang | 土墙 | minion | 1 | 0/3 护主 | 1.25 | -5.6 |
| yanxin | 焰心 | spell | 2 | buff {"atk":3,"hp":0} | 1.25 | -3.6 |
| chishou | 赤首 | minion | 4 | 5/3 | 1.18 | +7.9 |
| elang | 饿狼 | minion | 4 | 5/3 | 1.18 | +7.4 |
| jianying | 剑影 | minion | 4 | 5/3 | 1.18 | +7.4 |
| paoxiao | 狍鸮 | minion | 4 | 3/3 入阵 damage 2 | 1.18 | +11.1 |
| tongling | 童灵 | minion | 2 | 2/2 入阵 draw 1 | 1.18 | -7.7 |
| xiaochihu | 小赤狐 | minion | 2 | 2/2 入阵 draw 1 | 1.18 | -7.7 |
| zheng | 狰 | minion | 2 | 2/2 入阵 draw 1 | 1.18 | -7.7 |
| caoren | 替身草人 | minion | 2 | 1/3 护主 | 1.14 | in base |
| luying | 鹿影 | minion | 2 | 3/2 | 1.14 | in base |
| bingzhuifu | 冰锥符 † | spell | 3 | damage 4 | 1.11 | -19.2 |
| fengmao | 风茂 † | spell | 3 | rally {"atk":1,"hp":1} | 1.11 | -7.1 |
| hantan | 寒潭指 | spell | 3 | damage 4 | 1.11 | -19.2 |
| jingwei | 精卫 | minion | 3 | 2/3 入阵 draw 1 | 1.11 | -18.5 |
| leiming | 雷鸣 | spell | 3 | damage 4 | 1.11 | -19.2 |
| liaotian | 燎天 | spell | 6 | damage 8 | 1.11 | -31.6 |
| changyou | 长右 | minion | 3 | 2/4 | 1.07 | -12.9 |
| fuzhu | 夫诸 | minion | 3 | 2/2 入阵 sweep 1 | 1.07 | +2.1 |
| tingbo | 停波 | spell | 4 | sweep 3 | 1.07 | +20.6 |
| zhennu | 震怒 | spell | 4 | sweep 3 | 1.07 | +14.1 |
| luoshi | 落石术 | spell | 4 | damage 5 | 1.04 | -19.6 |
| ruxi | 入隙 | spell | 4 | damage 5 | 1.04 | -9.4 |
| suijin | 碎金 | spell | 4 | damage 5 | 1.04 | -9.4 |
| zhenyuefu | 镇岳符 † | spell | 4 | damage 5 | 1.04 | -9.4 |
| mafu | 马腹 | minion | 4 | 4/3 | 1.03 | in base |
| canwu | 参悟 | spell | 3 | draw 3 | 1.00 | -19.1 |
| wulei | 五雷法 † | spell | 5 | damage 6 | 1.00 | -33.1 |
| chaoqi | 潮起 | spell | 3 | sweep 2 | 0.95 | +13.9 |
| jinzhen | 金针雨 | spell | 3 | sweep 2 | 0.95 | +17.2 |
| yangzhen | 痒痒针 | spell | 3 | sweep 2 | 0.95 | +10.3 |
| feijian | 短飞剑 | minion | 1 | 2/1 | 0.94 | in base |
| huilang | 灰狼 | minion | 1 | 2/1 | 0.94 | in base |
| jinsuo | 金梭 | minion | 1 | 2/1 | 0.94 | +0.0 |
| liuzu | 六足犬 | minion | 1 | 1/2 | 0.94 | -4.1 |
| mucao | 木草泥马 | minion | 1 | 1/2 | 0.94 | -4.8 |
| tianmaju | 天马驹 | minion | 1 | 2/1 | 0.94 | +0.0 |
| xianshi | 衔石 | minion | 1 | 1/2 | 0.94 | -4.1 |
| xiaoyao | 小妖 | minion | 1 | 1/2 | 0.94 | -4.8 |
| houer | 猴儿 | minion | 2 | 2/2 | 0.91 | +0.4 |
| huoshe | 火蛇 | minion | 2 | 3/1 | 0.91 | +8.4 |
| huoya | 火鸦 | minion | 2 | 3/1 | 0.91 | +8.4 |
| leipu | 雷仆 | minion | 2 | 2/2 | 0.91 | +0.4 |
| qiezhi | 窃脂 | minion | 3 | 3/2 | 0.89 | -10.6 |
| longzhi | 蠪侄 | minion | 4 | 4/2 | 0.88 | -10.1 |
| fenghuo | 燎原 † | spell | 5 | sweep 3 | 0.86 | +1.8 |
| mutang | 木藤 | spell | 1 | damage 1 | 0.83 | -4.6 |
| jiushou | 九首 | minion | 3 | 3/1 | 0.71 | -11.7 |
