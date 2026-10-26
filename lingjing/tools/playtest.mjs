// tools/playtest.mjs — the playtest crawler: plays Lingjing on the REAL page,
// tap by tap, the way the player does, and flags every stall.
//
//   node tools/playtest.mjs [--save=pt-a] [--from=fresh|<scratch save>|<fixture>] [--route=exit,exit,…]
//                           [--until=<scene id>] [--steps=400] [--games=skip|win|hands] [--hands=casual,<task>:idle|skip]
//                           [--fight=win|lose] [--phone] [--width=1280] [--headed] [--base=http://localhost:9527] [--out=<dir>]
//
// `--games=hands`: each story board is played by tools/play-human.mjs's hands (real pointer, or touch on
// --phone), by `--hands` policy per board: casual (tries to win), idle (sits until the board's loss, e.g.
// 接雨's flood, then tries), skip (a few tries, then waits for the stuck clock's 「算了，往下走」 and taps it).
// --phone is 390×844 at DPR 3, every tap a touch. Every /api request is timed: one over 1.5 s or failed
// is a soft `api` finding, and an unanswered or slow tap names what was in flight (the engine, or the page).
//
// It opens `index.html?save=<name>&chat=off` (a scratch save with no chat — never the player's own;
// a name the rules would not take is refused here) in a headless Chrome of its
// own (tools/cdp.mjs), then loops: observe → choose → tap (a real mouse click,
// hit-tested) → settle → assert. At every step it asserts:
//   1. something is there to tap — a choice, a card, a button, a game, a 完;
//   2. the tap answered — the scene, the story's place, or the stage changed;
//   3. no console error, no uncaught exception;
//   4. the header is sane — a realm on the status strip;
//   5. 回看 opens the log and closes it; 跳过 ends the passage.
// Each finding is one JSON line in <out>/findings.jsonl with a screenshot;
// every scene and exit reached goes to <out>/coverage.json (merged across runs).
// The rules are only READ from here (Look, over the engine's Verb tool), never
// written: every move goes through the page.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './cdp.mjs';
import { SEE, CHOOSERS, chooserOf, GAME_OF_TASK, POLICIES, LOSS, START, handsFor, tapAt, motion, judgeTap } from './play-human.mjs';
import { rng } from './board-bots.mjs';

const SAVE_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function parseFlags(argv) {
  const o = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) o[m[1]] = m[2] ?? true;
  }
  return o;
}

/* `--hands=casual,rain-basins:idle,bread-share:skip` → the policy each board is played at (default casual). */
export function handsPolicy(spec = 'casual') {
  const parts = String(spec === true ? 'casual' : spec).split(',').filter(Boolean);
  const per = Object.fromEntries(parts.filter((x) => x.includes(':')).map((x) => x.split(':')));
  const all = parts.find((x) => !x.includes(':')) ?? 'casual';
  for (const v of [all, ...Object.values(per)]) if (!['casual', 'idle', 'skip'].includes(v)) throw new Error(`--hands: unknown policy ${v} (casual|idle|skip)`);
  return (task) => per[task] ?? all;
}

/* ── Look, read over the engine (the page's own door), for the save under test ── */
export function rulesReader(base, save) {
  return async function verb(name, args = {}) {
    const flags = [...Object.entries(args).map(([k, v]) => `--${k}=${v}`), `--save=${save}`];
    const res = await fetch(`${base}/api/skills/lingjing/tools/Verb`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verb: name, flags }) });
    const out = await res.json();
    return JSON.parse((out.stdout || '').trim().split('\n').pop() || '{}');
  };
}

/* ── What the page shows, read in the page: every visible tappable, by what it is ── */
const OBSERVE = `(() => {
  const vis = (e) => { if (!e || !e.getClientRects().length) return false; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false; return !e.closest('[hidden]'); };
  const W = innerWidth, H = innerHeight;
  const hit = (e) => { const r = e.getBoundingClientRect(); const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
    const at = document.elementFromPoint(x, y); return { x, y, w: r.width, h: r.height, onScreen: r.bottom > 0 && r.top < H && r.right > 0 && r.left < W, covered: !(at && (at === e || e.contains(at) || at.contains(e))), by: at && at !== e && !e.contains(at) ? (at.className && String(at.className).slice(0, 40)) || at.tagName : null }; };
  const data = (e) => Object.fromEntries([...e.attributes].filter((a) => a.name.startsWith('data-')).map((a) => [a.name.slice(5), a.value]));
  const where = (e) => e.closest('#dlg') ? 'box' : e.closest('#focus') ? 'focus' : e.closest('#footRow') ? 'foot' : e.closest('#footChips') ? 'chips' : e.closest('#status, .topbar') ? 'head' : e.closest('#sight') ? 'sight' : e.closest('.lubook') ? 'book' : e.closest('#askbar') ? 'ask' : e.closest('#tray, .tray') ? 'tray' : 'page';
  const taps = [...document.querySelectorAll('button, [role=button], [data-reveal], [data-dlg-next], [data-titlecard], [data-g], [data-tile], [data-spot], a[href]')]
    .filter(vis).map((e) => ({ tag: e.tagName.toLowerCase(), cls: String(e.className || '').slice(0, 60), text: (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40), data: data(e), disabled: e.matches(':disabled') || e.getAttribute('aria-disabled') === 'true', where: where(e), game: e.closest('[data-game]')?.dataset.game ?? e.closest('[data-board]')?.dataset.board ?? null, ...hit(e) }));
  const box = document.querySelector('#dlg [data-dlg-next]');
  const status = document.getElementById('status')?.textContent.trim().replace(/\\s+/g, ' ') ?? '';
  const focus = document.getElementById('focus');
  return {
    taps, status, story: box?.getAttribute('data-story') ?? null, boxOn: vis(box),
    // a mount-only board (the Phaser kits, 气走经脉) draws on its own canvas: no [data-g] to see, only its host
    mounts: [...document.querySelectorAll('[data-mount]')].filter(vis).map((e) => e.dataset.mount),
    title: document.querySelector('[data-titlecard]') ? (document.querySelector('[data-titlecard]').innerText || '').trim().slice(0, 40) : null,
    place: document.getElementById('place')?.textContent ?? '', hui: document.getElementById('huiLine')?.textContent ?? '',
    focusSig: (focus?.innerHTML ?? '').replace(/\\s+/g, ' ').replace(/style="[^"]*"/g, '').length + ':' + (focus?.innerText ?? '').slice(0, 120),
    boxSig: box ? (box.querySelector('.s.on')?.textContent ?? '') + '|' + (box.querySelector('.count')?.textContent ?? '') + '|' + box.querySelectorAll('.ways button').length + '|' + document.querySelectorAll('#dlg .lookchip.found').length : '',
    note: document.querySelector('.donote, .note.do, [data-note]')?.textContent?.trim().slice(0, 80) ?? null,
    fighting: document.body.classList.contains('fighting'),
    seal: (() => { const f = [...document.querySelectorAll('.feat, .wonseal')].find(vis); if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: f.textContent.trim().slice(0, 30) }; })(),
    popSig: [...document.querySelectorAll('.bookpop')].map((e) => e.textContent.trim()).join('|').slice(0, 400),
    turned: Boolean([...document.querySelectorAll('.bookrow.turned, .handed, .tookseal, .offerrow.taken, .turneddone')].find(vis)),
    chipsText: document.getElementById('footChips')?.textContent.trim().replace(/\\s+/g, ' ').slice(0, 200) ?? '',
    sighting: Boolean([...document.querySelectorAll('#sight > *, [data-appear], [data-appear-done]')].find(vis)),
    logOpen: vis(document.querySelector('.dlglog')),
    wide: document.documentElement.scrollWidth > W + 2,
    // The bars must fit (a strip crushed to a column, chips on two lines): any bar part that overflows its box.
    over: [...document.querySelectorAll('.topbar, .status, .titlerow, .footchips, .footrow')].filter((e) => vis(e) && (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY !== 'visible')).map((e) => String(e.className).split(' ')[0]),
  };
})()`;

