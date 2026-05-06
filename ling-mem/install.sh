#!/usr/bin/env bash
set -euo pipefail
#
# What this script does (for human readers and static scanners):
#
# 1. Fetches the ling-mem skill tree from github.com/linggen/skills if
#    not run from a local checkout. Two-step: download tarball to disk,
#    extract from disk (no curl-into-tar pipe).
# 2. Detects which agent runtimes are installed (~/.claude, ~/.linggen,
#    ~/.openclaw, ~/.codex) and copies the skill into each.
# 3. Downloads the prebuilt `ling-mem` daemon binary for this platform
#    from github.com/linggen/linggen-memory/releases. Two-step download.
# 4. Wires the per-prompt recall hook into ~/.claude/settings.json
#    if Claude Code is present.
#
# No data leaves the machine. No remote code execution beyond extracting
# tarballs published by the linggen org. Source + releases:
# https://github.com/linggen/linggen-memory
#
# install.sh — install the ling-mem skill into whichever host runtimes
# the user has on this machine.
#
# Detects:
#   ~/.claude/   → install to ~/.claude/skills/ling-mem/   (preferred)
#   ~/.linggen/  → install to ~/.linggen/skills/ling-mem/  (fallback)
#
# Auto-detect prefers ~/.claude when present — Linggen reads skills from
# both ~/.claude/skills and ~/.linggen/skills, so a dual install would
# surface two copies of the same skill in the Linggen UI. Override with
# `--host=linggen|claude|both` if you want explicit control.
#
# Source + releases: https://github.com/linggen/linggen-memory

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null)" || SOURCE_DIR=""
REPO="linggen/linggen-memory"
VERSION="${LING_MEM_VERSION:-latest}"

# Self-bootstrap: when invoked via `curl ... | bash`, $0 is bash itself
# and $SOURCE_DIR ends up pointing at the user's cwd — there is no local
# clone with SKILL.md, scripts/, references/, etc. Detect this and fetch
# the canonical skill tree from GitHub into a temp dir, then re-target
# SOURCE_DIR.
#
# When run from a checked-out clone (`bash skills/ling-mem/install.sh`),
# SKILL.md is adjacent and this block is a no-op.
if [ -z "$SOURCE_DIR" ] || [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
  BOOTSTRAP_REPO="${LING_MEM_SKILLS_REPO:-linggen/skills}"
  BOOTSTRAP_REF="${LING_MEM_REPO_REF:-main}"
  BOOTSTRAP_URL="https://github.com/${BOOTSTRAP_REPO}/archive/${BOOTSTRAP_REF}.tar.gz"
  BOOTSTRAP_TMP="$(mktemp -d -t ling-mem-bootstrap-XXXXXX)"
  BOOTSTRAP_TAR="$BOOTSTRAP_TMP/skills.tar.gz"
  trap 'rm -rf "$BOOTSTRAP_TMP"' EXIT

  # Two-step download: write to disk first, then extract from disk.
  # Piping `curl | tar -xz` trips supply-chain heuristics in static
  # scanners (no on-disk artifact between fetch and extract). The
  # intermediate file makes the bytes inspectable and the pattern explicit.
  echo "Fetching ling-mem skill from ${BOOTSTRAP_REPO}@${BOOTSTRAP_REF}..."
  if ! curl -fsSL --retry 3 --retry-delay 2 "$BOOTSTRAP_URL" -o "$BOOTSTRAP_TAR"; then
    echo "Error: failed to download $BOOTSTRAP_URL" >&2
    exit 1
  fi

  echo "Extracting skill tree..."
  if ! tar -xzf "$BOOTSTRAP_TAR" -C "$BOOTSTRAP_TMP"; then
    echo "Error: failed to extract $BOOTSTRAP_TAR" >&2
    exit 1
  fi
  rm -f "$BOOTSTRAP_TAR"

  SOURCE_DIR="$(find "$BOOTSTRAP_TMP" -maxdepth 3 -type d -name ling-mem | head -n1)"
  if [ -z "$SOURCE_DIR" ] || [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
    echo "Error: ling-mem/SKILL.md not found in tarball" >&2
    exit 1
  fi
fi

# -------------------------------------------------------------------
# Parse --host flag (optional)
# -------------------------------------------------------------------

HOST_OVERRIDE=""
for arg in "$@"; do
  case "$arg" in
    --host=*) HOST_OVERRIDE="${arg#--host=}" ;;
    -h|--help)
      cat <<EOF
