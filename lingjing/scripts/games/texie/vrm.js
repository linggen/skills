// vrm.js — 施法特写's 3D close-up (a TEST for Hanli's choice, 游戏厅 only — 10-14 「游戏里不需要3D模型」 still stands for
// the game): Yinyue's VRM as a stand-in for 小满 (Hanli 10-21: 「用yinyue的3D模型试一下」), upper body from her right
// side, three-quarter, her fingers bent live from the player's (texie/fingers.js), the forearm and wrist following
// the hand, a push thrusting the arm forward.
//
// The model is the ENGINE's (its pet stage's ui/public/yinyue.vrm), loaded at run time from the page's own origin
// (`/yinyue.vrm` on 9527) and never copied here: its VRM licence says no redistribution, no modification
// (allowRedistribution false, modification prohibited, avatarPermission onlyAuthor; authors "Linggen", an in-house
// VRoid model). three.js + three-vrm: the one vendored bundle, scripts/vendor/three-vrm-0.176.0-3.5.4.min.mjs
// (VENDOR.md), the pair the engine itself uses. Toon: the model's own MToon materials (their outlines included).
//
//   const view = await vrmView(container, { url?, onProgress? })   rejects when WebGL or the model fails
//   view.update({ world, image, handed })   eye.js's hands (world: 21 metric points each)
//   view.thrust()                           a push / a cast: the arm drives forward
//   view.pause() · view.resume()            stop / start drawing (the page hidden, the game paused)
//   view.destroy()                          everything let go (the GL context too)
//   view.el.dataset.fps                     frames drawn a second (a dev readout; the live check reads it)

import { curlsOf, fingerTurns, handTurn, sideOf } from './fingers.js';

const BUNDLE = new URL('../../vendor/three-vrm-0.176.0-3.5.4.min.mjs', import.meta.url).href;
export const MODEL_PATH = '/yinyue.vrm';

// The arm's rest pose (rig frame: +Z her front, +X her left, +Y up), right hand; the left mirrors x.
const POSE = {
  upper: [-0.32, -0.8, 0.5], // the upper arm: down, a little out and forward
  fore: [0.3, 0.42, 0.86], // the forearm: forward and up, the hand before the chest
  restUpper: [-0.15, -0.95, 0.2], // no hand seen: the arm down,
  restFore: [0.2, -0.25, 0.95], // the forearm forward at the waist
  thrustUpper: [-0.12, 0.05, 1], // a push: the whole arm out forward
  thrustFore: [-0.02, 0.08, 1],
  idleCurl: 0.25, // a relaxed hand's bend at every joint
  follow: 0.35, // how much the forearm leans with the hand's own direction
  twist: 0.55, // how much of the hand's roll the forearm takes
};
const THRUST = { up: 110, hold: 150, down: 300 };
const envelope = (t) => (t < 0 ? 0 : t < THRUST.up ? t / THRUST.up : t < THRUST.up + THRUST.hold ? 1 : Math.max(0, 1 - (t - THRUST.up - THRUST.hold) / THRUST.down));