/* ── The choice: what a player would tap next, in the order the page itself
   decides taps (lingjing.js CLICKS) — first the 回's title card, then the
   story box (its ways, else 跳过, else the next sentence), then the stage's
   one thing (MAIN), then the footer. `plan` picks among a scene's exits. ── */
const isA = (t, key) => Object.prototype.hasOwnProperty.call(t.data, key);
export function choose(snap, ctx) {
  const live = snap.taps.filter((t) => !t.disabled);
  const first = (pred) => live.find(pred) ?? null;
  // A seal on the stage (新的一回, a realm risen, 收服): it clears itself; a tap clears it sooner.
  // 得牌's card holds over everything until a tap (card-reveal.js).
  { const rv = first((t) => 'reveal' in t.data); if (rv) return { kind: 'reveal', tap: rv, why: '得牌' }; }
  if (snap.seal) return { kind: 'seal', at: { x: Math.round(snap.seal.x), y: Math.round(snap.seal.y) }, why: `the seal «${snap.seal.text}»` };
  if (snap.title) return { kind: 'title', at: { x: Math.round(snap.taps[0]?.x ?? 400), y: 300 }, why: 'the 回 title card' };
  // The story box's own choices at its last beat, then the stage's scene card: the scene's ways.
  const ways = live.filter((t) => isA(t, 'panel-exit') || isA(t, 'panel-duel') || isA(t, 'look-at'));
  const exits = ways.filter((t) => !isA(t, 'look-at'));
  if (snap.boxOn) {
    const inBox = exits.filter((t) => t.where === 'box');
    if (inBox.length) return { kind: 'way', tap: ctx.pick(inBox, snap), why: 'a way inside the box' };
    // The last line where only its 看 chips go on (黑松岭): a chip, not 跳过 (the passage is already at its end).
    const lookIn = ways.find((t) => t.where === 'box' && isA(t, 'look-at') && !ctx.looked.has(t.data['look-at']));
    if (lookIn) return { kind: 'look', tap: lookIn, why: '看 in the box' };
    // 跳过 is a way to read now (2026-10-16, 自动 · 全文 · 跳过): picked once, every passage after goes to its end.
    const skip = first((t) => t.data['dlg-speed'] === 'skip' && !/\bon\b/.test(t.cls));
    if (skip) return { kind: 'skip', tap: skip, why: '跳过' };
    const next = first((t) => isA(t, 'dlg-next'));
    if (next) return { kind: 'next', tap: next, why: 'the next sentence' };
  }
  // Moments the page plays: a tap puts them on.
  for (const key of ['reveal', 'spoils-close', 'emerged-close', 'mem-next', 'mem-close', 'doors', 'homing', 'unfold', 'unroll', 'close-chapter', 'appear-done', 'appear'])
    { const t = first((x) => isA(x, key)); if (t) return { kind: key, tap: t, why: key }; }
  // A game on the stage: the page's 「算了，往下走」 under it, or (games=play) its own buttons. The skip
  // stands only once the player is stuck (scripts/stuck.js, 2026-10-15) — the crawler opens that gate
  // through the scratch seam (`game-stuck`), then taps the real button.
  const gameTaps = live.filter((t) => t.game && Object.keys(t.data).some((k) => k === 'g' || k.startsWith('g-') || k === 'tile'));
  if (gameTaps.length || snap.mounts?.length) {
    const id = gameTaps[0]?.game ?? snap.mounts[0], skipGame = live.find((t) => t.data['game-skip'] === id);
    if (ctx.gameMode(id) === 'skip') return skipGame ? { kind: 'game-skip', tap: skipGame, game: id, why: '算了，往下走' } : { kind: 'game-stuck', game: id, why: `stuck at ${id}` };
    return { kind: 'game', game: id, why: `the game ${id}` };
  }
  // A fight: the page's fight driver plays it (ctx.fight).
  if (snap.fighting) return { kind: 'fight', why: 'a fight on the stage' };
  const born = first((t) => isA(t, 'born'));
  if (born) return { kind: 'born', tap: ctx.pickBorn(live) ?? born, why: '生辰' };
  const valueGo = first((t) => isA(t, 'value-go'));
  const valuePick = first((t) => isA(t, 'value-pick'));
  if (valuePick && !ctx.valuePicked) return { kind: 'value-pick', tap: valuePick, why: 'a name offered' };
  if (valueGo) return { kind: 'value-go', tap: valueGo, why: 'take the name' };
  if (exits.length) return { kind: 'way', tap: ctx.pick(exits, snap), why: 'the scene card' };
  const duel = first((t) => isA(t, 'duel-start'));
  if (duel) return { kind: 'duel-start', tap: duel, why: '出手' };
  const play = first((t) => isA(t, 'play') && t.where === 'focus');
  if (play) return { kind: 'play', tap: play, why: '开局' };
  const meet = first((t) => isA(t, 'meet'));
  if (meet) return { kind: 'meet', tap: meet, why: 'what the road met' };
  const take = first((t) => isA(t, 'do') && t.where === 'focus');
  if (take) return { kind: 'do', tap: take, why: 'an errand' };
  const look = ways.find((t) => isA(t, 'look-at') && !ctx.looked.has(t.data['look-at']));
  if (look) return { kind: 'look', tap: look, why: '看' };
  const qnext = first((t) => isA(t, 'qnext'));
  if (qnext) return { kind: 'qnext', tap: qnext, why: '还有 N 件' };
  // Something to hand in: the 事 chip says so (its seal-red count); open the book, tap 交差.
  const turnIn = first((t) => t.data.do === 'turn');
  if (turnIn) return { kind: 'do', tap: turnIn, why: '交差' };
  const book = first((t) => isA(t, 'book') && /\bready\b/.test(t.cls) && !snap.popSig && !ctx.bookTried?.has(snap.sceneId));
  if (book) { (ctx.bookTried ??= new Set()).add(snap.sceneId); return { kind: 'book', tap: book, why: '事 · 可交' }; }
  // 下一步's own button: where the story goes, one tap.
  const nextGo = first((t) => isA(t, 'go') && t.where === 'focus');
  if (nextGo) return { kind: 'go', tap: nextGo, why: `下一步 «${nextGo.text}»` };
  // Nothing on the stage: walk toward the goal, by the roads (「去往 ▾」 opens them).
  if (ctx.target) {
    const go = first((t) => t.data.go === ctx.target);
    if (go) return { kind: 'go', tap: go, why: `去 ${go.text}` };
    const anyGo = first((t) => isA(t, 'go') && t.where !== 'book');
    const chip = first((t) => isA(t, 'roads'));
    if (chip && !anyGo) return { kind: 'roads', tap: chip, why: '去往 ▾' };
  }
  return null;
}

