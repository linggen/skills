#!/usr/bin/env bash
# The System Overview's order — one writer for both hands on it.
#
#   layout.sh read                 print the layout
#   layout.sh lead <card> <why>    the agent's lead, and its one-sentence why
#   layout.sh pin <card>           the user's pin (beats the agent's lead)
#   layout.sh unpin
#   layout.sh hide <card>          the user's hide (beats everything)
#   layout.sh show <card|all>
#
# Cards: disk clearable backup security. The file is `key=value` lines
# (overview.js parseLayout reads it); written whole, tmp + mv. Every call
# prints the layout after it, so the agent sees what stands — a user's pin
# included — without a second read.

set -u

FILE="${SHIFU_DATA:-$HOME/.linggen/skills/apple-shifu/data}/layout.txt"
CARDS=" disk clearable backup security "

# A template arg the caller left out arrives as the literal placeholder.
arg() { case "${1:-}" in "{{"*"}}") echo "" ;; *) printf '%s' "${1:-}" ;; esac; }

cmd=$(arg "${1:-read}")
card=$(arg "${2:-}")
why=$(arg "${3:-}")

get() { [ -f "$FILE" ] && sed -n "s/^$1=//p" "$FILE" | head -1; }

lead=$(get lead); lwhy=$(get why); pinned=$(get pinned); hidden=$(get hidden)

need_card() {
  case "$CARDS" in *" $card "*) ;; *) echo "error: card must be one of:$CARDS" >&2; exit 2 ;; esac
}

without() { # $1 comma list, $2 item
  printf '%s' "$1" | tr ',' '\n' | grep -vx -- "$2" | grep -v '^$' | paste -sd, -
}

case "$cmd" in
  read) ;;
  lead)
    need_card
    lead=$card
    # One line, no `=`-breaking newlines, a sentence not an essay.
    lwhy=$(printf '%s' "$why" | tr '\n\r' '  ' | cut -c1-240)
    ;;
  pin) need_card; pinned=$card; hidden=$(without "$hidden" "$card") ;;
  unpin) pinned= ;;
  hide) need_card; hidden=$(without "$hidden" "$card"); hidden=${hidden:+$hidden,}$card
        [ "$pinned" = "$card" ] && pinned= ;;
  show)
    if [ "$card" = all ]; then hidden=; else need_card; hidden=$(without "$hidden" "$card"); fi ;;
  *) echo "error: unknown command $cmd" >&2; exit 2 ;;
esac

if [ "$cmd" != read ]; then
  mkdir -p "$(dirname "$FILE")"
  tmp="$FILE.tmp.$$"
  printf 'lead=%s\nwhy=%s\npinned=%s\nhidden=%s\n' "$lead" "$lwhy" "$pinned" "$hidden" > "$tmp" && mv "$tmp" "$FILE"
fi

printf 'lead=%s\nwhy=%s\npinned=%s\nhidden=%s\n' "$lead" "$lwhy" "$pinned" "$hidden"
if [ -n "$pinned" ] && [ -n "$lead" ] && [ "$pinned" != "$lead" ]; then
  echo "note: the user pinned $pinned — it stays first; your lead comes after it"
fi
case ",$hidden," in *",$lead,"*) [ -n "$lead" ] && echo "note: the user hid $lead — it is not shown" ;; esac
exit 0
