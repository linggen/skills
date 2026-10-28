// 太鼓 · the drum board (Hanli 10-27: 「节奏类, 如果有开源的成熟玩法可以借鉴」; 10-28: 抚琴 liked, 太鼓 next on its kit). A classic,
// not an invention: Taiko no Tatsujin (太鼓の達人) on the rules of osu!taiko.
//
//   Marks roll in along the band to the drum's ring: a red 咚 is struck on the drum's head (F or J), a blue 咔 on its rim
//   (D or K); a big mark wants both keys of its kind at once; a yellow roll is struck as fast as the hands go; a balloon
//   is struck 咚 咔 咚 咔 until it bursts. Phone: tap the drum's head for 咚, its rim (or anywhere off the head) for 咔.
//
// PORTED FROM osu! (https://github.com/ppy/osu, the osu.Game.Rulesets.Taiko ruleset) — MIT Licence, Copyright (c) ppy Pty
// Ltd <contact@ppy.sh>; the licence text is games/taiko/LICENSE. Only code ideas and numbers are taken, no asset:
//   · hit windows by OD: TaikoHitWindows.cs (great 50/35/20, ok 120/80/50, miss 135/95/70 ms at OD 0/5/10, the two-piece
//     DifficultyRange line, floor − 0.5);
//   · a hit (DrawableHit.CheckForResult): the earliest unjudged mark takes the press; a press before its miss window does
//     nothing; inside it, the window it falls in grades it, and the wrong kind (咔 on a 咚) is a miss; a mark never struck
//     is missed once its ok window has gone by (HitWindows.CanBeHit);
//   · a big mark (DrawableHit.StrongNestedHit): the second key of its kind within 30 ms (SECOND_HIT_WINDOW) — a bonus
//     only, the mark itself judged by the first (TaikoStrongJudgement gives no health);
//   · a roll (DrumRoll.cs, DrumRollTick.cs): a tick every quarter beat (TickRate 4), each struck once by any key within
//     half a tick's spacing of it — bonus only (TaikoDrumRollTickJudgement: no health);
//   · a balloon (Swell.cs, DrawableSwell.cs): RequiredHits = max(1, seconds × DifficultyRange(OD, 3, 5, 7.5) × 1.65),
//     咚 and 咔 alternating (MustAlternate); burst, a bonus; not burst, a cost (TaikoSwellJudgement: −0.65);
//   · the gauge (TaikoHealthProcessor.cs on AccumulatingHealthProcessor): it starts empty and the run is cleared only if
//     it ends at least half full; a great gives 3.0 × m, an ok 1.1 × m, m = 1 / (3 · marks · DifficultyRange(DR, 0.5,
//     0.75, 0.98)); a miss costs 1.0 × DifficultyRange(DR, 0.0018, 0.0075, 0.012) (TaikoJudgement);
//   · accuracy as osu!taiko counts it: great 1, ok ½, miss 0.
// Ours, on top: the gauge is Taiko's 魂 (its half line the clear line); the grades named as Taiko names them (良 · 可 ·
// 不可); the tunes are 锣鼓经 (public domain) written as a strip of strokes, with the kit's own synthesized 堂鼓, 锣 and 钹;
// a run that ends under the line plays again from the top under the shell's lead card (a story board never settles a loss).
//
// Levels are data (worlds/jiuding/games.json, the `taiko` rows' `levels`):
//   chart  "d.d.|k.D.|r===|b===" one character a 1/`div` beat: d 咚 · k 咔 · D 大咚 · K 大咔 · . a rest · r a roll and b a
//          balloon, each held on by = · | a bar line (spaces ignored)
//   bpm · div · scroll (ms a mark takes across the band) · od · drain (DR) · stars {2: acc, 3: acc} (3 also wants no 不可)
//   luo    a small gong (小锣) on each bar's first beat, to keep time           title · say · end ({zh, en})
// Pure model: newGame / act / tick (the bot and tests drive these); the page is `mount` (its own frame loop).

/* ── The windows (TaikoHitWindows.cs, osu! MIT) ──────────────────────────────────────────────────────────────── */

const RANGES = { great: [50, 35, 20], ok: [120, 80, 50], miss: [135, 95, 70] }; // ms at OD 0 · 5 · 10
/** IBeatmapDifficultyInfo.DifficultyRange: a two-piece line through 0, 5 and 10. */
export const range = (d, [a0, a5, a10]) => (d > 5 ? a5 + ((a10 - a5) * (d - 5)) / 5 : d < 5 ? a5 + ((a0 - a5) * (5 - d)) / 5 : a5);
/** The level's three windows in ms (± about the mark): 良 inside `great`, 可 inside `ok`, 不可 inside `miss`. */
export function windowsOf(level = {}) {
  const od = Math.max(0, Math.min(10, Number(level.od ?? 5)));
  return Object.fromEntries(Object.entries(RANGES).map(([k, r]) => [k, Math.floor(range(od, r)) - 0.5]));
}
export const SECOND_HIT_WINDOW = 30; // DrawableHit.StrongNestedHit
/** What an offset (press − mark, ms) earns: 'great' · 'ok' · 'miss', or null outside every window (not for it). */
export function gradeOf(w, off) {
  const a = Math.abs(off);
  return a <= w.great ? 'great' : a <= w.ok ? 'ok' : a <= w.miss ? 'miss' : null;
}
/** Swell.RequiredHits (TaikoBeatmapConverter: swell_hit_multiplier 1.65). */
export const balloonHits = (ms, od) => Math.max(1, Math.floor((ms / 1000) * range(Number(od ?? 5), [3, 5, 7.5]) * 1.65));

