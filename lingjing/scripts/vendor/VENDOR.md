# Vendored libraries

Loaded only when an effect plays (design.md § 画面效果) or a small game needs physics (games/physics.js, design.md § 新小游戏); never from a CDN — skills don't phone home.

| File | Package | Licence | Source tarball sha256 |
|---|---|---|---|
| `pixi-8.21.0.min.mjs` | pixi.js 8.21.0 (`dist/pixi.min.mjs`) | MIT — `LICENSE.pixi.txt` | b99f4368607c9179f2917687d58ec9c3e7eb8384c90dc8cb2fd17d22829703c7 |
| `gsap-3.15.0.min.js` | gsap 3.15.0 (`dist/gsap.min.js`, UMD → `window.gsap`) | GreenSock Standard "no charge" licence, https://gsap.com/standard-license | d2e33ad202d4811e9084883f7ff9a27967ac4095caef51ca4c9d20697a253b1c |
| `matter-0.20.0.min.js` | matter-js 0.20.0 (`build/matter.min.js`, UMD → `window.Matter`; node requires it as CommonJS, `package.json` here) | MIT — `LICENSE.matter.txt` | c2594c16b67adf76d32d9c4576a388a32cee80e5dfe2823cd3bf1b8fb93cc7f2 |

Fetched with `npm pack pixi.js@8.21.0 gsap@3.15.0` on 2026-09-29. To update: pack the new version, copy the same
dist file under a new versioned name, update this table, and remove the old file.

matter-js 0.20.0 fetched with `npm pack matter-js@0.20.0` on 2026-10-16.

## ZzFX (the small games' generated sounds, games/kit/sound.js)

| File | Package | Licence | Source tarball sha256 | Upstream file sha256 |
|---|---|---|---|---|
| `zzfx-1.4.0.mjs` | zzfx 1.4.0 (`ZzFX.js`, ESM; Frank Force, github.com/KilledByAPixel/ZzFX) | MIT — the licence block kept in the file | 2321f2de873696c04163aa7262324920deefc0c5790eca9bc3f1bf1a45c54e78 | 43f321101a935892c112a291e2e943b4da33159b43fcd4a21f3eae710f4a27ff |

Fetched with `npm pack zzfx@1.4.0` on 2026-10-22. **Patched, one line:** `audioContext: new AudioContext` → `audioContext: null`
(upstream opens a context at import, which breaks the Node tests and would be a second context on the page; the sound layer
only calls `ZZFX.buildSamples` and plays through its own one), plus CRLF → LF and a three-line header saying so.
The recorded sounds and music beds are not vendored code: `games/kit/audio/CREDITS.md`, built from `tools/sound/sources.json`.

## 砸寨 (games/zhazhai/)

One ESM bundle, `games/zhazhai/zhazhai.min.mjs` (+ `fragment-worker.min.mjs`, its atlases, sounds and `LICENSE.txt`), built by
`tools/zhazhai/build.mjs` (esbuild) from the vendored source in `tools/zhazhai/` — never edited by hand. Rebuild:
`cd tools/zhazhai && npm ci && python3 atlas.py && npm run build` (tests/game-zhazhai.test.mjs fails on a stale bundle).

