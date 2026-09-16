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
  [{period, form, filed, url, summary, saved_at}]}}}`, newest first.
  `summary` is short markdown, one fact per line: a bold period headline
  (revenue, EPS against a year ago), 2–4 `- ` bullets led by a bold label, and
  a `**Take:**` line — only bold, bullets and line breaks, which the Mac card
  and the phone's company page render (escaped text otherwise). `since`
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
  no url. ETFs have none. Two releases for one quarter (Tesla's deliveries
  update, then its results, both item 2.02) → the later one.
- `reports-check [SYMBOLS]` (default: the register's holdings) — reports
  filed on or after the symbol's `since` with no summary saved from that
  filing or a later one for their period (a deliveries update saved first
  doesn't cover the results filed after it); the
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
- Holdings from chat: `PageUpdate body.holdings:[…]`, one item per trade or
  position — `{symbol, shares, avg_cost?, account?}` (as it stands; 0 = sold
  all), `{symbol, bought, price?}`, `{symbol, sold}`, or `{symbol}` (watch).
  The page validates, does the math (share count, average cost) against the
  register when the proposal arrives, and shows a **From chat** card on the
  tab (switching to it): one row per symbol, before → after, Apply / ✕,
  Apply all / Dismiss. Only Apply writes `inv:` cells. A ticker with no
  listing can't be applied. Proposals live in the page, not on disk.

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
4. ~~SKILL.md tools; advice rule removed; holdings proposals from chat~~
   — built
5. ~~`missions/reports` + the settings switch~~ — built
6. ~~Phone: pull `reports.json` + the `report` line~~ — built
7. ~~Release 2: native phone Investments view~~ — built

Deferred: brokerage statement import, APNs doorbell, exchanges beyond US/TSX.

## The Watch — the morning brief (paid)

The killer feature (Hanli, 2026-09-16). Every night CFO checks everything that
touches the user's money and ranks it by the dollars at stake for them. In
the morning Yinyue says at most three lines; nothing that matters → silence.
A broker's AI digest (Robinhood Cortex) sees one account and sells trades;
the Watch sees every holding and the bank ledger, stays private, and has
nothing to sell. The tab stays free; the Watch is the subscription.

**His calls:** morning brief only in v1 (no intraday alerts); a line is what
happened + the user's stake — Ling's view is one tap away in chat, never in
the line; a watched-only ticker gets a line only for its own big event, and
only in a slot holdings left free.

**Lines held:** no price predictions; no trade instructions; a securities
lawyer's read before charging for it.

### Pipeline

1. **Find** — `market.pl watch-scan`, zero LLM, run by the mission ~01:00
   (before the phone's 02:00 wake; an asleep Mac catches up). Events since
   the last run, each with a stable `id`:
   - `move` — a session's change ≥ 2.5× the stock's typical daily move
     (standard deviation of the last 60 sessions) and ≥ 2%; the position's
     real dollar change rides along. `high_52w` / `low_52w` — a close past
     the 52-week range, when the last break was 20+ sessions ago.
   - `earnings` — results due today or tomorrow.
   - `analyst` — consensus rating changed, or the price target moved ≥ 5%,
     against the snapshot from before the window (`data/watch-scan.json`).
   - `filing` — an 8-K by item (results, officer change, restatement,
     impairment, deal, bankruptcy…; exhibit-only filings skipped), SC 13D.
   - `insider` — a Form 4 open-market sale ≥ $1M or purchase ≥ $100K, with
     who, and whether it was a pre-planned (10b5-1) sale.
   - `news` — headlines from the stock's page since the window.
   ETFs: moves and news only. Economy and US policy, no symbol (`scope:
   economy`), all public and keyless:
   - `rate` — the Fed's target range (New York Fed daily EFFR) or the Bank
     of Canada's rate (Valet `V39079`) changed inside the window.
   - `fed` — an FOMC statement or minutes (the Fed's monetary press feed).
   - `fomc` — a decision today or tomorrow (the Fed's calendar page; `*` =
     new projections).
   - `data` — a CPI or jobs month newer than the snapshot from before the
     window (BLS API v1, one request a scan): CPI month and year change,
     payrolls change, unemployment.
   - `fx` — a USD/CAD day ≥ 0.5% and 2.5× its usual (Valet `FXUSDCAD`); the
     scan's `home` currency (config.json) says which side the user is on.
   - `policy` — Federal Register documents in the window: presidential
     documents (observances and routine emergency renewals left out),
     significant rules, and export-control (BIS) and trade-representative
     actions; at most 25 a scan.
2. **Judge** — Ling reads only the candidates: which holdings, materiality
   (high / medium / low), one factual sentence, source. No predictions.
3. **Rank** — code: a move's stake is the position's real change; any other
   event's is position value × materiality weight. Speaks for high on any
   holding, medium on a holding ≥ 10% of its currency's total, or results
   today/tomorrow; Quiet / Normal / Everything moves the bar. Top three,
   holdings first.
4. **Tell** — phone: Yinyue writes the morning line from the facts, tap →
   CFO chat. Mac: a Watch feed on the Investments tab (7 days, sources).

### Build order

1. ~~`market.pl watch-scan`: company finders (moves, 52-week, earnings,
   analysts, filings, insiders, news) + tests~~ — built. `watch-scan
   [--since=TIME] [SYM…]` → `{since, scanned_at, positions{SYM: {name, kind,
   currency, shares, price, value, weight_pct}}, events[{id, symbol, kind,
   at, …}], failed, checked}`; `since` defaults to `watch.json` `last_run`,
   else 36 h back; events in `watch.json` `seen` are left out.
2. ~~Economy and policy finders~~ — built.
3. ~~`cfo:watch` mission: scan → Ling judges → `SaveWatch` → `data/watch.json`;
   ranking in code~~ — built. `missions/watch` (`0 1 * * *`, catch-up 20 h,
   off): `WatchScan` → a judgment per event `{id, materiality, holdings,
   line}` (repeats of one story → the clearest, the rest `none`; at most 3
   `ReadReport`s) → one `SaveWatch`. `watch-scan` keeps what it printed in
   `data/watch-candidates.json`; `save-watch` takes only ids, materiality,
   economy holdings and the line from Ling — facts, positions and stakes come
   from the scan — and every candidate becomes `seen`, judged or not.
   `data/watch.json` = `{last_run, seen{id: day} (30 d), items[event + {
   materiality, line, holdings, held, currency, stake, stake_pct, weight_pct,
   saved_on}] (7 d), briefs{day: {made_at, level, lines[id], quiet}} (14 d)}`.
   Stake: a move's real change; a USD/CAD day's real change on holdings in
   the other currency; else value × 10% / 3% / 1% (high / medium / low).
   Level from `config.json` `watch_level` (default normal). Chat may call
   `WatchScan`, never `SaveWatch`.
4. Mac Watch feed + the setting.
5. Phone: sync `watch.json`, Yinyue's morning line, tap → chat.
6. A week on real holdings: measure tokens, then set the price.
