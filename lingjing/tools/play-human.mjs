// tools/play-human.mjs — every kept small game played on the LIVE page by scripted human-like
// hands, at 1440 (mouse) and 390 (touch, DPR 3), over seeded runs; invariants checked as it plays
// (Hanli 2026-10-16: a 弹竹 that did nothing passed every bot — 「agent操作浏览器太慢」).
//
//   node lingjing/tools/play-human.mjs [--games=rain,bread,…] [--widths=1440,390]
//        [--policies=casual,sloppy,idle] [--seeds=2] [--seconds=90] [--jobs=3] [--out=<dir>] [--keep]
//   (cd lingjing/tools && npm install) once: playwright is a devDependency here, its Chromium cached.
//
// The hands see only what the screen shows (the board's DOM: what is drawn, where, what it says) and
// act only through real pointer / touch events at frame rate, with a reaction delay (0.4–1.2 s), aim
// error and attention lapses. They never call a game's code or read its state; the checker reads the
// story's own outcome record (the scratch seam's `board(id)` — won, grade, stars) only to score a run.
//
// Invariants, each a finding with the run's video and trace when it breaks:
//   dead-tap      a tap on a visible control changes the board (what is drawn or said) within 150 ms,
//                 or within 500 ms (`slow-tap`); learned against the board's own idle motion.
//   inert-control a control touched in the runs that never once changed the board.
//   inert-tool    a thing that looks like a tool (TOOL_LOOKS) that a curious first touch leaves unchanged.
//   overlap / clipped   controls and text over each other, off the screen's sides or cut off.
//   code-drawn    visible SVG shapes in the board that are not a painted <image> and not on the
//                 UI/effect allowlist (UI_GLYPHS) — placeholders that never ship.
//   end-frame     a win (and a known loss) leaves a visible end frame; no fresh board flashes after a win.
//   spread        a trying hand (casual) wins at least once; the idle hand never wins best.
//   page-error    a console error or uncaught exception.
// Key frames (first sight, a tool first met, the end) are saved as PNGs for a human's look at the art.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { savesAtScenes, boardSeeder, CLEAR, HOME } from './page-crawl.mjs';
import { rng } from './board-bots.mjs';
import { HANDS as BREATH_HANDS } from '../scripts/games/bots/qimai.js';
import { HANDS as SWING_HANDS, decide as swingDecide } from '../scripts/games/bots/fallrope.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

/* Boards being cut or rebuilt (games.md, 10-16) — not played unless named with --games. */
export const SKIP = new Set([]); // none: the three 割绳子 levels (忍字 · 认路 · 算账) are back in their scenes 10-20; the old boards the story no longer plays were deleted 10-19
/* What looks like a tool a first-time player would poke. */
export const TOOL_LOOKS = '.g-rope-spring, .g-rope-seal, .g-rope-crow, .g-puff, .g-ft-bubble, .g-ft-thorns, .g-regrow, .g-tk-pick, [class*="tool"]';
/* Shapes allowed to be code-drawn: invisible hit areas, the UI's glyphs and short-lived effects. */
export const UI_GLYPHS = /(^|[\s-])(hit|pad|teach|tapink|ink-ring|pips?|ripple|splash|drop|stain|glow|streak|trail|aim|dot|ring|wash|fullmark|waterfill|gust-band|sr|bar|meter|track|cursor|seal|burp|steam|flash|spark|chaff|dust|bolt|fx)([\s-]|$)/;

/* ── In the page: what the eye sees ── */
export const SEE = (host) => `(() => {
  const host = document.querySelector(${JSON.stringify(host)}); if (!host || !host.getClientRects().length) return null;
  const W = innerWidth, H = innerHeight;
  const vis = (e) => { if (!e.getClientRects().length) return false; let a = e; while (a && a !== document.body) { const cs = getComputedStyle(a); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false; a = a.parentElement; } return true; };
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const keyOf = (e) => (e.dataset.g ?? (e.hasAttribute('data-g-hold') ? 'hold' : e.hasAttribute('data-g-drag') ? 'drag' : 'swipe')) + (e.dataset.p ? ':' + e.dataset.p : '') + (e.dataset.i != null && e.tagName === 'BUTTON' ? ':' + e.dataset.i : '');
  const controls = [...host.querySelectorAll('[data-g],[data-g-hold],[data-g-drag],[data-g-swipe]')].filter((e) => vis(e) && !e.disabled).map((e) => {
    const b = box(e), line = e.tagName === 'line' ? (() => { const m = e.getScreenCTM(); const p = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }); const a = p(+e.getAttribute('x1'), +e.getAttribute('y1')), c = p(+e.getAttribute('x2'), +e.getAttribute('y2')); return [a.x, a.y, c.x, c.y]; })() : null;
    return { key: keyOf(e), g: e.dataset.g ?? null, kind: e.hasAttribute('data-g-swipe') ? 'swipe' : e.hasAttribute('data-g-drag') ? 'drag' : e.hasAttribute('data-g-hold') ? 'hold' : 'tap',
      cls: (e.getAttribute('class') || '') + ' ' + (e.closest('[class]')?.getAttribute('class') || ''), text: (e.textContent || '').trim().slice(0, 24), v: e.dataset.v ?? null, line, marks: [...new Set([...e.querySelectorAll('[class]')].filter(vis).map((x) => (x.getAttribute('class') || '').split(/\\s+/)[0]))].join(' '), ...b };
  });
  const tools = [...host.querySelectorAll(${JSON.stringify(TOOL_LOOKS)})].filter((e) => vis(e) && !e.closest('[data-g],[data-g-hold],[data-g-drag]') && !e.querySelector('[data-g]')).map((e) => ({ key: (e.getAttribute('class') || '').split(/\\s+/)[0], ...box(e) }));
  const won = Boolean(host.querySelector('.is-won')) || /^成/.test(document.getElementById('won')?.textContent || '');
  const say = [...host.querySelectorAll('.g-line-say')].map((e) => e.textContent.trim()).join(' / ');
  const head = [...host.querySelectorAll('.g-head')].map((e) => e.textContent.trim()).join(' / ');
  // What a game marks for the eye ([data-see]: the stag, the sight) — a person sees them on the painting.
  const figures = [...host.querySelectorAll('[data-see]')].filter(vis).map((e) => ({ ...e.dataset, cls: e.getAttribute('class') || '', ...box(e) }));
  return { controls, tools, won, say, head, figures, host: box(host), W, H };
})()`;

