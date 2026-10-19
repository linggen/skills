// tools/page-crawl.mjs — Layer 3 of the game's tests: the LIVE page, in a headless Chrome of its
// own (tools/cdp.mjs), on scratch saves only (Hanli, 2026-10-15: 黑地十一步 could not be won by
// hand; 回看 over a board did nothing).
//
//   node tools/page-crawl.mjs --boards [--only=<task>,…] [--tries=3]
//   node tools/page-crawl.mjs --controls [--scenes=<scene>,…] [--max=25]
//   flags: --base=http://localhost:9527 --out=<dir> --headed --keep (leave the scratch saves) --settle=<ms> (controls)
//
// Needs the engine on --base (9527) serving the installed skill. Each save is a scratch save
// (data/saves/pc-*), seeded at a scene from the rules' own walk (tools/explore.mjs sweep,
// all-win: the save as he steps into the scene), and removed at the end unless --keep.
//
// --boards: each 卷一 story board, on its scene, played by its human-like bot
//   (scripts/games/bots/<game>.js — the same bot tools/board-bots.mjs runs in node): the bot
//   reads the board as the screen draws it (the scratch seam's `state`), decides, and the press
//   lands ~200 ms later (± 40 ms) as a real Input.dispatchMouseEvent at the control's centre —
//   so the page's own pointerdown/pointerup paths run (live-games.js). Three tries, each up to
//   --seconds; a board not won is a finding with its name.
// --controls: on each scene, every visible control tapped once (real clicks); a control whose
//   tap changes nothing — the save, the page's text, its panels, the URL — within a second is
//   a dead control. After any tap that did something, the save is put back and the page reloaded.
//   Never tapped: the language switch, the weather city, the account (NEVER_TAP) — they write past the scratch save.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { loadContent } from '../scripts/content.mjs';
import { JUAN_ONE, sweep } from './explore.mjs';
import { playTo, targetOf } from '../scripts/rules/progress.mjs';
import { newState } from '../scripts/state.mjs';
import { REACTION, JITTER, rng } from './board-bots.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const HOME = path.join(os.homedir(), '.linggen', 'skills', 'lingjing', 'data', 'saves');
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

/* Every 卷一 scene's save as he steps into it: the rules' progress control (rules/progress.mjs
   playTo — fights really fought, one forward run with every scene a target), then the explorer's
   sweeps for any scene that run never stands in (another fork). */
export function savesAtScenes(content) {
  const at = new Map();
  const start = new Date('2026-09-29T09:00:00');
  const scenes = JUAN_ONE.flatMap((ch) => Object.keys(content.chapters[ch]?.scenes ?? {}));
  try {
    playTo(content, newState(content, 'zh', start), null, { now: start, targets: scenes.map((id) => [id, targetOf(content, id)]).filter(([, t]) => t),
      onAt: (id, s, runner) => { if (!at.has(id)) at.set(id, { state: structuredClone(s), now: runner?.now ?? start }); } });
  } catch { /* a scene off the run's line: the sweeps below find it */ }
  for (const p of ['all-win', 'all-skip', 'lose-retry']) sweep(content, p, { arrive: (id, s, now) => { if (!at.has(id)) at.set(id, { state: structuredClone(s), now }); } });
  for (let seed = 1; seed <= 20; seed++) sweep(content, 'random', { seed, arrive: (id, s, now) => { if (!at.has(id)) at.set(id, { state: structuredClone(s), now }); } });
  return at;
}

/* A scratch save written as the rules write one (data/saves/<name>/state.json) — never the player's. */
export function writeSave(name, state, dir = HOME) {
  if (!/^(pc|ph)-[a-z0-9-]{1,28}$/.test(name)) throw new Error(`not a page-crawl / play-human scratch name: ${name}`);
  const d = path.join(dir, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify(state, null, 1));
  return d;
}
const readSave = (name, dir = HOME) => { try { return fs.readFileSync(path.join(dir, name, 'state.json'), 'utf8'); } catch { return ''; } };

