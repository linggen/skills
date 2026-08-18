#!/usr/bin/env bash
set -euo pipefail
#
# install.sh — install the shared-memory skill.
#
# Layout (one canonical bundle, thin per-host SKILL.md stubs):
#
#   ~/.linggen/skills/shared-memory/   ← CANONICAL. All references/,
#                                        scripts/, hooks/, plus the
#                                        SKILL.md every host reads.
#   ~/.claude/skills/shared-memory/SKILL.md      ← copy of canonical
#   ~/.codex/skills/shared-memory/SKILL.md       ← copy of canonical
#   ~/.openclaw/skills/shared-memory/SKILL.md    ← copy of canonical
#
# This script installs SKILL FILES AND HOST WIRING ONLY. It does not
# install the `ling-mem` binary, and must never start doing so again.
#
#   ~/.local/bin/ling-mem   ← the ONE binary, owned by install-bin.sh
#                             (linggen-memory/plugins/*/scripts/install-bin.sh),
#                             driven by the plugin's autostart.sh hook and
#                             the SKILL.md first-use gate.
#
# Why the binary is not ours to write: it is a singleton shared by every
# host and channel, so exactly one installer may place it. install-bin.sh
# is that installer — it resolves a semver RANGE (`^1`) to the highest
# matching release, verifies SHA-256, and REFUSES TO DOWNGRADE. This
# script used to install the binary itself, to /usr/local/bin, pinned at
# v1.0.0, with a skip-guard that only fired when the version was
# "latest" — so on every fresh Linggen it shadowed the correct binary
# with an ancient one that first-match-wins resolvers then preferred.
#
# Why this shape:
# - Single source of truth — edit content once at ~/.linggen/skills/
#   shared-memory/ (e.g. by re-running install.sh, or by an update tool)
#   and every host sees the change. No per-host references/ to keep in
#   sync.
# - SKILL.md uses absolute paths (~/.linggen/skills/shared-memory/...)
#   for cross-tree reads, so the host's agent never needs the per-host
#   bundle to contain references/ or scripts/.
#
# Supply-chain posture: no downloads, no remote code execution — this
# script only copies files already on disk and edits host config. No data
# leaves the machine. Source:
# https://github.com/linggen/linggen-memory
# https://github.com/linggen/skills

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null)" || SOURCE_DIR=""

# The one binary, for the messages below and Codex's sandbox PATH. This
# script never writes it — install-bin.sh owns it.
BIN_DIR="$HOME/.local/bin"

# Canonical layout — one bundle, on disk under ~/.linggen.
CANONICAL_DIR="$HOME/.linggen/skills/shared-memory"

# Per-host stub destinations. The agent inside each host reads the
# host's <skills>/shared-memory/SKILL.md (a copy of canonical), which
# uses absolute paths back into CANONICAL_DIR for references / scripts.
HOST_DIRS=(
  "$HOME/.claude/skills/shared-memory"
  "$HOME/.codex/skills/shared-memory"
  "$HOME/.openclaw/skills/shared-memory"
)