/* The taps that pay or hand something over must say so where he looks (Hanli, 2026-10-15: 开府's
   交差 changed nothing he could see): a 交差 line, the 所得 card, a 已接下 seal, a note, or the strip. */
const FEEDBACK = new Set(['turn', 'take', 'buy', 'sell']);

/* ── Findings and coverage ── */
function recorder(out, run) {
  fs.mkdirSync(out, { recursive: true });
  const covFile = path.join(out, 'coverage.json');
  const cov = fs.existsSync(covFile) ? JSON.parse(fs.readFileSync(covFile, 'utf8')) : { scenes: {}, exits: {}, games: {}, kinds: {} };
  const findings = [];
  return {
    cov, findings,
    seen(kind, id) { (cov[kind] ??= {})[id] = (cov[kind][id] ?? 0) + 1; },
    find(f) { findings.push(f); fs.appendFileSync(path.join(out, 'findings.jsonl'), JSON.stringify({ run, at: new Date().toISOString(), ...f }) + '\n'); console.log(`  ✖ ${f.kind} @ ${f.scene}: ${f.what}`); },
    save() { fs.writeFileSync(covFile, JSON.stringify(cov, null, 1)); },
  };
}

/* ── Settle: wait until the page has answered a tap (or give up) ── */
async function settle(page, before, verbLook, { ms = 6000 } = {}) {
  const t0 = Date.now();
  let snap = null, lk = null, at3s = null;
  while (Date.now() - t0 < ms) {
    await sleep(250);
    if (!at3s && Date.now() - t0 > 3000) at3s = page.inFlight(); // what the page waits on, if anything
    snap = await page.evaluate(OBSERVE).catch(() => null);
    if (!snap) continue;
    if (sigOf(snap) !== sigOf(before)) { const took = Date.now() - t0; await sleep(350); return { snap: await page.evaluate(OBSERVE), changed: true, ms: took, at3s }; }
  }
  const pending = page.inFlight();
  lk = await verbLook();
  return { snap: snap ?? (await page.evaluate(OBSERVE)), changed: lk?.scene?.id !== before.sceneId, look: lk, ms: Date.now() - t0, at3s, pending };
}
const sigOf = (s) => [s.story, s.boxSig, s.focusSig, s.title, s.fighting, s.logOpen, s.place, s.taps.length, s.popSig, s.status, Boolean(s.seal)].join('§');

