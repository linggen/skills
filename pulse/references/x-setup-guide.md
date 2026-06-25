# Connecting X (Twitter) to Pulse

Pulse reads X for mentions, replies, and topic discovery, and drafts
≤280-char posts and replies for you. It **never posts** — you copy drafts
to X yourself.

There is **no paid API and no developer keys**. Pulse reads X through the
**linggen-browser extension**, which reads your **logged-in x.com session**
in your own browser. Reads cost **$0**. Your cookies never leave the
browser — only the parsed results (public post text + metrics) are handed
to the local daemon.

Read this guide to the user when they ask how to connect X, or when an X
tool returns empty because the bridge/extension isn't available.

---

## Step 1 — Install the linggen-browser extension

Install the **linggen-browser** Chrome extension and keep it enabled. It
holds a local connection to the Linggen daemon and answers X read requests
on demand (it opens a background x.com tab, reads, and closes it).

## Step 2 — Stay signed in to X

In the same browser, sign in to [x.com](https://x.com/) as your normal
account. That's the session Pulse reads — no tokens, no app, no billing.
Keep the tab/session logged in; if you're logged out, X reads return empty.

## Step 3 — Configure X in Pulse

Open **Settings → X (Twitter)**, enable the toggle, and set:

- **My X handle** — your exact handle (e.g. `Linggen77`), used for display
  and to scope own-posts/mentions.
- **Target accounts** — the curated mid-tier niche accounts whose fresh
  posts you want to reply to early (the growth engine). Use **Find
  candidates** to seed the list.
- **Discovery keywords** — topics for the keyword search (optional).

Keyword search (`FetchX`) is **OFF by default**. It's the lowest
value-per-read source (firehose of tiny/promo accounts), so opt in only if
you want it: set `sites.x.keyword_search=true` in `config.json`.

## How it works

- `FetchXTargets` (bridge op `targets`) and `FetchX` (bridge op `search`)
  read live from your session — these power discovery and are **$0**.
- `FetchXOwnPosts`, `FetchXMentions`, and the follower snapshot read via the
  bridge too, but their reader ops ship with the extension over time; until
  then they return an empty (but valid) payload, so the rest of Pulse keeps
  working.

## Verify the connection

Check the bridge from a terminal:

```bash
curl -s http://127.0.0.1:9898/api/bridge/status
```

`{"connected":true,...,"modules":[{"id":"x",...,"ready":true}]}` means the
extension is connected and X reads will work.

## Troubleshooting

| Problem | Fix |
|---|---|
| X section empty, `connected:false` | The extension isn't connected — make sure it's installed, enabled, and the daemon is running. |
| X reads return empty but bridge is connected | Sign in to x.com in the extension's browser. |
| Only `FetchX`/`FetchXTargets` return data | Expected — own-posts/mentions/followers reader ops ship with the extension over time. |
