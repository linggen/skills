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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

/* Boards being cut or rebuilt (games.md, 10-16) — not played unless named with --games. */
export const SKIP = new Set(['storm', 'rentrope', 'feather', 'tauntrope', 'griddle', 'wayrope', 'carry', 'villageday', 'villagedong', 'villageeve', 'xisui', 'deer', 'reed']);
/* What looks like a tool a first-time player would poke. */
export const TOOL_LOOKS = '.g-rope-spring, .g-rope-seal, .g-rope-crow, .g-puff, .g-ft-bubble, .g-ft-thorns, .g-regrow, .g-tk-pick, [class*="tool"]';
/* Shapes allowed to be code-drawn: invisible hit areas, the UI's glyphs and short-lived effects. */
export const UI_GLYPHS = /(^|[\s-])(hit|pad|teach|tapink|ink-ring|pips?|ripple|splash|drop|stain|glow|streak|trail|aim|dot|ring|wash|fullmark|waterfill|gust-band|sr|bar|meter|track|cursor|seal|burp|steam|flash|spark|chaff|dust|bolt|fx)([\s-]|$)/;

/* ── In the page: what the eye sees ── */
const SEE = (host) => `(() => {
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
  return { controls, tools, won, say, head, host: box(host), W, H };
})()`;

/* What the board shows, as tokens: each element's tag, class, data and own words — never its
   geometry (a swinging thing moves every frame; a cut vine or a lit control changes a token). */
