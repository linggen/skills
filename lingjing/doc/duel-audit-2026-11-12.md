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


## Follow-up — what the ranking measures

Measurement only again; nothing in cards.json, balance.json or the rules was touched. New in `tools/duel-audit.mjs`: `mirror --no-fatigue --line lookahead --scope --from N --exclude ids`,
and the commands `scope`, `length`, `level`, `budget`. Run times: fatigue pair about 70 s each, scoped mirror of 51 cards at 400 seeds 312 s, lookahead mirror (13 cards, 20 seeds) 936 s
(over the ~10 min asked: 13 cards instead of 10, the three extra were the buff and draw cards you asked about), level runs 14 s (careful) and 162 s (lookahead), length 85 s gear and 80 s bare.

### 1. Fatigue off (the setup's own `fatigue: false`, both seats), 200 seeds, the first audit's bases

| card | cost | kind | paper | Δ fatigue on | Δ fatigue off | change |
|---|---|---|---|---|---|---|
| 悟道 | 1 | draw | 2.00 | -11.9 | -15.4 | -3.6 |
| 吐纳 | 1 | draw | 2.00 | -11.9 | -15.4 | -3.6 |
| 参悟 | 3 | draw | 1.00 | -19.4 | -22.9 | -3.5 |
| 铁蒺藜 | 1 | draw+blow | 1.83 | -18.9 | -13.1 | +5.9 |
| 精卫 | 3 | draw body | 1.11 | -18.0 | -9.8 | +8.2 |
| 小赤狐 | 2 | draw body | 1.18 | -8.1 | +1.0 | +9.1 |
| 狰 | 2 | draw body | 1.18 | -8.1 | +1.0 | +9.1 |
| 童灵 | 2 | draw body | 1.18 | -8.1 | +1.0 | +9.1 |
| 泰逢 | 5 | draw body | 1.43 | -32.0 | -17.0 | +15.0 |
| 小妖 | 1 | control body | 0.94 | -4.6 | -5.8 | -1.1 |
| 猴儿 | 2 | control body | 0.91 | -0.7 | +1.8 | +2.5 |
| 火弹术 | 2 | control blow | 1.25 | +2.2 | +2.7 | +0.4 |
| 寒潭指 | 3 | control blow | 1.11 | -19.4 | -23.5 | -4.1 |
| 金针雨 | 3 | control sweep | 0.95 | +16.9 | +15.5 | -1.4 |
| 震怒 | 4 | control sweep | 1.07 | +16.1 | +17.0 | +0.9 |

吐纳 is 悟道 in stats (draw 2 for 1), so the two rows are one measurement. Controls move at most 4 points (寒潭指 -4); the draw cards move a lot, in two directions.

### 2. Fight length under the even rules (36 story fights, the band's lookahead for him, the beast's own policy, 40 seeds; plies, not rounds)

A pile "empties" the first ply at which it stands at 0 cards; the share is the share of fights in which it did. 反噬 share = fatigue damage / all damage the loser's hero took (armour counted).

