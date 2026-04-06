#!/usr/bin/env python3
"""Reply to a tweet on X."""
import json
import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from x_api import api_post

def reply(tweet_id, text):
    if len(text) > 280:
        print(f"WARNING: Text is {len(text)} chars (limit 280).", file=sys.stderr)

    payload = {
        "text": text,
        "reply": {"in_reply_to_tweet_id": tweet_id},
    }
    status, data = api_post("/tweets", payload)
    if status in (200, 201):
        reply_id = data.get("data", {}).get("id", "unknown")
        print(f"OK: Reply posted. Tweet ID: {reply_id}")
        print(f"URL: https://x.com/i/status/{reply_id}")
    else:
        print(f"ERROR: X API returned {status}", file=sys.stderr)
        print(json.dumps(data, indent=2), file=sys.stderr)
        sys.exit(1)

def extract_tweet_id(url_or_id):
    """Extract tweet ID from a URL or return as-is if already an ID."""
    if "/" in url_or_id:
        # https://x.com/user/status/1234567890
        parts = url_or_id.rstrip("/").split("/")
        return parts[-1]
    return url_or_id

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 reply.py <tweet_url_or_id> <text>", file=sys.stderr)
        sys.exit(1)
    tweet_id = extract_tweet_id(sys.argv[1])
    text = sys.argv[2]
    reply(tweet_id, text)
