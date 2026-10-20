// targets.ts — 砸寨: what a story throw is aimed at, when it is not the weasel gang (data/throws.ts `target`). Each is an
// upstream Pig (its body, its damage by impact, its poof, the win when it is gone) with its own painting and a
// behaviour on top:
//   deer  the stag grazing (射鹿). A throw passing or landing near it (`spook`) and it lifts its head, then bolts off to
//         the right and out of sight; a while later it comes back to the next spot, wary, head up, and grazes again.
//         What comes down on it (the dead tree, the log) fells it as well as an arrow does.
//   gourd 邹青松 in the dark of the dry river (暗河): nothing to aim at until a stone lands in the dark — then he pulls
//         the stopper of his red-copper gourd and its light shows the gourd and the two fingers on the stopper, until
//         the next arrow strikes something (or `open` ms pass); an arrow there knocks it out of his hand. Anywhere
//         else it rings off his shield, and he stoppers it again: another stone.
//   lu    the 鯥 pinned in the brambles (芦苇里那一等), charging the torch with its back to the reeds. Its hide turns
//         every blow and every blast; once a breath (`every`) its wings lift and the wing root on its back shows soft
//         pink flesh for `open` ms — a blow landing there, then, goes in. Struck on the hide, it fights: it breathes
//         faster after, and the window is shorter.
// A behaviour only reads the world and moves its own body; the game's own rules count the kill.
import Phaser from "phaser";
import Matter from "matter-js";
import type { Pig, PigLook } from "../objects/Pig";
import type { TargetSpec } from "../data/levels";
import { gameEvents, SubscriptionGroup } from "../events/EventBus";
import type { Bird } from "../objects/Bird";
import { Runtime } from "./runtime";
import { SHADE_DEPTH } from "./props";

/** A target's state, for the bot's eyes (zhazhai/bot.ts) and the page's checks. */
export interface TargetView {
  kind: TargetSpec["kind"];
  x: number;
  y: number;
  state: string;
  /** The last blow it took: where, and whether it went in (the bot's debugging and the tests' eyes). */
  blow?: { x: number; y: number; open: boolean; went: boolean };
  /** The 鯥: its wing root shows now. */
  open?: boolean;
  /** The 鯥: ms until the next breath opens it (the one after this, while it shows), and the window's length. */
  nextOpen?: number;
  openFor?: number;
  every?: number;
  /** Where a blow must land (world): a spot (the 鯥's wing root), or the body's box (the stag). */
  aim?: { x: number; y: number; r: number; box?: { x0: number; y0: number; x1: number; y1: number } };
  away?: boolean;
  /** Its body (world). */
  body?: { x0: number; y0: number; x1: number; y1: number };
}

const views = new WeakMap<Pig, () => TargetView>();
export const viewOf = (pig: Pig): TargetView | null => views.get(pig)?.() ?? null;

// The paintings' bodies (units): a stag is long and leggy, a 鯥 a little smaller than an ox.
const DEER = { w: 210, h: 150, draw: 300, health: 40 };
const LU = { w: 330, h: 190, draw: 470, health: 30 };
const ZOU = { w: 220, h: 250, draw: 250, health: 20 };

export function lookOf(spec: TargetSpec): PigLook {
  if (spec.kind === "still") return { texture: `zz:${spec.art}`, width: spec.w, height: spec.h, shape: "rect", health: spec.health, density: 0.002, label: `pig-${spec.art}` };
  if (spec.kind === "deer") return { texture: "zz:deer-graze", width: DEER.w, height: DEER.h, shape: "rect", health: DEER.health, density: 0.003, label: "pig-deer" };
  if (spec.kind === "gourd") return { texture: "zz:zou", width: ZOU.w, height: ZOU.h, shape: "rect", health: ZOU.health, pinned: true, label: "pig-zou" };
  return { texture: "zz:lu-shut", width: LU.w, height: LU.h, shape: "rect", health: LU.health, pinned: true, label: "pig-lu" };
}

/** The target's painting: an image of its own riding on the body (a Matter image's scale is its body's scale, so the
    body keeps its size and the painting is drawn beside it), standing on the body's foot. Every pose of one target at
    one scale: the first pose's width is drawn `draw` units wide (the poses are cut from one canvas). */
