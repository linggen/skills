// setpiece.js — 大场面 (哇时刻 ②): one per 卷 at most, the whole stage. The
// runner; each piece lives in setpieces/<id>.js and hands back one paused
// GSAP timeline per beat (卷一's is `zhang`, 漳水立起; 古九's `zhuji`, 筑基天象),
// both painted: setpieces/painted.js moves the camera and soaks one painting into the next.
//
// A piece moves with the dialogue box: a beat plays, then holds until a tap
// (the box's next passage) — or runs on by itself with `auto`. A tap during a
// beat finishes it; `skip()` jumps to the last frame and ends. Reduced motion
// shows each beat's last frame; no WebGL shows an SVG still per beat. Words
// are never painted: `onBeat(i, beat)` names the beat and the book line it
// goes with, and the caller says it. Pixi and GSAP come from fx.js's loaders
// (vendored, loaded only now); one Application per piece, destroyed after.
import { glOK, loadGsap, loadPixi } from './fx.js';

const ART_BASE = new URL('../worlds/jiuding/', import.meta.url).href;

/// The beats as a state machine, apart from any drawing (the tests drive it).
/// Events: {start: i} play beat i · {finish: i} jump beat i to its end ·
/// {hold: i} beat i ended, waiting · {done: true} the piece is over.
export function beatStepper(beats) {
  let i = -1, phase = 'idle';
  const next = () => {
    if (i + 1 < beats.length) { i += 1; phase = 'play'; return { start: i }; }
    phase = 'done';
    return { done: true };
  };
  return {
    get i() { return i; },
    get phase() { return phase; },
    get beat() { return beats[i] ?? null; },
    total: beats.reduce((a, b) => a + b.ms, 0),
    start: () => (phase === 'idle' ? next() : {}),
    ended: () => (phase === 'play' ? (phase = 'hold', { hold: i }) : {}),
    tap: () => (phase === 'play' ? (phase = 'hold', { finish: i }) : phase === 'hold' ? next() : {}),
    skip: () => (phase === 'done' ? {} : (phase = 'done', { skip: i, done: true })),
  };
}

/// The piece named `id` from a story node or a scene: `"setpiece": "zhang"` or
/// `{ "id": "zhang" }` (the declaration, doc/design.md § 哇时刻).
export const setpieceOf = (node) => {
  const s = node?.setpiece;
  const id = typeof s === 'string' ? s : s?.id;
  return typeof id === 'string' && /^[a-z]+$/.test(id) ? id : null;
};

/// Did the passage already lay this piece under its words (a beat marked `{景=id}`, rules/tell.mjs)? Then a
/// choice's `setpiece` of the same id is not played again as its own box after it (live, 2026-10-15: the
/// 筑基天象 replayed whole after 09-cliff's 冲关 passage had told it). `reading`: the play's reading
/// (dialogue.js — its items' beats, flat or by language).
export function carriesPiece(reading, id) {
  if (!id) return false;
  const beats = (it) => (Array.isArray(it?.beats) ? it.beats : [...(it?.beats?.zh ?? []), ...(it?.beats?.en ?? [])]);
  return (reading?.items ?? []).some((it) => beats(it).some((b) => b?.piece === id));
}

/// The beats a declaration asks for — `{ "id": "zhang", "beats": ["still", "rise"] }`
/// plays only those (the picture keeps pace with the play: the river stands, the
/// player fights the trial, the rest plays after the win); a bare id plays them all.
export const setpieceBeats = (node) => {
  const b = node?.setpiece?.beats;
  return Array.isArray(b) && b.length && b.every((x) => typeof x === 'string') ? b : null;
};

/// The beats to play, in the piece's own order, and the ones before the first of
/// them that stand already done (their last frame is the start of this run).
export function beatRange(all, want) {
  if (!want) return { play: all, before: [] };
  const play = all.filter((b) => want.includes(b.id));
  if (!play.length) return { play: all, before: [] };
  const first = all.indexOf(play[0]);
  return { play, before: all.slice(0, first) };
}

const loadImage = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error(`no picture: ${src}`)); im.src = src; });

