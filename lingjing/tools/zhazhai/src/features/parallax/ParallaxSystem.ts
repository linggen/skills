import Phaser from "phaser";
import { ThemeType, LEVEL_WIDTH } from "../../config/GameConfig";
import { ParallaxManager } from "./ParallaxManager";
import { ParallaxEffects } from "./ParallaxEffects";
import { BackgroundParticles } from "./BackgroundParticles";
import { PARALLAX_MENU_DRIFT_CONFIG } from "./config/ParallaxConfig";

export class ParallaxSystem {
  private manager: ParallaxManager;
  private effects: ParallaxEffects;
  private particles: BackgroundParticles;
  private scene: Phaser.Scene;
  private currentTheme: ThemeType;
  private driftTime: number = 0;
  private isDestroyed: boolean = false;

  constructor(scene: Phaser.Scene, theme?: ThemeType) {
    this.scene = scene;
    this.currentTheme = theme ?? this.selectRandomTheme();

    this.manager = new ParallaxManager(this.scene);
    this.manager.setTheme(this.currentTheme);
    this.manager.create();

    this.effects = new ParallaxEffects(this.scene);
    this.effects.create();

    this.particles = new BackgroundParticles(this.scene);
    this.particles.setTheme(this.currentTheme);
  }

  private selectRandomTheme(): ThemeType {
    const themes: ThemeType[] = ["forest", "desert", "castle", "ice", "volcano", "jungle"];
    return themes[Math.floor(Math.random() * themes.length)];
  }

  getTheme(): ThemeType {
    return this.currentTheme;
  }

  setTheme(theme: ThemeType): void {
    if (this.isDestroyed) return;
    this.currentTheme = theme;
    this.manager.setTheme(theme);
    this.effects.setTheme(theme);
    this.particles.setTheme(theme);
  }

  initialize(scrollX: number, scrollY: number): void {
    this.manager.initialize(scrollX, scrollY);
  }

  update(scrollX: number, scrollY: number, zoom: number, time: number, delta: number): void {
    if (this.isDestroyed) return;
    this.manager.update(scrollX, scrollY, zoom, time, delta);
    this.effects.update(time, delta);
  }

  updateWithDrift(time: number, delta: number): void {
    if (this.isDestroyed) return;

    this.driftTime += delta * PARALLAX_MENU_DRIFT_CONFIG.timeMultiplier;
    const driftX = Math.sin(this.driftTime) * PARALLAX_MENU_DRIFT_CONFIG.amplitudeX;
    const driftY =
      Math.cos(this.driftTime * PARALLAX_MENU_DRIFT_CONFIG.frequencyY) *
      PARALLAX_MENU_DRIFT_CONFIG.amplitudeY;

    this.manager.update(driftX, driftY, 1, time, delta);
    this.effects.update(time, delta);
  }

  reset(): void {
    this.effects.reset();
  }

  fadeToBlack(duration: number, callback?: () => void): void {
    if (this.isDestroyed) return;
    this.effects.fadeToBlack(duration, callback);
  }

  fadeFromBlack(duration: number, callback?: () => void): void {
    if (this.isDestroyed) return;
    this.effects.fadeFromBlack(duration, callback);
  }

  crossFadeTransition(duration: number, onMidpoint: () => void, onComplete: () => void): void {
    if (this.isDestroyed) return;
    this.effects.crossFadeTransition(duration, onMidpoint, onComplete);
  }

  spawnParticleBurst(x: number, y: number, radius: number): void {
    if (this.isDestroyed) return;
    this.particles.spawnBurst(x, y, radius);
  }

  getManager(): ParallaxManager {
    return this.manager;
  }

  getEffects(): ParallaxEffects {
    return this.effects;
  }

  getParticles(): BackgroundParticles {
    return this.particles;
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.manager.destroy();
    this.effects.destroy();
    this.particles.destroy();
  }
}

export interface ParallaxScrollEvent {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export interface ParallaxThemeEvent {
  theme: ThemeType;
  transition?: boolean;
}

export interface ParallaxSceneInitData {
  theme?: ThemeType;
}

export function normalizeScrollX(scrollX: number): number {
  return scrollX / LEVEL_WIDTH;
}
