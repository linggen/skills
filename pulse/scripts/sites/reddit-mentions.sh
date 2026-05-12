#!/usr/bin/env bash
# reddit-mentions.sh — registered as the FetchRedditMentions tool.
#
# Uses Reddit's PUBLIC JSON endpoints — no OAuth required. Surfaces:
#   - mentions of the user's handle in any public thread (search.json)
#   - the user's recent posts (for "any replies you missed?" follow-up)
#   - the user's recent comments (for "did anyone respond to this?")
#
# Reads sites.reddit.username from config.json. Without a username, only
# emits an empty envelope + a note.
#
# Anonymous rate limit is ~10 req/min — we make at most 3 requests per
# invocation (search + user posts + user comments).
#
# Output (always JSON, exit 0):
#   { items: [{kind, title, body, url, author, sub, created_iso, score,
#              num_comments, watched_term}],
#     count: N, errors: [...] }
#
# kind ∈ "mention" (handle appears in some thread)
#       | "own_post" (user's recent submission, useful for tracking new replies)
#       | "own_comment" (user's recent comment, useful for tracking replies)

set -uo pipefail

CONFIG="$HOME/.linggen/skills/pulse/config.json"
UA="pulse/0.1 (public-mentions; no-auth)"

emit_empty() {
  jq -cn --argjson items '[]' --arg note "$1" '{items:$items, count:0, errors:[$note]}'
  exit 0
}

if ! command -v jq &>/dev/null; then emit_empty "jq missing"; fi
if ! command -v curl &>/dev/null; then emit_empty "curl missing"; fi
if [ ! -f "$CONFIG" ]; then emit_empty "no config.json"; fi

USERNAME=$(jq -r '.sites.reddit.username // ""' "$CONFIG" 2>/dev/null | tr -d ' ')
USERNAME="${USERNAME#u/}"
if [ -z "$USERNAME" ]; then
  emit_empty "no reddit username in config — set sites.reddit.username in Settings"
fi

errors=()
items_file=$(mktemp)
trap 'rm -f "$items_file"' EXIT

append_items() {
  # append_items < jq-mapped-array.json
  cat >> "$items_file"
}

# ── Handle mentions across Reddit (public search) ──
# Search the entire site for occurrences of the handle. Reddit's
# search.json supports q= and sort=new for recency. Cap to ~25 results.
mentions_json=$(curl -sS --max-time 15 -A "$UA" \
  "https://www.reddit.com/search.json?q=$(printf %s "u/$USERNAME" | jq -sRr @uri)&restrict_sr=false&sort=new&limit=25&raw_json=1" 2>/dev/null)

if [ -n "$mentions_json" ]; then
  echo "$mentions_json" | jq --arg term "$USERNAME" '
    .data.children
    | map(.data)
    | map(select(.title != null or .selftext != null))
    | map({
        kind: "mention",
        title: (.title // ""),
        body: ((.selftext // "") | .[0:400]),
        url: ("https://www.reddit.com" + (.permalink // "")),
        author: ("u/" + (.author // "")),
        sub: ("r/" + (.subreddit // "")),
        created_iso: (.created_utc | if . then (. | strftime("%Y-%m-%dT%H:%M:%SZ")) else null end),
        score: (.score // 0),
        num_comments: (.num_comments // 0),
        watched_term: ("u/" + $term)
      })
    | .[0:25]
  ' >> "$items_file" 2>/dev/null || errors+=("mention parse failed")
else
  errors+=("mentions search returned empty (rate limit?)")
fi

# ── User's recent posts ──
posts_json=$(curl -sS --max-time 15 -A "$UA" \
  "https://www.reddit.com/user/${USERNAME}.json?limit=15&raw_json=1" 2>/dev/null)

if [ -n "$posts_json" ]; then
  echo "$posts_json" | jq '
    .data.children
    | map(.data)
    | map(select(.title != null and .selftext != null))
    | map({
        kind: "own_post",
        title: (.title // ""),
        body: ((.selftext // "") | .[0:400]),
        url: ("https://www.reddit.com" + (.permalink // "")),
        author: ("u/" + (.author // "")),
        sub: ("r/" + (.subreddit // "")),
        created_iso: (.created_utc | if . then (. | strftime("%Y-%m-%dT%H:%M:%SZ")) else null end),
        score: (.score // 0),
        num_comments: (.num_comments // 0),
        watched_term: null
      })
    | .[0:10]
  ' >> "$items_file" 2>/dev/null || errors+=("own posts parse failed")
else
  errors+=("user-posts fetch returned empty")
fi

# ── User's recent comments ──
comments_json=$(curl -sS --max-time 15 -A "$UA" \
  "https://www.reddit.com/user/${USERNAME}/comments.json?limit=15&raw_json=1" 2>/dev/null)

if [ -n "$comments_json" ]; then
  echo "$comments_json" | jq '
    .data.children
    | map(.data)
    | map({
        kind: "own_comment",
        title: ("on: " + (.link_title // "")),
        body: ((.body // "") | .[0:300]),
        url: ("https://www.reddit.com" + (.permalink // "")),
        author: ("u/" + (.author // "")),
        sub: ("r/" + (.subreddit // "")),
        created_iso: (.created_utc | if . then (. | strftime("%Y-%m-%dT%H:%M:%SZ")) else null end),
        score: (.score // 0),
        num_comments: 0,
        watched_term: null
      })
    | .[0:10]
  ' >> "$items_file" 2>/dev/null || errors+=("own comments parse failed")
else
  errors+=("user-comments fetch returned empty")
fi

# Merge all collected arrays (each previous step appended ONE array).
merged=$(jq -s 'add // []' "$items_file" 2>/dev/null || echo '[]')

# Drop the user's OWN posts/comments that share the handle (the search
# above will pick those up as mentions because Reddit's free-text search
# indexes the author handle too). Keep only mentions that aren't BY the
# user themselves — those are the high-signal items.
filtered=$(jq --arg user "$USERNAME" '
  map(
    if .kind == "mention" and (.author | ascii_downcase) == ("u/" + ($user | ascii_downcase) | ascii_downcase)
    then empty
    else .
    end
  )
' <<< "$merged")

errs_json=$(jq -cn '$ARGS.positional' --args "${errors[@]+"${errors[@]}"}")

jq -cn \
  --argjson items "$filtered" \
  --argjson errors "$errs_json" \
  '{items:$items, count:($items|length), errors:$errors}'
