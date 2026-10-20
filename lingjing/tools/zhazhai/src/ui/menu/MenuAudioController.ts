import Phaser from "phaser";
import type { IAudioSystem } from "../../interfaces/audio";

interface ProceduralSoundConfig {
  baseKey: string;
  rate: number;
  volume: number;
}

const CLICK_REACTION_SOUNDS: Record<string, ProceduralSoundConfig> = {
  surpriseJump: { baseKey: "select", rate: 1.4, volume: 0.5 },
  shakeWobble: { baseKey: "back", rate: 0.7, volume: 0.4 },
  waveAtPlayer: { baseKey: "select", rate: 1.0, volume: 0.4 },
  spin: { baseKey: "click", rate: 1.8, volume: 0.3 },
  fallOver: { baseKey: "back", rate: 0.5, volume: 0.5 },
  teleport: { baseKey: "select", rate: 2.0, volume: 0.4 },
};

const INTERACTION_SOUNDS: Record<string, ProceduralSoundConfig> = {
  uiInteraction: { baseKey: "select", rate: 1.2, volume: 0.4 },
};

export class MenuAudioController {
  private scene: Phaser.Scene;
  private audioSystem: IAudioSystem | null = null;
  private isDestroyed: boolean = false;

  constructor(scene: Phaser.Scene, audioSystem?: IAudioSystem) {
    this.scene = scene;
    this.audioSystem = audioSystem ?? null;
  }

  setAudioSystem(audioSystem: IAudioSystem): void {
    this.audioSystem = audioSystem;
  }

  playMenuMusic(): void {
    if (this.isDestroyed || !this.audioSystem) return;
    this.audioSystem.music.playMenuMusic();
  }

  stopMenuMusic(): void {
    if (this.isDestroyed || !this.audioSystem) return;
    this.audioSystem.music.stopMusic(500);
  }

  playUIClick(): void {
    if (this.isDestroyed || !this.audioSystem) return;
    this.audioSystem.ui.playClick();
  }

  playUISelect(): void {
    if (this.isDestroyed || !this.audioSystem) return;
    this.audioSystem.ui.playSelect();
  }

  playAlienSound(key: string, pitch: number = 1.0): void {
    if (this.isDestroyed) return;

    if (!this.audioSystem?.settings.getSettings().sfxEnabled) return;

    this.scene.sound.playAudioSprite("sfx-master", key, {
      volume: 0.4,
      rate: pitch,
    });
  }

  playClickReaction(reaction: string, voicePitch: number = 1.0): void {
    if (this.isDestroyed) return;

    if (!this.audioSystem?.settings.getSettings().sfxEnabled) return;

    const config = CLICK_REACTION_SOUNDS[reaction];
    if (!config) return;

    const adjustedRate = config.rate * voicePitch;

    this.scene.sound.playAudioSprite("sfx-master", config.baseKey, {
      volume: config.volume,
      rate: adjustedRate,
    });
  }

  playInteractionSound(type: string, voicePitch: number = 1.0): void {
    if (this.isDestroyed) return;

    if (!this.audioSystem?.settings.getSettings().sfxEnabled) return;

    const config = INTERACTION_SOUNDS[type];
    if (!config) return;

    const adjustedRate = config.rate * voicePitch;

    this.scene.sound.playAudioSprite("sfx-master", config.baseKey, {
      volume: config.volume,
      rate: adjustedRate,
    });
  }

  playHoverSound(): void {
    if (this.isDestroyed) return;

    if (!this.audioSystem?.settings.getSettings().sfxEnabled) return;

    this.scene.sound.playAudioSprite("sfx-master", "select", {
      volume: 0.2,
      rate: 1.5,
    });
  }

  unlockContext(): void {
    if (this.audioSystem) {
      this.audioSystem.context.unlock();
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    this.audioSystem = null;
  }
}
