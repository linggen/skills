// shoulu/tide.js — 兽潮's 守炉 nights (rules/shouchao.mjs rotates its kits; this is 守炉's maker). Pure: no fs, no DOM.
// Hanli 2026-10-28: 「守火那个不太好玩」 but 「大厅里的守炉好玩」 — so a tide night is a 游戏厅 ladder level, never a
// 守火 / 雪夜柴垛 board: a road, talisman spots beside it, 银月 the hero, 剑阵 · 火符 (· 寒符 · 雷符), the 炉 at the road's
// end (here 沉鼎观's 丹房, the beasts after the herbs). Every night a new layout for the save: its road (an axis-aligned
// serpentine, sometimes knotted back up), its spots, its ground, its waves, the talismans offered — all from `ask.seed`.
// The whole level rides in the deal (`data.levels`): no row is added to games.json (the phone ships an old copy).
//
// Bot-proven (tests/tide-shoulu.test.mjs, tools/tide-prove-shoulu.mjs): the human-like hand (core.js `human`) wins every layout,
// nothing done loses. To hold that for every seed, night() plays the layout it made with that hand on a few sim seeds and
// eases its `hpMul` until the hand holds (a few ms a sim) — the structure, and so the `sig`, stays as dealt.
import { hash, rng } from '../seeded.js';
import { BEASTS, coverage, layLevel, offRoad, posOnPath, sim } from './core.js';

const GROUNDS = ['shiao', 'shanlu', 'shanlu-night', 'yaoyuan', 'yaoyuan-night', 'houshan', 'houshan-night', 'heisong'];
// where the beasts come from (the road's first point): the night's name — the art is any tower map's, the place 丹房's 后山
const FROM = { w: { zh: '西路', en: 'from the west' }, e: { zh: '东路', en: 'from the east' }, n: { zh: '北路', en: 'from the north' } };
const KINDS = ['yezhu', 'zheng', 'qiuyu', 'qique']; // the rank, in the order a save meets them; heyu is the 大妖
// a group's size and spacing at tier 0 (they grow and tighten with the tier)
const BASE = { yezhu: { n: 8, gap: 0.7 }, zheng: { n: 8, gap: 0.8 }, qiuyu: { n: 5, gap: 1.9 }, qique: { n: 5, gap: 1.4 } };
// the sim seeds night() proves a layout on: two for each of the human hand's three plans (core.js HUMAN_PLANS, picked by seed)
const CAL = ['c1', 'c2', 'c5', 'c7', 'c0', 'c3'];

const q10 = (v) => Math.round(v / 10) * 10;
const pickOf = (rnd, list) => list[Math.floor(rnd() * list.length)];
const between = (rnd, a, b) => a + rnd() * (b - a);
const r2 = (v) => Math.round(v * 100) / 100;

/** The least distance between two segments (0 when they cross). */
function segDist([a, b], [c, d]) {
  const pt = ([px, py], [x1, y1], [x2, y2]) => {
    const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy || 1, k = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / l2));
    return Math.hypot(px - x1 - vx * k, py - y1 - vy * k);
  };
  const cr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const s1 = cr(a, b, c), s2 = cr(a, b, d), s3 = cr(c, d, a), s4 = cr(c, d, b);
  if (((s1 > 0 && s2 < 0) || (s1 < 0 && s2 > 0)) && ((s3 > 0 && s4 < 0) || (s3 < 0 && s4 > 0))) return 0;
  return Math.min(pt(a, c, d), pt(b, c, d), pt(c, a, b), pt(d, a, b));
}

/** A road: from off the board, alternating runs across and drops down (now and then a climb back: a knot), ending in a
    short drop onto the furnace. → { road, furnace } or null (re-roll). */