/* ── The gauge, 魂 (TaikoHealthProcessor.cs, TaikoJudgement.cs, osu! MIT) ──────────────────────────────────── */

export const CLEAR = 0.5; // AccumulatingHealthProcessor(0.5)
const HEALTH = { great: 3.0, ok: 1.1, miss: -1.0 };
export function gaugeOf(level, marks) {
  const dr = Number(level.drain ?? 5);
  return { hit: 1 / (3 * Math.max(1, marks) * range(dr, [0.5, 0.75, 0.98])), miss: range(dr, [0.0018, 0.0075, 0.012]) };
}
const ACC = { great: 1, ok: 0.5, miss: 0 };

/* ── The chart: 锣鼓经 as a strip of strokes ─────────────────────────────────────────────────────────────────── */

const KINDS = { d: ['don', false], k: ['ka', false], D: ['don', true], K: ['ka', true] };
/** A level's marks in time order: [{ i, t, kind: 'hit'|'roll'|'balloon', side, big, end, ticks?, need? }], ms from
    the start, and `bars` (each bar's first beat, ms). Throws on a character it cannot read. */
export function chartOf(level) {
  const beat = 60000 / (Number(level.bpm) || 90), div = Number(level.div) || 2, slot = beat / div;
  const start = (Number(level.scroll) || 2200) + LEAD_MS;
  const out = [], bars = [start];
  let k = 0, open = null;
  const close = () => {
    if (!open) return;
    open.end = Math.round(start + k * slot - slot);
    if (open.kind === 'roll') {
      const spacing = beat / 4; // DrumRoll: TickRate 4
      open.spacing = spacing;
      for (let t = open.t; t < open.end + spacing / 2; t += spacing) open.ticks.push({ t: Math.round(t), hit: false });
    } else open.need = balloonHits(open.end - open.t, level.od);
    open = null;
  };
  for (const c of String(level.chart ?? '').replace(/\s+/g, '')) {
    if (c === '|') { close(); if (k) bars.push(Math.round(start + k * slot)); continue; }
    if (c === '=') { if (!open) throw new Error('taiko chart: "=" with no roll or balloon before it'); k += 1; continue; }
    close();
    const t = Math.round(start + k * slot);
    if (KINDS[c]) out.push({ i: out.length, t, kind: 'hit', side: KINDS[c][0], big: KINDS[c][1], end: t });
    else if (c === 'r') out.push(open = { i: out.length, t, kind: 'roll', side: 'don', big: false, ticks: [] });
    else if (c === 'b') out.push(open = { i: out.length, t, kind: 'balloon', side: 'don', big: false });
    else if (c !== '.') throw new Error(`taiko chart: cannot read "${c}"`);
    k += 1;
  }
  close();
  out.bars = bars.filter((b) => b < start + k * slot);
  return out;
}
const LEAD_MS = 1000; // the first mark reaches the ring this long after it has rolled in

/* ── The model ──────────────────────────────────────────────────────────────────────────────────────────────── */

export const T = {
  zh: {
    great: '良', ok: '可', miss: '不可', combo: '连', acc: '准', soul: '魂', again: '魂没满。从头再打一遍。',
    don: '咚', ka: '咔', head: '鼓心', rim: '鼓边',
    hint: { desk: 'F J 打鼓心 · D K 打鼓边', touch: '红的点鼓心 · 蓝的点鼓边' },
    won: ['打完了。', '鼓点稳。', '一下不错。'],
  },
  en: {
    great: 'Great', ok: 'Fair', miss: 'Miss', combo: 'combo', acc: 'acc', soul: 'Soul', again: 'The gauge fell short. From the top again.',
    don: 'Don', ka: 'Ka', head: 'Head', rim: 'Rim',
    hint: { desk: 'F J strike the head · D K the rim', touch: 'Red: tap the head · Blue: tap the rim' },
    won: ['Drummed through.', 'A steady beat.', 'Not a stroke wrong.'],
  },
};

