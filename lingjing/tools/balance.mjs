// balance.mjs — one model for every number (Hanli, 2026-10-15; design.md § Pacing and the economy).
//
// `node tools/balance.mjs` reads worlds/jiuding/balance.json (as the rules do, through
// content.mjs withBalance) and plays 卷一 day by day for three players — light, typical, heavy
// (balance.json `model.players`) — printing the days each 回 takes. The target: about 30 minutes
// a day and one 回 a week; the story is the reward; 古一–古三 fast.
//   --fit     retired 2026-10-27: node tools/numbers.mjs --apply derives the 层 from the master table and fits the hours
//   --json    the rows as JSON;
//   --wealth  the 灵石 flow per player.
//   --events  妖兽出没's day per player: its 修为 as a share of the layer, of the day, its 灵石.
// tests/balance.test.mjs holds the bands (`model.bands`).
//
// A day, as the model plays it (every number from balance.json `model` or the world's data):
//   - the routine first, where it stands open and once past 零层 (it takes no 修为): the day's 功课
//     (a share of the layer, `play_pay.chore`, done on `gongke` of the days); pool fights (a pool on the map: one win per pool per
//     `cooldowns.pool_rest_min` of a sitting); the 饭桶 (once he holds it: `fantong_progress` a
//     feed, one an hour); 今日传闻 where the map is not walled (a heavy player's: the `tale` cap);
//     闭关 overnight (`seclude` hours, focus 修为, the rules' rate and its table's cap);
//   - every fight win pays the haunt table's 修为 — at the full mark of a layer he may not grind
//     past (the 回's cap, a stage quest ahead), 灵石 instead (at `convert.rate`); the day's limit is 体力 alone;
//   - then the story, minute by minute: a scene's passages at `chars_per_min`, its boards, its
//     fight; its boards' and its way on's grants, its pills, its rises (no story floor), the
//     sealed rooms' play, the 回's errands (`errands_at`); a way on behind a stage quest
//     (ladder.json caps.hui gates) waits until the layer is full;
//   - minutes left while it waits go to more pool fights, as the pool's rest allows;
//   - inside a sealed instance (a key beat that declares `sealed`, world.mjs sealedOf: from the scene after its entry
//     through its last) the world outside is frozen as the rules freeze it — no 功课, 闭关, 饭桶, 今日传闻, wall tags or
//     errands, and the 妖兽出没 batches stand outside; what pays is the instance's own: its open rooms' pools (the old rest)
//     and the practice boards its rooms host (hosted, not a stall), each at the replay's falling share by the day;
//   - 体力 ON, as players will have it: full after the night, refilled between sittings
//     (`waking_h` spread over the sittings), a fight, a story step and a board its rewards.json
//     price — out of it, the sitting stops. (While we test the switch is off: rules.mjs.)
// Days per 回: from the day its first scene is reached to the day its last is done (fractional,
// by the minutes used). 修为 is the clock; 灵石 runs beside it (a fight's 修为 past the mark at the convert
// rate). The 杂役 errands' and 开府's 灵石 are not played; 执事堂's east-wall tags are (`walls`, 2026-10-27, playWalls).
// Grinding stops where the 回's cap says — and, while a stage quest is ahead, at its layer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { boardPlay, chorePlay, convertRate, fightPlay, playGrant, secludeHour, wallGrant } from '../scripts/rules/playpay.mjs';
const NOW = new Date('2026-10-27T12:00:00Z');
import { gatesOf, roomWorks } from '../scripts/rules/gates.mjs';
import { dayKey, lockedOf } from '../scripts/state.mjs';
import { huiOf } from '../scripts/rules/hui.mjs';

const sideHui = (content, id) => { const h = huiOf(content, id); return Boolean(h?.line && h.line !== 'gu'); };

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BALANCE_FILE = path.join(HERE, '../worlds/jiuding/balance.json');

const chars = x => (typeof x === 'string' ? x.length : x?.zh?.length ?? 0);
const tableCap = (content, grant) => Math.min(grant?.progress ?? 0, content.rewards.tables[grant?.table]?.progress ?? 0);
/* What a grant pays in 灵石, capped by its table as the rules cap it. */
const wealthCap = (content, grant) => Math.min(grant?.wealth ?? 0, content.rewards.tables[grant?.table]?.wealth ?? 0);
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

