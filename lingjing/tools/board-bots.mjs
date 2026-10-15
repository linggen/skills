// tools/board-bots.mjs — a human-like player for each board module (Layer 3 of the game's
// tests, its node half; Hanli 2026-10-15: today's 黑地十一步 could not be won by hand).
//
//   node tools/board-bots.mjs [module …] [--tries=3] [--verbose]
//
// A module (scripts/games/<id>.js: newGame / html / act / tick) is played by its bot
// (scripts/games/bots/<id>.js, `bot(state, see)`), the way a person plays it:
//   - the bot looks at the board as it stands and decides; the hand lands REACTION ms later
//     (200 ms ± a jitter, gaussian, sd 40 ms, never under 120), while the clock runs on;
//   - knowing the hand is slow, the bot may aim ahead: `see.lead` is the mean delay, so a
//     swinging mark is pressed where it WILL be — a person learns a rhythm the same way;
//     the jitter is the error no one escapes;
//   - after a press the eye needs a moment (REFRACTORY ms) before the next decision;
//   - a drag's strokes (`move`) flow without a fresh decision each, as a finger slides.
// A bot returns null (wait), { g, ...data } (a tap on [data-g]), { hold: {...data} }
// (press on [data-g-hold] / [data-g-drag]), { release: true }, or { move: d } (pixels).
// A module wins when its state says `won`. Three tries (fresh seeds), each up to LIMIT_MS
// of game time. A module its bot cannot win fails BY NAME — the game is too hard for a
// person, or the bot is wrong; either way somebody looks.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const REACTION = 200;
export const JITTER = 40;
export const REFRACTORY = 120;
export const STEP = 10;
export const LIMIT_MS = 240000;
const GAMES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/games');

/* A seeded random source (mulberry32), so a failure replays. */
export function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = Math.imul(a ^ ch.codePointAt(0), 2654435761) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = r => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

/* What an action sends to the module's act, as live-games.js would. */
const dataOf = a => (a.hold ? { ...a.hold, g: 'hold' } : a.release ? { g: 'release' } : a.move != null ? { g: 'move', d: a.move } : a);

/* One try: the module played by the bot until won or LIMIT_MS of game time. */
export function playOnce(mod, bot, { seed = 'bot-1', level = 1, reaction = REACTION, jitter = JITTER, limit = LIMIT_MS } = {}) {
  const r = rng(seed);
  let state = mod.newGame(seed, level), t = 0, pending = null, nextLook = 0, acts = 0;
  const tick = ms => { if (mod.tick && state.live && !state.won) state = mod.tick(state, ms); };
  const apply = a => { state = mod.act(state, dataOf(a)).state ?? state; acts++; };
  while (t < limit) {
    if (state.won) return { won: true, ms: t, grade: state.grade ?? null, acts };
    if (pending && t >= pending.at) { apply(pending.a); pending = null; nextLook = t + REFRACTORY; continue; }
    if (!pending && t >= nextLook) {
      const a = bot(state, { lead: reaction, t });
      if (a && a.move != null) apply(a); // a stroke flows on
      else if (a) pending = { a, at: t + Math.max(120, reaction + gauss(r) * jitter) };
      nextLook = Math.max(nextLook, t + STEP);
    }
    tick(STEP);
    t += STEP;
  }
  return { won: Boolean(state.won), ms: t, grade: state.grade ?? null, acts, stuck: Boolean(mod.stuck?.(state)) };
}

/* Up to `tries` fresh games: the first win, else the last loss. */
export function playModule(mod, bot, { tries = 3, ...opts } = {}) {
  const runs = [];
  for (let i = 1; i <= tries; i++) {
    const run = playOnce(mod, bot, { ...opts, seed: `bot-${i}` });
    runs.push(run);
    if (run.won) return { won: true, tries: i, runs };
  }
  return { won: false, tries, runs };
}

export async function loadPair(id) {
  const mod = await import(path.join(GAMES, `${id}.js`));
  const file = path.join(GAMES, 'bots', `${id}.js`);
  const bot = fs.existsSync(file) ? (await import(file)).bot : null;
  return { mod, bot };
}

/* The modules 卷一's story boards are played on (tasks.json `game`), from the content. */
export async function juanOneModules() {
  const { loadContent } = await import('../scripts/content.mjs');
  const content = loadContent();
  const ids = new Set();
  for (const ch of ['00-prologue', '00-waimen', '00-zhuji']) for (const sc of Object.values(content.chapters[ch].scenes)) {
    for (const c of sc.show ?? []) if (c.card === 'board') ids.add(c.id);
    for (const id of sc.offers?.tasks ?? []) ids.add(id);
    for (const e of sc.exits) if (e.needs?.task) ids.add(e.needs.task);
  }
  // A sealed instance's rooms (秘境): their boards are the story's too.
  for (const d of Object.values(content.places)) for (const p of d.places) for (const v of Object.values(p.has ?? {})) for (const x of [v].flat()) if (x?.task?.id) ids.add(x.task.id);
  const games = new Map();
  for (const id of ids) {
    const g = content.tasks.tasks.find(t => t.id === id)?.game;
    if (g && fs.existsSync(path.join(GAMES, `${g}.js`))) games.set(g, [...(games.get(g) ?? []), id]);
  }
  return games;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')).map(([k, v]) => [k, v ?? true]));
  const named = args.filter(a => !a.startsWith('--'));
  const ids = named.length ? named : [...(await juanOneModules()).keys()].sort();
  let failed = 0;
  for (const id of ids) {
    const { mod, bot } = await loadPair(id);
    if (!bot) { console.log(`${id.padEnd(12)} NO BOT`); failed++; continue; }
    const r = playModule(mod, bot, { tries: Number(flags.tries ?? 3) });
    const last = r.runs.at(-1);
    console.log(`${id.padEnd(12)} ${r.won ? `won on try ${r.tries} in ${(last.ms / 1000).toFixed(1)} s (${last.acts} presses${last.grade ? `, ${last.grade}` : ''})` : `LOST all ${r.tries}${last.stuck ? ' (the module says stuck)' : ''}`}`);
    if (!r.won) failed++;
  }
  process.exitCode = failed ? 1 : 0;
}