const DIGEST = (host) => `(() => {
  const host = document.querySelector(${JSON.stringify(host)}); if (!host) return ['<gone>'];
  const out = [];
  for (const e of host.querySelectorAll('*')) {
    if (e.closest('.g-sr')) continue;
    const data = [...e.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'disabled' || a.name === 'href').map((a) => a.name + '=' + a.value).join(',');
    const own = [...e.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join('');
    out.push(e.tagName + '.' + (e.getAttribute('class') || '') + '[' + data + ']' + own);
  }
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
function handsFor(page, cdp, touch) {
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
  sloppy: { react: [600, 1200], aim: 2.6, lapse: 0.15, wrong: 0.25, curious: false },
  idle: { react: [400, 900], aim: 1, lapse: 0, wrong: 0, idle: true },
};
const START = /^(start|play|begin|go|next|again)$/;
const QUIT = /^(skip|giveup|quit)$/;

/* Per kind of board, which visible thing to act on (the eye's choice). Answers an action or null. */
const CHOOSERS = {
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
  arc: (seen, r, mem) => {
    const next = seen.controls.find((c) => c.g === 'next');
    if (next) return { kind: 'tap', c: next };
    const pad = seen.controls.find((c) => c.kind === 'drag');
    if (!pad || mem.settleUntil > Date.now()) return mem.flying && r() < 0.02 ? { kind: 'tap-at', x: pad?.x ?? seen.host.x, y: pad?.y ?? seen.host.y } : null;
    const lvl = seen.head; if (mem.level !== lvl) { mem.level = lvl; mem.vec = null; }
    // the last pull, corrected a little (he watched where it went), else a first guess
    const base = mem.vec ?? { a: -0.35 + r() * 0.5, p: 0.25 + r() * 0.2 };
    mem.vec = { a: base.a + gauss(r) * 0.12, p: Math.max(0.12, Math.min(0.5, base.p + gauss(r) * 0.05)) };
    mem.settleUntil = Date.now() + 2600; mem.flying = true;
    const len = mem.vec.p * Math.min(pad.w, 700), x0 = pad.x + pad.w * 0.1, y0 = pad.y;
    return { kind: 'drag', from: [x0, y0], to: [x0 + Math.cos(mem.vec.a) * len, y0 - Math.sin(mem.vec.a) * len] };
  },
  any: (seen, r) => {
    const pool = seen.controls.filter((c) => !QUIT.test(c.g ?? '') && c.g !== 'retry');
    if (!pool.length) return null;
    const lit = pool.filter((c) => /is-on|g-teach|is-drip|is-live|is-now|is-ready/.test(c.cls));
    const c = (lit.length && r() < 0.7 ? lit : pool)[Math.floor(r() * (lit.length && r() < 0.7 ? lit : pool).length)];
    return c.kind === 'hold' || c.kind === 'drag' ? { kind: 'hold', c, ms: 300 + r() * 2200 } : c.kind === 'swipe' ? { kind: 'swipe', c } : { kind: 'tap', c };
  },
};
const chooserOf = (game) => (game === 'rain' ? 'rain' : ['bread', 'fantongcut', 'rentrope', 'tauntrope', 'wayrope'].includes(game) ? 'cut' : ['deerarc', 'caveecho', 'luwing', 'throwkit'].includes(game) ? 'arc' : 'any');
const LOSS = { rain: /成河/ };

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
    const digest = () => page.evaluate(DIGEST(t.host));
    const diff = (a, b) => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) ?? 0) + 1); for (const x of b) m.set(x, (m.get(x) ?? 0) - 1); return [...m].filter(([, v]) => v).map(([k]) => k); };
    // A tap judged: the board's idle motion learned over the reaction, then the tap, then 150 / 500 ms.
    const judged = async (key, act) => {
      const a = await digest(); await sleep(120); const b = await digest();
      const idle = new Set(diff(a, b));
      await act();
      await sleep(150);
      const c = await digest();
      let moved = diff(b, c).filter((x) => !idle.has(x)).length > 0, slow = false;
      if (!moved) { await sleep(350); const d = await digest(); slow = diff(b, d).filter((x) => !idle.has(x)).length > 0; }
      const e = touched.get(key) ?? { n: 0, changed: 0 }; e.n++; if (moved || slow) e.changed++; touched.set(key, e);
      return moved ? 'ok' : slow ? 'slow' : 'dead';
    };
    const t0 = Date.now(), mem = {};
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
      const err = (touch ? 7 : 4) * P.aim;
      const ax = (x) => x + gauss(r) * err, ay = (y) => y + gauss(r) * err;
      res.taps++;
      if (a.kind === 'tap' || a.kind === 'tap-at') {
        const x = ax(a.c?.x ?? a.x), y = ay(a.c?.y ?? a.y);
        const key = a.c?.key ?? 'in-flight';
        const got = await judged(key, () => tapAt(hand, x, y));
        if (got === 'dead' && a.c && !deadLogged.has(key)) { deadLogged.add(key); findings.push({ kind: 'dead-tap', what: `${a.c.key} "${a.c.text}"`, x: Math.round(x), y: Math.round(y), at: seen.say }); }
        if (got === 'slow' && a.c && !deadLogged.has('slow' + key)) { deadLogged.add('slow' + key); findings.push({ kind: 'slow-tap', what: `${a.c.key} "${a.c.text}"` }); }
      } else if (a.kind === 'swipe') {
        const [x1, y1, x2, y2] = a.c.line ?? [a.c.l, a.c.t, a.c.r, a.c.b];
        const k = 0.2 + r() * 0.6, mx = x1 + (x2 - x1) * k, my = y1 + (y2 - y1) * k;
        const len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len, ny = (x2 - x1) / len, reach = 22 + r() * 30;
        const steps = 6 + Math.floor(r() * 10);
        const pts = Array.from({ length: steps + 1 }, (_, i) => [ax(mx - nx * reach) + (2 * nx * reach) * i / steps, ay(my - ny * reach) + (2 * ny * reach) * i / steps]);
        await judged(a.c.key, () => hand.path(pts));
      } else if (a.kind === 'drag') {
        const steps = 14 + Math.floor(r() * 16), [x0, y0] = a.from, [x1, y1] = a.to;
        const pts = Array.from({ length: steps + 1 }, (_, i) => [x0 + (x1 - x0) * i / steps + gauss(r) * 0.6, y0 + (y1 - y0) * i / steps + gauss(r) * 0.6]);
        await judged('drag', async () => { await hand.down(...pts[0]); for (const p of pts.slice(1)) { await sleep(16); await hand.move(...p); } await sleep(150 + r() * 400); await hand.up(...pts.at(-1)); });
      } else if (a.kind === 'hold') {
        const x = ax(a.c.x), y = ay(a.c.y);
        await judged(a.c.key, async () => { await hand.down(x, y); await sleep(a.ms); await hand.up(x, y); });
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

const tapAt = async (hand, x, y) => { await hand.down(x, y); await sleep(70 + Math.random() * 60); await hand.up(x, y); };

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
    list.push({ name: row.task, game: row.id, board: row.task, save: seeder, saveName: save, host: `[data-game="${row.task}"]`,
      url: (base) => `${base}/apps/lingjing/scripts/index.html?save=${save}` });
  }
  // The 饭桶's daily puzzle, one try-page row per tool day (fantong.json `puzzle.unlock`), and the throwing kit.
  const ft = JSON.parse(fs.readFileSync(path.join(ROOT, 'worlds/jiuding/fantong.json'), 'utf8')).puzzle ?? {};
  const unlock = ft.unlock ?? [];
  const tryRow = (name, game, extra = '') => ({ name, game, host: '#slot', url: (base) => `${base}/apps/lingjing/scripts/try-game.html?dev=1&game=${game}${extra}&save=ph-try` });
  for (const u of unlock) {
    if (only && !only.has('fantongcut') && !only.has(`fantongcut-${u.el}`)) continue;
    const els = unlock.filter((x) => x.day <= u.day).map((x) => x.el);
    const data = { tier: 2, els, must: u.el, ...(ft.teach?.[u.el] ? { teach: ft.teach[u.el].zh ?? ft.teach[u.el] } : {}) };
    list.push(tryRow(`fantongcut-${u.el}`, 'fantongcut', `&data=${encodeURIComponent(JSON.stringify(data))}`));
  }
  if (!only || only.has('throwkit')) list.push(tryRow('throwkit', 'throwkit'));
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
