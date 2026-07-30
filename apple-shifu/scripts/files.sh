#!/usr/bin/env bash
# Files tab backend — enumerate, hash, and remove Mac files.
#
# Deliberately venv-free: unlike the Media pipeline this needs nothing beyond
# the shell, so the Files tab works on a fresh install with no setup step.
#
# Every listing subcommand emits pipe-delimited lines with the PATH LAST, so a
# path containing '|' still parses (split on the first N delimiters only).
# Paths containing a newline are not representable and are skipped upstream by
# mdfind/find, which is the same assumption the rest of the skill makes.
#
#   large [target]        size|atime|mtime|path   — biggest files under $HOME
#   downloads             size|atime|mtime|path   — direct entries of ~/Downloads
#   caches                size|label|path         — regenerable cache roots
#   sha <list-file>       sha256|path             — one path per line
#   trash <list-file>     JSON counts             — to the macOS Trash (recoverable)
#   purge <list-file>     JSON counts             — outright rm, CACHE ROOTS ONLY
#
# trash and purge also write <list-file>.done: exactly the paths that went.
# The caller reports reclaimed bytes from that list using the sizes it already
# displayed, so the figure in the toast and the figure in the row agree.
#
# `trash` is for the user's own files. `purge` exists because a cache moved to
# the Trash frees nothing until the Trash is emptied, which would make a "freed
# 12 GB" claim false at the moment we make it. purge REFUSES any path that is
# not inside a known cache root — the guard is here, not in the UI, so no
# caller can talk it into deleting something else.

set -u

cmd="${1:-}"
shift || true

# ── cache roots ────────────────────────────────────────────────────────────
# Regenerable by definition: an app rebuilds these on next launch. Build
# outputs (node_modules, target/) are deliberately NOT here — they are
# project state, expensive to rebuild, and the System tab already reports them.
cache_roots() {
  printf '%s\n' \
    "$HOME/Library/Caches" \
    "$HOME/Library/Logs" \
    "$HOME/Library/Developer/Xcode/DerivedData" \
    "$HOME/Library/Developer/CoreSimulator/Caches" \
    "$HOME/.cache" \
    "$HOME/.npm/_cacache" \
    "$HOME/.cargo/registry/cache"
}

# True when $1 sits inside a cache root (or IS one of the non-container roots).
# ~/Library/Caches itself is never purgeable as a whole — only its per-app
# children — because emptying it wholesale disturbs every running app.
in_cache_root() {
  local p="$1" root
  case "$p" in
    "$HOME"/Library/Caches/?*) return 0 ;;
    "$HOME"/Library/Caches) return 1 ;;
  esac
  while read -r root; do
    [ "$p" = "$root" ] && return 0
    case "$p" in "$root"/?*) return 0 ;; esac
  done < <(cache_roots)
  return 1
}

emit_stat() {
  # size|atime|mtime|path for a regular file, nothing for anything else
  stat -f '%HT|%z|%a|%m|%N' "$1" 2>/dev/null | awk -F'|' -v OFS='|' '
    $1 == "Regular File" { path = $5; for (i = 6; i <= NF; i++) path = path "|" $i
                           print $2, $3, $4, path }'
}

