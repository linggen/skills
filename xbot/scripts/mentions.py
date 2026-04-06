#!/usr/bin/env python3
"""Get recent mentions and replies to your tweets."""
import json
import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from x_api import api_get

def get_my_id():
    status, data = api_get("/users/me")
    if status != 200:
        print(f"ERROR: Could not get user info ({status})", file=sys.stderr)
        print(json.dumps(data, indent=2), file=sys.stderr)
        sys.exit(1)
    return data["data"]["id"], data["data"]["username"]

def mentions(max_results=10):
    user_id, username = get_my_id()
    params = {
        "max_results": min(max_results, 100),
        "tweet.fields": "created_at,author_id,public_metrics,text,in_reply_to_user_id",
        "user.fields": "username,name",
        "expansions": "author_id",
    }
    status, data = api_get(f"/users/{user_id}/mentions", params)
    if status != 200:
        print(f"ERROR: X API returned {status}", file=sys.stderr)
        print(json.dumps(data, indent=2), file=sys.stderr)
        sys.exit(1)

    users = {}
    for u in data.get("includes", {}).get("users", []):
        users[u["id"]] = u

    tweets = data.get("data", [])
    if not tweets:
        print(f"No recent mentions for @{username}")
        return

    print(f"Recent mentions of @{username}:\n")
    for t in tweets:
        user = users.get(t["author_id"], {})
        uname = user.get("username", "unknown")
        print(f"@{uname}: {t['text'][:200]}")
        print(f"  https://x.com/{uname}/status/{t['id']}")
        print(f"  {t.get('created_at', '')}")
        print()

if __name__ == "__main__":
    max_results = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    mentions(max_results)
