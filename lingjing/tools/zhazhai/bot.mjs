// bot.mjs — plays a 砸寨 level in headless Chromium with a scripted hand, on the built bundle (games/zhazhai/), under
// Playwright's fake clock (so a level plays in a second or two, and the same throws play the same twice).
//
//   node tools/zhazhai/bot.mjs [--levels=deer-wind,yishui-reed] [--policies=sensible,lazy] [--seeds=6] [--grid]
//
// The hand sees what a player sees (the bundle's `zhazhaiBot` handle, src/zhazhai/bot.ts: where the targets stand,
// whether the 鯥's wing root shows, what is next in the basket) and throws through the slingshot's own path.
//   sensible  aims at the target's soft spot along a flight it knows (the arc of a pull, clear of what stands in the way),
//             with a human's error (σ 0.6° and 1.2% of the draw), waits for a fled stag to come back, waits for the 鯥's
//             breath so the throw arrives while the wing root shows, and taps the sword when its line points home.
//   lazy      a full draw at 45° the moment it can, every throw, never a tap.
// --grid: every (angle, power) of a coarse grid as one first throw — the share that wins is the level's "one-shot" ease.
// Needs playwright (cd tools && npm install); tests/game-zhazhai.test.mjs skips without it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, '../../scripts');

export function playwrightOrNull() {
  try {
    return createRequire(path.join(HERE, '../package.json'))('playwright');
  } catch {
    return null;
  }
}

const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.frag': 'text/plain', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const HARNESS = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<div id="host" style="width:960px;height:540px"></div>
<script type="module">
  const q = new URLSearchParams(location.search);
  let s = Number(q.get('seed') || 1) >>> 0;
  Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const { start } = await import('/games/zhazhai/zhazhai.min.mjs');
  const host = document.getElementById('host');
  const game = start({ parent: host, base: '/games/zhazhai/', lang: 'zh', level: q.get('lv'), reducedMotion: false,
    onResult: (r) => { window.__zz = r; }, onLeave: () => {} });
  // Draw nothing (a 1920×1080 WebGL frame in software is most of a step's cost): the physics and the rules run as ever.
  if (q.get('nodraw') === '1') game.events.once('ready', () => { game.scene.render = () => {}; });