function dresser(img: Phaser.Physics.Matter.Image, first: string, draw: number, bodyH: number, flip = false) {
  const scene = img.scene;
  const s = draw / (scene.textures.get(`zz-${first}`).getSourceImage().width || draw);
  img.setAlpha(0);
  const art = scene.add.image(img.x, img.y, `zz-${first}`).setDepth(img.depth).setFlipX(flip);
  const pose = (key: string) => {
    art.setTexture(`zz-${key}`);
    art.setScale(s);
    art.setOrigin(0.5, 1 - bodyH / 2 / (art.height * s));
  };
  const follow = () => {
    if (!img.active || !img.body) {
      scene.events.off("update", follow);
      scene.tweens.add({ targets: art, alpha: 0, duration: 180, onComplete: () => art.destroy() });
      return;
    }
    art.setPosition(img.x, img.y);
  };
  scene.events.on("update", follow);
  scene.events.once("shutdown", () => { scene.events.off("update", follow); if (art.active) art.destroy(); });
  return { pose, art };
}

export function attachTarget(scene: Phaser.Scene, pig: Pig, spec: TargetSpec): void {
  if (spec.kind === "still") still(pig, spec);
  else if (spec.kind === "deer") deer(scene, pig, spec);
  else if (spec.kind === "gourd") gourd(scene, pig, spec);
  else lu(scene, pig, spec);
}

/** Every frame while the scene and the target live, `dt` in the world's own time: a slow-motion moment (CameraEffects
    sets the engine's timeScale) slows a breath or a run as it slows a throw, so what is timed against a flight stays true. */
function everyFrame(scene: Phaser.Scene, pig: Pig, fn: (dt: number) => void, subs = new SubscriptionGroup()): () => void {
  const engine = (scene as Phaser.Scene & { matter?: { world?: { engine?: { timing: { timeScale: number } } } } }).matter?.world?.engine;
  const tick = (_t: number, dt: number) => {
    if (pig.isDestroyed() || !pig.getMatterImage()?.body) return stop();
    fn(dt * (engine?.timing.timeScale ?? 1));
  };
  const stop = () => {
    scene.events.off("update", tick);
    subs.disposeAll();
  };
  scene.events.on("update", tick);
  scene.events.once("shutdown", stop);
  return stop;
}

/** A thing that stands and takes the blow: no behaviour, its painting on its body (it topples as the body does). */
function still(pig: Pig, spec: Extract<TargetSpec, { kind: "still" }>): void {
  const img = pig.getMatterImage();
  if (!img) return;
  dresser(img, spec.art, spec.draw, spec.h).pose(spec.art); // drawn `draw` wide, its foot on the body's
  const box = () => ({ x0: img.x - spec.w / 2, y0: img.y - spec.h / 2, x1: img.x + spec.w / 2, y1: img.y + spec.h / 2 });
  views.set(pig, () => ({ kind: "still", x: img.x, y: img.y, state: "standing", aim: { x: img.x, y: img.y, r: Math.min(spec.w, spec.h) / 2, box: box() }, body: box() }));
}

