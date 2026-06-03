# Connecting X (Twitter) to Pulse

Pulse reads X for mentions, replies, and topic discovery, and drafts
≤280-char posts and replies for you. It **never posts** — you copy drafts
to X yourself. X has no free API, so Pulse uses **your own** X developer
app (pay-per-use, ~$0.001–0.01 per search). You need four OAuth 1.0a keys.

Read this guide to the user when they ask how to connect X or when the X
source returns "no X credentials". Don't ask the user to paste keys into
chat and don't read their credential file — point them at **Settings → X**,
which writes the keys to `~/.linggen/skills/pulse/credentials/x.env` locally.

---

## Step 1 — Developer account + credits

1. Go to [developer.x.com](https://developer.x.com/) and sign in with your X account.
2. Accept the developer agreement.
3. Buy credits under **Billing → Credits** ($5 minimum — the API is pay-per-use).

## Step 2 — Create an App

1. **Apps** in the left sidebar → **Create App**.
2. Name it (e.g. `linggen-poster`).
3. Save the **Consumer Key** and **Consumer Secret** shown on creation — they aren't shown again.

## Step 3 — Set permissions (before generating tokens)

Tokens inherit whatever permissions are set at generation time, so do this first.

1. Your app → **User authentication settings** → **Set up**.
2. **App permissions**: **Read and Write**.
3. **Type of App**: **Web App, Automated App or Bot**.
4. **Callback URI**: `http://localhost`.
5. **Website URL**: any URL (e.g. `https://linggen.dev`).
6. Save.

## Step 4 — Grab the four keys (Keys and Tokens tab)

Pulse uses **OAuth 1.0a** — the **OAuth 1.0 Keys** section only. Ignore the
Bearer Token (App-Only) and the OAuth 2.0 Client ID / Client Secret.

| X console label | Pulse key |
|---|---|
| Consumer Key | `X_API_KEY` |
| Consumer Secret | `X_API_SECRET` |
| Access Token | `X_ACCESS_TOKEN` |
| Access Token Secret | `X_ACCESS_TOKEN_SECRET` |

- Click **Show** to reveal the Consumer Key. If a secret won't reveal (X shows
  secrets only once), hit **Regenerate** on that pair and copy it immediately.
- Generate the Access Token + Secret **for your own account** with Read and Write.

## Step 5 — Enter them in Pulse

Open **Settings → X (Twitter)**, enable the toggle, paste the four values into
the credential fields, and **Save**. Pulse writes them to
`~/.linggen/skills/pulse/credentials/x.env` (chmod 600, this machine only,
never sent anywhere) and the X source goes live on the next Gather web run.

Already set up the **xbot** skill? Reuse its file instead of re-entering keys:

```bash
cp ~/.linggen/skills/xbot/credentials/x.env ~/.linggen/skills/pulse/credentials/x.env
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `401 Unauthorized` | Regenerate **both** Consumer Key and Access Token; make sure Read+Write was set **before** generating the token. |
| `403 Forbidden` | Out of credits — top up at Billing → Credits. |
| Still 401 after regenerating | You may have two apps (Pay Per Use vs Standalone). Use the **Pay Per Use** app's keys; delete the Standalone one. |