function makeRoad(rnd) {
  const from = pickOf(rnd, ['left', 'right', 'left', 'right', 'top']);
  const pts = [];
  let horiz;
  if (from === 'top') { pts.push([q10(between(rnd, 100, 500)), -30]); horiz = false; }
  else { pts.push([from === 'left' ? -30 : 630, q10(between(rnd, 100, 190))]); horiz = true; }
  const want = 5 + Math.floor(rnd() * 5); // corners before the furnace
  let climbed = false;
  for (let k = 0; k < 14; k += 1) {
    const [x, y] = pts.at(-1);
    if (horiz) {
      let nx;
      for (let t = 0; t < 12; t += 1) { nx = q10(between(rnd, 70, 530)); if (Math.abs(nx - x) >= 150) break; nx = null; }
      if (nx == null) return null;
      pts.push([nx, y]);
      // done once there are corners enough and room below for the furnace
      if (pts.length - 1 >= want && y >= 380 && nx >= 110 && nx <= 490) {
        const fy = q10(Math.min(712, between(rnd, Math.max(y + 110, 560), 720)));
        if (fy - 32 - y >= 70 && fy <= 718) { pts.push([nx, fy - 32]); return { road: pts, furnace: [nx, fy] }; }
      }
    } else {
      const up = !climbed && y > 360 && rnd() < 0.22;
      const ny = q10(up ? y - between(rnd, 130, 200) : (y < 0 ? between(rnd, 110, 200) : y + between(rnd, 140, 230)));
      if (ny < 100 || ny > 610) return null;
      if (up) climbed = true;
      pts.push([x, ny]);
    }
    horiz = !horiz;
  }
  return null;
}
/** A road that reads as one: long enough, its runs apart, the furnace clear of the rest. */
function roadOk({ road, furnace }) {
  const segs = road.slice(1).map((p, i) => [road[i], p]);
  const len = segs.reduce((a, [p, q]) => a + Math.hypot(q[0] - p[0], q[1] - p[1]), 0);
  if (len < 1300 || len > 2700) return false;
  for (let i = 1; i < segs.length - 1; i += 1) { const [p, q] = segs[i]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 130) return false; }
  for (let i = 0; i < segs.length; i += 1) for (let j = i + 2; j < segs.length; j += 1) if (segDist(segs[i], segs[j]) < 140) return false;
  const fseg = [furnace, furnace];
  for (let i = 0; i < segs.length - 2; i += 1) if (segDist(segs[i], fseg) < 110) return false;
  return road.slice(1).every(([x, y]) => x >= 60 && x <= 540 && y >= 90 && y <= 690);
}

/** The talisman spots: beside the road (45–90 off it), on the board, apart, clear of the furnace; the ones that see the
    most road (and the fliers' line) likelier, a few lesser ones for the eye. */
function makeSpots(rnd, L, n, air) {
  // the road (and the fliers' line) sampled once, as core.js `coverage` samples it
  const pts = [];
  for (let d = 0; d < L.road.len; d += 8) { const p = posOnPath(L.road, d); pts.push(p.x, p.y, 1); }
  if (air && L.air) for (let d = 0; d < L.airLen; d += 8) { const k = d / L.airLen; pts.push(L.air.x + (L.furn.x - L.air.x) * k, L.air.y + (L.furn.y - 18 - L.air.y) * k, 2); }
  const R2 = 150 * 150, cands = [];
  for (let x = 30; x <= 570; x += 10) for (let y = 80; y <= 725; y += 10) {
    const d = offRoad(L.road, x, y);
    if (d < 45 || d > 90 || Math.hypot(x - L.furn.x, y - L.furn.y) < 75) continue;
    let v = 0;
    for (let i = 0; i < pts.length; i += 3) if ((pts[i] - x) ** 2 + (pts[i + 1] - y) ** 2 <= R2) v += pts[i + 2];
    cands.push({ x, y, v });
  }
  cands.sort((a, b) => b.v - a.v);
  const out = [];
  while (out.length < n) {
    const free = cands.filter((c) => out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= 70));
    if (!free.length) break;
    const pool = free.slice(0, out.length < 4 ? 6 : 18);
    out.push(pool[Math.floor(rnd() * pool.length)]);
  }
  return out.length >= 7 ? out.map((c) => [c.x, c.y]) : null;
}

/** The waves: only `kinds`, more and tighter with the tier; the last carries an elite, or the 大妖. */
function makeWaves(rnd, kinds, tier, boss) {
  const nW = Math.min(8, 4 + Math.round(tier * 2.5) + (rnd() < 0.5 ? 1 : 0));
  const grow = 1 + 0.5 * tier, tight = 1.05 - 0.35 * tier;
  const out = [];
  for (let i = 0; i < nW; i += 1) {
    const k = i / Math.max(1, nW - 1), groups = i === 0 ? 1 : 1 + Math.floor(rnd() * (i < 3 ? 2 : 3));
    // a wave's kinds: the first is the earliest's, later ones draw from every kind open, the newest a little likelier
    const pool = i === 0 ? [kinds[0]] : kinds;
    const wave = [];
    let at = 0;
    for (let gi = 0; gi < groups; gi += 1) {
      const kind = pickOf(rnd, pool), B = BASE[kind];
      const n = Math.max(3, Math.round(B.n * (0.55 + 0.6 * k) * grow * between(rnd, 0.85, 1.15) / Math.sqrt(groups)));
      const gap = r2(Math.max(0.3, B.gap * tight * between(rnd, 0.8, 1.2)));
      wave.push([kind, n, gap, Math.round(at)]);
      at += between(rnd, 3, 10);
    }
    out.push(wave);
  }
  const last = out.at(-1);
  if (boss) last.push(['heyu', 1, 1, Math.round(between(rnd, 8, 14))]);
  else last[last.length - 1].push({ elite: 1, hp: r2(2 + tier) });
  return out;
}

