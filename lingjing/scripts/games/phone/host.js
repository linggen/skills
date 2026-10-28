// host.js — a board on the phone (Hanli 10-20, doc/game-kit.md § Mac and phone). The phone app (linggen-mobile) loads
// this page in a local webview and speaks the mount contract (games/mount.js) over its JS channel; everything around
// the play — the lead card, the pause, the result, the speech bubbles — is native Flutter. The game file is the same
// one the Mac plays: nothing here knows a game's rules, and the shell's web parts (games/shell.js frameHtml) are not used.
//
//   Flutter → page   LingjingHost.mount('{"game":"shouqiang","data":{"lv":"baicai"},"lang":"zh","seed":"…"}')
//                    LingjingHost.go()          the lead card's 开始 was tapped
//                    LingjingHost.pause(true)   the native pause button
//                    LingjingHost.leave()       the player walked away (settles { left: true })
//                    LingjingHost.mute(true)    the native 🔊 (the shell's one mute, kept in this webview: games/kit/sound.js)
//                    LingjingHost.heard(id, '{"reply":"…"}' | '{"error":"…"}')   the answer to an `ask`
//                    LingjingHost.tool('restart' | 'ask')   the native ↺ 重来 or ? 问询 of a board that declares it
//                                              (`meta.restart` · `meta.ask`): the board's own tap, as the Mac's shell bar sends it
//   page → Flutter   Linggen.postMessage(JSON) with { t: 'ready' | 'mounted' | 'lead' | 'say' | 'event' | 'ask' | 'stuck' | 'end' | 'error', … }
//                    mounted { game, muted }   the board's module is up (a lead card, if it has one, is asked for next); muted: the 🔊's state
//                    lead  { text }            the story lines the lead card reads; the game starts when go() answers it
//                    say   { who, text, ms }   a bubble over the field (台词预取's lines)
//                    event { f }               the game's facts (start · wave · wave_cleared · boss · low · end …)
//                    ask   { id, game, agent, text, png?, system? }   a model turn for a chat or a 画猜 look (jinchat · drawguess:
//                                              what the Mac sends to its chat, drawguess-ling.js askInChat): answered by heard()
//                    rules { id, verb, args }  a rules call the board makes itself (开炉's feed, 本王考考你's `kao open`, 银月
//                                              out of the 木牌 for a round): the app calls its rules, answers heard('{"result":…}')
//                    stuck {}                  the board says it may be left (its `stuck()`): the app offers 「算了，往下走」
//                    tools { restart, ask }    which of ↺ · ? the board declares, null when not, else whether it is on now
//                    end   { won, stars, grade, left, next, stats, outcome, picks }
//
// Which boards there are, and the sheets each links, is boards.json (written by tools/phone-board.mjs from
// tools/phone/board-kit.json); a board's module is scripts/games/<id>.js, as on the Mac.
// 斗法 (kapai): the room keeps every move (its `onMove` story hook) and the end carries them as `picks` — the app hands
// them to the rules (`duel --picks`), which replay the fight and settle it, as the Mac's story does.
//
// The shell's sound controller IS used (games/kit/sound.js through shellFor): a game names what happened, data says
// what it sounds like, and the result chimes at the end. iOS wakes the AudioContext on the first touch in the page.
import { forget, setPaused, settle, shellFor } from '../shell.js';
import { sound, unlockOn } from '../kit/sound.js';
import { stuckNow } from '../../stuck.js';
import { mountPure } from '../mount.js';

const ID = 'board';
const SKILL = new URL('../../../', import.meta.url);
const table = fetch(new URL('./boards.json', import.meta.url)).then((r) => r.json());

const post = (m) => {
  const bridge = globalThis.Linggen ?? globalThis.webkit?.messageHandlers?.Linggen;
  try { bridge?.postMessage(JSON.stringify(m)); } catch (e) { console.warn('[host] post', e); }
};

