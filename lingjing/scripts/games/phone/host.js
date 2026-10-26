// host.js — a board on the phone (Hanli 10-20, doc/game-kit.md § Mac and phone). The phone app (linggen-mobile) loads
// this page in a local webview and speaks the mount contract (games/mount.js) over its JS channel; everything around
// the play — the lead card, the pause, the result, the speech bubbles — is native Flutter. The game file is the same
// one the Mac plays: nothing here knows a game's rules, and the shell's web parts (games/shell.js frameHtml) are not used.
//
//   Flutter → page   LingjingHost.mount('{"game":"shouqiang","data":{"lv":"baicai"},"lang":"zh","seed":"…"}')
//                    LingjingHost.go()          the lead card's 开始 was tapped
//                    LingjingHost.pause(true)   the native pause button
//                    LingjingHost.leave()       the player walked away (settles { left: true })
//                    LingjingHost.heard(id, '{"reply":"…"}' | '{"error":"…"}')   the answer to a `talk`
//   page → Flutter   Linggen.postMessage(JSON) with { t: 'ready' | 'mounted' | 'lead' | 'say' | 'event' | 'talk' | 'stuck' | 'end' | 'error', … }
//                    mounted { game }          the board's module is up (a lead card, if it has one, is asked for next)
//                    lead  { text }            the story lines the lead card reads; the game starts when go() answers it
//                    say   { who, text, ms }   a bubble over the field (台词预取's lines)
//                    event { f }               the game's facts (start · wave · wave_cleared · boss · low · end …)
//                    talk  { id, text }        a line for 银月 (讨饼债): the app asks the phone's Yinyue, answers heard()
//                    stuck {}                  the board says it may be left (its `stuck()`): the app offers 「算了，往下走」
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
import { unlockOn } from '../kit/sound.js';
import { stuckNow } from '../../stuck.js';

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

/* 银月's turns (讨饼债): each line goes to the app, which answers with her reply. */
const talks = new Map();
let talkN = 0;
const talk = (text) => new Promise((resolve, reject) => {
  const id = `t${(talkN += 1)}`;
  talks.set(id, { resolve, reject });
  post({ t: 'talk', id, text });
});

let go = null, abort = null, stuckTimer = null;
let state = () => undefined; // the board's state, when its mount hands a look at it (`peek`)

async function mountBoard(spec) {
  const { game, data = {}, lang = 'zh', seed, reducedMotion = false, lines } = spec;
  const row = (await table).games?.[game];
  if (!row) { post({ t: 'error', error: `no board ${game}` }); return; }
  abort?.abort();
  abort = new AbortController();
  clearInterval(stuckTimer);
  forget(ID);
  await sheets(row.css ?? []);
  document.documentElement.dataset.board = game;
  // A board drawn in the page (its own sheets) stands on the paper and scrolls; a Phaser board fills the stage itself.
  document.documentElement.classList.toggle('is-dom', Boolean(row.css?.length));
  if (row.piece) return playPiece(row.piece, lang);
  const mod = await import(new URL(`scripts/games/${game}.js`, SKILL).href);
  const shell = {
    ...shellFor(ID, game),
    say: (who, text, ms) => post({ t: 'say', who, text, ms }),
    // The lead card is Flutter's: the page asks for it and the game waits for `go()`.
    lead: (text, o) => new Promise((resolve) => { go = resolve; post({ t: 'lead', text, auto: o?.auto ?? null }); }),
  };
  // 斗法: the moves the rules will replay.
  const picks = [];
  const story = game === 'kapai' ? { onMove: (token) => picks.push(token) } : undefined;
  const dealt = game === 'bingzhai' ? { ...data, talk } : data;
  post({ t: 'mounted', game });
  // 「算了，往下走」 by the page's one rule (stuck.js): the board stood unwon long enough, or the game says so
  // (its `stuck(state)`; a pure board's state through mount.js `peek`).
  state = () => undefined;
  const g = { mod, shownAt: performance.now(), get state() { return state(); } };
  stuckTimer = setInterval(() => { if (stuckNow(g, performance.now())) { clearInterval(stuckTimer); post({ t: 'stuck' }); } }, 1000);
  const stage = document.getElementById('stage');
  const r = await mod.mount(stage, {
    lang, data: dealt, seed, reducedMotion, lines, signal: abort.signal, shell, story, onEvent: (f) => post({ t: 'event', f }),
    peek: (look) => { state = look; },
  });
  clearInterval(stuckTimer);
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
  /// The board's state as its mount shows it (the builder's drive and the stuck rule; undefined for a board that does not).
  state: () => state(),
  heard: (id, json) => {
    const t = talks.get(id);
    if (!t) return;
    talks.delete(id);
    const m = typeof json === 'string' ? JSON.parse(json) : json;
    if (m?.reply != null) t.resolve(String(m.reply)); else t.reject(new Error(m?.error ?? 'no answer'));
  },
};
unlockOn(document);
// A phone: a game line with a desk face and a touch face (games/kit/device.js) reads its touch face here.
document.documentElement.dataset.input = 'touch';
window.addEventListener('error', (e) => post({ t: 'error', error: String(e.message ?? e) }));
post({ t: 'ready' });