| fight | plies gear / bare | his pile empty gear / bare (share of fights) | beast pile empty gear / bare | 反噬 share of loser's damage gear / bare | killing blow was 反噬 gear / bare |
|---|---|---|---|---|---|
| gui@wm-wangzuo/open | 17.0 / 16.9 | 11 (100%) / 11 (100%) | 14 (83%) / 14 (88%) | 9% / 8% | 20% / 25% |
| qiuyu@09-lingcao/fight | 9.7 / 11.4 | 13 (8%) / 13 (25%) | - / 14 (5%) | 0% / 0% | 0% / 0% |
| qiuyu@mijing-ya | 12.3 / 11.6 | 9 (98%) / 9 (100%) | 14 (13%) / 14 (5%) | 17% / 16% | 65% / 70% |
| heyu@mijing-anhe | 17.0 / 19.8 | 11 (100%) / 11 (100%) | 14 (80%) / 14 (95%) | 14% / 40% | 57% / 63% |
| qiuyu@mijing-anhe | 13.6 / 10.8 | 10 (100%) / 9 (95%) | 14 (35%) / - | 18% / 18% | 40% / 65% |
| yezhu@mengshan | 15.1 / 14.7 | 11 (100%) / 11 (98%) | 14 (65%) / 14 (60%) | 3% / 5% | 0% / 5% |
| lang@mengshan | 13.2 / 11.8 | 9 (98%) / 9 (90%) | 14 (40%) / 14 (25%) | 20% / 16% | 50% / 40% |
| xiong@mengshan | 14.9 / 14.8 | 11 (100%) / 11 (100%) | 14 (65%) / 14 (60%) | 2% / 3% | 0% / 0% |
| longzhi@songlin | 10.6 / 10.0 | 9 (98%) / 9 (93%) | 14 (3%) / 14 (3%) | 10% / 12% | 38% / 50% |
| zheng@yaoyuan-wai | 12.3 / 12.2 | 9 (95%) / 9 (93%) | 9 (95%) / 10 (95%) | 20% / 15% | 55% / 43% |
| yezhu@yaoyuan-wai | 14.4 / 16.4 | 9 (100%) / 10 (100%) | 14 (50%) / 14 (85%) | 2% / 15% | 8% / 25% |
| lang@songlin | 13.2 / 11.8 | 9 (98%) / 9 (90%) | 14 (40%) / 14 (25%) | 20% / 16% | 50% / 40% |
| gui@sishui | 10.3 / 17.5 | 13 (3%) / 14 (95%) | - / 14 (80%) | 0% / 10% | 0% / 63% |
| renyu@sishui | 13.0 / 18.9 | 13 (65%) / 14 (98%) | 14 (33%) / 14 (93%) | 0% / 14% | 8% / 50% |
| heyu@sishui | 10.3 / 15.6 | 13 (8%) / 13 (90%) | - / 14 (60%) | 0% / 5% | 0% / 45% |
| tianma@taihang | 13.2 / 16.0 | 13 (70%) / 13 (85%) | 13 (53%) / 13 (83%) | 2% / 10% | 15% / 53% |
| linghu@taihang | 11.0 / 13.4 | 13 (18%) / 13 (68%) | 11 (33%) / 11 (78%) | 1% / 5% | 5% / 30% |
| renyu@liuwan | 13.0 / 18.9 | 13 (65%) / 14 (98%) | 14 (33%) / 14 (93%) | 0% / 14% | 8% / 50% |
| heyu@liuwan | 10.3 / 15.6 | 13 (8%) / 13 (90%) | - / 14 (60%) | 0% / 5% | 0% / 45% |
| chihu@yaoyuan-wai | 9.7 / 10.6 | 9 (85%) / 9 (90%) | 8 (55%) / 9 (73%) | 3% / 7% | 10% / 25% |
| shanli@yaoyuan-wai | 15.9 / 10.8 | 10 (100%) / 8 (100%) | 14 (80%) / 14 (8%) | 11% / 21% | 23% / 55% |
| mihou@yaoyuan-wai | 12.5 / 12.5 | 10 (93%) / 10 (90%) | 14 (10%) / 14 (18%) | 6% / 8% | 13% / 30% |
| fushe@yaoyuan-wai | 17.1 / 18.1 | 10 (100%) / 10 (100%) | 14 (95%) / 14 (100%) | 13% / 39% | 15% / 45% |
| congcong@yaoyuan-wai | 13.9 / 13.6 | 10 (98%) / 10 (95%) | 14 (53%) / 14 (48%) | 1% / 2% | 3% / 5% |
| xiegou@yaoyuan-wai | 12.5 / 11.9 | 10 (100%) / 9 (98%) | 9 (100%) / 9 (85%) | 25% / 22% | 63% / 50% |
| lang@yaoyuan-wai | 9.2 / 9.9 | 9 (85%) / 9 (88%) | - / 14 (8%) | 3% / 3% | 10% / 15% |
| xiong@yaoyuan-wai | 14.9 / 14.8 | 11 (100%) / 11 (100%) | 14 (65%) / 14 (60%) | 2% / 3% | 0% / 0% |
| lingling@yaoyuan-wai | 20.1 / 19.6 | 12 (100%) / 11 (100%) | 11 (100%) / 11 (100%) | 59% / 56% | 83% / 78% |
| cangying@yaoyuan-wai | 10.4 / 9.9 | 11 (55%) / 10 (53%) | 14 (5%) / 14 (5%) | 1% / 1% | 3% / 8% |
| yuanhu@yaoyuan-wai | 11.6 / 13.2 | 11 (63%) / 11 (78%) | 14 (20%) / 14 (38%) | 2% / 5% | 10% / 25% |
| jingjing@yaoyuan-wai | 16.1 / 18.8 | 13 (100%) / 13 (100%) | 14 (75%) / 14 (100%) | 7% / 21% | 30% / 73% |
| chai@yaoyuan-wai | 10.1 / 12.6 | 13 (8%) / 13 (57%) | 11 (23%) / 11 (63%) | 0% / 5% | 3% / 15% |
| bibi@yaoyuan-wai | 9.9 / 11.8 | 13 (8%) / 13 (38%) | 11 (23%) / 11 (50%) | 0% / 6% | 0% / 13% |
| dangkang@yaoyuan-wai | 11.7 / 18.9 | 13 (50%) / 13 (100%) | 14 (10%) / 14 (98%) | 0% / 15% | 3% / 73% |
| geju@yaoyuan-wai | 10.5 / 12.0 | 13 (18%) / 11 (75%) | 14 (3%) / 14 (23%) | 0% / 4% | 0% / 10% |
| qique@yaoyuan-wai | 11.3 / 13.1 | 13 (35%) / 11 (93%) | 14 (8%) / 14 (40%) | 0% / 3% | 0% / 18% |
| **mean of 36** | 12.8 / 14.2 | 11.2 (70%) / 11.0 (88%) | 13.1 (40%) / 13.2 (56%) | 7.5% / 12.4% | 19% / 36% |