Usage: install.sh [--host=linggen|claude|both]

Without --host: installs to ~/.claude when it exists (Linggen also reads
that location, so a single install covers both runtimes). Falls back to
~/.linggen otherwise.

If ~/.codex/ exists, also symlinks the installed skill into
~/.codex/skills/ling-mem/ so Codex picks it up. Codex doesn't have a
user-global hook system like CC, so the per-turn recall hook is CC-only;
the skill's CLI works in Codex either way. Restart Codex after install.

  LING_MEM_VERSION=vX.Y.Z   pin a specific binary version (default: latest)
  LING_MEM_FORCE_DOWNLOAD=1 re-fetch the binary even if present
  LING_MEM_SKIP_CODEX=1     skip the Codex symlink even if ~/.codex/ exists
EOF
      exit 0
      ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# -------------------------------------------------------------------
# Decide which host(s) to install to
# -------------------------------------------------------------------

INSTALL_LINGGEN=0
INSTALL_CLAUDE=0

case "$HOST_OVERRIDE" in
  linggen)         INSTALL_LINGGEN=1 ;;
  claude)          INSTALL_CLAUDE=1 ;;
  both)            INSTALL_LINGGEN=1; INSTALL_CLAUDE=1 ;;
  "")
    # Linggen reads skills from both ~/.claude/skills and ~/.linggen/skills,
    # so installing to both surfaces the skill twice in the Linggen UI.
    # Prefer ~/.claude when present; fall back to ~/.linggen otherwise.
    if [ -d "$HOME/.claude" ]; then
      INSTALL_CLAUDE=1
    elif [ -d "$HOME/.linggen" ]; then
      INSTALL_LINGGEN=1
    else
      echo "No host detected (~/.linggen or ~/.claude). Defaulting to ~/.linggen."
      INSTALL_LINGGEN=1
    fi
    ;;
  *)
    echo "--host must be one of: linggen, claude, both (got: $HOST_OVERRIDE)" >&2
    exit 1
    ;;
esac

# Warn if the non-target host already has a stale copy — Linggen will list
# both as separate skills.
warn_stale_copy() {
  local other_dir="$1"
  if [ -d "$other_dir" ]; then
    echo ""
    echo "  Warning: $other_dir already exists." >&2
    echo "    Linggen reads skills from both ~/.claude and ~/.linggen, so this" >&2
    echo "    will appear as a duplicate. Remove it with:  rm -rf $other_dir" >&2
  fi
}

# -------------------------------------------------------------------
# Detect platform → release asset slug
# -------------------------------------------------------------------

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$OS-$ARCH" in
  darwin-arm64|darwin-aarch64) TARGET="macos-aarch64" ;;
  darwin-x86_64|darwin-amd64)  TARGET="macos-x86_64" ;;
  linux-x86_64|linux-amd64)    TARGET="linux-x86_64" ;;
  linux-aarch64|linux-arm64)   TARGET="linux-aarch64" ;;
  *)
    echo "Error: unsupported platform $OS-$ARCH" >&2
    echo "  Manual install: https://github.com/${REPO}/releases" >&2
    exit 1
    ;;
esac

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

# Download the ling-mem binary to <bin_dir>/ling-mem (if not already
# present, or if LING_MEM_FORCE_DOWNLOAD=1, or if a specific version is
# pinned).
download_binary() {
  local bin_dir="$1"
  local bin="$bin_dir/ling-mem"
  mkdir -p "$bin_dir"

  if [ -x "$bin" ] && [ "${LING_MEM_FORCE_DOWNLOAD:-}" != "1" ] && [ "$VERSION" = "latest" ]; then
    echo "  ling-mem already at $bin — skipping download"
    return
  fi

  local asset="ling-mem-${TARGET}.tar.gz"
  local url
  if [ "$VERSION" = "latest" ]; then
    url="https://github.com/${REPO}/releases/latest/download/${asset}"
  else
    url="https://github.com/${REPO}/releases/download/${VERSION}/${asset}"
  fi

  local tmp_tar
  tmp_tar="$(mktemp -t "ling-mem-XXXXXX.tar.gz")"
  trap 'rm -f "$tmp_tar"' RETURN

  echo "  Downloading ling-mem ${VERSION} (${TARGET})"
  if ! curl -fsSL --retry 3 --retry-delay 2 "$url" -o "$tmp_tar"; then
    echo "Error: download failed. See https://github.com/${REPO}/releases" >&2
    exit 1
  fi

  tar -xzf "$tmp_tar" -C "$bin_dir" ling-mem
  chmod +x "$bin"

  local built_ver
  built_ver="$("$bin" --version 2>/dev/null | awk '{print $2}' || true)"
  if [ "$VERSION" != "latest" ]; then
    local expected="${VERSION#v}"
    if [ "$built_ver" != "$expected" ]; then
      echo "  Warning: binary reports '$built_ver', expected '$expected'." >&2
    fi
  fi
  echo "  Installed: $bin (${built_ver:-unknown})"
}