/* ── One crawl ── */
export async function crawl(opts) {
  const base = opts.base ?? 'http://localhost:9527';
  const save = opts.save;
  if (!SAVE_NAME.test(save ?? '')) throw new Error(`--save=<name> is required, a scratch save name (${SAVE_NAME})`);
  const out = opts.out ?? path.join(os.tmpdir(), 'lj-playtest');
  const rec = recorder(out, save);
  const verb = rulesReader(base, save);
  const route = String(opts.route ?? '').split(',').filter(Boolean);
  const steps = Number(opts.steps ?? 400);
  const width = opts.phone ? 390 : Number(opts.width ?? 1280), height = opts.phone ? 844 : 820;
  const { page, close } = await launch({ width, height, headless: !opts.headed, touch: Boolean(opts.phone) });
  const hands = opts.games === 'hands' ? { policy: handsPolicy(opts.hands), hand: handsFor(page, page, page.touch), seed: `${save}-${width}` } : null;
  const shot = (name) => page.screenshot(path.join(out, 'shots', `${save}-${String(name).replace(/[^\w.-]+/g, '_')}.png`)).catch(() => null);
  const ctx = {
    looked: new Set(), valuePicked: false, fights: {}, chipsDone: new Set(), blankSeen: new Set(), overSeen: new Set(),
    // A game is skipped (the page's 「算了，往下走」, once stuck — it pays nothing) or won (the page's own onWin, through the seam):
    // `--games=skip|win`, else whichever this game has had less of.
    gameMode(id) {
      if (opts.games === 'skip' || opts.games === 'win' || opts.games === 'hands') return opts.games;
      return (rec.cov.games[`${id}:skip`] ?? 0) <= (rec.cov.games[`${id}:win`] ?? 0) ? 'skip' : 'win';
    },
    pick(ways, snap) {
      const ids = ways.map((t) => t.data['panel-exit'] ?? t.data['panel-duel']);
      const planned = route.find((id) => ids.includes(id));
      if (planned) { route.splice(route.indexOf(planned), 1); return ways[ids.indexOf(planned)]; }
      // Unplanned: the first exit not yet taken anywhere, else the first. The others not yet
      // taken are fork points: the save copied as it stands, to be played down that exit after.
      const untaken = ids.filter((id) => !rec.cov.exits[`${snap.sceneId}:${id}`]);
      const choice = untaken[0] ?? ids[0];
      if (opts.fork) for (const id of untaken.slice(1)) forkAt(snap.sceneId, id);
      return ways[ids.indexOf(choice)];
    },
    // A fight is won, or (`--fight=lose`, or a fight already won once on this run's coverage) lost first.
    fightMode(sceneId) {
      if (opts.fight === 'win' || opts.fight === 'lose') return opts.fight;
      if (route.includes('fight:lose')) { route.splice(route.indexOf('fight:lose'), 1); return 'lose'; }
      // The loss is played on a fork: the save copied as the fight opens.
      if (opts.fork && !rec.cov.fights?.[`${sceneId}:lose`]) forkAt(sceneId, 'fight:lose');
      return 'win';
    },
    pickBorn(live) { return live.find((t) => t.data.born && t.data.born !== '' && !/stone|石/.test(t.text)) ?? null; },
  };
  let lastErr = 0, lastApi = 0, stuck = 0, n = 0, lk = null, blankAt = null, blankFrom = null;
  /* A fork: the scratch save copied now (the rules' files, never the player's), and the exit to take from it. */
  const dataDir = opts.data ?? path.join(os.homedir(), '.linggen', 'skills', 'lingjing', 'data');
  const forks = [];
  function forkAt(sceneId, exitId) {
    if (forks.some((f) => f.scene === sceneId && f.exit === exitId)) return;
    const name = `${save.slice(0, 18)}-f${forks.length + (opts.forkBase ?? 0)}`.slice(0, 32);
    const from = path.join(dataDir, 'saves', save), to = path.join(dataDir, 'saves', name);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith('.lock') });
    forks.push({ save: name, scene: sceneId, exit: exitId });
  }
  const report = { save, steps: 0, scenes: [], findings: rec.findings };
  try {
    const q = new URLSearchParams({ save, ...(opts.from ? { seed: opts.from } : {}), ...(opts.days ? { days: opts.days } : {}) });
    await page.goto(`${base}/apps/lingjing/scripts/index.html?${q}`);
    await sleep(4000);
    for (; n < steps; n++) {
      lk = await verb('look');
      const sceneId = lk?.scene?.id ?? `@${lk?.place?.id ?? '?'}`;
      if (!report.scenes.includes(sceneId)) { report.scenes.push(sceneId); rec.seen('scenes', sceneId); console.log(`· ${sceneId}  ${lk?.place?.name ?? ''}`); }
      if (opts.until && sceneId === opts.until) break;
      // A fork run ends once its exit has led somewhere else (and a few steps there).
      if (opts.leave && report.scenes.length > 1 && report.scenes.indexOf(sceneId) >= Number(opts.leave)) break;
      // Reload now and then — mid-passage, mid-game — and the stage must come back with a way on.
      if (opts.reloads && n > 0 && n % Number(opts.reloads) === 0) {
        console.log(`    ⟳ reload @ ${sceneId}`);
        rec.seen('reloads', sceneId);
        await page.goto(`${base}/apps/lingjing/scripts/index.html?save=${save}&chat=off`);
        await sleep(4000);
      }
      const snap = { ...(await page.evaluate(OBSERVE)), sceneId };
      ctx.target = lk?.waypoint?.toward?.id ?? lk?.waypoint?.place?.id ?? (lk?.scene?.at && lk.scene.at !== lk?.place?.id ? lk.scene.at : null);
      // 3. console clean
      if (page.errors.length > lastErr) {
        for (const e of page.errors.slice(lastErr)) rec.find({ kind: 'console', scene: sceneId, what: e.text?.slice(0, 300), shot: await shot(`err-${n}`) });
        lastErr = page.errors.length;
      }
      // 3b. the engine answers in time: every /api call over 1.5 s, or failed
      for (const a of page.api.slice(lastApi)) rec.find({ kind: 'api', soft: true, scene: sceneId, what: `${a.verb ? `Verb ${a.verb}` : a.url} ${a.failed ? `failed (${a.error})` : 'took'} ${a.ms} ms`, ...a });
      lastApi = page.api.length;
      // 4. header sane
      if (!snap.fighting && !snap.title && !/练气|筑基|凡人|结丹|Qi|Mortal|Foundation/.test(snap.status) && !lk?.companion?.away && !/^j\d\d$/.test(lk?.chapter?.hui ?? ''))
        rec.find({ kind: 'header', scene: sceneId, what: `no realm on the strip: «${snap.status.slice(0, 80)}»`, shot: await shot(`head-${n}`) });
      if (snap.wide) rec.find({ kind: 'layout', scene: sceneId, what: 'the page scrolls sideways', shot: await shot(`wide-${n}`) });
      for (const bar of snap.over ?? []) if (!ctx.overSeen.has(`${sceneId}:${bar}`)) { ctx.overSeen.add(`${sceneId}:${bar}`); rec.find({ kind: 'layout', soft: true, scene: sceneId, what: `the ${bar} overflows its box`, shot: await shot(`over-${bar}-${n}`) }); }
      // 4b. the chips open whole, once per scene, while no passage plays over them
      if (opts.chips !== 'off' && !snap.boxOn && !snap.fighting && !snap.title && !snap.seal && !snap.sighting && !ctx.chipsDone.has(sceneId)) { ctx.chipsDone.add(sceneId); await checkChips(page, snap, { rec, sceneId, shot }); continue; }
      // 1b. never a blank stage (Hanli, 2026-10-15): something to tap in the stage itself — the box,
      // main, a face coming on, a fight, a seal — not only the footer's chips. Six seconds blank is a finding.
      const onStage = snap.fighting || snap.title || snap.seal || snap.taps.some((t) => ['box', 'focus', 'sight'].includes(t.where) && !t.disabled && !isA(t, 'codex-big'));
      if (onStage) blankFrom = null;
      else if (blankFrom == null) blankFrom = Date.now();
      else if (Date.now() - blankFrom > 6000 && !ctx.blankSeen.has(sceneId)) {
        ctx.blankSeen.add(sceneId);
        const why = await page.evaluate('globalThis.__lingjingPlay?.why?.() ?? null').catch(() => null);
        rec.find({ kind: 'blank-stage', scene: sceneId, why, what: `the stage held nothing to tap for ${Math.round((Date.now() - blankFrom) / 1000)} s (footer: ${snap.taps.filter((t) => t.where === 'foot' || t.where === 'chips').map((t) => t.text).join(' · ').slice(0, 80)})`, shot: await shot(`blank-${sceneId}`) });
      }
      const act = choose(snap, ctx);
      // 1. something to tap
      if (!act) {
        // Patient: the engine may be busy (a Verb queued behind another app's), and the page
        // draws on the answer. Nothing to tap for 20 s is a stall.
        stuck++;
        if (stuck === 2) blankAt = await shot(`blank-${n}`);
        if (stuck < 12) { await sleep(1700); continue; }
        const why = await page.evaluate('globalThis.__lingjingPlay?.why?.() ?? null').catch(() => null);
        rec.find({ kind: 'stall', scene: sceneId, why, what: 'nothing to tap for 20 s', pending: page.inFlight(), firstSeen: blankAt, taps: snap.taps.map((t) => `${t.where}:${Object.keys(t.data).join('+')}:${t.text}`).slice(0, 30), shot: await shot(`stall-${n}`) });
        break;
      }
      if (stuck >= 2) rec.find({ kind: 'slow', soft: true, scene: sceneId, what: `nothing to tap for ${Math.round(stuck * 1.7)} s, then «${act.why}»`, pending: page.inFlight(), shot: blankAt });
      stuck = 0;
      if (act.kind === 'fight' && (ctx.fights[sceneId] = (ctx.fights[sceneId] ?? 0) + 1) > 3) {
        rec.find({ kind: 'fight', scene: sceneId, what: 'a fourth fight here on one run — the fight never ends the scene', shot: await shot(`fights-${sceneId}`) });
        break;
      }
      if (act.kind === 'fight') { await playFight(page, snap, { rec, sceneId, shot, outcome: ctx.fightMode(sceneId), reload: opts.reloads && ctx.fights[sceneId] === 1 ? async () => { await page.goto(`${base}/apps/lingjing/scripts/index.html?save=${save}&chat=off`); await sleep(5000); } : null }); continue; }
      if (act.kind === 'game-stuck') {
        const ok = await page.evaluate(`globalThis.__lingjingPlay?.stuck?.(${JSON.stringify(act.game)}) ?? 'no-seam'`);
        if (ok === 'no-seam') throw new Error('the page has no __lingjingPlay.stuck seam — install the skill first');
        await sleep(400);
        continue;
      }
      if (act.kind === 'game' && hands) {
        const r = await playBoardHands(page, { rec, sceneId, shot, task: act.game, policy: hands.policy(act.game), hand: hands.hand, r: rng(`${hands.seed}-${act.game}`) });
        if (r === 'timeout') break;
        if (r !== 'skipped') {
          const { changed } = await settle(page, snap, () => verb('look'), { ms: 9000 });
          if (!changed) rec.find({ kind: 'dead-win', scene: sceneId, what: `${act.game} ended (${r}) by the hands and nothing moved`, shot: await shot(`hands-end-${n}`) });
        }
        continue;
      }
      if (act.kind === 'game') {
        const grade = gradeFor(lk, act.game, route, rec.cov, sceneId);
        rec.seen('games', `${act.game}:win`);
        console.log(`    ◆ ${act.game} won${grade ? ` (${grade})` : ''}`);
        const ok = await page.evaluate(`globalThis.__lingjingPlay?.win(${JSON.stringify(act.game)}, ${JSON.stringify(grade)}) ?? 'no-seam'`);
        if (ok === 'no-seam') throw new Error('the page has no __lingjingPlay seam — install the skill first');
        const { changed } = await settle(page, snap, () => verb('look'), { ms: 9000 });
        if (!changed) rec.find({ kind: 'dead-win', scene: sceneId, what: `${act.game} won and nothing moved`, shot: await shot(`win-${n}`) });
        continue;
      }
      // 5. the box's quiet controls work, once per passage
      if (act.kind === 'skip' && !ctx.logChecked?.has(snap.story)) {
        (ctx.logChecked ??= new Set()).add(snap.story);
        await checkLog(page, snap, { rec, sceneId, shot });
      }
      if (act.tap?.covered && act.tap.onScreen) rec.find({ kind: 'covered', scene: sceneId, what: `${act.why} «${act.tap.text}» is under ${act.tap.by}`, shot: await shot(`covered-${n}`) });
      const exitId = act.tap?.data?.['panel-exit'] ?? act.tap?.data?.['panel-duel'];
      if (exitId) { rec.seen('exits', `${sceneId}:${exitId}`); console.log(`    → ${exitId}  «${act.tap.text}»`); }
      if (act.kind === 'look') ctx.looked.add(act.tap.data['look-at']);
      if (act.kind === 'value-pick') ctx.valuePicked = true;
      if (act.kind === 'game-skip') rec.seen('games', `${act.game}:skip`);
      rec.seen('kinds', act.kind);
      // An open popover over the target (the crawler's own 去往 or 事): put it away as a player would — a tap
      // on the bare strip — before tapping what lies under it.
      if (act.tap?.covered && act.tap.onScreen && (await page.evaluate(POPS)).length && !['book', 'chips'].includes(act.tap.where)) {
        const strip = await page.evaluate("(() => { const r = document.getElementById('place')?.getBoundingClientRect(); return r ? { x: r.left + 4, y: r.top + r.height / 2 } : null; })()");
        if (strip) { await page.clickAt(strip.x, strip.y); await sleep(500); continue; }
      }
      if (act.tap && !act.tap.onScreen) rec.find({ kind: 'below-fold', soft: true, scene: sceneId, what: `${act.why} «${act.tap.text}» stood off screen — scrolled to it`, shot: await shot(`fold-${n}`) });
      if (act.at) await page.clickAt(act.at.x, act.at.y); else await tapEl(page, act.tap);
      // 2. the tap answered
      const { changed, ms: took, at3s, pending } = await settle(page, snap, () => verb('look'), { ms: act.kind === 'next' ? 3000 : 8000 });
      if (changed && took > 3000) rec.find({ kind: 'slow-answer', soft: true, scene: sceneId, what: `${act.why} «${act.tap?.text ?? ''}» answered in ${took} ms`, ms: took, pending: at3s });
      if (changed && FEEDBACK.has(act.tap?.data?.do ?? (act.kind === 'meet' ? act.tap.data.meet : ''))) {
        const after = await page.evaluate(OBSERVE);
        if (!after.turned && after.status === snap.status && after.chipsText === snap.chipsText && !after.note) rec.find({ kind: 'no-feedback', scene: sceneId, what: `${act.why} «${act.tap.text}»: no line, no card, no number moved`, shot: await shot(`feedback-${n}`) });
      }
      if (!changed && act.kind !== 'next') rec.find({ kind: 'dead-tap', scene: sceneId, what: `${act.why} «${act.tap?.text ?? ''}» changed nothing`, data: act.tap?.data, pending, at3s, shot: await shot(`dead-${n}`) });
    }
  } catch (e) {
    rec.find({ kind: 'crash', scene: lk?.scene?.id ?? '?', what: String(e?.stack ?? e).slice(0, 400), shot: await shot('crash') });
  } finally {
    report.steps = n;
    report.forks = forks;
    report.final = { scene: lk?.scene?.id ?? null, place: lk?.place?.id ?? null, chapter: lk?.chapter?.id ?? null };
    rec.save();
    await close();
  }
  return report;
}