/// Play piece `id` in `host` (an empty box the caller sized). Resolves to
/// {tap(), skip(), destroy(), get i(), get phase()}.
/// `hold` — how long a beat ends held before `auto` goes on: ms, or (beat) => ms (its line's reading
/// time). `onHold(i)` — beat i ended and waits (the caller says 「轻触继续」).
export async function playSetPiece(host, id, { lang = 'zh', still = false, auto = false, hold = 900, artBase = ART_BASE, beats = null, cover = false, onBeat, onHold, onDone } = {}) {
  if (!/^[a-z]+$/.test(id)) throw new Error(`bad set piece: ${id}`);
  const def = await import(`./setpieces/${id}.js`);
  const { play: BEATS, before } = beatRange(def.BEATS, beats);
  const steps = beatStepper(BEATS);
  const box = document.createElement('div');
  box.className = 'sphost';
  host.appendChild(box);
  let Wpx = Math.max(240, host.clientWidth || 480), Hpx = Math.max(160, host.clientHeight || Math.round(Wpx * 0.75));
  // A piece with its own frame (`ASPECT`, height over width: 漳水 is 16:9) is letterboxed in the
  // host — as wide as it fits, centred; else the frame follows the host.
  // `cover` (a beat's piece as the whole stage, lingjing.js layBeatPiece): the frame is the host's
  // own, the camera's cover fit filling it — no letterbox.
  if (def.ASPECT && !cover) {
    box.classList.add('fit');
    if (Hpx / Wpx > def.ASPECT) Hpx = Math.round(Wpx * def.ASPECT); else Wpx = Math.round(Hpx / def.ASPECT);
  }
  const W = 1000, H = Math.round(W * (cover ? Hpx / Wpx : def.ASPECT ?? Math.min(1.6, Math.max(0.6, Hpx / Wpx))));
  const art = {};
  // Every painting before the first beat: a beat never waits on a picture (no jank).
  await Promise.all(Object.entries(def.ART ?? {}).map(async ([k, p]) => { art[k] = await loadImage(new URL(p, artBase).href).catch(() => null); }));
  const arts = Object.fromEntries(Object.entries(art).filter(([, v]) => v).map(([k, v]) => [k, v.src]));
  const still_ = (id) => def.stillSvg(id, { W, H, art: art.bingyi?.src, arts });

  let app = null, scene = null, tl = null, timer = null, gone = false;
  const gl = glOK();
  if (gl) {
    const [PIXI, gsap] = await Promise.all([loadPixi(), loadGsap()]);
    app = new PIXI.Application();
    await app.init({ width: Wpx, height: Math.round(Wpx * H / W), backgroundAlpha: 0, antialias: true, resolution: Math.min(globalThis.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
    box.appendChild(app.canvas);
    const root = new PIXI.Container();
    root.scale.set(Wpx / W);
    app.stage.addChild(root);
    scene = def.build({ PIXI, gsap, app, root, W, H, art, lang });
    // A later run starts where the earlier beats left the picture (the river up, the trial over).
    for (const b of before) scene.beat(b.id).progress(1);
  }

  // A beat may name its own hold (`hold`, ms: the boast's vision goes straight into the cut). Shown
  // still (reduced motion, played before), such a beat's last frame stands as long as it would have
  // played, so the still keeps time with the words paced over it.
  const heldFor = (b) => (b.hold != null ? b.hold + (still || !scene ? b.ms : 0)
    : typeof hold === 'function' ? hold({ ...b, text: b.line?.[lang] ?? b.line?.zh }) : hold);
  const say = (i) => onBeat?.(i, { ...BEATS[i], text: BEATS[i].line?.[lang] ?? BEATS[i].line?.zh }, BEATS.length);
  const react = (ev) => {
    if (gone) return;
    clearTimeout(timer);
    if ('start' in ev) {
      const b = BEATS[ev.start];
      say(ev.start);
      if (!scene) { box.innerHTML = still_(b.id); return react(steps.ended()); }
      tl = scene.beat(b.id);
      tl.eventCallback('onComplete', () => react(steps.ended()));
      if (still) tl.progress(1); else tl.play();
    } else if ('finish' in ev) {
      tl?.progress(1);
      react({ hold: ev.finish });
    } else if ('hold' in ev) {
      onHold?.(ev.hold);
      if (auto) timer = setTimeout(() => react(steps.tap()), heldFor(BEATS[ev.hold]));
    } else if ('skip' in ev) {
      // The last frame: every beat left, run to its end in order.
      if (scene) { tl?.progress(1); for (let k = Math.max(0, ev.skip + 1); k < BEATS.length; k += 1) scene.beat(BEATS[k].id).progress(1); } else box.innerHTML = still_(BEATS.at(-1).id);
      onDone?.();
    } else if (ev.done) onDone?.();
  };
  react(steps.start());

  // Where the play stands against a piece's `CUES` (the words that wait for the picture, lingjing.js
  // pieceGate): beat `beat` reached its time `t` (s, on the beat's own timeline) — or ended, `t: 'end'`.
  const lastBeat = () => steps.phase === 'done' || (steps.phase === 'hold' && steps.i === BEATS.length - 1);
  const reached = ({ beat, t = 'end' } = {}) => {
    const k = BEATS.findIndex((b) => b.id === beat);
    if (k < 0 || steps.phase === 'done' || steps.i > k) return true;
    if (steps.i < k) return false;
    if (steps.phase === 'hold') return true;
    return t !== 'end' && Boolean(tl) && tl.time() >= t;
  };

  return {
    get i() { return steps.i; },
    get phase() { return steps.phase; },
    /// The last beat played to its end (its last frame up), held or done.
    get ended() { return lastBeat(); },
    reached,
    tap: () => react(steps.tap()),
    /// A look at beat `k` at progress `p` (0–1), drawn at once: for checking frames
    /// where the page's clock does not run (a hidden tab). Not for play.
    seek(k, p = 1) {
      if (!scene) { box.innerHTML = still_(def.BEATS[k].id); return; }
      tl?.kill();
      for (let j = 0; j < k; j += 1) scene.beat(def.BEATS[j].id).progress(1);
      tl = scene.beat(def.BEATS[k].id);
      tl.progress(p);
      for (let f = 0; f < 90; f += 1) scene.step(16);
      app.renderer.render(app.stage);
    },
    skip: () => react(steps.skip()),
    destroy() {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      tl?.kill();
      scene?.destroy();
      app?.destroy(true, { children: true });
      box.remove();
    },
  };
}
