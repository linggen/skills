// tools/playbot/serve.mjs — a scratch install of the game for the play bot: one skill checkout served the way
// the engine serves it (/apps/lingjing/<path>), and the page's one door (POST /api/skills/lingjing/tools/Verb)
// run as the engine runs it — `node scripts/rules.mjs <verb> <flags>`, one move at a time — with LINGJING_DATA
// pointing at a scratch data folder. No engine, no ~/.linggen, no account: nothing here can reach the player's save.
//
//   node tools/playbot/serve.mjs --skill=<skill dir> --data=<scratch data dir> [--shared=<engine shared/>] [--port=0]
// /shared/* (the engine's page kit: api.js, app-mode.js, chat-bridge.js) comes from the Linggen repo's shared/ —
// --shared, else $LINGGEN_SHARED, else ../linggen/shared beside the skills checkout.
//   (prints `PLAYBOT_SERVE http://127.0.0.1:<port>` once it listens)
//
// The engine's other routes the page touches are answered as a quiet engine would: the language (zh-Hans),
// no weather, no account, 银月's event door swallowed. Anything else under /api is a 404, logged.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const flag = (k, d = null) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;

/** The hour a baseline's save lives at (its saves are pb-b-*). */
export const BASELINE_NOW = '2026-11-05T10:00:00.000Z';

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

/** The stand-in channel page: `{method, path, body, contentType}` → `{status, content_type, body}` over local HTTP. */
const CHANNEL_PAGE = `<!doctype html><meta charset="utf-8"><script>
window.__linggenChannel = {
  isOpen: () => true,
  request: async (req) => {
    const init = { method: req.method, headers: {} };
    if (req.body != null && req.method !== 'GET' && req.method !== 'HEAD') { init.body = req.body; if (req.contentType) init.headers['content-type'] = req.contentType; }
    const r = await fetch('/__pb' + req.path, init);
    return { status: r.status, content_type: r.headers.get('content-type') || '', body: await r.text() };
  },
};
</script>`;

/** The engine's shared/ beside a skills checkout (…/linggen/skills/lingjing → …/linggen/linggen/shared). */
export function defaultShared(skill) {
  for (const up of ['../../linggen/shared', '../../../linggen/shared', '../../../../linggen/shared']) {
    const d = path.resolve(skill, up);
    if (fs.existsSync(path.join(d, 'api.js'))) return d;
  }
  return null;
}

/** The server. `skill` is a lingjing checkout (the folder holding SKILL.md), `data` its scratch data folder. */
export function makeServer({ skill, data, shared = null, log = () => {} }) {
  const SKILL = fs.realpathSync(path.resolve(skill));
  const SHARED = shared ? path.resolve(shared) : null;
  const DATA = path.resolve(data);
  if (DATA.startsWith(path.join(process.env.HOME ?? '', '.linggen'))) throw new Error('playbot: the scratch data folder may not be under ~/.linggen');
  fs.mkdirSync(DATA, { recursive: true });
  const unknown = new Set();
  /** Every verb the page ran, with what it answered — the bot's oracle (a fight's outcome, a refusal and its reason). */
  const verbs = [];
  let chain = Promise.resolve();

  const runVerb = (verb, flags) => new Promise((resolve) => {
    const args = [path.join(SKILL, 'scripts/rules.mjs'), String(verb), ...(Array.isArray(flags) ? flags.map(String) : [])];
    // A baseline's save (pb-b-*) plays at a fixed hour: its fight's seed is the clock's, so the same hand is dealt every run.
    const fixed = args.some((a) => /^--save=pb-b-/.test(a)) ? { LINGJING_NOW: BASELINE_NOW } : {};
    const child = spawn(process.execPath, args, { cwd: SKILL, env: { ...process.env, LINGJING_DATA: DATA, LINGJING_TRACK_OFF: '1', ...fixed } });
    let stdout = '', stderr = '';
    child.stdout.on('data', (b) => { stdout += b; });
    child.stderr.on('data', (b) => { stderr += b; });
    const kill = setTimeout(() => child.kill('SIGKILL'), 15000);
    child.on('close', (code) => { clearTimeout(kill); resolve({ stdout, stderr, exit_code: code }); });
  });

  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    // The engine's channel page (/shared/channel.js opens `/?channel=1` when no frame above holds a channel): here a
    // stand-in whose `request` carries each call to this server, so the page's own fetch path runs unchanged.
    if (url.pathname === '/' && url.searchParams.get('channel') === '1') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(CHANNEL_PAGE);
    }
    const p = decodeURIComponent(url.pathname.startsWith('/__pb/') ? url.pathname.slice(5) : url.pathname);
    if (req.method === 'POST' && p === '/api/skills/lingjing/tools/Verb') {
      let body = '';
      for await (const c of req) body += c;
      let q = {};
      try { q = JSON.parse(body || '{}'); } catch { return json(res, 400, { error: 'bad json' }); }
      // One move at a time, as the engine runs a skill's tools.
      const out = await (chain = chain.then(() => runVerb(q.verb, q.flags)));
      log(`verb ${q.verb} ${(q.flags ?? []).join(' ')} → ${out.exit_code}`);
      let parsed = null;
      try { parsed = JSON.parse(out.stdout.trim().split('\n').pop()); } catch { /* not JSON: the page says so */ }
      verbs.push({ at: Date.now(), verb: String(q.verb), flags: (q.flags ?? []).map(String), exit: out.exit_code, out: parsed, stderr: out.stderr.slice(0, 400) });
      return json(res, 200, out);
    }
    if (p === '/logo.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); return res.end('<svg xmlns="http://www.w3.org/2000/svg"/>'); }
    if (p === '/api/presence') return json(res, 200, { ok: true });
    if (p === '/api/user/language') return json(res, 200, { language: 'zh-Hans' });
    if (p === '/api/yinyue/event') return json(res, 200, { ok: true });
    if (p.startsWith('/api/account')) return json(res, 200, { signed_in: false });
    if (p.startsWith('/api/senses/weather')) return json(res, 404, { error: 'no weather in a scratch install' });
    if (p.startsWith('/api/')) {
      if (!unknown.has(p)) { unknown.add(p); log(`unanswered engine route ${req.method} ${p}`); }
      return json(res, 404, { error: 'not in a scratch install' });
    }
    if (p.startsWith('/shared/') && SHARED) return sendFile(res, path.join(SHARED, p.slice(8)), SHARED);
    if (!p.startsWith('/apps/lingjing/')) { res.writeHead(404); return res.end(); }
    const rel = p.slice('/apps/lingjing/'.length);
    // data/ is the scratch folder (made worlds, art), never the checkout's.
    const file = rel.startsWith('data/') ? path.join(DATA, rel.slice(5)) : path.join(SKILL, rel);
    const root = rel.startsWith('data/') ? DATA : SKILL;
    return sendFile(res, file, root);
  });
  function sendFile(res, file, root) {
    if (!path.resolve(file).startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { log(`404 ${file}`); res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  }
  return { server, unknown, verbs, DATA, SKILL };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const skill = flag('skill'), data = flag('data');
  if (!skill || !data) { console.error('usage: serve.mjs --skill=<dir> --data=<dir> [--port=0]'); process.exit(2); }
  const shared = flag('shared') ?? process.env.LINGGEN_SHARED ?? defaultShared(skill);
  const { server } = makeServer({ skill, data, shared, log: (l) => console.error(`[serve] ${l}`) });
  server.listen(Number(flag('port', '0')), '127.0.0.1', () => console.log(`PLAYBOT_SERVE http://127.0.0.1:${server.address().port}`));
}