/* What the board shows, as tokens: each element's tag, class, data and own words — never its
   geometry (a swinging thing moves every frame; a cut vine or a lit control changes a token). */
export const DIGEST = (host) => `(() => {
  const host = document.querySelector(${JSON.stringify(host)}); if (!host) return ['<gone>'];
  const out = [];
  for (const e of host.querySelectorAll('*')) {
    if (e.closest('.g-sr')) continue;
    const data = [...e.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'disabled' || a.name === 'href').map((a) => a.name + '=' + a.value).join(',');
    const own = [...e.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join('');
    out.push(e.tagName + '.' + (e.getAttribute('class') || '') + '[' + data + ']' + own);
  }
  out.push(...[...document.querySelectorAll('.g-tapink.is-no')].map(() => 'nope')); // the page's refusal ring (live-games.js tapNope)
  return out;
})()`;

const LAYOUT = (host) => `(() => {
  const host = document.querySelector(${JSON.stringify(host)}); if (!host) return [];
  const W = innerWidth, out = [];
  const vis = (e) => { if (!e.getClientRects().length) return false; let a = e; while (a && a !== document.body) { const cs = getComputedStyle(a); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false; a = a.parentElement; } return true; };
  const name = (e) => e.tagName.toLowerCase() + (e.getAttribute('class') ? '.' + e.getAttribute('class').trim().split(/\\s+/).slice(0, 2).join('.') : '') + (e.textContent ? ' "' + e.textContent.trim().slice(0, 14) + '"' : '');
  const blocks = [...host.querySelectorAll('button, .g-line-say, .g-head, .g-head > span, p, h1, h2, h3, svg')].filter(vis);
  for (const e of blocks) {
    const r = e.getBoundingClientRect();
    if (r.left < -1 || r.right > W + 1) out.push({ kind: 'clipped', what: name(e), why: 'off the side', l: Math.round(r.left), r: Math.round(r.right), W });
    if (e.tagName !== 'svg' && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible') out.push({ kind: 'clipped', what: name(e), why: 'text cut off' });
  }
  const flat = blocks.filter((e) => e.tagName === 'BUTTON' || e.matches('.g-line-say, .g-head'));
  for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
    const a = flat[i], b = flat[j]; if (a.contains(b) || b.contains(a)) continue;
    const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
    const ix = Math.min(p.right, q.right) - Math.max(p.left, q.left), iy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
    if (ix > 2 && iy > 2) out.push({ kind: 'overlap', what: name(a) + ' × ' + name(b), area: Math.round(ix * iy) });
  }
  return out;
})()`;

const DRAWN = (host, allow) => `(() => {
  const host = document.querySelector(${JSON.stringify(host)}); if (!host) return {};
  const allow = new RegExp(${JSON.stringify(allow.source)});
  const opacity = (e) => { let o = 1; for (let a = e; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= Number(cs.opacity); } return o; };
  const seen = {};
  for (const e of host.querySelectorAll('svg path, svg rect, svg circle, svg ellipse, svg polygon, svg polyline, svg line, svg text')) {
    const cs = getComputedStyle(e);
    const paints = (cs.fill !== 'none' && !/rgba\\(.*, 0\\)$/.test(cs.fill) && Number(cs.fillOpacity) > 0.05) || (cs.stroke !== 'none' && Number(cs.strokeOpacity) > 0.05 && parseFloat(cs.strokeWidth) > 0);
    if (!paints || opacity(e) < 0.05) continue;
    const r = e.getBoundingClientRect(); if (r.width * r.height < 30 && e.tagName !== 'line' && e.tagName !== 'path') continue;
    let cls = ''; for (let a = e; a && a !== host; a = a.parentElement) { const c = a.getAttribute('class'); if (c) { cls = c.trim().split(/\\s+/)[0]; break; } }
    const glyph = [e.getAttribute('class') || '', cls].some((c) => allow.test(c));
    const k = (glyph ? 'ui:' : '') + e.tagName + '.' + (cls || '?');
    seen[k] = (seen[k] ?? 0) + 1;
  }
  return seen;
})()`;

/* ── Hands: real input at frame rate ── */
export function handsFor(page, cdp, touch) {
  const ev = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 6, radiusY: 6, force: 1 }] });
  return {
    async down(x, y) { if (touch) await ev('touchStart', x, y); else { await page.mouse.move(x, y); await page.mouse.down(); } },
    async move(x, y) { if (touch) await ev('touchMove', x, y); else await page.mouse.move(x, y); },
    async up(x, y) { if (touch) await ev('touchEnd', x, y); else await page.mouse.up(); },
    async path(pts, frame = 16) { await this.down(...pts[0]); for (const p of pts.slice(1)) { await sleep(frame); await this.move(...p); } await sleep(frame); await this.up(...pts.at(-1)); },
  };
}