# Copy SKILL.md + references + scripts (full set) into <skill_dir>.
# Linggen install gets everything; CC install gets the same set (the
# unified SKILL.md works in both — CC ignores Linggen-only frontmatter
# fields).
#
# When the Linggen marketplace runs this script from inside the
# already-extracted skill folder, SOURCE_DIR == skill_dir — the files are
# already in place, so skip the copy step (and also skip macOS `install`'s
# "same file" hard error).
copy_skill_files() {
  local skill_dir="$1"

  if [ "$SOURCE_DIR" = "$skill_dir" ]; then
    mkdir -p "$skill_dir/bin"
    echo "  Files already in place at $skill_dir — skipping copy"
    return
  fi

  mkdir -p "$skill_dir/scripts" "$skill_dir/references" "$skill_dir/assets" "$skill_dir/bin"

  install -m 0644 "$SOURCE_DIR/SKILL.md" "$skill_dir/SKILL.md"
  install -m 0644 "$SOURCE_DIR/index.html" "$skill_dir/index.html"

  # Reference files.
  for ref in routing-rules.md scan-flow.md dashboard.md extractor-prompt.md; do
    install -m 0644 "$SOURCE_DIR/references/$ref" "$skill_dir/references/$ref"
  done

  # Mission file (used by Linggen's mission scheduler; harmless in CC).
  install -m 0644 "$SOURCE_DIR/assets/mission.md" "$skill_dir/assets/mission.md"

  # Scripts: shells the agent shells out to + dashboard JS/CSS for Linggen.
  for f in collect.sh collect_sessions.sh extract_session.sh; do
    install -m 0755 "$SOURCE_DIR/scripts/$f" "$skill_dir/scripts/$f"
  done
  for f in api.js chat-bridge.js memory-app.js memory.css memory.html page-renderer.js style.css widget-renderers.js; do
    install -m 0644 "$SOURCE_DIR/scripts/$f" "$skill_dir/scripts/$f"
  done
}

# Seed the core memory directory. Engine inlines identity.md / style.md
# into every session's system prompt; touching empty files is enough.
seed_core_memory() {
  local memory_dir="$HOME/.linggen/memory"
  mkdir -p "$memory_dir"
  [ -f "$memory_dir/identity.md" ] || : > "$memory_dir/identity.md"
  [ -f "$memory_dir/style.md" ]    || : > "$memory_dir/style.md"
}

# Linggen-only: install the dream mission so the cron scheduler picks it
# up. Keep user customizations untouched on existing installs.
install_dream_mission() {
  local skill_dir="$1"
  local mission_dir="$HOME/.linggen/missions/dream"
  local mission_scripts="$mission_dir/scripts"
  mkdir -p "$mission_scripts"
  if [ ! -f "$mission_dir/mission.md" ]; then
    cp "$skill_dir/assets/mission.md" "$mission_dir/mission.md"
    echo "  Installed: $mission_dir/mission.md (nightly at 23:00)"
  fi
  cp "$skill_dir/scripts/collect.sh" "$mission_scripts/collect.sh"
  cp "$skill_dir/scripts/collect_sessions.sh" "$mission_scripts/collect_sessions.sh"
  chmod +x "$mission_scripts/collect.sh" "$mission_scripts/collect_sessions.sh"
}

# Symlink the installed binary onto PATH at ~/.local/bin/ling-mem so the
# agent (and the user) can invoke it as a bare `ling-mem` command. We
# prefer the Claude install — that's the canonical location when present
# (Linggen also reads from ~/.claude/skills/), and `self-update` will
# only rewrite the inode the symlink points to.
#
# Args: <linggen_bin_or_empty> <claude_bin_or_empty>
create_path_symlink() {
  local linggen_bin="${1:-}"
  local claude_bin="${2:-}"

  local target=""
  if [ -n "$claude_bin" ] && [ -x "$claude_bin" ]; then
    target="$claude_bin"
  elif [ -n "$linggen_bin" ] && [ -x "$linggen_bin" ]; then
    target="$linggen_bin"
  else
    echo "  Warning: no installed binary found to symlink — skipping PATH setup" >&2
    return
  fi

  local link_dir="$HOME/.local/bin"
  local link="$link_dir/ling-mem"
  mkdir -p "$link_dir"
  ln -sf "$target" "$link"
  echo "  Linked: $link → $target"

  case ":$PATH:" in
    *":$link_dir:"*) ;;
    *)
      echo "  Note: $link_dir is not on PATH. Add it to your shell rc, e.g.:" >&2
      echo "    echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc" >&2
      ;;
  esac
}

