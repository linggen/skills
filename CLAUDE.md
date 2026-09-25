# Claude Code Instructions

This is the Linggen skills repository — the standalone source of truth for the skills that ship with [Linggen](https://linggen.dev). Most are app skills (SKILL.md + a web UI under `scripts/` served at `/apps/<name>/`).

## Edit workflow — three synced surfaces

Edit HERE first, commit and push, then bring the other two surfaces up to that commit:

1. `skills/<name>/…` — this repo (standalone source of truth)
2. `~/.linggen/skills/<name>/…` — what the running daemon serves. Install ONLY with `scripts/install-skill.sh <name>` after pushing — never copy files by name. It installs the whole skill from `origin/main` (`--ref HEAD` for a local commit), refuses if any JS fails `node --check` or imports a name its neighbour doesn't export, never deletes or touches user state, and reloads skills when SKILL.md changed (then a NEW chat to bind). Page changes: reload the app iframe. `--check` shows drift; `--dry-run` what would change.
3. `linggen/linggen-app/vendor/skills` — git submodule of this repo. After pushing here: `git pull origin main` inside the submodule, then commit the pointer bump in linggen-app.

Never edit `~/.linggen` or `vendor/skills` directly.

Never `rsync --delete` (or rm-and-copy) into `~/.linggen/skills/<name>/` — the install holds user state git never has (`config.json`, `data/`, `state/`). One such sync on 2026-09-10 wiped Pulse's config and six skills' data; copying by name blanked Lingjing twice on 2026-09-25 (a file landed without the neighbour it imports). `install-skill.sh` exists for both.

## Conventions

- Syntax-check JS with `node --check` before committing (install-skill.sh refuses otherwise); there is no build step — files are served as-is.
- Before committing: `./scripts/check.sh` (CI runs the same on every push) — or piecemeal, `node --test tests/*.test.mjs` at the repo root (every SKILL.md frontmatter in the engine's shape; every script parses, every `.sh` passes `bash -n`, every page's local assets exist), plus the skill's own `node --test <skill>/tests/*.test.mjs`.
- Skill JS runs in a sandboxed iframe: no `window.confirm/prompt` (silent no-ops in the app shell) — use the shared dialog helpers.
- Files written via `/api/bash` must end with a trailing newline (sentinel-strip gotcha).
- Chat panels mount through the engine's `/shared/chat-bridge.js` (`LinggenUI.mount`); sessions, models and cloud calls come from `/shared/api.js`, and `/shared/app-mode.js` drives the shell's Settings overlay. Don't copy these into a skill — keep only calls that are the skill's own in a local module (`pulse-api.js`, `memory-api.js`). App pages get `?app_mode=1`, and `&in_launcher=1` when hosted inside the unified launcher.
- Don't trust the model for mechanical invariants (ids, schema fields, timestamps) — derive them page-side at ingest.
- Tool `cmd:` template args arrive as the LITERAL placeholder (`{{max}}`) when the agent omits them — every script must strip/default placeholder-shaped args before use (`case "$A" in "{{"*"}}") A=default;; esac`).
- Never `sq()` a path containing `$HOME` — single quotes kill expansion, and the command then writes to a literal `'$HOME'` dir under the bash cwd instead of failing. Resolve the home dir once via `home()` (bash.js) and build absolute paths (this silently ate every DJ thumbnail until 2026-08-04).