### 3. A second line: lookahead on both seats (each move tried, the fight played out by `careful` for both seats), the ten largest paper-versus-mirror disagreements of the scoped list, plus 饥啸 · 参悟 · 童灵 for buff and draw

The scoped list is section 5's. 20 seeds, both bases, so sampling noise is about 5 points; careful's column is the 400-seed scoped run. "Same" also covers two values within 4 points of zero.
Twins (痒痒针 = 金针雨, 火鸦 = 火蛇) are run once.

| card | cost | paper | careful Δ (400 seeds) | lookahead Δ (20 seeds) | sign |
|---|---|---|---|---|---|
| 铁蒺藜 | 1 | 1.83 | -9.5 | -16.9 | same |
| 悟道 | 1 | 2.00 | -7.9 | -18.1 | same |
| 吞噬 | 3 | 1.39 | -12.0 | -8.8 | same |
| 金针雨 | 3 | 0.95 | +21.0 | +10.0 | same |
| 潮起 | 3 | 0.95 | +19.6 | +10.6 | same |
| 火蛇 | 2 | 0.91 | +3.9 | +4.6 | same |
| 停波 | 4 | 1.07 | +29.9 | +13.8 | same |
| 震怒 | 4 | 1.07 | +25.9 | +14.4 | same |
| 木藤 | 1 | 0.83 | -1.6 | -8.8 | same |
| 伏狸 | 2 | 1.36 | -7.9 | -2.9 | same |
| 饥啸 | 1 | 1.67 | -2.0 | -0.6 | same |
| 参悟 | 3 | 1.00 | -10.9 | -26.2 | same |
| 童灵 | 2 | 1.18 | -6.2 | -11.7 | same |

No row flips sign. The lookahead line halves the sweeps (+30 to +14, +21 to +10), keeps the dear blows and the draw cards negative, and makes the pure draw spells worse (悟道 -8 to -18, 参悟 -11 to -26).

### 4. The mirror's setup, stated

- **Level 10**, foundation: 气血 30 each, **灵力 cap 8** (qi caps at 6). 灵力 opens at 2 and rises 1 per own turn, so own turn k has min(cap, k+1): a **6-cost card is first playable on own turn 5** (ply 9 for the first mover, 10 for the second), and
  nothing is left to hold back after 灵力 8. Measured on the par tens: a game runs **16.7 plies (mix base) to 19.6 (bodies base)**, no game ended before ply 9, and in 199 of 200 games a 6-cost card that was in the ten
  was drawn and cast: all ten cards are seen in one game, so a 6-cost card is playable on about 4-5 own turns, not "never". Opening hand 3 each, one draw a turn from the second ply, no root, no gear, no pill, no party, first mover is `you`, seats swapped on every deal.
- **Par cards.** First audit and section 1: mix = 短飞剑1 灰狼1 替身草人2 鹿影2 火弹术2 潮起3 金针雨3 马腹4 落石术4 金刚5; bodies = 短飞剑1 灰狼1 替身草人2 鹿影2 伏狸2 长右3 羬羊3 马腹4 赤首4 金刚5 (cost 27 each).
  Sections 3 and 5 (scoped): mix = 金梭1 衔石1 雷仆2 替身草人2 鹿影2 长右3 夫诸3 马腹4 落石术4 金刚5; bodies = 金梭1 衔石1 雷仆2 替身草人2 鹿影2 长右3 窃脂3 马腹4 赤首4 金刚5. They are the cards nearest 1.00 paper points,
  so the base moved a little between the runs (the numbers of one card differ by a few points from run to run for that reason). A card is swapped in for each card of its cost in turn (cost 6 for the 5-slot) and the mean is taken.
