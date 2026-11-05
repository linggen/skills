#!/usr/bin/env bash
# tools/playbot/run.sh — the play bot on the skills being released (or any ref), in a scratch install: a git ref is
# checked out into a throwaway worktree, an install dir is played read-only; the saves are scratch saves under the
# report's own scratch/ folder. Never ~/.linggen's data, never the player's Chrome. Not part of check.sh (it is minutes).
#
#   tools/playbot/run.sh [--ref <git ref> | --install <lingjing dir>] [--sizes 430x932,375x812,1280x820]
#                        [--fights 2] [--out <dir>] [--run-id <id>] [--update-baselines] [--debug]
#                        [--only haunt,story,bout,walk,baseline]
#   tools/playbot/run.sh --selftest      the seeded bugs (seeded-bugs.json) must each be caught, else the bot is broken
#
# Default: --ref origin/main. The report: <out>/ (default lingjing/report/<run-id>/) — findings.json, refusals.json,
# played.json, shots/, contact.png, checklist.md, review.json (pending until a reviewer fills it in for this run id).
# Exit: 0 no hard finding · 1 hard findings · 2 usage / setup · 3 selftest: a seeded bug went uncaught.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILLS_REPO="$(cd "$HERE/../../.." && pwd)"          # …/skills
REF="" INSTALL="" SIZES="430x932,375x812,1280x820" FIGHTS=2 OUT="" RUN_ID="" EXTRA=() SELFTEST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --install) INSTALL="$2"; shift 2 ;;
    --sizes) SIZES="$2"; shift 2 ;;
    --fights) FIGHTS="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --run-id) RUN_ID="$2"; shift 2 ;;
    --update-baselines|--debug|--headed) EXTRA+=("$1"); shift ;;
    --only) EXTRA+=("--only=$2"); shift 2 ;;
    --selftest) SELFTEST=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "playbot: unknown flag $1" >&2; exit 2 ;;
  esac
done
[ -d "$HERE/../node_modules/playwright" ] && [ -d "$HERE/../node_modules/pixelmatch" ] \
  || (cd "$HERE/.." && npm ci --silent --no-audit --no-fund) || { echo "playbot: npm ci in lingjing/tools failed" >&2; exit 2; }
SHARED="${LINGGEN_SHARED:-$(cd "$SKILLS_REPO/../linggen/shared" 2>/dev/null && pwd)}"
[ -f "$SHARED/channel.js" ] || { echo "playbot: no Linggen shared/ (set LINGGEN_SHARED)" >&2; exit 2; }
[ -n "$RUN_ID" ] || RUN_ID="$(date +%Y-%m-%d)-$(date +%H%M%S)"
[ -n "$OUT" ] || OUT="$SKILLS_REPO/lingjing/report/$RUN_ID"
mkdir -p "$OUT"

WT=()
cleanup() { for w in "${WT[@]+"${WT[@]}"}"; do git -C "$SKILLS_REPO" worktree remove --force "$w" >/dev/null 2>&1; done; }
trap cleanup EXIT

# A ref → a throwaway checkout of the skills at it, with an optional patch on top (the selftest's seeded bugs).
checkout() { # ref [patch] → CHECKOUT, the lingjing dir (not in a subshell: the worktree is removed on exit)
  local ref="$1" patch="${2:-}" dir
  dir="$(cd "$(mktemp -d "${TMPDIR:-/tmp}/playbot-skills.XXXXXX")" && pwd -P)"
  rmdir "$dir"
  git -C "$SKILLS_REPO" fetch -q origin 2>/dev/null
  git -C "$SKILLS_REPO" worktree add -q --detach "$dir" "$ref" >/dev/null 2>&1 || { echo "playbot: no ref $ref" >&2; return 1; }
  WT+=("$dir")
  if [ -n "$patch" ]; then git -C "$dir" apply "$HERE/$patch" || { echo "playbot: $patch does not apply on $ref" >&2; return 1; }; fi
  CHECKOUT="$dir/lingjing"
}

play() { # lingjing-dir out run-id
  node "$HERE/playbot.mjs" --skill="$1" --shared="$SHARED" --out="$2" --run-id="$3" --sizes="$SIZES" --fights="$FIGHTS" "${EXTRA[@]+"${EXTRA[@]}"}"
}

if [ "$SELFTEST" = 1 ]; then
  # Each seeded bug: its ref (or main + its patch), played, and the finding it must raise.
  n=0 missed=0
  while IFS=$'\t' read -r id ref patch expect bsizes bfights absent; do
    n=$((n + 1))
    [ "$patch" = - ] && patch=""
    [ "$bsizes" = - ] || SIZES="$bsizes"
    [ "$bfights" = - ] || FIGHTS="$bfights"
    checkout "$ref" "$patch" || { missed=$((missed + 1)); continue; }
    dir="$CHECKOUT"
    out="$OUT/selftest-$id"
    play "$dir" "$out" "$RUN_ID-selftest-$id" >"$out.log" 2>&1
    if node -e '
      const [file, expect] = process.argv.slice(1);
      const f = JSON.parse(require("fs").readFileSync(file, "utf8")).findings;
      const want = JSON.parse(expect);
      const hit = f.find((x) => Object.entries(want).every(([k, v]) => (typeof v === "string" && v.startsWith("/") ? new RegExp(v.slice(1, -1)).test(String(x[k] ?? "")) : x[k] === v)));
      process.exit(hit ? 0 : 1);' "$out/findings.json" "$expect"; then hit=1; else hit=0; fi
    if [ "$absent" = absent ]; then
      # A control: the same play with the bug not there must raise nothing of the kind (a check that always fires is no check).
      if [ "$hit" = 0 ]; then echo "CLEAN   $id ($ref${patch:+ + $patch}) — no $expect, as it should be"
      else echo "FALSE   $id ($ref${patch:+ + $patch}) — raised $expect with the bug absent; see $out"; missed=$((missed + 1)); fi
    elif [ "$hit" = 1 ]; then
      echo "CAUGHT  $id ($ref${patch:+ + $patch})"
    else
      echo "MISSED  $id ($ref${patch:+ + $patch}) — expected $expect; see $out"
      missed=$((missed + 1))
    fi
  done < <(node -e 'for (const b of require(process.argv[1]).bugs) console.log([b.id, b.ref, b.patch ?? "-", JSON.stringify(b.expect), b.sizes ?? "-", b.fights ?? "-", b.absent ? "absent" : "-"].join("\t"))' "${PLAYBOT_SEEDED:-$HERE/seeded-bugs.json}")
  echo "selftest: $((n - missed))/$n seeded bugs and controls right → $OUT"
  [ "$missed" = 0 ] || exit 3
  exit 0
fi

if [ -n "$INSTALL" ]; then
  SKILL="$(cd "$INSTALL" && pwd)"
  [ -f "$SKILL/SKILL.md" ] || { echo "playbot: $INSTALL holds no SKILL.md" >&2; exit 2; }
else
  checkout "${REF:-origin/main}" || exit 2
  SKILL="$CHECKOUT"
fi
play "$SKILL" "$OUT" "$RUN_ID"
