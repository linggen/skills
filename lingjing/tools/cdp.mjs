// tools/cdp.mjs — a tiny Chrome DevTools Protocol client for the playtest
// crawler (tools/playtest.mjs). No dependencies: Node's own fetch and
// WebSocket drive a headless Chrome started on its own throwaway profile, so
// a crawl never touches the browser the player plays in.
import { spawn } from 'node:child_process';
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

/// Start a headless Chrome on a fresh profile; answers { page, close }.
export async function launch({ width = 1280, height = 820, headless = true } = {}) {
  if (!CHROME) throw new Error('no Chrome found (set CHROME=/path/to/chrome)');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-playtest-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--mute-audio', '--autoplay-policy=no-user-gesture-required', ...(headless ? ['--headless=new'] : []), 'about:blank'];
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) {
    await sleep(150);
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null);
  }
  const target = targets?.find((t) => t.type === 'page');
  if (!target) { proc.kill(); throw new Error('Chrome did not open a page'); }
  const page = await connect(target.webSocketDebuggerUrl);
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const close = async () => {
    try { page.ws.close(); } catch {}
    proc.kill();
    await sleep(200);
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return { page, close };
}

/// One page over its debugger socket: send(method, params), on(event, fn), and the helpers the crawler uses.
async function connect(url) {
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

  /* Every console error and uncaught exception the page raises, kept in order. */
  const errors = [];
  on('Runtime.exceptionThrown', (p) => errors.push({ kind: 'exception', text: p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text, url: p.exceptionDetails?.url }));
  on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error' && p.type !== 'assert') return;
    errors.push({ kind: `console.${p.type}`, text: p.args.map((a) => a.value ?? a.description ?? '').join(' ') });
  });
  on('Log.entryAdded', (p) => { if (p.entry.level === 'error') errors.push({ kind: `log.${p.entry.source}`, text: p.entry.text, url: p.entry.url }); });

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
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    return true;
  };
  const screenshot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  };
  const resize = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  return { ws, send, on, errors, evaluate, goto, click, clickAt, screenshot, resize };
}