/** What a night tells before the banner, and after it: what to answer each beast with. */
const STORY = [
  { zh: '天一擦黑，山里的兽就躁起来了。', en: 'At dusk the beasts of the hills grow restless.' },
  { zh: '丹房里炉火正旺，药香顺着风飘下山去。', en: 'The pill-house furnace burns high; the smell of herbs drifts down the hill.' },
  { zh: '师兄们守着山门，丹房这边，交给你了。', en: 'The seniors hold the gate. The pill house is yours.' },
  { zh: '药炉开着，一步也离不得。', en: 'The herb furnace is lit; it cannot be left.' },
  { zh: '林子里沙沙响，一路往观里来。', en: 'A rustle in the woods, coming all the way to the temple.' },
];
const TIPS = {
  qique: { zh: '鬿雀不走路，直扑药炉：火符够不着天上，剑阵、雷符够得着。', en: 'Qique skip the road and dive at the furnace: fire can\'t reach the sky; swords and thunder can.' },
  qiuyu: { zh: '犰狳缩成一团，剑阵砍不动：用火符。', en: 'An armadillo curls up and swords glance off: use fire.' },
  zheng: { zh: '狰太快，火符落地它已跑远：先用寒符拖住它。', en: 'The zheng is too quick for fire: slow it with frost first.' },
  heyu: { zh: '合窳来了：它一哭，护体灵光便薄一层——那时打！', en: 'A heyu comes: when it wails, its shield thins — strike then!' },
};
function makeLead(rnd, kinds, boss) {
  const a = Math.floor(rnd() * STORY.length), b = (a + 1 + Math.floor(rnd() * (STORY.length - 1))) % STORY.length;
  const tips = [boss && TIPS.heyu, ...['qique', 'qiuyu', 'zheng'].filter((k) => kinds.includes(k)).map((k) => TIPS[k])].filter(Boolean).slice(0, 2);
  return [STORY[a], STORY[b], { zh: '兽潮扑向丹房！', en: 'The beast tide is on the pill house!', big: true }, ...tips];
}

/** The structure's fingerprint: everything but the difficulty knobs. */
const sigOf = (r) => JSON.stringify([r.ground, r.road, r.furnace, r.spots, r.hero.at, r.air ?? 0, r.towers, r.unlock ?? 0, r.waves.map((w) => w.map(([t, n, g, d]) => [t, n, g, d]))]);
const hex = (s) => (hash(s).toString(16).padStart(8, '0') + hash(`~${s}`).toString(16).padStart(8, '0'));

