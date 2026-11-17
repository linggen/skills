#!/bin/sh
# phone-sync.sh — the paired phone's doors to CFO's ledger (SKILL.md
# PhoneSnapshot, PhoneStage, PhoneCommit, PhoneCommitStaged, PhoneReport,
# PhoneConfig). This is the shell text the phone used to send over
# `/api/bash`, moved here verb for verb: the same files read, the same
# checksum, the same compare-and-swap, the same atomic moves, the same
# staging folder and the same output. The phone's half is cfo_sync.dart.
#
# The two sides hold the SAME state in two shapes: a grow-only set of ledger
# rows keyed by txnId, and a last-write-wins register of every edit (lww.js
# here). A sync reads everything (snapshot), merges on the phone, and writes
# back what the Mac is missing (commit). The register write is guarded by a
# compare-and-swap on the checksum of the files it rewrites: if CFO on the Mac
# wrote between the phone's read and its write, the commit refuses, the phone
# merges again and retries, so an edit made on the Mac in that window is never
# overwritten.
#
# The data folder is where this skill is installed, never a path the caller
# sends; a blob is named, and its file follows from its name.
#
#   phone-sync.sh snapshot
#   phone-sync.sh stage FRESH NAME CHUNK [NAME CHUNK …]
#   phone-sync.sh commit TOKEN NAME BASE64 [NAME BASE64 …]
#   phone-sync.sh commit-staged TOKEN NAME [NAME …]
#   phone-sync.sh report | config
#
# POSIX sh: the phone's commands ran under `sh -c`, and so do these.

S="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
D="$S/data"

# The compare-and-swap token: the checksums of BOTH files a sync rewrites, as
# one string. `imports.json` is in it because an import finishing on the Mac
# between the phone's read and its write would otherwise be dropped from the
# merged log it pushes over it. Reads as `|` when neither file exists yet.
#
# `cksum <file>` rather than `cksum < file`: a redirect that can't open its
# file is a SHELL error, reported before `2>/dev/null` applies, so a
# first-ever sync would spit a scary line and a nonzero exit. awk drops the
# filename cksum echoes back, leaving the same path-free token.
token() {
  printf '%s|%s' "$(cksum "$D/edits.json" 2>/dev/null | awk '{print $1"_"$2}')" "$(cksum "$D/imports.json" 2>/dev/null | awk '{print $1"_"$2}')"
}

# Where a named blob lands under data/, or nothing for a name that is not one
# of the sync's files. Rows go to their year's file (`ledger-2026` →
# ledger/2026.jsonl, `ledger-undated` for a row without a date).
target() {
  case "$1" in
    edits | imports | report) printf '%s.json' "$1" ;;
    ledger-?*) printf 'ledger/%s.jsonl' "${1#ledger-}" ;;
  esac
}

# Every name must be a sync file, checked before anything is touched.
# A year with a `/` in it never had a file: the old append to
# ledger/<a/b>.jsonl failed on the missing folder and the rest went on, so it
# is let through here and skipped where it would have failed.
check_names() {
  for n in "$@"; do
    if [ -z "$(target "$n")" ]; then
      printf 'Not a file of the sync: %s\n' "$n" >&2
      exit 2
    fi
  done
}