export const meta = {
  id: 'taiko',
  pause: true, //  its own loop reads the shell's pause
  beat: 'mount', // its own frame loop draws it (never the page's 50 ms html redraw)
  aspect: 16 / 10,
  sounds: ['don', 'ka', 'big', 'miss', 'luo', 'pop'],
  name: { zh: '太鼓', en: 'The drum' },
  how: {
    zh: '红的到鼓圈时打鼓心（F 或 J，或点鼓心），蓝的打鼓边（D 或 K，或点鼓边）；大的两键齐下（或两指同点），黄条连打，气球咚咔交替打破。',
    en: 'As a red mark reaches the ring strike the head (F or J, or tap the head); a blue one, the rim (D or K, or tap the rim). Big marks want both keys (or two fingers at once); drum the yellow roll; burst the balloon, head and rim in turn.',
  },
  // the keys: a side and a hand (two of a side within 30 ms strike a big mark)
  keys: { d: ['ka', 0], f: ['don', 0], j: ['don', 1], k: ['ka', 1] },
  // ↺ in the shell's bar (games/shell.js restartOf): the run from the top, once it has begun
  restart: (s) => Boolean(s?.live && s.phase === 'play' && s.clock > 0),
};

/** A fresh run of `deal.levels[0]` (or `deal.level` itself). */
export function newGame(_seed, _n = 1, deal = {}) {
  const level = deal.levels?.[0] ?? deal.level ?? null;
  if (!level?.chart) return { live: false, level };
  const notes = chartOf(level), hits = notes.filter((n) => n.kind === 'hit');
  const last = notes.length ? Math.max(...notes.map((n) => n.end)) : 0;
  return {
    live: true, level, notes, bars: notes.bars, w: windowsOf(level), g: gaugeOf(level, hits.length),
    res: notes.map((n) => (n.kind === 'hit' ? { grade: null, at: null, hand: null, strong: null } : { hits: 0, last: null, done: false })),
    next: 0, // the first hit mark not yet judged (an index into `hits`)
    hits: hits.map((n) => n.i), bar: 0, clock: 0, hp: 0, combo: 0, best: 0, score: 0, judged: 0, bonus: 0,
    counts: { great: 0, ok: 0, miss: 0, strong: 0, roll: 0, pop: 0 }, strokes: { don: 0, ka: 0 }, bigs: 0,
    endAt: last + 1200, events: [], phase: 'play', won: false, stars: 0,
  };
}

const push = (s, e) => { s.events.push({ at: s.clock, ...e }); if (s.events.length > 200) s.events.shift(); };
const gain = (s, d) => { s.hp = Math.max(0, Math.min(1, s.hp + d)); };
function judge(s, n, grade, at = null, hand = null) {
  const r = s.res[n.i];
  r.grade = grade; r.at = at; r.hand = hand;
  s.counts[grade] += 1;
  s.judged += 1;
  s.score += ACC[grade];
  gain(s, grade === 'miss' ? HEALTH.miss * s.g.miss : HEALTH[grade] * s.g.hit);
  if (grade === 'miss') s.combo = 0; else { s.combo += 1; s.best = Math.max(s.best, s.combo); }
  if (n.big && grade !== 'miss') s.bigs += 1;
  push(s, { kind: grade === 'miss' ? 'miss' : 'hit', grade, side: n.side, big: n.big, i: n.i });
}
const nextHit = (s) => { while (s.next < s.hits.length && s.res[s.hits[s.next]].grade != null) s.next += 1; return s.next < s.hits.length ? s.notes[s.hits[s.next]] : null; };
/** The roll or balloon a press at `at` falls in, if any. */
const longAt = (s, at) => s.notes.find((n) => (n.kind === 'roll' && at >= n.t - n.spacing / 2 && at <= n.end + n.spacing / 2) || (n.kind === 'balloon' && at >= n.t && at <= n.end && !s.res[n.i].done));

export const accOf = (s) => (s.judged ? s.score / s.judged : 1);
export function starsOf(s) {
  const a = accOf(s), st = s.level.stars ?? {};
  if (s.counts.miss === 0 && a >= (st[3] ?? 0.9)) return 3;
  return a >= (st[2] ?? 0.75) ? 2 : 1;
}

/** One stroke: `side` 'don' | 'ka', `hand` 0 | 1, at `at` ms of the run (the key's own time). `both` strikes both hands
    of the side at once (a big mark's two keys: the bot's, and a test's). */
