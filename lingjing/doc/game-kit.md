---
type: design
reader: coding agent, contributors
guide: |
  The shared small-game kit: one engine, one shell, one asset library, five play kits.
  The list of games and their verdicts is games.md; where games sit in the story is design.md.
status: 2026-10-20 — approved (Hanli: 「可以, 统一用Phaser, 按这个计划做. 加一个design文档吧」). The shell (layer 2) is built and every small game wears it (「确保所有小游戏一套外壳」); the Phaser kits still draw their own intro, pause and result inside it.
---

# Lingjing — the game kit (小游戏统一外壳)

## Why

Hanli 10-19: 「现在的游戏都有点粗糙, 美术不行, 不太像游戏」. Each board was built on its own:
its own canvas drawing, its own buttons in a web-form card, no sound, no shared art. One kit
fixes it once for every game: **one engine, one shell, one asset library, a few proven kits,
levels as data.**

## Rules (his)

- **Proven kits only** (10-16, 「小游戏要精选的」). Agents don't invent mechanics. A story beat
  that fits no kit becomes a told passage or a 大场面 set piece (10-19).
- **Comic / Angry-Birds style** for every small game (10-19). The story's stages and set pieces
  are not covered.
- **The 游戏厅 is Hanli's test bench only** (10-20). Players meet the games in the story, the
  秘境 and 兽潮, where a win pays and 灵气 paces play.
- **Every appearance is a new level, harder than the last** (10-20, for 守炉; the rule for all kits).

## Layers

| Layer | What | Where |
|---|---|---|
| 1 Engine | Phaser 3.90 + Matter, one vendored ESM build shared by every game | `scripts/vendor/phaser.min.mjs` |
| 2 Shell | boot/loading · level select · intro card (the story lead-in) · HUD on the art · pause · star result + rewards · transitions | `scripts/games/kit/` |
| 3 Assets | UI kit (buttons, panels, stars, icons), characters with action frames, fx presets, sound bank, music, fonts | `scripts/games/kit/assets/` + `doc/art-style.md` |
| 4 Play kits | one Phaser scene + one level schema each (below) | `scripts/games/<kit>/` |
| 5 Levels | one JSON table per kit; story, 秘境 and 兽潮 refer to rows by id | `worlds/jiuding/levels/<kit>.json` |

Sources are TypeScript under `tools/<name>/src`, bundled by esbuild into `scripts/` with Phaser
marked external, so the browser loads Phaser once. The bundles are committed (no build step at
serve time, per the repo rule).

## The contract (unchanged from 10-16)

```js
mount(container, { kit, level, lang, reducedMotion }) → Promise<{ won, stars, stats }>
```

A kit knows nothing of story, save or pay. The story's beat wrapper maps the result to rewards,
cards and the next scene. The shell owns everything around the play: the intro card, countdown,
pause, the result screen. A kit only plays.

## The shell, as built (10-20)

`scripts/games/shell.js` + `shell.css`. Every game, Phaser or not, plays inside one frame in all three places: the
story's board card (`cards.js`), the 游戏厅 (`arcade.js`) and the try page. The frame wraps the game's own host
(`[data-game]`, `[data-mount]` or the slot) untouched:

- **Bar:** title and pause (shown for a game in time: `tick`, or `meta.pause` for a kit with its own loop).
  The how-to line sits under it. On a Mac a tall board puts the bar in a column beside the stage.
