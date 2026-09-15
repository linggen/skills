# Investments module — spec

A Stocks-style tab in CFO: a watchlist and holdings (stocks and ETFs, US and
TSX), live numbers, company reports read by the agent, and an optional alert
when a watched company reports. Local-first — public pages fetched from the
Mac; no Linggen Cloud, no data-provider key.

## Data (data/)

- `investments.json` — `watchlist[] {symbol, exchange: US|TSX, name}` and
  `holdings[] {symbol, shares, avg_cost, account?}` (account = free label:
  TFSA, RRSP, Margin…). A holding is always on the watchlist. Page writes it
  via /api/bash, same as corrections.
- `quotes.json` — per symbol `{price, change, change_pct, currency, pe,
  forward_pe, market_cap, earnings_date, as_of, source}`.
- `reports.json` — per symbol `[{period, form, filed, url, summary,
  saved_at}]`, plus `last_checked`.

## Market tool (scripts/market.sh — zero LLM)

- `quotes <symbols>` — price and day change. `stats <symbols>` — P/E, forward
  P/E, market cap, earnings date. Source: stockanalysis.com (US
  `/stocks/<sym>/`, TSX `/quote/tsx/<SYM>/`). Merges into `quotes.json`,
  prints JSON.
- `reports-check` — US: SEC EDGAR submissions (ticker → CIK from
  `company_tickers.json`, cached) for 10-Q, 10-K and 8-K item 2.02 filed after
  `last_checked`. TSX: `earnings_date` passed with no stored report for that
  period. ETFs skipped. Prints only what's new; `[]` = nothing new.
- Yahoo Finance answers 429 to plain requests (tested 2026-09-15) — not a
  source. SEC needs a descriptive `User-Agent`. Stats at most daily per symbol.

## UI (cfo.html / cfo.js — no new page)

- New tab `data-view="invest"` **Investments**, same pattern as Commitments.
- List: symbol, name, price, day change; holdings add value and gain, with a
  total row on top. Add by ticker; edit shares / avg cost / account inline;
  remove from the row's ⋯ menu.
- Refresh: quotes on open and every 5 min while the tab is visible; stats
  daily.
- Company card (click a row): the numbers, next earnings date, report
  summaries newest first, **Latest report** button.
- Header **Check reports**: runs `reports-check`. Empty → "Nothing new since
  <date>", no model call. Otherwise a hidden prompt hands the new items to the
  CFO agent.
- Settings: **Tell me when a report comes out** → turns mission `cfo:reports`
  on/off through the missions API.

## Agent layer (SKILL.md)

- Tools: `Investments` (the three files), `Market` (quotes + stats for any
  symbol, listed or not), `CheckReports`, `SaveReport {symbol, period, form,
  filed, url, summary}` — the one writer of `reports.json`, used by chat and
  the mission alike.
- `allowed-tools` += `WebSearch`, `WebFetch` — reading reports and news.
- Remove "never give investment/securities advice or tell the user what to
  buy/sell". No limits on opinions (Hanli, 2026-09-15). Numbers still come
  from the tools, never invented.
- Holdings from chat: `PageUpdate body.holdings:[…]` proposals, confirmed on
  the page — same path as category suggestions.

## Report mission (missions/reports/mission.md)

- A skill mission (`linggen/doc/mission-spec.md`, "Skill missions"):
  `schedule: "0 9,18 * * 1-5"`, `catchup_hours: 12`, `enabled: false`.
- Runbook: `CheckReports` → empty → end `DONE`. Otherwise read each item
  (`WebFetch` the filing or release, `WebSearch` for TSX results) →
  `SaveReport`. No `AskUser`, no `PageUpdate`.

## Alerts

- The phone's CFO sync pulls `reports.json`. A summary not yet told → CFO line
  `report` (tier: for the record) → Yinyue writes it from `{company, period,
  filed, summary}`. Arrives on the nightly wake or when the app opens — no
  push (APNs doorbell deferred).

## Phone (release 2)

- Native Investments view; fetches quotes itself from the same sources.
  Holdings sync through `data/edits.json` (`inv:` keys, LWW); summaries read
  from the Mac.

## MVP order

1. Engine: skill missions (discovery, user-owned enabled/schedule, skill
   tools in the run) + catch-up from the scheduler tick
2. `market.sh` quotes/stats + `investments.json` + the tab (list, add/edit,
   refresh)
3. Company card + `reports-check` + `SaveReport` + both report buttons
4. SKILL.md tools; advice rule removed
5. `missions/reports` + the settings switch
6. Phone: pull `reports.json` + the `report` line
7. Release 2: native phone Investments view

Deferred: brokerage statement import, APNs doorbell, exchanges beyond US/TSX.
