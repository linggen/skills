# Investments module — spec

A Stocks-style tab in CFO: a watchlist and holdings (stocks and ETFs, US and
TSX), live numbers, company reports read by the agent, and an optional alert
when a watched company reports. Local-first — public pages fetched from the
Mac; no Linggen Cloud, no data-provider key.

## Data (data/)

- Holdings are register cells in `edits.json`: `inv:<symbol>|watch` (true),
  `|shares`, `|avg_cost`, `|account` (free label: TFSA, RRSP, Margin…). Symbol
  is `AAPL` (US) or `RY.TO` (TSX). One cell per field, so the phone merges them.
- `investments.json` — the page's snapshot, written after every edit and
  refresh (market.pl no longer reads it: `reports-check` and `portfolio` take
  holdings straight from the register, so a symbol added on the phone counts
  before the Mac page is opened): `{updated_at, holdings[{symbol, name, shares, avg_cost, account,
  currency, price, value, gain, gain_pct}], watchlist[symbol]}`.
- `quotes.json` — `{symbols: {SYM: {price, change, change_pct, prev_close,
  high_52w, low_52w, market, price_time, name, kind, pe, forward_pe,
  market_cap, earnings_date, earnings_on, dividend, dividend_yield, aum,
  expense_ratio, cik, quote_at, stats_at}}}`.
- `reports.json` — `{last_checked, symbols: {SYM: {since, name, reports:
  [{period, form, filed, url, summary, saved_at}]}}}`, newest first. `since`
  is the day a symbol was first checked: only reports filed from then on
  count as new. Written only by `save-report`, apart from `since` and
  `last_checked`.

## Market tool (scripts/market.pl — zero LLM, Perl core + curl)

- `quotes <symbols>` — price and day change, from
  `stockanalysis.com/api/quotes/{s|e}/<sym>` (US stock, then ETF) or
  `a/tsx-<sym>`. `stats [--fresh] <symbols>` — name, kind, P/E, forward P/E,
  market cap, earnings date, ETF expense ratio, from the overview page's
  `__data.json` (SvelteKit devalue), cached 20 h. Merges into `quotes.json`
  under a lock, prints JSON.
- A report is one period's results `{symbol, name, form, period, filed,
  url}`. US: SEC EDGAR submissions (CIK from the stats, else SEC's
  `company_tickers.json`, cached a week) — 10-Q, 10-K, 20-F, 40-F and the
  8-K with item 2.02. A release and the 10-Q of its quarter are one report
  (periods within 10 days); the release's press-release exhibit (99.1) is
  the url. TSX: the stats' earnings date once passed, `form: "earnings"`,
  no url. ETFs have none.
- `reports-check [SYMBOLS]` (default: `investments.json`) — reports filed on
  or after the symbol's `since` with nothing saved for their period; the
  first check sets `since` to today. Prints `{new, failed, checked,
  last_checked}`. Unsaved reports stay new, so a failed read retries.
- `reports-latest SYM` — the newest report, with `saved` (its summary or
  null). `read URL` — a filing, results page or results PDF as text (first
  60,000 characters; PDFs through macOS PDFKit via `osascript`).
  `save-report key=value…` — the one writer; the same period replaces.
  `portfolio` — `investments.json` + listed quotes + `reports.json`.
- Yahoo Finance answers 429 to plain requests (tested 2026-09-15) — not a
  source. SEC answers 403 to browser-like or anonymous agents, the engine's
  WebFetch included; `market.pl` sends `Linggen CFO https://linggen.dev`.
  Stats at most daily per symbol. Tests: `tests/run-market.pl`.

## UI (cfo.html / cfo.js — no new page)

- New tab `data-view="invest"` **Investments**, same pattern as Commitments.
- List: symbol, name, a P/E · Fwd P/E · Earnings line, price, day change;
  holdings add value and gain, with totals per currency on top. Add by ticker;
  edit shares / avg cost / account inline; remove from the row's ⋯ menu
  (right-click opens the same menu). Page module `investments.js`.
- Refresh: quotes on open and every 5 min while the tab is visible; stats
  daily.
- Company card (click a row): the numbers, next or last earnings date,
  report summaries newest first with a Source link (opens in the default
  browser), **Latest report** button. Already summarized → "Already read",
  no model call.
- **Check reports** (beside Refresh): runs `reports-check`. Empty → "Nothing
  new since <time>", no model call. Otherwise a hidden prompt hands the new
  items to the CFO agent. A `SaveReport` in the chat stream reloads the
  card.
- Settings: **Tell me when a report comes out** → turns mission `cfo:reports`
  on/off through the missions API.