/* ── 斗法, played on the ink stage with real taps (battle-card.js pickOf: a tap lifts, the
   second says where it goes). `win`: every card, the root strike, every beast at the foe —
   whatever the rules let through — then 结束回合. `lose`: only 结束回合, until the beast wins.
   The seam reads the bout (whose turn, both 气血) so the driver knows when to tap. ── */
const SPOTS = `[...document.querySelectorAll('[data-spot]')].filter((e) => e.getClientRects().length).map((e) => {
  const r = e.getBoundingClientRect(); return { kind: e.dataset.spot, index: e.dataset.index == null ? null : Number(e.dataset.index), off: e.matches(':disabled') || e.classList.contains('dim') || (['hand', 'mine', 'power'].includes(e.dataset.spot) && !e.classList.contains('can')), x: r.left + r.width / 2, y: r.top + r.height / 2 }; })`;
async function fightTurn(page, outcome) {
  const bout = () => page.evaluate('globalThis.__lingjingPlay?.bout() ?? null');
  const spots = () => page.evaluate(SPOTS);
  const tapSpot = async (kind, index = null) => {
    const s = (await spots()).find((x) => x.kind === kind && (index == null || x.index === index));
    if (!s) return false;
    await page.clickAt(s.x, s.y);
    await sleep(450);
    return true;
  };
  const aim = async () => { if ((await bout())?.picked) { if (!(await tapSpot('theirs', 0))) await tapSpot('hero'); await waitIdle(); } };
  const waitIdle = async () => { for (let i = 0; i < 40; i++) { const b = await bout(); if (!b || b.outcome !== 'open' || (!b.busy && b.whose === 'you')) return b; await sleep(300); } return bout(); };
  let b = await waitIdle();
  if (!b || b.outcome !== 'open') return b;
  if (outcome === 'win') {
    // The attentive move (fightline.js, read through the seam), made with real taps: lift, then aim.
    for (let guard = 0; guard < 16; guard++) {
      // Only once the last move has played out (the seam answers null while the bout is busy).
      let m = null;
      for (let w = 0; w < 30 && !m; w++) { await waitIdle(); m = await page.evaluate('globalThis.__lingjingPlay?.move?.() ?? null'); if (!m) await sleep(300); }
      if (!m || m.kind === 'end') break;
      // A summon moves no 气血: what changed is the hand and the ranks, so the spots are the measure.
      const before = JSON.stringify([await bout(), (await spots()).map((x) => `${x.kind}${x.index ?? ''}${x.off ? '' : '+'}`)]);
      const from = m.kind === 'play' ? ['hand', m.index] : m.kind === 'attack' ? ['mine', m.index] : ['power', null];
      await tapSpot(...from);
      if ((await bout())?.picked) {
        const to = m.target?.kind === 'minion' ? [m.buff ? 'mine' : 'theirs', m.target.index] : ['hero', null];
        await tapSpot(...to);
      }
      await waitIdle();
      if ((await bout())?.outcome !== 'open') return bout();
      if (JSON.stringify([await bout(), (await spots()).map((x) => `${x.kind}${x.index ?? ''}${x.off ? '' : '+'}`)]) === before) { await tapSpot('stage'); break; }
    }
  }
  if ((await bout())?.outcome === 'open') { await tapSpot('end'); await sleep(800); }
  return waitIdle();
}
async function playFight(page, snap, { rec, sceneId, shot, outcome, reload = null }) {
  console.log(`    ⚔ a fight at ${sceneId}, to ${outcome}`);
  rec.seen('fights', `${sceneId}:${outcome}`);
  let b = null;
  for (let turn = 0; turn < 40; turn++) {
    b = await fightTurn(page, outcome);
    if (!b || b.outcome !== 'open') break;
    // Reloaded mid-fight, the fight must stand again where it was (rules/tasks.mjs fightHold).
    if (turn === 0 && reload) {
      const was = await page.evaluate('globalThis.__lingjingPlay?.bout() ?? null');
      await reload();
      rec.seen('reloads', `${sceneId}:fight`);
      const now = await page.evaluate("({ fighting: document.body.classList.contains('fighting'), bout: globalThis.__lingjingPlay?.bout() ?? null })");
      if (!now.fighting) rec.find({ kind: 'reload', scene: sceneId, what: `reloaded mid-fight (${JSON.stringify(was)}) and the fight did not stand again`, shot: await shot(`reload-fight-${sceneId}`) });
      if (!now.fighting) return;
    }
  }
  if (b?.outcome === 'open') { rec.find({ kind: 'fight', scene: sceneId, what: `the fight is still open after 40 turns (${JSON.stringify(b)})`, shot: await shot(`fight-open-${sceneId}`) }); return; }
  console.log(`      → ${b?.outcome ?? 'gone'}`);
  // The closing card: its 收起 puts the seal away; then the page takes the way on (or the beast withdraws).
  for (let i = 0; i < 20; i++) {
    const close = (await page.evaluate(SPOTS)).find((x) => x.kind === 'close');
    if (close) { await page.clickAt(close.x, close.y); break; }
    if (!(await page.evaluate("document.body.classList.contains('fighting')"))) break;
    await sleep(500);
  }
  await sleep(1500);
  if (outcome === 'win' && b?.outcome && b.outcome !== 'won' && b.outcome !== 'win') rec.find({ kind: 'fight', soft: true, scene: sceneId, what: `the win policy ended ${b.outcome}`, shot: await shot(`fight-${sceneId}`) });
}
/* ── A story board played by play-human's hands (`--games=hands`): what the eye sees (SEE), the
   board's chooser, real pointer / touch at the casual policy's pace; every act judged (a control that
   changes nothing is a soft board-dead-tap). Answers 'won' | 'gone' | 'skipped' | 'timeout'. ── */
