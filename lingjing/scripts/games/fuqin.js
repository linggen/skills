// 抚琴 · the tiles board (Hanli 10-27: 「你不要自己发明这种游戏了」「节奏类, 如果有开源的成熟玩法可以借鉴」「比如弹钢琴的那种
// 节奏类游戏可以」). A classic, not an invention: Piano Tiles (别踩白块 / Magic Tiles) on the rules of osu!mania.
//
//   Four lanes; tiles fall to the line; press a lane as its tile reaches it (D F J K, or a finger on the lane). Each tile
//   is the next note of a real tune, so a clean run plays the melody. A long tile is held to its end. A press on an empty
//   lane is a wrong note (Piano Tiles' 「别踩白块」, softened from game-over to the gauge), so mashing never wins.
//
// PORTED FROM osu! (https://github.com/ppy/osu, the osu!mania ruleset) — MIT Licence, Copyright (c) ppy Pty Ltd
// <contact@ppy.sh>; the licence text is games/fuqin/LICENSE. Only code ideas and numbers are taken, no asset:
//   · hit windows by OD: ManiaHitWindows.cs (great 64/49/34, meh 151/136/121, miss 188/173/158 ms at OD 0/5/10,
//     IBeatmapDifficultyInfo.DifficultyRange's two-piece line, floor + 0.5), and its DifficultyMultiplier (`ease`
//     here: above 1 widens them, for a first level);
//   · one note at a time in a lane: the earliest unjudged note takes the press (mania's OrderedHitPolicy); a press
//     earlier than the miss window does nothing, inside it but outside meh is a miss (DrawableNote.CheckForResult);
//     a note never pressed is missed once its miss window has gone by;
//   · hold notes: a head judged as a note, a body that breaks on an early release, a tail judged on release with
//     the window widened 1.5× (TailNote.RELEASE_WINDOW_LENIENCE; DrawableHoldNoteTail divides the offset), capped at
//     可 when the head was missed or the body broke (GetCappedResult);
//   · the gauge: ManiaHealthProcessor's table — a miss costs (DR+1)·0.0075, a head or tail miss half that, a good
//     hit gives back (0.005 − DR·0.0005) — scaled for a 30-note tune; zero health fails the run;
//   · accuracy as osu! counts it: 良 300, 可 100, 不可 0, over 300 a judgement.
// Ours, on top: three grades named as Taiko names them (良 · 可 · 不可: great · meh-or-better · miss); a long tile still
// held at its end finishes itself (Piano Tiles' long tile — osu! wants the release); the wrong note above; the tune's
// own pitches, one a tile, played through the shell (sounds.json `qin.<midi>`), and a low drone on each bar's first
// beat to keep time. A failed run plays the tune again from the top under the shell's lead card: a story board never
// settles a loss.
//
// Levels are data (worlds/jiuding/games.json, the `fuqin` row's `levels`), the tune written in 简谱 (jianpu):
//   tune   "3 3_5_ 6_1'_ 1'_6_ | 5 5_6_ 5 -"  a digit 1–7 (0 a rest); ' an octave up, , an octave down; each _ halves
//          it, . makes it dotted; notes beamed together are written together (3_5_); a lone - holds the note before
//          one beat more; | is a bar line (read, then ignored)
//   key    the midi number of 1 (65 = F4)      bpm, meter (beats a bar)    fall (ms a tile takes from top to line)
//   od · ease · drain   the windows (OD 0–10, ease ≥ 1 widens) and the gauge's DR
//   holds · holdMin     long notes (≥ holdMin beats) become held tiles; off, every note is a tap
//   drone  the drone's midi (null: none)       title · say · end ({zh, en})    stars {2: acc, 3: acc} (3 also wants no 不可)
//   look   'qin' (古: ink keys on the 古琴's strings) — the art, games/fuqin/art/
// Pure model: newGame / act / tick (the bot and tests drive these); the page is `mount` (its own frame loop).

/* ── The windows (ManiaHitWindows.cs, osu! MIT) ─────────────────────────────────────────────────────────────── */

