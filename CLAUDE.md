# Claude Code Instructions

This is the Linggen skills repository — the standalone source of truth for the skills that ship with [Linggen](https://linggen.dev). Most are app skills (SKILL.md + a web UI under `scripts/` served at `/apps/<name>/`).

## Edit workflow — three synced surfaces

Edit HERE first, then copy changed files to the other two surfaces (keep all three byte-identical):

1. `skills/<name>/…` — this repo (standalone source of truth)
2. `~/.linggen/skills/<name>/…` — what the running daemon serves (page changes: reload the app iframe; SKILL.md changes: `POST /api/skills/reload` with `Content-Type: application/json` body `{}`, then a NEW chat to bind)
3. `linggen/linggen-app/vendor/skills` — git submodule of this repo. After pushing here: `git pull origin main` inside the submodule, then commit the pointer bump in linggen-app.

Never edit `~/.linggen` or `vendor/skills` directly.

Never `rsync --delete` (or rm-and-copy) into `~/.linggen/skills/<name>/` — the install holds user state git never has (`config.json`, `data/`, `state/`). One such sync on 2026-09-10 wiped Pulse's config and six skills' data. Copy the changed files by name.

## Conventions

- Syntax-check JS with `node --check` before syncing; there is no build step — files are served as-is.
- Before committing: `node --test tests/` at the repo root (every SKILL.md frontmatter in the engine's shape; every script parses, every `.sh` passes `bash -n`, every page's local assets exist), plus the skill's own `node --test <skill>/tests/*.test.mjs`.
- Skill JS runs in a sandboxed iframe: no `window.confirm/prompt` (silent no-ops in the app shell) — use the shared dialog helpers.
- Files written via `/api/bash` must end with a trailing newline (sentinel-strip gotcha).
- Chat panels mount through each skill's `chat-bridge.js` (`LinggenUI.mount`); app pages get `?app_mode=1`, and `&in_launcher=1` when hosted inside the unified launcher.
- Don't trust the model for mechanical invariants (ids, schema fields, timestamps) — derive them page-side at ingest.
- Tool `cmd:` template args arrive as the LITERAL placeholder (`{{max}}`) when the agent omits them — every script must strip/default placeholder-shaped args before use (`case "$A" in "{{"*"}}") A=default;; esac`).
- Never `sq()` a path containing `$HOME` — single quotes kill expansion, and the command then writes to a literal `'$HOME'` dir under the bash cwd instead of failing. Resolve the home dir once via `home()` (bash.js) and build absolute paths (this silently ate every DJ thumbnail until 2026-08-04).