- **Noise.** The deals are not the noise: 30 cards re-run on independent deals (seeds 1000-1199) differ from the first run by 0.9 points on average (largest 3.2), because the seat swap cancels the first-move edge (identical tens: the first mover wins about 70%).
  What is large is the **base**: the mix and bodies bases differ by 5.4 points on average (up to 30, 燎原), and disagree in sign for 青光 · 珠光 · 猴儿 · 雷仆 · 燎原 (first 30) and 寒泉 · 替身草人 (scoped). Of the first report's 30 rows, 17 are inside +-7:
  冰锥 · 饥啸 · 培元 · 青光 · 青藤缚 · 水雾 · 珠光 · 金梭 · 六足犬 · 木草泥马 · 天马驹 · 衔石 · 小妖 · 猴儿 · 雷仆 · 燎原 · 木藤. All of those read "no different from a par card of their cost".
  The lookahead run (20 seeds) is about +-5.

### 5. Scope: ordinary deck cards a player can hold in 卷一 or win from a 卷一 beast (51 cards; scoped mirror, 400 seeds)

**15 most over (paper), in scope**

| id | name | kind | cost | 攻/血 or effect | points | mirror Δ |
|---|---|---|---|---|---|---|
| wudao | 悟道 | spell | 1 | draw 2 | 2.00 | -7.9 |
| tieji | 铁蒺藜 | spell | 1 | damage 1 + draw 1 | 1.83 | -9.5 |
| bingzhui | 冰锥 | spell | 1 | damage 2 | 1.67 | -3.6 |
| houtu | 厚土 | spell | 2 | rally {"atk":0,"hp":2} | 1.67 | +9.4 |
| jixiao | 饥啸 | spell | 1 | buff {"atk":2,"hp":0} | 1.67 | -2.0 |
| shuiwu | 水雾 | spell | 1 | damage 2 | 1.67 | -3.6 |
| zhuguang | 珠光 | spell | 2 | heal 4 | 1.67 | -3.0 |
| shishou | 石兽 | minion | 4 | 3/6 护主 | 1.47 | +16.7 |
| gui | 蛫 | minion | 3 | 2/5 护主 | 1.43 | +4.0 |
| hanquan | 寒泉 | minion | 3 | 2/3 入阵 heal 3 | 1.43 | +0.1 |
| sanhuo | 散火诀 | spell | 1 | sweep 1 | 1.43 | +14.4 |
| tunshi | 吞噬 | spell | 3 | damage 5 | 1.39 | -12.0 |
| toulang | 头狼 | minion | 5 | 3/7 护主 | 1.38 | +0.0 |
| fuli | 伏狸 | minion | 2 | 0/5 护主 | 1.36 | -7.9 |
| xiongzai | 熊崽 | minion | 2 | 1/4 护主 | 1.36 | +5.9 |

**15 most under (paper), in scope**

| id | name | kind | cost | 攻/血 or effect | points | mirror Δ |
|---|---|---|---|---|---|---|
| jiushou | 九首 | minion | 3 | 3/1 | 0.71 | -6.4 |
| mutang | 木藤 | spell | 1 | damage 1 | 0.83 | -1.6 |
| longzhi | 蠪侄 | minion | 4 | 4/2 | 0.88 | -5.0 |
| huoya | 火鸦 | minion | 2 | 3/1 | 0.91 | +3.9 |
| huoshe | 火蛇 | minion | 2 | 3/1 | 0.91 | +3.9 |
| houer | 猴儿 | minion | 2 | 2/2 | 0.91 | -2.8 |
| xiaoyao | 小妖 | minion | 1 | 1/2 | 0.94 | -2.4 |
| tianmaju | 天马驹 | minion | 1 | 2/1 | 0.94 | +2.0 |
| mucao | 木草泥马 | minion | 1 | 1/2 | 0.94 | -2.4 |
| liuzu | 六足犬 | minion | 1 | 1/2 | 0.94 | -2.5 |
| huilang | 灰狼 | minion | 1 | 2/1 | 0.94 | +2.0 |
| feijian | 短飞剑 | minion | 1 | 2/1 | 0.94 | +2.0 |
| yangzhen | 痒痒针 | spell | 3 | sweep 2 | 0.95 | +21.0 |
| jinzhen | 金针雨 | spell | 3 | sweep 2 | 0.95 | +21.0 |
| chaoqi | 潮起 | spell | 3 | sweep 2 | 0.95 | +19.6 |

