// eye.js — the camera and the hand-landmark model, for any game that wants hand seals (结印 in the 游戏厅 today;
// 守墙关's helper and 古六's 讲堂 level if they come). All on the device: MediaPipe's Hand Landmarker, vendored under
// scripts/vendor/mediapipe/ (VENDOR.md) — the model, the WASM and the bundle load from there, nothing from the
// network, and no frame leaves the page.
//
//   available()          → may 结印 be offered at all? (a camera API, a camera, WebGL). No → offer nothing: the host
//                          plays as it does without it — no button, no tap stand-in (Hanli 10-21: 「没摄像头时, 就不用」).
//   loadModel()          → the landmarker, loaded once (start it early: it is ~19 MB from disk).
//   openEye({ video, onHands, fps?, width?, height?, numHands?, handedSwap? }) → { start(), pause(), close(), setFps(n) }
//                          start() asks for the camera (only now — call it on the player's 开始) and runs the model on
//                          each new video frame: onHands({ world, image, handed }) — world: hands as 21 metric points for the
//                          judge (judge.js); image: the same hands, 0…1 of the frame, for drawing. pause() stops the
//                          camera (its tracks, so the light goes off); start() again re-opens it. close() ends it all.
//                          start() rejects with an Error whose `reason` is 'denied' | 'nocamera' | 'model'.
//                          Power (Hanli 10-21: 「好，加上」): the model runs at most `fps` times a second (frames skipped by
//                          their time), the camera is asked for at width × height (ideal — a camera that gives more is
//                          used as it comes), and looks for `numHands` hands. Defaults: EYE below; a game passes its
//                          own from levels/jieyin.json `eye` (sets.js eyeFor) — a game that needs quicker reads (隔空指点's
//                          poke) asks for more fps.

const VENDOR = new URL('../../vendor/mediapipe/', import.meta.url);
const file = (name) => new URL(name, VENDOR).href;
/** Is the model due on a frame at `now`, its last run at `last`? A little under the period, so a 30 fps camera still
    gives every second frame at 15. */
export const due = (now, last, fps) => now - last >= 1000 / Math.max(1, fps) - 4;

/** Which hand each is, the player's own ('Left' | 'Right'; null unknown). MediaPipe names them as on a mirrored
    picture; ours is not mirrored, so its names are swapped back (`handedSwap`, jieyin.json orient.handedSwap). */
export function handedOf(r, swap = true) {
  return (r?.handedness ?? r?.handednesses ?? []).map((c) => {
    const n = c?.[0]?.categoryName;
    if (n !== 'Left' && n !== 'Right') return null;
    return swap ? (n === 'Left' ? 'Right' : 'Left') : n;
  });
}

/** The defaults when a game passes none (levels/jieyin.json `eye` holds the game's). */
export const EYE = { fps: 15, width: 320, height: 240, numHands: 2 };

const fail = (reason, cause) => Object.assign(new Error(`jieyin: ${reason}`), { reason, cause });

/** May hand seals be offered here? Cheap, asks nothing of the player (no permission prompt). */
export async function available(env = globalThis) {
  const md = env.navigator?.mediaDevices;
  if (typeof md?.getUserMedia !== 'function') return false;
  if (!webgl(env)) return false;
  if (typeof md.enumerateDevices !== 'function') return true;
  try {
    const devices = await md.enumerateDevices();
    return devices.some((d) => d.kind === 'videoinput');
  } catch {
    return false;
  }
}

function webgl(env) {
  try {
    const c = env.document?.createElement('canvas');
    const gl = c?.getContext?.('webgl2') ?? c?.getContext?.('webgl');
    // Let the probe's context go at once: the browser keeps only a few, and drops the oldest live one (fx.js glOK).
    gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
    return Boolean(gl);
  } catch {
    return false;
  }
}

let model = null;
/** The landmarker, loaded once a page (GPU first, else CPU). */
export function loadModel() {
  model ??= (async () => {
    const { HandLandmarker, FilesetResolver } = await import(file('vision_bundle.mjs'));
    if (!(await FilesetResolver.isSimdSupported())) throw fail('model', 'no WASM SIMD'); // only the SIMD build is vendored
    const fileset = { wasmLoaderPath: file('vision_wasm_internal.js'), wasmBinaryPath: file('vision_wasm_internal.wasm') };
    const make = (delegate) => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: file('hand_landmarker.task'), delegate }, runningMode: 'VIDEO', numHands: 2,
    });
    const lm = await make('GPU').catch(() => make('CPU'));
    lm.__hands = 2;
    // While the lead card is read: the first look, off the camera's first frame (the phone's card is native, so the
    // page's stall there is unseen; on the Mac it falls on the card, not on the play).
    await new Promise((r) => setTimeout(r, 0));
    warm(lm);
    return lm;
  })();
  model.catch(() => { model = null; });
  return model;
}

