# Chapter 1 · 冀州之鼎 — beat sheet

> **Status (2026-09-30):** the six scenes below are the OLD spine (狍鸮 fed brides by a
> sorceress, 筑基 at the cauldron). The book's 第九回 / 第十回 (story/jiuding-lu/09-, 10-)
> tell it differently, so this chapter is not aligned yet — see **Proposed rewrite** at the
> end, which waits on Hanli's call (it moves the 筑基 and drops the 狍鸮 boss).

The first open chapter: the spine as waypoints. Six scenes at four places
of 冀; the player walks between them, and the province's seeds, market and
creatures fill the days in between. About twenty minutes of story over as
many days as the player likes. **Not played yet**: `coming` in chapter.json — the chapter
waits behind 「第九回 · 即将开放」 until it is rewritten to the book (below).

1. **Arrive** (`01-arrive`, 漳水南岸). The road north ends at a yellow
   river. Yinyue feels the cauldron breathing under the water. A fisherman
   won't cross: tonight the River Lord takes his bride. The town is Ye.
2. **Ye** (`01-ye`, 邺城). A notice on the gate: the sorceress has chosen
   this year's bride; the rite is at the shrine at dusk. The market is on
   East Street (the place's shelf; Trade). Ling: the cauldron's breath
   follows the river to the shrine.
3. **The shrine** (`01-altar`, 河伯祠). The sorceress, the girl in red, the
   drums — and from the water not a god but 狍鸮, a sheep-bodied thing with
   a man's face, fed a bride a year. The fight (五行, its root earth), the
   sorceress's riddle, or — as 西门豹 did — send the sorceress in to ask the
   River Lord herself. Any of the three ends the rite. Win → the deeps.
4. **The deeps** (`01-deep`, 漳渊). The water parts. The cauldron in the
   riverbed, sealed with the nine squares of the Luo River. The seal is a
   riddle: what sits at the heart. Answer → the cauldron.
5. **The cauldron** (`01-cauldron`, 漳渊). 冀鼎 rises. Its breath enters the
   one who is ready: at the peak of 练气, the Foundation is laid (the
   breakthrough exit; not yet at the peak, the cauldron waits — *修为未到*).
   Yinyue's first memory: someone laid her in the water and said *wait for
   one who comes*.
6. **East** (`01-end`, 漳渊 → 邺城). The girl goes home; the sorceress does
   not come back up. The second cauldron's breath lies east, in 兖. The
   chapter ends.

**Never in chapter 1:** what the cauldrons are for, Yinyue's second memory,
any realm above 筑基, the names of the other eight cauldrons.


---

## Proposed rewrite to the book (awaiting Hanli — nothing below is built)

The book differs from the old spine in three ways that are design calls, not text swaps:
1. **筑基 moves out of 冀.** In the book he lays his Foundation on the cliff at 沉鼎观
   (年三 九月初三, 第九回) *before* going north; the cauldron gives the first 鼎, 银月's second
   tail and memory — no breakthrough. So `breakthrough: true` leaves `01-cauldron`.
2. **No 狍鸮, no boss fight in 第十回.** The 河伯 is 冰夷 (real, and never wanted brides); the
   巫祝 and 三老 sold girls; 小满 wins by 「送去给河伯报信」 and by talking to 冰夷 — 文戏.
   Losing the chapter's only fight costs 打戏 (爽). Options: (a) follow the book, no fight;
   (b) a game-only fight with the 巫祝's red-robed 女弟子 / the 三老's 打手 at the altar
   (human, fits the book); (c) keep a creature fight in the deep (the seal's guard).
   Recommend (b).
3. **第九回 needs scenes** (h09 opens 01-ji but no scene carries it).

**第九回 (new, all at 沉鼎观; ids new):**
- `09-snow` 雪夜 · 官丹入饭桶 (pass-through; 小狰 scares off the thief)
- `09-furnace` 开春 · 残株九转 — three 九转筑基丹 + three 九转聚气丹; notes to 阿禾 / 孙二狗 as
  「钱掌柜押宝的头彩」
- `09-year` 一年 · 清明六 → 入秋九层圆满 — played through the existing days (修为 gate:
  练气九层圆满)
- `09-qulao` 瞿老讲他最后一个徒弟 → 外公; 「那颗丹，别吃」
- `09-cliff` **key beat** 九月初三 崖顶筑基 — `breakthrough: true` moves here; 心关 惧
  (the 「勿入」 door, 「今日放学」); 「几道纹？」「……一道。」; 周衡 「观里那颗」

**第十回 (re-point the six ids; ids stay for saves):**
| id | becomes (book 10's scene breaks) |
|---|---|
| `01-arrive` | 观主派差 · 阿禾跟来 · 路上的账 · 第十天傍晚到漳水 (breaks 0–3) |
| `01-ye` | 客栈 · 周衡的旧账 · 三老 (bribe fails) · 豆腐坊 · 白床单 (ghost fails) · 井台算账 (4–9); the two failed plans as the player's choices |
| `01-altar` | 十月十八 河伯娶妇: 巫祝「送去报信」, 三老 kneel and pay back (10–11) — the fight per option (b) |
| `01-deep` | 漳水停了 · 冰夷 · 「你身上，有青丘的味道」 · 下水 · 洛书之封 (12–15); the seal riddle stays (五居中央; 「三的底下是八」) |
| `01-cauldron` | 第一鼎 · 银月第二尾与第一段记忆 · 赵昂 「天下，该归于一」 (16) — **no breakthrough** |
| `01-end` | 豆浆 · 柳湾 · 周衡的阿姊 → 东边兖州 (17–19) |

**Code / tests this needs (shared, not this lane's):** move the breakthrough gate and its
tests (breakthrough, stage-cards, confirm, kept-win); boss-cards / boss-lines / redesign /
shelf-tames reference 狍鸮 at `01-altar`; hui tests for h09 scenes; drop `coming`; 01-ji's
`first_scene` → `09-snow`; content lint. ~20 test files mention 01-ji.
