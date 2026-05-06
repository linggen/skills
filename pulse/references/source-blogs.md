# Curated Source Blogs

Personal blogs and engineering writing the pulse skill scans for
external context beyond HN / lobste.rs / arxiv. The list is
opinionated: writers with consistent technical depth, not aggregator
sites.

The agent fetches the latest 1-3 posts from each (via WebFetch) and
checks for theme overlap during Phase 3. Cap: 5 URLs total per run
to keep the scan bounded.

**Keep this list curated** — adding aggregators (Medium top page,
Substack featured) defeats the point. Add a blog only if you've
read multiple posts and trust the writer's depth.

## Always-scan (high-signal)

- https://jvns.ca/ — Julia Evans, debugging + systems explainers
- https://danluu.com/ — Dan Luu, deep technical writing on systems
- https://www.hillelwayne.com/post/ — Hillel Wayne, formal methods
- https://www.brendangregg.com/blog/ — Brendan Gregg, performance
- https://lwn.net/ — Linux Weekly News, kernel + systems
- https://research.swtch.com/ — Russ Cox, programming languages
- https://blog.cloudflare.com/ — Cloudflare engineering
- https://tigerbeetle.com/blog/ — Tigerbeetle, distributed systems
- https://www.factorio.com/blog/ — Factorio, game engine internals
- https://fasterthanli.me/ — Amos, Rust + systems

## Domain-specific (scan when theme matches)

### AI / agents

- https://simonwillison.net/ — Simon Willison, LLM tooling, daily
- https://lilianweng.github.io/ — Lilian Weng, ML research surveys
- https://eugeneyan.com/ — Eugene Yan, applied ML

### Systems / Rust

- https://without.boats/blog/ — withoutboats, async Rust
- https://matklad.github.io/ — matklad, Rust tooling internals
- https://os.phil-opp.com/ — Philipp Oppermann, OS in Rust

### Indie engineering / build-in-public

- https://levels.io/ — Pieter Levels, indie founder essays
- https://www.marckohlbrugge.com/ — Marc Lou, indie hacker
- https://kentcdodds.com/blog — Kent C. Dodds, web dev

## Notes for the agent

- Don't WebFetch all URLs every run. Cap at 5 total per scan; pick
  the ones whose homepage HTML mentions the theme keyword.
- If a blog hasn't published in 30+ days, skip it.
- Prefer the *latest* post over a topical match — readers care about
  what's currently being discussed, not 2-year-old posts.
- If a blog's RSS / archive page reveals the latest post is itself
  promotional (own product, conference talk announcement), skip.
