# tools

## The game's tests, in layers (2026-10-15)

| Layer | What | Run |
| --- | --- | --- |
| health | `scripts/rules/health.mjs` — what is wrong with a save (blank stage, every way out shut, a fight that should not be there, wrong place, 修为 out of the 回's band, owed passages), each with a safe repair where there is one. Ling's **Unstick** applies those. | `node --test lingjing/tests/health.test.mjs lingjing/tests/unstick.test.mjs` |
| 1 · explore | `tools/explore.mjs` — 卷一's whole state space from a fresh save: every exit, every board's grades and its skip, every scene fight won and lost-then-retried; equivalent saves merged; health at every save; coverage of scenes, exits, boards, grades, fights; 卷一's end ahead of every save. ~10 s. | `node lingjing/tools/explore.mjs` (`--json`, `--fast`) — in CI: `tests/explore.test.mjs` |
| 2 · sweeps | whole plays by policy: all-win, all-skip, lose-then-retry, random×50 — each ends 卷一 clean, the realm per 回 printed | `node lingjing/tools/explore.mjs --sweep` · `--sweep=random --seeds=50` |
| 3 · page | `tools/page-crawl.mjs` — the live page, headless Chrome: each board module beaten by a human-like bot (~200 ms reaction, real pointer events, 3 tries), every visible control tapped and a dead one named. Needs the engine on 9527; scratch saves only. The bots alone run in node (`node lingjing/tools/board-bots.mjs [module]`, and `tests/board-bots.test.mjs` in CI). | `node lingjing/tools/page-crawl.mjs --boards [--only=<task>]` · `--controls [--scenes=<id>,…]` — findings in `--out` (default /tmp/lj-page-crawl) |
| 4 · hands | `tools/play-human.mjs` — every kept small game on the live page (story boards on scratch saves at their scenes, the 饭桶's tool days and the throwing kit on the try page) by human-like hands on Playwright: 1440 mouse and 390 touch (DPR 3), real pointer/touch at frame rate, 0.4–1.2 s reactions, aim error, lapses; policies casual · sloppy · idle; never a game's code or state. Checks: dead/slow taps (150/500 ms), controls never alive, a tool that does nothing when touched, overlap/clipping, code-drawn shapes (`UI_GLYPHS` allowlist), the win's end frame and no fresh-board flash, the outcome spread, page errors. Key frames in `frames/`; video + trace for failing runs. Boards being cut sit in `SKIP`. | `(cd lingjing/tools && npm install)` once, then `node lingjing/tools/play-human.mjs [--games=rain,bread,fantongcut-spring] [--widths=1440,390] [--policies=casual,sloppy,idle] [--seeds=2] [--jobs=3] [--out=<dir>]` — `npx playwright show-trace <out>/trace/<run>.zip` |

## playtest — the crawler

Plays 卷一 on the real page and flags every stall. Run it after any change to the stage, the story view, a game or a scene.

```sh
# fast, no browser: every scene and exit of 卷一 by the rules (also part of the test suite)
node --test lingjing/tests/playtest.test.mjs

# the page, headless Chrome, a fresh scratch save, every fork and every fight lost once
node lingjing/tools/playtest.mjs --all --save=pt-run --from=fresh --out=/tmp/lj-playtest

# one line from a save you already have, phone width, reloading every 25 taps
node lingjing/tools/playtest.mjs --save=pt-x --phone --reloads=25 --steps=300
```

- It plays only a scratch save (`?save=<name>`, under `data/saves/`). It never opens the player's own save or chat.
- At each tap it checks: something to tap, the tap did something, no console error, a realm on the strip, 回看 and 跳过 work, chip popovers open whole, and a 交差 or 收下 shows feedback.
- Games are skipped (「算了，往下走」) or won through the page's scratch-only seam (`__lingjingPlay.win`), whichever that game has had less of. Fights are played with real taps, to a win and, on a fork, to a loss.
- Output goes to `--out`: `findings.jsonl` (one line per finding, with its screenshot), `coverage.json` (scenes, exits, games, fights and chips seen, merged across runs) and `shots/`.
- Flags: `--route=exit,exit` picks exits in order. `--until=<scene>` stops at a scene. `--games=skip|win` and `--fight=win|lose` force a mode. `--chips=off` skips the chip checks. `--headed` shows the browser. `--width=1440` (default 1280); `--phone` is 390×844 at DPR 3 with touch taps.
- `--games=hands` plays each story board with play-human's hands (`--hands=casual` default; per board `rain-basins:idle` sits until the flood, `bread-share:skip` waits for 「算了，往下走」); a board control that changes nothing is a soft `board-dead-tap`.
- Every `/api` call is timed: over 1.5 s or failed is a soft `api` finding; a slow or dead tap carries `pending` (what was in flight — engine vs page).
- Exit code 1 means a hard finding.