/* Clear what stands before the stage: the 回's title card, a seal, the story box (跳过, else the next line), 开局. */
export const CLEAR = `(() => {
  const vis = (e) => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]');
  for (const sel of ['[data-reveal]', '[data-titlecard]', '.feat', '.wonseal', '[data-dlg-speed="skip"]:not(.on)', '[data-dlg-next]', '[data-spoils-close]', '[data-emerged-close]', '[data-close-chapter]', '[data-appear-done]', '[data-play]']) {
    const el = [...document.querySelectorAll(sel)].find(vis);
    if (el) { const r = el.getBoundingClientRect(); return { sel, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  }
  return null;
})()`;

async function openSave(page, base, save) {
  await page.goto(`${base}/apps/lingjing/scripts/index.html?save=${save}`);
  await sleep(3500);
}

/* ── Boards ── */
async function boardHost(page, id) {
  return page.evaluate(`(() => { const h = document.querySelector('[data-game="${id}"], [data-mount="${id}"]'); if (!h || !h.getClientRects().length) return false; h.scrollIntoView({ block: 'center' }); return true; })()`);
}
/* Where an action lands: the control's centre, found by its data, inside the board's host. */
const TARGET = (id, a) => `(() => {
  const host = document.querySelector('[data-game="${id}"], [data-mount="${id}"]'); if (!host) return null;
  const a = ${JSON.stringify(a)};
  const sel = a.hold ? '[data-g-hold],[data-g-drag]' : '[data-g]';
  const want = a.hold ?? a;
  const ok = (el) => Object.entries(want).every(([k, v]) => k === 'g' ? (a.hold ? true : el.dataset.g === String(v)) : el.dataset[k] === String(v));
  const el = [...host.querySelectorAll(sel)].find((e) => e.getClientRects().length && !e.disabled && ok(e));
  if (!el) return null;
  // A finger scrolls to what it means to press (a long board runs past the fold — 写信's sheet grows).
  // Past the fold of the page OR of the stage's own scroller (.focus): a tile half under the stage's
  // edge is on the screen but not under the finger (10-16: 写信 and 认方 at 390 pressed the stage's rim).
  const r0 = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r0.left + r0.width / 2, r0.top + r0.height / 2);
  if (r0.top < 0 || r0.bottom > innerHeight || !(hit && (hit === el || el.contains(hit)))) el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`;

export async function playBoardLive(page, { id, game, tries = 3, seconds = 150, seedSave, base }) {
  const { bot } = await import(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/games/bots', `${game}.js`));
  const runs = [];
  for (let t = 1; t <= tries; t++) {
    await seedSave();
    await openSave(page, base, seedSave.save);
    for (let k = 0; k < 40 && !(await boardHost(page, id)); k++) {
      const c = await page.evaluate(CLEAR);
      if (c) await page.clickAt(c.x, c.y);
      await sleep(400);
    }
    if (!(await boardHost(page, id))) { runs.push({ won: false, why: 'the board never stood on the stage' }); continue; }
    const r = rng(`${id}-${t}`);
    const t0 = Date.now();
    let held = null, presses = 0, won = false, last = null;
    while (Date.now() - t0 < seconds * 1000) {
      const seen = await page.evaluate(`globalThis.__lingjingPlay?.state(${JSON.stringify(id)}) ?? null`);
      const b = await page.evaluate(`globalThis.__lingjingPlay?.board(${JSON.stringify(id)}) ?? null`);
      if (b?.won || b?.sent || seen?.state?.won) { won = true; break; }
      if (!seen?.state) { await sleep(100); continue; }
      const a = bot(seen.state, { lead: REACTION, t: Date.now() - t0 });
      if (!a) { await sleep(30); continue; }
      if (a.move != null && held) { held.x += a.move; await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: held.x, y: held.y, button: 'left', buttons: 1 }); continue; }
      await sleep(Math.max(120, REACTION + gauss(r) * JITTER) - 30); // the hand, on its way (the read took ~30 ms)
      if (a.release) {
        if (held) await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: held.x, y: held.y, button: 'left', clickCount: 1 });
        held = null; presses++;
      } else {
        const at = await page.evaluate(TARGET(id, a));
        if (!at) { last = `no control for ${JSON.stringify(a)}`; await sleep(100); continue; }
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
        await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
        if (a.hold) held = { ...at };
        else await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
        presses++;
      }
      await sleep(120);
    }
    runs.push({ won, presses, ms: Date.now() - t0, ...(last && !won ? { why: last } : {}) });
    if (won) return { won: true, tries: t, runs };
  }
  return { won: false, tries, runs };
}

