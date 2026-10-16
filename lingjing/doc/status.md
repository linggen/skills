# Lingjing — status

The one list of what is in flight, parked, not started, and waiting on Hanli.
Every agent reads it before starting and edits its own row when it lands (hash or tag, date).
Systems themselves live in `design.md` (【已建】 · 【在建】 · 【远景】); this file is only the work.

Updated 2026-10-16.

## In flight

| What | Where | Started |
|---|---|---|
| Small games — doc/games.md for Hanli's design check; mechanic changes wait on it (UI polish and stuck fixes go on) | `doc/games.md` | 10-16 |

## Done lately

- 10-16 — Story view: 自动 · 全文 · 跳过 replace 慢 · 中 · 快, kept per viewer for every passage (跳过 goes to the passage's end and choices, every passage still told and in 回看); while a passage plays the footer chips, roads, header cards and tray are dimmed and a tap says 「读完或跳过」; a reload opens on the same beat and 全文 page (`bad5e46a`). Ling held too (`b7d5fb89`): while a passage plays her world-changing calls are refused `reading` and her Look says words only; ended, the page reports `[scene] read` (rules/reading.mjs). 游戏厅（测试） chip on a phone moved to the chat bar's corner (`156b78e8`).
- 10-16 — 射鹿 · 拉弓, a 愤怒小鸟-style prototype (`deerarc`, 游戏厅 only — the story's 射鹿 is still `deer`): drag back anywhere on the scene to draw (bow bends, string stretches, trembles full), let go; matter.js arc with wind (streamer, leaves, leaning tufts); he stands at the right so the headwind's answer is literally 「往左偏半寸」 (银月's line and a tick after a miss on the wind level). Four levels in `games.json`: 静 · 风 · 走 (lead a walking deer) · 芦苇 + 枯枝 (reeds snap with stub and chaff under a fast arrow, else turn it; the branch turns it). Heart = clean ink burst, slow-mo beat, the deer bolts; a graze spooks it (costs the arrow); a miss puts the next arrow on the string at once, its trail stays as the teacher; the arc hint only on a level's first arrow; stars by arrows (1/2/3+), popping; quiver of 4. `mount.js` holds and drags now carry scene coords (`sceneAt`). Aim-search bot (`bots/deerarc.js`), tests at 10 and 50 ms (`tests/deerarc.test.mjs`). Deer · bow · arrow are PLACEHOLDER ink until the painted sprites land.
- 10-16 — 游戏厅（测试） chip for the builder (`82144007`, `8633b943`): `scripts/dev-arcade.js`, shown only for the developer account (`/api/account?app=lingjing` → `gate.developer`, over the data channel) or a scratch save; under the 测试存档 badge (top right; top centre on a phone); opens `arcade.html?dev=1&from=game` in a new tab, the arcade then shows 返回游戏 (keeps a scratch `save=`). The no-link test allows exactly this gated door. Live on 9527 at 1440 and 390 (developer true, scratch); developer false stubbed: no chip.

- 10-16 — Weak small games cut (`903a00c0`, `c6fffe04`): 追踪 · 听 · 扔石听声 · 攀 · 算盘 gone (board, task, registry, module, bot, tests); 00-storm's and 00-cave's split passages whole again; 忍字 · 认路 · 算账 kept for the 1,500 字 reading cap, to be replaced by 割绳子 levels — games.md has a "cut 10-16" column and the 割绳子 slots per scene (book reason, element) as future level data; the second tier and 吹鹅毛 marked "replace if it isn't fun". Rhythm 23 over before and after, none longer. Old saves let an offered cut board go. 练气 re-fit 一层 250 → 270 (`fe602d10`, the same number `4bf58977` reached). rope.js one export a line so install-skill's link check passes (`360b162b`). Live at 390 on scratch saves (deleted after): 00-storm and 00-cave read through to their ways on with no empty box; a hand-made pre-cut save at 00-cliff dropped its offered 攀 and went on.
- 10-16 — 小队斗法 + 得牌 (`c1eff38d` engine, `a37181b3` data · 出处 · balance, `7fb271f1` page, `4bf58977`, `9adfc243`; reveal component `e5a60872`; docs `a0266e27`): a side is a row of members (阿禾 heals and binds, 孙二狗 guards; 古七 three, 古八 on two; 银月 from 卷二), every card says where it comes from (cards.json `from`, 书/游戏), no starter at the 灵根 test, the book's cards as new ids with old saves mapped, the 得牌 reveal (card-reveal.js) and 新 in hand; every fight re-weighed (tools/reweigh.mjs); 练气 layer 1 is 270 either way (the 狰 fight gone; the beat cut fe602d10 re-fit to the same). As built vs plan: doc/cards.md § 0.
- 10-16 — 喂饼 rebuilt as a 割绳子-style physics puzzle (`02183923`), the first new small game: matter.js 0.20.0 vendored (MIT, no network); four levels in `games.json` (一根藤 · 两根藤 · 石板 · 洞口风), each solved by the order of cuts with the 饼 hanging still; tap or swipe a vine, a puff of wind to tap, 饼角 = stars (3), instant retry, 重来, stuck after 4 misses; the ending is the book's 「连个谢字也没有」. Stars on the save (`stars['bread-share']`, best kept, Look shows them) for pay to scale on later; pay unchanged. The win always feeds the fox, so it opens 分它一半 (grade half · most); 自己吃 now only on a skip — Hanli's 10-14 piece-by-piece choice is gone with the old board. Bot answers per level. Played by hand live on 9527, scratch `breadtry`: try page and story at 1440 (a wrong order missed and came back, a missed corner offered 再来), the story at 390 (touch swipe, all four, 3 stars, save `00-yinyue`).
- 10-16 — 小游戏 UI pass + standalone games: `doc/games.md` for his check (`6eba1b54`); the shared kit — 成 stamped on every won board, an ink ring at every press, counts that bump, the goal line set off (`2536b369`); 接雨 one-tap swap and 满 (`87a0841a`); 射鹿 正中 · 偏左半寸 and a bow button that says 拉 / 满了松手 (`df492629`); 吹鹅毛 pace strip 憋 · 匀 · 急 (`d2dc07f1`); page-crawl hit-tests a press (写信 · 认方 at 390, `3f79e8c6`); the mount() contract, `beat-host.js`, `beat-won.js` (the 得牌 hook), `games.json` (53), the 游戏厅 `arcade.html?dev=1` and try page, never linked (`c5c69f09`). Live at 390 and 1440 on scratch saves. Mechanic redesigns wait on his read of games.md.

- 10-16 — 开仓 counts any stock added, watched or held, 0 shares OK (`0c81e4cb`); a phone add sends the `cfo-first-stock` fact so the Mac stamps at once (linggen-mobile `09f1035`, phone install waits).
- 10-16 — 对对子 (`cb375ca3`): 褚先生 at the 讲堂 after 古六, 一字 → 五言 from 《声律启蒙》; form checked by the rules as he types (新韵 tones.json), Ling grades the rubric (Duizi), marks pay and open rungs; reverse unpaid; 银月's hint and 下联 only awake (Couplet); no door in English. Live on a scratch save: the card, two rounds and a reverse played; the grades came from the model (agent_run), fed in as Ling's Duizi call (a scratch save never messages Ling).
- 10-16 — 开府 gains CFO's 开仓 · 在 CFO 的投资里添一支股票 (`7dd1b884`, `cfo-first-stock`): stamped when a holding is saved or when CFO loads with one held, only the fact; opens after 开天眼, before 借天火. Live: stamped on load, seen in a scratch save's 开府 list.
- 10-16 — Pacing + economy (`9c42af47`, `9fbba840`): `worlds/jiuding/balance.json` holds every number (layers, pay, conversion, cooldowns); `tools/balance.mjs` plays light/typical/heavy day by day (typical ≈5–7 days a 回, 古六 ≈8; heavy ≈3–5; light ≈8–15); `--fit` sets 练气 [0,210,390,410,430,480,500,740,760,780]; 阶段任务 in every 回 past 古三 (rules/gates.mjs); story floor gone; rerun open through 00-zhuji; state v10. Follow-up (`2cff1891`, `e0e43edb`, 10-16): no daily thinning (Hanli: only 圆满 → 灵石); 古七's cap follows its rises (grinding stops at the next stage quest's layer — no rise a no-op); 闭关 and 体力 in the model; re-fit 练气 [0,250,480,500,520,540,560,1150,1170,1190]; the 事 row points to the work even at the waiting scene; live-checked on 9527 (scratch `econ-gate`). A refusal now stands over the choices it answers, any new one scrolled into view (`9fadf332`; live at 390 and desktop, scratch `econ-gate2`).
- 10-16 — 斗法 polish (`73222e12`, `2598747d`): ranks fit the field, hints on the seam, phone head one line, 攻/血 seals, end seal shows whose turn; a played card flies, the beast's 功法 shown, 气血 falls on the hit, 杀招 wind-up on the plate, the beaten plate goes to ink. Live at 1440 and 390.
- 10-16 — the other 22 后山崖顶 finds redrawn the same way (`be45ae26`), 猴儿酒 re-rolled; all 36 finds and the six beasts now in the house 水墨淡彩.
- 10-16 — 后山崖顶 art redrawn in the house 水墨淡彩 (`55386811`): the six beasts (赤狐 slim, 豺 low and heavy) and 14 of the 36 finds, by Codex 0.163 (gpt-6.1-sol) with a house picture as the style (tools/paint-wash-codex.py); the 野猪 · 狼 · 熊 loot picks accepted.
- 10-16 — binds get through 装睡 (`d8a4d41b`): `feint.pierce_binds` + card `binds` (青藤缚, 无支祁) — a bind at the sleeping beast holds it, that turn every blow goes in; 凶崖 pool 犰狳 hp 2.9 (lookahead 52/30/18 → 69/23/8; careless still loses ~83%).
- 10-16 — 犰狳 见人则眠 is 假睡 (`e6f8fe16`): `feint` in battle.js (装睡 turns, plain blows glance, metal goes in), 鸱目一睁 scales per glance, 蛇尾抽/鸟喙啄 deck; 灵草谷 lookahead 65/30/6 won/lost/timed out, careless loses ~60%; 暗河 pool 犰狳 hp 5.5→4.
- 10-16 — 后山崖顶 roster (`72680b96`, from tag `wip/2026-10-15-bestiary`): 15 beasts (9 东山经 woodcuts, 6 painted), 36 items, loot, 观 finds, 新 on cards; the 15 re-weighed on the lookahead player (fight-band-pools); 野猪 · 狼 · 熊 given loot (獠牙 · 狼皮 · 熊胆 had no source).
- 10-16 — fights calibrated on the lookahead player (`81c72985`); lookahead win rates ~57–70%, tutorials ~80%.
- 10-16 — 9527 on linggen `171d18e` (Settings reorg), verified live.
- 10-15 — 古七 five years played (`14578b8d`), 秘境 reruns (3 h), 饭桶 (1 h), 圆满 pays 灵石, 零层, 密室, AI games 二十问 · 讨价还价 · 断案, 银月 companion lines.

## Partly built (【在建】 in design.md)

- Per-回 gameplay pass: 古六 and 古七 done; 古四, 古八, 今线, 古九 to do.
- 剧情 × 开放世界 (tasks drive the story, key beats lock the map).
- 丹药 in the game.
- 秘境 reruns: rooms built; cooldown in balance.json; drops and finds not in the 修为 model yet.
- 哇时刻; 画面效果 (PixiJS + GSAP).
- Playtest crawler: a human-like bot per board, dead-control detection.

## Parked (tags, not merged)

- `wip/2026-10-15-aigames` — AI games follow-ups (二十问 while 银月 sleeps, 事 row, token tap, scratch chat binding); 5 tests red.
- `wip/2026-10-15-soul` (linggen) — Yinyue as the story's proud 妖王 银月; waits for Hanli's read.
- `wip/2026-10-15-footer` — 10-15 morning 去往/footer stash; likely superseded by later footer commits; check before dropping.
- `wip/2026-10-15-language-draft` — an older `rules/language.mjs`; main has the newer one.

## Not started

- AI games, next batch: 猜灯谜, 银月的心事, 斗嘴, 论道 · 飞花令, 说书接龙, 下棋陪聊.
- After the first launch (Hanli 10-16, 「先把第一版上线, 后面再说」): 守鼎 tower defense (护山大阵 on the mountain path, towers from his deck, 五行 counters; prototype ≈ 2–4 h of agent time); a walkable top-down map (≈ a week+). New small games on proven mechanics (design.md § 新小游戏): 射鹿 as an 愤怒小鸟-style drag-and-arc shot (wind, lead), 顺风溜 as a forgiving 几何冲刺-style one-tap runner (古七). Not doing: a Battle City clone; a 说书人 narrating live fights (no LLM inside a fight's loop).
- 卷二 opening re-plan.
- Rebuild the bug list: the 10-15 list (items 1–55) was lost in the 10-16 reboot; a fresh playthrough finds them again.
- 【远景】: 你自己的小人书, 斗法 PvP and raid, the table, server authority.

## Waiting on Hanli

- 对对子 (10-16): 对对子 in English (none now — an English counterpart or none?); 银月's own 下联 is a button (「银月也对一句」), not automatic after each grade — keep, or let her offer unasked (a turn each round); lundao's old 对对联 at 稷下 vs the future 稷下 rung of 对对子 — unify when 齐 is built.
- Economy feel calls (10-16, `9c42af47`): the stage-quest gates sit at beat entries so he can walk away to earn them — 古四 the 柴房 night (not 第一路), 古五 the 秘境's door (not 息壤), 古六 the 大比's eve (wm-qianye), which makes 古六 ≈7–8 typical days. The rerun kept open in 00-zhuji. Minutes, reading speed (450 字/min) and the three players are guesses — hand-play them. A rising ladder with 古七 holding two layers is why heavy 古五/古六 come in at ≈3–4.5 days. 古九 has no quest (九转 lands full).
- Play the latest build 古一 → 古四 before the per-回 expansions and 卷二 (launch waits for his full playthrough).
- 10-14 asks: 拽/忍 redraws; village-map lines; skip on the first six beats; 闵丹师 mark 07:179; 古三 box merge.
- Weather density, by his eye.

## Slow / stuck (for the bug hunt after the batch lands)

- The page re-reads 20–60 s after a tap on this machine (seen by the 对对子 agent, 10-16): likely a big part of 「不流畅, 会卡住」. Profile the tap → rules → re-read path first.

## Known red

- `mishi.test.mjs` "a real 秘境 rerun … 暗室" — red on main since 10-15.

## Known

- Pools outlasted, not lost (lookahead, 10-16): 领胡 (太行) lost 0%, timed out 27%; 野猪 on the 后山崖顶 lost 5%, timed out 37%. Left as they are; fight-band.test holds only the story fights to lost ≥ 8%.