export async function vrmView(container, { url = MODEL_PATH, onProgress } = {}) {
  const T = await import(BUNDLE);
  const doc = container.ownerDocument, win = doc.defaultView ?? globalThis;
  const el = doc.createElement('div');
  el.className = 'tx-view tx-vrm';
  const canvas = doc.createElement('canvas');
  el.append(canvas);
  container.append(el);

  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(2, win.devicePixelRatio || 1));
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(26, 4 / 3, 0.05, 20);
  const sun = new T.DirectionalLight(0xffffff, 1.2); // the engine's pet stage's light (PetStage.ts)
  sun.position.set(-1, 2, 1.5);
  scene.add(sun, new T.AmbientLight(0xffffff, 1.6));

  const loader = new T.GLTFLoader();
  loader.register((parser) => new T.VRMLoaderPlugin(parser));
  let gltf;
  try {
    gltf = await loader.loadAsync(new URL(url, win.location.origin).href, (e) => onProgress?.(e.total ? e.loaded / e.total : 0));
  } catch (e) {
    renderer.dispose();
    el.remove();
    throw e;
  }
  const vrm = gltf.userData.vrm;
  T.VRMUtils.removeUnnecessaryVertices(gltf.scene);
  T.VRMUtils.combineSkeletons?.(gltf.scene);
  vrm.scene.traverse((o) => { o.frustumCulled = false; });
  scene.add(vrm.scene);
  el.dataset.outline = String(countOutlines(vrm.scene));

  const bone = (n) => vrm.humanoid.getNormalizedBoneNode(n);
  // Frame the upper body from her right, three-quarter: she faces the panel's right, as 小满 does in the ink version.
  vrm.scene.updateMatrixWorld(true);
  const chest = new T.Vector3();
  (bone('upperChest') ?? bone('chest')).getWorldPosition(chest);
  const head = new T.Vector3();
  bone('head').getWorldPosition(head);
  const look = new T.Vector3(chest.x, (chest.y + head.y) / 2 + 0.02, chest.z + 0.24);
  camera.position.set(look.x - 1.35, look.y + 0.1, look.z + 0.7);
  camera.lookAt(look);

  const V = (a) => new T.Vector3(...a).normalize();
  const mirrorX = (a) => [-a[0], a[1], a[2]];
  const restDir = { right: new T.Vector3(-1, 0, 0), left: new T.Vector3(1, 0, 0) };
  const sides = ['right', 'left'];
  const P = (side) => (side === 'left' ? 'left' : 'right');
  const st = Object.fromEntries(sides.map((s) => [s, { hand: null, curls: null, turn: new T.Quaternion(), has: false, up: 0, eul: {} }]));
  let thrustAt = -Infinity;

  const q1 = new T.Quaternion(), q2 = new T.Quaternion(), qp = new T.Quaternion(), qw = new T.Quaternion();
  const setWorld = (node, world) => {
    node.parent.getWorldQuaternion(qp);
    node.quaternion.copy(qp.invert().multiply(world));
    node.updateMatrixWorld(true);
  };
  const lerpDir = (a, b, k) => a.clone().multiplyScalar(1 - k).add(b.clone().multiplyScalar(k)).normalize();

  function poseArm(side, k, now) {
    const s = st[side], m = side === 'left' ? mirrorX : (a) => a, rest = restDir[side];
    // Raised while its hand is seen, lowered when not (eased: `s.up` 0…1).
    s.up += ((s.has ? 1 : 0) - s.up) * 0.15;
    let up = lerpDir(V(m(POSE.restUpper)), V(m(POSE.upper)), s.up), fore = lerpDir(V(m(POSE.restFore)), V(m(POSE.fore)), s.up);
    if (s.has) fore = lerpDir(fore, new T.Vector3(...liveDir(s.hand)), POSE.follow);
    up = lerpDir(up, V(m(POSE.thrustUpper)), k);
    fore = lerpDir(fore, V(m(POSE.thrustFore)), k);
    const qUp = new T.Quaternion().setFromUnitVectors(rest, up);
    setWorld(bone(`${P(side)}UpperArm`), qUp);
    // The forearm: pointed along `fore`, rolled by part of the hand's own roll (swing–twist about the bone).
    const qFore = new T.Quaternion().setFromUnitVectors(rest, fore);
    const handW = s.has ? s.turn : qFore;
    q1.copy(qFore).invert().multiply(handW); // the hand in the forearm's frame
    q2.set(q1.x, 0, 0, q1.w).normalize(); // its twist about the bone (the rig's x)
    qw.identity().slerp(q2, POSE.twist);
    const foreW = qFore.clone().multiply(qw);
    setWorld(bone(`${P(side)}LowerArm`), foreW);
    setWorld(bone(`${P(side)}Hand`), handW);
    // The fingers, eased toward the live bends (a relaxed hand when none).
    const want = fingerTurns(s.curls ?? idleCurls(), side);
    for (const [name, [x, y, z]] of Object.entries(want)) {
      const n = bone(name);
      if (!n) continue;
      const e = s.eul[name] ?? (s.eul[name] = [0, 0, 0]);
      e[0] += (x - e[0]) * 0.5; e[1] += (y - e[1]) * 0.5; e[2] += (z - e[2]) * 0.5;
      n.rotation.set(e[0], e[1], e[2]);
    }
  }

  let raf = 0, last = 0, fps = 0, on = true;
  const frame = (t) => {
    raf = win.requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 1 / 60;
    if (last) fps = fps ? fps * 0.92 + (1000 / Math.max(1, t - last)) * 0.08 : 60;
    last = t;
    const k = envelope(t - thrustAt);
    for (const side of sides) poseArm(side, k, t);
    vrm.update(dt);
    renderer.render(scene, camera);
    el.dataset.fps = fps.toFixed(0);
  };
  const size = () => {
    const w = el.clientWidth || 320, h = el.clientHeight || 240;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = win.ResizeObserver ? new win.ResizeObserver(size) : null;
  ro?.observe(el);
  size();
  raf = win.requestAnimationFrame(frame);

  return {
    el,
    update({ world = [], image = [], handed = [] } = {}) {
      const seen = { right: false, left: false };
      world.forEach((hand, i) => {
        if (!hand || hand.length < 21) return;
        const side = sideOf(handed[i], image[i]);
        if (seen[side]) return; // two hands read as one side: the first only
        seen[side] = true;
        const s = st[side];
        s.hand = hand;
        s.curls = curlsOf(hand);
        const [x, y, z, w] = handTurn(hand, side);
        q1.set(x, y, z, w);
        if (s.has) s.turn.slerp(q1, 0.5); else s.turn.copy(q1);
        s.has = true;
      });
      for (const side of sides) if (!seen[side]) { st[side].has = false; st[side].curls = null; }
    },
    thrust() { thrustAt = win.performance.now(); },
    pause() { if (on) { on = false; win.cancelAnimationFrame(raf); last = 0; } },
    resume() { if (!on) { on = true; raf = win.requestAnimationFrame(frame); } },
    destroy() {
      on = false;
      win.cancelAnimationFrame(raf);
      ro?.disconnect();
      scene.remove(vrm.scene);
      T.VRMUtils.deepDispose(vrm.scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      el.remove();
    },
  };
}

const idleCurls = () => Object.fromEntries(['thumb', 'index', 'middle', 'ring', 'little'].map((f) => [f, [POSE.idleCurl, POSE.idleCurl, POSE.idleCurl]]));

/** The hand's own direction (wrist → middle root) in the rig's frame. */
function liveDir(hand) {
  const d = [hand[9].x - hand[0].x, -(hand[9].y - hand[0].y), -((hand[9].z ?? 0) - (hand[0].z ?? 0))];
  const n = Math.hypot(...d) || 1;
  return d.map((v) => v / n);
}

/** How many of the model's materials draw an outline (MToon's own). */
function countOutlines(root) {
  let n = 0;
  root.traverse((o) => { for (const m of [o.material].flat()) if (m?.isOutline || (m?.outlineWidthFactor ?? 0) > 0) n++; });
  return n;
}
