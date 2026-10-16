# Lingjing — status

The one list of what is in flight, parked, not started, and waiting on Hanli.
Every agent reads it before starting and edits its own row when it lands (hash or tag, date).
Systems themselves live in `design.md` (【已建】 · 【在建】 · 【远景】); this file is only the work.

Updated 2026-10-16.

## In flight

| What | Where | Started |
|---|---|---|
| 后山崖顶 roster: 15 beasts (9 东山经 woodcuts, 6 painted), 36 items, loot, 观 finds | merging tag `wip/2026-10-15-bestiary` | 10-16 |
| Pacing + economy: `tools/balance.mjs` + `balance.json`, 修为 stage quest every 回, story floor removed (`8f112416`), pool-fight daily diminishing | fresh build (the 10-15 one was lost unpushed) | 10-16 |

## Done lately

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

- AI games, next batch: 猜灯谜, 银月的心事, 斗嘴, 论道 · 飞花令 · 对对子, 说书接龙, 下棋陪聊.
- 卷二 opening re-plan.
- Rebuild the bug list: the 10-15 list (items 1–55) was lost in the 10-16 reboot; a fresh playthrough finds them again.
- 【远景】: 你自己的小人书, 斗法 PvP and raid, the table, server authority.

## Waiting on Hanli

- Play the latest build 古一 → 古四 before the per-回 expansions and 卷二 (launch waits for his full playthrough).
- 灵草谷 犰狳: won ~62% but lost only 1% (37% time out on 见人则眠's heals) — re-weigh so a careless player can lose?
- 10-14 asks: 拽/忍 redraws; village-map lines; skip on the first six beats; 闵丹师 mark 07:179; 古三 box merge.
- Weather density, by his eye.

## Known red

- `mishi.test.mjs` "a real 秘境 rerun … 暗室" — red on main since 10-15.
