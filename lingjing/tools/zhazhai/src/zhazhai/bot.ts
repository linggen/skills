// bot.ts — 砸寨: the hands of tools/zhazhai/bot.mjs (the level tests), set on the host element as `zhazhaiBot`. They see
// what a player sees (where the targets stand, whether the 鯥's wing root shows, what is in the basket) and throw through
// the slingshot's own path: startAiming → updateAim (a pull back from the pouch) → the orchestrator's fire, and a tap is
// the same ability call a click in flight makes. `arc` is the flight a steady hand has learnt for a pull (the slingshot's
// own trajectory simulation, run longer than its dotted preview). Nothing here changes how the game plays.
import Phaser from "phaser";
import Matter from "matter-js";
import { SLINGSHOT_CONFIG, BIRD_PHYSICS } from "../config/PhysicsConfig";
import { SlingshotPhysicsConfig } from "../config/SlingshotRenderConfig";
import { getLevelById } from "../data/levels";
import { viewOf } from "./targets";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export function botHandle(game: Phaser.Game) {
  let sim: Matter.Engine | null = null; // one engine for every arc (a fresh one each time piles up)
  const scene = (): Any => {
    const s = game.scene.getScene("GameScene") as Any;
    return s && s.sys?.isActive() ? s : null;
  };
  const sling = () => scene()?.slingshot as Any;
  const rest = () => {
    const s = sling();
    return s ? s.getBirdRestPosition() : null;
  };
  /** The pointer a pull of `power` (0…1 of the full draw) at `angle` (degrees above the horizon, to the right) needs. */
  const pointerFor = (angle: number, power: number) => {
    const r = rest();
    const raw = SLINGSHOT_CONFIG.maxPull * Math.pow(Math.max(0.12, Math.min(1, power)), 1 / SlingshotPhysicsConfig.powerCurveExponent);
    const a = Phaser.Math.DegToRad(angle);
    return { x: r.x - raw * Math.cos(a), y: r.y + raw * Math.sin(a) };
  };
  const launchOf = (angle: number, power: number) => {
    const a = Phaser.Math.DegToRad(angle);
    const v = Math.max(0.12, Math.min(1, power)) * SLINGSHOT_CONFIG.maxPull * SLINGSHOT_CONFIG.velocityMultiplier;
    return { vx: v * Math.cos(a), vy: -v * Math.sin(a) };
  };

  return {
    /** What is on the field. */
    info() {
      const s = scene();
      if (!s) return { ready: false, playing: false };
      const gsm = s.gameStateManager;
      const pigs = s.entityManager.getPigs().filter((p: Any) => !p.isDestroyed());
      const level = getLevelById(s.level);
      const bird = s.birdLaunchOrchestrator.getCurrentBird();
      // What the next throw is: the thing in the pouch, else the basket's first.
      const loaded = bird && !bird.isLaunched() && !bird.isDestroyed() ? bird.type : s.birdQueueSystem?.getNextBird?.() ?? null;
      return {
        level: s.level,
        key: level?.key ?? null,
        bot: level?.bot ?? {},
        playing: !gsm.isGameOver(),
        won: gsm.getPigsRemaining?.() <= 0,
        ready: sling()?.getState?.() === "READY" && !s.cameraController.isIntroPanning(),
        birdsLeft: gsm.getBirdsRemaining?.() ?? 0,
        next: loaded,
        // How a pull flies: the world's pull down, the next thing's size and drag, the pull's numbers.
        physics: {
          gravity: { ...s.matter.world.engine.gravity },
          next: (BIRD_PHYSICS as Any)[loaded ?? "red"] ?? null,
          maxPull: SLINGSHOT_CONFIG.maxPull,
          velocity: SLINGSHOT_CONFIG.velocityMultiplier,
        },
        rest: rest(),
        flying: s.birdLaunchOrchestrator.hasActiveFlyingBird(),
        bird: bird && bird.isLaunched() && !bird.isDestroyed() ? { ...bird.getPosition(), vx: bird.getVelocity().x, vy: bird.getVelocity().y, type: bird.type } : null,
        canTap: s.birdLaunchOrchestrator.canActivateAbility(),
        targets: pigs.map((p: Any) => viewOf(p) ?? { kind: "weasel", ...p.getPosition(), state: "idle" }),
        blocks: s.entityManager.getBlocks().filter((b: Any) => !b.isDestroyed()).map((b: Any) => {
          const img = b.getMatterImage();
          const bb = img?.body?.bounds;
          return bb ? { x0: bb.min.x, y0: bb.min.y, x1: bb.max.x, y1: bb.max.y, fixed: b.fixed, material: b.getMaterial() } : null;
        }).filter(Boolean),
      };
    },
    /** Pull back and let go. */
    throw(angle: number, power: number): boolean {
      const s = scene(), sl = sling();
      if (!s || !sl || sl.getState() !== "READY") return false;
      const p = pointerFor(angle, power);
      sl.startAiming();
      sl.updateAim(p.x, p.y);
      s.birdLaunchOrchestrator.fireBird();
      return true;
    },
    /** A tap in flight (the thing's trick). */
    tap(): boolean {
      const s = scene();
      if (!s?.birdLaunchOrchestrator.canActivateAbility()) return false;
      s.birdLaunchOrchestrator.activateAbility();
      return true;
    },
    /** The flight of a pull, a point every frame for `frames` frames, from where the pull holds the thing. */
    arc(angle: number, power: number, type: string, frames = 240): { x: number; y: number }[] {
      const s = scene();
      if (!s) return [];
      const g = s.matter.world.engine.gravity;
      sim ??= Matter.Engine.create();
      const engine = sim;
      engine.gravity.x = g.x;
      engine.gravity.y = g.y;
      engine.gravity.scale = g.scale;
      const cfg = (BIRD_PHYSICS as Any)[type] ?? BIRD_PHYSICS.red;
      // From where the pull holds the thing: the pouch drawn back the (curved) pull's length.
      const r = rest(), a = Phaser.Math.DegToRad(angle), d = Math.max(0.12, Math.min(1, power)) * SLINGSHOT_CONFIG.maxPull;
      const body = Matter.Bodies.circle(r.x - d * Math.cos(a), r.y + d * Math.sin(a), cfg.radius, { frictionAir: cfg.frictionAir, density: cfg.density });
      Matter.World.add(engine.world, body);
      const { vx, vy } = launchOf(angle, power);
      Matter.Body.setVelocity(body, { x: vx, y: vy });
      const out = [];
      for (let i = 0; i < frames; i++) {
        Matter.Engine.update(engine, 1000 / 60);
        out.push({ x: body.position.x, y: body.position.y });
      }
      Matter.World.remove(engine.world, body);
      return out;
    },
  };
}
