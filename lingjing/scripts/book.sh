#!/bin/bash
# The phone reader uses the same checkout-first book and changes store.
D="$HOME/workspace/linggen/skills/lingjing/story/jiuding-lu"
[ -d "$D" ] || D="$HOME/.linggen/skills/lingjing/story/jiuding-lu"
verb=$1
shift
case "$verb" in
  file)
    case "$1" in ''|/*|*..*) echo 'Not a file of the book' >&2; exit 1 ;; esac
    cat "$D/$1" && printf '\n__JIUDING_END__'
    ;;
  changes)
    R="$(cd "$D/../.." && pwd)"
    LINGJING_READER="$HOME/.linggen/skills/lingjing/data/reader" \
      bash "$R/scripts/run-js.sh" "$R/scripts/rules.mjs" changes --book=jiuding-lu "$@" && printf '\n__JIUDING_END__'
    ;;
  *) exit 1 ;;
esac
