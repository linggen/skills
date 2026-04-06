#!/usr/bin/env python3
"""Search recent tweets on X."""
import json
import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from x_api import api_get

def search(query, max_results=10):
    params = {
        "query": query,
        "max_results": max(10, min(max_results, 100)),
        "tweet.fields": "created_at,author_id,public_metrics,text",
        "user.fields": "username,name,public_metrics",
        "expansions": "author_id",
    }
    status, data = api_get("/tweets/search/recent", params)
    if status != 200:
        print(f"ERROR: X API returned {status}", file=sys.stderr)
        print(json.dumps(data, indent=2), file=sys.stderr)
        sys.exit(1)

    # Build user lookup
    users = {}
    for u in data.get("includes", {}).get("users", []):
        users[u["id"]] = u

    tweets = data.get("data", [])
    if not tweets:
        print(f"No tweets found for: {query}")
        return

    print(f"Found {len(tweets)} tweets for: {query}\n")
    for t in tweets:
        user = users.get(t["author_id"], {})
        username = user.get("username", "unknown")
        name = user.get("name", "")
        followers = user.get("public_metrics", {}).get("followers_count", 0)
        metrics = t.get("public_metrics", {})
        likes = metrics.get("like_count", 0)
        retweets = metrics.get("retweet_count", 0)
        replies = metrics.get("reply_count", 0)

        print(f"@{username} ({name}) · {followers} followers")
        print(f"  {t['text'][:200]}")
        print(f"  ♥ {likes}  🔁 {retweets}  💬 {replies}")
        print(f"  https://x.com/{username}/status/{t['id']}")
        print()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 search.py <query> [max_results]", file=sys.stderr)
        sys.exit(1)
    query = sys.argv[1]
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    search(query, max_results)
