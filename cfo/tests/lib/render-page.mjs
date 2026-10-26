// render-page.mjs — load a page in headless Chrome in REAL time and answer its
// DOM once `ready` (a page expression) is true, or null after `timeoutMs`.
//
// Why not `chrome --dump-dom --virtual-time-budget`: the page's data comes over
// WebRTC (no HTTP data path since 2026-10-06). Virtual time runs the page's
// timers on a fake clock, so the transport's 5 s ICE-gather cap fires before a
// single real candidate arrives ("ICE gathered … 0 candidates"), the channel
// never opens, and the dump is the empty shell. Real time over the DevTools
// protocol renders the report in under a second.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function renderPage(chrome, url, { ready, timeoutMs = 30000 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'cfo-page-test-'));
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    // Port 0: Chrome picks a free port and writes it to DevToolsActivePort.
    let port = null;
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(100);
      try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {}
    }
    if (!port) return null;
    const target = (await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json())).find((t) => t.type === 'page');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
    let id = 0;
    const waiting = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    };
    const send = (method, params = {}) => new Promise((ok) => { const n = ++id; waiting.set(n, ok); ws.send(JSON.stringify({ id: n, method, params })); });
    const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
    await send('Page.navigate', { url });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(250);
      if (await evaluate(`!!(${ready})`).catch(() => false)) return await evaluate('document.documentElement.outerHTML');
    }
    return null;
  } finally {
    try { ws?.close(); } catch {}
    proc.kill('SIGKILL');
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
  }
}
