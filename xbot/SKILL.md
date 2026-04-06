---
name: xbot
description: >-
  Post to X (Twitter) from chat.
  Supports drafting summaries, hashtags, and threads.
  User configures their own API keys.
user-invocable: true
allowed-tools: [Bash, Read, Write]
argument-hint: "<text> | config | status"
---

# xbot — Post to X (Twitter)

Post text to X (Twitter) directly from chat.
Uses the user's own developer app credentials (pay-per-use, ~$0.01/post).

## Script Location

```bash
SP_DIR="$HOME/.linggen/skills/xbot/scripts"
[ -d "$SP_DIR" ] || SP_DIR="$PWD/.linggen/skills/xbot/scripts"
```

## Credentials Location

Credentials are stored in `~/.linggen/skills/xbot/credentials/x.env`.

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

Note: The Bearer Token is for read-only. Posting requires OAuth 1.0a (all 4 keys above).

### 3. Post

```bash
bash "$SP_DIR/post-x.sh" "Your message here"
```

### 4. Summarize and Post

When the user says something like "summarize today and post to X":

1. Read the current session's conversation history
2. Draft a concise, engaging tweet (under 280 chars)
3. Show the draft to the user for approval
4. Once approved, post

## Limits

- 280 characters per tweet (free tier)
- ~$0.01 per post (pay-per-use)
- No media uploads via free API

## Important Rules

- **Always show the draft to the user before posting** — never auto-post without confirmation
- If text exceeds 280 chars, warn and suggest trimming
- If credentials are missing, run `status.sh` and guide user through setup
- Suggest relevant hashtags when appropriate
