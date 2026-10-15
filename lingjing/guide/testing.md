# Testing — a scratch save at any point of the story

<!-- Dev/test guide, not a Ling topic (rules/guide.mjs does not hand it). -->

One test agent per 回, all at once: seed a scratch save straight at the point you test.

```sh
node scripts/rules.mjs seed --save=t-gu5 --at=古五        # → wm-mijing, ~0.2 s
node scripts/rules.mjs seed --save=t-mj --at=秘境 --policy=skip
node scripts/rules.mjs seed --save=t-x --at=wm-lun2 --route=strike,argue
```

- `--at`: a scene id (`wm-mijing`), a 回 id (`h07`, `j04`, an absorbed `h03`), `古一`…`古九`, `今一`…`今四`, `第五回`, or `秘境` (the sealed instance's entry). A 回 seeds at its first scene.
- It starts fresh and plays forward through the rules only (no browser): the first way on (a declared `default` first), every board won with the top grade, or left with `--policy=skip` (also `--grades=skip`), every fight won through the rules' settle, the 今 played, guarded rooms cleared, and a real day waited where the story asks one (the scratch clock shifts, like `shift`).
- `--route=exit,exit` takes those ways, in order, each at the first scene that offers it; a way never offered fails the seed. `--from=<fixture>` starts from a fixture instead of fresh.
- It prints one JSON line: scene, place, realm, 修为 (`xiuwei`), 灵石 (`lingshi`), days shifted. The save is what a player would hold: bag, cards, marks, 修为 and 灵石 from the road. It writes only `data/saves/<name>/`.
- It fails loudly: `{"refused":"cannot-advance","scene":…,"why":…}`, exit code 1.
- Open it on the page: `index.html?save=<name>`.
- From code: `playTo(content, state, target, {now, policy, route})` in `scripts/rules/progress.mjs` (also exported by `scripts/rules.mjs`), in memory. `tests/seed-at.test.mjs` checks every 回 of 卷一.
