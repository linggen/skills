#!/usr/bin/env bash
# bluesky-mentions.sh — registered as the FetchBlueskyMentions tool.
#
# Uses Bluesky's public AT Proto API — no auth required. Surfaces:
#   - mentions of the user's handle anywhere on Bluesky (searchPosts)
#   - the user's own recent posts (getAuthorFeed, posts_no_replies)
#   - the user's own recent replies (getAuthorFeed, posts_with_replies)
#   - direct replies to the user's recent posts (getPostThread depth=1)
#
# Reads sites.bluesky.handle from config.json. Without a handle, only
# emits an empty envelope + a note. Mirrors the reddit-mentions.sh
# output shape so downstream code is platform-agnostic.
#
# Output (always JSON, exit 0):
#   { items: [{kind, title, body, url, author, sub, created_iso,
#              score, num_comments, watched_term,
#              parent_comment_body?, parent_comment_url?}],
#     count: N, errors: [...] }
#
# kind ∈ "mention"      (handle appears in some public post body)
#       | "own_post"    (user's recent top-level post)
#       | "own_reply"   (user's recent reply on someone else's thread)
#       | "reply_to_me" (a direct reply to one of the user's posts)

set -uo pipefail

CONFIG="$HOME/.linggen/skills/pulse/config.json"
API="https://api.bsky.app/xrpc"
UA="linggen-pulse/0.1 (public-only; no-auth)"

emit_empty() {
  jq -cn --arg note "$1" '{items:[], count:0, errors:[$note]}'
  exit 0
}

if ! command -v jq &>/dev/null; then emit_empty "jq missing"; fi
if ! command -v curl &>/dev/null; then emit_empty "curl missing"; fi
[[ -f "$CONFIG" ]] || emit_empty "no config.json"

if ! jq -e '(.sites.bluesky.enabled // false) == true' "$CONFIG" >/dev/null 2>&1; then
  emit_empty "bluesky disabled in config"
fi

HANDLE=$(jq -r '.sites.bluesky.handle // ""' "$CONFIG" 2>/dev/null | tr -d ' ' | sed 's/^@//')
[[ -z "$HANDLE" ]] && emit_empty "no bluesky handle in config — set sites.bluesky.handle in Settings"

errors=()
items_file=$(mktemp)
trap 'rm -f "$items_file"' EXIT

# ── Mentions of the handle ──
# searchPosts with q=@handle catches @-mentions and plain text mentions.
mention_q=$(printf %s "@${HANDLE}" | jq -sRr @uri)
mention_json=$(curl -fsS --max-time 12 -A "$UA" \
  "${API}/app.bsky.feed.searchPosts?q=${mention_q}&limit=25&sort=latest" 2>/dev/null)
