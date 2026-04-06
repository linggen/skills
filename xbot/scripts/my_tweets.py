#!/usr/bin/env python3
"""Get your recent tweets with engagement metrics."""
import json
import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from x_api import api_get

def my_tweets(max_results=10):
    status, data = api_get("/users/me")
    if status != 200:
        print(f"ERROR: Could not get user info ({status})", file=sys.stderr)
        sys.exit(1)
    user_id = data["data"]["id"]
    username = data["data"]["username"]

    params = {
        "max_results": min(max_results, 100),
        "tweet.fields": "created_at,public_metrics,text",
    }
    status, data = api_get(f"/users/{user_id}/tweets", params)
    if status != 200:
        print(f"ERROR: X API returned {status}", file=sys.stderr)
        print(json.dumps(data, indent=2), file=sys.stderr)
        sys.exit(1)

    tweets = data.get("data", [])
    if not tweets:
        print("No recent tweets.")
        return

    print(f"Recent tweets by @{username}:\n")
    for t in tweets:
        metrics = t.get("public_metrics", {})
        likes = metrics.get("like_count", 0)
        retweets = metrics.get("retweet_count", 0)
        replies = metrics.get("reply_count", 0)
        views = metrics.get("impression_count", 0)

        print(f"  {t['text'][:200]}")
        print(f"  ♥ {likes}  🔁 {retweets}  💬 {replies}  👁 {views}")
        print(f"  https://x.com/{username}/status/{t['id']}")
        print(f"  {t.get('created_at', '')}")
        print()

if __name__ == "__main__":
    max_results = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    my_tweets(max_results)