/* A board's sheets, linked once each before it mounts. */
async function sheets(files) {
  await Promise.all(files.map((f) => {
    const href = new URL(f, SKILL).href;
    if ([...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href === href)) return null;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    const loaded = new Promise((ok) => { l.onload = ok; l.onerror = ok; });
    document.head.append(l);
    return loaded;
  }));
}

/* A tap's trail, for the app's trace file (spec.trace; 2026-10-26, 接雨's second basin): every touch, pointer and
   click on the board as it lands, and the spot's classes a beat later — so a refused tap says why. Once per page. */
let traced = false;
/* What the board's own state says of a tap (接雨: its note, the hand's busy-until, the clock), when it hands a look. */
const stateBrief = () => { const g = state(); return g ? { note: g.note ?? null, busy: g.busy ?? null, t: g.t ?? null } : {}; };
function traceTaps() {
  if (traced) return;
  traced = true;
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  const spot = (e) => e.target?.closest?.('[data-g]');
  for (const type of ['touchstart', 'pointerdown', 'click']) {
    document.addEventListener(type, (e) => {
      const el = spot(e);
      const touches = type === 'touchstart' ? e.touches?.length : undefined;
      const line = { at: at(), type, g: el?.dataset?.g ?? null, i: el?.dataset?.i ?? null, primary: e.isPrimary, touches };
      post({ t: 'trace', line });
      if (type === 'pointerdown' && el) setTimeout(() => post({ t: 'trace', line: { at: at(), type: 'after', i: el.dataset?.i ?? null, cls: el.className?.baseVal ?? el.className, ...stateBrief() } }), 60);
    }, { capture: true, passive: true });
  }
}

/* The board's open calls to the app (a model turn, a rules call), by id. */
const talks = new Map();
let talkN = 0;

/* A model turn (jinchat · drawguess): the Mac's askInChat answer, { text } or { refused }; 'far' when no model answers. */
const ask = (game) => ({ agent = 'ling', text, png = null, system = null } = {}) => new Promise((resolve, reject) => {
  const id = `a${(talkN += 1)}`;
  talks.set(id, { resolve: (reply) => resolve({ text: reply }), refused: (why) => resolve({ refused: why }), reject });
  post({ t: 'ask', id, game, agent, text, ...(png ? { png } : {}), ...(system ? { system } : {}) });
});

/* A rules call the board makes (answered with the rules' JSON). */
const rules = (verb, args = {}) => new Promise((resolve, reject) => {
  const id = `r${(talkN += 1)}`;
  talks.set(id, { resolve, reject, raw: true });
  post({ t: 'rules', id, verb, args });
});

/* What a board is dealt beyond its data: the seams to this host (the Mac's lingjing.js mountData does the same with its
   own chat and verbs). A deal that names a rules verb (`begin`: 本王考考你) gets its call; a board that needs 银月
   (`her`) wakes her for the round and puts her back; a chat or a 画猜 asks the app's model; 开炉 feeds through the rules. */
function dealOf(game, data, task) {
  const d = { ...data };
  if (game === 'jinchat' || game === 'drawguess') d.ask = ask(game);
  if (game === 'kailu') d.roll = (ids, lingshi, press) => rules('fantong', { action: 'feed', ids: ids.join(','), lingshi: lingshi || 0, press: press ? 1 : 0 });
  if (d.begin && typeof d.begin === 'object') {
    const { verb, ...args } = d.begin;
    d.begin = async () => {
      const r = await rules(verb, args).catch(() => null);
      return r?.ok ? { ok: true, word: r.word ?? null } : { ok: false, say: r?.say ?? null, done: r?.refused === 'cap' };
    };
  }
  if (task?.her && task.id) {
    d.wake = () => rules('hergame', { hold: 1, task: task.id });
    d.rest = () => rules('hergame', { hold: 0, task: task.id });
  }
  return d;
}

let go = null, abort = null, stuckTimer = null, toolTimer = null;

/* ↺ 重来 and ? 问询 (games/shell.js restartHtml · cards.js boardAsk): every board hears them as a tap on its frame's bar
   (`.gshell > .gshell-bar [data-g][data-gfor]` — mount.js for a pure board, dash.js and fuqin.js on their own). The
   phone's bar is native, so the page keeps that bar hidden — the body is the frame — and the app's taps click it
   (Hanli 10-27: the phone's boards up to the Mac's). Which the board declares, and whether each is on now, go to the app. */
