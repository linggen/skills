---
type: design
reader: coding agent, contributors
guide: |
  The shared small-game kit: one engine, one shell, one asset library, five play kits.
  The list of games and their verdicts is games.md; where games sit in the story is design.md.
status: 2026-10-21 — § One engine (Phaser for everything drawn) is a PLAN waiting for Hanli's read; nothing built. 2026-10-20 — approved (Hanli: 「可以, 统一用Phaser, 按这个计划做. 加一个design文档吧」). The shell (layer 2) is built and every small game wears it (「确保所有小游戏一套外壳」); the Phaser kits still draw their own intro, pause and result inside it.
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
- **The kits in the shell (10-20):** 守墙关, 撒豆成兵, 守炉 and 砸寨 take `shell`. Their story lines go on the shell's
  lead card, over the field already drawn and standing still (`held`, then `go()`; Hanli: 「开场卡后面先画出画面」).
  The shell's pause drives their play, and their own pause button and result screen stand down; the big banners
  and the in-play 3-2-1 stay on the canvas as play. A won level names its next one (`r.next`), and the 游戏厅
  shows 下一关. 砸寨 restarts a lost level in place under the lead card, because a story board never settles a loss.
- **Next:** the prefetch call itself (银月's lines into `say`). Sound and music settings: 砸寨's were only in its
  own pause menu, so they are unreachable in the shell for now.

## Play kits

| Kit | Games on it | Control | Physics |
|---|---|---|---|
| 投掷 throw | 砸寨: the forts and every story throw as a level (射鹿 `deer-wind`, 暗河 `anhe-dark`, 芦苇里那一等 `yishui-reed`; 10-20) | pull and release | Matter |
| 塔防 defense | 守炉, 兽潮, the 回 levels | place 符, move the hero (银月), cast 掐诀 | none |
| 绳索 rope | 割绳子, 饭桶 | cut, bounce | Verlet |
| 一键飞行 flight | 御剑 (tap), 气走经脉 (hold) | one button | none |
| 打地鼠 whack | 接雨 | tap | none |
| 卡牌 card fight | 斗法 (`games/kapai.js`: the story's room, mounted in the 游戏厅 10-21 and in the story 10-22) | tap, or drag on a Mac | none |

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
  **Built 10-20:** `games/prefetch.js` turns the level into facts (its title, scene, beasts by name,
  and each moment with its meaning and the level's own lines as tone) and checks her reply line by
  line: only the level's keys, at most 16 字 (60 chars in English), in the player's language, no
  code. Anything that fails falls back to the data line for that moment. `games/prefetch-ling.js`
  asks her through `/api/chat`, in a side session bound to the same save with her tools withheld,
  and removes the session afterwards. Her reply is `LINES {json}` and then `SILENT`, so nothing is
  spoken aloud and the chat reader keeps the JSON. The story's host (`beat-host.js` `prefetch`)
  asks once per mount, as the lead card shows, for any game that exports `levelOf`: 守墙关 and
  撒豆成兵 (`meta.lines: 'one'`: it reads a single line rather than a pool). It asks only when she
  is awake. The game reads `lines[moment]` lazily, so a late reply still serves the moments that
  are left. The 游戏厅 and the try page keep the data lines unless `?prefetch=1` is set. A test
  save takes `&her=stub` or `&her=slow`.
  **Teaching moments stay data (10-21, Hanli: 「按你的建议来」).** A moment that teaches how to
  play must use exact words, so it always shows the level's own line. These are 守墙关 `open`,
  `lane`, `twist` and `boss`, and 撒豆成兵 `flip`, `rock`, `lane` and `slam` (`teach` in
  `prefetch.js` MEANS). She is never asked for them, so they're never in `lines`. She writes
  only the reactions: cleared, low, good or bad gate, clash, win and lost. A level with only
  teaching moments makes no call.
- **Layout:** while playing, the chat is folded (10-14). Her lines appear on the field. After
  the play the chat opens and she comments, then the story goes on.

## Not on linggensite

The source of truth is this repo, and the games ship inside the skill (Mac) and inside the app
(phone), so they play offline and the game always matches its level data. Later, optionally, a
**hot update**: the app checks linggen.dev for a newer game bundle, verifies and caches it, and
falls back to the built-in one. That needs versioned level data and a check of Apple's current
terms on remote code. linggensite may also host a playable **demo** (a level or two of 砸寨 or
守炉) as launch material, once the games are polished.

## The card fight in the shell (10-21)

Hanli 10-21: 「看是否游戏系统可以统一外壳, 现在我们把卡牌战斗也放进来了」.

**Done: the 游戏厅.** `games/kapai.js` is a DOM adapter on the mount contract. It uses the story's
own pieces: `battle.js` rules, `battleHtml` room, `playLog` strokes and `wireDrag` (now scoped to a
room and unwirable). It plays in the shell like any game:
- the bar shows the title, the type and the how-to line;
- pause (`meta.pause`) hides the hand and holds the beast's turn and the idle end-turn;
- the foe's lines appear through `shell.say`;
- the result shows ★ by the 气血 kept, with 再来 and 下一关 (the next foe in the book's order).

The fights come from `levels/kapai.json`, which `tools/arcade-fights.mjs` writes from
`story-fights.mjs` (`setupOf` and `rules/look.mjs duelBrief`). A test fails when the file is stale.

**Done 10-22: the story's fight room** (Hanli: 「故事里的对战迁移可以开」). `lingjing.js` mounts `games/kapai.js`
once per fight into a node of its own and lays it into a shell frame in the focus (`paintFight`, loaded by `import()`
as every game is). A redraw leaves the frame standing; the room and the shell's layer paint themselves in place.
The story keeps what a fight means as the adapter's `story` hooks:
- `data.st` and `data.catalog`: the state the door began, with its seed, because the rules replay the picks on it.
- `ctx(room)`: his name, 银月's card, the 丹囊 and 问银月. `onAsk` routes the 问银月 tap.
- `onMove(token)` builds the picks. `onStep` tells her when the beast lets its 杀招 go. `onPlayed({ before, mark, mine })`
  gives her cues after his move and after the beast's whole turn.
- `settle(st) → r` is `writeBout`, the rules' `write('duel', { picks })`. The closing card waits for the answer, and a
  refusal closes the room without one. `holdMs` keeps the card up 3 s, or 4.2 s with the foe's last word.
- When the mount settles, `settleBout` runs: 所得, the 符 spent, the tale's end, the engine reload.

The page's own room drawing, its `[data-spot]` route, its drag and its idle timer are gone. The room's own drag and idle
end-turn serve both places. 认输 stops a move still being drawn (`room.yielded`). The foe's first word and 银月's lines
show in the shell's bubble; it holds one line at a time, so her line replaces the foe's. Pause hides the hand and holds
the beast's turn, as in the 游戏厅. There is no 再来 or 下一关 in the story: a win goes on to the pay. The skip after
3 losses and the door's 丹囊 pick did not move (the door card and the rules). The probe (`bout`, `move`) reads the
mounted room. Found live: a card dragged by its painting started the browser's own image drag, so the room's pictures
are never dragged now (`battle-drag.js`). Tests: `arcade-kapai.test.mjs` (the story hooks: seed, picks replayed,
closing card after the rules, 认输, a refusal), `game-shell.test.mjs` (the page mounts it in the frame; no second
room, drag or tap route).

## Risks

- **A port is a rendering rewrite.** That's why it goes one game at a time, never a big bang.
- **Art volume.** Fix the style guide before painting in bulk, or the set drifts.
- **Phaser is about 1 MB.** That's fine locally and acceptable on the phone.
- ~~PixiJS stays for the story stage only~~. This was superseded on 10-21 (「按你的建议来, 统一用Phaser」);
  see § One engine below. Pixi and GSAP leave the vendor folder at the end of that plan.

## One engine — Phaser for everything drawn (10-21)

**PLAN, not built. It waits for Hanli's read.** Hanli 10-21: 「特效, 引擎, 图片都可以共享」 ·
「大场面的特效, 似乎也可以用新的游戏引擎来做」 → 「按你的建议来, 统一用Phaser」. The 10-20 rule (every small game
runs on Phaser 3.90) now covers everything drawn: the 大场面 set pieces, 画活, the weather, 银月's colour memory,
the 回 turn, 鼎归, and the effects of every game and fight.

### Where we stand (counted 10-21)

| What | Engine | Size |
|---|---|---|
| 守墙关, 撒豆成兵, 守山门 (sadoushou), 开炉 (kailu) | shared `vendor/phaser.min.mjs` | each has its own `tools/<g>/src/fx.js` (three near-copies, 466 lines) |
| 砸寨 | Phaser **bundled inside its own build** (a second copy, VENDOR.md) | Kenney UI/VFX atlases |
| `fx.js` 鼎归 · `fx-alive.js` 画活 · `fx-weather.js` · `fx-memory.js` · `fx-hui.js` | Pixi 8.21 (+ GSAP for 鼎归, memory, 回) | 1,050 lines |
| `setpiece.js` + `setpieces/*` (漳水立起 zhang, 筑基天象 zhuji, 腾云 tengyun, 青丘之主 yaowang, 沉鼎山 chending, 扔了干净 huochai, 看完烧了 diche, 二十三下 ershisan) | Pixi + GSAP, on `painted.js` | 1,900 lines, ~250 GSAP timeline calls |
| 守炉 (`shoulu/draw.js`), the rope kit (`ropekit.js`, Verlet), 接雨 (`rain.js`, DOM on `ink.js`) | plain canvas / DOM | — |
| 3D | nothing under `lingjing/` imports three.js (`jieyin/judge3d.js` is MediaPipe 3D landmark math, not drawing). A three.js close-up test kept elsewhere stays an experiment outside this rule. | — |

Pixi is used in a small way. It's mostly Sprite, Graphics, Container and Texture, plus 4 DisplacementFilter,
4 ColorMatrixFilter, 4 BlurFilter, 3 TilingSprite, 2 RenderTexture, 1 MeshPlane and 6 `Application` sites. Today a
stage can hold three WebGL contexts at once (the painting, the beast's 出场, the weather), plus a game's when one
plays. The browser drops the oldest when it runs out, which `fx.js glOK()` already works around.

### 1 · Shared layers

**(a) One Phaser, for games and the stage.**
- `vendor/phaser.min.mjs` (3.90) is the only engine. 砸寨 is rebuilt with `phaser` marked external like the others,
  so its second copy goes.
- **Loading rule (it keeps the tests running in Node):** no stage module imports Phaser statically, because Phaser
  touches `window` when the module loads. `fx.js` keeps one loader, `loadPhaser()`, which replaces `loadPixi` and
  `loadGsap`. Drawing code keeps taking the engine by injection (`build({ Phaser, scene, W, H, art })`, today
  `build({ PIXI, gsap, app, … })`). Data, beats, motion and stills stay pure exports, as now.
- **The stage host (`scripts/kit/stage.js`): one persistent `Phaser.Game` per stage.** It is created on first need
  and destroyed with the stage. The canvas is transparent with `pointer-events: none`, and Phaser's input is off.
  The canvas sits in the stage box, under the DOM words. Each layer is a Scene: `alive` (the painting and the
  beast's 出场), `weather`, and `moment` (鼎归, 回, a set piece). A layer starts, sleeps and stops as a scene. Teardown
  is `scene.stop()` plus freeing its textures; the game itself stays. This replaces the six `Application` sites with
  one context. A set piece covering the stage sleeps `alive` and `weather` and wakes them after.
- **The honest limit is z-order.** Everything on the stage sits under the DOM words, so it fits one canvas.
  `fx-memory` draws over a memory card's picture (`position: fixed`, following the card), which is not the stage
  box. It stays a short-lived second `Phaser.Game` (~4 s, destroyed after). It only joins the stage game if the
  card's picture ever moves inside the stage.
- **Games keep their own `Phaser.Game` per mount,** as now (the shell, `Scale.FIT`, 60 fps, Matter). While a game
  plays, the stage game sleeps (`game.loop.sleep()`). It isn't destroyed, so coming back costs nothing.
- **Fallbacks stay exactly as today.** The stage game is `type: Phaser.WEBGL` only. Without WebGL (`glOK()`), or
  with reduced motion, it isn't created: the CSS stills, the SVG 鼎归 (`inkmap.js`), the SVG set-piece stills
  (`stillSvg`), the CSS bloom and the CSS weather spans are all there is. Games keep `Phaser.AUTO` (canvas
  fallback), and every fx in the library is a no-op on the canvas renderer.
- **DPR:** Phaser has no `autoDensity`. The host sizes the canvas at `w·dpr` and sets `zoom: 1/dpr`, with dpr
  capped at 2 (1.5 for weather, as now).

**(b) A shared fx library: `scripts/kit/fx/`** (plain ESM, no build, so the stage loads it as-is; game bundles
import it as external, like Phaser).
- Its seed is the three `tools/*/src/fx.js` (`makeTextures`, `makeNumberFont`, `makeEmitters`, `jag`, `rng`,
  `canvasTex`), merged into one.
- **Modules:**
  - `wuxing.js`: the 五行 presets (fire, ice, metal, wood, earth). Each is an emitter config, a tint, a hit flash
    and a sound id.
  - `hit.js`: hit flash, hit-stop, shake, number pop.
  - `burst.js`: dust, sparks, splat, poof.
  - `ink.js`: ink bleed and soak, paper grain and paper fibre. `fibreCanvas` and `grainCanvas` already make their
    textures with Canvas2D, so they move over unchanged.
  - `light.js`: rim light and glow (`glowCanvas` from `painted.js`).
  - `particles.js`: the budgeted emitter wrapper, with caps per device.
- One signature everywhere: `fx.burst(scene, x, y, { kind, scale })`. It works the same in a game, a fight
  (`battle-anim.js` when it moves to canvas) and a set piece.
- Every preset reads `reducedMotion`: no shake, a fade instead of a burst.

**(c) Shared assets: `scripts/kit/assets/` + `manifest.json`.**
- **Characters and beasts** keep one set of action frames each (idle, walk, hit, poof). Today 守炉's
  `beasts.webp` re-packs 守墙's frames, and 小满, 银月, 野猪 and 犰狳 sit in several games' `art/`.
- **Icons:** the 五行 符 and the skill icons.
- **UI kit:** buttons, panels and stars, today Kenney's inside 砸寨.
- **Fonts:** four cuts of ZCOOL KuaiLe (kailu, sadou, sadoushou, shouqiang: 68 + 26 + 23 + 44 KB) become one cut
  of the union of the games' characters, made by one `tools/font.py`.
- **The manifest:** each row is `id → file, frames, atlas, licence, source, used_by`. A test checks every row's
  file is on disk and every game's art is either in the manifest or its own (scenery stays per game).
- Story paintings stay world content (`worlds/jiuding/art/`). The kit holds what code draws with, never what the
  world is.
- The layer-3 path in the table above (`scripts/games/kit/assets/`) was never made. It becomes `scripts/kit/`,
  since the stage now shares it.

**(d) How Phaser does what Pixi and GSAP do now.**

| Today | In Phaser 3.90 | Gap, honestly |
|---|---|---|
| `MeshPlane` breathing (画活, a 64×44 grid bent per frame) | `Plane` (a Mesh) with `setOrtho`, writing `vertices[i].x/y` each frame from `motionAt` (already pure) | Phaser's Mesh API is less used than Pixi's. A spike must show that direct writes re-transform and what 2.8k vertices cost at 30 fps on a phone. Fallback: a small `PostFXPipeline` that bends UVs in the shader by the same boxes (still one engine). |
| `DisplacementFilter`, `ColorMatrixFilter`, `BlurFilter` | `postFX.addDisplacement / addColorMatrix / addBlur` (FX, WebGL only) | ColorMatrix uses the same 20-float layout, so `coldMatrix()` ports unchanged. Containers take postFX only, not preFX. |
| **The soak** (a disc grown in a RenderTexture, torn by displacement, blurred, used as the painting's mask, with a wet rim) | `RenderTexture` + FX + `BitmapMask` | **The real gap:** whether `rt.draw()` bakes a source's postFX into the texture. If not, the soak becomes one custom `PostFXPipeline` (mask, tear and rim in one shader, about 60 lines of GLSL). The 回 spike settles it first. |
| `TilingSprite`, `Graphics`, `Sprite`, `Container`, `RenderTexture` | `TileSprite`, `Graphics` (prefer baked textures), `Image`, `Container`, `RenderTexture`/`DynamicTexture` | None. Words were never painted, so there's no text gap. |
| Pixi weather particles (hand-rolled sprites) | `ParticleEmitter`, three depths, wind as `accelerationX`; rain rings as a second emitter | None. `DENSITY` and `countFor` stay the caps. |
| **GSAP timelines** (~250 calls: `set` 90, `fromTo` 76, `to` 58, `from` 20, position parameters, `progress(1)` to finish a beat on a tap, `eventCallback`) | Phaser Tweens and `TweenChain` | **Gap:** Phaser has no seekable timeline with GSAP's position parameter, and no `progress(1)` across one. Fix: `kit/timeline.js`, a ~150-line GSAP-shaped subset (`to/fromTo/from/set/call/add`, positions, `progress`, `play/pause/kill`, `onComplete`). It is driven by the scene's clock and is pure, so Node tests can seek it. `setpieces/bag.js` (`tweenBag`) already wraps every piece's tweens, so its backend changes and the pieces' choreography lines stay. Eases map by name (`sine.inOut` → `Sine.easeInOut`, `power1.out` → `Quad.easeOut`, `power2.out` → `Cubic.easeOut`, `back.out(n)` → `Back.easeOut` with overshoot n). Every ease in use has a Phaser twin. |
| Boot: a Pixi `Application` is light | A `Phaser.Game` is heavier (scene manager, sound, input) | This is why the stage game is persistent: it boots once per stage. The `fxTimes` log keeps measuring it (`phaser_ms`). |

### 2 · Port order (lowest risk first)

**Rule: port when touched.** An effect or game being changed anyway moves to Phaser in the same change. Steps 1–4
are done up front, because they are the foundation and the gate.

The beat lock on 漳水立起 (`tests/setpiece.test.mjs`) guards data and the stepper, not drawing: `BEATS`, `SHOTS`,
`ART`, `MARKS`, `LUOSHU`, `TITLE`, `coldMatrix`, `stillSvg`, `beatStepper` and `beatRange`. A port changes only
`build()`, so the lock stays green by construction. Every step still runs it, with the rest of `./scripts/check.sh`.

Sizes are agent time: S ≤ 2 h, M 2–5 h, L 5–10 h.

| # | Step | Size | Gate |
|---|---|---|---|
| 1 | Merge the three `tools/*/src/fx.js` into `kit/fx/`; rebuild 守墙关, 撒豆成兵, 守山门 and 开炉 against it. No visual change. | S · 2 h | stale-bundle tests; play each once |
| 2 | 砸寨 onto the shared `phaser.min.mjs` (external), dropping its bundled copy | M · 3 h | `game-zhazhai.test.mjs`; a full level |
| 3 | Font union cut + `kit/assets/manifest.json` skeleton + manifest test; move the shared beasts' frames first | M · 3 h | each game's text still renders |
| 4 | **The spike and gate:** the stage host (`kit/stage.js`) + `kit/timeline.js` + `fx-hui.js` (107 lines, a soak with no beats and no lock) on Phaser | M · 5 h | the soak looks right beside the Pixi one, and the spike measures the mesh cost. **If the soak needs the GLSL pipeline, the plan says so here before step 5.** |
| 5 | `fx-memory.js` (the same soak; its own short-lived game) | S · 2 h | `fx-memory.test.mjs`; a bloom live |
| 6 | `fx-weather.js` → `weather` scene, ParticleEmitter | M · 3 h | `fx-weather.test.mjs`; snow, rain, fog live |
| 7 | `fx-alive.js` → `alive` scene, Plane breathing (the 画活 painting + the beast's 出场 in one scene) | M · 5 h | `fx-alive.test.mjs`; `alive.html` side by side |
| 8 | `painted.js` (camera, soak, grain) + `tweenBag` backend → Phaser | M · 4 h | opens the way for every painted piece |
| 9 | The set pieces, small to large: chending (81) → diche (142) → ershisan (130) → tengyun (151) → zhang 漳水立起 (155) → zhuji (200) → yaowang (280) → huochai (351) | L · ~16 h total (S–M each) | each piece's test + `setpiece.html` run whole |
| 10 | `fx.js` 鼎归 (displacement, mask, bleed ring) | M · 4 h | `inkmap.test.mjs`; the homing live |
| 11 | Remove `pixi-8.21.0.min.mjs`, `gsap-3.15.0.min.js`, `LICENSE.pixi.txt`, their VENDOR.md rows, `loadPixi/loadGsap`; add a test that no script names PIXI or gsap. The GSAP licence leaves with it. | S · 1 h | `check.sh` green |

**Total ≈ 48 h of agent time.** Steps 1–8 (≈ 27 h) carry all the risk. Step 9 is mechanical once 8 lands. Until
step 11 a page may load both engines (1.1 MB + 0.9 MB). That's acceptable for a while, but not as the end state.
Today a session with a living painting and a game already loads both.

Follow-ups when it's built: `scripts/vendor/VENDOR.md` (Phaser rows; Pixi/GSAP gone), `design.md § 画面效果` (one
engine), and the Layers table above (layer 1 covers the stage; layer 3 becomes `scripts/kit/`).

### 3 · The canvas games

A plain-canvas game can't borrow a Phaser fx library without a Phaser scene. There's no half-step, and an fx canvas
laid over the game would add a second context during play. So the question for each game is whether its play layer
moves.
- **守炉: yes, and it's already decided** (the 塔防 kit, order step 3). `shoulu/core.js` (854 lines) is pure and
  separate. `draw.js` (534) is one function per figure, written for this swap. It becomes one Phaser scene, and the
  shots, hits, marks and 银月's skills come from `kit/fx`. **M–L · 8 h.** Its bot and level tests don't change.
- **The ropes (割绳子, 饭桶, and the rope beats): the drawing moves, the physics doesn't.** `ropekit.js`'s Verlet sim
  stays pure, in the worker, because the bots and `rope-plan` depend on it. Phaser draws from its state each frame
  (rope as a textured strip, candy as a sprite, cuts and bounces through `kit/fx`). **M · 5 h for the kit,** then
  S per rope game.
- **接雨: last, port when touched.** It's 293 lines on `ink.js`/`mountPure` (DOM, no canvas). Its effects are a
  splash and a puddle. Moving it buys little until it gets the comic art the 打地鼠 kit wants. **M · 4 h** when its
  turn comes (order step 4 of the 10-20 plan). Until then its CSS stays.
- **Fights** (`battle-anim.js`, DOM/CSS) are not in this plan's scope. When a fight gets a canvas, it uses `kit/fx`
  with no second library.

### 4 · Perf budget

| Budget | Mac | Mid-range phone (the play webview) |
|---|---|---|
| Live WebGL contexts | ≤ 1 persistent (the stage) + ≤ 1 short-lived (a game or the memory card). Never three. | ≤ 1 (the game; the phone's story is Flutter) |
| Frame rate | stage layers 30 fps (set pieces are slow camera moves); games 60 | games ≥ 30, aim 60 |
| Frame time | stage layers together ≤ 8 ms; games p95 ≤ 16 ms | games p95 ≤ 33 ms |
| Textures | atlases ≤ 2048²; a set piece holds ≤ 5 paintings (1536×1024) at once | atlases ≤ 2048², ≤ 64 MB of textures live |
| Particles | weather's `DENSITY` caps (170 snow, 200 rain); a game burst ≤ 300 live | half of the Mac caps (`particles.js` per device) |
| Load | Phaser once per page (1.1 MB, cached), replacing Pixi + GSAP (0.9 MB) | bundled in the app, no network |

The engine's pet view rides in an iframe as voice only (`petStageUrl`: `stage=1&body=0`, no 3D body), so it should hold no context; the `?perf=1` counter confirms that on the first run. The stage game sleeps when the tab is hidden (Phaser does this itself), under a set piece's cover for the layers it
covers, and while a game plays.

**What we measure:**
- The `fxTimes` log gains `phaser_ms` (first load) and `boot_ms` (stage game ready).
- A `?perf=1` readout on the page shows `game.loop.actualFps` per game, live contexts (a counter in
  `kit/stage.js`), texture memory and particle count.
- A `tools/cdp.mjs` run on `?save=test` walks a painting, weather, a set piece and a game and records p95 frame
  time and peak contexts. Each port step runs it before and after, and a step that makes things worse doesn't land.
- One check on a real phone webview per kit, on the phone side, when that kit ships there.

### 5 · Questions for Hanli

1. **One stage canvas that stays, or one canvas per moment as today?** Recommended: **one that stays** (the stage
   game with a scene per layer). It's the only way to get to one context, it ends the dropped-context bug, and Phaser
   boots once. The cost: the stage host is new code (step 4).
2. **If the 回 spike shows the soak needs a custom shader, write it (about 60 lines of GLSL inside Phaser), or keep
   Pixi for the soak alone?** Recommended: **write the shader.** Keeping Pixi for one effect means two engines
   forever, which is what this plan ends.
3. **Port all the stage effects now (≈ 27 h, steps 1–8), or only the foundation and gate (steps 1–4, ≈ 13 h) and
   the rest as each is touched?** Recommended: **steps 1–4 now, then 7 (画活) and 6 (weather) next**, because
   those two run on every stage and cut the contexts. Set pieces and 鼎归 port when touched, with the end of 卷二's
   build as the date Pixi leaves.