/* The first look builds the model's GPU programs on the page's thread — measured in the phone app's webview (iPhone SE
   simulator, 11-05): the first detectForVideo 5.2 s, the next ones 16–18 ms; a setOptions after it, 9 ms itself but the
   next look 237 ms (the graph rebuilt). Both used to land on the camera's first frame (Hanli 11-05: 「手机上开摄像头结印时
   卡了一下」). One look at a blank picture as the model comes in takes them early. VIDEO mode wants rising timestamps:
   the camera's frames come after this one. */
export function warm(lm, env = globalThis) {
  try {
    const c = env.document?.createElement?.('canvas');
    if (!c) return false;
    c.width = 64; c.height = 48;
    c.getContext?.('2d')?.fillRect?.(0, 0, 64, 48);
    lm.detectForVideo(c, env.performance?.now?.() ?? Date.now());
    return true;
  } catch { return false; /* the camera's first frame does it then */ }
}

/** The landmarker set for `numHands`: rebuilt (its GPU programs again) only when the count changes, then warmed again. */
export async function handsFor(lm, numHands, env = globalThis) {
  if (lm.__hands === numHands) return lm;
  await lm.setOptions?.({ numHands });
  lm.__hands = numHands;
  warm(lm, env);
  return lm;
}

/** Let the landmarker go (the page is leaving the game). */
export async function dropModel() {
  const m = model;
  model = null;
  try { (await m)?.close(); } catch { /* already gone */ }
}

async function camera(video, env, { width, height }) {
  let stream;
  try {
    stream = await env.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: width }, height: { ideal: height } }, audio: false });
  } catch (e) {
    throw fail(e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? 'nocamera' : 'denied', e);
  }
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
  return stream;
}

const stopTracks = (video) => {
  for (const t of video.srcObject?.getTracks?.() ?? []) t.stop();
  video.srcObject = null;
};

export function openEye({ video, onHands, env = globalThis, fps = EYE.fps, width = EYE.width, height = EYE.height, numHands = EYE.numHands, handedSwap = true }) {
  let on = false, frame = 0, lastT = -1, lastRun = -Infinity, landmarker = null;
  const next = () => {
    if (!on) return;
    frame = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(look) : env.requestAnimationFrame(look);
  };
  const look = () => {
    if (!on) return;
    const now = performance.now();
    if (video.readyState >= 2 && video.currentTime !== lastT && due(now, lastRun, fps)) {
      lastT = video.currentTime;
      lastRun = now;
      try {
        const r = landmarker.detectForVideo(video, now);
        onHands({ world: r.worldLandmarks ?? [], image: r.landmarks ?? [], handed: handedOf(r, handedSwap) });
      } catch (e) { console.warn('[jieyin]', e); }
    }
    next();
  };
  const halt = () => {
    on = false;
    if (video.cancelVideoFrameCallback && frame) video.cancelVideoFrameCallback(frame);
    else if (frame) env.cancelAnimationFrame?.(frame);
    frame = 0;
    stopTracks(video);
  };
  let ask = 0, closed = false; // a pause or close while the camera is still being asked for wins over that start
  return {
    async start() {
      if (on || closed) return;
      const mine = ++ask;
      // Both at once, both settled before going on: a camera that opens after the model failed is still shut.
      const [m, cam] = await Promise.allSettled([loadModel().then((lm) => handsFor(lm, numHands, env)), camera(video, env, { width, height })]);
      if (m.status === 'rejected' || cam.status === 'rejected' || mine !== ask || closed) {
        const own = cam.value; // only this start's stream: a newer start may own the video by now
        for (const t of own?.getTracks?.() ?? []) t.stop();
        if (own && video.srcObject === own) video.srcObject = null;
        if (cam.status === 'rejected') throw cam.reason;
        if (m.status === 'rejected') throw m.reason?.reason ? m.reason : fail('model', m.reason);
        return;
      }
      landmarker = m.value;
      on = true;
      next();
    },
    pause() { ask++; halt(); },
    close() { closed = true; ask++; halt(); onHands = () => {}; },
    /** The model's rate from now on (a game asks for more only while a quick move is armed: 守墙关's 小招). */
    setFps(n) { if (n > 0) fps = n; },
  };
}