/* A small game's first clear after 入门 (balance.json `boards`, Hanli 2026-10-16): modelled at its
   good pay, the expectation between a rough clear (plain) and a clean one (best). Nothing where
   wealth is still shut. */
function boardFirst(content, ch, sc, boards) {
  const pay = content.balance.boards?.good ?? 0;
  if (!pay || lockedOf(content, { chapter: ch.id, scene: sc.id }).includes('wealth')) return 0;
  return boards.filter(t => t.game).length * pay;
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
      const side = sideHui(content, sc.hui) ? huiOf(content, sc.hui).line : null;
      out.push({
        chapter: ch.id, id: sc.id, hui: sc.hui ?? null,
        // a board played as a fight (`model.fight_games`: 格斗) takes a fight's minutes and its retries, not a board's
        minutes: text / model.chars_per_min + m.scene + boards.reduce((n, t) => n + ((model.fight_games ?? []).includes(t.game) ? m.fight / model.fight_win_rate : m.board), 0) + fight * m.fight / model.fight_win_rate,
        boards: boards.reduce((n, t) => n + tableCap(content, t.grant), 0), nboards: boards.length,
        // A 今 board pays the 今 line (rules/lines.mjs): never the 古 ledger this walk keeps, nor 灵石 — `line` and its boards
        // (`line_tasks`) are for the 今 column (tools/numbers.mjs). Until 2026-10-28 the model paid them to the 古.
        ...(side ? { line: side, line_tasks: boards } : {}), tasks: side ? [] : boards,
        wealth: wealthCap(content, e?.grant) + (side ? 0 : boards.reduce((n, t) => n + wealthCap(content, t.grant), 0) + boardFirst(content, ch, sc, boards)),
        grant: tableCap(content, e?.grant), pill: pillOf(content, e?.grant?.item), pill9: itemOf(content, e?.grant?.item)?.fill === 'full',
        rise, breakthrough: Boolean(e?.breakthrough), fight,
        gate: e ? gates.find(g => g.scene === sc.id && g.exits.includes(e.id)) ?? null : null,
      });
      id = e?.next ?? null;
    }
  }
  return out;
}

/* ── one player through 卷一 ── */
/* The sealed beat that holds scene `id` (world.mjs sealedOf: past its entry), or null. */
export function sealedBeat(content, id) {
  for (const ch of Object.values(content.chapters)) for (const b of ch.beats ?? []) if (b.sealed && b.scenes.indexOf(id) > 0) return { ...b.sealed, beat: b.id };
  return null;
}

