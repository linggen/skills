#!/usr/bin/env bash
# Clearable scan — find what a Mac can let go of by WHAT a folder is, not by
# how big one file in it is. Build caches are millions of small files, so a
# "biggest files" search never sees the 200 GB `target/` beside a Cargo.toml.
#
# The rules are data: clearables.json. This file knows only a handful of
# finder kinds (marker, path, children, ext, big, series, cmd) and removal
# methods (tool, purge, trash, report); no rule is named here.
#
#   start <out-dir>          run `scan` in the background (one at a time)
#   scan <out-dir>           stream rows into <out-dir>/rows.txt
#   clear <list-file>        remove `rule<TAB>path` lines — every one re-verified
#   tree [rows] [json]       the deep walk alone (scan runs it last)
#   look <path>              a folder's children from the saved tree (for Ling)
#   hotspots                 the tree's hotspots and unexplained total (for Ling)
#   propose <path> <why>     add a "Found by Shifu" row (Ling's find)
#   unpropose <path>         drop one
#
# rows.txt lines, path always LAST so a '|' in a name survives:
#   S|<started>                                   scan began
#   P|<candidates>                                how many rows will be measured
#   R|<rule>|<bytes>|<state>|<last>|<running>|<extra>|<path>
#   T|<started>                                   the deep walk began
#   H|<bytes>|<state>|<path>                      one top-level home folder
#   D|<finished>|<seconds>                        scan ended
# state: ok · timeout (ran past its budget) · denied (macOS refused) · skipped
# (the scan's clock ran out). Anything but ok is "not measured", never 0.
#
# The guard lives here, not in the page: `clear` re-derives every path's shape
# from the catalog and refuses whatever does not fit, so no caller can talk it
# into deleting something else.

set -u
export LC_ALL=C

HERE="$(cd "$(dirname "$0")" && pwd)"
CATALOG="${SHIFU_CATALOG:-$HERE/clearables.json}"
DATA="${SHIFU_DATA:-$HERE/../data/files}"
FOUND="$DATA/found.txt"
LAST_ROWS="$DATA/clearables/rows.txt"

ITEM_BUDGET=${SHIFU_ITEM_BUDGET:-240}     # seconds one folder's du may take
SCAN_BUDGET=${SHIFU_SCAN_BUDGET:-600}     # seconds for the whole measuring pass
LANES=${SHIFU_LANES:-6}                   # folders measured at once
TOOL_BUDGET=${SHIFU_TOOL_BUDGET:-900}     # seconds a `cargo clean` may take

US=$'\x1f'   # column separator in the flattened catalog — never whitespace, so
RS=$'\x1e'   # empty fields survive `read`; RS separates a list inside a field

cmd="${1:-}"
shift || true

# ── plumbing ───────────────────────────────────────────────────────────────

# A command with a time limit (macOS ships no `timeout`). Exit >128 = ran over.
limited() { perl -e 'alarm shift; exec @ARGV' "$@"; }

now() { date +%s; }

# ~ → $HOME, once, for every path the catalog writes.
expand() { case "$1" in "~") printf '%s' "$HOME" ;; "~/"*) printf '%s/%s' "$HOME" "${1#\~/}" ;; *) printf '%s' "$1" ;; esac; }

# Physical path with no symlinks, for files and folders alike. Empty when the
# parent does not exist.
real_path() {
  local p="$1" dir base
  if [ -d "$p" ] && [ ! -L "$p" ]; then (cd -P "$p" 2>/dev/null && pwd -P); return; fi
  dir=$(dirname "$p"); base=$(basename "$p")
  dir=$(cd -P "$dir" 2>/dev/null && pwd -P) || return 0
  printf '%s/%s' "${dir%/}" "$base"
}

REAL_HOME=$(cd -P "$HOME" 2>/dev/null && pwd -P)

under_home() {
  local r; r=$(real_path "$1")
  case "$r" in "$REAL_HOME"/?*) return 0 ;; esac
  return 1
}

slashes() { local s="${1//[!\/]/}"; printf '%s' "${#s}"; }

# Does path $1 have the shape of glob $2? `*` inside [[ ]] crosses '/', so the
# depth must match too — "App Support/*/Cache" never reaches a Cache nested
# five folders deeper.
shape_match() {
  local p="$1" g="$2"
  case "$g" in "~"*) g="$HOME${g#\~}" ;; esac
  # shellcheck disable=SC2053
  [[ "$p" == $g ]] && [ "$(slashes "$p")" = "$(slashes "$g")" ]
}

# A catalog list as words, with no globbing and no splitting on spaces:
# "Application Support/*/Cache" must stay one pattern, not a directory listing.
# Sets L. (bash 3.2 + set -u: expand it as ${L[@]+"${L[@]}"}.)
split_list() { L=(); [ -n "$1" ] && IFS="$RS" read -r -a L <<<"$1"; return 0; }

any_shape() {  # path, RS-joined globs
  local p="$1" g
  split_list "$2"
  for g in ${L[@]+"${L[@]}"}; do shape_match "$p" "$g" && return 0; done
  return 1
}

# Loose glob test (depth free) — for `within` and name lists.
any_glob() {
  local s="$1" g
  split_list "$2"
  for g in ${L[@]+"${L[@]}"}; do
    case "$g" in "~"*) g="$HOME${g#\~}" ;; esac
    # shellcheck disable=SC2053
    [[ "$s" == $g ]] && return 0
  done
  return 1
}

in_list() {  # word, RS-joined list
  local w="$1" x
  split_list "$2"
  for x in ${L[@]+"${L[@]}"}; do [ "$x" = "$w" ] && return 0; done
  return 1
}

sanitize() { printf '%s' "$1" | tr '|\n\r\t' '/   '; }

# ── the catalog, flattened once ────────────────────────────────────────────
# JXA ships with every Mac, so the JSON needs no jq and no python. One line per
# rule; see COLS for the order. W lines carry the walk's prune lists.
COLS="id group label kind markers outputs paths ext names within min_gb min_count keep_days sh probes git method cmd cwd fallback outside_home require_ignored partial safety"