# Symlink the canonical skill dir into ~/.codex/skills/ling-mem so Codex
# discovers it. Codex hooks are plugin-scoped (live in plugin.json), not
# user-global, so the recall hook is CC-only — the skill's CLI still
# works in Codex via SKILL.md instructions.
symlink_to_codex() {
  local source_dir="$1"
  local codex_skills="$HOME/.codex/skills"
  local link="$codex_skills/ling-mem"

  mkdir -p "$codex_skills"

  if [ -L "$link" ]; then
    ln -sfn "$source_dir" "$link"
  elif [ -e "$link" ]; then
    echo "  Warning: $link exists and is not a symlink — leaving alone." >&2
    echo "    To enable Codex use of this install:" >&2
    echo "      rm -rf $link && ln -s $source_dir $link" >&2
    return 0
  else
    ln -s "$source_dir" "$link"
  fi
  echo "  Linked: $link → $source_dir"
  echo "  Note: restart Codex to pick up the skill. Recall hook is CC-only —"
  echo "        Codex sessions need to call 'ling-mem search' explicitly."
}

# CC-only: append a guarded @-import block to ~/.claude/CLAUDE.md so the
# core memory files land in every CC session's system prompt.
configure_claude_md() {
  local claude_md="${CLAUDE_MD:-$HOME/.claude/CLAUDE.md}"
  local marker_start="<!-- ling-mem:core-start -->"
  local marker_end="<!-- ling-mem:core-end -->"

  local block="$marker_start
## Who I am

@~/.linggen/memory/identity.md

## How I work

@~/.linggen/memory/style.md

## Memory

Durable facts live in a RAG store. The \`ling-mem\` skill at \`~/.claude/skills/ling-mem/\` manages scans and dashboards; for ad-hoc retrieval, call \`ling-mem search \"<query>\" --format json | jq -c 'del(.vector)'\` **before** answering when the user's question could connect to past preferences / decisions / gotchas. Mention relevant hits inline — *\"From memory: you prefer X …\"*. The \`del(.vector)\` filter is mandatory — raw output includes 384-dim embeddings that blow up context.
$marker_end"

  mkdir -p "$(dirname "$claude_md")"
  touch "$claude_md"

  # Strip any existing block (under the new ling-mem markers OR the old
  # linggen-memory:core markers from previous installs) + trailing blanks,
  # then append the fresh block.
  local tmp_md
  tmp_md="$(mktemp -t "claude-md-XXXXXX")"
  awk -v s_new="$marker_start" -v e_new="$marker_end" \
      -v s_old="<!-- linggen-memory:core-start -->" \
      -v e_old="<!-- linggen-memory:core-end -->" '
    BEGIN            { skip = 0; blanks = 0 }
    $0 == s_new      { skip = 1; next }
    $0 == s_old      { skip = 1; next }
    $0 == e_new      { skip = 0; next }
    $0 == e_old      { skip = 0; next }
    skip             { next }
    /^[[:space:]]*$/ { blanks++; next }
                     { while (blanks--) print ""; blanks = 0; print }
  ' "$claude_md" > "$tmp_md"
  if [ -s "$tmp_md" ]; then
    printf '\n%s\n' "$block" >> "$tmp_md"
  else
    printf '%s\n' "$block" > "$tmp_md"
  fi
  mv "$tmp_md" "$claude_md"
  echo "  Updated: $claude_md (core @-imports + memory hint)"
}

# CC-only: install a UserPromptSubmit hook that runs `ling-mem search` on
# every user turn and injects relevance-ranked hits into Claude's context,
# scoped to cross-project (global user memory) plus the session's project.
#
# CLAUDE.md tells Claude *to* search; the hook makes the search mechanical
# so it doesn't depend on the model remembering to do it.
#
# Tuning via env vars (set in shell rc — read by the hook at turn time):
#   LING_MEM_RECALL_TOPK       hits surfaced per turn         (default 3)
#   LING_MEM_RECALL_LIMIT      rows fetched before head -K    (default 8)
#   LING_MEM_RECALL_TIMEOUT    hard timeout in seconds        (default 3)
#   LING_MEM_RECALL_MIN_SCORE  cosine similarity floor [-1,1] (default 0.30)
#   LING_MEM_RECALL_DISABLE    set to 1 to silence the hook without uninstall
configure_claude_hook() {
  local skill_dir="$1"
  local hook_dir="$skill_dir/hooks"
  local hook="$hook_dir/recall.sh"
  local settings="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"

  mkdir -p "$hook_dir"

  cat > "$hook" <<'HOOK'
#!/usr/bin/env bash
# UserPromptSubmit hook installed by ling-mem. Surfaces relevant memories
# for each turn. Bails silently on any failure — never blocks the user.
#
# Reads JSON on stdin (Claude Code hook input). Prints zero or more
# "From memory (...): ..." lines to stdout, which Claude sees as added
# context for this turn.

set -u
[ "${LING_MEM_RECALL_DISABLE:-0}" = "1" ] && exit 0

command -v jq       >/dev/null 2>&1 || exit 0
command -v ling-mem >/dev/null 2>&1 || exit 0

input="$(cat)"
prompt="$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null || true)"
cwd="$(printf '%s' "$input"   | jq -r '.cwd    // empty' 2>/dev/null || true)"

# Skip empty / trivial prompts — too short to carry meaningful intent.
[ "${#prompt}" -lt 8 ] && exit 0

topk="${LING_MEM_RECALL_TOPK:-3}"
limit="${LING_MEM_RECALL_LIMIT:-8}"
to="${LING_MEM_RECALL_TIMEOUT:-3}"
min_score="${LING_MEM_RECALL_MIN_SCORE:-0.30}"

# Current project name = last segment of cwd, when cwd is set and not $HOME.
# Used to keep project-scoped rows for *this* project and drop ones scoped
# to other projects. Cross-project / no-context rows always pass.
proj=""
if [ -n "$cwd" ] && [ "$cwd" != "$HOME" ]; then
  proj="$(basename "$cwd")"
fi

# Note: ling-mem's --context filter is AND across multiple values (a row
# must match every context given), so passing both cross-project and a
# project tag returns nothing. We instead search unfiltered, then post-
# filter in jq to drop rows that are scoped to a *different* project.

# Pick whichever timeout binary is available; fall through if neither exists.
TIMEOUT_BIN=""
if command -v timeout  >/dev/null 2>&1; then TIMEOUT_BIN="timeout"
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN="gtimeout"
fi

if [ -n "$TIMEOUT_BIN" ]; then
  out="$($TIMEOUT_BIN "$to" ling-mem search "$prompt" \
      --limit "$limit" --min-score "$min_score" \
      --format json --quiet 2>/dev/null || true)"
else
  out="$(ling-mem search "$prompt" \
      --limit "$limit" --format json --quiet 2>/dev/null || true)"
fi

[ -z "$out" ] && exit 0

# `ling-mem search` emits newline-delimited JSON (one row per line), not a
# JSON array — slurp into an array with -s before filtering.
printf '%s' "$out" | jq -sr --arg proj "$proj" --argjson k "$topk" '
  map(select(
    ((.contexts // []) | map(select(startswith("project/"))))
    | (length == 0 or any(. == ("project/" + $proj)))
  ))
  | .[:$k]
  | .[]
  | "From memory (\(.type), \((.created_at // "")[0:10])): \(.content)"
' 2>/dev/null || true
HOOK
  chmod +x "$hook"

  # Idempotent settings.json patch — drops any prior ling-mem hook entry,
  # then appends the fresh one in CC's current nested shape
  # ({ matcher, hooks: [...] }). Dedup matches by `_lingMemRecall: true`,
  # by inner command path, and by legacy flat `command` — so re-runs stay
  # idempotent even after CC auto-migrates the entry and drops our marker.
  command -v python3 >/dev/null 2>&1 || {
    echo "  Warning: python3 not found — skipping settings.json patch" >&2
    echo "    Manually add to $settings:" >&2
    echo "      hooks.UserPromptSubmit += [{ matcher: \"\", hooks: [{ type: \"command\", command: \"$hook\" }] }]" >&2
    return 0
  }

  python3 - "$settings" "$hook" <<'PY'
import json, os, sys
path, hook_cmd = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    try:
        with open(path) as f:
            data = json.load(f) or {}
    except Exception:
        data = {}
hooks_root = data.setdefault("hooks", {})
ups = hooks_root.setdefault("UserPromptSubmit", [])

def is_ours(h):
    if not isinstance(h, dict):
        return False
    if h.get("_lingMemRecall"):
        return True
    if h.get("command") == hook_cmd:  # legacy flat shape
        return True
    for inner in (h.get("hooks") or []):
        if isinstance(inner, dict) and inner.get("command") == hook_cmd:
            return True
    return False

ups[:] = [h for h in ups if not is_ours(h)]
ups.append({
    "_lingMemRecall": True,
    "matcher": "",
    "hooks": [{"type": "command", "command": hook_cmd}],
})
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
  echo "  Installed: $hook"
  echo "  Registered in: $settings (hooks.UserPromptSubmit)"
}

# -------------------------------------------------------------------
# Install
# -------------------------------------------------------------------

LINGGEN_BIN=""
CLAUDE_BIN=""

if [ "$INSTALL_LINGGEN" -eq 1 ]; then
  echo "Installing to ~/.linggen/skills/ling-mem/"
  LINGGEN_SKILL_DIR="$HOME/.linggen/skills/ling-mem"
  copy_skill_files "$LINGGEN_SKILL_DIR"
  download_binary "$LINGGEN_SKILL_DIR/bin"
  seed_core_memory
  install_dream_mission "$LINGGEN_SKILL_DIR"
  LINGGEN_BIN="$LINGGEN_SKILL_DIR/bin/ling-mem"

  # Clean up the legacy `memory` skill dir if present and shipped (untouched user content stays).
  if [ -d "$HOME/.linggen/skills/memory" ]; then
    echo "  Removing legacy ~/.linggen/skills/memory/"
    rm -rf "$HOME/.linggen/skills/memory"
  fi
fi

if [ "$INSTALL_CLAUDE" -eq 1 ]; then
  echo "Installing to ~/.claude/skills/ling-mem/"
  CLAUDE_SKILL_DIR="$HOME/.claude/skills/ling-mem"
  copy_skill_files "$CLAUDE_SKILL_DIR"
  download_binary "$CLAUDE_SKILL_DIR/bin"
  seed_core_memory
  configure_claude_md
  configure_claude_hook "$CLAUDE_SKILL_DIR"
  CLAUDE_BIN="$CLAUDE_SKILL_DIR/bin/ling-mem"

  # Clean up the legacy `linggen-memory` skill dir if present.
  if [ -d "$HOME/.claude/skills/linggen-memory" ]; then
    echo "  Removing legacy ~/.claude/skills/linggen-memory/"
    rm -rf "$HOME/.claude/skills/linggen-memory"
  fi
fi

create_path_symlink "$LINGGEN_BIN" "$CLAUDE_BIN"

# Codex auto-detect: additive symlink, never a primary install target.
# Prefer the ~/.claude install as the source (matches the binary symlink
# preference in create_path_symlink), fall back to ~/.linggen.
if [ -d "$HOME/.codex" ] && [ "${LING_MEM_SKIP_CODEX:-0}" != "1" ]; then
  CODEX_SOURCE=""
  if [ "$INSTALL_CLAUDE" -eq 1 ]; then
    CODEX_SOURCE="$CLAUDE_SKILL_DIR"
  elif [ "$INSTALL_LINGGEN" -eq 1 ]; then
    CODEX_SOURCE="$LINGGEN_SKILL_DIR"
  fi
  if [ -n "$CODEX_SOURCE" ]; then
    echo "Detected ~/.codex/ — symlinking into ~/.codex/skills/ling-mem/"
    symlink_to_codex "$CODEX_SOURCE"
  fi
fi

# Flag the other host's leftover skill dir so users can clean up after a
# host switch (e.g. previously installed via --host=both, now claude-only).
if [ "$INSTALL_CLAUDE" -eq 1 ] && [ "$INSTALL_LINGGEN" -eq 0 ]; then
  warn_stale_copy "$HOME/.linggen/skills/ling-mem"
fi
if [ "$INSTALL_LINGGEN" -eq 1 ] && [ "$INSTALL_CLAUDE" -eq 0 ]; then
  warn_stale_copy "$HOME/.claude/skills/ling-mem"
fi

echo ""
echo "Done. To browse / edit rows: run 'ling-mem start' then open http://127.0.0.1:9888"