/* ── Policies: what a person does with what they see ── */
export const POLICIES = {
  casual: { react: [400, 1200], aim: 1, lapse: 0.06, wrong: 0.05, curious: true },
  sloppy: { react: [600, 1200], aim: 2.6, lapse: 0.15, wrong: 0.25, curious: false, sloppy: true },
  idle: { react: [400, 900], aim: 1, lapse: 0, wrong: 0, idle: true },
};
export const START = /^(start|play|begin|go|next|again)$/;
const QUIT = /^(skip|giveup|quit)$/;

/* Per kind of board, which visible thing to act on (the eye's choice). Answers an action or null. */
export const CHOOSERS = {
  rain: (seen) => { const s = seen.controls.filter((c) => c.g === 'spot' && /g-stain|g-drop/.test(c.marks) && !/has-basin/.test(c.cls)); return s.length ? { kind: 'tap', c: s[0] } : null; },
  cut: (seen, r, mem) => {
    const next = seen.controls.find((c) => c.g === 'next');
    if (next) return { kind: 'tap', c: next };
    if (mem.settleUntil > Date.now()) return null;
    const vines = [...new Map(seen.controls.filter((c) => c.kind === 'swipe').map((c) => [c.v, c])).values()];
    const pokes = seen.controls.filter((c) => c.g === 'gust' || c.g === 'pop');
    const pool = [...vines.map((c) => ({ kind: 'swipe', c })), ...pokes.map((c) => ({ kind: 'tap', c }))];
    if (!pool.length) { const again = seen.controls.find((c) => c.g === 'retry'); return again && r() < 0.3 ? { kind: 'tap', c: again } : null; }
    mem.settleUntil = Date.now() + 900 + r() * 1400; // watches it swing before the next move
    return pool[Math.floor(r() * pool.length)];
  },
  any: (seen, r) => {
    const pool = seen.controls.filter((c) => !QUIT.test(c.g ?? '') && c.g !== 'retry');
    if (!pool.length) return null;
    const lit = pool.filter((c) => /is-on|g-teach|is-drip|is-live|is-now|is-ready/.test(c.cls));
    const c = (lit.length && r() < 0.7 ? lit : pool)[Math.floor(r() * (lit.length && r() < 0.7 ? lit : pool).length)];
    return c.kind === 'hold' || c.kind === 'drag' ? { kind: 'hold', c, ms: 300 + r() * 2200 } : c.kind === 'swipe' ? { kind: 'swipe', c } : { kind: 'tap', c };
  },
};
export const chooserOf = (game) => (game === 'qimai' ? 'breath' : game === 'fallrope' ? 'swing' : game === 'rain' ? 'rain' : ['bread', 'niugurope', 'luoborope', 'rentrope', 'tauntrope', 'wayrope'].includes(game) ? 'cut' : 'any');
export const LOSS = { rain: /成河/ };
/* A story board's task id (its [data-game] host) → its game kind (the chooser's key): games.json. */
export const GAME_OF_TASK = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'worlds/jiuding/games.json'), 'utf8')).games.filter((g) => g.task).map((g) => [g.task, g.id]));

/* A tap judged: the board's idle motion learned over the reaction, then the act, then 150 / 500 ms.
   `evaluate` runs an expression in the page (Playwright's page.evaluate or cdp.mjs's). */
export async function judgeTap(evaluate, host, act) {
  const digest = () => evaluate(DIGEST(host));
  const diff = (a, b) => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) ?? 0) + 1); for (const x of b) m.set(x, (m.get(x) ?? 0) - 1); return [...m].filter(([, v]) => v).map(([k]) => k); };
  const a = await digest(); await sleep(120); const b = await digest();
  const idle = new Set(diff(a, b));
  await act();
  await sleep(150);
  const c = await digest();
  if (diff(b, c).some((x) => !idle.has(x))) return 'ok';
  await sleep(350);
  return diff(b, await digest()).some((x) => !idle.has(x)) ? 'slow' : 'dead';
}

/* A chooser's action as the hand makes it: aim error by the policy, the path of a swipe, a drag, a hold.
   Answers { key, x, y, run } — `run` moves the hand. */
export function motion(hand, a, r, P, touch) {
  const err = (touch ? 7 : 4) * P.aim;
  const ax = (x) => x + gauss(r) * err, ay = (y) => y + gauss(r) * err;
  if (a.kind === 'tap' || a.kind === 'tap-at') {
    const x = ax(a.c?.x ?? a.x), y = ay(a.c?.y ?? a.y);
    return { key: a.c?.key ?? 'in-flight', x, y, run: () => tapAt(hand, x, y) };
  }
  if (a.kind === 'swipe') {
    const [x1, y1, x2, y2] = a.c.line ?? [a.c.l, a.c.t, a.c.r, a.c.b];
    const k = 0.2 + r() * 0.6, mx = x1 + (x2 - x1) * k, my = y1 + (y2 - y1) * k;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len, ny = (x2 - x1) / len, reach = 22 + r() * 30;
    const steps = 6 + Math.floor(r() * 10);
    const pts = Array.from({ length: steps + 1 }, (_, i) => [ax(mx - nx * reach) + (2 * nx * reach) * i / steps, ay(my - ny * reach) + (2 * ny * reach) * i / steps]);
    return { key: a.c.key, run: () => hand.path(pts) };
  }
  if (a.kind === 'drag') {
    const steps = 14 + Math.floor(r() * 16), [x0, y0] = a.from, [x1, y1] = a.to;
    const pts = Array.from({ length: steps + 1 }, (_, i) => [x0 + (x1 - x0) * i / steps + gauss(r) * 0.6, y0 + (y1 - y0) * i / steps + gauss(r) * 0.6]);
    return { key: 'drag', run: async () => { await hand.down(...pts[0]); for (const p of pts.slice(1)) { await sleep(16); await hand.move(...p); } await sleep(150 + r() * 400); await hand.up(...pts.at(-1)); } };
  }
  const x = ax(a.c.x), y = ay(a.c.y); // hold
  return { key: a.c.key, run: async () => { await hand.down(x, y); await sleep(a.ms); await hand.up(x, y); } };
}