## Agent layer (SKILL.md)

- Tools (all `tier: read`): `Investments` (`portfolio`), `Market` (quotes +
  stats for any symbol, listed or not), `CheckReports`, `LatestReport`,
  `ReadReport` (every report read goes through it — WebFetch can't open
  sec.gov or read PDFs), `SaveReport {symbol, period, form, filed, url,
  summary}` — the one writer of `reports.json`, used by chat and the mission
  alike. Args render as `key={{key}}` so an omitted one can't shift the rest.
- `allowed-tools` += `WebSearch` (finding a TSX release), `WebFetch` (news).
- Runbook: SKILL.md § 9 "Company reports".
- Remove "never give investment/securities advice or tell the user what to
  buy/sell". No limits on opinions (Hanli, 2026-09-15). Numbers still come
  from the tools, never invented.
- Holdings from chat: `PageUpdate body.holdings:[…]` proposals, confirmed on
  the page — same path as category suggestions.

## Report mission (missions/reports/mission.md)

- A skill mission (`linggen/doc/mission-spec.md`, "Skill missions"), id
  `cfo:reports`: `schedule: "0 9,18 * * 1-5"`, `catchup_hours: 12`,
  `enabled: false`, `kickoff-stop: [DONE]`.
- `cwd: ~/.linggen/skills/cfo` — the skill's own `edit` grant covers it, so
  the run's tools (all `tier: read`) never stop to ask. CFO's tools come with
  the skill; `allowed-tools` adds `WebSearch`, `WebFetch`.
- Runbook: `CheckReports` → empty → reply `DONE`. Otherwise `Investments`
  once (who holds what), then each item: `ReadReport` (`WebSearch` first for
  a TSX release) → `SaveReport`; not out yet → skip, the next run retries.
  Final reply: `SYMBOL: saved` / `SYMBOL: not out yet` lines, then `DONE`. No
  `AskUser`, no `PageUpdate`.
- **Settings → Company reports → Tell me when a report comes out** reads
  `GET /api/missions` and flips it with `PUT /api/missions/cfo:reports
  {enabled}`; the engine keeps the choice in
  `~/.linggen/missions/cfo:reports/user.json`, so the Missions page shows the
  same setting. The row shows the last run's time.
- On the Mac, Yinyue's watch hears only the mission's name and status when a
  run ends, so she stays silent; telling the user what a company reported is
  the phone's job (below).

## Alerts

- The phone's CFO sync reads `reports.json` in its one round-trip. A summary
  the phone has not told → CFO line `report` (tier: for the record): Yinyue
  writes one line from `{company, results_for, published, summary}` and it
  goes to her thread, and to the morning line when the phone is closed. The
  first sync only learns the backlog; at most three a line; saved within 14
  days. Her model unreachable → nothing marked, the next sync asks again
  (Hanli, 2026-09-16). Arrives on the nightly wake or when the app opens — no
  push (APNs doorbell deferred). `save-report` stores the company `name` so
  the phone can say it.

## Phone (release 2)

- CFO's fifth section, **Investments** (`cfo_investments_screen.dart`): add a
  ticker, totals per currency, rows with price · day move · holding value and
  gain, ⋯ / long-press = one menu (Open company, Edit holding / Add shares,
  Remove with a confirm). Tap → company page: numbers, earnings date, the
  holding, report summaries from the last sync with a Source link.
- Holdings are `inv:` cells in the phone's CFO store (`setInvestmentField`,
  `investments` projection) and travel with the existing sync.
- Numbers: `cfo_market.dart` ports market.pl's quotes/stats (stockanalysis.com,
  devalue) in Dart; `cfo_investments.dart` caches them in the phone's own
  `cfo/quotes.json`, refreshed on open, on resume and every 5 min on screen.
- Summaries: the sync's `companyReports`, kept in prefs so a company page reads
  them with no Mac in reach.

## MVP order

1. ~~Engine: skill missions (discovery, user-owned enabled/schedule, skill
   tools in the run)~~ — built, linggen `998793f`
2. ~~`market.pl` quotes/stats + holdings cells + the tab (list, add/edit,
   refresh)~~ — built
3. ~~Company card + `reports-check` + `SaveReport` + both report buttons~~
   — built
4. ~~SKILL.md tools; advice rule removed~~ — built (holdings proposals from
   chat not yet)
5. ~~`missions/reports` + the settings switch~~ — built
6. ~~Phone: pull `reports.json` + the `report` line~~ — built
7. ~~Release 2: native phone Investments view~~ — built

Deferred: brokerage statement import, APNs doorbell, exchanges beyond US/TSX.
