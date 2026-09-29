# Vendored libraries

Loaded only when an effect plays (design.md § 画面效果); never from a CDN — skills don't phone home.

| File | Package | Licence | Source tarball sha256 |
|---|---|---|---|
| `pixi-8.21.0.min.mjs` | pixi.js 8.21.0 (`dist/pixi.min.mjs`) | MIT — `LICENSE.pixi.txt` | b99f4368607c9179f2917687d58ec9c3e7eb8384c90dc8cb2fd17d22829703c7 |
| `gsap-3.15.0.min.js` | gsap 3.15.0 (`dist/gsap.min.js`, UMD → `window.gsap`) | GreenSock Standard "no charge" licence, https://gsap.com/standard-license | d2e33ad202d4811e9084883f7ff9a27967ac4095caef51ca4c9d20697a253b1c |

Fetched with `npm pack pixi.js@8.21.0 gsap@3.15.0` on 2026-09-29. To update: pack the new version, copy the same
dist file under a new versioned name, update this table, and remove the old file.