flatten_catalog() {
  osascript -l JavaScript -e '
    function run(argv) {
      const US = "\x1f", RS = "\x1e";
      const text = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null).js;
      const cat = JSON.parse(text);
      const list = (v) => (Array.isArray(v) ? v.join(RS) : (v == null ? "" : String(v)));
      const flag = (v) => (v ? "1" : "0");
      const out = [];
      out.push(["W", "prune_names", list(cat.walk.prune_names)].join(US));
      out.push(["W", "prune_paths", list(cat.walk.prune_paths)].join(US));
      for (const r of cat.rules) {
        const f = r.find || {}, rm = r.remove || {};
        out.push(["R", r.id, r.group, r.label, f.kind, list(f.markers), list(f.outputs), list(f.paths),
          list(f.ext), list(f.names), list(f.within), f.min_gb || "", f.min_count || "", f.keep_days || "",
          f.sh || "", list(r.probes), flag(r.git), rm.method || "", rm.cmd || "", rm.cwd || "",
          rm.fallback || "", flag(f.outside_home), flag(f.require_ignored), flag(r.partial),
          r.safety || "careful"].join(US));
      }
      return out.join("\n");
    }' "$CATALOG"
}

RULES=""   # the flattened file, set by load_catalog
r_kind="" r_method="" r_outputs="" r_keep_days="" r_cmd="" r_cwd="" r_fallback=""

load_catalog() {
  RULES="$WORK/rules"
  flatten_catalog > "$RULES" 2>/dev/null
  [ -s "$RULES" ] || { echo "clearables: could not read $CATALOG" >&2; exit 3; }
}

walk_list() { awk -F"$US" -v k="$1" '$1 == "W" && $2 == k { print $3 }' "$RULES"; }

rule_ids() { awk -F"$US" '$1 == "R" { print $2 }' "$RULES"; }

# Sets r_<col> for rule $1. Returns 1 for an unknown rule.
load_rule() {
  local line
  line=$(awk -F"$US" -v id="$1" '$1 == "R" && $2 == id' "$RULES")
  [ -n "$line" ] || return 1
  IFS="$US" read -r _ r_id r_group r_label r_kind r_markers r_outputs r_paths r_ext r_names r_within \
    r_min_gb r_min_count r_keep_days r_sh r_probes r_git r_method r_cmd r_cwd r_fallback \
    r_outside_home r_require_ignored r_partial r_safety <<<"$line"
}

# ── guards shared by scan, clear, look and propose ─────────────────────────

