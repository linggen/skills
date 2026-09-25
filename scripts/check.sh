#!/usr/bin/env bash
# Every check CI runs, runnable before a push: ./scripts/check.sh
# Repo-wide tests, each skill's node tests, run-*.mjs and run-*.pl runners, dj's Python tests.
# Only *.test.mjs, run-*.{mjs,pl} and test_*.py run — helpers like health/tests/preview-server.mjs never do.
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
  for runner in "$dir"/run-*.pl; do
    [ -e "$runner" ] || continue
    step perl "$runner"
  done
  if compgen -G "$dir/test_*.py" >/dev/null; then
    step python3 -m unittest discover -s "$dir"
  fi
done

[ "$fail" = 0 ] && echo "all checks passed" || echo "some checks failed"
exit "$fail"
