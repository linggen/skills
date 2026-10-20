import Phaser from "phaser";
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "../config";
import {
  ParallaxSystem,
  ParallaxScrollEvent,
  ParallaxThemeEvent,
  ParallaxSceneInitData,
  normalizeScrollX,
} from "../features/parallax";
import { gameEvents, SubscriptionGroup } from "../events/EventBus";
import { ThemeType } from "../config/GameConfig";
import type { Position } from "../types/Vector2";

export { type ParallaxScrollEvent, type ParallaxThemeEvent, type ParallaxSceneInitData };

export class ParallaxScene extends Phaser.Scene {
  private parallaxSystem!: ParallaxSystem;
  private gameScene!: Phaser.Scene;
  private currentTheme: ThemeType = "forest";
  private currentScrollX: number = 0;
  private currentScrollY: number = 0;
  private currentZoom: number = 1;
  private isInitialized: boolean = false;
  private isDestroyed: boolean = false;
  private subscriptions: SubscriptionGroup;

  constructor() {
    super({ key: "ParallaxScene" });
    this.subscriptions = new SubscriptionGroup();
  }

  init(data: ParallaxSceneInitData): void {
    this.currentTheme = data?.theme || "forest";
    this.currentScrollX = 0;
    this.currentScrollY = 0;
    this.currentZoom = 1;
    this.isInitialized = false;
    this.isDestroyed = false;
  }

  create(): void {
    this.events.once("shutdown", this.shutdown, this);

    this.setupCamera();
    this.gameScene = this.scene.get("GameScene");
    this.setupEventListeners();
    this.createSystem();
  }

  private setupCamera(): void {
    const camera = this.cameras.main;
    camera.setZoom(1);
    camera.setScroll(0, 0);
    camera.setBounds(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, false);
  }

  private setupEventListeners(): void {
    if (!this.gameScene) return;

    this.subscriptions.add(gameEvents.subscribe("parallax:scroll", this.handleScroll, this));
    this.subscriptions.add(gameEvents.subscribe("parallax:theme", this.handleTheme, this));
    this.subscriptions.add(gameEvents.subscribe("parallax:reset", this.handleReset, this));
  }

  private createSystem(): void {
    this.parallaxSystem = new ParallaxSystem(this, this.currentTheme);
  }

  private handleScroll(data: ParallaxScrollEvent): void {
    this.currentScrollX = Math.max(0, data.scrollX);
    this.currentScrollY = data.scrollY;
    this.currentZoom = data.zoom;

    if (!this.isInitialized) {
      this.isInitialized = true;
      const normalizedScrollX = normalizeScrollX(this.currentScrollX);
      this.parallaxSystem.initialize(normalizedScrollX, this.currentScrollY);
    }
  }

  private handleTheme(data: ParallaxThemeEvent): void {
    if (this.isDestroyed) return;

    if (this.currentTheme !== data.theme) {
      this.setThemeImmediate(data.theme);
    }
  }

  private setThemeImmediate(theme: ThemeType): void {
    if (this.isDestroyed) return;
    this.currentTheme = theme;
    this.parallaxSystem?.setTheme(theme);
    this.isInitialized = false;
  }

  private handleReset(): void {
    this.currentScrollX = 0;
    this.currentScrollY = 0;
    this.currentZoom = 1;
    this.isInitialized = false;
    this.setThemeImmediate("forest");
    this.parallaxSystem.reset();
  }

  update(time: number, delta: number): void {
    const normalizedScrollX = normalizeScrollX(this.currentScrollX);

    this.parallaxSystem.update(
      normalizedScrollX,
      this.currentScrollY,
      this.currentZoom,
      time,
      delta
    );
  }

  shutdown(): void {
    this.isDestroyed = true;

    this.subscriptions.disposeAll();

    if (this.parallaxSystem) {
      this.parallaxSystem.destroy();
    }
  }

  getTheme(): ThemeType {
    return this.currentTheme;
  }

  getCurrentScroll(): Position {
    return { x: this.currentScrollX, y: this.currentScrollY };
  }
}