# Places no rule may ever touch, whatever it says: synced cloud drives (a
# placeholder removed is a file deleted on every device), credentials, and
# the home folder itself.
forbidden() {
  local p="$1"
  case "$p" in
    */Library/CloudStorage|*/Library/CloudStorage/*) return 0 ;;
    */Library/Mobile\ Documents|*/Library/Mobile\ Documents/*) return 0 ;;
    */Library/Keychains|*/Library/Keychains/*) return 0 ;;
    "$HOME"/.ssh|"$HOME"/.ssh/*|"$HOME"/.gnupg|"$HOME"/.gnupg/*) return 0 ;;
  esac
  [ "$p" = "$HOME" ] || [ "$p" = "$REAL_HOME" ] || [ "$p" = "/" ] || [ -z "$p" ]
}

# True when git tracks anything at or inside $1 — source, never a build.
git_tracked() {
  local p="$1"
  if [ -d "$p" ]; then
    [ -n "$(git -C "$p" ls-files 2>/dev/null | head -n 1)" ]
  else
    git -C "$(dirname "$p")" ls-files --error-unmatch -- "$(basename "$p")" >/dev/null 2>&1
  fi
}

# The folder a marker rule's output belongs to.
project_of() {  # path, outputs
  in_list "." "$2" && [ -d "$1" ] && { printf '%s' "$1"; return; }
  dirname "$1"
}

has_marker() {  # dir, RS-joined markers
  local d="$1" m
  local IFS="$RS"
  for m in $2; do [ -e "$d/$m" ] && return 0; done
  return 1
}

# Why rule $1 refuses path $2 — nothing printed means it fits. Every removal
# passes through here, so it reads the disk, never the caller's word.
refusal() {
  local id="$1" p="$2" name project
  load_rule "$id" || { [ "$id" = "found" ] || { echo "unknown rule"; return; }; }
  case "$p" in /*) ;; *) echo "not an absolute path"; return ;; esac
  case "$p" in */../*|*/..|*/./*) echo "path is not plain"; return ;; esac
  [ -e "$p" ] || [ -L "$p" ] || { echo "no longer there"; return; }
  [ -L "$p" ] && { echo "a symlink"; return; }
  forbidden "$p" && { echo "protected place"; return; }
  if [ "$id" = "found" ]; then refusal_found "$p"; return; fi
  [ "$r_method" = "report" ] && { echo "report only — run its command yourself"; return; }
  if [ "$r_outside_home" = "1" ]; then
    any_shape "$p" "$r_paths" || { echo "outside the rule"; return; }
  else
    under_home "$p" || { echo "outside the home folder"; return; }
    [ "$(real_path "$p")" = "$(real_path "$(dirname "$p")")/$(basename "$p")" ] || { echo "path escapes"; return; }
  fi
  git_tracked "$p" && { echo "git tracks files here"; return; }
  name=$(basename "$p")
  case "$r_kind" in
    marker)
      [ -d "$p" ] || { echo "not a folder"; return; }
      project=$(project_of "$p" "$r_outputs")
      if [ "$project" != "$p" ]; then any_glob "$name" "$r_outputs" || { echo "not this rule's folder"; return; }; fi
      has_marker "$project" "$r_markers" || { echo "project marker missing"; return; }
      if [ "$r_require_ignored" = "1" ]; then
        git -C "$project" check-ignore -q -- "$name" 2>/dev/null || { echo "not git-ignored"; return; }
      fi ;;
    path|cmd) any_shape "$p" "$r_paths" || { echo "outside the rule"; return; } ;;
    children)
      [ "$(dirname "$p")" != "$p" ] && any_shape "$(dirname "$p")" "$r_paths" || { echo "outside the rule"; return; } ;;
    ext)
      [ -f "$p" ] || { echo "not a file"; return; }
      in_list "$(printf '%s' "${name##*.}" | tr 'A-Z' 'a-z')" "$r_ext" || { echo "not an installer"; return; } ;;
    big)
      [ -f "$p" ] || { echo "not a file"; return; }
      any_glob "$p" "$r_within" && any_glob "$name" "$r_names" || { echo "outside the rule"; return; }
      [ "$(stat -f %z "$p" 2>/dev/null || echo 0)" -ge $(( ${r_min_gb:-2} * 1000000000 )) ] || { echo "smaller than the rule"; return; } ;;
    series)
      [ -d "$p" ] && any_glob "$p/x" "$r_within" || { echo "outside the rule"; return; } ;;
    *) echo "unknown finder"; return ;;
  esac
}

# Ling's finds: only what she proposed, only the user's side of the disk, and
# only ever to the Trash (the method is fixed in `clear`, not here).
refusal_found() {
  local p="$1"
  under_home "$p" || { echo "outside the home folder"; return; }
  awk -F'|' -v p="$p" '{ q = $6; for (i = 7; i <= NF; i++) q = q "|" $i } q == p { f = 1 } END { exit !f }' "$FOUND" 2>/dev/null \
    || { echo "not proposed"; return; }
  proposable "$p"
}

# The shape every Ling proposal must have, at propose time and again at clear.
proposable() {
  local p="$1" top
  case "$p" in *.app|*.app/*) echo "part of an app"; return ;; esac
  under_home "$p" || { echo "outside the home folder"; return; }
  forbidden "$p" && { echo "protected place"; return; }
  [ -L "$p" ] && { echo "a symlink"; return; }
  top="${p#"$HOME"/}"
  case "$top" in
    Desktop|Documents|Downloads|Pictures|Movies|Music|Public|Library|Applications|workspace|Sites)
      echo "a whole top-level folder"; return ;;
  esac
  git_tracked "$p" && { echo "git tracks files here"; return; }
}

# ── scan ───────────────────────────────────────────────────────────────────

emit() { printf '%s\n' "$1" >> "$ROWS"; }

cand() {  # rule, extra, path
  printf '%s%s%s%s%s\n' "$1" "$US" "$(sanitize "$2")" "$US" "$3" >> "$WORK/cand"
}

# path · children · cmd rules: the catalog names where to look.
find_fixed() {
  local id="$1" g m c p extra globs
  case "$r_kind" in
    path|children)
      split_list "$r_paths"; globs=(${L[@]+"${L[@]}"})
      for g in ${globs[@]+"${globs[@]}"}; do
        g=$(expand "$g")
        # Unquoted on purpose: this is where the catalog's globs expand. IFS
        # empty keeps "Application Support" one word.
        local IFS=
        for m in $g; do
          [ -e "$m" ] && [ ! -L "$m" ] || continue
          if [ "$r_kind" = "path" ]; then cand "$id" "" "$m"; continue; fi
          [ -d "$m" ] || continue
          for c in "$m"/* "$m"/.[!.]*; do
            [ -e "$c" ] && [ ! -L "$c" ] && cand "$id" "" "$c"
          done
        done
        unset IFS
      done ;;
    cmd)
      limited 60 bash -c "$r_sh" 2>/dev/null | while IFS=$'\t' read -r p extra; do
        [ -n "$p" ] && any_shape "$p" "$r_paths" && cand "$id" "$extra" "$p"
      done ;;
  esac
}

# One find over ~ feeds every marker, ext, big and series rule.
walk_home() {
  local names=() paths=() markers=() exts=() min_gb=0 n id ids
  split_list "$(walk_list prune_names)"
  for n in ${L[@]+"${L[@]}"}; do names+=(-o -name "$n"); done
  split_list "$(walk_list prune_paths)"
  for n in ${L[@]+"${L[@]}"}; do paths+=(-o -path "$(expand "$n")"); done
  ids=$(rule_ids)
  while IFS= read -r id; do
    load_rule "$id"
    case "$r_kind" in
      marker) split_list "$r_markers"; for n in ${L[@]+"${L[@]}"}; do markers+=(-o -name "$n"); done ;;
      ext) split_list "$r_ext"; for n in ${L[@]+"${L[@]}"}; do exts+=(-o -iname "*.$n"); done ;;
      big) { [ "$min_gb" = 0 ] || [ "${r_min_gb:-2}" -lt "$min_gb" ]; } && min_gb=${r_min_gb:-2} ;;
    esac
  done <<<"$ids"
  [ "$min_gb" = 0 ] && min_gb=2
  # find's G is 2^30; ask one lower and let classify_big hold the exact line.
  min_gb=$(( min_gb > 1 ? min_gb - 1 : 1 ))
  # `-path "$HOME/.*"` keeps dated-name hits to hidden folders: a Desktop full
  # of "Screenshot 2026-…" is the person's, not a runaway log.
  find "$HOME" "$HOME/Library/Logs" \
    \( -false ${paths[@]+"${paths[@]}"} \) -prune -o \
    \( -false ${names[@]+"${names[@]}"} \) -prune -o \
    \( -false ${markers[@]+"${markers[@]}"} \) -print -o \
    \( -type f \( -false ${exts[@]+"${exts[@]}"} \) \) -print -o \
    \( -type f -size +"${min_gb}"G \) -print -o \
    \( -type f -name '*20[0-9][0-9]-[01][0-9]-[0-3][0-9]*' \( -path "$HOME/.*" -o -path "$HOME/Library/Logs/*" \) \) -print \
    2>/dev/null
}

# Split the walk's hits once, in awk: a marker hit goes to one pile, every
# other file to another. The per-rule passes then loop over few lines, with
# no fork per hit (11,000 hits × a subshell each was minutes, 2026-09-23).
classify_walk() {
  local hits="$1" id ids all=""
  ids=$(rule_ids)
  while IFS= read -r id; do
    load_rule "$id"; [ "$r_kind" = marker ] && all="$all$RS$r_markers"
  done <<<"$ids"
  awk -v all="$all" -v rs="$RS" -v mk="$WORK/hits.marker" -v other="$WORK/hits.other" '
    BEGIN { n = split(all, a, rs); for (i = 1; i <= n; i++) if (a[i] != "") m[a[i]] = 1 }
    { k = $0; sub(/.*\//, "", k); if (k in m) print > mk; else print > other }' "$hits"
  touch "$WORK/hits.marker" "$WORK/hits.other"
  while IFS= read -r id; do
    load_rule "$id"
    case "$r_kind" in
      marker) classify_markers "$id" "$WORK/hits.marker" ;;
      ext) classify_ext "$id" "$WORK/hits.other" ;;
      series) classify_series "$id" "$WORK/hits.other" ;;
    esac
  done <<<"$ids"
  # big after series, so a huge file already counted in a series is not a row twice
  while IFS= read -r id; do
    load_rule "$id"; [ "$r_kind" = big ] && classify_big "$id" "$WORK/hits.other"
  done <<<"$ids"
}

classify_markers() {
  local id="$1" hits="$2" f dir out m outs
  split_list "$r_outputs"; outs=(${L[@]+"${L[@]}"})
  while IFS= read -r f; do
    in_list "${f##*/}" "$r_markers" || continue
    dir="${f%/*}"
    for out in ${outs[@]+"${outs[@]}"}; do
      if [ "$out" = "." ]; then
        [ -d "$dir" ] && [ ! -L "$dir" ] && cand "$id" "project=${dir##*/}" "$dir"; continue
      fi
      local IFS=
      for m in "$dir"/$out; do
        [ -d "$m" ] && [ ! -L "$m" ] || continue
        if [ "$r_require_ignored" = "1" ]; then
          git -C "$dir" check-ignore -q -- "${m##*/}" 2>/dev/null || continue
        fi
        cand "$id" "project=${dir##*/}" "$m"
      done
      unset IFS
    done
  done < "$hits"
}