const RANGES = { good: [64, 49, 34], ok: [151, 136, 121], miss: [188, 173, 158] }; // ms at OD 0 · 5 · 10
/** IBeatmapDifficultyInfo.DifficultyRange: a two-piece line through OD 0, 5 and 10. */
export const odRange = (od, [o0, o5, o10]) => (od > 5 ? o5 + ((o10 - o5) * (od - 5)) / 5 : od < 5 ? o5 + ((o0 - o5) * (5 - od)) / 5 : o5);
/** The level's three windows in ms (± about the note): 良 inside `good`, 可 inside `ok`, 不可 inside `miss`. */
export function windowsOf(level = {}) {
  const od = Math.max(0, Math.min(10, Number(level.od ?? 5))), ease = Math.max(0.5, Number(level.ease ?? 1));
  return Object.fromEntries(Object.entries(RANGES).map(([k, r]) => [k, Math.floor(odRange(od, r) * ease) + 0.5]));
}
export const TAIL_LENIENCE = 1.5; // TailNote.RELEASE_WINDOW_LENIENCE
/** What an offset (press − note, ms) earns: 'good' · 'ok' · 'miss', or null outside every window (the press is not for it). */
export function gradeOf(w, off) {
  const a = Math.abs(off);
  return a <= w.good ? 'good' : a <= w.ok ? 'ok' : a <= w.miss ? 'miss' : null;
}

/* ── The gauge (ManiaHealthProcessor.cs, osu! MIT; scaled ×K for a short tune) ────────────────────────────────── */

const K_LOSS = 2.6, K_GAIN = 8;
export function hpDelta(grade, drain = 5, part = 'note') {
  const dr = Number(drain);
  if (grade === 'miss') return -(dr + 1) * (part === 'note' ? 0.0075 : 0.00375) * K_LOSS;
  if (grade === 'good') return Math.max(0.004, (0.005 - dr * 0.0005) * K_GAIN);
  return 0; // 可: osu!'s Ok neither gives nor takes
}
const SCORE = { good: 300, ok: 100, miss: 0 };

/* ── 简谱 → notes ──────────────────────────────────────────────────────────────────────────────────────────── */