if [[ -n "$mention_json" ]]; then
  echo "$mention_json" | jq --arg me "$HANDLE" --arg term "@${HANDLE}" '
    [
      (.posts // [])[]
      | select(.record.text != null and .author.handle != $me)
      | {
          kind: "mention",
          title: (.record.text | .[0:100]),
          body: .record.text,
          url: ("https://bsky.app/profile/" + .author.handle + "/post/" + (.uri | split("/") | last)),
          author: ("@" + .author.handle),
          sub: "bsky",
          created_iso: (.record.createdAt // ""),
          score: (.likeCount // 0),
          num_comments: (.replyCount // 0),
          watched_term: $term
        }
    ] | .[0:25]
  ' >> "$items_file" 2>/dev/null || errors+=("mention parse failed")
else
  errors+=("mention search returned empty")
fi

# ── User's own recent posts (top-level, no replies) ──
posts_json=$(curl -fsS --max-time 12 -A "$UA" \
  "${API}/app.bsky.feed.getAuthorFeed?actor=${HANDLE}&limit=20&filter=posts_no_replies" 2>/dev/null)
if [[ -n "$posts_json" ]]; then
  echo "$posts_json" | jq --arg me "$HANDLE" '
    [
      (.feed // [])[]
      | .post
      | select(.author.handle == $me and .record.text != null)
      | {
          kind: "own_post",
          title: (.record.text | .[0:100]),
          body: .record.text,
          url: ("https://bsky.app/profile/" + .author.handle + "/post/" + (.uri | split("/") | last)),
          author: ("@" + .author.handle),
          sub: "bsky",
          created_iso: (.record.createdAt // ""),
          score: (.likeCount // 0),
          num_comments: (.replyCount // 0),
          watched_term: null
        }
    ] | .[0:10]
  ' >> "$items_file" 2>/dev/null || errors+=("own posts parse failed")
else
  errors+=("own posts fetch returned empty")
fi

# ── User's own recent replies on other people's threads ──
replies_json=$(curl -fsS --max-time 12 -A "$UA" \
  "${API}/app.bsky.feed.getAuthorFeed?actor=${HANDLE}&limit=20&filter=posts_with_replies" 2>/dev/null)
if [[ -n "$replies_json" ]]; then
  echo "$replies_json" | jq --arg me "$HANDLE" '
    [
      (.feed // [])[]
      | .post
      | select(.author.handle == $me and (.record.reply // null) != null and .record.text != null)
      | {
          kind: "own_reply",
          title: ("reply: " + (.record.text | .[0:80])),
          body: .record.text,
          url: ("https://bsky.app/profile/" + .author.handle + "/post/" + (.uri | split("/") | last)),
          author: ("@" + .author.handle),
          sub: "bsky",
          created_iso: (.record.createdAt // ""),
          score: (.likeCount // 0),
          num_comments: (.replyCount // 0),
          watched_term: null
        }
    ] | .[0:10]
  ' >> "$items_file" 2>/dev/null || errors+=("own replies parse failed")
else
  errors+=("own replies fetch returned empty")
fi

# ── Direct replies to the user's recent posts ──
# For up to 5 most recent own posts, fetch the thread (depth=1) and
# extract reply nodes where author ≠ user. This is the actionable
# "someone replied to your post" signal — same shape as reddit-mentions.sh's
# reply_to_me harvest. Bluesky's public API has no inbox / unified
# notifications without auth, so this thread-walk approach is the path.
if [[ -n "$posts_json" ]]; then
  while IFS= read -r post_uri; do
    [[ -z "$post_uri" ]] && continue
    uri_enc=$(printf %s "$post_uri" | jq -sRr @uri)
    tree=$(curl -fsS --max-time 10 -A "$UA" \
      "${API}/app.bsky.feed.getPostThread?uri=${uri_enc}&depth=1" 2>/dev/null)
    [[ -z "$tree" ]] && { errors+=("thread fetch empty for ${post_uri##*/}"); continue; }
    echo "$tree" | jq --arg me "$HANDLE" '
      .thread as $t
      | $t.post as $own
      | [
          ($t.replies // [])[]
          | select(.post.author.handle != $me and .post.record.text != null)
          | .post
          | {
              kind: "reply_to_me",
              title: ("reply to: " + ($own.record.text | .[0:80])),
              body: .record.text,
              url: ("https://bsky.app/profile/" + .author.handle + "/post/" + (.uri | split("/") | last)),
              author: ("@" + .author.handle),
              sub: "bsky",
              created_iso: (.record.createdAt // ""),
              score: (.likeCount // 0),
              num_comments: (.replyCount // 0),
              watched_term: null,
              parent_comment_body: ($own.record.text // ""),
              parent_comment_url: ("https://bsky.app/profile/" + $own.author.handle + "/post/" + ($own.uri | split("/") | last))
            }
        ]
    ' >> "$items_file" 2>/dev/null || errors+=("thread parse failed for ${post_uri##*/}")
  done < <(echo "$posts_json" | jq -r '(.feed // [])[0:5][]?.post.uri // empty' 2>/dev/null)
fi

# Merge all arrays + dedupe by url. The merge is `add` because each
# step appended ONE top-level array. unique_by(.url) keeps the first
# occurrence of each post URL — mention → own_post → own_reply →
# reply_to_me — so reply_to_me wins when the same URL would otherwise
# appear in two buckets.
merged=$(jq -s 'reverse | add // [] | unique_by(.url)' "$items_file" 2>/dev/null || echo '[]')

errs_json=$(jq -cn '$ARGS.positional' --args "${errors[@]+"${errors[@]}"}")

jq -cn \
  --argjson items "$merged" \
  --argjson errors "$errs_json" \
  '{items:$items, count:($items|length), errors:$errors}'
