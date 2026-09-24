#!/usr/bin/env bash
# Every check CI runs, runnable before a push: ./scripts/check.sh
# Repo-wide tests, each skill's node tests and run-*.mjs runners, dj's Python tests.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
step() {
  echo "── $*"
  if ! "$@"; then
    echo "FAILED: $*"
    fail=1
  fi
}

step node --test tests/*.test.mjs
for dir in */tests; do
  skill=${dir%/tests}
  if compgen -G "$dir/*.test.mjs" >/dev/null; then
    step node --test "$dir"/*.test.mjs
  fi
  for runner in "$dir"/run-*.mjs; do
    [ -e "$runner" ] || continue
    step node "$runner"
  done
  if compgen -G "$dir/test_*.py" >/dev/null; then
    step python3 -m unittest discover -s "$dir"
  fi
done

[ "$fail" = 0 ] && echo "all checks passed" || echo "some checks failed"
exit "$fail"