Left out, with the reason (`node tools/duel-audit.mjs scope`):

- **owner** (12): 银月 2.05 · 春生 1.67 · 培元 1.67 · 青光 1.67 · 青藤缚 1.67 · 林母 1.50 · 山根桩 1.36 · 铁箍板 1.36 · 藤苗 1.25 · 冰锥符 1.11 · 风茂 1.11 · 镇岳符 1.04
- **later 卷** (20): 巴蛇 1.88 · 肥遗 1.62 · 无支祁 1.55 · 夔 1.53 · 防风氏 1.50 · 夔牛 1.50 · 泰逢 1.43 · 狪狪 1.43 · 雷神 1.41 · 金刚 1.38 · 鼓皮 1.36 · 羬羊 1.25 · 狍鸮 1.18 · 精卫 1.11 · 长右 1.07 · 夫诸 1.07 · 马腹 1.03 · 衔石 0.94 · 雷仆 0.91 · 窃脂 0.89
- **no source** (1): 火柴 1.62
- **foe art** (6): 山精 1.36 · 土偶 1.25 · 剑影 1.18 · 五雷法 1.00 · 金梭 0.94 · 燎原 0.86

Spearman paper against mirror over the 51 is **-0.09**: on the cards a player actually meets, the paper figure does not predict play at all.

### 6. What a level is worth (identical par tens, one seat up; win-rate points for the higher seat)

| mirror, identical par tens | +1 level | +2 | +3 |
|---|---|---|---|
| careful, level 5 (qi), 600 seeds | +3.4 | +5.7 | +8.2 |
| careful, level 10 (foundation), 600 seeds | +3.0 | +6.8 | +10.6 |
| careful, level 20 (core), 600 seeds | +3.2 | +5.8 | +8.0 |
| lookahead, level 5, 200 seeds | +4.2 | +9.2 | +10.8 |
| careful, level 9 to 10 (across the realm line) | +50.0 (wins every game) | | |

Inside a realm a level is **+3 points** (careful +3.0 to +3.4 a level; lookahead about +3.6): +1 气血 on 20-30. Across the realm line the higher realm wins every game (境界压制: ×1.5 and ×0.7, 灵力 cap 6 to 8, root strike 1 to 2).
The worn set measured earlier (+17 lookahead, +34 careful, +19 plain) is therefore **about 5 to 11 levels**, not one.

### 7. Deck cost by level (his ten as `fightDeck` builds it under the even rules, the beast's from `beastTen`, budget 13 + 1.5 x level)

