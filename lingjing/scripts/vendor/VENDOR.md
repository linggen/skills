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
(Kenney Bold / Future Narrow — Latin digits only; Chinese falls back to the system's), the sounds, the ground tiles,
the star and coin icons, and the cloud layers. Repainted (`tools/zhazhai/atlas.py`): every block (瓦/木/石/铁/火药桶),
the weasels and the four throws (Codex, `tools/paint-zhazhai.py`), the slingshot and its foot, the karst/pine layers.
Fetched 2026-10-20.