case "$cmd" in

  large)
    # Tiered Spotlight query: ask at shrinking size thresholds and stop once
    # enough have surfaced. Spotlight already has the index, so each tier costs
    # ~100ms against the ~100s a fresh traversal would. Tiering also guarantees
    # the BIGGEST files come first — a single find piped to head cuts in
    # directory order and can miss a huge file buried deep.
    target="${1:-50}"
    hits=$(mktemp)
    trap 'rm -f "$hits"' EXIT
    : > "$hits"
    for min in 10737418240 5368709120 1073741824 524288000 209715200 104857600 52428800; do
      if command -v mdfind >/dev/null 2>&1; then
        mdfind "kMDItemFSSize > $min" -onlyin "$HOME" 2>/dev/null \
          | grep -vE '/Library/Caches/|/\.Trash/|/node_modules/|/target/|/\.git/|/Library/Containers/' \
          | head -n 300 >> "$hits"
      else
        find "$HOME" -type f -size "+$((min / 1048576))M" \
          -not -path '*/.*' -not -path '*/node_modules/*' -not -path '*/target/*' \
          2>/dev/null | head -n 300 >> "$hits"
      fi
      [ "$(sort -u "$hits" | wc -l | tr -d ' ')" -ge "$target" ] && break
    done
    sort -u "$hits" | while IFS= read -r f; do emit_stat "$f"; done
    ;;

  downloads)
    # Direct entries only — a folder is one row carrying its recursive size,
    # because that is the unit a person actually decides about.
    [ -d "$HOME/Downloads" ] || exit 0
    for entry in "$HOME"/Downloads/* "$HOME"/Downloads/.??*; do
      [ -e "$entry" ] || continue
      if [ -d "$entry" ]; then
        size=$(du -sk "$entry" 2>/dev/null | awk '{print $1 * 1024}')
        read -r atime mtime <<<"$(stat -f '%a %m' "$entry" 2>/dev/null)"
        [ -n "${size:-}" ] && printf '%s|%s|%s|%s\n' "$size" "${atime:-0}" "${mtime:-0}" "$entry"
      else
        emit_stat "$entry"
      fi
    done
    ;;

  caches)
    # Per-app children of ~/Library/Caches, plus the standalone roots. One du
    # call per parent keeps this fast even with hundreds of app caches.
    if [ -d "$HOME/Library/Caches" ]; then
      du -sk "$HOME"/Library/Caches/* 2>/dev/null | while IFS=$'\t' read -r kb path; do
        [ -n "${path:-}" ] || continue
        printf '%s|%s|%s\n' "$((kb * 1024))" "app cache" "$path"
      done
    fi
    while read -r root; do
      case "$root" in "$HOME/Library/Caches") continue ;; esac
      [ -e "$root" ] || continue
      kb=$(du -sk "$root" 2>/dev/null | awk '{print $1}')
      [ -n "${kb:-}" ] || continue
      case "$root" in
        */DerivedData) label="Xcode build cache" ;;
        */CoreSimulator/Caches) label="Simulator cache" ;;
        "$HOME/Library/Logs") label="app logs" ;;
        */_cacache) label="npm cache" ;;
        */registry/cache) label="cargo cache" ;;
        *) label="cache" ;;
      esac
      printf '%s|%s|%s\n' "$((kb * 1024))" "$label" "$root"
    done < <(cache_roots)
    ;;

  sha)
    # Full-content hashes. The Files tab offers duplicates for DELETION, so a
    # cheap prefix hash is not good enough — two different large files can
    # share a size and a first block.
    list="${1:?list file required}"
    while IFS= read -r p; do
      [ -f "$p" ] || continue
      h=$(shasum -a 256 "$p" 2>/dev/null | awk '{print $1}')
      [ -n "${h:-}" ] && printf '%s|%s\n' "$h" "$p"
    done < "$list"
    ;;

  trash)
    # What actually went is written to <list>.done, one path per line. The
    # caller sums the sizes it already showed the user rather than taking a
    # second measurement here — `du` reports blocks on disk and the listings
    # report apparent size, and a sparse or compressed file makes those two
    # numbers disagree about the very same file.
    list="${1:?list file required}"
    done_list="$list.done"
    : > "$done_list"
    trashed=0; failed=0
    while IFS= read -r p; do
      [ -e "$p" ] || continue
      if osascript -e "tell application \"Finder\" to delete POSIX file \"${p//\"/\\\"}\"" >/dev/null 2>&1; then
        trashed=$((trashed + 1)); printf '%s\n' "$p" >> "$done_list"
      else
        # Finder refuses on some volumes and when it is not running; move by
        # hand, uniquifying so an existing item of the same name survives.
        base=$(basename "$p"); dest="$HOME/.Trash/$base"; n=1
        while [ -e "$dest" ]; do dest="$HOME/.Trash/${base%.*} $n.${base##*.}"; n=$((n + 1)); done
        if mv "$p" "$dest" 2>/dev/null; then
          trashed=$((trashed + 1)); printf '%s\n' "$p" >> "$done_list"
        else
          failed=$((failed + 1))
        fi
      fi
    done < "$list"
    printf '{"trashed":%d,"failed":%d}\n' "$trashed" "$failed"
    ;;

  purge)
    # Outright removal. Caches only — see the guard note at the top.
    list="${1:?list file required}"
    done_list="$list.done"
    : > "$done_list"
    removed=0; refused=0; failed=0
    while IFS= read -r p; do
      [ -e "$p" ] || continue
      if ! in_cache_root "$p"; then refused=$((refused + 1)); continue; fi
      if rm -rf "$p" 2>/dev/null; then
        removed=$((removed + 1)); printf '%s\n' "$p" >> "$done_list"
      else
        failed=$((failed + 1))
      fi
    done < "$list"
    printf '{"removed":%d,"refused":%d,"failed":%d}\n' "$removed" "$refused" "$failed"
    ;;

  *)
    echo "usage: files.sh {large|downloads|caches|sha|trash|purge} [args]" >&2
    exit 2
    ;;
esac
