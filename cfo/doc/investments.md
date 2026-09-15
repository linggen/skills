# Investments module — spec

A Stocks-style tab in CFO: a watchlist and holdings (stocks and ETFs, US and
TSX), live numbers, company reports read by the agent, and an optional alert
when a watched company reports. Local-first — public pages fetched from the
Mac; no Linggen Cloud, no data-provider key.

## Data (data/)

- Holdings are register cells in `edits.json`: `inv:<symbol>|watch` (true),
  `|shares`, `|avg_cost`, `|account` (free label: TFSA, RRSP, Margin…). Symbol
  is `AAPL` (US) or `RY.TO` (TSX). One cell per field, so the phone merges them.
- `investments.json` — the agent's copy, written by the page after every edit
  and refresh: `{updated_at, holdings[{symbol, name, shares, avg_cost, account,
  currency, price, value, gain, gain_pct}], watchlist[symbol]}`.
- `quotes.json` — `{symbols: {SYM: {price, change, change_pct, prev_close,
  high_52w, low_52w, market, price_time, name, kind, pe, forward_pe,
  market_cap, earnings_date, earnings_on, dividend, dividend_yield, aum,
  expense_ratio, cik, quote_at, stats_at}}}`.
- `reports.json` — per symbol `[{period, form, filed, url, summary,
  saved_at}]`, plus `last_checked`.

## Market tool (scripts/market.pl — zero LLM, Perl core + curl)

- `quotes <symbols>` — price and day change, from
  `stockanalysis.com/api/quotes/{s|e}/<sym>` (US stock, then ETF) or
  `a/tsx-<sym>`. `stats [--fresh] <symbols>` — name, kind, P/E, forward P/E,
  market cap, earnings date, ETF expense ratio, from the overview page's
  `__data.json` (SvelteKit devalue), cached 20 h. Merges into `quotes.json`
  under a lock, prints JSON.
- `reports-check` — US: SEC EDGAR submissions (ticker → CIK from
  `company_tickers.json`, cached) for 10-Q, 10-K and 8-K item 2.02 filed after
  `last_checked`. TSX: `earnings_date` passed with no stored report for that
  period. ETFs skipped. Prints only what's new; `[]` = nothing new.
- Yahoo Finance answers 429 to plain requests (tested 2026-09-15) — not a
  source. SEC needs a descriptive `User-Agent`. Stats at most daily per symbol.

## UI (cfo.html / cfo.js — no new page)

- New tab `data-view="invest"` **Investments**, same pattern as Commitments.
- List: symbol, name, a P/E · Fwd P/E · Earnings line, price, day change;
  holdings add value and gain, with totals per currency on top. Add by ticker;
  edit shares / avg cost / account inline; remove from the row's ⋯ menu
  (right-click opens the same menu). Page module `investments.js`.
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
  Its tools need `tier: read` — a mission run is non-interactive and an
  untiered skill tool defaults to admin.
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

1. ~~Engine: skill missions (discovery, user-owned enabled/schedule, skill
   tools in the run)~~ — built, linggen `998793f`
2. ~~`market.pl` quotes/stats + holdings cells + the tab (list, add/edit,
   refresh)~~ — built
3. Company card + `reports-check` + `SaveReport` + both report buttons
4. SKILL.md tools; advice rule removed
5. `missions/reports` + the settings switch
6. Phone: pull `reports.json` + the `report` line
7. Release 2: native phone Investments view

Deferred: brokerage statement import, APNs doorbell, exchanges beyond US/TSX.
