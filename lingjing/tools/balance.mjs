// balance.mjs — one model for every number (Hanli, 2026-10-15; design.md § Pacing and the economy).
//
// `node tools/balance.mjs` reads worlds/jiuding/balance.json (as the rules do, through
// content.mjs withBalance) and plays 卷一 day by day for three players — light, typical, heavy
// (balance.json `model.players`) — printing the days each 回 takes. The target: about 30 minutes
// a day and one 回 a week; the story is the reward; 古一–古三 fast.
//   --fit     re-derives the 练气 thresholds the 回s' stage quests hold him on, so `model.fit.player`
//             meets `model.fit.days`, and writes them into balance.json `layers.qi`
//             (the 层 a rise jumps over sit between their neighbours);
//   --json    the rows as JSON.
// tests/balance.test.mjs holds the bands (`model.bands`).
//
// A day, as the model plays it (every number from balance.json `model` or the world's data):
//   - the routine first, where it stands open and once past 零层 (it takes no 修为): the day's 功课
//     (`pay.gongke`, done on `gongke` of the days); the 秘境 rerun (rules/rerun.mjs: open in its
//     chapter, and the ones its `also` names, once its beat is behind him; one a sitting, its
//     beasts × the fight win rate); pool fights (a pool on the map: one win per pool per
//     `cooldowns.pool_rest_min` of a sitting); the 饭桶 (once he holds it: `fantong_progress` a
//     feed, one an hour); 今日传闻 where the map is not walled (a heavy player's: the `tale` cap);
//     闭关 overnight (`seclude` hours, focus 修为, the rules' rate and its table's cap);
//   - every fight win pays the haunt table's 修为 — at the full mark of a layer he may not grind
//     past (the 回's cap, a stage quest ahead), 灵石 instead; the day's limit is 体力 alone;
//   - then the story, minute by minute: a scene's passages at `chars_per_min`, its boards, its
//     fight; its boards' and its way on's grants, its pills, its rises (no story floor), the
//     sealed rooms' play, the 回's errands (`errands_at`); a way on behind a stage quest
//     (ladder.json caps.hui gates) waits until the layer is full;
//   - minutes left while it waits go to more pool fights, as the pool's rest allows;
//   - 体力 ON, as players will have it: full after the night, refilled between sittings
//     (`waking_h` spread over the sittings), a fight, a story step and a board its rewards.json
//     price — out of it, the sitting stops. (While we test the switch is off: rules.mjs.)
// Days per 回: from the day its first scene is reached to the day its last is done (fractional,
// by the minutes used). The routine's 灵石, items and finds are not modelled — 修为 is the clock.
// Grinding stops where the 回's cap says — and, while a stage quest is ahead, at its layer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { runsPay } from '../scripts/rules/rerun.mjs';
import { gatesOf } from '../scripts/rules/gates.mjs';
import { huiOf } from '../scripts/rules/hui.mjs';

const sideHui = (content, id) => { const h = huiOf(content, id); return Boolean(h?.line && h.line !== 'gu'); };

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BALANCE_FILE = path.join(HERE, '../worlds/jiuding/balance.json');

const chars = x => (typeof x === 'string' ? x.length : x?.zh?.length ?? 0);
const tableCap = (content, grant) => Math.min(grant?.progress ?? 0, content.rewards.tables[grant?.table]?.progress ?? 0);
const itemOf = (content, id) => content.items.items.find(i => i.id === id);
const breakPills = content => new Set(Object.values(content.ladder.breakthrough?.pill?.items ?? {}).flat());
/* What a thing pays eaten: a pill's capped `progress`; a breakthrough pill is kept for the throw. */
const pillOf = (content, id) => { const e = itemOf(content, id)?.effect; return id && e?.progress && !breakPills(content).has(id) ? tableCap(content, e) : 0; };
/* What an errand pays toward 修为: its grant's, and the pill it hands over. */
export const errandPays = (content, q) => tableCap(content, q.grant) + pillOf(content, q.grant?.item);
const placeById = content => { const m = new Map(); for (const d of Object.values(content.places)) for (const p of d.places) m.set(p.id, p); return m; };

/* A sealed instance's rooms, per 回 it is entered in: its first scene inside and what its rooms pay
   — `story` (a guarded room's board: on the way, for everyone), `boards` (the other boards, once
   each), `fights` (the guard's wins and one at each other pool room). Read from the data. */