async function playBoardHands(page, { rec, sceneId, shot, task, policy, hand, r, seconds = 240 }) {
  const host = `[data-game="${task}"], [data-mount="${task}"]`, game = GAME_OF_TASK[task] ?? task, choose = CHOOSERS[chooserOf(game)], P = POLICIES.casual;
  const evaluate = (e) => page.evaluate(e);
  console.log(`    ✋ ${task} (${game}) by hand, ${policy}`);
  await page.evaluate(`document.querySelector(${JSON.stringify(host)})?.scrollIntoView({ block: 'center' })`);
  await sleep(600);
  await shot(`board-${task}-first`);
  let mode = policy;
  const t0 = Date.now(), mem = {}, dead = new Set();
  for (;;) {
    const el = Date.now() - t0;
    if (el > seconds * 1000) { rec.find({ kind: 'board-timeout', scene: sceneId, what: `${task} not done by hand (${mode}) in ${seconds} s`, pending: page.inFlight(), shot: await shot(`board-${task}-timeout`) }); return 'timeout'; }
    const seen = await page.evaluate(SEE(host)).catch(() => null);
    const out = await page.evaluate(`globalThis.__lingjingPlay?.board(${JSON.stringify(task)}) ?? null`).catch(() => null);
    if (!seen || seen.won || out?.won || out?.sent) {
      const won = Boolean(seen?.won || out?.won || out?.sent);
      rec.seen('games', `${task}:hands-${won ? 'won' : 'gone'}`);
      console.log(`      → ${won ? 'won' : 'gone'} in ${Math.round(el / 1000)} s${out?.grade ? ` ${out.grade}` : ''}${out?.stars != null ? ` ★${out.stars}` : ''}`);
      await shot(`board-${task}-end`);
      return won ? 'won' : 'gone';
    }
    // idle: sits until the board's own loss (接雨's flood), or a minute, then tries
    if (mode === 'idle' && (LOSS[game]?.test(seen.say) || el > 60000)) {
      rec.seen('games', `${task}:hands-lost`); console.log(`      … ${LOSS[game]?.test(seen.say) ? `lost («${seen.say.slice(0, 30)}»)` : 'a minute idle'}, now trying`);
      await shot(`board-${task}-loss`); mode = 'casual'; continue;
    }
    if (mode === 'skip') {
      const k = await page.evaluate(`(() => { const e = [...document.querySelectorAll('[data-game-skip="${task}"]')].find((x) => x.getClientRects().length); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
      if (k) { await sleep(400); await tapAt(hand, k.x, k.y); rec.seen('games', `${task}:hands-skip`); console.log(`      → 算了，往下走 after ${Math.round(el / 1000)} s`); await sleep(1500); return 'skipped'; }
      if (el > 20000) { await sleep(1000); continue; } // a few honest tries, then he sits: the stuck clock
    }
    const go = seen.controls.find((c) => START.test(c.g ?? '') && c.g !== 'again');
    if (mode === 'idle') { if (go) { await sleep(500); await tapAt(hand, go.x, go.y); } await sleep(200); continue; }
    const a = choose(seen, r, mem) ?? (go ? { kind: 'tap', c: go } : null);
    if (!a) { await sleep(80); continue; }
    await sleep(P.react[0] + r() * (P.react[1] - P.react[0]) - 270);
    const m = motion(hand, a, r, P, page.touch);
    const got = await judgeTap(evaluate, host, m.run);
    if (got === 'dead' && a.kind === 'tap' && !dead.has(m.key)) { dead.add(m.key); rec.find({ kind: 'board-dead-tap', soft: true, scene: sceneId, what: `${task}: ${m.key} «${a.c?.text ?? ''}» changed nothing on the board`, shot: await shot(`board-dead-${task}`) }); }
  }
}

/* A tap on the very element observed: scrolled into view as a player would, re-measured, then
   clicked with the mouse at its centre (hit-tested — a card over it takes the click). */
async function tapEl(page, t) {
  // On screen and on top: tap it where it is. Else scroll it into its own scroller first (a card
  // cut off by the stage's foot on a phone is scrolled to, as a thumb would) and measure again.
  if (t.onScreen && !t.covered) return page.clickAt(t.x, t.y);
  const sel = `${t.tag}${Object.entries(t.data).map(([k, v]) => `[data-${k}="${String(v).replace(/"/g, '\\"')}"]`).join('')}`;
  const at = await page.evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => (e.textContent || '').trim().replace(/\\s+/g, ' ').startsWith(${JSON.stringify(t.text.slice(0, 20))}));
    if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'nearest' }); let r = el.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (at && at !== el && !el.contains(at)) { el.scrollIntoView({ block: 'start', inline: 'nearest' }); r = el.getBoundingClientRect(); } return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!at) return false;
  await sleep(300);
  return page.clickAt(at.x, at.y);
}

/* The grade a won board is given: the one a way on this scene waits on — the route's
   exit first, then one not yet taken — else none. */
function gradeFor(lk, id, route, cov, sceneId) {
  const graded = (lk?.scene?.exits ?? []).filter((e) => e.needs?.task === id && e.needs.grade != null);
  if (!graded.length) return null;
  const pick = graded.find((e) => route.includes(e.id)) ?? graded.find((e) => !cov.exits[`${sceneId}:${e.id}`]) ?? graded[0];
  return [pick.needs.grade].flat()[0];
}
async function noGame(page, snap, act, { rec, sceneId, shot }) {
  rec.find({ kind: 'todo', scene: sceneId, what: `a game with no skip: ${act.taps.slice(0, 5).map((t) => JSON.stringify(t.data)).join(' ')}`, shot: await shot(`game-${sceneId}`) });
  throw new Error('game');
}

/* The header's and footer's chips each open what they hold, whole and on top: inside the
   window, and the topmost thing at its own centre (155bdf27: 事 opened clipped by its row).
   A second tap on the chip (or its own 合上) puts it away. Once per scene. */
const CHIPS = ['book', 'gear', 'wx', 'lu', 'roads', 'shelf'];
const POPS = `[...document.querySelectorAll('.bookpop, .wxpop, .roadspop, .ledgerpop, .lubook, .pouchbook, [role=dialog]')].filter((e) => e.getClientRects().length && !e.closest('[hidden]')).map((e) => {
  const r = e.getBoundingClientRect(), at = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + Math.min(r.height / 2, 40)));
  return { cls: String(e.className).slice(0, 40), top: r.top, bottom: r.bottom, left: r.left, right: r.right, W: innerWidth, H: innerHeight, onTop: Boolean(at && (e === at || e.contains(at))) }; })`;
async function checkChips(page, snap, { rec, sceneId, shot }) {
  for (const key of CHIPS) {
    const chip = snap.taps.find((t) => isA(t, key) && t.where !== 'book' && !t.disabled);
    if (!chip) continue;
    const before = (await page.evaluate(POPS)).length;
    await tapEl(page, chip);
    await sleep(700);
    const pops = await page.evaluate(POPS);
    if (pops.length <= before) rec.find({ kind: 'chip', scene: sceneId, what: `the ${key} chip «${chip.text}» opened nothing`, shot: await shot(`chip-${key}-${sceneId}`) });
    for (const p of pops.slice(before)) {
      const clipped = p.top < -1 || p.left < -1 || p.right > p.W + 1 || (p.bottom > p.H + 1 && p.top > p.H * 0.5);
      if (clipped || !p.onTop) rec.find({ kind: 'chip', scene: sceneId, what: `the ${key} chip's ${p.cls} ${clipped ? 'runs off the window' : 'is under something'} (${Math.round(p.left)},${Math.round(p.top)}–${Math.round(p.right)},${Math.round(p.bottom)} in ${p.W}×${p.H})`, shot: await shot(`chip-${key}-${sceneId}`) });
    }
    // Put it away: its own close, else the chip again.
    const close = (await page.evaluate(OBSERVE)).taps.find((t) => isA(t, 'lu-close') || isA(t, 'pouch-close'));
    if (close) await tapEl(page, close); else await tapEl(page, { ...chip, onScreen: true });
    await sleep(500);
    if ((await page.evaluate(POPS)).length > before) rec.find({ kind: 'chip', scene: sceneId, what: `the ${key} chip's popover would not close`, shot: await shot(`chipclose-${key}-${sceneId}`) });
  }
  rec.seen('chips', sceneId);
}