export function act(s, d = {}) {
  if (d.g === 'restart') return { state: newGame('', 1, { levels: [s.level] }) };
  if (!s.live || s.phase !== 'play' || d.g !== 'hit') return { state: s, refused: true };
  const side = d.side === 'ka' ? 'ka' : d.side === 'don' ? 'don' : null;
  if (!side) return { state: s, refused: true };
  const at = Number.isFinite(Number(d.at)) ? Number(d.at) : s.clock;
  strike(s, side, Number(d.hand) || 0, at);
  if (d.both) strike(s, side, 1 - (Number(d.hand) || 0), at);
  return { state: s };
}
function strike(s, side, hand, at) {
  s.strokes[side] += 1;
  push(s, { kind: 'stroke', side });
  // a balloon or roll under way takes the stroke (they never overlap a hit mark)
  const long = longAt(s, at);
  if (long?.kind === 'balloon') {
    const r = s.res[long.i];
    if (r.last === side) return; // DrawableSwell: 咚 and 咔 in turn
    r.last = side; r.hits += 1;
    push(s, { kind: 'swell', left: long.need - r.hits });
    if (r.hits >= long.need) { r.done = true; s.counts.pop += 1; s.bonus += 1; push(s, { kind: 'pop' }); }
    return;
  }
  if (long?.kind === 'roll') {
    const tick = long.ticks.filter((k) => !k.hit && Math.abs(at - k.t) <= long.spacing / 2).sort((a, b) => Math.abs(at - a.t) - Math.abs(at - b.t))[0];
    if (tick) { tick.hit = true; s.counts.roll += 1; s.bonus += 0.1; }
    return;
  }
  // the second key of a big mark: the other hand, its side, within 30 ms of the first
  const prev = s.hits.slice(0, s.next).map((i) => s.notes[i]).reverse().find((n) => s.res[n.i].at != null);
  if (prev?.big && s.res[prev.i].strong == null && prev.side === side && s.res[prev.i].grade !== 'miss' && s.res[prev.i].hand !== hand && Math.abs(at - s.res[prev.i].at) <= SECOND_HIT_WINDOW) {
    s.res[prev.i].strong = true; s.counts.strong += 1; s.bonus += 1;
    push(s, { kind: 'strong', side });
    return;
  }
  const n = nextHit(s);
  if (!n) return;
  const grade = gradeOf(s.w, at - n.t);
  if (!grade) return; // too early for it: the press is for nothing (osu!taiko: no result)
  judge(s, n, n.side === side ? grade : 'miss', at, hand);
  nextHit(s);
}

/** The run goes on `ms`: marks gone by unstruck are missed, a balloon not burst costs, the small gong keeps the bar. */
export function tick(s, ms) {
  if (!s.live || s.phase !== 'play') return s;
  s.clock += ms;
  if (s.level.luo) while (s.bar < s.bars.length && s.bars[s.bar] <= s.clock) { push(s, { kind: 'luo' }); s.bar += 1; }
  for (let n = nextHit(s); n && s.clock - n.t > s.w.ok; n = nextHit(s)) judge(s, n, 'miss'); // HitWindows.CanBeHit
  for (const n of s.notes) {
    if (n.kind !== 'balloon' || s.res[n.i].done || s.clock <= n.end) continue;
    s.res[n.i].done = true;
    gain(s, -0.65 * s.g.miss); // TaikoSwellJudgement: IgnoreMiss −0.65
    push(s, { kind: 'flop' });
  }
  if (s.clock >= s.endAt) {
    if (s.hp >= CLEAR) { s.phase = 'won'; s.won = true; s.stars = starsOf(s); } else s.phase = 'failed';
  }
  return s;
}

/* What a step sounds (the runners' and the bot test's way: games/kit/heard.js): each stroke its drum, a big mark's 钹, a
   miss, the small gong on a bar, a balloon's burst. The page hears the run's events instead (mount's `hear`), the same names. */
export const soundSnap = (s) => ({ don: s.strokes?.don ?? 0, ka: s.strokes?.ka ?? 0, bigs: (s.bigs ?? 0) + (s.counts?.strong ?? 0), miss: s.counts?.miss ?? 0, bar: s.bar ?? 0, pop: s.counts?.pop ?? 0 });
export function sounds(b, a) {
  const out = [];
  for (const [k, ev] of [['don', 'don'], ['ka', 'ka'], ['bigs', 'big'], ['miss', 'miss'], ['bar', 'luo'], ['pop', 'pop']]) if ((a?.[k] ?? 0) > (b?.[k] ?? 0)) out.push(ev);
  return out;
}

/* ── The ladder (games.json) ─────────────────────────────────────────────────────────────────────────────────── */

/** The 游戏厅's ladder: the `taiko` rows that hold no story beat (a story row's level is its board's alone). */
export function ladderOf(registry) {
  return (registry?.games ?? []).filter((g) => g.id === meta.id && !g.task).flatMap((g) => g.levels ?? []);
}
/** The level a mount plays: `data.levels[0]`, else the ladder's `data.lv` (1-based, the 游戏厅's chips) or level id
    `data.level`, else the page's `?lv=`, else its first. Answers [level, its 1-based place, the ladder]. */
export async function levelFor(opts = {}) {
  if (opts.data?.levels?.length) return [opts.data.levels[0], 1, opts.data.levels];
  const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
  const reg = await res.json(), all = ladderOf(reg);
  const raw = opts.data?.lv ?? opts.data?.level ?? new URLSearchParams(globalThis.location?.search ?? '').get('lv') ?? opts.level;
  let k = all.findIndex((l) => l.id === raw);
  // a story row's own level, asked by id (the 游戏厅's story rows): played alone, off the ladder
  const own = k < 0 && (reg.games ?? []).filter((g) => g.id === meta.id).flatMap((g) => g.levels ?? []).find((l) => l.id === raw);
  if (own) return [own, 1, [own]];
  if (k < 0) k = Math.max(0, Math.min(all.length - 1, (Number(raw) || 1) - 1));
  return [all[k] ?? null, k + 1, all];
}

/* ── The page: a canvas, its own frame loop, D F J K and fingers ─────────────────────────────────────────────── */