/** One layout from a seed, or null (re-roll). */
function layout(seed, tier, boss, kinds) {
  const rnd = rng(seed);
  const rd = makeRoad(rnd);
  if (!rd || !roadOk(rd)) return null;
  const fly = kinds.includes('qique');
  const air = fly ? (rnd() < 0.5 ? [q10(between(rnd, -40, 640)), -60] : [rnd() < 0.5 ? -40 : 640, q10(between(rnd, -40, 120))]) : null;
  const L0 = layLevel({ road: rd.road, furnace: rd.furnace, air, waves: [], spots: [], hero: [0, 0], money: 0 });
  const spots = makeSpots(rnd, L0, 7 + Math.floor(rnd() * 3), Boolean(air));
  if (!spots) return null;
  // a floor on the spots' worth: the best four see as much road as the ladder's thinnest map's
  const top = spots.map(([x, y]) => coverage(L0, x, y, 156)).sort((a, b) => b - a);
  if (top[0] < 60 || top.slice(0, 4).reduce((a, v) => a + v, 0) < 210) return null;
  // 银月 on the last run before the furnace's drop
  const [p, q] = [rd.road.at(-3), rd.road.at(-2)], k = between(rnd, 0.35, 0.65);
  const heroAt = [q10(p[0] + (q[0] - p[0]) * k), q10(p[1] + (q[1] - p[1]) * k)];
  const towers = ['jian', 'huo', ...(kinds.includes('zheng') || kinds.includes('qiuyu') ? ['han'] : []), ...(fly || (boss && tier >= 0.5) ? ['lei'] : [])];
  const unlock = towers.includes('lei') && rnd() < 0.5 ? { lei: 2 + Math.floor(rnd() * 2) } : null;
  const waves = makeWaves(rnd, kinds, tier, boss);
  const ground = pickOf(rnd, GROUNDS), [sx, sy] = rd.road[0], from = FROM[sy < 0 ? 'n' : sx < 0 ? 'w' : 'e'];
  const row = {
    // `realm`: off the 游戏厅's ladder, as the 秘境's rows — so even a mount from before `tide` plays it alone (no select, no 下一关)
    story: null, realm: 'shouchao', tide: true, place: 'houshan', ground,
    name: { zh: `兽潮 · 丹房${from.zh}`, en: `Beast tide · The pill house, ${from.en}` },
    lead: makeLead(rnd, [...new Set(waves.flat().map(([t]) => t))], boss),
    towers, ...(unlock ? { unlock } : {}),
    money: q10(220 + 40 * (towers.length - 2) + 60 * tier + (boss ? 60 : 0)),
    hpMul: r2(2.1 + 1.0 * tier), difficulty: 1,
    road: rd.road, furnace: rd.furnace, ...(air ? { air } : {}), spots,
    hero: { at: heroAt, hair: boss ? 2 : 0 },
    waves,
  };
  const sig = sigOf(row);
  return { row: { id: `tide-${hex(sig)}`, ...row }, sig };
}

/** The human-like hand wins it on every proving seed. */
const holds = (row) => CAL.every((s) => sim(row, 'human', { seed: s }).result === 'win');

export const tide = {
  game: 'shoulu',
  boss: true, // a 大妖 night (合窳) is a ladder level's last wave; 结印's dock (jieyin.json hosts.shoulu, pace rest) opens while it is up
  /** table: the games.json `shoulu` row ({ id, levels, difficulty, … }); ask: { seed, tier 0..1, boss, open(kind) }.
      → null when nothing fits, else { deal, sig, boss, kinds } — deal: what shoulu.js mount reads as `data`. */
  night(table, ask) {
    const open = typeof ask?.open === 'function' ? ask.open : () => true;
    const kinds = KINDS.filter((k) => open(k));
    if (!kinds.includes('yezhu')) return null; // the 野猪 are always the first a save meets
    const tier = Math.max(0, Math.min(1, Number(ask?.tier) || 0));
    const boss = Boolean(ask?.boss) && Boolean(BEASTS.heyu?.boss) && open('heyu');
    const global = table?.difficulty ?? 1;
    for (let k = 0, tried = 0; k < 400 && tried < 12; k += 1) {
      const got = layout(`${ask?.seed ?? ''}|shoulu-tide|${k}`, tier, boss, kinds);
      if (!got) continue;
      const { row, sig } = got;
      tried += 1; // a layout that never holds is re-rolled; a dozen proven in vain: nothing fits
      // proven: eased until the human hand holds it on every proving seed (and never past half the knob)
      const start = row.hpMul;
      let ok = false;
      for (let e = 0; e < 8 && !ok; e += 1) {
        if (e) row.hpMul = r2(row.hpMul * 0.92);
        ok = holds({ ...row, globalDifficulty: global });
        if (row.hpMul < start * 0.45) break;
      }
      if (!ok) continue;
      const used = [...new Set(row.waves.flat().map(([t]) => t))];
      return { deal: { levels: [{ ...row, globalDifficulty: global }], lv: row.id, tide: true }, sig, boss: used.some((t) => BEASTS[t].boss), kinds: used };
    }
    return null;
  },
  /** Play a dealt night headless once with the human-like hand (no 结印): → true when it was won. */
  prove(table, deal, seed) {
    const row = deal?.levels?.find((l) => l.id === deal.lv) ?? deal?.levels?.[0];
    if (!row) return false;
    return sim({ globalDifficulty: table?.difficulty ?? 1, ...row }, 'human', { seed: String(seed ?? 'prove') }).result === 'win';
  },
};