/* 回看 opens the passage's log, and a second tap puts it away. */
async function checkLog(page, snap, { rec, sceneId, shot }) {
  const log = snap.taps.find((t) => isA(t, 'dlg-log'));
  if (!log) return rec.find({ kind: 'box', scene: sceneId, what: 'no 回看 on the story box', shot: await shot(`nolog-${sceneId}`) });
  await page.clickAt(log.x, log.y);
  await sleep(600);
  const open = await page.evaluate(OBSERVE);
  if (!open.logOpen) return rec.find({ kind: 'box', scene: sceneId, what: '回看 opened nothing', shot: await shot(`log-${sceneId}`) });
  const shut = open.taps.find((t) => isA(t, 'dlg-logclose')) ?? open.taps.find((t) => isA(t, 'dlg-log'));
  if (shut) await page.clickAt(shut.x, shut.y);
  await sleep(600);
  const after = await page.evaluate(OBSERVE);
  if (after.logOpen) rec.find({ kind: 'box', scene: sceneId, what: '回看 would not close', shot: await shot(`logclose-${sceneId}`) });
}

/* `--all`: the main line from a fresh save with forks on, then every fork down its own exit (and
   their forks), until each exit seen has been taken once or `--max-forks` runs are spent. */
export async function crawlAll(o) {
  const main = await crawl({ ...o, fork: true });
  const runs = [main], queue = [...main.forks];
  let base = queue.length, spent = 0;
  while (queue.length && spent < Number(o['max-forks'] ?? 60)) {
    const f = queue.shift();
    spent++;
    console.log(`\n⑂ ${f.save}: ${f.scene} → ${f.exit}`);
    const r = await crawl({ ...o, save: f.save, from: undefined, route: f.exit, leave: o.leave ?? 2, steps: o['fork-steps'] ?? 80, fork: true, forkBase: base, chips: o.chips ?? 'off' });
    base += r.forks.length;
    queue.push(...r.forks);
    runs.push(r);
  }
  return runs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const o = parseFlags(process.argv.slice(2));
  const runs = o.all ? await crawlAll(o) : [await crawl(o)];
  const findings = runs.flatMap((r) => r.findings);
  console.log(JSON.stringify({ runs: runs.map((r) => ({ save: r.save, steps: r.steps, final: r.final, scenes: r.scenes.length, findings: r.findings.length })) }, null, 1));
  process.exit(findings.some((f) => f.kind !== 'todo' && !f.soft) ? 1 : 0);
}
