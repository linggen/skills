#!/usr/bin/env bash
# x-mentions.sh — registered as the FetchXMentions tool.
#
# Surfaces recent X (Twitter) mentions + replies to the user's tweets, read
# from the logged-in x.com session via the linggen-browser extension (bridge
# op "mentions") — no metered API, $0/read. Returns an empty (but valid)
# payload until that reader op ships in the extension.
#
# For each item we resolve the tweet it replied to (referenced_tweets); when
# that parent is one of YOUR tweets it's kind="reply_to_me" and we attach your
# tweet as parent_comment_body — the same shape as reddit-mentions, so the UI
# renders "your tweet" + "their reply" + a draft, which you copy to reply.
#
# Output (always JSON, exit 0):
#   { items: [{kind, title, body, url, author, created_iso, score,
#              watched_term, parent_comment_body?, parent_comment_url?}],
#     count, errors }
#   kind in {"reply_to_me","mention"}
#
# Cost: $0 — reads via the linggen-browser bridge, no paid X API.
#
# Deps: python3 stdlib only (urllib + json).

set -uo pipefail

MAX="${1:-15}"
if ! command -v python3 &>/dev/null; then
  printf '%s\n' '{"items":[],"count":0,"errors":["python3 missing"]}'
  exit 0
fi

SITES_DIR="$(cd "$(dirname "$0")" && pwd)"
MAX="$MAX" SITES_DIR="$SITES_DIR" python3 <<'PY'
import json, os, sys

sys.path.insert(0, os.environ["SITES_DIR"])  # heredoc has no __file__
from x_api import bridge_call  # noqa: E402

try:
    max_results = max(5, min(int(os.environ.get("MAX", "15")), 100))
except ValueError:
    max_results = 15

# Bridge-only: the linggen-browser extension reads the user's mentions/replies
# and returns them already shaped as the `items` list (kind/title/body/parent…).
# Until the op ships, bridge_call returns None and we emit a valid empty payload.
items = bridge_call("mentions", {"max": max_results})
errors = []
if items is None:
    errors.append("x mentions: bridge/extension unavailable (no reader op yet)")
    items = []
elif not isinstance(items, list):
    # The bridge must hand back a shaped item list. Anything else is NOT
    # mentions and must never reach the model: on 2026-09-01 the extension's
    # temporary shape-probe on this op returned a ~200KB raw SearchTimeline
    # dump, this script wrapped it as one "item", the agent's context blew
    # past its budget, compaction dropped the Reddit replies, and the whole
    # mentions run ended with no cards. Degrade loudly instead.
    errors.append(
        f"x mentions: bridge returned an unshaped payload ({type(items).__name__}) "
        "— the extension's mentions op is not implemented yet; ignored")
    items = []
else:
    items = [i for i in items if isinstance(i, dict)][:max_results]
print(json.dumps({"items": items, "count": len(items), "errors": errors}))
PY
