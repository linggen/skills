# Lingjing — status

The one list of what is in flight, parked, not started, and waiting on Hanli.
Every agent reads it before starting and edits its own row when it lands (hash or tag, date).
Systems themselves live in `design.md` (【已建】 · 【在建】 · 【远景】); this file is only the work.

Updated 2026-10-16.

## In flight

| What | Where | Started |
|---|---|---|
| Pacing + economy: `tools/balance.mjs` + `balance.json`, 修为 stage quest every 回, story floor removed (`8f112416`), pool-fight daily diminishing | fresh build (the 10-15 one was lost unpushed) | 10-16 |

## Done lately

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
- 秘境 reruns: rooms built; retune once balance.json lands.
- 哇时刻; 画面效果 (PixiJS + GSAP).
- Playtest crawler: a human-like bot per board, dead-control detection.

## Parked (tags, not merged)

- `wip/2026-10-15-aigames` — AI games follow-ups (二十问 while 银月 sleeps, 事 row, token tap, scratch chat binding); 5 tests red.
- `wip/2026-10-15-soul` (linggen) — Yinyue as the story's proud 妖王 银月; waits for Hanli's read.
- `wip/2026-10-15-footer` — 10-15 morning 去往/footer stash; likely superseded by later footer commits; check before dropping.
- `wip/2026-10-15-language-draft` — an older `rules/language.mjs`; main has the newer one.

## Not started

- AI games, next batch: 猜灯谜, 银月的心事, 斗嘴, 论道 · 飞花令, 说书接龙, 下棋陪聊 (对对子 is being built 10-16).
- After the first launch (Hanli 10-16, 「先把第一版上线, 后面再说」): 守鼎 tower defense (护山大阵 on the mountain path, towers from his deck, 五行 counters; prototype ≈ 2–4 h of agent time); a walkable top-down map (≈ a week+). Not doing: a Battle City clone; a 说书人 narrating live fights (no LLM inside a fight's loop).
- 卷二 opening re-plan.
- Rebuild the bug list: the 10-15 list (items 1–55) was lost in the 10-16 reboot; a fresh playthrough finds them again.
- 【远景】: 你自己的小人书, 斗法 PvP and raid, the table, server authority.

## Waiting on Hanli

- Play the latest build 古一 → 古四 before the per-回 expansions and 卷二 (launch waits for his full playthrough).
- 10-14 asks: 拽/忍 redraws; village-map lines; skip on the first six beats; 闵丹师 mark 07:179; 古三 box merge.
- Weather density, by his eye.

## Known red

- `mishi.test.mjs` "a real 秘境 rerun … 暗室" — red on main since 10-15.

## Known

- Pools outlasted, not lost (lookahead, 10-16): 领胡 (太行) lost 0%, timed out 27%; 野猪 on the 后山崖顶 lost 5%, timed out 37%. Left as they are; fight-band.test holds only the story fights to lost ≥ 8%.