const SCALE = [0, 2, 4, 5, 7, 9, 11]; // 1–7 in a major key
/** A tune in 简谱 → [{ beat, len, midi }] (rests dropped). Throws on a token it cannot read. */
export function readTune(text, key = 65) {
  const out = [];
  out.bars = [0]; // the beat each bar starts on (its | marks): a tune may change metre (茉莉花's one 2/4 bar)
  let beat = 0, last = null;
  for (const tok of String(text ?? '').split(/\s+/).filter(Boolean)) {
    if (tok === '|') { out.bars.push(beat); continue; }
    if (tok === '-') { if (!last) throw new Error('fuqin tune: "-" with no note before it'); last.len += 1; beat += 1; continue; }
    // a beamed group ("3_5_", "6_1'_") is its notes written together
    const parts = [...tok.matchAll(/([0-7])([',]*)(_*)(\.?)/g)];
    if (!parts.length || parts.map((m) => m[0]).join('') !== tok) throw new Error(`fuqin tune: cannot read "${tok}"`);
    for (const [, d, oct, halves, dot] of parts) {
      const len = (1 / 2 ** halves.length) * (dot ? 1.5 : 1);
      if (d === '0') { last = null; beat += len; continue; }
      const up = [...oct].reduce((n, c) => n + (c === "'" ? 1 : -1), 0);
      last = { beat, len, midi: key + SCALE[Number(d) - 1] + 12 * up };
      out.push(last);
      beat += len;
    }
  }
  return out;
}

export const LANES = 4;
const LEAD_MS = 1000; // the first note reaches the line this long after its tile has fallen in
/** The level's notes in play order: [{ i, t, end, hold, lane, midi }] in ms from the start. Each pitch has its lane
    (the tune's notes low to high over the four, so the melody keeps its shape), a different note never repeats the
    lane just played, and nothing lands on a lane still holding a long tile. */
export function chartOf(level) {
  const beatMs = 60000 / (Number(level.bpm) || 72), fall = Number(level.fall) || 2000;
  const notes = readTune(level.tune, level.key ?? 65);
  const start = fall + LEAD_MS;
  const busy = Array(LANES).fill(-Infinity); // when each lane's held tile lets go
  // a pitch's own lane: the tune's notes, low to high, spread over the four (Magic Tiles keeps the melody's shape)
  const pitches = [...new Set(notes.map((n) => n.midi))].sort((a, b) => a - b);
  const home = (m) => Math.min(LANES - 1, Math.floor((pitches.indexOf(m) * LANES) / pitches.length));
  let lane = 1, prev = null;
  return notes.map((n, i) => {
    const t = start + n.beat * beatMs;
    const hold = Boolean(level.holds) && n.len >= (level.holdMin ?? 2);
    const end = hold ? t + (n.len - 0.5) * beatMs : t;
    lane = home(n.midi);
    // a different note never lands in the lane just played: one step the way the tune went (or back, at the edge)
    if (prev && n.midi !== prev.midi && lane === prev.lane) {
      const up = n.midi > prev.midi ? 1 : -1;
      lane = lane + up >= 0 && lane + up < LANES ? lane + up : lane - up;
    }
    // a lane still holding a long tile is taken: the nearest free one
    if (busy[lane] > t - 120) {
      const free = [...Array(LANES).keys()].filter((k) => busy[k] <= t - 120).sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane));
      if (free.length) lane = free[0];
    }
    if (hold) busy[lane] = end;
    prev = { midi: n.midi, lane };
    return { i, t: Math.round(t), end: Math.round(end), hold, lane, midi: n.midi };
  });
}
/** Each bar's first beat while the tune plays (the drone): the tune's own bar lines, else every `meter` beats. */
export function barsOf(level, notes) {
  if (level.drone == null || !notes.length) return [];
  const beatMs = 60000 / (Number(level.bpm) || 72), start = (Number(level.fall) || 2000) + LEAD_MS;
  const lastBeat = (Math.max(...notes.map((n) => n.end)) - start) / beatMs;
  const marked = readTune(level.tune, level.key ?? 65).bars;
  const beats = marked.length > 1 ? marked : [...Array(Math.ceil(lastBeat / (Number(level.meter) || 4)) + 1).keys()].map((k) => k * (Number(level.meter) || 4));
  return beats.filter((b) => b <= lastBeat).map((b) => Math.round(start + b * beatMs));
}

/* ── The model ──────────────────────────────────────────────────────────────────────────────────────────────── */

export const T = {
  zh: {
    good: '良', ok: '可', miss: '不可', wrong: '错音', combo: '连', acc: '准', again: '弦断了。从头再弹一遍。',
    hint: { desk: 'D F J K 四键 · 长条按住到尾', touch: '点落到琴码的那一格 · 长条按住到尾' },
    won: ['曲子弹完了。', '弹得稳。', '一音不错。'],
  },
  en: {
    good: 'Great', ok: 'Fair', miss: 'Miss', wrong: 'Wrong note', combo: 'combo', acc: 'acc', again: 'A string snapped. From the top again.',
    hint: { desk: 'D F J K · hold a long tile to its end', touch: 'Tap the lane as its tile reaches the bridge · hold long tiles' },
    won: ['The tune is played through.', 'Steady hands.', 'Not a note wrong.'],
  },
};

export const meta = {
  id: 'fuqin',
  pause: true, //  its own loop reads the shell's pause
  beat: 'mount', // its own frame loop draws it (never the page's 50 ms html redraw)
  tall: true, //   portrait, as Piano Tiles plays
  aspect: 9 / 16,
  sounds: ['note', 'drone', 'miss', 'wrong'],
  name: { zh: '抚琴', en: 'The qin' },
  how: {
    zh: '琴键落到琴码时按下那一格（D F J K，或用手指点）；长条按住到尾。每一下都是曲子的下一个音。',
    en: 'Strike a lane as its key reaches the bridge (D F J K, or tap it); hold a long key to its end. Each key is the next note of the tune.',
  },
  keys: { d: 0, f: 1, j: 2, k: 3 },
  // ↺ in the shell's bar (games/shell.js restartOf): the tune from the top, once it has begun
  restart: (s) => Boolean(s?.live && s.phase === 'play' && s.clock > 0),
};

/** A fresh run of `deal.levels[0]` (or `deal.level` itself). */
export function newGame(_seed, _n = 1, deal = {}) {
  const level = deal.levels?.[0] ?? deal.level ?? null;
  if (!level?.tune) return { live: false, level };
  const notes = chartOf(level);
  return {
    live: true, level, notes, bars: barsOf(level, notes), w: windowsOf(level),
    res: notes.map(() => ({ head: null, tail: null, broke: false })),
    next: Array(LANES).fill(0), // per lane: the first note there not yet done with (an index into `lanes`)
    lanes: [...Array(LANES).keys()].map((k) => notes.filter((n) => n.lane === k).map((n) => n.i)),
    held: Array(LANES).fill(null), // a lane's held tile (a note index) while its key is down on it
    down: Array(LANES).fill(false),
    clock: 0, bar: 0, hp: 1, combo: 0, best: 0, score: 0, judged: 0,
    counts: { good: 0, ok: 0, miss: 0, wrong: 0 },
    endAt: (notes.length ? Math.max(...notes.map((n) => n.end)) : 0) + 1200,
    events: [], phase: 'play', won: false, stars: 0,
  };
}

const push = (s, e) => { s.events.push({ at: s.clock, ...e }); if (s.events.length > 200) s.events.shift(); };
function judge(s, n, part, grade) {
  const r = s.res[n.i];
  if (part === 'tail' && grade !== 'miss' && (r.head === 'miss' || r.broke)) grade = 'ok'; // GetCappedResult
  r[part] = grade;
  s.counts[grade] += 1;
  s.judged += 1;
  s.score += SCORE[grade];
  s.hp = Math.min(1, s.hp + hpDelta(grade, s.level.drain, n.hold ? part : 'note'));
  if (grade === 'miss') s.combo = 0; else { s.combo += 1; s.best = Math.max(s.best, s.combo); }
  push(s, { kind: grade === 'miss' ? 'miss' : 'hit', grade, part, lane: n.lane, i: n.i, midi: n.midi });
  if (s.hp <= 0) { s.hp = 0; s.phase = 'failed'; }
}
/** The note a press in `lane` would go to: the lane's first not yet done with. */
const headIn = (s, lane) => {
  for (let k = s.next[lane]; k < s.lanes[lane].length; k += 1) { const n = s.notes[s.lanes[lane][k]]; if (s.res[n.i].head == null) return n; }
  return null;
};
/** A long tile whose head is missed is lost whole: its tail goes with it (osu! misses both). */
function lose(s, n) { if (!n.hold) return; s.res[n.i].broke = true; if (s.res[n.i].tail == null && s.phase === 'play') judge(s, n, 'tail', 'miss'); }
const doneWith = (s, n) => { const r = s.res[n.i]; return r.head != null && (!n.hold || r.tail != null); };
function advance(s, lane) { while (s.next[lane] < s.lanes[lane].length && doneWith(s, s.notes[s.lanes[lane][s.next[lane]]])) s.next[lane] += 1; }

export const accOf = (s) => (s.judged ? s.score / (300 * s.judged) : 1);
export function starsOf(s) {
  const a = accOf(s), st = s.level.stars ?? {};
  if (s.counts.miss === 0 && s.counts.wrong === 0 && a >= (st[3] ?? 0.9)) return 3;
  return a >= (st[2] ?? 0.75) ? 2 : 1;
}

/** A press or a release, at `at` ms of the run (the key's own time, not the frame's). */
export function act(s, d = {}) {
  if (d.g === 'restart') return { state: newGame('', 1, { levels: [s.level] }) };
  if (!s.live || s.phase !== 'play') return { state: s, refused: true };
  const lane = Number(d.lane), at = Number.isFinite(Number(d.at)) ? Number(d.at) : s.clock;
  if (!(lane >= 0 && lane < LANES)) return { state: s, refused: true };
  if (d.g === 'press') {
    if (s.down[lane]) return { state: s }; // a key's auto-repeat
    s.down[lane] = true;
    const n = headIn(s, lane);
    const grade = n ? gradeOf(s.w, at - n.t) : null;
    if (!grade) {
      // nothing in reach here, or too early for it: a wrong note (Piano Tiles' white tile), unless a tile is near
      // (an early press within reach of nothing still costs: mashing never wins)
      s.counts.wrong += 1;
      s.combo = 0;
      s.hp = Math.max(0, s.hp + hpDelta('miss', s.level.drain, 'tail'));
      push(s, { kind: 'wrong', lane });
      if (s.hp <= 0) s.phase = 'failed';
      return { state: s };
    }
    judge(s, n, 'head', grade);
    if (n.hold && grade !== 'miss') s.held[lane] = n.i;
    else lose(s, n);
    advance(s, lane);
    return { state: s };
  }
  if (d.g === 'release') {
    s.down[lane] = false;
    const i = s.held[lane];
    if (i == null) return { state: s };
    s.held[lane] = null;
    const n = s.notes[i], r = s.res[i];
    if (r.tail != null) return { state: s };
    // DrawableHoldNoteTail: the offset over the 1.5× lenience; too early for the tail's window breaks the body
    const g = gradeOf(s.w, (at - n.end) / TAIL_LENIENCE);
    if (g) judge(s, n, 'tail', g);
    else { r.broke = true; judge(s, n, 'tail', 'miss'); }
    advance(s, lane);
    return { state: s };
  }
  return { state: s, refused: true };
}

/** The run goes on `ms`: notes gone by unpressed are missed, a long tile held to its end finishes, the drone sounds. */
export function tick(s, ms) {
  if (!s.live || s.phase !== 'play') return s;
  s.clock += ms;
  while (s.bar < s.bars.length && s.bars[s.bar] <= s.clock) { push(s, { kind: 'drone', midi: s.level.drone }); s.bar += 1; }
  for (let lane = 0; lane < LANES; lane += 1) {
    const h = s.held[lane];
    if (h != null && s.clock >= s.notes[h].end) { s.held[lane] = null; judge(s, s.notes[h], 'tail', 'good'); } // Piano Tiles' long tile
    for (let k = s.next[lane]; k < s.lanes[lane].length; k += 1) {
      const n = s.notes[s.lanes[lane][k]], r = s.res[n.i];
      if (n.t - s.w.miss > s.clock) break;
      if (r.head == null && s.clock - n.t > s.w.miss) { judge(s, n, 'head', 'miss'); lose(s, n); }
      if (n.hold && r.head != null && r.tail == null && s.held[lane] !== n.i && s.clock - n.end > s.w.miss * TAIL_LENIENCE) judge(s, n, 'tail', 'miss');
      if (s.phase !== 'play') return s;
    }
    advance(s, lane);
  }
  if (s.clock >= s.endAt && s.phase === 'play') { s.phase = 'won'; s.won = true; s.stars = starsOf(s); }
  return s;
}

/* ── The ladder (games.json) ─────────────────────────────────────────────────────────────────────────────────── */

export function ladderOf(registry) {
  return (registry?.games ?? []).filter((g) => g.id === meta.id).flatMap((g) => g.levels ?? []);
}
/** The level a mount plays: `data.levels[0]`, else the ladder's `data.lv` (1-based, the 游戏厅's chips) or level id
    `data.level`, else the page's `?lv=`, else its first. Answers [level, its 1-based place, the ladder]. */
export async function levelFor(opts = {}) {
  if (opts.data?.levels?.length) return [opts.data.levels[0], 1, opts.data.levels];
  const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
  const all = ladderOf(await res.json());
  const raw = opts.data?.lv ?? opts.data?.level ?? new URLSearchParams(globalThis.location?.search ?? '').get('lv') ?? opts.level;
  let k = all.findIndex((l) => l.id === raw);
  if (k < 0) k = Math.max(0, Math.min(all.length - 1, (Number(raw) || 1) - 1));
  return [all[k] ?? null, k + 1, all];
}

/* ── The page: a canvas, its own frame loop, D F J K and fingers ─────────────────────────────────────────────── */

export const W = 360, H = 640, LINE_Y = 548, SIDE = 22;
export const laneW = (W - 2 * SIDE) / LANES;
export const laneX = (k) => SIDE + k * laneW;
const TILE_H = 124;
const ART = ['stage', 'key', 'key-long', 'bridge', 'bloom'];
const artUrl = (name) => new URL(`../../worlds/jiuding/art/games/fuqin/${name}.webp`, import.meta.url).href; // tools/paint-games.py
const tr = (v, lang) => (v && typeof v === 'object' ? v[lang] ?? v.zh ?? '' : v ?? '');
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

export async function mount(container, opts = {}) {
  const { lang = 'zh', signal, winHold = 1600, reducedMotion = false, shell } = opts;
  const paused = () => Boolean(shell?.paused?.());
  const doc = container.ownerDocument, win = doc.defaultView;
  const [level, place, ladder] = await levelFor(opts);
  let s = newGame('', 1, { levels: level ? [level] : [] });
  opts.peek?.(() => s);
  const host = doc.createElement('div');
  host.className = 'game g-mounted';
  const id = `fq${++uid}`;
  host.innerHTML = `<div class="g-fuqin" id="${id}" style="position:relative;aspect-ratio:9/16;width:min(100%, calc((100dvh - var(--game-reserve, 150px)) * 9 / 16));`
    + 'margin:0 auto;user-select:none;-webkit-user-select:none;touch-action:none;border-radius:10px;overflow:hidden;background:#211a14">'
    + `<canvas style="display:block;width:100%;height:100%" aria-label="${tr(level?.title ?? meta.name, lang)}"></canvas></div>`;
  container.replaceChildren(host);
  if (!s.live) return { won: false, left: true };
  const t = T[lang] || T.zh;
  const still = reducedMotion || Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const box = host.querySelector('.g-fuqin'), cv = host.querySelector('canvas'), cx = cv.getContext('2d');
  const art = loadArt(win);
  const hint = typeof t.hint === 'object' ? (await import('./kit/device.js')).forInput(t.hint) : t.hint;
  let scale = 1;
  const measure = () => {
    const dpr = Math.min(2, win.devicePixelRatio || 1), r = box.getBoundingClientRect();
    if (!r.width) return;
    scale = r.width / W;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    cx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  };
  const ro = win.ResizeObserver ? new win.ResizeObserver(measure) : null;
  ro?.observe(box);
  measure();

  // what the eye keeps of the run: a lane's press glow, the blooms, the grade word
  const fx = { glow: Array(LANES).fill(-1e9), blooms: [], word: null, shake: 0 };
  const hear = () => {
    for (const e of s.events.splice(0)) {
      if (e.kind === 'hit') {
        if (e.part === 'head') shell?.sound?.('note', { kind: String(e.midi) });
        fx.word = { text: t[e.grade], grade: e.grade, at: s.clock };
        if (!still) fx.blooms.push({ lane: e.lane, at: s.clock, big: e.grade === 'good' });
      } else if (e.kind === 'miss') {
        shell?.sound?.('miss');
        fx.word = { text: t.miss, grade: 'miss', at: s.clock };
      } else if (e.kind === 'wrong') {
        shell?.sound?.('wrong');
        fx.word = { text: t.wrong, grade: 'miss', at: s.clock };
        fx.shake = s.clock;
      } else if (e.kind === 'drone') shell?.sound?.('drone', { kind: String(e.midi) });
    }
    fx.blooms = fx.blooms.filter((b) => s.clock - b.at < 520);
  };

  const v = LINE_Y / (Number(s.level.fall) || 2000); // px a ms
  const yOf = (time) => LINE_Y - (time - s.clock) * v;
  const draw = () => {
    cx.save();
    if (!still && s.clock - fx.shake < 160) cx.translate(Math.sin(s.clock / 9) * 3, 0);
    // the scene, painted (cover)
    if (ready(art.stage)) {
      const a = art.stage, k = Math.max(W / a.naturalWidth, H / a.naturalHeight), w = a.naturalWidth * k, h = a.naturalHeight * k;
      cx.drawImage(a, (W - w) / 2, (H - h) / 2, w, h);
    } else { cx.fillStyle = '#2b2219'; cx.fillRect(0, 0, W, H); }
    // a veil over the field so the keys read, and the four silk strings
    const veil = cx.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, 'rgba(236,224,198,0)'); veil.addColorStop(0.75, 'rgba(236,224,198,.22)'); veil.addColorStop(1, 'rgba(236,224,198,0)');
    cx.fillStyle = veil; cx.fillRect(SIDE - 6, 0, W - 2 * SIDE + 12, H);
    for (let k = 0; k < LANES; k += 1) {
      const g = s.clock - fx.glow[k];
      if (s.down[k] || g < 220) {
        const a = s.down[k] ? 0.32 : 0.32 * (1 - g / 220), grd = cx.createLinearGradient(0, LINE_Y - 220, 0, LINE_Y);
        grd.addColorStop(0, 'rgba(206,150,62,0)'); grd.addColorStop(1, `rgba(206,150,62,${a})`);
        cx.fillStyle = grd; cx.fillRect(laneX(k) + 2, LINE_Y - 220, laneW - 4, 220);
      }
    }
    cx.strokeStyle = 'rgba(58,42,28,.28)'; cx.lineWidth = 1; // the four lanes: silk strings
    for (let k = 0; k <= LANES; k += 1) { cx.beginPath(); cx.moveTo(laneX(k) + 0.5, 0); cx.lineTo(laneX(k) + 0.5, H); cx.stroke(); }
    // the keys
    for (const n of s.notes) {
      const r = s.res[n.i];
      const bottom = yOf(n.t), top = yOf(n.end) - (n.hold ? 0 : 0);
      if (bottom < -40 || (n.hold ? top : bottom - TILE_H) > H + 20) continue;
      const doneHead = r.head && r.head !== 'miss';
      if (!n.hold && doneHead) continue; // a struck key is gone (its bloom stays)
      const x = laneX(n.lane) + 4, w = laneW - 8;
      const held = s.held[n.lane] === n.i;
      const missed = r.head === 'miss' || r.broke;
      cx.globalAlpha = missed ? 0.35 : 1;
      if (n.hold) {
        if (r.tail && !missed) { cx.globalAlpha = 1; continue; }
        const b = held ? LINE_Y : bottom, tp = Math.min(top, b - TILE_H * 0.6);
        if (ready(art['key-long'])) cx.drawImage(art['key-long'], x, tp, w, b - tp);
        else { cx.fillStyle = '#1b1510'; cx.fillRect(x, tp, w, b - tp); }
        if (held) { cx.fillStyle = 'rgba(242,214,150,.22)'; cx.fillRect(x, tp, w, b - tp); }
      } else {
        const gap = nextGap(n), h = Math.min(TILE_H, Math.max(46, gap * v - 6));
        if (ready(art.key)) cx.drawImage(art.key, x, bottom - h, w, h);
        else { cx.fillStyle = '#1b1510'; cx.fillRect(x, bottom - h, w, h); }
      }
      cx.globalAlpha = 1;
    }
    // the bridge (琴码): the line the keys are struck on
    if (ready(art.bridge)) { const bh = (W * art.bridge.naturalHeight) / art.bridge.naturalWidth; cx.drawImage(art.bridge, 0, LINE_Y - bh / 2, W, bh); }
    else { cx.fillStyle = 'rgba(214,170,96,.85)'; cx.fillRect(SIDE, LINE_Y - 3, W - 2 * SIDE, 6); }
    // blooms: a plum flower opens where a key was struck
    for (const b of fx.blooms) {
      const k = (s.clock - b.at) / 520, size = (b.big ? 78 : 58) * (0.55 + 0.6 * k);
      cx.globalAlpha = Math.max(0, 1 - k);
      const cxp = laneX(b.lane) + laneW / 2;
      if (ready(art.bloom)) cx.drawImage(art.bloom, cxp - size / 2, LINE_Y - size / 2 - 6, size, size);
      else { cx.fillStyle = '#c8463c'; cx.beginPath(); cx.arc(cxp, LINE_Y - 6, size / 3, 0, 7); cx.fill(); }
      cx.globalAlpha = 1;
    }
    cx.restore();
    // the gauge: a silk thread across the top, red as it thins
    cx.fillStyle = 'rgba(58,42,28,.22)'; cx.fillRect(SIDE, 14, W - 2 * SIDE, 5);
    cx.fillStyle = s.hp > 0.35 ? '#a8792e' : '#b8382c'; cx.fillRect(SIDE, 14, (W - 2 * SIDE) * s.hp, 5);
    // the tune's name and the run's count
    cx.textBaseline = 'top';
    cx.font = '600 15px "Songti SC", "Noto Serif SC", serif'; cx.fillStyle = 'rgba(46,32,20,.9)'; cx.textAlign = 'left';
    cx.lineWidth = 4; cx.lineJoin = 'round'; cx.strokeStyle = 'rgba(240,230,206,.85)'; // paper round the ink: it reads over a branch or a key
    cx.strokeText(tr(s.level.title, lang), SIDE, 28); cx.fillText(tr(s.level.title, lang), SIDE, 28);
    cx.textAlign = 'right'; cx.font = '13px "Songti SC", "Noto Serif SC", serif';
    const acc = `${t.acc} ${(accOf(s) * 100).toFixed(1)}%`;
    cx.strokeText(acc, W - SIDE, 30); cx.fillText(acc, W - SIDE, 30);
    if (s.combo >= 3) {
      cx.textAlign = 'center'; cx.fillStyle = 'rgba(46,32,20,.22)'; cx.font = '700 64px "Songti SC", "Noto Serif SC", serif';
      cx.fillText(String(s.combo), W / 2, 170);
      cx.font = '15px "Songti SC", "Noto Serif SC", serif'; cx.fillText(t.combo, W / 2, 240);
    }
    if (fx.word && s.clock - fx.word.at < 600) {
      const k = (s.clock - fx.word.at) / 600;
      cx.globalAlpha = 1 - k * k; cx.textAlign = 'center';
      cx.font = '700 30px "Songti SC", "Noto Serif SC", serif';
      cx.lineWidth = 5; cx.strokeStyle = 'rgba(240,230,206,.9)'; cx.lineJoin = 'round';
      cx.fillStyle = fx.word.grade === 'good' ? '#9a6a1c' : fx.word.grade === 'ok' ? '#3a2c1e' : '#b0352a';
      const y = LINE_Y - 96 - k * 14;
      cx.strokeText(fx.word.text, W / 2, y); cx.fillText(fx.word.text, W / 2, y);
      cx.globalAlpha = 1;
    }
    // the hint under the bridge, until the first key comes down
    if (s.clock < (s.notes[0]?.t ?? 0)) {
      cx.textAlign = 'center'; cx.font = '13px "Songti SC", "Noto Serif SC", serif'; cx.fillStyle = 'rgba(240,230,206,.92)';
      cx.fillText(hint, W / 2, LINE_Y + 34);
      cx.font = '700 22px "Songti SC", "Noto Serif SC", serif'; cx.fillStyle = 'rgba(46,32,20,.55)';
      ['D', 'F', 'J', 'K'].forEach((c, k) => { if (inputDesk) cx.fillText(c, laneX(k) + laneW / 2, LINE_Y - 44); });
    }
  };
  const inputDesk = !/touch/.test(String((await import('./kit/device.js')).inputKind(doc)));
  const gaps = new Map();
  function nextGap(n) {
    if (gaps.has(n.i)) return gaps.get(n.i);
    const after = s.notes.find((m) => m.lane === n.lane && m.t > n.t);
    const g = after ? after.t - n.t : 1e9;
    gaps.set(n.i, g);
    return g;
  }

  const fingers = new Map(); // pointerId → lane
  return new Promise((resolve) => {
    let done = false, raf = 0, prev = win.performance.now();
    const off = [];
    const on = (el, type, fn, o) => { el.addEventListener(type, fn, o); off.push(() => el.removeEventListener(type, fn, o)); };
    off.push(() => ro?.disconnect());
    const finish = (r) => { if (done) return; done = true; win.cancelAnimationFrame(raf); off.forEach((f) => f()); resolve(r); };
    // the key's own time in the run: the clock at the last frame, plus how long after that frame it came
    const at = (stamp) => s.clock + Math.max(0, Math.min(60, (stamp ?? win.performance.now()) - prev));
    const press = (lane, stamp) => { fx.glow[lane] = s.clock; act(s, { g: 'press', lane, at: at(stamp) }); hear(); };
    const release = (lane, stamp) => { act(s, { g: 'release', lane, at: at(stamp) }); hear(); };
    let again = null;
    // the tune from the top: ↺, or a string snapped
    const anew = () => { s = act(s, { g: 'restart' }).state; gaps.clear(); fx.blooms = []; fx.word = null; fingers.clear(); prev = win.performance.now(); };
    const restartBtn = () => host.closest('.gshell')?.querySelector(':scope > .gshell-bar [data-g="restart"]');
    const frame = (now) => {
      if (done) return;
      const dt = Math.min(100, now - prev);
      prev = now;
      if (doc.visibilityState === 'visible' && !paused() && !again) {
        tick(s, dt);
        hear();
      }
      draw();
      const can = meta.restart(s) && !again;
      const rb = restartBtn(); // the shell may paint its bar again: set it each frame, not once
      if (rb && rb.disabled === can) rb.disabled = !can;
      if (s.phase === 'won') {
        done = true; win.cancelAnimationFrame(raf); off.forEach((f) => f());
        const next = place < ladder.length ? place + 1 : null;
        const grade = s.level.grades?.[s.stars];
        win.setTimeout(() => resolve({ won: true, stars: s.stars, ...(grade != null ? { grade } : {}), ...(next ? { next } : {}) }), winHold);
        return;
      }
      if (s.phase === 'failed' && !again) {
        // a string snaps: the tune from the top, under the shell's lead card (a story board never settles a loss)
        again = (shell?.lead ? shell.lead(t.again, { count: true, lang, reducedMotion: still }) : new Promise((r) => win.setTimeout(r, 1500)))
          .then(() => { anew(); again = null; });
      }
      raf = win.requestAnimationFrame(frame);
    };
    const laneAt = (e) => { const r = box.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W; return Math.max(0, Math.min(LANES - 1, Math.floor((x - SIDE) / laneW))); };
    on(doc, 'click', (e) => {
      const b = e.target.closest?.('.gshell-bar [data-g="restart"]');
      if (!b || b !== restartBtn() || b.disabled || paused() || again) return;
      e.preventDefault();
      anew();
    });
    on(box, 'pointerdown', (e) => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || paused() || again) return;
      e.preventDefault();
      const lane = laneAt(e);
      fingers.set(e.pointerId, lane);
      try { box.setPointerCapture(e.pointerId); } catch { /* the document still hears it */ }
      press(lane, e.timeStamp);
    });
    const up = (e) => { if (!fingers.has(e.pointerId)) return; const lane = fingers.get(e.pointerId); fingers.delete(e.pointerId); release(lane, e.timeStamp); };
    on(doc, 'pointerup', up);
    on(doc, 'pointercancel', up);
    on(box, 'contextmenu', (e) => e.preventDefault());
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '') || e.target?.isContentEditable;
    const laneOfKey = (e) => meta.keys[(e.key ?? '').toLowerCase()];
    on(doc, 'keydown', (e) => {
      const lane = laneOfKey(e);
      if (lane == null || e.metaKey || e.ctrlKey || e.altKey || typing(e) || !host.isConnected || paused() || again) return;
      e.preventDefault();
      if (e.repeat) return;
      press(lane, e.timeStamp);
    });
    on(doc, 'keyup', (e) => { const lane = laneOfKey(e); if (lane == null || !s.down[lane]) return; e.preventDefault(); release(lane, e.timeStamp); });
    on(win, 'blur', () => { for (let k = 0; k < LANES; k += 1) if (s.down[k]) release(k); });
    const unPause = shell?.onPause?.((p) => { if (p) for (let k = 0; k < LANES; k += 1) if (s.down[k]) release(k); });
    if (typeof unPause === 'function') off.push(unPause);
    if (signal) {
      if (signal.aborted) return finish({ won: false, left: true });
      signal.addEventListener('abort', () => finish({ won: false, left: true }), { once: true });
    }
    // dev: the run, read from outside (a live check drives the keys off the run's own clock)
    if (opts.dev ?? /[?&]dev=1/.test(win.location?.search ?? '')) win.__fuqin = { state: () => s };
    raf = win.requestAnimationFrame(frame);
  });
}