| fight | his level | his ten cost | beast level | beast ten cost | budget (13+1.5L) | beast - his |
|---|---|---|---|---|---|---|
| gui@wm-wangzuo/open | 2 | 14 | 2 | 15 | 16 | +1 |
| qiuyu@09-lingcao/fight | 5 | 20 | 5 | 20 | 21 | +0 |
| qiuyu@mijing-ya | 2 | 14 | 2 | 16 | 16 | +2 |
| heyu@mijing-anhe | 3 | 14 | 3 | 18 | 18 | +4 |
| qiuyu@mijing-anhe | 3 | 14 | 3 | 18 | 18 | +4 |
| yezhu@mengshan | 1 | 14 | 1 | 14 | 15 | +0 |
| lang@mengshan | 1 | 14 | 1 | 15 | 15 | +1 |
| xiong@mengshan | 1 | 14 | 1 | 14 | 15 | +0 |
| longzhi@songlin | 1 | 14 | 1 | 14 | 15 | +0 |
| zheng@yaoyuan-wai | 1 | 14 | 1 | 15 | 15 | +1 |
| yezhu@yaoyuan-wai | 1 | 16 | 1 | 14 | 15 | -2 |
| lang@songlin | 1 | 14 | 1 | 15 | 15 | +1 |
| gui@sishui | 10 | 25 | 10 | 27 | 28 | +2 |
| renyu@sishui | 10 | 25 | 10 | 28 | 28 | +3 |
| heyu@sishui | 10 | 25 | 10 | 27 | 28 | +2 |
| tianma@taihang | 10 | 25 | 10 | 27 | 28 | +2 |
| linghu@taihang | 10 | 25 | 10 | 25 | 28 | +0 |
| renyu@liuwan | 10 | 25 | 10 | 28 | 28 | +3 |
| heyu@liuwan | 10 | 25 | 10 | 27 | 28 | +2 |
| chihu@yaoyuan-wai | 1 | 16 | 1 | 15 | 15 | -1 |
| shanli@yaoyuan-wai | 1 | 16 | 1 | 15 | 15 | -1 |
| mihou@yaoyuan-wai | 1 | 14 | 1 | 14 | 15 | +0 |
| fushe@yaoyuan-wai | 1 | 16 | 1 | 16 | 15 | +0 |
| congcong@yaoyuan-wai | 1 | 14 | 1 | 14 | 15 | +0 |
| xiegou@yaoyuan-wai | 1 | 16 | 1 | 15 | 15 | -1 |
| lang@yaoyuan-wai | 1 | 16 | 1 | 15 | 15 | -1 |
| xiong@yaoyuan-wai | 1 | 14 | 1 | 14 | 15 | +0 |
| lingling@yaoyuan-wai | 2 | 14 | 2 | 16 | 16 | +2 |
| cangying@yaoyuan-wai | 4 | 17 | 4 | 18 | 19 | +1 |
| yuanhu@yaoyuan-wai | 4 | 17 | 4 | 19 | 19 | +2 |
| jingjing@yaoyuan-wai | 4 | 17 | 4 | 17 | 19 | +0 |
| chai@yaoyuan-wai | 5 | 20 | 5 | 20 | 21 | +0 |
| bibi@yaoyuan-wai | 5 | 20 | 5 | 21 | 21 | +1 |
| dangkang@yaoyuan-wai | 5 | 20 | 5 | 19 | 21 | -1 |
| geju@yaoyuan-wai | 7 | 22 | 7 | 22 | 24 | +0 |
| qique@yaoyuan-wai | 7 | 22 | 7 | 24 | 24 | +2 |
| **mean of 36** | | 17.8 | | 18.6 | 19.3 | +0.8 |

His ten does not follow the realm's curve (qi 1 1 1 2 2 2 3 3 4 4 = 23 and foundation 27): he holds 14 at levels 1-3 (the road's hand), 16 at the 后山崖顶 stops, 17 at level 4, 20 at 5, 22 at 7 and 25 at 10, about +1.2 a level
and flat for the first three. The beast follows the budget (+1.5 a level, mean 18.6 against a budget of 19.3). The gaps: +4 at level 3 (秘境 暗河, both fights), +3 at level 10 (人鱼), +2 in eight fights, -1 to -2 in six, five of them 后山崖顶 stops where his hand holds 16. On average the beast's ten is dearer by 0.8.

### Verdict: cards, deck-out or the bot?

**Mostly the cards, with deck-out explaining the draw-bodies and not the draw spells, and the bot changing the size of the effects and not their sign.**
- *Cards.* Sweeps (+26 to +30 for 停波 · 震怒), the 4-cost bodies, 石兽 (+17) and the dear single blows (燎天 -33, 寒潭指 -14) keep their sign with fatigue off (controls move about 4 points at most), on independent deals (0.9) and under lookahead (all 13 rows keep their sign).
  Pure draw spells (悟道 · 吐纳 · 参悟) get *worse* with fatigue off (-12 to -15, -19 to -23): they are dead cards in a game that shows the whole ten anyway, not a deck-out effect.
- *Deck-out.* It is real for the 入阵-draw bodies: 小赤狐 · 狰 · 童灵 -8 to +1, 精卫 -18 to -10, 泰逢 -32 to -17, 铁蒺藜 -19 to -13. In the story fights his pile is empty at ply 11 in 70-88% of them, the beast's at ply 13 in 40-56%;
  反噬 is 7.5% of the loser's damage with gear and 12.4% bare, and the killing blow in 19% and 36% of decided fights. A ten-card deck is seen in about 17 plies, so a fight that runs past it is decided by who drew less.
- *The bot.* Lookahead halves the sweeps and more than doubles the penalty of the draw spells; careful rates a sweep about twice as high as lookahead does. The ranking of the extremes is the same on both lines. What the bot cannot explain is the paper figures' failure (-0.09 over the 51):
  the yardstick is a poor predictor whichever line plays.
- *Reading for the fitting.* The base and its meta (body-heavy tens) matter more than the sampling: use the 5-sign-flip cards (青光 · 珠光 · 猴儿 · 雷仆 · 燎原) as undecided, and take a level to be **3 points**, so "a set worth about a level" means roughly a fifth to a tenth of today's gear.