/* ── The breath hand (气走经脉): hold to rise, let go to sink — steered all the time, as a person does.
   It sees only what is drawn: the bead, the two walls (their polylines, through the scene's own
   transform), the gold thread, and in a dark stretch only what the bead's round of light shows. It acts
   on what it saw `delay` ms ago (± jitter), with aim noise and lapses (bots/qimai.js HANDS, the same
   hands the node sims tune with); it does not predict over its own lag. */
export const SIGHT = (host) => `(() => {
  const host = document.querySelector(${JSON.stringify(host)}); if (!host) return null;
  const won = Boolean(host.querySelector('.is-won')); const bead = host.querySelector('.g-qm-bead-core'), svg = host.querySelector('svg.g-qm-scene');
  if (!bead || !svg) return { won, gone: true };
  const b = bead.getBoundingClientRect(), s = svg.getBoundingClientRect(), k = s.width / svg.viewBox.baseVal.width;
  const read = (el) => { const m = el.getScreenCTM(); return el.getAttribute('points').trim().split(/\\s+/).map((p) => { const [x, y] = p.split(',').map(Number); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; }); };
  const at = (pts, x) => { let lo = 0, hi = pts.length - 1; if (!pts.length || x < pts[0][0] || x > pts[hi][0]) return null; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= x) lo = mid; else hi = mid; } const [x0, y0] = pts[lo], [x1, y1] = pts[hi]; return y0 + (y1 - y0) * ((x - x0) / ((x1 - x0) || 1)); };
  const walls = [...host.querySelectorAll('.g-qm-wall')]; const top = read(walls.find((w) => w.dataset.side === 'top')), bot = read(walls.find((w) => w.dataset.side === 'bot'));
  const golds = [...host.querySelectorAll('.g-qm-gold')].map(read);
  const darks = [...host.querySelectorAll('.g-qm-darkzone')].map((d) => d.getBoundingClientRect()).map((r) => [r.left, r.right]);
  const lamp = host.querySelector('.g-qm-lamp'); const lampR = lamp ? Number(lamp.getAttribute('r')) * k * 0.9 : 0;
  const bx = b.left + b.width / 2, by = b.top + b.height / 2, seen = [];
  for (let d = 0; d <= 60 * k; d += 3 * k) {
    const x = bx + d, dark = darks.some(([l, r]) => x >= l && x <= r);
    if (dark && d > lampR) break;
    const g = golds.map((p) => at(p, x)).find((v) => v != null);
    seen.push([d, at(top, x), at(bot, x), g ?? null]);
  }
  return { won, t: performance.now(), bx, by, k, r: b.height / 2, seen, cha: bead.closest('.g-qm-bead')?.classList.contains('is-cha') ?? false,
    box: [s.left, s.top, s.width, s.height] };
})()`;

export async function breathe(page, hand, policy, r, host, judgeOnce, stintMs = 4000) {
  const H = BREATH_HANDS[policy] ?? BREATH_HANDS.casual;
  const out = { presses: 0, chas: 0, dead: false };
  const hist = [];
  let held = false, frozenUntil = 0, aimNoise = 0, noiseUntil = 0, wasCha = false, at = null;
  const t0 = Date.now();
  const press = async (down) => {
    if (down === held) return;
    if (down) {
      const box = hist.at(-1)?.box;
      at = box ? [box[0] + box[2] * (0.3 + r() * 0.4), box[1] + box[3] * (0.3 + r() * 0.4)] : at;
      const judged = judgeOnce();
      if (judged) { const got = await judged('hold', () => hand.down(...at)); if (got === 'dead') out.dead = true; }
      else await hand.down(...at);
      out.presses++;
    } else await hand.up(...at);
    held = down;
  };
  try {
    while (Date.now() - t0 < stintMs) {
      const v = await page.evaluate(SIGHT(host));
      if (!v || v.won || v.gone) break;
      const now = Date.now();
      hist.push({ ...v, now });
      while (hist.length > 2 && hist[1].now <= now - H.delay - 400) hist.shift();
      if (v.cha && !wasCha) out.chas++;
      wasCha = v.cha;
      if (now >= frozenUntil) {
        if (r() < (H.lapse ?? 0) * 0.04) frozenUntil = now + 300 + r() * 500;
        else {
          const lag = Math.max(0, H.delay + gauss(r) * H.jitter);
          const o = [...hist].reverse().find((h) => h.now <= now - lag) ?? hist[0];
          const prev = [...hist].reverse().find((h) => h.now <= o.now - 90) ?? hist[0];
          const vy = prev !== o ? (o.by - prev.by) / ((o.now - prev.now) / 1000) : 0;
          if (now >= noiseUntil) { aimNoise = gauss(r) * H.noise * o.k; noiseUntil = now + 400; }
          // aim: a little ahead, the gold thread where it runs, kept inside the tightest of what is seen
          let lo = -Infinity, hi = Infinity, want = null;
          for (const [d, top, bot, g] of o.seen) {
            if (top != null && bot != null && d <= 45 * o.k) { lo = Math.max(lo, top + o.r + 3 * o.k); hi = Math.min(hi, bot - o.r - 3 * o.k); }
            if (want == null && d >= 22 * o.k && top != null && bot != null) want = g ?? (top + bot) / 2;
          }
          if (want == null) want = o.seen.length ? (o.seen.at(-1)[1] + o.seen.at(-1)[2]) / 2 : o.by;
          const aim = lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, want));
          const u = (o.by + aimNoise - aim) + H.kd * vy, db = 3 * o.k;
          if (u > db) await press(true); else if (u < -db) await press(false);
        }
      }
      await sleep(30);
    }
  } finally { if (held) await hand.up(...at); }
  return out;
}