classify_ext() {
  local id="$1" hits="$2" f re
  split_list "$r_ext"
  re="\\.($(IFS='|'; printf '%s' "${L[*]:-none}"))\$"
  grep -iE "$re" "$hits" | while IFS= read -r f; do
    [ -f "$f" ] && [ ! -L "$f" ] && cand "$id" "" "$f"
  done
}

# A folder holding many dated files that nothing prunes. One row per folder:
# its size is what `clear` would move (files older than keep_days), the extra
# carries the whole series for the why line.
classify_series() {
  local id="$1" hits="$2" keep="${r_keep_days:-14}" min="${r_min_count:-30}" cutoff
  cutoff=$(( $(now) - keep * 86400 ))
  grep -E '/[^/]*20[0-9][0-9]-[01][0-9]-[0-3][0-9][^/]*$' "$hits" | while IFS= read -r f; do
    any_glob "$f" "$r_within" && [ -f "$f" ] && printf '%s\0' "$f"
  done | xargs -0 stat -f '%z|%m|%N' 2>/dev/null | awk -F'|' -v OFS='|' -v min="$min" -v cutoff="$cutoff" -v keep="$keep" '
    { p = $3; for (i = 4; i <= NF; i++) p = p "|" $i
      d = p; sub(/\/[^\/]*$/, "", d); name = substr(p, length(d) + 2)
      n[d]++; tot[d] += $1
      if ($2 < cutoff) { old[d]++; oldb[d] += $1 }
      if (match(name, /20[0-9][0-9]-[01][0-9]-[0-3][0-9]/)) { dt = substr(name, RSTART, 10); if (!(d in first) || dt < first[d]) first[d] = dt }
      if ($1 > big[d]) { big[d] = $1; bign[d] = name } }
    END { for (d in n) if (n[d] >= min && old[d] > 0)
      printf "n=%d;first=%s;total_bytes=%.0f;old=%d;keep=%d;biggest_bytes=%.0f;biggest=%s;bytes=%.0f\t%s\n",
        n[d], first[d], tot[d], old[d], keep, big[d], bign[d], oldb[d], d }' \
  | while IFS=$'\t' read -r extra d; do cand "$id" "$extra" "$d"; done
}

classify_big() {
  local id="$1" hits="$2" min=$(( ${r_min_gb:-2} * 1000000000 )) size f
  tr '\n' '\0' < "$hits" | xargs -0 stat -f '%HT|%z|%N' 2>/dev/null \
    | awk -F'|' -v min="$min" '$1 == "Regular File" && $2 >= min { p = $3; for (i = 4; i <= NF; i++) p = p "|" $i; print p }' \
    | while IFS= read -r f; do
      any_glob "$f" "$r_within" && any_glob "${f##*/}" "$r_names" || continue
      in_series "$f" && continue
      cand "$id" "" "$f"
    done
}

# True when a series row already covers the folder of file $1 — the huge file
# is part of that row, not a row of its own.
in_series() {
  awk -F"$US" -v d="$(dirname "$1")" -v rules="$RULES" -v us="$US" '
    BEGIN { while ((getline l < rules) > 0) { split(l, f, us); if (f[1] == "R" && f[5] == "series") s[f[2]] = 1 } }
    ($1 in s) && $3 == d { hit = 1 } END { exit !hit }' "$WORK/cand"
}

# Catalog order decides who claims a folder: the first rule to reach a path
# keeps it, and a later row that holds or sits inside a kept one is dropped.
# Series rows are partial (older files only) and neither claim nor yield.
dedupe() {
  local ids=() id
  while IFS= read -r id; do ids+=("$id"); done < <(rule_ids)
  awk -F"$US" -v order="$(printf '%s\n' "${ids[@]}" | tr '\n' ' ')" \
      -v partial="$(awk -F"$US" '$1 == "R" && $24 == "1" { printf "%s ", $2 }' "$RULES")" '
    BEGIN { n = split(order, o, " "); for (i = 1; i <= n; i++) rank[o[i]] = i
            m = split(partial, pp, " "); for (i = 1; i <= m; i++) part[pp[i]] = 1 }
    { r[NR] = rank[$1] * 1000000 + NR; line[NR] = $0; rule[NR] = $1; path[NR] = $3 }
    END {
      # sort by (rank, arrival): insertion sort is fine at a few thousand rows
      for (i = 1; i <= NR; i++) idx[i] = i
      for (i = 2; i <= NR; i++) { v = idx[i]; j = i - 1
        while (j > 0 && r[idx[j]] > r[v]) { idx[j + 1] = idx[j]; j-- } idx[j + 1] = v }
      k = 0
      for (i = 1; i <= NR; i++) { c = idx[i]; p = path[c]
        if (p in seen) continue
        if (!(rule[c] in part)) {
          clash = 0
          for (j = 1; j <= k; j++) { q = kept[j]
            if (index(p "/", q "/") == 1 || index(q "/", p "/") == 1) { clash = 1; break } }
          if (clash) continue
          kept[++k] = p
        }
        seen[p] = 1; print line[c] } }' "$WORK/cand"
}

# Newest of a few cheap probes — never a walk over a million files.
last_used() {
  local p="$1" project="$2" newest=0 t pr
  split_list "$r_probes"
  for pr in "" ${L[@]+"${L[@]}"}; do
    t=$(stat -f %m "$p${pr:+/$pr}" 2>/dev/null) || continue
    [ "${t:-0}" -gt "$newest" ] && newest=$t
  done
  if [ "$r_git" = "1" ] && [ -n "$project" ]; then
    t=$(git -C "$project" log -1 --format=%ct 2>/dev/null)
    [ -n "$t" ] && [ "$t" -gt "$newest" ] && newest=$t
  fi
  printf '%s' "$newest"
}

