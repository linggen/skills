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

bootstrapServices();

const container = getServiceContainer();
const mobileSettings = container.resolve<IMobileSettingsProvider>(ServiceTokens.MOBILE_SETTINGS);
const mobileManager = MobileManager.getInstance();
mobileManager.setSettingsProvider(mobileSettings);
const isMobile = mobileManager.isMobile();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1920,
  height: 1080,
  parent: "game-container",
  backgroundColor: "#87CEEB",
  fps: {
    target: 60,
    forceSetTimeOut: false,
  },
  input: {
    activePointers: 3,
  },
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
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
    width: 1920,
    height: 1080,
  },
  scene: [
    BootScene,
    TransitionScene,
    MenuScene,
    LevelSelectScene,
    ParallaxScene,
    GameScene,
    UIScene,
  ],
};

const game = new Phaser.Game(config);

if (mobileManager.isMobile()) {
  const requestFullscreenOnce = () => {
    mobileManager.requestFullscreen();
    game.canvas.removeEventListener("touchstart", requestFullscreenOnce);
    game.canvas.removeEventListener("click", requestFullscreenOnce);
  };

  game.canvas.addEventListener("touchstart", requestFullscreenOnce, { once: true });
  game.canvas.addEventListener("click", requestFullscreenOnce, { once: true });
  mobileManager.setupSwipeFullscreen(game.canvas);
}

mobileManager.onScaleRefresh(() => {
  game.scale.refresh();
});

export default game;