export const W = 640, H = 400;
export const BAND_Y = 132, BAND_H = 74, RING_X = 104; // the band the marks roll along; the ring they are struck in
export const DRUM = { x: 320, y: 296, r: 92, head: 74 }; // the 堂鼓: its centre, its rim's outer radius, its head's
const MARK = 26; // a mark's radius (a big one ×1.4)
const ART = ['stage', 'drum', 'don', 'ka', 'roll'];
const artUrl = (name) => new URL(`../../worlds/jiuding/art/games/taiko/${name}.webp`, import.meta.url).href; // tools/paint-games.py
const tr = (v, lang) => (v && typeof v === 'object' ? v[lang] ?? v.zh ?? '' : v ?? '');
const SERIF = '"Songti SC", "Noto Serif SC", serif';
const RED = '176,53,42', BLUE = '52,72,110';
let uid = 0;

function loadArt(win) {
  return Object.fromEntries(ART.map((k) => {
    const img = new win.Image();
    img.decoding = 'async';
    img.src = artUrl(k);
    return [k, img];
  }));
}
const ready = (img) => img && img.complete && img.naturalWidth > 0;
/** Which side a point on the board strikes: the drum's head is 咚, anywhere else 咔 (its rim, or off the drum). */
export const sideAt = (x, y) => (Math.hypot(x - DRUM.x, y - DRUM.y) <= DRUM.head ? 'don' : 'ka');