measure_one() {
  local id="$1" extra="$2" p="$3" bytes="" state=ok out rc err last running=0 project=""
  load_rule "$id"
  case "$extra" in *bytes=*) bytes="${extra##*bytes=}"; bytes="${bytes%%;*}" ;; esac
  if [ -z "$bytes" ]; then
    err=$(mktemp "$WORK/err.XXXXXX")
    out=$(limited "$ITEM_BUDGET" du -sk "$p" 2>"$err"); rc=$?
    if [ -n "$out" ]; then bytes=$(( ${out%%[[:space:]]*} * 1024 ))
    elif [ "$rc" -gt 128 ]; then state=timeout
    elif grep -qi 'not permitted\|permission denied' "$err" 2>/dev/null; then state=denied
    else state=denied; fi
    rm -f "$err"
  fi
  [ "$r_kind" = marker ] && project=$(project_of "$p" "$r_outputs")
  last=$(last_used "$p" "$project")
  if [ -n "$project" ] && grep -qF "$project/" "$WORK/ps"; then running=1; fi
  emit "R|$id|${bytes:-0}|$state|$last|$running|$extra|$p"
}

# Run "$@" for every line of stdin in $LANES parallel lanes, until $DEADLINE.
lanes() {
  local fn="$1" skip="$2" line
  while IFS= read -r line; do
    if [ "$(now)" -ge "$DEADLINE" ]; then "$skip" "$line"; continue; fi
    "$fn" "$line" &
    while [ "$(jobs -rp | wc -l)" -ge "$LANES" ]; do sleep 0.2; done   # bash 3.2: no `wait -n`
  done
  wait
}

measure_cand() { local id extra p; IFS="$US" read -r id extra p <<<"$1"; measure_one "$id" "$extra" "$p"; }
skip_cand() { local id extra p; IFS="$US" read -r id extra p <<<"$1"; emit "R|$id|0|skipped|0|0|$extra|$p"; }


scan() {
  local out="${1:?out dir required}" started id
  mkdir -p "$out"
  WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
  ROWS="$out/rows.txt.part"; : > "$ROWS"
  started=$(now)
  emit "S|$started"
  load_catalog
  : > "$WORK/cand"
  ps -axo command= > "$WORK/ps" 2>/dev/null
  local IFS=$'\n'
  for id in $(rule_ids); do load_rule "$id"; find_fixed "$id"; done
  unset IFS
  walk_home > "$WORK/hits"
  classify_walk "$WORK/hits"
  dedupe > "$WORK/kept"
  emit "P|$(wc -l < "$WORK/kept" | tr -d ' ')"
  # Publish the live file now: the page reads rows as they are measured.
  mv "$ROWS" "$out/rows.txt"; ROWS="$out/rows.txt"
  DEADLINE=$(( started + SCAN_BUDGET ))
  lanes measure_cand skip_cand < "$WORK/kept"
  # The deep walk last: Ling's map for what the rules did not explain, and
  # the home breakdown the page shows.
  emit "T|$(now)"
  tree_build "$ROWS" "$out/disk-tree.json" >> "$ROWS"
  cat "$WORK/tree.home" >> "$ROWS" 2>/dev/null
  emit "D|$(now)|$(( $(now) - started ))"
}