export function roomsPay(content) {
  const out = {}, places = placeById(content), taskOf = id => content.tasks.tasks.find(t => t.id === id);
  for (const ch of Object.values(content.chapters).filter(c => c.juan === 1)) {
    for (const b of (ch.beats ?? []).filter(x => x.sealed)) {
      const first = b.scenes[1], hui = ch.scenes[first]?.hui, r = { first, story: 0, boards: 0, fights: 0 };
      for (const p of b.sealed.places.map(id => places.get(id)).filter(Boolean)) {
        const g = p.has?.guard, guardTask = g?.task?.id;
        if (g?.won) r.fights += g.won.n;
        if (guardTask) r.story += tableCap(content, taskOf(guardTask)?.grant);
        for (const id of (p.has?.games ?? []).filter(x => x !== guardTask)) r.boards += tableCap(content, taskOf(id)?.grant);
        if (p.has?.pool && !g?.won) r.fights += 1;
      }
      if (hui) out[hui] = r;
    }
  }
  return out;
}

/* The way on a reader takes from a scene: one that leads on, then a breakthrough, a rise, the most pay. */
function wayOn(content, sc) {
  const exits = sc.exits.filter(e => e.next || e.ends || e.rise != null || e.breakthrough || e.grant);
  const score = e => [Boolean(e.next || e.ends), Boolean(e.breakthrough), e.rise != null, tableCap(content, e.grant)];
  return exits.sort((a, b) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return Number(y[i]) - Number(x[i]); return 0; })[0] ?? null;
}

/* 卷一 as a reader meets it, every 回 of it (the prologue's too): each scene with its minutes, what
   it pays, its rise or breakthrough and its stage quest. */
export function bookWalk(content, model = content.balance.model) {
  const m = model.minutes, out = [], gates = gatesOf(content), taskOf = id => content.tasks.tasks.find(t => t.id === id);
  const chapters = Object.values(content.chapters).filter(ch => ch.juan === 1).sort((a, b) => a.id.localeCompare(b.id));
  for (const ch of chapters) {
    const seen = new Set();
    for (let id = ch.first_scene; id && ch.scenes[id] && !seen.has(id);) {
      seen.add(id);
      const sc = ch.scenes[id], e = wayOn(content, sc);
      const boards = (sc.show ?? []).filter(c => c.card === 'board').map(c => taskOf(c.id)).filter(Boolean);
      const fight = e?.game?.kind === 'duel' ? 1 : 0;
      const text = chars(sc.story) + chars(sc.story_after) + chars(e?.story);
      const rise = e?.rise == null ? null : typeof e.rise === 'object' ? e.rise : { layer: e.rise };
      out.push({
        chapter: ch.id, id: sc.id, hui: sc.hui ?? null,
        minutes: text / model.chars_per_min + m.scene + boards.length * m.board + fight * m.fight / model.fight_win_rate,
        boards: boards.reduce((n, t) => n + tableCap(content, t.grant), 0), nboards: boards.length,
        grant: tableCap(content, e?.grant), pill: pillOf(content, e?.grant?.item), pill9: itemOf(content, e?.grant?.item)?.fill === 'full',
        rise, breakthrough: Boolean(e?.breakthrough),
        gate: e ? gates.find(g => g.scene === sc.id && g.exits.includes(e.id)) ?? null : null,
      });
      id = e?.next ?? null;
    }
  }
  return out;
}