/** A board's scratch save, as he steps into its scene with the boards before it in the scene's
    order left (the page lays one at a time): answers a writer, `.save` its name. Shared with play-human.mjs. */
export function boardSeeder(at, sc, id, name, scene) {
  const order = (sc.show ?? []).filter((c) => c.card === 'board').map((c) => c.id);
  const before = order.slice(0, Math.max(0, order.indexOf(id)));
  const f = () => {
    const s = structuredClone(at.get(scene).state);
    for (const b of before) s.tasks[b] = { status: 'done', skipped: true };
    writeSave(name, { ...s, stamina: 100 });
  };
  f.save = name;
  return f;
}

/* ── Controls ── */
/* Never tapped: what writes beyond the scratch save — Linggen's language (中 / En wrote the global
   setting and flipped the player's own page, 2026-10-15), the weather city, the account. */
export const NEVER_TAP = '[data-lang],[data-wx-set],[data-wx-clear],[data-cloud],[data-signin],[data-signout],[data-account],a[href^="http"]';
const CONTROLS = `(() => {
  const vis = (e) => { if (!e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0 && !e.closest('[hidden]'); };
  const W = innerWidth, H = innerHeight;
  return [...document.querySelectorAll('button, [role=button], [data-g], [data-tile], [data-spot], [data-dlg-next], [data-titlecard]')]
    .filter((e) => vis(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && !e.closest('.scratch-badge') && !e.matches(${JSON.stringify(NEVER_TAP)}))
    .map((e, i) => { const r = e.getBoundingClientRect(); const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
      const at = document.elementFromPoint(x, y);
      return { i, x, y, text: (e.textContent || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 30), data: Object.fromEntries([...e.attributes].filter((a) => a.name.startsWith('data-')).map((a) => [a.name, a.value.slice(0, 30)])), on: r.bottom > 0 && r.top < H, free: Boolean(at && (at === e || e.contains(at))) }; })
    .filter((c) => c.on && c.free);
})()`;
// What a tap may change: the URL, the words, what is drawn, and which control is lit (慢 · 中 · 快 swap a class, not the words).
const PAGE_SIG = `(() => [location.href, document.body.innerText.length, document.body.innerText.slice(0, 4000), [...document.querySelectorAll('[class]')].filter((e) => e.getClientRects().length).length, [...document.querySelectorAll('.open,.on,.is-on,.sel,[aria-pressed=true],[aria-expanded=true],[open]')].map((e) => e.className + (e.textContent || '').slice(0, 8)).join('|')].join('§'))()`;

export async function crawlControls(page, { scene, seedSave, base, max = 25, settleMs = 1100 }) {
  const dead = [], tapped = [];
  await seedSave();
  await openSave(page, base, seedSave.save);
  const seen = new Set();
  for (let n = 0; n < max; n++) {
    const list = await page.evaluate(CONTROLS);
    const c = list.find((x) => !seen.has(`${x.text}|${JSON.stringify(x.data)}`));
    if (!c) break;
    seen.add(`${c.text}|${JSON.stringify(c.data)}`);
    const before = await page.evaluate(PAGE_SIG), saved = readSave(seedSave.save);
    await page.clickAt(c.x, c.y);
    await sleep(settleMs);
    const after = await page.evaluate(PAGE_SIG), now = readSave(seedSave.save);
    tapped.push(c.text || JSON.stringify(c.data));
    if (after === before && now === saved) dead.push({ scene, control: c.text, data: c.data });
    else { await seedSave(); await openSave(page, base, seedSave.save); }
  }
  return { scene, tapped, dead };
}