start() {
  local out="${1:?out dir required}" pid
  mkdir -p "$out"
  pid=$(cat "$out/pid" 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo '{"running":true}'; return; fi
  nohup bash "$HERE/clearables.sh" scan "$out" >/dev/null 2>"$out/scan.err" &
  echo $! > "$out/pid"
  echo '{"started":true}'
}

# ── clear ──────────────────────────────────────────────────────────────────

# Placeholders a tool command may carry, each filled from the path itself and
# shell-quoted: {project} the folder with the marker, {name} the path's last
# part, {parent} the one above it.
fill() {
  local c="$1" p="$2" project="$3"
  c=${c//\{project\}/$(q "$project")}
  c=${c//\{name\}/$(q "$(basename "$p")")}
  c=${c//\{parent\}/$(q "$(basename "$(dirname "$p")")")}
  printf '%s' "$c"
}

q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

to_trash() {
  local p="$1" base dest n=1
  if [ -z "${SHIFU_NO_FINDER:-}" ] && osascript -e "tell application \"Finder\" to delete POSIX file \"${p//\"/\\\"}\"" >/dev/null 2>&1; then
    return 0
  fi
  mkdir -p "$HOME/.Trash"
  base=$(basename "$p"); dest="$HOME/.Trash/$base"
  while [ -e "$dest" ]; do dest="$HOME/.Trash/$base $n"; n=$((n + 1)); done
  mv "$p" "$dest" 2>/dev/null
}

# A series goes to one Trash folder, oldest first — only files past keep_days.
trash_series() {
  local d="$1" keep="${r_keep_days:-14}" dest n=1
  dest="$HOME/.Trash/$(basename "$d") logs before $(date -v-"${keep}"d +%Y-%m-%d)"
  while [ -e "$dest" ]; do dest="$dest $n"; n=$((n + 1)); done
  mkdir -p "$dest" || return 1
  find "$d" -maxdepth 1 -type f -name '*20[0-9][0-9]-[01][0-9]-[0-3][0-9]*' -mtime +"${keep}d" -print0 \
    | xargs -0 -I{} mv {} "$dest/" 2>/dev/null
  return 0
}

run_tool() {
  local p="$1" project="$2" c dir bin
  bin=${r_cmd%% *}
  if ! command -v "$bin" >/dev/null 2>&1; then
    [ -n "$r_fallback" ] || return 2
    method_run "$r_fallback" "$p" "$project"; return
  fi
  c=$(fill "$r_cmd" "$p" "$project")
  dir=$(expand "$r_cwd"); dir=${dir//\{project\}/$project}
  [ -d "$dir" ] || dir="$HOME"
  (cd "$dir" && limited "$TOOL_BUDGET" bash -c "$c") >/dev/null 2>&1
}

method_run() {
  local m="$1" p="$2" project="$3"
  case "$m" in
    tool) run_tool "$p" "$project" ;;
    purge) rm -rf "$p" 2>/dev/null ;;
    trash) if [ "$r_kind" = series ]; then trash_series "$p"; else to_trash "$p"; fi ;;
    *) return 1 ;;
  esac
}

clear_list() {
  local list="${1:?list file required}" id p why removed=0 refused=0 failed=0 reasons="" project
  WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
  load_catalog
  : > "$list.done"
  while IFS=$'\t' read -r id p; do
    [ -n "$p" ] || continue
    why=$(refusal "$id" "$p")
    if [ -n "$why" ]; then
      refused=$((refused + 1)); reasons="$reasons$(json_str "$(basename "$p"): $why"),"; continue
    fi
    # refusal ran in a subshell; load the rule here for the method.
    if [ "$id" = "found" ]; then
      r_kind=found; to_trash "$p" && { unpropose "$p" >/dev/null; ok=1; } || ok=0
    else
      load_rule "$id"
      project=""; [ "$r_kind" = marker ] && project=$(project_of "$p" "$r_outputs")
      method_run "$r_method" "$p" "$project" && ok=1 || ok=0
    fi
    if [ "$ok" = 1 ]; then removed=$((removed + 1)); printf '%s\n' "$p" >> "$list.done"
    else failed=$((failed + 1)); fi
  done < "$list"
  printf '{"removed":%d,"refused":%d,"failed":%d,"reasons":[%s]}\n' \
    "$removed" "$refused" "$failed" "${reasons%,}" | tee "$list.result"
}

json_str() { printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n\r\t')"; }

# ── the disk tree (one deep walk per scan; Ling reads it in pieces) ────────
#
# After the rows are measured, one walk over ~ records every folder's size,
# file count and newest file, then keeps only folders of TREE_MIN or more —
# the smaller ones fold into their parent's "other" — so the saved tree keeps
# the disk's shape, not a line per file. Rows the scan already measured are
# not walked again: each is one leaf with its rule, which is also what makes
# "explained" and "unexplained" figures possible. Ling reads the tree with
# DiskLook and DiskHotspots; neither walks anything.

TREE_MIN=${SHIFU_TREE_MIN:-100000000}         # bytes a folder needs to keep its own node
TREE_BUDGET=${SHIFU_TREE_BUDGET:-420}         # seconds one top-level folder may take
TREE_PRUNE_MIN=${SHIFU_TREE_PRUNE_MIN:-50000000}   # rows this big are leaves, not walked

human() { awk -v b="$1" 'BEGIN { if (b >= 1e9) printf "%.1f GB", b / 1e9; else if (b >= 1e6) printf "%d MB", b / 1e6; else printf "%d KB", b / 1e3 }'; }

short() { case "$1" in "$HOME") printf '~' ;; "$HOME"/*) printf '~/%s' "${1#"$HOME"/}" ;; *) printf '%s' "$1" ;; esac; }

# One top-level folder: `mtime|bytes|path` for every file outside the leaves.
tree_lane() {
  local top="$1" out rc
  out="$WORK/tree.$(printf '%s' "$top" | cksum | cut -d' ' -f1)"
  limited "$TREE_BUDGET" find "$top" \
    \( -false ${TREE_PRUNE[@]+"${TREE_PRUNE[@]}"} -o -path "$HOME/Library/CloudStorage" \
       -o -path "$HOME/Library/Mobile Documents" -o -name '*.photoslibrary' \) -prune -o \
    -type f -exec stat -f '%m|%b|%N' {} + > "$out" 2>/dev/null
  rc=$?
  if [ "$rc" -gt 128 ]; then rm -f "$out"; printf '%s\tstill going after %ss\n' "$top" "$TREE_BUDGET" >> "$WORK/tree.unmeasured"; fi
}
tree_skip() { printf '%s\tthe scan ran out of time\n' "$1" >> "$WORK/tree.unmeasured"; }

# tree <rows.txt> <out.json> — prints H lines for the home folders.
tree_build() {
  local rows="$1" json="$2" started p bytes rule last
  started=$(now)
  : > "$WORK/tree.unmeasured"; : > "$WORK/tree.leaves"
  # Leaves: measured rows of rules that claim a whole folder. A partial row
  # (a log series) is walked like anything else — the folder holds more.
  local partial; partial=$(awk -F"$US" '$1 == "R" && $24 == "1" { printf " %s ", $2 }' "$RULES")
  TREE_PRUNE=()
  awk -F'|' '$1 == "R" && $4 == "ok" { p = $8; for (i = 9; i <= NF; i++) p = p "|" $i; print $2 "\t" $3 "\t" $5 "\t" p }' "$rows" \
    | while IFS=$'\t' read -r rule bytes last p; do
      case "$partial" in *" $rule "*) printf 'X\t%s\t%s\t%s\t%s\n' "$rule" "$bytes" "$last" "$p" ;;
        *) printf 'L\t%s\t%s\t%s\t%s\n' "$rule" "$bytes" "$last" "$p" ;; esac
    done > "$WORK/tree.leaves"
  while IFS=$'\t' read -r kind rule bytes last p; do
    [ "$kind" = L ] && [ "$bytes" -ge "$TREE_PRUNE_MIN" ] && TREE_PRUNE+=(-o -path "$p")
  done < "$WORK/tree.leaves"
  DEADLINE=$(( started + TREE_BUDGET + 60 ))
  { for p in "$HOME"/* "$HOME"/.[!.]*; do [ -d "$p" ] && [ ! -L "$p" ] && printf '%s\n' "$p"; done; } | lanes tree_lane tree_skip
  # Files straight in ~ (not in any folder) are one short find of their own.
  find "$HOME" -maxdepth 1 -type f -exec stat -f '%m|%b|%N' {} + > "$WORK/tree.top" 2>/dev/null
  cat "$WORK"/tree.[0-9]* "$WORK/tree.top" 2>/dev/null \
    | tree_awk "$started" > "$json.part" && mv "$json.part" "$json"
  awk -F'\t' '{ print "H|0|skipped|" $1 }' "$WORK/tree.unmeasured"
}

# The aggregation. Files are summed into their own folder first; folders then
# roll up into their ancestors once each, so a million files cost a million
# splits, not a million ancestor walks.
tree_awk() {
  awk -v home="$HOME" -v min="$TREE_MIN" -v pmin="$TREE_PRUNE_MIN" -v started="$1" -v now="$(now)" \
      -v bigmin="${SHIFU_BIG_FILE:-2000000000}" -v stalemin="${SHIFU_STALE_MIN:-1000000000}" \
      -v manymin="${SHIFU_MANY_FILES:-100000}" -v seriesmin="${SHIFU_SERIES_MIN:-30}" \
      -v leaves="$WORK/tree.leaves" -v unmeasured="$WORK/tree.unmeasured" '
    function jesc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); gsub(/\t/, " ", s); gsub(/[\001-\037]/, "", s); return s }
    function parent(d) { sub(/\/[^\/]*$/, "", d); return d }
    function add(d, b, n, m, e) { db[d] += b; dn[d] += n; if (m > dm[d]) dm[d] = m; de[d] += e }
    BEGIN {
      FS = "|"
      while ((getline l < leaves) > 0) {
        split(l, f, "\t"); p = f[5]
        # A pruned row is a leaf: its measured size stands in for the walk.
        # Any other row is walked as usual and only counts as explained.
        if (f[1] == "L" && f[3] + 0 >= pmin) { leafrule[p] = f[2]; add(p, f[3] + 0, 0, f[4] + 0, f[3] + 0) }
        else { xrule[p] = f[2]; de[p] += f[3] + 0 }
      }
      while ((getline l < unmeasured) > 0) { split(l, f, "\t"); um[f[1]] = f[2] }
    }
    {
      p = $3; for (i = 4; i <= NF; i++) p = p "|" $i
      b = $2 * 512; d = parent(p); name = substr(p, length(d) + 2)
      add(d, b, 1, $1 + 0, 0)
      if (b >= bigmin) { bigp[p] = b; bigm[p] = $1 }
      if (match(name, /20[0-9][0-9]-[01][0-9]-[0-3][0-9]/)) {
        stem = substr(name, 1, RSTART - 1) "*" substr(name, RSTART + 10); k = d SUBSEP stem
        sc[k]++; sb[k] += b; dt = substr(name, RSTART, 10); if (!(k in sf) || dt < sf[k]) sf[k] = dt
      }
    }
    END {
      # roll every folder up to ~, once per folder
      for (d in db) {
        b = db[d]; n = dn[d]; m = dm[d]; e = de[d]; x = d
        while (1) {
          tb[x] += b; tn[x] += n; if (m > tm[x]) tm[x] = m; te[x] += e
          if (x == home || length(x) <= length(home)) break
          x = parent(x)
        }
      }
      # log-series rows add to "explained" without being leaves
      for (d in de) if (!(d in db)) { x = d; e = de[d]
        while (1) { te[x] += e; if (x == home || length(x) <= length(home)) break; x = parent(x) } }
      for (x in tb) if (tb[x] >= min || x == home) keep[x] = 1
      for (x in keep) if (x != home && (parent(x) in keep)) kids[parent(x)] += tb[x]
      printf "{\"scanned_at\":%d,\"seconds\":%d,\"home\":\"%s\",\"min_bytes\":%d,", now, now - started, jesc(home), min
      printf "\"unmeasured\":["; sep = ""
      for (p in um) { printf "%s{\"path\":\"%s\",\"why\":\"%s\"}", sep, jesc(p), jesc(um[p]); sep = "," }
      printf "],\"nodes\":["; sep = ""
      for (x in keep) {
        printf "%s{\"path\":\"%s\",\"bytes\":%.0f,\"files\":%d,\"newest\":%d,\"other\":%.0f,\"explained\":%.0f,\"rule\":\"%s\"}", \
          sep, jesc(x), tb[x], tn[x], tm[x], tb[x] - kids[x], te[x], (x in leafrule) ? leafrule[x] : ""
        sep = ","
      }
      printf "],\"hotspots\":["; sep = ""
      for (p in bigp) { printf "%s{\"kind\":\"big_file\",\"path\":\"%s\",\"bytes\":%.0f,\"newest\":%d,\"rule\":\"%s\"}", \
        sep, jesc(p), bigp[p], bigm[p], claim(p); sep = "," }
      for (k in sc) if (sc[k] >= seriesmin) { split(k, kk, SUBSEP)
        printf "%s{\"kind\":\"series\",\"path\":\"%s\",\"stem\":\"%s\",\"count\":%d,\"bytes\":%.0f,\"first\":\"%s\",\"rule\":\"%s\"}", \
          sep, jesc(kk[1]), jesc(kk[2]), sc[k], sb[k], sf[k], claim(kk[1]); sep = "," }
      year = now - 365 * 86400
      for (x in keep) if (x != home && tb[x] >= stalemin && tm[x] > 0 && tm[x] < year && !(tm[parent(x)] > 0 && tm[parent(x)] < year && tb[parent(x)] >= stalemin)) {
        printf "%s{\"kind\":\"stale\",\"path\":\"%s\",\"bytes\":%.0f,\"files\":%d,\"newest\":%d,\"rule\":\"%s\"}", \
          sep, jesc(x), tb[x], tn[x], tm[x], claim(x); sep = "," }
      for (x in keep) if (tn[x] >= manymin) many[x] = 1
      for (x in many) if (x != home) { deeper = 0
        for (y in many) if (y != x && index(y, x "/") == 1) { deeper = 1; break }
        if (!deeper) { printf "%s{\"kind\":\"many_files\",\"path\":\"%s\",\"bytes\":%.0f,\"files\":%d,\"newest\":%d,\"rule\":\"%s\"}", \
          sep, jesc(x), tb[x], tn[x], tm[x], claim(x); sep = "," } }
      printf "]}\n"
      for (x in tb) if (parent(x) == home && x != home) printf "H|%.0f|ok|%s\n", tb[x], x > "/dev/stderr"
    }
    # The rule a path already belongs to: a leaf or partial row at or above it.
    function claim(p,   x) { x = p
      while (1) { if (x in leafrule) return leafrule[x]; if (x in xrule) return xrule[x]
        if (x == home || length(x) <= length(home)) return ""; x = parent(x) } }
  ' 2> "$WORK/tree.home"
}

# The saved tree, and how old it is against the last scan. Prints nothing and
# fails when there is none.
tree_file() { printf '%s' "$DATA/clearables/disk-tree.json"; }

# DiskLook / DiskHotspots read the JSON through JXA — no walking, no jq.
tree_read() {  # mode (look|hotspots), path
  osascript -l JavaScript -e '
    function run(argv) {
      const [file, mode, target, home, rowsFile] = argv;
      const read = (p) => { const s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null); return s.isNil() ? "" : s.js; };
      const text = read(file);
      if (!text) return "No disk tree yet. Ask the user to hit ↻ Scan on the Files tab, then look again.";
      const t = JSON.parse(text);
      const gb = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? Math.round(b / 1e6) + " MB" : Math.max(0, Math.round(b / 1e3)) + " KB");
      const short = (p) => (p === home ? "~" : p.startsWith(home + "/") ? "~/" + p.slice(home.length + 1) : p);
      const day = (s) => (s ? new Date(s * 1000).toISOString().slice(0, 10) : "?");
      const ageMin = Math.round((Date.now() / 1000 - t.scanned_at) / 60);
      const age = ageMin < 90 ? ageMin + " min old" : ageMin < 2880 ? Math.round(ageMin / 60) + " h old" : Math.round(ageMin / 1440) + " days old";
      const started = +((read(rowsFile).match(/^S\|(\d+)/m) || [])[1] || 0);
      const stale = started > t.scanned_at ? " — a newer scan started since; this tree may be behind" : "";
      const head = "disk tree from " + day(t.scanned_at) + " (" + age + ")" + stale;
      const nodes = new Map(t.nodes.map((n) => [n.path, n]));
      const note = (n) => (n.rule ? "listed: " + n.rule : n.explained > 0 ? gb(n.explained) + " already listed inside" : "-");
      const um = t.unmeasured.map((u) => short(u.path) + " not measured (" + u.why + ")");
      if (mode === "hotspots") {
        const h = nodes.get(home) || { bytes: 0, explained: 0 };
        const out = [head, "home " + gb(h.bytes) + " · listed as clearable " + gb(h.explained) + " · unexplained " + gb(h.bytes - h.explained)];
        const LABEL = { big_file: "big file", series: "dated series", stale: "untouched a year+", many_files: "100k+ files" };
        const rows = t.hotspots.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 30);
        out.push("size | kind | newest | path | detail | claimed by");
        for (const s of rows) {
          const detail = s.kind === "series" ? s.count + " × " + s.stem + " since " + s.first : s.files ? s.files.toLocaleString() + " files" : "-";
          out.push(gb(s.bytes) + " | " + LABEL[s.kind] + " | " + day(s.newest) + " | " + short(s.path) + " | " + detail + " | " + (s.rule || "-"));
        }
        if (t.hotspots.length > rows.length) out.push("… " + (t.hotspots.length - rows.length) + " smaller hotspots");
        return out.concat(um).join("\n");
      }
      const self = nodes.get(target);
      if (!self) return short(target) + " is under " + gb(t.min_bytes) + " in the saved tree, or not in it — nothing big below. " + head;
      const kids = t.nodes.filter((n) => n.path.slice(0, n.path.lastIndexOf("/")) === target).sort((a, b) => b.bytes - a.bytes);
      const shown = kids.slice(0, 25);
      const out = [short(target) + " — " + gb(self.bytes) + " · " + self.files.toLocaleString() + " files · newest " + day(self.newest) + " · " + head,
        "size | files | newest | name | note"];
      for (const n of shown) out.push(gb(n.bytes) + " | " + n.files.toLocaleString() + " | " + day(n.newest) + " | " + n.path.slice(target.length + 1) + " | " + note(n));
      if (kids.length > shown.length) {
        const rest = kids.slice(shown.length);
        out.push("… " + rest.length + " more, " + gb(rest.reduce((s, n) => s + n.bytes, 0)) + " together");
      }
      out.push(gb(self.other) + " in files and folders under " + gb(t.min_bytes) + " each");
      return out.concat(um.filter((u) => u.startsWith(short(target)))).join("\n");
    }' "$(tree_file)" "$1" "${2:-}" "$HOME" "$LAST_ROWS"
}

look() {
  local p; p=$(expand "${1:-~}")
  case "$p" in "{{"*"}}"|"") p="$HOME" ;; esac
  p="${p%/}"; [ -n "$p" ] || p=/
  case "$p" in */../*|*/..|*/./*) echo "refused: path is not plain — $(short "$p")"; return 1 ;; esac
  if [ "$p" != "$HOME" ]; then
    case "$p" in "$HOME"/*) ;; *) echo "refused: outside the home folder — $(short "$p")"; return 1 ;; esac
    forbidden "$p" && { echo "refused: protected place (cloud drive or credentials) — $(short "$p")"; return 1; }
  fi
  tree_read look "$p"
}

hotspots() { tree_read hotspots; }

# ── propose (Ling's finds become rows) ─────────────────────────────────────

propose() {
  local p why bytes state=ok out rc newest t
  p=$(expand "${1:-}"); p="${p%/}"; why=$(sanitize "${2:-}" | cut -c1-240)
  case "$p" in "{{"*"}}"|"") echo "refused: no path"; return 1 ;; esac
  case "$why" in "{{"*"}}") why="" ;; esac
  [ -e "$p" ] || { echo "refused: not there — $(short "$p")"; return 1; }
  WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
  local no; no=$(proposable "$p")
  [ -z "$no" ] || { echo "refused: $no — $(short "$p")"; return 1; }
  out=$(limited 30 du -sk "$p" 2>/dev/null); rc=$?
  if [ -n "$out" ]; then bytes=$(( ${out%%[[:space:]]*} * 1024 )); else bytes=0; state=timeout; [ "$rc" -gt 128 ] || state=denied; fi
  newest=$(stat -f %m "$p" 2>/dev/null || echo 0)
  if [ -d "$p" ]; then
    for t in $(ls -A "$p" 2>/dev/null | head -n 500 | while IFS= read -r c; do stat -f %m "$p/$c" 2>/dev/null; done); do
      [ "$t" -gt "$newest" ] && newest=$t
    done
  fi
  mkdir -p "$DATA"
  unpropose "$p" >/dev/null
  printf '%s|%s|%s|%s|%s|%s\n' "$bytes" "$state" "$newest" "$(now)" "$why" "$p" >> "$FOUND"
  echo "added to Found by Shifu: $(short "$p") · $( [ "$state" = ok ] && human "$bytes" || echo 'not measured') · newest $(date -r "$newest" +%Y-%m-%d). The page marks it REVIEW; the user decides."
}

unpropose() {
  local p; p=$(expand "${1:-}"); p="${p%/}"
  [ -f "$FOUND" ] || return 0
  awk -F'|' -v p="$p" '{ q = $6; for (i = 7; i <= NF; i++) q = q "|" $i } q != p' "$FOUND" > "$FOUND.tmp" && mv "$FOUND.tmp" "$FOUND"
  echo "dropped: $(short "$p")"
}

case "$cmd" in
  start) start "$@" ;;
  scan) scan "$@" ;;
  clear) clear_list "$@" ;;
  look) look "$@" ;;
  hotspots) WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT; hotspots ;;
  tree) WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT; load_catalog; ROWS=/dev/null; tree_build "${1:-$LAST_ROWS}" "${2:-$(tree_file)}"; cat "$WORK/tree.home" ;;
  propose) propose "$@" ;;
  unpropose) unpropose "$@" ;;
  verify) WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT; load_catalog; r=$(refusal "$1" "$2"); echo "${r:-ok}" ;;
  *) echo "usage: clearables.sh {start|scan|clear|tree|look|hotspots|propose|unpropose|verify} [args]" >&2; exit 2 ;;
esac
