import Phaser from "phaser";
import type { IAudioSystem } from "../../interfaces/audio";
import { MenuParallaxController } from "./MenuParallaxController";
import { MenuAudioController } from "./MenuAudioController";
import { MenuSceneChoreographer } from "./MenuSceneChoreographer";
import { ThemeType } from "../../config/GameConfig";

export interface MenuDirectorConfig {
  scene: Phaser.Scene;
  audioSystem?: IAudioSystem;
  theme?: ThemeType;
  onMenuReady?: () => void;
  onButtonsReady?: () => void;
}

export class MenuDirector {
  private scene: Phaser.Scene;
  private isDestroyed: boolean = false;
  private onMenuReady?: () => void;
  private onButtonsReadyCallback?: () => void;

  private parallaxController: MenuParallaxController;
  private audioController: MenuAudioController;
  private choreographer: MenuSceneChoreographer;

  private isInteractive: boolean = false;

  constructor(config: MenuDirectorConfig) {
    this.scene = config.scene;
    this.onMenuReady = config.onMenuReady;
    this.onButtonsReadyCallback = config.onButtonsReady;

    this.parallaxController = new MenuParallaxController(this.scene, config.theme);

    this.audioController = new MenuAudioController(this.scene, config.audioSystem);

    this.choreographer = new MenuSceneChoreographer({
      scene: this.scene,
      centerX: this.scene.scale.width / 2,
      centerY: this.scene.scale.height / 2,
      viewportWidth: this.scene.scale.width,
      viewportHeight: this.scene.scale.height,
      onButtonsReady: () => this.onButtonsReady(),
      onComplete: () => this.onEntranceComplete(),
    });
  }

  start(): void {
    this.audioController.unlockContext();
    this.audioController.playMenuMusic();
    this.choreographer.startEntrance();
  }

  private onButtonsReady(): void {
    if (this.onButtonsReadyCallback) {
      this.onButtonsReadyCallback();
    }
  }

  private onEntranceComplete(): void {
    this.isInteractive = true;

    if (this.onMenuReady) {
      this.onMenuReady();
    }
  }

  update(time: number, delta: number): void {
    if (this.isDestroyed) return;
    this.parallaxController.update(time, delta);
  }

  getParallaxController(): MenuParallaxController {
    return this.parallaxController;
  }

  getAudioController(): MenuAudioController {
    return this.audioController;
  }

  isMenuInteractive(): boolean {
    return this.isInteractive;
  }

  transitionToScene(sceneKey: string, data?: object): void {
    this.isInteractive = false;

    this.parallaxController.fadeToBlack(300, () => {
      this.scene.scene.start(sceneKey, data);
    });
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.choreographer) {
      this.choreographer.destroy();
    }

    if (this.parallaxController) {
      this.parallaxController.destroy();
    }

    if (this.audioController) {
      this.audioController.destroy();
    }
  }
}