/* ── One run ── */
async function playOnce(browser, t, { width, policy, seed, seconds, out, base }) {
  const touch = width < 600;
  const tag = `${t.name}-${width}-${policy}-${seed}`;
  const vdir = path.join(out, 'video', tag);
  const ctx = await browser.newContext({ viewport: { width, height: touch ? 844 : 900 }, deviceScaleFactor: touch ? 3 : 1, isMobile: touch, hasTouch: touch, recordVideo: { dir: vdir, size: { width: Math.min(width, 900), height: touch ? 844 : 560 } } });
  await ctx.tracing.start({ screenshots: true, snapshots: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const hand = handsFor(page, cdp, touch);
  const P = POLICIES[policy], r = rng(`${tag}`);
  const findings = [], errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (what) => { const f = path.join(out, 'frames', `${tag}-${what}.png`); fs.mkdirSync(path.dirname(f), { recursive: true }); await page.screenshot({ path: f }).catch(() => {}); return f; };
  const res = { tag, game: t.game, name: t.name, width, policy, seed, won: false, lost: 0, ms: 0, taps: 0, grade: null, stars: null };
  const touched = new Map(); // control key → { n, changed }
  try {
    if (t.save) t.save();
    await page.goto(t.url(base), { waitUntil: 'load' });
    await sleep(2500);
    // to the board: the story's way (its title card, the box, 开局) as page-crawl clears it
    for (let k = 0; k < 40 && !(await page.evaluate(`Boolean(document.querySelector(${JSON.stringify(t.host)})?.getClientRects().length)`)); k++) {
      const c = await page.evaluate(CLEAR);
      if (c) { await hand.down(c.x, c.y); await sleep(60); await hand.up(c.x, c.y); }
      await sleep(450);
    }
    let seen = await page.evaluate(SEE(t.host));
    if (!seen) { findings.push({ kind: 'no-board', why: 'the board never stood on the screen' }); throw new Error('no board'); }
    await page.evaluate(`document.querySelector(${JSON.stringify(t.host)})?.scrollIntoView({ block: 'center' })`);
    await shot('first');
    const keyFrames = new Set();
    const layoutSeen = new Set(), drawnAll = {};
    const look = async (why) => {
      for (const f of await page.evaluate(LAYOUT(t.host))) { const k = f.kind + f.what; if (!layoutSeen.has(k)) { layoutSeen.add(k); findings.push({ ...f, at: why }); } }
      const d = await page.evaluate(DRAWN(t.host, UI_GLYPHS));
      for (const [k, v] of Object.entries(d)) drawnAll[k] = Math.max(drawnAll[k] ?? 0, v);
    };
    await look('first sight');
    const judged = async (key, act) => {
      const got = await judgeTap((e) => page.evaluate(e), t.host, act);
      const e = touched.get(key) ?? { n: 0, changed: 0 }; e.n++; if (got !== 'dead') e.changed++; touched.set(key, e);
      return got;
    };
    const t0 = Date.now(), mem = { P };
    let lapseUntil = 0, poked = new Set(), lossSeen = false, deadLogged = new Set();
    while (Date.now() - t0 < seconds * 1000) {
      seen = await page.evaluate(SEE(t.host));
      const rec = t.board ? await page.evaluate(`globalThis.__lingjingPlay?.board(${JSON.stringify(t.board)}) ?? null`) : null;
      if (!seen || seen.won || rec?.won || rec?.sent) {
        res.won = Boolean(seen?.won || rec?.won || rec?.sent);
        res.ms = Date.now() - t0;
        res.grade = rec?.grade ?? null; res.stars = rec?.stars ?? (/(\d)\s*\/\s*3/.exec(seen?.head ?? '')?.[1] ?? null);
        if (res.won) await endFrame(page, t, shot, findings);
        break;
      }
      if (LOSS[t.game]?.test(seen.say) && !lossSeen) { lossSeen = true; res.lost++; if (!keyFrames.has('loss')) { keyFrames.add('loss'); await shot('loss'); } }
      else if (!LOSS[t.game]?.test(seen.say)) lossSeen = false;
      // the idle hand: only what starts the board
      if (P.idle) {
        const go = seen.controls.find((c) => START.test(c.g ?? '') && c.g !== 'again');
        if (go) { await sleep(P.react[0]); await tapAt(hand, go.x, go.y); }
        await sleep(200); continue;
      }
      // a hold-to-rise board (气走经脉): the hand steers continuously for a stint, then looks again
      if ((t.chooser ?? chooserOf(t.game)) === 'breath') {
        const st = await breathe(page, hand, policy, r, t.host, () => (mem.firstPress ? null : (mem.firstPress = true, judged)));
        res.taps += st.presses; res.lost += st.chas;
        if (st.dead && !deadLogged.has('hold')) { deadLogged.add('hold'); findings.push({ kind: 'dead-tap', what: 'hold (the board)', at: seen.say }); }
        continue;
      }
      // a timed 割绳子 (拽): the swing hand watches and cuts for a stint, then looks again
      if ((t.chooser ?? chooserOf(t.game)) === 'swing') {
        const st = await swing(page, hand, policy, r, t.host, touch, judged);
        res.taps += st.moves;
        continue;
      }
      if (Date.now() < lapseUntil) { await sleep(100); continue; }
      if (r() < P.lapse / 10) { lapseUntil = Date.now() + 2000 + r() * 3000; continue; } // looks away
      // a curious first touch on each thing that looks like a tool
      if (P.curious) {
        const tool = seen.tools.find((x) => !poked.has(x.key));
        if (tool) {
          poked.add(tool.key);
          if (!keyFrames.has('tool:' + tool.key)) { keyFrames.add('tool:' + tool.key); await shot(`tool-${tool.key}`); }
          const got = await judged('tool:' + tool.key, () => tapAt(hand, tool.x, tool.y));
          if (got === 'dead') findings.push({ kind: 'inert-tool', what: tool.key, why: 'looks like a tool; touched, nothing changed' });
          continue;
        }
      }
      let a = CHOOSERS[t.chooser ?? chooserOf(t.game)](seen, r, mem);
      if (!a && seen.controls.find((c) => START.test(c.g ?? ''))) a = { kind: 'tap', c: seen.controls.find((c) => START.test(c.g ?? '')) };
      if (a && r() < P.wrong && seen.controls.length) { const c = seen.controls[Math.floor(r() * seen.controls.length)]; if (!QUIT.test(c.g ?? '')) a = c.kind === 'swipe' ? { kind: 'swipe', c } : { kind: 'tap', c }; }
      if (!a) { await sleep(80); continue; }
      await sleep(P.react[0] + r() * (P.react[1] - P.react[0]) - 270); // the reaction (the judge's sampling is the rest)
      res.taps++;
      const m = motion(hand, a, r, P, touch);
      const got = await judged(m.key, m.run);
      if (a.kind === 'tap' || a.kind === 'tap-at') {
        if (got === 'dead' && a.c && !deadLogged.has(m.key)) { deadLogged.add(m.key); findings.push({ kind: 'dead-tap', what: `${a.c.key} "${a.c.text}"`, x: Math.round(m.x), y: Math.round(m.y), at: seen.say }); }
        if (got === 'slow' && a.c && !deadLogged.has('slow' + m.key)) { deadLogged.add('slow' + m.key); findings.push({ kind: 'slow-tap', what: `${a.c.key} "${a.c.text}"` }); }
      }
    }
    if (!res.won) res.ms = Date.now() - t0;
    await look('end');
    if (!res.won && !keyFrames.has('end')) await shot('end');
    res.drawn = drawnAll;
    const figures = Object.entries(drawnAll).filter(([k]) => !k.startsWith('ui:'));
    if (figures.length) findings.push({ kind: 'code-drawn', what: figures.map(([k, v]) => `${k}×${v}`).join(' ') });
  } catch (e) {
    if (!findings.length) findings.push({ kind: 'harness', why: String(e.message ?? e).slice(0, 200) });
  }
  res.touched = Object.fromEntries(touched);
  for (const e of errors.slice(0, 5)) findings.push({ kind: 'page-error', why: e.slice(0, 300) });
  res.findings = findings;
  const failed = findings.some((f) => !['code-drawn', 'slow-tap'].includes(f.kind));
  if (failed) await ctx.tracing.stop({ path: path.join(out, 'trace', `${tag}.zip`) }); else await ctx.tracing.stop();
  const video = page.video();
  await ctx.close();
  if (!failed) fs.rmSync(vdir, { recursive: true, force: true });
  else if (video) res.video = await video.path().catch(() => null);
  return res;
}

/* ── The swing hand (拽, fallrope): a 割绳子 level whose last cut is timed. It reads what is drawn — the
   thing's place (its transform), the ledge, each rope's anchor (its cut line's first point), the strap,
   the puff, 重来 — in board units, and plays bots/fallrope.js's `decide` (the hand the node sims tune),
   acting on what it saw `delay` ms ago; a cut is a real swipe across the rope, a puff a tap. */
export const SWING_SIGHT = (host) => `(() => {
  const host = document.querySelector(${JSON.stringify(host)}); if (!host) return null;
  const svg = host.querySelector('svg[data-swing]'), won = Boolean(host.querySelector('.is-won'));
  if (!svg || won) return { won, play: false };
  const m = svg.getScreenCTM(), inv = m.inverse();
  const scr = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  const brd = (x, y) => [inv.a * x + inv.c * y + inv.e, inv.b * x + inv.d * y + inv.f];
  const item = svg.querySelector('.g-ft-item'), tr = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(item?.getAttribute('transform') || '');
  const goalEl = svg.querySelector('[data-see="goal"]'), gb = goalEl?.getBoundingClientRect();
  const goal = gb ? brd(gb.left + gb.width / 2, gb.top + gb.height / 2) : [0, 0];
  const lines = [...svg.querySelectorAll('line[data-g="cut"]')].map((e) => ({ v: e.dataset.v, k: Number(e.dataset.k), x1: +e.getAttribute('x1'), y1: +e.getAttribute('y1'), x2: +e.getAttribute('x2'), y2: +e.getAttribute('y2') }));
  const vines = {}; for (const l of lines) if (l.v !== 'pack') { (vines[l.v] ??= []).push(l); }
  const mid = (ls) => { const l = ls[Math.floor(ls.length / 2)]; return [...scr(l.x1, l.y1), ...scr(l.x2, l.y2)]; };
  const puff = host.querySelector('[data-g="gust"]'), pb = puff?.getBoundingClientRect(), retry = host.querySelector('button[data-g="retry"]')?.getBoundingClientRect();
  return { play: Boolean(tr), won,
    thing: tr ? { x: +tr[1], y: +tr[2] } : { x: 0, y: 0 }, goal: { x: goal[0], y: goal[1] },
    vines: Object.entries(vines).map(([v, ls]) => ({ v: Number(v), at: [ls.sort((a, b) => a.k - b.k)[0].x1, ls[0].y1], line: mid(ls) })),
    strap: lines.filter((l) => l.v === 'pack').map((l) => [...scr(l.x1, l.y1), ...scr(l.x2, l.y2)])[0] ?? null,
    gust: Boolean(puff && !puff.classList.contains('is-on')), puff: pb ? [pb.left + pb.width / 2, pb.top + pb.height / 2] : null,
    retry: retry ? [retry.left + retry.width / 2, retry.top + retry.height / 2] : null };
})()`;

export async function swing(page, hand, policy, r, host, touch, judged, stintMs = 4000) {
  const H = SWING_HANDS[policy] ?? SWING_HANDS.casual, P = POLICIES[policy] ?? POLICIES.casual;
  const out = { moves: 0 };
  const t0 = Date.now(), mem = swing.mem.get(host + policy) ?? {};
  swing.mem.set(host + policy, mem);
  while (Date.now() - t0 < stintMs) {
    const v = await page.evaluate(SWING_SIGHT(host));
    if (!v || v.won) break;
    const m = swingDecide({ ...v, t: Date.now(), strap: Boolean(v.strap), retry: Boolean(v.retry) }, mem, r, H);
    if (m) {
      out.moves++;
      if (m.g === 'cut') {
        const line = m.v === 'pack' ? v.strap : v.vines.find((x) => x.v === m.v)?.line;
        if (line) { const mo = motion(hand, { kind: 'swipe', c: { key: `cut:${m.v}`, line } }, r, P, touch); await judged(mo.key, mo.run); }
      } else if (m.g === 'gust' && v.puff) await judged('gust', () => tapAt(hand, ...v.puff));
      else if (m.g === 'retry' && v.retry) await judged('retry', () => tapAt(hand, ...v.retry));
    }
    await sleep(30);
  }
  return out;
}
swing.mem = new Map();

export const tapAt = async (hand, x, y) => { await hand.down(x, y); await sleep(70 + Math.random() * 60); await hand.up(x, y); };

/* After a win: the end frame stands; no fresh board flashes back before the story moves on. */
async function endFrame(page, t, shot, findings) {
  await shot('end');
  const t0 = Date.now();
  let flashed = null;
  while (Date.now() - t0 < 3000) {
    const s = await page.evaluate(`(() => { const h = document.querySelector(${JSON.stringify(t.host)}); if (!h || !h.getClientRects().length) return 'gone';
      return h.querySelector('.is-won') || /^成/.test(document.getElementById('won')?.textContent || '') ? 'won' : h.querySelector('[data-g-swipe],[data-g-drag],[data-g="spot"]') ? 'fresh' : 'other'; })()`);
    if (s === 'fresh' && !flashed) { flashed = Date.now() - t0; await shot('flash'); }
    if (s === 'gone') break;
    await sleep(50);
  }
  if (flashed != null) findings.push({ kind: 'end-frame', why: `a fresh board showed ${flashed} ms after the win` });
  await sleep(600);
  await shot('after');
}

/* ── Targets: every kept story board on its scene, and the try page's own rows ── */
function targets(content, at, only) {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'worlds/jiuding/games.json'), 'utf8'));
  const list = [];
  for (const row of reg.games) {
    if (!row.scene || !row.task) continue;
    if (only ? !only.has(row.id) && !only.has(row.task) : SKIP.has(row.id)) continue;
    if (!at.has(row.scene)) { list.push({ name: row.task, game: row.id, missing: `scene ${row.scene} never reached by the walk` }); continue; }
    const sc = Object.values(content.chapters).map((ch) => ch.scenes?.[row.scene]).find(Boolean);
    const save = `ph-${row.task}`.slice(0, 31).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const seeder = boardSeeder(at, sc, row.task, save, row.scene);
    list.push({ name: row.task, game: row.id, board: row.task, save: seeder, saveName: save, host: `[data-game="${row.task}"], [data-mount="${row.task}"]`, // a mount() beat (气走经脉) lays [data-mount]
      url: (base) => `${base}/apps/lingjing/scripts/index.html?save=${save}&chat=off` });
  }
  const tryRow = (name, game, extra = '') => ({ name, game, host: '#slot', url: (base) => `${base}/apps/lingjing/scripts/try-game.html?dev=1&game=${game}${extra}&save=ph-try` });
  // The throws (射鹿, 芦苇里那一等) are levels of 砸寨 since 2026-10-20: a Phaser canvas, played by its own bot
  // (tools/zhazhai/bot.mjs), not by these DOM hands.
  // 气走经脉: one try-page row per level of the kit (games.json `qimai` rows, the ladder by `n`).
  const qimai = reg.games.filter((g) => g.id === 'qimai').flatMap((g) => g.levels ?? []).sort((a, b) => (a.n ?? 99) - (b.n ?? 99));
  for (const [i, l] of qimai.entries()) {
    if (only && !only.has('qimai') && !only.has(`qimai-${l.id}`)) continue;
    list.push(tryRow(`qimai-${l.id}`, 'qimai', `&level=${i + 1}`));
  }
  return list;
}