export function play(content, player, { model = content.balance.model, ladder = content.ladder } = {}) {
  const tiers = ladder.tiers, caps = ladder.caps.hui, ratio = ladder.overflow_stretch ?? 0;
  const pay = content.rewards.tables;
  const tierAt = id => tiers.find(t => t.id === id), rank = (tier, step) => tiers.findIndex(t => t.id === tier) * 100 + step;
  const stepOf = (tier, layer) => layer - (tierAt(tier).zero ? 0 : 1);
  const walk = bookWalk(content, model), rooms = roomsPay(content);
  const quests = new Map(content.quests.map(q => [q.id, q]));
  const places = placeById(content);
  const s = { tier: tiers[0].id, step: 0, progress: 0, stretch: 0, pill9: false };
  const need = () => tierAt(s.tier).thresholds[s.step] + s.stretch;
  const zero = () => tierAt(s.tier).zero && s.step === 0;
  const up = (tier, step, carry, stretch = true) => { const c = Math.max(0, carry); s.tier = tier; s.step = step; s.progress = c; s.stretch = stretch ? Math.round(c * ratio) : 0; };
  let hui = walk[0].hui, capHui = hui, i = 0, done = new Set(), errandsPaid = new Set();
  // The cap where he stands: the 古 回's, a 今 interlude taking the one before it (rules/cap.mjs).
  // …and, while a stage quest of the 回 is ahead, no further than the lowest layer one asks (rules/cap.mjs heldBy).
  // A gate on a way the walk does not take (腊八, a stay before 入秋 in the same scene) is passed with the one it does.
  const walked = new Set(walk.filter(w => w.gate).map(w => `${w.gate.scene}/${w.gate.exits[0]}`));
  // A hold of the 回 (`holds`, rules/cap.mjs): no further than its layer until the story reaches its scene.
  const reached = id => done.has(id) || walk[Math.min(i, walk.length - 1)].id === id;
  const heldBy = c => Math.min(Infinity, ...(c.gates ?? []).filter(g => !done.has(g.scene) && walked.has(`${g.scene}/${g.exits[0]}`)).map(g => rank(g.tier ?? tiers[0].id, stepOf(g.tier ?? tiers[0].id, g.layer))),
    ...(c.holds ?? []).filter(h => !reached(h.until)).map(h => rank(h.tier ?? tiers[0].id, stepOf(h.tier ?? tiers[0].id, h.layer))));
  const capAt = () => { const c = caps[capHui]; if (!c) return null; const st = c.story ?? c; return { grind: Math.max(Math.min(rank(c.tier, stepOf(c.tier, c.layer)), heldBy(c)), rank(s.tier, s.step)), story: rank(st.tier, stepOf(st.tier, st.layer)) }; };
  /* 修为 in; a fight's past a mark he may not leave is 灵石 (nothing here). */
  /* `table`: a routine table balance.json `layer_pay` scales by the layer he stands on. */
  const lp = content.balance.layer_pay;
  const layerPay = table => (lp && (lp.tables ?? []).includes(table) ? lp[s.tier]?.[s.step] ?? 1 : 1);
  /* `src`: where it came from, for the day's ledger (a routine's share). Returns a fight's 修为 past the mark (圆满 → 灵石). */
  const gain = (n, fight = false, table = null, src = 'story') => {
    if (n <= 0 || zero()) return 0;
    // What the book authors (a scene's, a board's, a pill's, an errand's 修为) is a share of 练气一层 (play_pay.authored,
    // core.mjs amountsOf): read at the layer he stands on. The routines (功课, a fight, 闭关) come in already sized.
    const base = content.balance.play_pay?.authored?.base, scale = table === null && base ? need() / base : 1;
    const add = n * scale * (tierAt(s.tier).pay ?? 1) * layerPay(table);
    s.progress += add;
    for (;;) {
      if (s.progress < need()) break;
      const top = s.step >= tierAt(s.tier).thresholds.length - 1, cap = capAt();
      if (!top && (!cap || rank(s.tier, s.step + 1) <= cap.grind)) { up(s.tier, s.step + 1, s.progress - need()); continue; }
      if (fight) { const over = Math.min(add, s.progress - need()); s.progress = need(); book(D.xw, src, add - over); return over; }
      break;
    }
    book(D.xw, src, add);
    return 0;
  };
  /* Full where he may not step on: the 回's cap or a stage quest ahead (a fight's 修为 there is 灵石). */
  const held = () => { if (s.progress < need()) return false; const top = s.step >= tierAt(s.tier).thresholds.length - 1, cap = capAt(); return top || (cap && rank(s.tier, s.step + 1) > cap.grind); };
  const gateMet = g => { const a = rank(s.tier, s.step), b = rank(g.tier, g.step); return a > b || (a === b && s.progress >= need()); };
  let wins = 0;
  /* 灵石 (2026-10-16, Hanli: 灵石 buys pills): what comes in (a story step's and a board's grants, a
     fight won at a haunt, the day's 功课, an errand) and the pills a fight takes out — `pills` a fight
     at the shelf's mean price, bought only with what he has, so nobody goes broke. */
  const W = { now: 0, earned: 0, spent: 0, low: 0, pills: 0 };
  const priceOf = id => content.items.items.find(x => x.id === id)?.buy ?? 0;
  const pillPrice = ((model.pills_bought ?? []).reduce((n, id) => n + priceOf(id), 0) / Math.max(1, (model.pills_bought ?? []).length)) || 0;
  const earn = (n, src = 'story') => { if (n > 0) { W.now += n; W.earned += n; book(D.ls, src, n); } };
  const takePills = fights => {
    const want = (player.pills ?? 0) * fights, can = pillPrice ? Math.min(want, W.now / pillPrice) : 0;
    W.now -= can * pillPrice; W.spent += can * pillPrice; W.pills += can; W.low = Math.min(W.low, W.now);
  };
  // A fight's 修为 past the mark he may not leave is 灵石 at the convert rate (rules/core.mjs pay).
  // Read at the layer he stands on (playpay.mjs convertRate: 灵石 per 修为 at 练气一层, the same 灵石 at every layer).
  const converts = (content.rewards.xiuwei_to_lingshi?.tables ?? []).includes('haunt');
  // `mult`: the 冷却事件's day share on top (妖兽出没's third batch of a day half, rules/events.mjs eventShare).
  const win = (n, src = 'pool', mult = 1) => { for (let k = 0; k < n; k++) { const whole = Math.min(1, n - k); const rate = converts ? convertRate(content, { ...s, need: need() }) : 0; earn(rate * gain((fightPlay(content, { ...s, need: need() }) ?? pay.haunt.progress) * whole * mult, true, 'haunt', src), src); wins += whole; } earn((pay.haunt.wealth ?? 0) * n * mult, src); takePills(n / model.fight_win_rate); };
  /* 妖兽出没 (rules/yaoshou.mjs, balance.json `events.yaoshou`): on a chapter map whose pools are all the event's (卷一's
     外门 and 沉鼎观), the pool's fights come in batches of `batch`, the next `every_h` hours after the last is fought out;
     the sittings spread over the waking day (`waking_h`), each at its own hour. Elsewhere the old rest (`pool_rest_min`). */
  const EV = content.balance.events?.yaoshou, evPools = new Set(EV?.pools ?? []);
  const batched = () => {
    if (inside()) return false;
    const map = content.chapters[chapterOf()]?.map?.places;
    const ps = EV && map ? map.map(id => places.get(id)?.has?.pool).filter(Boolean) : [];
    return ps.length > 0 && ps.every(p => evPools.has(p));
  };
  const E = { at: -Infinity, taken: 0, day: -1, n: 0 };
  const evToday = () => (E.day === day ? E.n : 0);
  const evShare = () => { const fall = content.balance.play_pay?.replay ?? [1]; return evToday() < EV.full ? 1 : fall[Math.min(evToday() - EV.full + 1, fall.length - 1)]; };
  /* Fights left in the batch at hour `h` (Infinity where the map's pools are not batched). */
  const evLeft = h => (batched() ? (h >= E.at + EV.every_h ? EV.batch - E.taken : 0) : Infinity);
  const evFight = h => { if (!batched()) return; E.taken += 1; if (E.taken >= EV.batch) { E.n = evToday() + 1; E.day = day; E.at = h; E.taken = 0; } };
  const chapterOf = () => walk[Math.min(i, walk.length - 1)].chapter;
  const walled = () => Boolean(content.chapters[chapterOf()]?.map?.home);
  /* Inside a sealed instance (world.mjs sealedOf) where the story stands: its rooms open now (a room in `opens` once
     that scene is behind him, or the scene's own room) — the whole map while he is in. Null outside. */
  const inside = () => {
    const w = walk[Math.min(i, walk.length - 1)], sealed = sealedBeat(content, w.id);
    if (!sealed) return null;
    const at = content.chapters[w.chapter]?.scenes?.[w.id]?.at;
    return { ...sealed, rooms: sealed.places.filter(id => !sealed.opens?.[id] || done.has(sealed.opens[id]) || id === at).map(id => places.get(id)).filter(Boolean) };
  };
  /* The practice boards the instance's open rooms host (rules/tasks.mjs hostedHere: hosted, a board, not a stall). */
  const roomBoards = sealed => sealed.rooms.flatMap(p => p.has?.games ?? []).map(id => content.tasks.tasks.find(t => t.id === id))
    .filter(t => t?.hosted && t.kind === 'board' && !t.stall);
  const pools = () => {
    const sealed = inside();
    if (sealed) return sealed.rooms.some(p => p.has?.pool) ? 1 : 0;
    const map = content.chapters[chapterOf()]?.map?.places;
    const ids = map ?? [...places.keys()];
    return ids.filter(id => places.get(id)?.has?.pool).length > 0 ? 1 : 0;
  };
  const holdsFantong = () => !inside() && walk.slice(0, i).some(w => w.id === model.fantong_from);
  /* A day's plays of each board inside (the replay's falling share, play_pay.replay; rules/playpay.mjs playsToday). */
  let roomPlays = { day: -1, ids: {} };
  const rows = new Map(), row = id => { if (!rows.has(id)) rows.set(id, { hui: id, start: null, end: null }); return rows.get(id); };
  const T = model.minutes, Q = content.rewards.stamina;
  let qi = Q.max;
  const spend = c => (qi >= c ? ((qi -= c), true) : false);
  /* The day's ledger: 修为 (`xw`) and 灵石 (`ls`) by where they came from. One row a day, in `ledger`. */
  const ledger = [], book = (m, k, n) => { if (n) m[k] = (m[k] ?? 0) + n; };
  let D = { xw: {}, ls: {} };
  let day = 0;
  /* The day's routine split over its sittings (`k` of `n`): 功课 at the first,
     the fights and feeds spread; the rest of the sitting is the story's. */
  const share = (n, k, of) => Math.floor((n * (k + 1)) / of) - Math.floor((n * k) / of);
  /* Each stage quest's way, as he comes to it (Hanli 10-27: a gate must never keep him where there is little to do): how
     full the layer stood on arrival, then the minutes of play and the days until it opened, and what he played meanwhile. */
  const gates = new Map();
  let before = 0; // minutes played on the days before this one
  /* 执事堂's east wall (quests/wall.json; doc/gates-2026-10-27.md: the tool did not play it): a day's tags, where he can walk to
     the wall — its place on his chapter's map, no key beat holding him (world.mjs beatOf), nothing sealed — each tag an
     errand's minutes (`play_pay.errand.minutes`) and its 体力, paid as the rules pay it (playpay.mjs wallGrant). Once a day:
     `walls` of a day's tags in the routine (a share under one, its expected worth), and the rest of them while a gate holds him. */
  let wallsOn = -1, wallsTaken = 0;
  const wallsLeft = () => (wallsOn === day ? 1 - wallsTaken : 1);
  const wallsOpen = () => {
    const w = walk[Math.min(i, walk.length - 1)], ch = content.chapters[w.chapter];
    if (zero() || !ch?.map?.places || (ch.beats ?? []).some(b => b.scenes.indexOf(w.id) > 0)) return [];
    return (content.walls ?? []).filter(x => ch.map.places.includes(x.at));
  };
  const playWalls = (left, share = 1) => {
    const tagMin = content.balance.play_pay?.errand?.minutes ?? 5;
    let used = 0;
    for (const wall of wallsOpen()) for (let t = 0; t < Math.min(wall.posts ?? 3, (wall.pool ?? []).length); t++) {
      if (left - used < tagMin * share || !spend(Q.cost.game * share)) return used;
      const g = wallGrant(content, { ...s, need: need() }, { wall: wall.id });
      used += tagMin * share;
      gain((g?.progress ?? 0) * share, false, 'play', 'wall');
      earn((g?.wealth ?? 0) * share, 'wall');
    }
    return used;
  };
  for (; i < walk.length && day < model.max_days; day += 1) {
    const total = day === 0 ? player.first_minutes : player.minutes, n = player.sittings, sit = total / n;
    const poolCap = pools() * (1 + Math.floor(sit / content.balance.cooldowns.pool_rest_min));
    wins = 0;
    D = { xw: {}, ls: {}, need: need(), batched: batched() };
    ledger.push(D);
    for (let k = 0; k < n && i < walk.length; k++) {
      let left = sit, fought = 0;
      // 体力 ON, as players will have it (rewards.json stamina; the switch stays off while testing):
      // full after the night, refilled between sittings spread over the waking day.
      qi = k === 0 ? Q.max : Math.min(Q.max, qi + Q.max * (model.waking_h / n) / Q.refill_hours);
      const at = () => day + (k * sit + (sit - left)) / total;
      const played = () => before + k * sit + (sit - left);
      // The hour of the model's clock now (from the first day's first sitting): the event's cooldown runs on it.
      const hour = () => day * 24 + k * (model.waking_h / n) + (sit - left) / 60;
      /* One pool fight: in a batch (妖兽出没) it takes a slot and pays the batch's day share; its 修为 booked as `yaoshou`. */
      const poolFight = () => { const b = batched(), mult = b ? evShare() * (EV.fight_scale ?? 1) : 1; win(model.fight_win_rate, b ? 'yaoshou' : 'pool', mult); evFight(hour()); };
      // Inside a sealed instance the routine of the world outside is frozen (rules/sealed.mjs): only its own pools are fought.
      const sealedNow = Boolean(inside());
      if (!zero()) {
        // The day's 功课: its share of the layer he stands on (rules/playpay.mjs chorePlay, 2026-10-27).
        if (k === 0 && !sealedNow) gain((chorePlay(content, { ...s, need: need() }, 'day') ?? 0) * player.gongke, false, 'gongke', 'gongke');
        if (k === 0 && !sealedNow) earn((pay.gongke.wealth ?? 0) * player.gongke, 'gongke');
        // 闭关 overnight (rules/seclusion.mjs, focus 修为): `seclude` hours a night, the rules' rate and cap.
        // 闭关 overnight (rules/seclusion.mjs, focus 修为): `seclude` hours a night at an hour's share of the layer (play_pay.seclusion).
        if (k === 0 && day > 0 && player.seclude && !sealedNow) gain(Math.floor(Math.min(player.seclude, content.rewards.seclusion.cap_hours) * (secludeHour(content, { ...s, need: need() }) ?? 0)), false, 'seclusion', 'seclusion');
        for (let f = 0; f < Math.min(share(player.fights, k, n), poolCap) && evLeft(hour()) > 0 && left >= T.fight && spend(Q.cost.duel); f++) { left -= T.fight; fought += 1; poolFight(); const g = [...gates.values()].find(x => x.wait == null); if (g) g.did.fights += 1; }
        if (holdsFantong()) for (let f = 0; f < share(player.fantong, k, n) && left >= T.fantong; f++) { left -= T.fantong; gain(model.fantong_progress, false, null, 'fantong'); }
        if (k === 0 && !sealedNow && !walled() && player.tale && left >= T.tale) { left -= T.tale; gain(content.rewards.tale.cap.progress * player.tale, false, null, 'tale'); }
        if (k === 0 && player.walls && wallsOpen().length) { left -= playWalls(left, Math.min(1, player.walls)); wallsOn = day; wallsTaken = Math.min(1, player.walls); }
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
          // A gated scene with boards of its own is read and played before its way on is asked (Hanli 10-27, doc/gates-2026-10-27.md:
          // 大比前夜's 掐诀 counts toward the 四层 he needs there); one with none is held at the way into it (rules/gates.mjs entryGate).
          const late = Boolean(w.gate && (w.nboards || roomWorks(content, content.chapters[w.chapter]?.scenes?.[w.id]?.at)));
          const arrive = () => {
            if (!gates.has(w.id)) gates.set(w.id, { scene: w.id, hui: w.hui ?? hui, layer: { tier: w.gate.tier, step: w.gate.step }, pct: Math.min(1, gateMet(w.gate) ? 1 : (rank(s.tier, s.step) < rank(w.gate.tier, w.gate.step) ? 0 : s.progress / need())), below: rank(s.tier, s.step) < rank(w.gate.tier, w.gate.step), from: { tier: s.tier, step: s.step, progress: s.progress, need: need() }, at: played(), day: at(), did: { fights: 0, boards: 0, walls: 0 } });
            if (!gateMet(w.gate)) return false;
            if (gates.get(w.id).wait == null) Object.assign(gates.get(w.id), { wait: played() - gates.get(w.id).at, days: at() - gates.get(w.id).day });
            return true;
          };
          if (w.gate && !late && !arrive()) { gated = true; break; }
          if (!w.entered) {
            if (left < w.minutes * (1 - (w.read ?? 0))) { w.read = (w.read ?? 0) + left / w.minutes; left = 0; break; }
            // A story step and its boards cost 体力 (a step toward the story's place is free, not counted here).
            if (!w.paid && !spend((content.chapters[w.chapter]?.free ? 0 : Q.cost.step) + w.nboards * Q.cost.game)) { left = 0; break; }
            w.paid = true;
            left -= w.minutes * (1 - (w.read ?? 0));
            // The sealed rooms, entered here: what holds the way, the boards, the fights.
            const room = rooms[w.hui]?.first === w.id ? rooms[w.hui] : null;
            if (room) { gain(room.story + room.boards); win(room.fights * model.fight_win_rate, 'story'); }
            // The 回's errands, once past 零层: handed in where the 回 is under way.
            for (const [id, h] of Object.entries(model.errands_at)) if (h === w.hui && !inside() && !errandsPaid.has(id) && quests.has(id) && !zero()) { errandsPaid.add(id); gain(errandPays(content, quests.get(id)), false, null, 'errand'); earn(wealthCap(content, quests.get(id).grant), 'errand'); }
            gain(w.boards);
            // …and each board's play pay, its minutes at the layer he stands on (rules/playpay.mjs playGrant; ★ `model.story_stars`):
            // the story's boards are where most of a layer's 修为 comes from before its gate (数值系统 phase 2).
            for (const t of w.tasks ?? []) gain(playGrant(content, { ...s, need: need(), plays: null }, t.id, t, NOW, model.story_stars ?? 2)?.progress ?? 0, false, 'play', 'boards');
            w.entered = true;
          }
          if (late && !arrive()) { gated = true; break; }
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
          earn(w.wealth);
          // A story fight on the way takes its pills too.
          if (w.fight) takePills(1 / model.fight_win_rate);
          done.add(w.id);
          r.end = at();
          i += 1;
        }
        // Waiting on a stage quest: the minutes left go to the pool, as its rest allows — one fight
        // at a time, and the story goes on the moment the layer is full.
        if (!gated) break;
        const waiting = [...gates.values()].find(g => g.wait == null);
        if (extra < player.gate_fights && fought + extra < poolCap && evLeft(hour()) > 0 && left >= T.fight && spend(Q.cost.duel)) { left -= T.fight; extra += 1; poolFight(); if (waiting) waiting.did.fights += 1; continue; }
        // …then the day's wall tags he has not taken yet.
        if (wallsLeft() > 0.01 && wallsOpen().length) { const share = wallsLeft(); wallsOn = day; wallsTaken = 1; const used = playWalls(left, share); if (used) { left -= used; if (waiting) waiting.did.walls += share; continue; } }
        // …then the practice boards (play_pay, 2026-10-27): a board's minutes at the layer's share, `model.practice.factor`
        // for its ★ and the replay's falling share across a sitting.
        const P = model.practice;
        // Inside a sealed instance: only the boards its rooms host, each at the day's replay share, while one still pays
        // above the last share (rules/home.mjs boardHere) — none, and the day's sitting is over.
        const sealed = inside();
        if (sealed) {
          if (roomPlays.day !== day) roomPlays = { day, ids: {} };
          const replay = content.balance.play_pay?.replay ?? [1], floor = replay.at(-1);
          const plays = { day: dayKey(NOW), ids: roomPlays.ids };
          const best = roomBoards(sealed).map(t => ({ t, g: playGrant(content, { ...s, need: need(), plays }, t.id, t, NOW, model.story_stars ?? 2) }))
            .filter(x => x.g && replay[Math.min(roomPlays.ids[x.t.id] ?? 0, replay.length - 1)] > floor)
            .sort((a, b) => (b.g.progress ?? 0) - (a.g.progress ?? 0))[0];
          if (!best || left < best.g.minutes || !spend(Q.cost.game)) break;
          left -= best.g.minutes;
          roomPlays.ids[best.t.id] = (roomPlays.ids[best.t.id] ?? 0) + 1;
          if (waiting) waiting.did.boards += 1;
          gain(best.g.progress ?? 0, false, 'play', 'boards');
          earn(best.g.wealth ?? 0, 'boards');
          continue;
        }
        if (!P || left < P.minutes || !spend(Q.cost.game)) break;
        left -= P.minutes;
        if (waiting) waiting.did.boards += 1;
        gain(Math.round((boardPlay(content, { ...s, need: need() }, P.minutes) ?? 0) * P.factor), false, 'play', 'boards');
      }
    }
    // Where the day ends (tools/numbers.mjs reads it): the layer, the 回, the wallet and all 灵石 earned so far.
    Object.assign(D, { at: { tier: s.tier, step: s.step }, hui, wallet: W.now, earned: W.earned });
    before += total;
  }
  // A 今 interlude is the 古 回's before it (as its cap is, rules/cap.mjs): its time goes there.
  const out = [];
  for (const r of [...rows.values()].filter(x => x.hui)) {
    if (sideHui(content, r.hui) && out.length) { out.at(-1).end = r.end ?? out.at(-1).end; continue; }
    out.push({ ...r });
  }
  // A 回's days run from the last one's end to its own (time spent waiting on it counts).
  out.forEach((r, k) => { const prev = k ? out[k - 1].end : 0; r.days = r.end == null ? null : r.end - prev; });
  return { rows: out, gates: [...gates.values()], end: { tier: s.tier, step: s.step, progress: Math.round(s.progress) }, days: day, wealth: { ...W, perDay: day ? W.earned / day : 0, spentPerDay: day ? W.spent / day : 0 }, ledger };
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
export function grindLayers(content) {
  const out = [];
  for (const g of gatesOf(content)) {
    let r = out.find(x => x.hui === g.hui);
    if (!r) out.push(r = { hui: g.hui, layers: [] });
    if (g.tier === content.ladder.tiers[0].id && !r.layers.includes(g.step) && !out.some(x => x !== r && x.layers.includes(g.step))) r.layers.push(g.step);
  }
  return out;
}