function toolBar(mod, look) {
  document.body.classList.add('gshell');
  document.querySelector('body > .gshell-bar')?.remove();
  clearInterval(toolTimer);
  const bar = document.createElement('div');
  bar.className = 'gshell-bar';
  bar.hidden = true;
  const has = { restart: typeof mod.meta?.restart === 'function', ask: typeof mod.meta?.ask === 'function' };
  const btn = (kind) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.g = kind === 'restart' ? 'restart' : 'hint';
    b.dataset.gfor = ID;
    b.dataset.tool = kind;
    return b;
  };
  for (const k of ['restart', 'ask']) if (has[k]) bar.append(btn(k));
  document.body.append(bar);
  let last = '';
  const read = () => {
    const s = look();
    const on = { restart: has.restart ? Boolean(s !== undefined && mod.meta.restart(s)) : null, ask: null };
    if (has.ask) {
      const g = s !== undefined ? mod.meta.ask(s) : null;
      on.ask = Boolean(g);
      if (g) bar.querySelector('[data-tool=ask]').dataset.g = g;
    }
    for (const b of bar.children) b.disabled = !on[b.dataset.tool];
    const now = JSON.stringify(on);
    if (now !== last) { last = now; post({ t: 'tools', ...on }); }
  };
  if (has.restart || has.ask) toolTimer = setInterval(read, 250);
  read();
}
let state = () => undefined; // the board's state, when its mount hands a look at it (`peek`)

async function mountBoard(spec) {
  const { game, data = {}, lang = 'zh', seed, reducedMotion = false, lines, level = 1, task = null } = spec;
  if (spec.trace) traceTaps();
  const row = (await table).games?.[game];
  if (!row) { post({ t: 'error', error: `no board ${game}` }); return; }
  abort?.abort();
  abort = new AbortController();
  clearInterval(stuckTimer);
  clearInterval(toolTimer);
  forget(ID);
  await sheets(row.css ?? []);
  document.documentElement.dataset.board = game;
  // A board drawn in the page (its own sheets) stands on the paper and scrolls; a Phaser board fills the stage itself.
  document.documentElement.classList.toggle('is-dom', Boolean(row.css?.length));
  if (row.piece) return playPiece(row.piece, lang);
  const mod = await import(new URL(`scripts/games/${game}.js`, SKILL).href);
  // A pure board (meta · newGame · act · html: 洛书, 五子棋 …) gets the contract from mount.js, as the 游戏厅 gives it.
  const mount = mod.mount ?? (mod.html ? mountPure(mod) : null);
  if (!mount) { post({ t: 'error', error: `${game} has no mount` }); return; }
  const shell = {
    ...shellFor(ID, game),
    say: (who, text, ms) => post({ t: 'say', who, text, ms }),
    // The lead card is Flutter's: the page asks for it and the game waits for `go()`.
    lead: (text, o) => new Promise((resolve) => { go = resolve; post({ t: 'lead', text, auto: o?.auto ?? null }); }),
  };
  // 斗法: the moves the rules will replay.
  const picks = [];
  const story = game === 'kapai' ? { onMove: (token) => picks.push(token) } : undefined;
  const dealt = dealOf(game, data, task);
  post({ t: 'mounted', game, muted: sound.settings().muted });
  // 「算了，往下走」 by the page's one rule (stuck.js): the board stood unwon long enough, or the game says so
  // (its `stuck(state)`; a pure board's state through mount.js `peek`).
  state = () => undefined;
  const g = { mod, shownAt: performance.now(), get state() { return state(); } };
  toolBar(mod, () => state());
  stuckTimer = setInterval(() => { if (stuckNow(g, performance.now())) { clearInterval(stuckTimer); post({ t: 'stuck' }); } }, 1000);
  const stage = document.getElementById('stage');
  const r = await mount(stage, {
    lang, data: dealt, seed, level, reducedMotion, lines, signal: abort.signal, shell, story, onEvent: (f) => post({ t: 'event', f }),
    peek: (look) => { state = look; },
  });
  clearInterval(stuckTimer);
  clearInterval(toolTimer);
  settle(ID, r);
  post({
    t: 'end', won: Boolean(r?.won), stars: r?.stars ?? null, grade: r?.grade ?? null, left: Boolean(r?.left), next: r?.next ?? null,
    stats: r?.stats ?? null, outcome: r?.outcome ?? null, ...(story ? { picks } : {}),
  });
}