- **Layer over the stage:** the pause veil, the lead card (its line, then 3-2-1 for a game in time, else a 开始
  tap), and the speech bubble (`say(id, who, text)`, where 台词预取's lines will land).
- **Result line:** won or not, stars, grade, then 再来 or 下一关. Off the story only; in the story the win goes on
  to the pay and the 得牌 card as before.
- **State lives in a store keyed by the board, never the DOM.** The story lays its card again on every Look and
  draws the frame from the store. A game hears the shell through `mount(…, { shell })`: `paused()`, `say()`,
  `onPause()`. mountPure and 气走经脉's own loop stop their clock and input while paused, and the story's
  clock stops as it does for 回看.
- **`tests/game-shell.test.mjs`** loads every registry game as a `mount()` or a pure board, and checks that every
  place a game plays uses the shell.
- **Next:** the Phaser kits (守墙关, 撒豆成兵, 砸寨) and 守炉 hand their intro, pause and result to the shell
  (`opts.shell`), so nothing shows twice. The prefetch call itself comes after that.

## Play kits

| Kit | Games on it | Control | Physics |
|---|---|---|---|
| 投掷 throw | 砸寨: the forts and every story throw as a level (射鹿 `deer-wind`, 暗河 `anhe-dark`, 芦苇里那一等 `yishui-reed`; 10-20) | pull and release | Matter |
| 塔防 defense | 守炉, 兽潮, the 回 levels | place 符, move the hero (银月), cast 掐诀 | none |
| 绳索 rope | 割绳子, 饭桶 | cut, bounce | Verlet |
| 一键飞行 flight | 御剑 (tap), 气走经脉 (hold) | one button | none |
| 打地鼠 whack | 接雨 | tap | none |

A new kit needs Hanli's play-through on a prototype first, the way 守炉 got in (10-20).

## Shared assets

- **Characters are shared across kits.** One 野猪 with one set of action frames
  (idle, walk, hit, poof) serves 塔防, 投掷 and 秘境. The same goes for 小满 and 银月.
- **Fx presets:** dust, sparks, ink splat, the poof, screen shake, hit-stop, slow-mo.
- **Sound:** a CC0 bank (Kenney UI and impacts) plus ZzFX for generated effects, one music bed per kit.
- **Art:** painted by the image model (Codex / FLUX) from `art-style.md`. No code-drawn
  characters in a finished game. Packed into atlases.

## Levels as data

Each row has `id`, `kit`, `title` (zh/en), `lead` (the intro line), the kit's own fields
(map, waves, fort, rope layout…), `stars` (thresholds), `story` (scene id or null). A rising
ladder is a sequence of rows. Every kit keeps a bot or sim, and a test asserts each row is
winnable by a sensible play and not by a lazy one.

## Order (approved 10-20)

1. **Now:** 砸寨 finishes on Angry Aliens; 守炉 gets its play solid (core separable from UI).
2. **Extract the shell** from 砸寨 into layers 1–3. `art-style.md` goes comic. 砸寨 re-hosts
   on the shared shell as its first user. **Gate: Hanli plays 砸寨 in the shell and approves.**
3. **New games on the shell:** 守炉 moves on; 御剑 + 气走经脉 are built as one flight kit.
4. **Old games, one at a time:** 射鹿 merged into the throw kit (done 10-20: every throw a level of 砸寨, deerarc deleted), then 割绳子/饭桶, then 接雨.
   Each port keeps the game's logic and bot, redraws on Phaser, and deletes the old file.

## Mac and phone (decided 10-20, Hanli: 「可以, 按你说的做」)

The phone app is Flutter. It shows no webviews and never renders a Mac skill page (07-27), and the
game leans to pure Flutter (10-08). **One exception, for the play canvas only.**

- **Everything around the play is native Flutter on the phone:** story, chat, map, menus, the
  intro card and the result. The phone renders the shell's outer parts (intro card, result,
  rewards) itself, from the same level data.
- **The play itself is the same Phaser bundle,** shipped inside the app's assets and run in a
  local webview. It needs no network and no Mac. It speaks the contract over a JS channel:
  `mount(level)` in, `{won, stars}` and events (`hit`, `win`, `lose`) out. Flutter turns the
  events into haptics and sound.
- **Why not rewrite each kit in Flutter's Flame:** the work doubles, the physics differ
  (Forge2D vs Matter), so one level would play differently on each device, and every bot,
  balance check and level test would have to exist twice.

Design for both from the start:
- Touch first: every control works by finger, and nothing depends on hover. Mac adds the mouse
  and keys on top.
- The scene scales to fit (Phaser `Scale.FIT`) with a safe area, and works in portrait (phone)
  and landscape (Mac, or the phone turned). Throw and flight kits prefer landscape and say so.
- Smooth on a mid-range phone: atlases sized for it, a particle budget, `reducedMotion` honoured.
- Audio starts on the first tap (iOS). Fonts are bundled, never system-only.

## Game and chat (decided 10-20, Hanli: 「台词预取, 好主意! 就这么做」)

The play canvas never talks to the model. It sends **facts** out and takes **commands** in.
The host relays both ways: the page's chat bridge on Mac, Flutter's game controller over the JS
channel on the phone. The message shapes are identical, so a kit is written once.

- **Facts out:** `start {level}`, the kit's key moments (`boss`, `low`, `wave_cleared`…),
  `end {won, stars}`, and for AI games `{drawn, image}`. Ordinary hits and kills stay
  inside: they only drive haptics and sound.
- **Commands in:** `say {who, text}` shows a speech bubble over that character;
  `guess`/`answer` serve the AI games.
- **台词预取 (line prefetch).** Every word is 银月's (the "Yinyue writes every message" rule),
  but a model reply takes 1–3 s, which is too slow mid-fight. So at `start` the host sends the
  level's moment list once, and she writes a short line for each. The kit keeps them and shows
  each one the instant its moment comes. That's one extra call per level and zero latency in
  play. Only the end-of-level comment and the AI games ask live.
- **Layout:** while playing, the chat is folded (10-14). Her lines appear on the field. After
  the play the chat opens and she comments, then the story goes on.

## Not on linggensite

The source of truth is this repo, and the games ship inside the skill (Mac) and inside the app
(phone), so they play offline and the game always matches its level data. Later, optionally, a
**hot update**: the app checks linggen.dev for a newer game bundle, verifies and caches it, and
falls back to the built-in one. That needs versioned level data and a check of Apple's current
terms on remote code. linggensite may also host a playable **demo** (a level or two of 砸寨 or
守炉) as launch material, once the games are polished.

## Risks

- **A port is a rendering rewrite.** That's why it goes one game at a time, never a big bang.
- **Art volume.** Fix the style guide before painting in bulk, or the set drifts.
- **Phaser is about 1 MB.** That's fine locally and acceptable on the phone.
- **PixiJS stays for the story stage only** (MeshPlane to bring the paintings to life); it is not
  for games.
