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
#              num_comments, watched_term, parent_comment_body?,
#              parent_comment_url?}],
#     count: N, errors: [...] }
#
# kind ∈ "mention"      (handle appears in some thread title/selftext)
#       | "own_post"    (user's recent submission, useful for tracking new replies)
#       | "own_comment" (user's recent comment; num_comments carries the parent
#                        post's reply count, useful for thread-activity sorting)
#       | "reply_to_me" (a direct reply to one of the user's recent comments —
#                        the real "someone replied to me" signal, harvested by
#                        walking each own_comment's focused thread tree.
#                        body is the full reply text (up to 1500 chars, not
#                        truncated to a snippet); parent_comment_body /
#                        parent_comment_url carry the user's original comment
#                        for context so the agent doesn't need a second fetch)

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
        num_comments: (.num_comments // 0),
        watched_term: null
      })
    | .[0:10]
  ' >> "$items_file" 2>/dev/null || errors+=("own comments parse failed")
else
  errors+=("user-comments fetch returned empty")
fi

# ── Direct replies to the user's recent comments ──
# Reddit's public search.json doesn't surface comment-replies, and there's
# no public inbox without OAuth. So for each recent own_comment, fetch its
# focused thread tree and harvest direct children whose parent_id matches
# the user's comment. Cap at the 5 newest comments to stay under the
# anonymous ~10 req/min ceiling (3 above + 5 here = 8).
if [ -n "$comments_json" ]; then
  while IFS=$'\t' read -r cname link_id link_title; do
    [ -z "$cname" ] || [ -z "$link_id" ] && continue
    cshort="${cname#t1_}"
    lshort="${link_id#t3_}"
    tree=$(curl -sS --max-time 10 -A "$UA" \
      "https://www.reddit.com/comments/${lshort}/_/${cshort}.json?limit=30&depth=2&raw_json=1" 2>/dev/null)
    [ -z "$tree" ] && { errors+=("reply walk fetch empty for $cshort"); continue; }
    echo "$tree" | jq --arg user "$USERNAME" --arg pid "$cname" --arg ltitle "$link_title" '
      .[1].data.children[0].data as $own
      | [ $own
          | .replies as $r
          | if ($r | type) == "object" then $r.data.children[]?.data else empty end
          | select(.parent_id == $pid and .author != $user and .author != "[deleted]")
          | {
              kind: "reply_to_me",
              title: $ltitle,
              body: ((.body // "") | .[0:1500]),
              url: ("https://www.reddit.com" + (.permalink // "")),
              author: ("u/" + (.author // "")),
              sub: ("r/" + (.subreddit // "")),
              created_iso: (.created_utc | if . then (. | strftime("%Y-%m-%dT%H:%M:%SZ")) else null end),
              score: (.score // 0),
              num_comments: 0,
              watched_term: null,
              parent_comment_body: ($own.body // ""),
              parent_comment_url: ("https://www.reddit.com" + ($own.permalink // ""))
            }
        ]
    ' >> "$items_file" 2>/dev/null || errors+=("reply walk parse failed for $cshort")
  done < <(echo "$comments_json" | jq -r '.data.children[0:5][]? | .data | [.name, .link_id, (.link_title // "")] | @tsv' 2>/dev/null)
fi

# Merge all collected arrays (each previous step appended ONE array).
merged=$(jq -s 'add // []' "$items_file" 2>/dev/null || echo '[]')

# Drop the user's OWN posts/comments that share the handle (the search
# above will pick those up as mentions because Reddit's free-text search
# indexes the author handle too). Keep only mentions that aren't BY the
# user themselves — those are the high-signal items.
#
# Also dedupe reply_to_me items by thread (post id from URL): when two of
# the user's own_comments live in the same conversation chain, the loop
# above produces one reply_to_me per own_comment, so a chain like
# Userᵢ ← Reply₁ ← Userⱼ ← Reply₂ surfaces as two cards — Reply₁ is
# already implicitly "responded to" by Userⱼ. Keep only the newest reply
# per thread; the user can drill into the full chain by clicking Open.
filtered=$(jq --arg user "$USERNAME" '
  map(
    if .kind == "mention" and (.author | ascii_downcase) == ("u/" + ($user | ascii_downcase) | ascii_downcase)
    then empty
    else .
    end
  )
  | (map(select(.kind != "reply_to_me")))
    + (map(select(.kind == "reply_to_me"))
       | group_by(.url | capture("/comments/(?<id>[^/]+)") | .id)
       | map(sort_by(.created_iso) | last))
' <<< "$merged")

errs_json=$(jq -cn '$ARGS.positional' --args "${errors[@]+"${errors[@]}"}")

jq -cn \
  --argjson items "$filtered" \
  --argjson errors "$errs_json" \
  '{items:$items, count:($items|length), errors:$errors}'
