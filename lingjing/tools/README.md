# tools

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
- Flags: `--route=exit,exit` picks exits in order. `--until=<scene>` stops at a scene. `--games=skip|win` and `--fight=win|lose` force a mode. `--chips=off` skips the chip checks. `--headed` shows the browser.
- Exit code 1 means a hard finding.
