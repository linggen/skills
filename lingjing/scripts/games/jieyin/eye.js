// eye.js — the camera and the hand-landmark model, for any game that wants hand seals (结印 in the 游戏厅 today;
// 守墙关's helper and 古六's 讲堂 level if they come). All on the device: MediaPipe's Hand Landmarker, vendored under
// scripts/vendor/mediapipe/ (VENDOR.md) — the model, the WASM and the bundle load from there, nothing from the
// network, and no frame leaves the page.
//
//   available()          → may 结印 be offered at all? (a camera API, a camera, WebGL). No → offer nothing: the host
//                          plays as it does without it — no button, no tap stand-in (Hanli 10-21: 「没摄像头时, 就不用」).
//   loadModel()          → the landmarker, loaded once (start it early: it is ~19 MB from disk).
//   openEye({ video, onHands }) → { start(), pause(), close() }
//                          start() asks for the camera (only now — call it on the player's 开始) and runs the model on
//                          each new video frame: onHands({ world, image }) — world: hands as 21 metric points for the
//                          judge (judge.js); image: the same hands, 0…1 of the frame, for drawing. pause() stops the
//                          camera (its tracks, so the light goes off); start() again re-opens it. close() ends it all.
//                          start() rejects with an Error whose `reason` is 'denied' | 'nocamera' | 'model'.

const VENDOR = new URL('../../vendor/mediapipe/', import.meta.url);
const file = (name) => new URL(name, VENDOR).href;
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
    return Boolean(c?.getContext?.('webgl2') ?? c?.getContext?.('webgl'));
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
    return make('GPU').catch(() => make('CPU'));
  })();
  model.catch(() => { model = null; });
  return model;
}

/** Let the landmarker go (the page is leaving the game). */
export async function dropModel() {
  const m = model;
  model = null;
  try { (await m)?.close(); } catch { /* already gone */ }
}

async function camera(video, env) {
  let stream;
  try {
    stream = await env.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
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

export function openEye({ video, onHands, env = globalThis }) {
  let on = false, frame = 0, lastT = -1, landmarker = null;
  const next = () => {
    if (!on) return;
    frame = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(look) : env.requestAnimationFrame(look);
  };
  const look = () => {
    if (!on) return;
    if (video.readyState >= 2 && video.currentTime !== lastT) {
      lastT = video.currentTime;
      try {
        const r = landmarker.detectForVideo(video, performance.now());
        onHands({ world: r.worldLandmarks ?? [], image: r.landmarks ?? [] });
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
      const [m, cam] = await Promise.allSettled([loadModel(), camera(video, env)]);
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
  };
}
