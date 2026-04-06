# Social Post — Setup Guide

This guide walks you through registering developer apps on each platform so you
can post from Linggen. Each platform is independent — set up only the ones you use.

---

## X (Twitter)

> **Note**: X API requires pay-per-use credits. Buy at least $5 in credits at
> developer.x.com → Billing → Credits before you can post.

### Step 1: Create a Developer Account

1. Go to [developer.x.com](https://developer.x.com/) and sign in with your X account
2. Accept the developer agreement
3. Buy credits under **Billing → Credits** ($5 minimum)

### Step 2: Create an App

1. Go to **Apps** in the left sidebar
2. Click **Create App**
3. Name it (e.g., "linggen-poster")
4. Save the **Consumer Key** and **Consumer Secret** shown on creation — they won't be shown again

### Step 3: Set App Permissions

**Do this before generating Access Tokens** — tokens inherit the permissions set at generation time.

1. Click your app → **User authentication settings** → **Set up**
2. Set **App permissions** to **Read and Write**
3. Set **Type of App** to **Web App, Automated App or Bot**
4. Set **Callback URI** to `http://localhost`
5. Set **Website URL** to any URL (e.g., `https://linggen.dev`)
6. Save

### Step 4: Generate Access Tokens

1. Go to your app → **Keys and Tokens** tab
2. Under **OAuth 1.0 Keys**, note your **Consumer Key** (click Show) and **Consumer Secret** (Regenerate if lost)
3. Under **Access Token**, click **Generate**
4. Save the **Access Token** and **Access Token Secret**

You now have 4 keys. The Bearer Token is for read-only — you don't need it for posting.

### Step 5: Create the Credential File

```bash
mkdir -p ~/.linggen/skills/social-post/credentials
touch ~/.linggen/skills/social-post/credentials/x.env
```

Open `~/.linggen/skills/social-post/credentials/x.env` in your editor and add:

```
X_API_KEY="<Consumer Key>"
X_API_SECRET="<Consumer Secret>"
X_ACCESS_TOKEN="<Access Token>"
X_ACCESS_TOKEN_SECRET="<Access Token Secret>"
```

### Step 6: Verify

```
/social-post status
```

Should show `X (Twitter): READY`.

### Limits

- Pay-per-use: ~$0.01 per tweet
- Tweet length: **280 characters** (free), 25,000 (Premium+)
- Media uploads: not supported via free API

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `401 Unauthorized` | Regenerate **both** Consumer Key and Access Token. Make sure you set Read+Write permissions **before** generating tokens. |
| `403 Forbidden` | Out of credits. Buy more at Billing → Credits. |
| Still 401 after regenerating | You may have two apps (Pay Per Use vs Standalone). Use the keys from the **Pay Per Use** app. Delete the Standalone one. |

---

## Facebook Page

> **Note**: You post to a **Facebook Page** you manage, not your personal profile.
> Facebook's API does not allow posting to personal profiles.

### Step 1: Create a Facebook App

1. Go to [developers.facebook.com](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Select **Business** type
4. Name it (e.g., "Linggen Social Post")
5. Complete the setup

### Step 2: Get a Page Access Token

Use the [Graph API Explorer](https://developers.facebook.com/tools/explorer/).

1. Select your app from the dropdown
2. Click **Generate Access Token**
3. Grant permissions: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`
4. Exchange for a long-lived token:

```bash
curl -s "https://graph.facebook.com/v21.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=YOUR_APP_ID&\
client_secret=YOUR_APP_SECRET&\
fb_exchange_token=YOUR_SHORT_LIVED_TOKEN"
```

5. Get the never-expiring Page token:

```bash
curl -s "https://graph.facebook.com/v21.0/me/accounts?\
access_token=YOUR_LONG_LIVED_USER_TOKEN"
```

Copy the `id` (Page ID) and `access_token` (Page Access Token) for your page.

### Step 3: Create the Credential File

```bash
mkdir -p ~/.linggen/skills/social-post/credentials
touch ~/.linggen/skills/social-post/credentials/facebook.env
```

Open `~/.linggen/skills/social-post/credentials/facebook.env` and add:

```
FB_PAGE_ID="<Page ID>"
FB_PAGE_ACCESS_TOKEN="<Page Access Token>"
```

### Step 4: Verify

```
/social-post status
```

### Limits

- Post length: **63,206 characters**
- No daily post limit for normal usage

---

## LinkedIn

### Step 1: Create a LinkedIn App

1. Go to [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps)
2. Click **Create App**
3. Fill in: App name, LinkedIn Page (required), App logo
4. Accept terms and create

### Step 2: Request Permissions

1. Go to **Products** tab → request **Share on LinkedIn** (usually auto-approved)
2. Go to **Auth** tab → verify `w_member_social` scope is listed

### Step 3: Get an Access Token

1. In your app's **Auth** tab, use **OAuth 2.0 tools** to generate a token
2. Authorize with your LinkedIn account
3. Copy the access token

### Step 4: Get Your User URN ID

```bash
curl -s -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  "https://api.linkedin.com/v2/userinfo"
```

Copy the `sub` field — this is your User URN ID.

### Step 5: Create the Credential File

```bash
mkdir -p ~/.linggen/skills/social-post/credentials
touch ~/.linggen/skills/social-post/credentials/linkedin.env
```

Open `~/.linggen/skills/social-post/credentials/linkedin.env` and add:

```
LI_ACCESS_TOKEN="<Access Token>"
LI_USER_URN="<User URN ID>"
```

### Step 6: Verify

```
/social-post status
```

### Limits

- Post length: **3,000 characters**
- Rate limit: **100-500 requests per day**
- **Token expires every 60 days** — re-run setup to refresh

---

## Credentials Storage

All credentials are stored locally at:
```
~/.linggen/skills/social-post/credentials/
├── x.env           # X API keys (OAuth 1.0a)
├── facebook.env    # Facebook Page token
└── linkedin.env    # LinkedIn Bearer token
```

Files are readable only by your user (`chmod 600`). They are **never** sent to
any server — all API calls go directly from your machine to the platform.