/* ── one player through 卷一 ── */
export function play(content, player, { model = content.balance.model, ladder = content.ladder } = {}) {
  const tiers = ladder.tiers, caps = ladder.caps.hui, ratio = ladder.overflow_stretch ?? 0;
  const pay = content.rewards.tables;
  const tierAt = id => tiers.find(t => t.id === id), rank = (tier, step) => tiers.findIndex(t => t.id === tier) * 100 + step;
  const stepOf = (tier, layer) => layer - (tierAt(tier).zero ? 0 : 1);
  const walk = bookWalk(content, model), rooms = roomsPay(content), runs = runsPay(content);
  const quests = new Map(content.quests.map(q => [q.id, q]));
  const places = placeById(content);
  const s = { tier: tiers[0].id, step: 0, progress: 0, stretch: 0, pill9: false };
  const need = () => tierAt(s.tier).thresholds[s.step] + s.stretch;
  const zero = () => tierAt(s.tier).zero && s.step === 0;
  const up = (tier, step, carry, stretch = true) => { const c = Math.max(0, carry); s.tier = tier; s.step = step; s.progress = c; s.stretch = stretch ? Math.round(c * ratio) : 0; };
  let hui = walk[0].hui, capHui = hui, i = 0, done = new Set(), errandsPaid = new Set();
  // The cap where he stands: the 古 回's, a 今 interlude taking the one before it (rules/cap.mjs).
  // …and, while a stage quest of the 回 is ahead, no further than the lowest layer one asks (rules/cap.mjs heldBy).
  const heldBy = c => Math.min(Infinity, ...(c.gates ?? []).filter(g => !done.has(g.scene)).map(g => rank(g.tier ?? tiers[0].id, stepOf(g.tier ?? tiers[0].id, g.layer))));
  const capAt = () => { const c = caps[capHui]; if (!c) return null; const st = c.story ?? c; return { grind: Math.max(Math.min(rank(c.tier, stepOf(c.tier, c.layer)), heldBy(c)), rank(s.tier, s.step)), story: rank(st.tier, stepOf(st.tier, st.layer)) }; };
  /* 修为 in; a fight's past a mark he may not leave is 灵石 (nothing here). */
  const gain = (n, fight = false) => {
    if (n <= 0 || zero()) return;
    s.progress += n * (tierAt(s.tier).pay ?? 1);
    for (;;) {
      if (s.progress < need()) return;
      const top = s.step >= tierAt(s.tier).thresholds.length - 1, cap = capAt();
      if (!top && (!cap || rank(s.tier, s.step + 1) <= cap.grind)) { up(s.tier, s.step + 1, s.progress - need()); continue; }
      if (fight) s.progress = need();
      return;
    }
  };
  const gateMet = g => { const a = rank(s.tier, s.step), b = rank(g.tier, g.step); return a > b || (a === b && s.progress >= need()); };
  let wins = 0;
  const win = n => { for (let k = 0; k < n; k++) { const whole = Math.min(1, n - k); gain(pay.haunt.progress * whole, true); wins += whole; } };
  const chapterOf = () => walk[Math.min(i, walk.length - 1)].chapter;
  const walled = () => Boolean(content.chapters[chapterOf()]?.map?.home);
  const pools = () => {
    const map = content.chapters[chapterOf()]?.map?.places;
    const ids = map ?? [...places.keys()];
    return ids.filter(id => places.get(id)?.has?.pool).length > 0 ? 1 : 0;
  };
  const rerunOpen = () => runs.find(r => (r.chapter === chapterOf() || r.also.includes(chapterOf())) && done.has(r.last)) ?? null;
  const holdsFantong = () => walk.slice(0, i).some(w => w.id === model.fantong_from);
  const rows = new Map(), row = id => { if (!rows.has(id)) rows.set(id, { hui: id, start: null, end: null }); return rows.get(id); };
  const T = model.minutes, Q = content.rewards.stamina;
  let qi = Q.max;
  const spend = c => (qi >= c ? ((qi -= c), true) : false);
  let day = 0;
  /* The day's routine split over its sittings (`k` of `n`): 功课 at the first, a rerun a sitting,
     the fights and feeds spread; the rest of the sitting is the story's. */
  const share = (n, k, of) => Math.floor((n * (k + 1)) / of) - Math.floor((n * k) / of);
  for (; i < walk.length && day < model.max_days; day += 1) {
    const total = day === 0 ? player.first_minutes : player.minutes, n = player.sittings, sit = total / n;
    const poolCap = pools() * (1 + Math.floor(sit / content.balance.cooldowns.pool_rest_min));
    wins = 0;
    for (let k = 0; k < n && i < walk.length; k++) {
      let left = sit, fought = 0;
      // 体力 ON, as players will have it (rewards.json stamina; the switch stays off while testing):
      // full after the night, refilled between sittings spread over the waking day.
      qi = k === 0 ? Q.max : Math.min(Q.max, qi + Q.max * (model.waking_h / n) / Q.refill_hours);
      const at = () => day + (k * sit + (sit - left)) / total;
      if (!zero()) {
        if (k === 0) gain(pay.gongke.progress * player.gongke);
        // 闭关 overnight (rules/seclusion.mjs, focus 修为): `seclude` hours a night, the rules' rate and cap.
        if (k === 0 && day > 0 && player.seclude) gain(Math.min(content.rewards.seclusion.progress_per_hour * Math.min(player.seclude, content.rewards.seclusion.cap_hours), pay.seclusion.progress));
        const run = rerunOpen();
        // A share under one (`reruns` 0.5: every other day) is its expected worth.
        const runs = run ? Math.min(1, player.reruns - k) : 0;
        if (runs > 0 && left >= T.rerun * runs && spend(run.beasts * runs * Q.cost.duel)) { left -= T.rerun * runs; win(run.beasts * model.fight_win_rate * runs); }
        for (let f = 0; f < Math.min(share(player.fights, k, n), poolCap) && left >= T.fight && spend(Q.cost.duel); f++) { left -= T.fight; fought += 1; win(model.fight_win_rate); }
        if (holdsFantong()) for (let f = 0; f < share(player.fantong, k, n) && left >= T.fantong; f++) { left -= T.fantong; gain(model.fantong_progress); }
        if (k === 0 && !walled() && player.tale && left >= T.tale) { left -= T.tale; gain(content.rewards.tale.cap.progress * player.tale); }
      }
      let extra = 0;
      for (;;) {
        let gated = false;
        while (i < walk.length && left > 0) {
          const w = walk[i];
          if (w.hui) hui = w.hui;
          if (caps[hui]) capHui = hui;
          const r = row(w.hui ?? hui);
          if (r.start == null) r.start = at();
          if (w.gate && !gateMet(w.gate)) { gated = true; break; }
          if (left < w.minutes * (1 - (w.read ?? 0))) { w.read = (w.read ?? 0) + left / w.minutes; left = 0; break; }
          // A story step and its boards cost 体力 (a step toward the story's place is free, not counted here).
          if (!w.paid && !spend((content.chapters[w.chapter]?.free ? 0 : Q.cost.step) + w.nboards * Q.cost.game)) { left = 0; break; }
          w.paid = true;
          left -= w.minutes * (1 - (w.read ?? 0));
          // The sealed rooms, entered here: what holds the way, the boards, the fights.
          const room = rooms[w.hui]?.first === w.id ? rooms[w.hui] : null;
          if (room) { gain(room.story + room.boards); win(room.fights * model.fight_win_rate); }
          // The 回's errands, once past 零层: handed in where the 回 is under way.
          for (const [id, h] of Object.entries(model.errands_at)) if (h === w.hui && !errandsPaid.has(id) && quests.has(id) && !zero()) { errandsPaid.add(id); gain(errandPays(content, quests.get(id))); }
          gain(w.boards);
          if (w.pill9) s.pill9 = true;
          if (w.breakthrough) {
            const next = tiers[tiers.findIndex(t => t.id === s.tier) + 1], over = Math.max(0, s.progress - need());
            up(next.id, 0, over);
            if (s.pill9) s.progress = next.thresholds[0] + over;
          }
          if (w.rise) {
            const tier = tiers[0], top = Math.min(stepOf(tier.id, w.rise.layer), tier.thresholds.length - 1), was0 = zero();
            if (s.tier === tier.id && (s.step < top || (w.rise.full && s.step === top))) {
              // No story floor (core.mjs riseTo): what was over the mark goes with him, nothing tops him up.
              if (s.step < top) up(tier.id, top, s.progress - (was0 ? 0 : need()), !was0);
              if (w.rise.full) s.progress = Math.max(s.progress, need());
            }
          }
          gain(w.grant + w.pill);
          done.add(w.id);
          r.end = at();
          i += 1;
        }
        // Waiting on a stage quest: the minutes left go to the pool, as its rest allows — one fight
        // at a time, and the story goes on the moment the layer is full.
        if (!gated || extra >= player.gate_fights || fought + extra >= poolCap || left < T.fight || !spend(Q.cost.duel)) break;
        left -= T.fight; extra += 1; win(model.fight_win_rate);
      }
    }
  }
  // A 今 interlude is the 古 回's before it (as its cap is, rules/cap.mjs): its time goes there.
  const out = [];
  for (const r of [...rows.values()].filter(x => x.hui)) {
    if (sideHui(content, r.hui) && out.length) { out.at(-1).end = r.end ?? out.at(-1).end; continue; }
    out.push({ ...r });
  }
  // A 回's days run from the last one's end to its own (time spent waiting on it counts).
  out.forEach((r, k) => { const prev = k ? out[k - 1].end : 0; r.days = r.end == null ? null : r.end - prev; });
  return { rows: out, end: { tier: s.tier, step: s.step, progress: Math.round(s.progress) }, days: day };
}

