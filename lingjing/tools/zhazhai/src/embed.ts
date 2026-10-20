// embed.ts — 砸寨's entry: the game in a host element, not the whole page (main.ts, upstream's, is kept for reference).
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { LevelSelectScene } from "./scenes/LevelSelectScene";
import { ParallaxScene } from "./scenes/ParallaxScene";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";
import { TransitionScene } from "./scenes/TransitionScene";
import { bootstrapServices, getServiceContainer, ServiceTokens } from "./config/bootstrap";
import { WORLD_CONFIG } from "./config/PhysicsConfig";
import { MobileManager } from "./systems/mobile";
import type { IMobileSettingsProvider } from "./interfaces/IMobileSettings";
import { Runtime, type Lang, type LevelResult } from "./zhazhai/runtime";
import { LEVELS, LEVEL_WORDS } from "./data/levels";
import { gameEvents } from "./events/EventBus";

/** The forts, for the host (their count, names and shots). */
export const levels = () => LEVELS.map((l) => ({ id: l.levelId, birds: l.birds.map((b) => b.type), pigs: l.pigs.length, blocks: l.structures.length, words: LEVEL_WORDS[l.levelId] }));

let booted = false;

export interface StartOptions {
  parent: HTMLElement;
  /** Where the assets live (the bundle's own folder). */
  base: string;
  lang?: Lang;
  /** Open straight into this fort (1…); 0: the title screen and the level select. */
  level?: number;
  onResult?: (r: LevelResult) => void;
  onLeave?: () => void;
  /** 砸寨: reduced motion (default: the system's prefers-reduced-motion). */
  reducedMotion?: boolean;
}

export function start({ parent, base, lang = "zh", level = 0, onResult, onLeave, reducedMotion }: StartOptions): Phaser.Game {
  // One game a page at a time, but the event bus is module-wide: a game taken down (the arcade's 再来) must not
  // leave its scenes listening, or the next game's first event reaches a dead HUD.
  gameEvents.removeAllListeners();
  Runtime.lang = lang;
  Runtime.directLevel = LEVELS.some((l) => l.levelId === level) ? level : 0;
  Runtime.onResult = onResult ?? (() => {});
  Runtime.onLeave = onLeave ?? (() => {});
  Runtime.reducedMotion = reducedMotion ?? Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  if (!booted) {
    bootstrapServices();
    const mobileSettings = getServiceContainer().resolve<IMobileSettingsProvider>(ServiceTokens.MOBILE_SETTINGS);
    MobileManager.getInstance().setSettingsProvider(mobileSettings);
    booted = true;
  }
  const isMobile = MobileManager.getInstance().isMobile();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: 1920,
    height: 1080,
    parent,
    backgroundColor: "#87CEEB",
    loader: { baseURL: base },
    fps: { target: 60, forceSetTimeOut: false },
    input: { activePointers: 3 },
    render: {
      antialias: true,
      antialiasGL: !isMobile,
      powerPreference: isMobile ? "default" : "high-performance",
      roundPixels: true,
    },
    physics: {
      default: "matter",
      matter: {
        gravity: WORLD_CONFIG.gravity,
        debug: false,
        enableSleeping: WORLD_CONFIG.enableSleeping,
        positionIterations: WORLD_CONFIG.positionIterations,
        velocityIterations: WORLD_CONFIG.velocityIterations,
        constraintIterations: WORLD_CONFIG.constraintIterations,
      },
    },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, autoRound: true, width: 1920, height: 1080 },
    scene: [BootScene, TransitionScene, MenuScene, LevelSelectScene, ParallaxScene, GameScene, UIScene],
  });
  game.events.once(Phaser.Core.Events.DESTROY, () => gameEvents.removeAllListeners());
  // A handle for the page's checks (tools, screenshots): the host element's `zhazhaiGame`.
  (parent as HTMLElement & { zhazhaiGame?: Phaser.Game }).zhazhaiGame = game;
  return game;
}