/* ── The command line ── */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => /^--([^=]+)(?:=(.*))?$/.exec(a)).filter(Boolean).map((m) => [m[1], m[2] ?? true]));
  const base = flags.base ?? 'http://localhost:9527';
  const out = flags.out ?? path.join(os.tmpdir(), 'lj-play-human');
  fs.mkdirSync(out, { recursive: true });
  const ok = await fetch(`${base}/apps/lingjing/scripts/index.html`).then((r) => r.ok).catch(() => false);
  if (!ok) { console.error(`no engine at ${base} — start Linggen, or pass --base`); process.exit(2); }
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { console.error('playwright missing: (cd lingjing/tools && npm install)'); process.exit(2); }
  const content = loadContent();
  const at = savesAtScenes(content);
  const only = flags.games ? new Set(String(flags.games).split(',')) : null;
  const widths = String(flags.widths ?? '1440,390').split(',').map(Number);
  const policies = String(flags.policies ?? 'casual,sloppy,idle').split(',');
  const seeds = Number(flags.seeds ?? 2), seconds = Number(flags.seconds ?? 90), jobs = Number(flags.jobs ?? 3);
  const list = targets(content, at, only);
  const browser = await chromium.launch({ headless: !flags.headed });
  const runs = [];
  for (const t of list) if (!t.missing) for (const width of widths) for (const policy of policies) for (let seed = 1; seed <= (policy === 'casual' ? seeds : 1); seed++) runs.push({ t, width, policy, seed });
  const results = [];
  const made = new Set(list.filter((t) => t.saveName).map((t) => t.saveName));
  let next = 0;
  // one job per board at a time (they share its scratch save)
  const busy = new Set();
  const worker = async () => {
    for (;;) {
      const i = runs.findIndex((x, k) => k >= 0 && !x.taken && !busy.has(x.t.name));
      if (i < 0) { if (runs.some((x) => !x.taken)) { await sleep(300); continue; } return; }
      const job = runs[i]; job.taken = true; busy.add(job.t.name);
      const r = await playOnce(browser, job.t, { width: job.width, policy: job.policy, seed: job.seed, seconds: job.policy === 'idle' ? Math.min(seconds, 60) : seconds, out, base });
      busy.delete(job.t.name);
      results.push(r); next++;
      fs.appendFileSync(path.join(out, 'runs.jsonl'), JSON.stringify(r) + '\n'); // as it goes, for a long sweep
      console.log(`${String(next).padStart(3)}/${runs.length} ${r.tag.padEnd(42)} ${r.won ? `won ${(r.ms / 1000).toFixed(0)}s${r.stars != null ? ` ★${r.stars}` : ''}${r.grade ? ` ${r.grade}` : ''}` : 'not won'}${r.lost ? ` lost×${r.lost}` : ''}  ${r.findings.map((f) => f.kind).join(' ')}`);
    }
  };
  try { await Promise.all(Array.from({ length: jobs }, worker)); }
  finally {
    await browser.close();
    if (!flags.keep) for (const name of [...made, 'ph-try']) { const d = path.join(HOME, name); if (!fs.existsSync(d)) continue; const trash = path.join(os.homedir(), '.Trash'); if (fs.existsSync(trash)) fs.renameSync(d, path.join(trash, `${name}-${Date.now()}`)); else fs.rmSync(d, { recursive: true, force: true }); }
  }
  // Across runs: controls never once alive, the outcome spread.
  const summary = [];
  for (const t of list) {
    if (t.missing) { summary.push({ name: t.name, game: t.game, findings: [{ kind: 'no-board', why: t.missing }] }); continue; }
    const rs = results.filter((r) => r.name === t.name);
    const tally = {};
    for (const r of rs) for (const [k, v] of Object.entries(r.touched ?? {})) { tally[k] ??= { n: 0, changed: 0 }; tally[k].n += v.n; tally[k].changed += v.changed; }
    const f = [];
    for (const [k, v] of Object.entries(tally)) if (v.n && !v.changed && !k.startsWith('tool:')) f.push({ kind: 'inert-control', what: k, why: `touched ${v.n}×, never changed the board` });
    const by = (p) => rs.filter((r) => r.policy === p);
    if (by('casual').length && !by('casual').some((r) => r.won)) f.push({ kind: 'spread', why: 'no casual run won' });
    if (by('idle').some((r) => r.won && (r.stars == 3 || r.stars === '3'))) f.push({ kind: 'spread', why: 'the idle hand won best' });
    const per = Object.fromEntries(policies.map((p) => [p, `${by(p).filter((r) => r.won).length}/${by(p).length}`]));
    const all = [...f, ...rs.flatMap((r) => r.findings.map((x) => ({ ...x, run: r.tag, video: r.video })))];
    summary.push({ name: t.name, game: t.game, wins: per, findings: all });
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, summary }, null, 1));
  console.log('\n— summary —');
  for (const s of summary) {
    const kinds = {}; for (const f of s.findings) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
    console.log(`${s.name.padEnd(22)} ${JSON.stringify(s.wins ?? {})} ${Object.entries(kinds).map(([k, v]) => `${k}×${v}`).join(' ') || 'clean'}`);
  }
  console.log(`→ ${path.join(out, 'results.json')} · frames/ · video/ + trace/ for failing runs`);
  process.exitCode = summary.some((s) => s.findings.some((f) => !['code-drawn', 'slow-tap'].includes(f.kind))) ? 1 : 0;
}