/* A 大场面 (games.piece-<id>): setpieces/<id>.js through the story's own runner, beat after beat at its own pace;
   its book lines go to the app as `say` (the app lays them over the picture); a tap finishes the beat on screen,
   `leave()` (the app's skip) jumps to its last frame. Ends like a board: `end { won: true }`. */
let piece = null;
async function playPiece(id, lang) {
  const { playSetPiece } = await import(new URL('scripts/setpiece.js', SKILL).href);
  const stage = document.getElementById('stage');
  const box = document.createElement('div');
  box.className = 'phonepiece';
  stage.replaceChildren(box);
  document.documentElement.classList.add('is-piece');
  const done = new Promise((resolve) => {
    playSetPiece(box, id, {
      lang, auto: true, cover: true, hold: 900,
      onBeat: (i, beat) => post({ t: 'say', who: '', text: beat.text, ms: 0, piece: true }),
      onDone: () => resolve(),
    }).then((ctl) => {
      piece = ctl;
      abort.signal.addEventListener('abort', () => ctl.skip(), { once: true });
    }).catch((e) => { console.warn('[host] piece', id, e); resolve(); });
  });
  box.addEventListener('pointerdown', () => piece?.tap());
  post({ t: 'mounted', game: `piece-${id}` });
  await done;
  await new Promise((ok) => setTimeout(ok, 700));
  piece?.destroy?.();
  piece = null;
  post({ t: 'end', won: true, stars: null, grade: null, left: false, next: null, stats: null, outcome: null });
}

globalThis.LingjingHost = {
  mount: (specJson) => mountBoard(typeof specJson === 'string' ? JSON.parse(specJson) : specJson).catch((e) => post({ t: 'error', error: String(e?.stack ?? e) })),
  go: () => { go?.(); go = null; },
  pause: (on) => setPaused(ID, Boolean(on)),
  leave: () => abort?.abort(),
  /// The native ↺ or ?: a click on the hidden bar's button (toolBar), which the board hears as its own.
  tool: (kind) => { const b = document.querySelector(`body > .gshell-bar [data-tool="${kind}"]`); if (b && !b.disabled) b.click(); return Boolean(b && !b.disabled); },
  /// The bar's 🔊 (Hanli 10-26: every board, Mac and phone): both parts at once, as the Mac's shell button.
  mute: (on) => { sound.mute(Boolean(on)); return sound.settings().muted; },
  /// The board's state as its mount shows it (the builder's drive and the stuck rule; undefined for a board that does not).
  state: () => state(),
  heard: (id, json) => {
    const t = talks.get(id);
    if (!t) return;
    talks.delete(id);
    const m = typeof json === 'string' ? JSON.parse(json) : json;
    if (t.raw) { if (m?.result !== undefined) t.resolve(m.result); else t.reject(new Error(m?.error ?? 'no answer')); return; }
    if (m?.refused && t.refused) { t.refused(String(m.refused)); return; } // `blind`: the model cannot see (画猜 says so)
    if (m?.reply != null) t.resolve(String(m.reply)); else t.reject(new Error(m?.error ?? 'no answer'));
  },
};
unlockOn(document);
// A phone: a game line with a desk face and a touch face (games/kit/device.js) reads its touch face here.
document.documentElement.dataset.input = 'touch';
window.addEventListener('error', (e) => post({ t: 'error', error: String(e.message ?? e) }));
post({ t: 'ready' });