function deer(scene: Phaser.Scene, pig: Pig, spec: Extract<TargetSpec, { kind: "deer" }>): void {
  const img = pig.getMatterImage();
  if (!img) return;
  const body = img.body as Matter.Body;
  // graze → (a thud near it) wary: head up a while → graze; (a throw whizzing past) alert → bolt → away → wary at the next spot.
  let state: "graze" | "wary" | "alert" | "bolt" | "away" = "graze";
  let clock = 0;
  let spot = 0;
  let near = Infinity; // the flying throw's nearest pass so far
  let flying: Bird | null = null;
  const { pose, art } = dresser(img, "deer-graze", DEER.draw, DEER.h);
  pose("deer-graze");
  const dist = (x: number, y: number) => Math.hypot(x - img.x, y - img.y);
  const to = (next: typeof state, key?: string) => {
    state = next;
    clock = 0;
    if (key) pose(key);
  };

  const subs = new SubscriptionGroup();
  subs.add(gameEvents.subscribe("birdLaunched", ({ bird }) => { flying = bird; near = Infinity; }));
  // A throw striking something near it (not it): the thud lifts its head.
  subs.add(gameEvents.subscribe("birdCollision", ({ x, y, target }) => {
    if (pig.isDestroyed() || !img.body) return;
    if (target !== "pig-deer" && state === "graze" && dist(x, y) < spec.spook * 1.6) to("wary", "deer-look");
  }));

  views.set(pig, () => ({ kind: "deer", x: img.x, y: img.y, state, away: state === "bolt" || state === "away",
    aim: { x: img.x, y: img.y, r: DEER.h / 2, box: { x0: img.x - DEER.w / 2, y0: img.y - DEER.h / 2, x1: img.x + DEER.w / 2, y1: img.y + DEER.h / 2 } } }));

  everyFrame(scene, pig, (dt) => {
    clock += dt;
    // A throw flying past it: the nearest it came, judged once it is going away again — a whizz by its ear and it runs.
    if (flying && !flying.isDestroyed() && flying.isLaunched()) {
      const p = flying.getPosition();
      const d = dist(p.x, p.y);
      if (d < near) near = d;
      else if (near < spec.spook && d > near + 40 && (state === "graze" || state === "wary")) {
        to("alert", "deer-look");
        flying = null;
      }
    } else flying = null;

    if (state === "alert" && clock > spec.alert) {
      to("bolt", "deer-bolt");
      img.setStatic(true);
      body.isSensor = true;
      scene.tweens.add({ targets: img, x: img.x + 900, duration: Runtime.reducedMotion ? 1 : 750, ease: "Quad.In" });
      scene.tweens.add({ targets: art, alpha: 0, duration: Runtime.reducedMotion ? 1 : 750, ease: "Quad.In" });
    } else if (state === "bolt" && clock > 800) {
      to("away");
    } else if (state === "away" && clock > spec.away) {
      to("wary", "deer-look");
      scene.tweens.killTweensOf([img, art]);
      img.setPosition(spec.spots[spot++ % spec.spots.length], img.y);
      scene.tweens.add({ targets: art, alpha: 1, duration: Runtime.reducedMotion ? 1 : 400 });
      body.isSensor = false;
      img.setStatic(false);
      img.setFixedRotation();
    } else if (state === "wary" && clock > 2600) {
      to("graze", "deer-graze");
    }
  }, subs);
}

function lu(scene: Phaser.Scene, pig: Pig, spec: Extract<TargetSpec, { kind: "lu" }>): void {
  const img = pig.getMatterImage();
  if (!img) return;
  let every = spec.every, open = spec.open;
  let clock = 0;
  let isOpen = false;
  const shut = "lu-shut", wide = "lu-open";
  // Painted facing left; on the shoal it faces right, charging the torch and the board, its back to the reeds.
  const { pose, art } = dresser(img, shut, LU.draw, LU.h, true);
  pose(shut);
  // The wing root (it faces left): a soft pink glow while it shows, so the moment reads at a glance.
  const root = () => ({ x: img.x + spec.root.dx, y: img.y + spec.root.dy });
  const glow = scene.add.circle(root().x, root().y, spec.root.r, 0xff7aa8, 0).setDepth(img.depth + 1).setBlendMode(Phaser.BlendModes.ADD);

  let blow: TargetView["blow"];
  pig.guard = (at) => {
    if (at) blow = { x: Math.round(at.x), y: Math.round(at.y), open: isOpen, went: false };
    if (at && isOpen) {
      const r = root();
      // The striking thing's middle, so its own size reaches past the spot's edge.
      if (Math.hypot(at.x - r.x, at.y - r.y) <= spec.root.r + 40) return (blow!.went = true);
    }
    // The hide turns it: it fights the brambles, and breathes faster after.
    if (at) {
      every = spec.struggle.every;
      open = spec.struggle.open;
      // A flinch: it flashes (never a nudge — the body is pinned, a tween on it would walk it off its spot).
      art.setTintFill(0xffffff);
      scene.time.delayedCall(Runtime.reducedMotion ? 60 : 90, () => art.active && art.clearTint());
      const spark = scene.add.star(at.x, at.y, 6, 8, 26, 0xfff4c0).setDepth(img.depth + 2);
      scene.tweens.add({ targets: spark, scale: 1.8, alpha: 0, duration: 260, onComplete: () => spark.destroy() });
    }
    return false;
  };

  views.set(pig, () => {
    const phase = clock % every, opensAt = every - open;
    return { kind: "lu", x: img.x, y: img.y, state: isOpen ? "open" : "shut", open: isOpen,
      nextOpen: isOpen ? every - phase + opensAt : opensAt - phase, openFor: open, every, aim: { ...root(), r: spec.root.r }, blow,
      body: { x0: img.x - LU.w / 2, y0: img.y - LU.h / 2, x1: img.x + LU.w / 2, y1: img.y + LU.h / 2 } };
  });

  everyFrame(scene, pig, (dt) => {
    clock += dt;
    const was = isOpen;
    isOpen = clock % every >= every - open;
    if (isOpen !== was) {
      pose(isOpen ? wide : shut);
      scene.tweens.killTweensOf(glow);
      scene.tweens.add({ targets: glow, fillAlpha: isOpen ? 0.55 : 0, duration: isOpen ? 120 : 200 });
    }
    glow.setPosition(root().x, root().y);
  });
  // Gone (felled): its glow with it.
  scene.events.on("update", function fade(this: void) {
    if (!pig.isDestroyed()) return;
    scene.events.off("update", fade);
    glow.destroy();
  });
  scene.events.once("shutdown", () => glow.active && glow.destroy());
}