torn() {
  case "$1" in
    ledger-*/*) printf 'skipped %s: not a ledger year\n' "$1" >&2; return 0 ;;
  esac
  return 1
}

# Write one blob from stdin. Temp file + rename for a whole-file write: a kill
# mid-write must not leave the register — every budget, rule and correction
# on the Mac — as a half-written blob. The ledger appends instead; a torn last
# line is dropped by every reader on both sides.
put() {
  t=$(target "$1")
  case "$1" in
    ledger-*) base64 --decode >> "$D/$t" ;;
    *) base64 --decode > "$D/$t.tmp" && mv -f "$D/$t.tmp" "$D/$t" ;;
  esac
}

verb=$1
[ $# -gt 0 ] && shift
case "$verb" in
  snapshot)
    # Everything the Mac holds, in one round-trip. The checksums are read in
    # the same shell as the files they describe, so the compare-and-swap on
    # the way back is comparing like with like. (The Watch's alerts check that
    # once ran in here is its own door now, PhoneAlerts: this one only reads.)
    printf '\n%s\n' '__CFO_CK__'
    token
    printf '\n%s\n' '__CFO_EDITS__'
    cat "$D/edits.json" 2>/dev/null
    printf '\n%s\n' '__CFO_CFG__'
    cat "$S/config.json" 2>/dev/null
    printf '\n%s\n' '__CFO_DISMISSED__'
    cat "$D/anomalies-dismissed.json" 2>/dev/null
    printf '\n%s\n' '__CFO_REPORT__'
    cat "$D/report.json" 2>/dev/null
    printf '\n%s\n' '__CFO_IMPORTS__'
    cat "$D/imports.json" 2>/dev/null
    printf '\n%s\n' '__CFO_LEDGER__'
    cat "$D"/ledger/*.jsonl 2>/dev/null
    printf '\n%s\n' '__CFO_COMPANY_REPORTS__'
    cat "$D/reports.json" 2>/dev/null
    printf '\n%s\n' '__CFO_WATCH__'
    cat "$D/watch.json" 2>/dev/null
    printf '\n%s\n' '__CFO_END__'
    ;;

  stage)
    # A commit too big for one call: its base64, chunk by chunk, under
    # `.sync-stage`, which nothing on either side reads. Base64 has no quote in
    # its alphabet, and concatenating the chunks back yields the same stream
    # `base64 --decode` would have read inline.
    fresh=$1
    shift
    if [ $(($# % 2)) -ne 0 ]; then echo 'stage: a name and a chunk each' >&2; exit 2; fi
    i=0
    for w in "$@"; do
      [ $((i % 2)) -eq 0 ] && check_names "$w"
      i=$((i + 1))
    done
    if [ "$fresh" = true ]; then
      mkdir -p "$D/.sync-stage"
      # An attempt that lost the compare-and-swap left its bytes here.
      rm -f "$D/.sync-stage"/*.b64
    fi
    while [ $# -gt 0 ]; do
      torn "$1" || printf '%s' "$2" >> "$D/.sync-stage/$1.b64"
      shift 2
    done
    ;;

  commit | commit-staged)
    # The one call that changes anything: check the token, then move every
    # inline or staged blob into place, in the order given — rows first: they
    # are keyed by a content hash, so a re-run appends nothing new even if the
    # register write loses the compare-and-swap and the phone retries.
    cksum=$1
    shift
    if [ "$verb" = commit ]; then
      if [ $# -eq 0 ] || [ $(($# % 2)) -ne 0 ]; then echo 'commit: a name and its bytes each' >&2; exit 2; fi
      i=0
      for w in "$@"; do
        [ $((i % 2)) -eq 0 ] && check_names "$w"
        i=$((i + 1))
      done
    else
      check_names "$@"
    fi
    mkdir -p "$D/ledger"
    CUR=$(token)
    if [ "$CUR" != "$cksum" ]; then
      printf '%s\n' '__CFO_CONFLICT__'
    else
      while [ $# -gt 0 ]; do
        if [ "$verb" = commit ]; then
          torn "$1" || printf '%s' "$2" | put "$1"
          shift 2
        else
          torn "$1" || put "$1" < "$D/.sync-stage/$1.b64"
          shift
        fi
      done
      printf '%s\n' '__CFO_OK__'
    fi
    # Both branches: a conflict retries and re-stages from scratch.
    rm -rf "$D/.sync-stage"
    ;;

  # The phone's Mac-only fallback, when it holds no data of its own: the
  # report the page last wrote, and the settings (for the currency).
  report) cat "$D/report.json" 2>/dev/null || true ;;
  config) cat "$S/config.json" 2>/dev/null || true ;;

  *)
    echo 'usage: phone-sync.sh snapshot | stage | commit | commit-staged | report | config' >&2
    exit 2
    ;;
esac