</script>`;

/** A static server over scripts/ with the harness page; resolves to { url, close }. */
export function serve() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/harness.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(HARNESS);
    }
    const file = path.join(SCRIPTS, decodeURIComponent(u.pathname));
    if (!file.startsWith(SCRIPTS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const rng = (seed) => {
  let s = (seed * 2654435761) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

/** The flight of a pull, a point a physics step (Matter's own step: the velocity kept but for the air's drag, the pull
    down added, at 60 steps a second), from where the drawn pouch holds the thing. */
export function arcOf(info, angle, power, steps = 260) {
  const { gravity, next, maxPull, velocity } = info.physics;
  const a = (angle * Math.PI) / 180, d = Math.max(0.12, Math.min(1, power)) * maxPull;
  let x = info.rest.x - d * Math.cos(a), y = info.rest.y + d * Math.sin(a);
  let vx = d * velocity * Math.cos(a), vy = -d * velocity * Math.sin(a);
  const drag = 1 - (next?.frictionAir ?? 0.0005), fall = gravity.y * gravity.scale * (1000 / 60) ** 2;
  const out = [];
  for (let i = 0; i < steps; i++) {
    vx *= drag;
    vy = vy * drag + fall;
    x += vx;
    y += vy;
    out.push({ x, y });
  }
  return out;
}

/** The best pull for the soft spot, as a steady hand learns it: of the pulls whose flight reaches it (the stag's body,
    kept a third in from its edges, or the 鯥's wing root, half its radius) clear of everything in the way (the blocks,
    and the target's own hide when the aim is a spot on it, inflated by the thing's size), the one whose neighbours hit
    too (a degree and a little power either way: a throw that forgives the hand's error), then the soonest there; else the
    pull that comes nearest. */
export function choose(info, aim, body = null) {
  const radius = info.physics.next?.radius ?? 30;
  const solid = [...info.blocks, ...(body && !aim.box ? [body] : [])];
  const boxes = solid.map((b) => ({ x0: b.x0 - radius, y0: b.y0 - radius, x1: b.x1 + radius, y1: b.y1 + radius }));
  const inBox = (p, b) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1;
  const box = aim.box;
  const inner = box && { x0: box.x0 + (box.x1 - box.x0) / 3, x1: box.x1 - (box.x1 - box.x0) / 3, y0: box.y0 + (box.y1 - box.y0) / 4, y1: box.y1 - (box.y1 - box.y0) / 4 };
  const hits = (p) => (inner ? inBox(p, inner) : Math.hypot(p.x - aim.x, p.y - aim.y) < aim.r * 0.5);
  const A = [], P = [];
  for (let angle = 1; angle <= 75; angle += 0.5) A.push(angle);
  for (let power = 0.25; power <= 1.0001; power += 0.005) P.push(power);
  const grid = A.map((angle) => P.map((power) => {
    const pts = arcOf(info, angle, power);
    let at = -1, miss = Infinity, near = -1;
    for (let i = 0; i < pts.length; i++) {
      if (hits(pts[i])) { at = i; break; }
      const d = Math.hypot(pts[i].x - aim.x, pts[i].y - aim.y);
      if (d < miss) { miss = d; near = i; }
      if (pts[i].y > 1960) break;
    }
    const upto = at >= 0 ? at : near;
    let blocked = false;
    for (let i = 0; i < upto - 1 && !blocked; i++) blocked = boxes.some((b) => inBox(pts[i], b));
    return { angle, power, frames: upto, hit: at >= 0 && !blocked, miss: blocked ? Infinity : miss };
  }));
  let best = null;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < P.length; j++) {
    const c = grid[i][j];
    if (!c.hit) continue;
    let room = 0;
    for (let di = -2; di <= 2; di++) for (let dj = -3; dj <= 3; dj++) room += grid[i + di]?.[j + dj]?.hit ? 1 : 0;
    const score = room * 1000 - c.frames;
    if (!best || score > best.score) best = { ...c, score, room };
  }
  if (best) return best;
  for (const row of grid) for (const c of row) if (!best || c.miss < best.miss) best = c;
  return best;
}

/** How much room a level gives a first throw: the share of a pull grid (angle 1…75°, power 0.25…1) whose flight reaches
    the target's soft spot clear of everything in the way — times the share of the time the spot shows (the 鯥's breath).
    A level later in the story gives less room (tests/game-zhazhai.test.mjs). */
export function windowOf(info) {
  const target = info.targets[0];
  const aim = target.aim ?? { x: target.x, y: target.y, r: 40 };
  const radius = info.physics.next?.radius ?? 30;
  const solid = [...info.blocks, ...(target.body && !aim.box ? [target.body] : [])];
  const boxes = solid.map((b) => ({ x0: b.x0 - radius, y0: b.y0 - radius, x1: b.x1 + radius, y1: b.y1 + radius }));
  const inBox = (p, b) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1;
  const hits = (p) => (aim.box ? inBox(p, aim.box) : Math.hypot(p.x - aim.x, p.y - aim.y) < aim.r);
  let n = 0, good = 0;
  for (let angle = 1; angle <= 75; angle += 1) {
    for (let power = 0.25; power <= 1.0001; power += 0.01) {
      n++;
      const pts = arcOf(info, angle, power);
      for (let i = 0; i < pts.length; i++) {
        if (hits(pts[i])) { good++; break; }
        if (boxes.some((b) => inBox(pts[i], b)) || pts[i].y > 1960) break;
      }
    }
  }
  return (good / n) * (target.every ? target.openFor / target.every : 1);
}

/** The field of a level, as the bot sees it before the first throw. */
export async function fieldOf(browser, base, lv) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  try {
    await page.clock.install({ time: 0 });
    await page.goto(`${base}/harness.html?lv=${encodeURIComponent(lv)}&seed=1&nodraw=1`);
    for (let i = 0; i < 400; i++) {
      await page.clock.runFor(100);
      const info = await page.evaluate(() => document.getElementById('host')?.zhazhaiBot?.info() ?? { ready: false });
      if (info.ready) return info;
      await new Promise((res) => setTimeout(res, 15));
    }
    return null;
  } finally {
    await page.close();
  }
}

/** One game of a level by one policy; returns { won, stars, throws, ms }. */
export async function playLevel(browser, base, lv, policy, seed, { firstThrow = null, maxMs = 150000, shots = null, log = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('crash', () => errors.push('crash'));
  try {
    await page.clock.install({ time: 0 });
    await page.goto(`${base}/harness.html?lv=${encodeURIComponent(lv)}&seed=${seed}&nodraw=${shots ? 0 : 1}`);
    const info = () => page.evaluate(() => document.getElementById('host')?.zhazhaiBot?.info() ?? { ready: false });
    const run = (ms) => page.clock.runFor(ms);
    const r = rng(seed);
    let t = 0, throws = 0;
    // Boot: assets load on real time, the game on the fake clock.
    for (let i = 0; i < 400; i++) {
      await run(100);
      t += 100;
      if ((await info()).ready) break;
      await new Promise((res) => setTimeout(res, 15));
    }
    const snap = async (name) => shots && page.screenshot({ path: `${shots}-${name}.png` });
    await snap('0-start');
    while (t < maxMs) {
      const done = await page.evaluate(() => window.__zz ?? null);
      if (done) return { won: done.won, stars: done.stars, throws, ms: t, ...(errors.length ? { errors } : {}) };
      const now = await info();
      if (!now.playing && !now.ready) { await run(200); t += 200; continue; }
      if (!now.ready) { await run(100); t += 100; continue; }
      const target = now.targets[0];
      let angle, power, wait = 0, dash = false;
      if (firstThrow && throws === 0) {
        ({ angle, power } = firstThrow);
      } else if (policy === 'lazy') {
        angle = 45; power = 1;
      } else {
        if (!target || target.away) { await run(250); t += 250; continue; }
        const hint = now.bot ?? {};
        const aim = target.aim ?? { x: target.x, y: target.y, r: 40 };
        const pick = choose(now, aim, target.body);
        angle = pick.angle + gauss(r) * 0.6;
        power = Math.min(1, pick.power + gauss(r) * 0.012);
        dash = Boolean(hint.dash);
        if (hint.timed && target.every) {
          // Arrive in the middle of the window: the flight is `frames` frames (a dash shortens it, so aim a little late).
          const flight = pick.frames * (1000 / 60) * (dash ? 0.8 : 1);
          wait = target.nextOpen + target.openFor * 0.5 - flight;
          while (wait < 0) wait += target.every;
        }
      }
      if (wait > 0) { await run(Math.round(wait)); t += wait; }
      await page.evaluate(([a, p]) => document.getElementById('host').zhazhaiBot.throw(a, p), [angle, power]);
      throws++;
      log?.({ lv, policy, seed, throw: throws, angle: +angle.toFixed(1), power: +power.toFixed(3), wait: Math.round(wait), target });
      // Watch it fly; a sword is tapped when its line points at the soft spot.
      for (let i = 0; i < 400; i++) {
        await run(33);
        t += 33;
        const f = await info();
        if (!f.bird) { if (i > 3) break; continue; }
        if (dash && f.canTap && target?.aim) {
          const { x, y, vx, vy } = f.bird;
          const ax = target.aim.x - x, ay = target.aim.y - y;
          const along = (ax * vx + ay * vy) / Math.hypot(vx, vy);
          const off = Math.abs(ax * vy - ay * vx) / Math.hypot(vx, vy);
          if (along > 60 && off < target.aim.r * 0.5) await page.evaluate(() => document.getElementById('host').zhazhaiBot.tap());
        }
        if (i === 30) await snap(`${throws}-flight`);
      }
      await snap(`${throws}-after`);
    }
    return { won: false, stars: 0, throws, ms: t, timeout: true, ...(errors.length ? { errors } : {}) };
  } catch (e) {
    return { won: false, stars: 0, ms: 0, failed: String(e).slice(0, 200), errors };
  } finally {
    await page.close();
  }
}

async function main() {
  const pw = playwrightOrNull();
  if (!pw) throw new Error('playwright is not installed: cd tools && npm install');
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
  const levels = String(args.levels ?? 'deer-wind,yishui-reed').split(',');
  const policies = String(args.policies ?? 'sensible,lazy').split(',');
  const seeds = Number(args.seeds ?? 4);
  const srv = await serve();
  const browser = await pw.chromium.launch();
  try {
    for (const lv of levels) {
      const field = await fieldOf(browser, srv.url, lv);
      console.log(`${lv} window: ${(windowOf(field) * 100).toFixed(2)}% of the pull grid`);
      if (args.grid) {
        let wins = 0, n = 0;
        for (let angle = 10; angle <= 70; angle += 10) for (let power = 0.4; power <= 1.0001; power += 0.1) {
          const res = await playLevel(browser, srv.url, lv, 'lazy', 1, { firstThrow: { angle, power }, maxMs: 20000 });
          n++;
          if (res.won && res.throws === 1) wins++;
        }
        console.log(`${lv} grid: ${wins}/${n} one-shot wins`);
      }
      for (const policy of policies) {
        const out = [];
        for (let seed = 1; seed <= seeds; seed++) out.push(await playLevel(browser, srv.url, lv, policy, seed, { shots: args.shots ? `${args.shots}/${lv}-${policy}-${seed}` : null, log: args.verbose ? (e) => console.log(JSON.stringify(e)) : null }));
        console.log(`${lv} ${policy}: ${out.filter((o) => o.won).length}/${out.length} won`, JSON.stringify(out));
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