/* ── The command line ── */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => /^--([^=]+)(?:=(.*))?$/.exec(a)).filter(Boolean).map((m) => [m[1], m[2] ?? true]));
  const base = flags.base ?? 'http://localhost:9527';
  const out = flags.out ?? path.join(os.tmpdir(), 'lj-page-crawl');
  fs.mkdirSync(out, { recursive: true });
  const ok = await fetch(`${base}/apps/lingjing/scripts/index.html`).then((r) => r.ok).catch(() => false);
  if (!ok) { console.error(`no engine at ${base} — start Linggen, or pass --base`); process.exit(2); }
  process.env.LINGJING_STAMINA_LIMIT ??= '0';
  const content = loadContent();
  const at = savesAtScenes(content);
  const made = new Set();
  const seeder = (name, scene) => { const f = () => { const s = at.get(scene); writeSave(name, { ...s.state, stamina: 100 }); made.add(name); }; f.save = name; return f; };
  const { page, close } = await launch({ headless: !flags.headed });
  const findings = [];
  try {
    if (flags.boards) {
      const only = flags.only ? String(flags.only).split(',') : null;
      for (const [scene] of at) {
        const sc = Object.values(content.chapters).map((ch) => ch.scenes?.[scene]).find(Boolean);
        const ids = [...new Set([...(sc.show ?? []).filter((c) => c.card === 'board').map((c) => c.id), ...(sc.offers?.tasks ?? [])])];
        for (const id of ids) {
          if (only && !only.includes(id)) continue;
          const game = content.tasks.tasks.find((t) => t.id === id)?.game;
          if (!game || !fs.existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/games/bots', `${game}.js`))) { findings.push({ kind: 'no-bot', board: id, game }); console.log(`${id.padEnd(18)} NO BOT (${game})`); continue; }
          // Boards before it in the scene's order are left first (the page lays one at a time).
          const seedSave = boardSeeder(at, sc, id, `pc-b-${id}`.slice(0, 31).toLowerCase().replace(/[^a-z0-9-]/g, '-'), scene);
          made.add(seedSave.save);
          const r = await playBoardLive(page, { id, game, tries: Number(flags.tries ?? 3), seconds: Number(flags.seconds ?? 150), seedSave, base });
          console.log(`${id.padEnd(18)} ${game.padEnd(12)} ${r.won ? `won on try ${r.tries}` : `NOT WON in ${r.tries} tries — ${r.runs.map((x) => x.why ?? `${x.presses} presses`).join('; ')}`}`);
          if (!r.won) findings.push({ kind: 'board-not-won', board: id, game, runs: r.runs });
        }
      }
    }
    if (flags.controls) {
      const scenes = flags.scenes ? String(flags.scenes).split(',') : [...at.keys()];
      for (const scene of scenes) {
        if (!at.has(scene)) { console.log(`${scene}: never reached by the walk`); continue; }
        const r = await crawlControls(page, { scene, seedSave: seeder(`pc-c-${scene}`.slice(0, 31).toLowerCase().replace(/[^a-z0-9-]/g, '-'), scene), base, max: Number(flags.max ?? 25), settleMs: Number(flags.settle ?? 2500) });
        console.log(`${scene.padEnd(16)} ${r.tapped.length} tapped, ${r.dead.length} dead${r.dead.length ? `: ${r.dead.map((d) => d.control || JSON.stringify(d.data)).join(' · ')}` : ''}`);
        for (const d of r.dead) findings.push({ kind: 'dead-control', ...d });
      }
    }
    if (page.errors.length) findings.push(...page.errors.slice(0, 20).map((e) => ({ kind: 'page-error', ...e })));
  } finally {
    await close();
    if (!flags.keep) for (const name of made) fs.rmSync(path.join(HOME, name), { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(out, 'findings.json'), JSON.stringify(findings, null, 1));
  console.log(`${findings.length} findings → ${path.join(out, 'findings.json')}`);
  process.exitCode = findings.some((f) => f.kind !== 'page-error') ? 1 : 0;
}