function gourd(scene: Phaser.Scene, pig: Pig, spec: Extract<TargetSpec, { kind: "gourd" }>): void {
  const img = pig.getMatterImage();
  if (!img) return;
  const { pose, art } = dresser(img, "zou", ZOU.draw, ZOU.h);
  pose("zou");
  const DARK = 0x262c44;
  art.setTint(DARK);
  // dark → (a stone lands) waiting `delay` → lit `open` ms → dark again.
  let state: "dark" | "stirred" | "lit" = "dark";
  let clock = 0;
  const root = () => ({ x: img.x + spec.root.dx, y: img.y + spec.root.dy });
  // Drawn over the dark (props.ts shadePlace): the one light in it.
  const glow = scene.add.circle(root().x, root().y, spec.root.r * 3, 0xff5a2a, 0).setDepth(SHADE_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
  const core = scene.add.circle(root().x, root().y, spec.root.r * 1.1, 0xffc070, 0).setDepth(SHADE_DEPTH + 2).setBlendMode(Phaser.BlendModes.ADD);
  const light = (on: boolean) => {
    state = on ? "lit" : "dark";
    clock = 0;
    if (on) art.clearTint();
    else art.setTint(DARK);
    scene.tweens.killTweensOf([glow, core]);
    scene.tweens.add({ targets: glow, fillAlpha: on ? 0.5 : 0, duration: on ? 140 : 260 });
    scene.tweens.add({ targets: core, fillAlpha: on ? 0.85 : 0, duration: on ? 140 : 260 });
  };
  let blow: TargetView["blow"];
  pig.guard = (at) => {
    if (at) blow = { x: Math.round(at.x), y: Math.round(at.y), open: state === "lit", went: false };
    if (at && state === "lit") {
      const r = root();
      if (Math.hypot(at.x - r.x, at.y - r.y) <= spec.root.r + 20) return (blow!.went = true);
    }
    if (at) {
      // 「当」: off the red-copper shield, a spark in the dark.
      const spark = scene.add.star(at.x, at.y, 6, 8, 26, 0xffd9a0).setDepth(img.depth + 3);
      scene.tweens.add({ targets: spark, scale: 1.8, alpha: 0, duration: 260, onComplete: () => spark.destroy() });
    }
    return false;
  };
  const subs = new SubscriptionGroup();
  // A stone in the dark (any thud of one): he opens the gourd toward it.
  let ending = -1; // ms left of the light once an arrow has struck
  subs.add(gameEvents.subscribe("birdCollision", ({ bird }) => {
    if (pig.isDestroyed() || !img.body) return;
    if (bird.type === "red" && state === "dark") { state = "stirred"; clock = 0; }
    // An arrow struck anything (not home): he stoppers it again a breath later.
    else if (bird.type === "arrow" && state === "lit" && ending < 0) ending = 350;
  }));
  views.set(pig, () => ({ kind: "gourd", x: img.x, y: img.y, state, open: state === "lit",
    openFor: state === "lit" ? spec.open - clock : spec.open, aim: { ...root(), r: spec.root.r }, blow,
    body: { x0: img.x - ZOU.w / 2, y0: img.y - ZOU.h / 2, x1: img.x + ZOU.w / 2, y1: img.y + ZOU.h / 2 } }));
  everyFrame(scene, pig, (dt) => {
    clock += dt;
    if (state === "stirred" && clock > spec.delay) light(true);
    else if (state === "lit" && (clock > spec.open || (ending >= 0 && (ending -= dt) <= 0))) { ending = -1; light(false); }
    const r = root();
    glow.setPosition(r.x, r.y);
    core.setPosition(r.x, r.y);
  }, subs);
  scene.events.on("update", function out(this: void) {
    if (!pig.isDestroyed()) return;
    scene.events.off("update", out);
    glow.destroy();
    core.destroy();
  });
  scene.events.once("shutdown", () => { if (glow.active) glow.destroy(); if (core.active) core.destroy(); });
}