/* The three players' days per 回. */
export function table(content, opts = {}) {
  const players = content.balance.model.players;
  const runs = Object.fromEntries(Object.entries(players).map(([k, p]) => [k, play(content, p, opts)]));
  const huis = runs.typical.rows.map(r => r.hui);
  return huis.map(h => ({ hui: h, ...Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, round(r.rows.find(x => x.hui === h)?.days)])) }));
}
const round = x => (x == null ? null : Math.round(x * 10) / 10);

/* The 回s that hold a stage quest, in the book's order, and the layers each holds him on. */
function grindLayers(content) {
  const out = [];
  for (const g of gatesOf(content)) {
    let r = out.find(x => x.hui === g.hui);
    if (!r) out.push(r = { hui: g.hui, layers: [] });
    if (g.tier === content.ladder.tiers[0].id && !r.layers.includes(g.step) && !out.some(x => x !== r && x.layers.includes(g.step))) r.layers.push(g.step);
  }
  return out;
}

/* Re-derive the 练气 thresholds: in the book's order, each 回's layers set (equal, at least the one
   below) so `fit.player` takes `fit.days` there; the 层 jumped over sit between. The heavy player is
   the one a stage quest holds back — the typical one reads a 回 in about as long as it fills. */
export function fit(content) {
  const model = content.balance.model, th = [...content.ladder.tiers[0].thresholds], who = model.players[model.fit.player];
  const ladder = structuredClone(content.ladder), step = model.step_min;
  const daysOf = h => play(content, who, { ladder }).rows.find(r => r.hui === h)?.days ?? Infinity;
  const held = new Set(grindLayers(content).flatMap(r => r.layers));
  // A 层 no stage quest holds (one a rise jumps over): just above the one below it.
  const fill = upTo => { for (let l = 1; l < upTo; l++) if (!held.has(l)) th[l] = th[l - 1] + step; ladder.tiers[0].thresholds = [...th]; };
  for (const { hui, layers } of grindLayers(content)) {
    if (!layers.length) continue;
    const want = model.fit.days[hui] ?? model.fit.days.default;
    const sorted = [...layers].sort((a, b) => a - b);
    fill(sorted[0]);
    let lo = th[sorted[0] - 1] + step, hi = 20000;
    const set = x => { sorted.forEach((l, k) => { th[l] = Math.round(x / 10) * 10 + k * step; }); ladder.tiers[0].thresholds = [...th]; };
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; set(mid); if (daysOf(hui) < want) lo = mid; else hi = mid; }
    set(lo);
  }
  fill(th.length);
  for (let l = 1; l < th.length; l++) th[l] = Math.max(th[l], th[l - 1] + step);
  return th;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const content = loadContent();
  if (process.argv.includes('--fit')) {
    const th = fit(content);
    const raw = JSON.parse(fs.readFileSync(BALANCE_FILE, 'utf8'));
    raw.layers.qi = th;
    fs.writeFileSync(BALANCE_FILE, JSON.stringify(raw, null, 2) + '\n');
    content.ladder.tiers[0].thresholds = th;
    console.log(`练气 ${JSON.stringify(th)} → balance.json`);
  }
  const rows = table(content);
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else {
    console.log(`练气 ${JSON.stringify(content.ladder.tiers[0].thresholds)}`);
    console.log('回     轻   中   重   (days)');
    for (const r of rows) console.log(`${r.hui.padEnd(5)} ${[r.light, r.typical, r.heavy].map(x => String(x ?? '—').padStart(4)).join(' ')}`);
    for (const r of runsPay(content)) console.log(`刷副本 ${r.beat} (${[r.chapter, ...r.also].join(' · ')}, every ${r.every_h} h): ${r.beasts} beasts a run`);
  }
}
