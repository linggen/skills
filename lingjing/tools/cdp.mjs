// tools/cdp.mjs — a tiny Chrome DevTools Protocol client for the playtest
// crawler (tools/playtest.mjs). No dependencies: Node's own fetch and
// WebSocket drive a headless Chrome started on its own throwaway profile, so
// a crawl never touches the browser the player plays in.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean).find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Every test Chrome this process started dies with it — a crawl killed or crashed mid-run left three spinning
   at full CPU for 7 h on 2026-10-26 (a normal finish was the only path that closed them). A process killed
   outright (SIGKILL) runs no handler, so each launch also ends the orphans an earlier run left: test Chromes on
   an `lj-playtest-` profile whose parent is gone (re-parented to launchd, ppid 1). */
const live = new Set();
const killAll = () => { for (const p of live) try { p.kill('SIGKILL'); } catch {} live.clear(); };
process.once('exit', killAll);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { killAll(); process.exit(128); });
function endOrphans() {
  try {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n');
    for (const row of rows) {
      const m = row.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (m && m[2] === '1' && m[3].includes('--user-data-dir=') && m[3].includes('lj-playtest-')) try { process.kill(Number(m[1]), 'SIGKILL'); } catch {}
    }
  } catch { /* no ps: nothing to sweep */ }
}

/// Start a headless Chrome on a fresh profile; answers { page, close }. `touch`: a phone — DPR `scale`
/// (default 3), touch input emulated, and the page's taps made as touches.
export async function launch({ width = 1280, height = 820, headless = true, touch = false, scale = touch ? 3 : 1 } = {}) {
  if (!CHROME) throw new Error('no Chrome found (set CHROME=/path/to/chrome)');
  endOrphans();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-playtest-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--mute-audio', '--autoplay-policy=no-user-gesture-required', ...(headless ? ['--headless=new'] : []), 'about:blank'];
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  live.add(proc);
  proc.once('exit', () => live.delete(proc));
  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) {
    await sleep(150);
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null);
  }
  const target = targets?.find((t) => t.type === 'page');
  if (!target) { proc.kill(); throw new Error('Chrome did not open a page'); }
  const page = await connect(target.webSocketDebuggerUrl, { touch, scale });
  await page.resize(width, height, touch);
  if (touch) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const close = async () => {
    try { page.ws.close(); } catch {}
    proc.kill();
    await sleep(200);
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return { page, close };
}

/// One page over its debugger socket: send(method, params), on(event, fn), and the helpers the crawler uses.
async function connect(url, { touch = false, scale = 1 } = {}) {
  const ws = new WebSocket(url);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let id = 0;
  const waiting = new Map(), handlers = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      const { ok, bad } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? bad(new Error(`${msg.error.message} ${msg.error.data ?? ''}`)) : ok(msg.result);
    } else if (msg.method) (handlers.get(msg.method) ?? []).forEach((fn) => fn(msg.params));
  };
  const send = (method, params = {}) => new Promise((ok, bad) => { const n = ++id; waiting.set(n, { ok, bad }); ws.send(JSON.stringify({ id: n, method, params })); });
  const on = (method, fn) => handlers.set(method, [...(handlers.get(method) ?? []), fn]);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');

  /* Every console error and uncaught exception the page raises, kept in order. */
  const errors = [];
  on('Runtime.exceptionThrown', (p) => errors.push({ kind: 'exception', text: p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text, url: p.exceptionDetails?.url }));
  on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error' && p.type !== 'assert') return;
    errors.push({ kind: `console.${p.type}`, text: p.args.map((a) => a.value ?? a.description ?? '').join(' ') });
  });
  on('Log.entryAdded', (p) => { if (p.entry.level === 'error') errors.push({ kind: `log.${p.entry.source}`, text: p.entry.text, url: p.entry.url }); });

  /* Every /api request timed: the slow (> 1500 ms) and failed ones kept in order, and what is in
     flight now — to tell a stall's cause (waiting on the engine, or the page). */
  const api = [], inflight = new Map();
  on('Network.requestWillBeSent', (p) => {
    const url = p.request.url;
    if (!url.includes('/api/')) return;
    let verb = '';
    try { verb = JSON.parse(p.request.postData ?? '{}').verb ?? ''; } catch {}
    inflight.set(p.requestId, { url: url.replace(/^https?:\/\/[^/]+/, ''), verb, at: Date.now() });
  });
  const ended = (p, failed) => {
    const f = inflight.get(p.requestId); if (!f) return;
    inflight.delete(p.requestId);
    const ms = Date.now() - f.at;
    if (ms > 1500 || failed) api.push({ url: f.url, verb: f.verb, ms, failed, error: failed ? p.errorText : undefined });
  };
  on('Network.loadingFinished', (p) => ended(p, false));
  on('Network.loadingFailed', (p) => ended(p, true));
  const inFlight = () => [...inflight.values()].map((f) => `${f.verb ? `Verb ${f.verb}` : f.url} ${Date.now() - f.at}ms`);

  /// Run an expression in the page; answers its (JSON-able) value.
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  const goto = async (href) => {
    const loaded = new Promise((ok) => on('Page.loadEventFired', ok));
    await send('Page.navigate', { url: href });
    await Promise.race([loaded, sleep(15000)]);
  };
  /// A real mouse click at the centre of the first element the selector finds (hit-tested, as a finger would).
  const click = async (selector, index = 0) => {
    const box = await evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.getClientRects().length)[${index}];
      if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!box) return false;
    return clickAt(box.x, box.y);
  };
  const clickAt = async (x, y) => {
    if (touch) { await touchAt('touchStart', x, y); await sleep(60); await touchAt('touchEnd', x, y); return true; }
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    return true;
  };
  const touchAt = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 6, radiusY: 6, force: 1 }] });
  /* A mouse shaped as Playwright's (page.mouse), for play-human's hands: a move while down carries the held button. */
  let at = { x: 0, y: 0 }, held = false;
  const mouse = {
    move: (x, y) => { at = { x, y }; return send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, ...(held ? { button: 'left', buttons: 1 } : {}) }); },
    down: () => { held = true; return send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 }); },
    up: () => { held = false; return send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount: 1 }); },
  };
  const screenshot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  };
  const resize = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
  return { ws, send, on, errors, api, inFlight, touch, mouse, evaluate, goto, click, clickAt, screenshot, resize };
}