/* balance.json as written: two-space JSON, a small object or a row of numbers on one line (≤ 120 characters), the price
   table one line a thing. */
export function balanceText(raw) {
  const one = v => JSON.stringify(v).replace(/,(?=["\d\[{-]|true|false|null)/g, ', ').replace(/":(?=\S)/g, '": ');
  const out = (v, pad) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    const flat = one(v);
    if (pad.length > 0 && flat.length + pad.length <= 120 && !/"_/.test(flat)) return flat;
    const inner = pad + '  ';
    if (Array.isArray(v)) return `[\n${v.map(x => inner + out(x, inner)).join(',\n')}\n${pad}]`;
    return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${k === 'prices' ? prices(x, inner) : out(x, inner)}`).join(',\n')}\n${pad}}`;
  };
  const prices = (v, pad) => `{\n${Object.entries(v).map(([k, x]) => `${pad}  ${JSON.stringify(k)}: ${one(x)}`).join(',\n')}\n${pad}}`;
  return out(raw, '') + '\n';
}

/* 灵石 by player: in and out per day over 卷一, the pills bought, the lowest he stood at. */
export function wealthTable(content) {
  return Object.entries(content.balance.model.players).map(([who, p]) => {
    const r = play(content, p).wealth;
    return { who, days: play(content, p).days, in: Math.round(r.perDay), out: Math.round(r.spentPerDay), pills: Math.round(r.pills), end: Math.round(r.now), low: Math.round(r.low) };
  });
}

/* 妖兽出没's day (rules/yaoshou.mjs), per player, over the days its pools are the map's (卷一): the 修为 its batches pay as a
   share of the layer he stands on that morning, its 灵石, and the share of the day's 修为 it is (`--events`). */
export function eventDay(content, player) {
  const days = play(content, player).ledger.filter(d => d.batched), n = days.length || 1;
  const sum = f => days.reduce((t, d) => t + f(d), 0) / n;
  const xw = sum(d => d.xw.yaoshou ?? 0), all = sum(d => Object.values(d.xw).reduce((a, x) => a + x, 0));
  return { days: days.length, layer: sum(d => (d.need ? (d.xw.yaoshou ?? 0) / d.need : 0)), xw, of_day: all ? xw / all : 0, ls: sum(d => d.ls.yaoshou ?? 0) };
}
export const eventTable = content => Object.entries(content.balance.model.players).map(([who, p]) => ({ who, ...eventDay(content, p) }));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const content = loadContent();
  if (process.argv.includes('--fit')) {
    // Retired 2026-10-27 (数值系统 phase 2): the 层 numbers and the pace come from the master table — node tools/numbers.mjs --apply.
    console.error('--fit is retired: the master table derives the 层 and fits the hours (node tools/numbers.mjs --apply).');
    process.exit(1);
  }
  const rows = table(content);
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else {
    console.log(`练气 ${JSON.stringify(content.ladder.tiers[0].thresholds)}`);
    console.log('回     轻   中   重   (days)');
    for (const r of rows) console.log(`${r.hui.padEnd(5)} ${[r.light, r.typical, r.heavy].map(x => String(x ?? '—').padStart(4)).join(' ')}`);
    const pct = x => `${(x * 100).toFixed(1)}%`;
    if (process.argv.includes('--events')) for (const e of eventTable(content)) console.log(`妖兽出没 ${e.who.padEnd(8)} ${e.days} days: 修为 ${Math.round(e.xw)}/day = ${pct(e.layer)} of the layer · ${pct(e.of_day)} of the day's 修为 · 灵石 ${Math.round(e.ls)}/day`);
    if (process.argv.includes('--wealth')) for (const w of wealthTable(content)) console.log(`灵石 ${w.who.padEnd(8)} ${w.days} days: in ${w.in}/day · pills out ${w.out}/day (${w.pills} pills) · end ${w.end} · lowest ${w.low}`);
  }
}
