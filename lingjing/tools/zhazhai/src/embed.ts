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
import { Runtime, type Lang, type LevelResult, type ShellHands } from "./zhazhai/runtime";
import { LEVELS, LEVEL_WORDS, levelIdOf } from "./data/levels";
import { botHandle } from "./zhazhai/bot";
import { gameEvents } from "./events/EventBus";
import { WINDOW_INPUT, ownWindowInput } from "./zhazhai/window-input";

/** The forts, for the host (their count, names and shots). */
export const levels = () => LEVELS.map((l) => ({ id: l.levelId, key: l.key ?? null, birds: l.birds.map((b) => b.type), pigs: l.pigs.length, blocks: l.structures.length, words: LEVEL_WORDS[l.levelId] }));

let booted = false;

export interface StartOptions {
  parent: HTMLElement;
  /** Where the assets live (the bundle's own folder). */
  base: string;
  lang?: Lang;
  /** Open straight into this level (a fort's number, or a story throw's key: `deer-wind`); 0: the title screen and the level select. */
  level?: number | string;
  onResult?: (r: LevelResult) => void;
  onLeave?: () => void;
  /** 砸寨: reduced motion (default: the system's prefers-reduced-motion). */
  reducedMotion?: boolean;
  /** The page's one shell (scripts/games/shell.js): its pause drives the play; no pause, title or result screen in the canvas. */
  shell?: ShellHands | null;
  /** In the shell: the line the level asked for opens with, on the shell's lead card over its field standing still. */
  lead?: string;
}

export function start({ parent, base, lang = "zh", level = 0, onResult, onLeave, reducedMotion, shell, lead }: StartOptions): Phaser.Game {
  // One game a page at a time, but the event bus is module-wide: a game taken down (the arcade's 再来) must not
  // leave its scenes listening, or the next game's first event reaches a dead HUD.
  gameEvents.removeAllListeners();
  Runtime.lang = lang;
  Runtime.directLevel = levelIdOf(level);
  Runtime.onResult = onResult ?? (() => {});
  Runtime.onLeave = onLeave ?? (() => {});
  Runtime.reducedMotion = reducedMotion ?? Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  Runtime.shell = shell ?? null;
  Runtime.leadLine = shell ? (lead ?? "") : "";
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
    audio: { noAudio: true }, // the shell plays its sounds (ShellSoundAdapter)
    input: { activePointers: 3, ...WINDOW_INPUT }, // the page's window, never the shell's (zhazhai/window-input.ts)
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
  ownWindowInput(game);
  game.events.once(Phaser.Core.Events.DESTROY, () => gameEvents.removeAllListeners());
  // A handle for the page's checks (tools, screenshots): the host element's `zhazhaiGame`.
  (parent as HTMLElement & { zhazhaiGame?: Phaser.Game }).zhazhaiGame = game;
  // 砸寨: the hands of tools/zhazhai/bot.mjs (the level tests): see the field and throw through the slingshot's own path.
  (parent as HTMLElement & { zhazhaiBot?: unknown }).zhazhaiBot = botHandle(game);
  // the 游戏厅 (dev=1) only: a live check reads the scenes from here (as 守墙关's __shouqiang)
  if (new URLSearchParams(globalThis.location?.search ?? "").get("dev") === "1") (globalThis as Record<string, unknown>).__zhazhai = game;
  return game;
}
