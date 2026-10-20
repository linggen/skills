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

let booted = false;

export interface StartOptions {
  parent: HTMLElement;
  /** Where the assets live (the bundle's own folder). */
  base: string;
}

export function start({ parent, base }: StartOptions): Phaser.Game {
  if (!booted) {
    bootstrapServices();
    const mobileSettings = getServiceContainer().resolve<IMobileSettingsProvider>(ServiceTokens.MOBILE_SETTINGS);
    MobileManager.getInstance().setSettingsProvider(mobileSettings);
    booted = true;
  }
  const isMobile = MobileManager.getInstance().isMobile();
  return new Phaser.Game({
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
}