| What | Version | Licence | Source sha256 |
|---|---|---|---|
| Angry Aliens (feliperyba/angry-aliens-phaser) — the game, re-skinned | commit 25ee4a531eddbb11a96dab201be623cf424220ec (2026-05-01) | MIT — `tools/zhazhai/LICENSE`, shipped as `games/zhazhai/LICENSE.txt` | git clone of that commit |
| phaser (bundled inside) | 3.90.0 (`dist/phaser.esm.js`) | MIT | c4e3a8da498ab94aa8859c7a32cb89140d94bfd95d769bee36a98cdef1bea6e6 |
| matter-js (bundled inside; upstream imports it beside Phaser's own copy) | 0.20.0 | MIT — `LICENSE.matter.txt` | c2594c16b67adf76d32d9c4576a388a32cee80e5dfe2823cd3bf1b8fb93cc7f2 |
| esbuild (build tool only, not shipped) | 0.28.1 | MIT | eb8ef756f8299d16d5c8b35678606d715ba29923f500db7b37c181310eed40a5 |

Upstream's art is Kenney's (kenney.nl, credited in its README; Kenney's packs are CC0 — not re-checked on kenney.nl).
Still Kenney's in our build: the UI atlas (panels, buttons, icons), the VFX atlas (particles, splats), the fonts
(Kenney Bold / Future Narrow — Latin digits only; Chinese falls back to the system's), the ground tiles,
the star and coin icons, and the cloud layers. Repainted (`tools/zhazhai/atlas.py`): every block (瓦/木/石/铁/火药桶),
the weasels and the four throws (Codex, `tools/paint-zhazhai.py`), the slingshot and its foot, the karst/pine layers.
Fetched 2026-10-20. Its sounds left on 2026-10-22: upstream's sprite (`sfx-master.ogg`, 1.5 MB, its music of unchecked
origin) is gone; every sound goes by name to the shell's shared CC0 bank (`ShellSoundAdapter.ts`, `games/kit/audio/`).

## The shared game engine (doc/game-kit.md § Layers, 1 Engine)

`phaser.min.mjs` is the ONE Phaser every game kit loads: a game's bundle marks `phaser` external and imports
`../../vendor/phaser.min.mjs` (esbuild, e.g. `tools/shouqiang/build.mjs`), so the browser fetches Phaser once.
守墙关 is its first user; 砸寨 still bundles its own copy until it moves onto the shared layer.

| File | Package | Licence | Source tarball sha256 | File sha256 |
|---|---|---|---|---|
| `phaser.min.mjs` | phaser 3.90.0 (`dist/phaser.esm.min.js`, ESM, named exports → `import * as Phaser`) | MIT — `LICENSE.phaser.txt` | c4e3a8da498ab94aa8859c7a32cb89140d94bfd95d769bee36a98cdef1bea6e6 | 9327deb5e2f7d382cd054842f641fd504b9a784a730a2bdb94ea63516790ead1 |

Fetched with `npm pack phaser@3.90.0` on 2026-10-20.

## 守墙关's font (games/shouqiang/font/)

| File | Font | Licence | Source sha256 |
|---|---|---|---|
| `games/shouqiang/font/zcool-kuaile.woff2` | ZCOOL KuaiLe 站酷快乐体 (google/fonts `ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf`, kept whole in `tools/shouqiang/font/`), cut to the game's characters by `tools/shouqiang/font.py` | SIL OFL 1.1 — `OFL.txt` beside it | 812a6fc1fe54b6d73a419245c32dfeba8aa33104d5be90d1cf6af082007cb71d |

Fetched from github.com/google/fonts (main) on 2026-10-20.

## 撒豆成兵's font (games/sadou/font/)

The same ZCOOL KuaiLe 站酷快乐体 (SIL OFL 1.1, `OFL.txt` beside it), cut from 守墙关's whole copy in `tools/shouqiang/font/`
to this game's characters by `tools/sadou/font.py` — no second copy of the source font.

## 结印's hand landmarks (vendor/mediapipe/)

Loaded only when 结印 (games/jieyin/eye.js) starts, from these files — never a CDN, never Google's storage at run
time. The camera's frames stay in the page.

| File | Package | Licence | Size | File sha256 |
|---|---|---|---|---|
| `mediapipe/vision_bundle.mjs` | @mediapipe/tasks-vision 0.10.35 (`vision_bundle.mjs`, ESM) | Apache-2.0 — `mediapipe/LICENSE.txt` | 137 KB | 55d7ab624fbb70dcc5adc4ae6d7ea9cfcb569139d3dbfbf2b1deafcb966bc0fe |
| `mediapipe/vision_wasm_internal.js` | the same package, `wasm/` (the SIMD build's loader) | Apache-2.0 | 322 KB | e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c |
| `mediapipe/vision_wasm_internal.wasm` | the same package, `wasm/` (the SIMD build) | Apache-2.0 | 11.2 MB | 6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc |
| `mediapipe/hand_landmarker.task` | MediaPipe Hand Landmarker model, float16 v1 (`storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, the URL in the MediaPipe docs; last-modified 2023-04-26) | Apache-2.0 (MediaPipe's model card; not re-checked) | 7.8 MB | fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1 |

Fetched 2026-10-21 with `npm pack @mediapipe/tasks-vision@0.10.35` (tarball sha256
84597a25e13d123b5f4cbe768bb72e97a2c28c7a465f0ace287d8cbe5246bff0, published 2026-04-27) and `curl` for the model;
`LICENSE.txt` is apache.org's Apache-2.0 text (the npm package names the licence but ships no file).

**Why 0.10.35, not 1.x:** 1.0.0 onward carries a usage-metrics logger that POSTs to `odml.pa.googleapis.com/v1/log`
(its README's privacy notice: "MediaPipe Tasks APIs send metrics about the performance and utilization of the APIs in
your app to Google"). 0.10.35 has no such code (tests/game-jieyin.test.mjs checks the bundle). Only the SIMD WASM is
kept (every current browser has WASM SIMD; without it 结印 is simply not offered); the `nosimd` and `module` builds,
the `.cjs`/`.js` bundles and the source maps are left out. To update: pack the new version, check it for a logger
first, copy the same four files, update this table.

## 施法特写's 3D close-up — gone 2026-10-27

three.js and three-vrm left with the 3D look (Hanli 10-21: 「3D的直接不用就行了」); 施法特写 plays its ink look only.

## 抚琴 (games/fuqin.js) — rules ported, nothing vendored

No upstream file is copied. `games/fuqin.js` ports the osu!mania ruleset's rules into its own code: hit windows by OD
(`ManiaHitWindows.cs`), ordered hits, hold head · body · tail with the 1.5× release lenience (`TailNote.cs`,
`DrawableHoldNote*.cs`), the health table (`ManiaHealthProcessor.cs`) and accuracy. Source: osu! by ppy Pty Ltd,
github.com/ppy/osu, MIT; the licence text is `games/fuqin/LICENSE`, the credit is in the module's header. No osu! asset
(osu-resources: skins, sounds, beatmaps) is used. Read on 2026-10-27.

## 照着走 (games/simon.js) — rules read, nothing vendored

No upstream file is copied and none is ported. Simon's rules (one more square a round; tap the run back) were checked against
KDE's Blinken (invent.kde.org/education/blinken, `src/blinkengame.cpp`), which is GPL-2.0-or-later — so ideas only: no
code, art or sound of it is used. The quickening at the 5th, 9th and 13th step is the 1978 Simon's rule. The art is our own
painting (tools/paint-boards-flux.py `yubu-ground`, `yubu-slab`); the notes are the kit's own qin tones (sounds.json). Read on 2026-10-27.