export async function mount(container, opts = {}) {
  const { lang = 'zh', signal, winHold = 1600, reducedMotion = false, shell } = opts;
  const paused = () => Boolean(shell?.paused?.());
  const doc = container.ownerDocument, win = doc.defaultView;
  const [level, place, ladder] = await levelFor(opts);
  let s = newGame('', 1, { levels: level ? [level] : [] });
  opts.peek?.(() => s);
  const host = doc.createElement('div');
  host.className = 'game g-mounted';
  const id = `tk${++uid}`;
  host.innerHTML = `<div class="g-taiko" id="${id}" style="position:relative;aspect-ratio:16/10;width:min(100%, calc((100dvh - var(--game-reserve, 150px)) * 16 / 10));`
    + 'margin:0 auto;user-select:none;-webkit-user-select:none;touch-action:none;border-radius:10px;overflow:hidden;background:#2b2219">'
    + `<canvas style="display:block;width:100%;height:100%" aria-label="${tr(level?.title ?? meta.name, lang)}"></canvas></div>`;
  container.replaceChildren(host);
  if (!s.live) return { won: false, left: true };
  const t = T[lang] || T.zh;
  const still = reducedMotion || Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const box = host.querySelector('.g-taiko'), cv = host.querySelector('canvas'), cx = cv.getContext('2d');
  const art = loadArt(win);
  const device = await import('./kit/device.js');
  const hint = device.forInput(t.hint);
  const inputDesk = !/touch/.test(String(device.inputKind(doc)));
  const measure = () => {
    const dpr = Math.min(2, win.devicePixelRatio || 1), r = box.getBoundingClientRect();
    if (!r.width) return;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    cx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  };
  const ro = win.ResizeObserver ? new win.ResizeObserver(measure) : null;
  ro?.observe(box);
  measure();

  // what the eye keeps of the run: each key's press (a lit seal, a lit head or rim), the grade word, the balloon's count
  const down = { d: false, f: false, j: false, k: false };
  const fx = { lit: { don: -1e9, ka: -1e9 }, word: null, burst: [], swell: null };
  const hear = () => {
    for (const e of s.events.splice(0)) {
      if (e.kind === 'stroke') { shell?.sound?.(e.side); fx.lit[e.side] = s.clock; }
      else if (e.kind === 'hit') {
        if (e.big) shell?.sound?.('big');
        fx.word = { text: t[e.grade], grade: e.grade, at: s.clock };
        if (!still) fx.burst.push({ at: s.clock, side: e.side, big: e.big });
      } else if (e.kind === 'miss') { shell?.sound?.('miss'); fx.word = { text: t.miss, grade: 'miss', at: s.clock }; }
      else if (e.kind === 'strong') shell?.sound?.('big');
      else if (e.kind === 'swell') fx.swell = e.left;
      else if (e.kind === 'pop') { shell?.sound?.('pop'); fx.swell = null; }
      else if (e.kind === 'flop') fx.swell = null;
      else if (e.kind === 'luo') shell?.sound?.('luo');
    }
    fx.burst = fx.burst.filter((b) => s.clock - b.at < 360);
  };

  const v = (W - RING_X + MARK * 2) / (Number(s.level.scroll) || 2200); // px a ms
  const xOf = (time) => RING_X + (time - s.clock) * v;
  const markArt = (side, x, y, r, alpha = 1) => {
    cx.globalAlpha = alpha;
    const a = art[side];
    if (ready(a)) cx.drawImage(a, x - r, y - r, r * 2, r * 2);
    else { cx.fillStyle = `rgb(${side === 'don' ? RED : BLUE})`; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill(); }
    cx.globalAlpha = 1;
  };
  const glow = (side) => { const g = s.clock - fx.lit[side]; return still ? (g < 140 ? 1 : 0) : Math.max(0, 1 - g / 180); };
  const seal = (x, y, c, on, size = 20) => {
    cx.beginPath(); cx.roundRect ? cx.roundRect(x - size / 2, y - size / 2, size, size, 3) : cx.rect(x - size / 2, y - size / 2, size, size);
    if (on) { cx.fillStyle = `rgba(${RED},.88)`; cx.fill(); } else { cx.fillStyle = 'rgba(240,230,206,.66)'; cx.fill(); cx.strokeStyle = `rgba(${RED},.6)`; cx.lineWidth = 1.2; cx.stroke(); }
    cx.fillStyle = on ? 'rgba(244,234,214,.96)' : `rgba(150,40,32,.9)`;
    cx.font = `700 12px ${SERIF}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(c, x, y + 0.5);
  };
  const draw = () => {
    // the stage, painted (cover)
    if (ready(art.stage)) {
      const a = art.stage, k = Math.max(W / a.naturalWidth, H / a.naturalHeight), w = a.naturalWidth * k, h = a.naturalHeight * k;
      cx.drawImage(a, (W - w) / 2, (H - h) / 2, w, h);
    } else { cx.fillStyle = '#3a2c1e'; cx.fillRect(0, 0, W, H); }
    // the band: a strip of paper the marks roll along, and the ring they are struck in
    cx.fillStyle = 'rgba(236,224,198,.78)'; cx.fillRect(0, BAND_Y - BAND_H / 2, W, BAND_H);
    cx.fillStyle = 'rgba(58,42,28,.5)'; cx.fillRect(0, BAND_Y - BAND_H / 2 - 2, W, 2); cx.fillRect(0, BAND_Y + BAND_H / 2, W, 2);
    const ring = Math.max(glow('don'), glow('ka'));
    cx.lineWidth = 3; cx.strokeStyle = `rgba(58,42,28,${0.55 + 0.4 * ring})`;
    cx.beginPath(); cx.arc(RING_X, BAND_Y, MARK + 4, 0, 7); cx.stroke();
    cx.lineWidth = 1; cx.strokeStyle = 'rgba(58,42,28,.35)'; cx.beginPath(); cx.arc(RING_X, BAND_Y, MARK * 1.4 + 6, 0, 7); cx.stroke();
    // the marks, last first so the nearest sits on top
    for (let k = s.notes.length - 1; k >= 0; k -= 1) {
      const n = s.notes[k], r = s.res[n.i], x = xOf(n.t);
      if (n.kind === 'hit') {
        if (r.grade && r.grade !== 'miss') continue; // struck: gone (its burst stays)
        if (x < -40 || x > W + 60) continue;
        markArt(n.side, x, BAND_Y, MARK * (n.big ? 1.4 : 1), r.grade === 'miss' ? 0.3 : 1);
      } else {
        const x2 = xOf(n.end);
        if (x2 < -40 || x > W + 60) continue;
        if (n.kind === 'roll') {
          const a = art.roll, h = MARK * 1.5;
          if (ready(a)) cx.drawImage(a, x, BAND_Y - h / 2, Math.max(MARK, x2 - x + MARK), h);
          else { cx.fillStyle = 'rgba(206,150,62,.85)'; cx.fillRect(x, BAND_Y - h / 3, x2 - x + MARK, h / 1.5); }
          markArt('don', x, BAND_Y, MARK, 0.9);
        } else if (!r.done) {
          // a balloon waits at the ring while it is struck, its count on it
          const bx = Math.max(RING_X, x);
          markArt('don', bx, BAND_Y, MARK * 1.25);
          const left = n.need - r.hits;
          cx.font = `700 18px ${SERIF}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = 'rgba(244,234,214,.96)';
          cx.fillText(String(left), bx, BAND_Y + 1);
        }
      }
    }
    // bursts where a mark was struck
    for (const b of fx.burst) {
      const k = (s.clock - b.at) / 360, rr = MARK * (b.big ? 1.4 : 1) * (1 + k * 0.8);
      cx.globalAlpha = 1 - k; cx.lineWidth = 4 * (1 - k) + 1; cx.strokeStyle = `rgb(${b.side === 'don' ? RED : BLUE})`;
      cx.beginPath(); cx.arc(RING_X, BAND_Y, rr, 0, 7); cx.stroke(); cx.globalAlpha = 1;
    }
    // the grade word over the ring
    if (fx.word && s.clock - fx.word.at < 520) {
      const k = (s.clock - fx.word.at) / 520;
      cx.globalAlpha = 1 - k * k; cx.textAlign = 'center'; cx.textBaseline = 'alphabetic';
      cx.font = `700 24px ${SERIF}`; cx.lineWidth = 5; cx.lineJoin = 'round'; cx.strokeStyle = 'rgba(240,230,206,.92)';
      cx.fillStyle = fx.word.grade === 'great' ? '#9a6a1c' : fx.word.grade === 'ok' ? '#3a2c1e' : '#b0352a';
      const y = BAND_Y - BAND_H / 2 - 8 - (still ? 0 : k * 8);
      cx.strokeText(fx.word.text, RING_X, y); cx.fillText(fx.word.text, RING_X, y); cx.globalAlpha = 1;
    }
    // the drum: its head lights for 咚, its rim for 咔
    const D = DRUM, headLit = Math.max(glow('don'), down.f || down.j ? 1 : 0), rimLit = Math.max(glow('ka'), down.d || down.k ? 1 : 0);
    if (ready(art.drum)) cx.drawImage(art.drum, D.x - D.r, D.y - D.r, D.r * 2, D.r * 2);
    else { cx.fillStyle = '#8a3a26'; cx.beginPath(); cx.arc(D.x, D.y, D.r, 0, 7); cx.fill(); cx.fillStyle = '#e8d9b8'; cx.beginPath(); cx.arc(D.x, D.y, D.head, 0, 7); cx.fill(); }
    if (headLit > 0) { cx.fillStyle = `rgba(${RED},${0.32 * headLit})`; cx.beginPath(); cx.arc(D.x, D.y, D.head, 0, 7); cx.fill(); }
    if (rimLit > 0) { cx.lineWidth = D.r - D.head; cx.strokeStyle = `rgba(${BLUE},${0.38 * rimLit})`; cx.beginPath(); cx.arc(D.x, D.y, (D.r + D.head) / 2, 0, 7); cx.stroke(); }
    // the keys beside the drum, the whole run (Hanli 10-28: 「最好在游戏开始后一直保持显示, 给个提示」): F J on the head's two
    // sides (咚), D K out past the rim (咔); a seal fills while its key is down (still, never a flash). A finger gets the
    // drum's two places named instead: 鼓心 · 鼓边.
    cx.textBaseline = 'middle'; cx.textAlign = 'center';
    if (inputDesk) {
      seal(D.x - D.head * 0.5, D.y, 'F', down.f); seal(D.x + D.head * 0.5, D.y, 'J', down.j);
      seal(D.x - D.r - 26, D.y, 'D', down.d); seal(D.x + D.r + 26, D.y, 'K', down.k);
      cx.font = `13px ${SERIF}`; cx.lineWidth = 3; cx.lineJoin = 'round'; cx.strokeStyle = 'rgba(240,230,206,.85)';
      for (const [x, y, w, c] of [[D.x, D.y + 24, t.don, RED], [D.x - D.r - 26, D.y + 24, t.ka, BLUE], [D.x + D.r + 26, D.y + 24, t.ka, BLUE]]) {
        cx.fillStyle = `rgb(${c})`; cx.strokeText(w, x, y); cx.fillText(w, x, y);
      }
    } else {
      cx.font = `600 14px ${SERIF}`; cx.lineWidth = 3; cx.lineJoin = 'round'; cx.strokeStyle = 'rgba(240,230,206,.85)';
      cx.fillStyle = `rgb(${RED})`; cx.strokeText(t.head, D.x, D.y); cx.fillText(t.head, D.x, D.y);
      for (const x of [D.x - D.r - 34, D.x + D.r + 34]) { cx.fillStyle = `rgb(${BLUE})`; cx.strokeText(t.rim, x, D.y); cx.fillText(t.rim, x, D.y); }
    }
    // the 魂 gauge across the top: empty at the start, the clear line at its half
    const gx = 150, gw = W - gx - 24, gy = 18;
    cx.fillStyle = 'rgba(240,230,206,.82)'; cx.fillRect(gx - 4, gy - 4, gw + 8, 16); // paper under it, over the eaves
    cx.fillStyle = 'rgba(58,42,28,.28)'; cx.fillRect(gx, gy, gw, 8);
    cx.fillStyle = s.hp >= CLEAR ? '#b0352a' : '#a8792e'; cx.fillRect(gx, gy, gw * s.hp, 8);
    cx.fillStyle = 'rgba(46,32,20,.85)'; cx.fillRect(gx + gw * CLEAR - 1, gy - 4, 2, 16);
    cx.font = `700 13px ${SERIF}`; cx.textAlign = 'left'; cx.textBaseline = 'middle'; cx.lineWidth = 3; cx.strokeStyle = 'rgba(240,230,206,.85)';
    cx.fillStyle = s.hp >= CLEAR ? '#b0352a' : 'rgba(46,32,20,.85)'; cx.strokeText(t.soul, gx + gw + 4 - 18, gy + 20); cx.fillText(t.soul, gx + gw + 4 - 18, gy + 20);
    // the tune's name, the run's count, the combo
    cx.textBaseline = 'top'; cx.font = `600 15px ${SERIF}`; cx.fillStyle = 'rgba(46,32,20,.92)'; cx.textAlign = 'left';
    cx.lineWidth = 4; cx.lineJoin = 'round'; cx.strokeStyle = 'rgba(240,230,206,.88)';
    cx.strokeText(tr(s.level.title, lang), 16, 12); cx.fillText(tr(s.level.title, lang), 16, 12);
    cx.font = `13px ${SERIF}`;
    const acc = `${t.acc} ${(accOf(s) * 100).toFixed(1)}%`;
    cx.strokeText(acc, 16, 34); cx.fillText(acc, 16, 34);
    if (s.combo >= 3) {
      cx.textAlign = 'center'; cx.font = `700 22px ${SERIF}`; cx.fillStyle = 'rgba(46,32,20,.85)';
      cx.strokeText(String(s.combo), RING_X, BAND_Y + BAND_H / 2 + 8); cx.fillText(String(s.combo), RING_X, BAND_Y + BAND_H / 2 + 8);
    }
    // the hint, until the first mark comes
    if (s.clock < (s.notes[0]?.t ?? 0) - 400) {
      cx.textAlign = 'center'; cx.textBaseline = 'top'; cx.font = `14px ${SERIF}`; cx.fillStyle = 'rgba(46,32,20,.9)';
      cx.strokeText(hint, W / 2, BAND_Y + BAND_H / 2 + 12); cx.fillText(hint, W / 2, BAND_Y + BAND_H / 2 + 12);
    }
  };

  return new Promise((resolve) => {
    let done = false, raf = 0, prev = win.performance.now();
    const off = [];
    const on = (el, type, fn, o) => { el.addEventListener(type, fn, o); off.push(() => el.removeEventListener(type, fn, o)); };
    off.push(() => ro?.disconnect());
    const finish = (r) => { if (done) return; done = true; win.cancelAnimationFrame(raf); off.forEach((f) => f()); resolve(r); };
    const at = (stamp) => s.clock + Math.max(0, Math.min(60, (stamp ?? win.performance.now()) - prev));
    const hit = (side, hand, stamp) => { act(s, { g: 'hit', side, hand, at: at(stamp) }); hear(); };
    let again = null;
    const anew = () => { s = act(s, { g: 'restart' }).state; fx.word = null; fx.burst = []; fx.swell = null; prev = win.performance.now(); };
    const restartBtn = () => host.closest('.gshell')?.querySelector(':scope > .gshell-bar [data-g="restart"]');
    const frame = (now) => {
      if (done) return;
      const dt = Math.min(100, now - prev);
      prev = now;
      if (doc.visibilityState === 'visible' && !paused() && !again) { tick(s, dt); hear(); }
      draw();
      const can = meta.restart(s) && !again;
      const rb = restartBtn();
      if (rb && rb.disabled === can) rb.disabled = !can;
      if (s.phase === 'won') {
        done = true; win.cancelAnimationFrame(raf); off.forEach((f) => f());
        const next = place < ladder.length ? place + 1 : null;
        const grade = s.level.grades?.[s.stars];
        win.setTimeout(() => resolve({ won: true, stars: s.stars, ...(grade != null ? { grade } : {}), ...(next ? { next } : {}) }), winHold);
        return;
      }
      if (s.phase === 'failed' && !again) {
        again = (shell?.lead ? shell.lead(t.again, { count: true, lang, reducedMotion: still }) : new Promise((r) => win.setTimeout(r, 1500)))
          .then(() => { anew(); again = null; });
      }
      raf = win.requestAnimationFrame(frame);
    };
    const pointAt = (e) => { const r = box.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
    on(doc, 'click', (e) => {
      const b = e.target.closest?.('.gshell-bar [data-g="restart"]');
      if (!b || b !== restartBtn() || b.disabled || paused() || again) return;
      e.preventDefault();
      anew();
    });
    const fingers = new Map();
    on(box, 'pointerdown', (e) => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || paused() || again) return;
      e.preventDefault();
      const [x, y] = pointAt(e);
      const hand = x < DRUM.x ? 0 : 1;
      fingers.set(e.pointerId, hand);
      hit(sideAt(x, y), hand, e.timeStamp);
    });
    const up = (e) => fingers.delete(e.pointerId);
    on(doc, 'pointerup', up);
    on(doc, 'pointercancel', up);
    on(box, 'contextmenu', (e) => e.preventDefault());
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '') || e.target?.isContentEditable;
    on(doc, 'keydown', (e) => {
      const key = (e.key ?? '').toLowerCase(), k = meta.keys[key];
      if (!k || e.metaKey || e.ctrlKey || e.altKey || typing(e) || !host.isConnected || paused() || again) return;
      e.preventDefault();
      if (e.repeat) return;
      down[key] = true;
      hit(k[0], k[1], e.timeStamp);
    });
    on(doc, 'keyup', (e) => { const key = (e.key ?? '').toLowerCase(); if (key in down) down[key] = false; });
    on(win, 'blur', () => { for (const k of Object.keys(down)) down[k] = false; });
    if (signal) {
      if (signal.aborted) return finish({ won: false, left: true });
      signal.addEventListener('abort', () => finish({ won: false, left: true }), { once: true });
    }
    // dev: the run, read from outside (a live check drives the keys off the run's own clock)
    if (opts.dev ?? /[?&]dev=1/.test(win.location?.search ?? '')) win.__taiko = { state: () => s };
    raf = win.requestAnimationFrame(frame);
  });
}
