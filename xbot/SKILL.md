---
name: xbot
description: >-
  X (Twitter) assistant — post, search, reply, monitor mentions,
  and track engagement. Your AI social media manager.
user-invocable: true
allowed-tools: [Bash, Read, Write]
argument-hint: "post <text> | search <query> | reply <url> | mentions | my-tweets | config | status"
permission:
  paths:
    - { path: ~/.linggen/skills/xbot, mode: write }
  warning: "xbot reads and writes credentials and post drafts under ~/.linggen/skills/xbot, and calls the X API via Bash."
---

# xbot — X (Twitter) Assistant

Post, search, reply, and monitor your X presence from chat.
Uses the user's own developer app credentials (pay-per-use).

## Script Location

```bash
SP_DIR="$HOME/.linggen/skills/xbot/scripts"
[ -d "$SP_DIR" ] || SP_DIR="$PWD/.linggen/skills/xbot/scripts"
```

## Core Workflows

### 1. Check Status

```bash
bash "$SP_DIR/status.sh"
```

### 2. Setup / Configure

**Important**: Do NOT ask the user to paste API keys into chat and do NOT
read credential files. Just tell the user how to create/edit the file themselves.

Show the user these steps:

1. Register at **developer.x.com** and create an App
2. Buy credits under **Billing → Credits** ($5 minimum — X API is pay-per-use)
3. Set **User authentication** permissions to **Read and Write**
4. In **Keys and Tokens** tab, copy your **Consumer Key** and **Consumer Secret**
5. Under **Access Token**, click **Generate** to get **Access Token** and **Access Token Secret**
6. Run:
```bash
mkdir -p ~/.linggen/skills/xbot/credentials
touch ~/.linggen/skills/xbot/credentials/x.env
```
7. Open `~/.linggen/skills/xbot/credentials/x.env` in your editor and add:
```
X_API_KEY="<Consumer Key>"
X_API_SECRET="<Consumer Secret>"
X_ACCESS_TOKEN="<Access Token>"
X_ACCESS_TOKEN_SECRET="<Access Token Secret>"
```
8. Tell me when done — I'll verify with `status.sh`

### 3. Post a Tweet

```bash
bash "$SP_DIR/post-x.sh" "Your message here"
```

Or use Python for better Unicode/quoting support:
```bash
python3 "$SP_DIR/x_api.py" && python3 -c "
import sys; sys.path.insert(0, '$SP_DIR')
from x_api import api_post
status, data = api_post('/tweets', {'text': '''MESSAGE_HERE'''})
print(data)
"
```

### 4. Search Tweets

Find recent tweets about a topic:

```bash
python3 "$SP_DIR/search.py" "AI coding agent" 10
```

Use this to:
- Find relevant conversations to join
- Research what people say about competitors
- Discover trending topics in your space

### 5. Reply to a Tweet

```bash
python3 "$SP_DIR/reply.py" "https://x.com/user/status/123456" "Your reply text"
```

Accepts either a tweet URL or a tweet ID.

### 6. Check Mentions

See who's mentioning or replying to you:

```bash
python3 "$SP_DIR/mentions.py" 10
```

### 7. View My Tweets + Engagement

See your recent tweets with likes, retweets, replies, and views:

```bash
python3 "$SP_DIR/my_tweets.py" 10
```

### 8. Summarize and Post

When the user says something like "summarize today and post to X":

1. Read the current session's conversation history
2. Draft a concise, engaging tweet (under 280 chars)
3. Show the draft to the user for approval
4. Once approved, post

### 9. Scout and Engage

When the user says "find conversations about <topic>":

1. Run `search.py` with the topic
2. Show the most relevant/engaging tweets
3. Suggest which ones to reply to
4. Draft a helpful, non-spammy reply for each
5. Post replies only after user approval

### 10. Release Announcement

When the user says "announce release" or "post about release":

1. Check recent git log or changelog for what's new
2. Draft a tweet with key highlights
3. Include the project URL
4. Suggest relevant hashtags
5. Post after approval

## Smart Behaviors

- **Scout mode**: When searching, prioritize tweets from users with more followers
  and tweets with high engagement — those are better conversations to join
- **Reply tone**: Be helpful and genuine, never promotional. Add value to the
  conversation. Mention the project only if directly relevant.
- **Thread support**: For longer content, suggest splitting into a thread
  (post first tweet, then reply to it with continuations)
- **Hashtag suggestions**: For dev tools, suggest tags like #opensource #ai #rust
  #coding #devtools when relevant

## Limits

- 280 characters per tweet
- ~$0.01 per post, search is cheaper (~$0.001/request)
- No media uploads via API

## Important Rules

- **Always show the draft to the user before posting or replying** — never auto-post
- If text exceeds 280 chars, warn and suggest trimming
- If credentials are missing, run `status.sh` and guide user through setup
- **Never spam** — replies should add genuine value to the conversation