# Self-bootstrap: when invoked via `curl ... | bash`, $0 is bash itself
# and $SOURCE_DIR ends up pointing at the user's cwd — there is no local
# clone with SKILL.md, scripts/, references/, etc. Detect this and fetch
# the canonical skill tree from GitHub into a temp dir, then re-target
# SOURCE_DIR.
if [ -z "$SOURCE_DIR" ] || [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
  BOOTSTRAP_REPO="${LING_MEM_SKILLS_REPO:-linggen/skills}"
  # Pinned to a per-skill scoped tag so a `curl | bash` one-liner
  # fetches a known revision, not whatever main currently points at.
  # Users can override with LING_MEM_REPO_REF=main for HEAD.
  BOOTSTRAP_REF="${LING_MEM_REPO_REF:-shared-memory-v0.7.2}"
  BOOTSTRAP_URL="https://github.com/${BOOTSTRAP_REPO}/archive/${BOOTSTRAP_REF}.tar.gz"
  BOOTSTRAP_TMP="$(mktemp -d -t shared-memory-bootstrap-XXXXXX)"
  BOOTSTRAP_TAR="$BOOTSTRAP_TMP/skills.tar.gz"
  trap 'rm -rf "$BOOTSTRAP_TMP"' EXIT

  echo "Fetching shared-memory skill from ${BOOTSTRAP_REPO}@${BOOTSTRAP_REF}..."
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

  SOURCE_DIR="$(find "$BOOTSTRAP_TMP" -maxdepth 3 -type d -name shared-memory | head -n1)"
  if [ -z "$SOURCE_DIR" ] || [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
    echo "Error: shared-memory/SKILL.md not found in tarball" >&2
    exit 1
  fi
fi

# -------------------------------------------------------------------
# Args
# -------------------------------------------------------------------

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      cat <<EOF
Usage: install.sh

Installs the shared-memory skill, one canonical copy at
~/.linggen/skills/shared-memory/. Each detected host (~/.claude/,
~/.codex/, ~/.openclaw/) gets a thin SKILL.md stub that points back
to the canonical bundle.

Skill files and host wiring only. The \`ling-mem\` binary is NOT installed
here — it is a singleton at ~/.local/bin/ling-mem, installed by
install-bin.sh via the plugin's autostart hook or the SKILL.md first-use
gate (semver range \`^1\`, SHA-256 verified, never downgraded).

  LING_MEM_REPO_REF=<ref>    skills repo ref for curl|bash bootstrap
                             (default: shared-memory-v0.7.2)
  LING_MEM_SKIP_CODEX=1      skip the Codex stub + sandbox wiring
  LING_MEM_SKIP_OPENCLAW=1   skip the OpenClaw USER.md directive
EOF
      exit 0
      ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# -------------------------------------------------------------------
# Canonical bundle — every file lives once at ~/.linggen/skills/shared-memory/
# -------------------------------------------------------------------

install_canonical_bundle() {
  echo "Installing canonical bundle at $CANONICAL_DIR/"

  if [ "$SOURCE_DIR" = "$CANONICAL_DIR" ]; then
    echo "  Files already in place — skipping copy"
    return
  fi

  mkdir -p "$CANONICAL_DIR/scripts" \
           "$CANONICAL_DIR/references" \
           "$CANONICAL_DIR/hooks"

  install -m 0644 "$SOURCE_DIR/SKILL.md"  "$CANONICAL_DIR/SKILL.md"
  install -m 0644 "$SOURCE_DIR/index.html" "$CANONICAL_DIR/index.html"
  install -m 0644 "$SOURCE_DIR/LICENSE"    "$CANONICAL_DIR/LICENSE"

  for ref in routing-rules.md dream-flow.md dashboard.md extractor-prompt.md; do
    install -m 0644 "$SOURCE_DIR/references/$ref" "$CANONICAL_DIR/references/$ref"
  done

  for f in collect.sh collect_sessions.sh extract_session.sh; do
    install -m 0755 "$SOURCE_DIR/scripts/$f" "$CANONICAL_DIR/scripts/$f"
  done
  for f in api.js chat-bridge.js memory-app.js memory.css memory.html \
           page-renderer.js style.css widget-renderers.js; do
    install -m 0644 "$SOURCE_DIR/scripts/$f" "$CANONICAL_DIR/scripts/$f"
  done

  install -m 0755 "$SOURCE_DIR/hooks/recall.sh" "$CANONICAL_DIR/hooks/recall.sh"
}

# -------------------------------------------------------------------
# Per-host SKILL.md stub — copies of the canonical SKILL.md into each
# detected host's skills dir. The SKILL.md body uses absolute paths
# into ~/.linggen/skills/shared-memory/ so the agent finds references
# and scripts regardless of which host's discovery surfaced the file.
# -------------------------------------------------------------------

install_host_stub() {
  local host_dir="$1"
  local parent; parent="$(dirname "$host_dir")"   # ~/.<host>/skills

  # Only install when the host's home is present — never auto-create
  # ~/.claude/ etc. on a machine that doesn't have that host.
  local host_home; host_home="$(dirname "$parent")"   # ~/.<host>
  [ -d "$host_home" ] || return 0

  mkdir -p "$host_dir"
  install -m 0644 "$CANONICAL_DIR/SKILL.md" "$host_dir/SKILL.md"
  echo "  Stub: $host_dir/SKILL.md"
}

install_host_stubs() {
  echo "Installing per-host SKILL.md stubs..."
  local installed=0
  for d in "${HOST_DIRS[@]}"; do
    # Honor opt-outs.
    case "$d" in
      */.codex/*)    [ "${LING_MEM_SKIP_CODEX:-0}"    = "1" ] && continue ;;
      */.openclaw/*) [ "${LING_MEM_SKIP_OPENCLAW:-0}" = "1" ] && continue ;;
    esac
    if install_host_stub "$d"; then
      [ -f "$d/SKILL.md" ] && installed=$((installed + 1))
    fi
  done
  if [ "$installed" -eq 0 ]; then
    echo "  (no host runtimes detected — canonical bundle still installed)"
  fi
}

# -------------------------------------------------------------------
# Binary — NOT INSTALLED HERE. See the header: ~/.local/bin/ling-mem is
# a singleton owned by install-bin.sh. All this does is report whether
# it is already present, so a user running install.sh by hand knows
# whether anything is still missing.
# -------------------------------------------------------------------

report_binary() {
  local bin="$BIN_DIR/ling-mem"
  if [ -x "$bin" ]; then
    echo "Binary: $bin ($("$bin" --version 2>/dev/null | awk '{print $2}' || echo unknown))"
    return
  fi
  echo "Binary: not installed yet — the plugin's autostart hook or the"
  echo "        SKILL.md first-use gate installs it to $bin on next use."
}

# -------------------------------------------------------------------
# Memory dir
# -------------------------------------------------------------------
#
# Note: `dream` ships as a `/shared-memory dream` slash command, not a
# cron mission. Missions are owned by the engine (Linggen seeds its own
# built-in `~/.linggen/missions/dream/`); skills should not install
# missions. See the design doc for the rationale.

seed_memory_dir() {
  mkdir -p "$HOME/.linggen/memory"
}

# No install-source marker is written here. install-bin.sh writes
# ~/.linggen/.ling-mem-install-source itself as part of placing the
# binary — provenance belongs to whoever actually installed it, and a
# second writer would just overwrite the truth with a guess.

# -------------------------------------------------------------------
# Claude Code wiring — CLAUDE.md @-imports + settings.json hook entry
# -------------------------------------------------------------------

configure_claude_md() {
  [ -d "$HOME/.claude" ] || return 0
  local claude_md="${CLAUDE_MD:-$HOME/.claude/CLAUDE.md}"
  local marker_start="<!-- ling-mem:core-start -->"
  local marker_end="<!-- ling-mem:core-end -->"

  local block="$marker_start
## Who I am · How I work

Core memory lives in the \`ling-mem\` daemon's \`semantic\` table with
\`tier=core\` — narrow universals about the person + standing-instruction
preferences. **At the start of every session**, load it:

\`\`\`
ling-mem list --tier core --limit 100 --format json | jq -c 'del(.vector)'
\`\`\`

## Memory

Durable signal lives in the \`ling-mem\` daemon (semantic + episodic
tables). The \`shared-memory\` skill at \`~/.linggen/skills/shared-memory/\`
holds the canonical SKILL.md, references/, scripts/; each host's
\`skills/shared-memory/SKILL.md\` is a stub copy pointing back here.
For ad-hoc retrieval, call
\`ling-mem search \"<query>\" --format json | jq -c 'del(.vector)'\`
**before** answering when the user's question could connect to past
preferences / decisions / gotchas. Mention relevant hits inline —
*\"From memory: you prefer X …\"*. The \`del(.vector)\` filter is
mandatory — raw output includes 1024-dim embeddings (Qwen3-Embedding-0.6B)
that blow up context.
$marker_end"

  mkdir -p "$(dirname "$claude_md")"
  touch "$claude_md"

  local tmp_md; tmp_md="$(mktemp -t "claude-md-XXXXXX")"
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
  echo "  Updated: $claude_md (core directive)"
}

configure_claude_hook() {
  [ -d "$HOME/.claude" ] || return 0
  local hook="$CANONICAL_DIR/hooks/recall.sh"
  local settings="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"

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
    if h.get("command") == hook_cmd:
        return True
    for inner in (h.get("hooks") or []):
        if isinstance(inner, dict) and inner.get("command") == hook_cmd:
            return True
        # Catch stale entries that pointed at the old per-host bundle path.
        if isinstance(inner, dict):
            cmd = inner.get("command") or ""
            if cmd.endswith("/hooks/recall.sh"):
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
  echo "  Hook registered: $settings (UserPromptSubmit → $hook)"
}

# -------------------------------------------------------------------
# Codex wiring — features flag, sandbox writable_roots, PATH (if
# binary went to ~/.local/bin), hooks.json
# -------------------------------------------------------------------

configure_codex_features() {
  local codex_toml="${CODEX_CONFIG:-$HOME/.codex/config.toml}"
  mkdir -p "$(dirname "$codex_toml")"
  touch "$codex_toml"

  if grep -qE '^[[:space:]]*hooks[[:space:]]*=' "$codex_toml"; then
    return 0
  fi

  # Codex deprecated `[features].codex_hooks` in favour of `[features].hooks`
  # and warns about the old key on every launch. Rewrite it in place: an
  # early return here would leave every EXISTING install on the dead key
  # forever, so renaming the writes below would only ever help fresh ones.
  if grep -qE '^[[:space:]]*codex_hooks[[:space:]]*=' "$codex_toml"; then
    local tmp; tmp="$(mktemp)"
    sed -E 's/^([[:space:]]*)codex_hooks([[:space:]]*=)/\1hooks\2/' "$codex_toml" > "$tmp"
    mv "$tmp" "$codex_toml"
    echo "  Codex features: codex_hooks → hooks (migrated deprecated key)"
    return 0
  fi

  if grep -qE '^\[features\]' "$codex_toml"; then
    local tmp; tmp="$(mktemp)"
    awk '
      BEGIN { inserted=0 }
      /^\[features\]/ && !inserted {
        print
        print "hooks = true   # added by shared-memory install.sh"
        inserted=1
        next
      }
      { print }
    ' "$codex_toml" > "$tmp"
    mv "$tmp" "$codex_toml"
    echo "  Codex features: hooks = true"
    return 0
  fi

  local tmp; tmp="$(mktemp)"
  awk '
    /^# BEGIN ling-mem features$/ { skip=1; next }
    /^# END ling-mem features$/   { skip=0; next }
    !skip { print }
  ' "$codex_toml" > "$tmp"

  cat >> "$tmp" <<TOML

# BEGIN ling-mem features
[features]
hooks = true
# END ling-mem features
TOML

  mv "$tmp" "$codex_toml"
  echo "  Codex features: hooks = true"
}

configure_codex_sandbox() {
  local codex_toml="${CODEX_CONFIG:-$HOME/.codex/config.toml}"
  local linggen_root="$HOME/.linggen"

  mkdir -p "$(dirname "$codex_toml")"
  touch "$codex_toml"

  local tmp; tmp="$(mktemp)"
  awk '
    /^# BEGIN ling-mem sandbox$/ { skip=1; next }
    /^# END ling-mem sandbox$/   { skip=0; next }
    !skip { print }
  ' "$codex_toml" > "$tmp"

  if grep -qE '^\[sandbox_workspace_write' "$tmp"; then
    rm -f "$tmp"
    echo "  Warning: $codex_toml already has a [sandbox_workspace_write] block." >&2
    echo "    Add this entry to its writable_roots manually:" >&2
    echo "      writable_roots = [\"$linggen_root\"]" >&2
    return 0
  fi

  cat >> "$tmp" <<TOML

# BEGIN ling-mem sandbox
[sandbox_workspace_write]
writable_roots = ["$linggen_root"]
# END ling-mem sandbox
TOML

  mv "$tmp" "$codex_toml"
  echo "  Codex sandbox: writable_roots += $linggen_root"
}

# The binary always lives in ~/.local/bin, which Codex's default sandbox
# PATH does NOT cover (especially on macOS GUI launches), so this wiring
# is now unconditional — it used to be skipped whenever the binary had
# landed in /usr/local/bin.
configure_codex_env() {
  local codex_toml="${CODEX_CONFIG:-$HOME/.codex/config.toml}"
  mkdir -p "$(dirname "$codex_toml")"
  touch "$codex_toml"

  local tmp; tmp="$(mktemp)"
  awk '
    /^# BEGIN ling-mem env$/ { skip=1; next }
    /^# END ling-mem env$/   { skip=0; next }
    !skip { print }
  ' "$codex_toml" > "$tmp"

  if grep -qE '^\[shell_environment_policy' "$tmp"; then
    rm -f "$tmp"
    echo "  Warning: $codex_toml already has a [shell_environment_policy] block." >&2
    echo "    Add this entry to [shell_environment_policy.set] manually:" >&2
    echo "      PATH = \"$BIN_DIR:<your existing PATH>\"" >&2
    return 0
  fi

  local new_path="$PATH"
  case ":$new_path:" in
    *":$BIN_DIR:"*) ;;
    *) new_path="$BIN_DIR:$new_path" ;;
  esac

  cat >> "$tmp" <<TOML

# BEGIN ling-mem env
[shell_environment_policy.set]
PATH = "$new_path"
# END ling-mem env
TOML

  mv "$tmp" "$codex_toml"
  echo "  Codex env: PATH includes $BIN_DIR"
}

configure_codex_hook() {
  local hook="$CANONICAL_DIR/hooks/recall.sh"
  local hooks_json="${CODEX_HOOKS:-$HOME/.codex/hooks.json}"

  mkdir -p "$(dirname "$hooks_json")"

  if [ -f "$hooks_json" ] && ! grep -q "ling-mem\|shared-memory" "$hooks_json" 2>/dev/null; then
    echo "  Warning: $hooks_json exists and is not ling-mem-managed." >&2
    echo "    Add this UserPromptSubmit entry manually:" >&2
    echo "      { \"type\": \"command\", \"command\": \"$hook\" }" >&2
    return 0
  fi

  cat > "$hooks_json" <<JSON
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$hook"
          }
        ]
      }
    ]
  }
}
JSON

  echo "  Codex hook registered: $hooks_json (UserPromptSubmit → $hook)"
}

# -------------------------------------------------------------------
# OpenClaw wiring — USER.md directive append (no hook surface in OC)
# -------------------------------------------------------------------

configure_openclaw_user_md() {
  local user_md="$HOME/.openclaw/workspace/USER.md"
  [ -f "$user_md" ] || return 0

  local marker_start="<!-- ling-mem:openclaw-start -->"
  local marker_end="<!-- ling-mem:openclaw-end -->"

  local block="$marker_start
## Memory — \`ling-mem\` is your second memory system

Alongside \`MEMORY.md\` (workspace-scoped, narrative), you have access to
\`ling-mem\` — a shared RAG store at \`~/.linggen/memory/\`, used across
Claude Code, Linggen, Codex, and OpenClaw. The \`shared-memory\` skill
ships its canonical bundle at \`~/.linggen/skills/shared-memory/\`; the
SKILL.md you see in this host is a thin stub pointing back there.

**Search before answering** when the question could connect to past
preferences / decisions / gotchas:

\`\`\`
ling-mem search \"<query>\" --format json | jq -c 'del(.vector)'
\`\`\`

Mention hits inline — *\"From memory: you prefer X …\"*. The
\`del(.vector)\` filter is mandatory — raw output includes 1024-dim
embeddings (Qwen3-Embedding-0.6B) that blow up context.

**Save high-signal user statements** per the routing rules in the
canonical SKILL.md. Same security boundary as \`MEMORY.md\` — don't
search or share \`ling-mem\` content in group chats / shared contexts.
$marker_end"

  local tmp_md; tmp_md="$(mktemp -t "openclaw-user-md-XXXXXX")"
  awk -v s="$marker_start" -v e="$marker_end" '
    BEGIN            { skip = 0; blanks = 0 }
    $0 == s          { skip = 1; next }
    $0 == e          { skip = 0; next }
    skip             { next }
    /^[[:space:]]*$/ { blanks++; next }
                     { while (blanks--) print ""; blanks = 0; print }
  ' "$user_md" > "$tmp_md"
  if [ -s "$tmp_md" ]; then
    printf '\n%s\n' "$block" >> "$tmp_md"
  else
    printf '%s\n' "$block" > "$tmp_md"
  fi
  mv "$tmp_md" "$user_md"
  echo "  Updated: $user_md (shared-memory usage directive)"
}

# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------

install_canonical_bundle
seed_memory_dir
install_host_stubs
report_binary

# Host-specific wiring — runs only when the host's home exists.
if [ -d "$HOME/.claude" ]; then
  echo "Wiring Claude Code..."
  configure_claude_md
  configure_claude_hook
fi

if [ -d "$HOME/.codex" ] && [ "${LING_MEM_SKIP_CODEX:-0}" != "1" ]; then
  echo "Wiring Codex..."
  configure_codex_features
  configure_codex_sandbox
  configure_codex_env
  configure_codex_hook
fi

if [ "${LING_MEM_SKIP_OPENCLAW:-0}" != "1" ]; then
  configure_openclaw_user_md
fi

echo ""
echo "Done. Canonical bundle: $CANONICAL_DIR"
echo ""
echo "Browse / edit rows: run 'ling-mem start' then open http://127.0.0.1:9528"
echo ""
echo "Note: ling-mem sends anonymous usage pings (install, daily-active, command"
echo "      name) to help improve it. No content, no identity. Disable any time:"
echo "        touch ~/.linggen/no-telemetry"
