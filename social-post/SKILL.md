---
name: social-post
description: >-
  Post to X (Twitter), Facebook Page, and LinkedIn from chat.
  Supports cross-posting, drafting summaries, and scheduling.
  User configures their own API keys per platform.
user-invocable: true
allowed-tools: [Bash, Read, Write]
argument-hint: "--x|--facebook|--linkedin|--all <text> | config | status"
---

# Social Post — Publish to Social Media

Post text to X (Twitter), Facebook Pages, and LinkedIn directly from chat.
Each platform uses the user's own developer app credentials (free).

## Script Location

```bash
SP_DIR="$HOME/.linggen/skills/social-post/scripts"
[ -d "$SP_DIR" ] || SP_DIR="$PWD/.linggen/skills/social-post/scripts"
```

## Credentials Location

All credentials are stored in `~/.linggen/skills/social-post/credentials/`.
Each platform has its own file (e.g., `x.env`, `facebook.env`, `linkedin.env`).

## Core Workflows

### 1. Check Status

Show which platforms are configured and ready:

```bash
bash "$SP_DIR/status.sh"
```

### 2. Setup / Configure a Platform

**Important**: Do NOT ask the user to paste API keys into chat and do NOT
read credential files. Just tell the user how to create/edit the file themselves.

Show the user brief numbered steps for their platform:

#### X (Twitter)

1. Register at **developer.x.com** and create an App
2. Set **User authentication** permissions to **Read and Write**
3. In **Keys and Tokens** tab, copy your **Consumer Key** and **Consumer Secret**
4. Scroll down to **Authentication Tokens** and click **Generate** to get **Access Token** and **Access Token Secret** (these are separate from the Bearer Token — you need all 4 for posting)
5. Run these commands to create the credential file:
```bash
mkdir -p ~/.linggen/social-post/credentials
touch ~/.linggen/skills/social-post/credentials/x.env
```
6. Open `~/.linggen/skills/social-post/credentials/x.env` in your editor and add:
```
X_API_KEY="<Consumer Key>"
X_API_SECRET="<Consumer Secret>"
X_ACCESS_TOKEN="<Access Token>"
X_ACCESS_TOKEN_SECRET="<Access Token Secret>"
```
7. Tell me when done — I'll verify with `status.sh`

Note: The Bearer Token shown on app creation is for read-only. Posting requires OAuth 1.0a (all 4 keys above).

#### Facebook

1. Create an app at **developers.facebook.com**
2. In **Graph API Explorer**, generate a Page Access Token with `pages_manage_posts` permission
3. Exchange for a long-lived token, then get the never-expiring Page token (see setup guide for details)
4. Run:
```bash
mkdir -p ~/.linggen/social-post/credentials
touch ~/.linggen/skills/social-post/credentials/facebook.env
```
5. Open `~/.linggen/skills/social-post/credentials/facebook.env` in your editor and add:
```
FB_PAGE_ID="<Page ID>"
FB_PAGE_ACCESS_TOKEN="<Page Access Token>"
```
6. Tell me when done — I'll verify with `status.sh`

#### LinkedIn

1. Create an app at **linkedin.com/developers**
2. Request **Share on LinkedIn** product access
3. Generate an OAuth token and get your User URN ID from `/v2/userinfo`
4. Run:
```bash
mkdir -p ~/.linggen/social-post/credentials
touch ~/.linggen/skills/social-post/credentials/linkedin.env
```
5. Open `~/.linggen/skills/social-post/credentials/linkedin.env` in your editor and add:
```
LI_ACCESS_TOKEN="<Access Token>"
LI_USER_URN="<User URN ID>"
```
6. Tell me when done — I'll verify with `status.sh`

After the user says they're done, run `status.sh` to verify.
If the user needs more detailed help, read the setup guide:

```bash
cat "$SP_DIR/../references/SETUP-GUIDE.md"
```

### 3. Post to a Single Platform

```bash
bash "$SP_DIR/post-x.sh" "Your message here"
bash "$SP_DIR/post-facebook.sh" "Your message here"
bash "$SP_DIR/post-linkedin.sh" "Your message here"
```

### 4. Cross-Post to All Configured Platforms

Post to every platform that has credentials configured. Run each post script
individually and report results per platform.

### 5. Summarize and Post

When the user says something like "summarize today and post":

1. Read the current session's conversation history
2. Draft a concise, engaging summary suitable for social media
3. Show the draft to the user for approval
4. Once approved, post to the requested platforms

## Platform Limits

| Platform | Character Limit | Rate Limit |
|----------|----------------|------------|
| X | 280 chars (free), 25,000 (Premium) | 17 posts/day (free) |
| Facebook | 63,206 chars | Standard |
| LinkedIn | 3,000 chars | 100-500 req/day |

## Important Rules

- **Always show the draft to the user before posting** — never auto-post without confirmation
- If text exceeds a platform's limit, warn the user and suggest trimming
- If credentials are missing, run `status.sh` and guide user through `setup.sh`
- Keep posts professional and concise by default
- For X: suggest hashtags if relevant
- For LinkedIn: use a slightly more professional tone
