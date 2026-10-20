import type {
  ISFXPlayer,
  IPhaserSoundAdapter,
  ISettingsProvider,
  ILogger,
  ISoundInstance,
  SoundConfig,
  AudioSettings,
} from "../../../interfaces/audio";
import type { BlockMaterial } from "../../../constants/Materials";
import {
  MATERIAL_IMPACT_SOUNDS,
  MATERIAL_DESTROY_SOUNDS,
  AUDIO_KEYS,
  MAX_CONCURRENT_SOUNDS,
  PIG_DESTROY_SOUNDS,
  PIG_DESTROY_PITCH_CONFIG,
} from "../config/AudioConfig";
import { SFX_CONFIG } from "../../../config/AudioConfig";

export class SFXPlayer implements ISFXPlayer {
  private activeSounds: Map<string, Set<ISoundInstance>> = new Map();
  private readonly handleSettingsChangeBound: (settings: AudioSettings) => void;
  private recentPigDestroys: number = 0;
  private lastPigDestroyTime: number = 0;
  private cachedSfxEnabled: boolean = true;
  private cachedSfxVolume: number = 1;

  constructor(
    private readonly adapter: IPhaserSoundAdapter,
    private readonly settings: ISettingsProvider,
    private readonly logger: ILogger
  ) {
    this.handleSettingsChangeBound = this.handleSettingsChange.bind(this);
    this.settings.onChange(this.handleSettingsChangeBound);

    const initialSettings = this.settings.getSettings();
    this.cachedSfxEnabled = initialSettings.sfxEnabled;
    this.cachedSfxVolume = initialSettings.sfxVolume;
  }

  playImpact(material: BlockMaterial, impactSpeed: number): void {
    const sounds = MATERIAL_IMPACT_SOUNDS[material];
    if (!sounds) {
      this.logger.warn(`No impact sounds for material: ${material}`);
      return;
    }

    const normalizedSpeed = Math.min(impactSpeed / SFX_CONFIG.impact.speedNormalization, 1);
    const index =
      normalizedSpeed > SFX_CONFIG.impact.thresholds.heavy
        ? 2
        : normalizedSpeed > SFX_CONFIG.impact.thresholds.medium
          ? 1
          : 0;

    this.playSound(sounds[index], {
      volume: SFX_CONFIG.impact.volumeBase + normalizedSpeed * SFX_CONFIG.impact.volumeRange,
      rate: SFX_CONFIG.impact.rateBase + normalizedSpeed * SFX_CONFIG.impact.rateRange,
    });
  }

  playDestroy(material: BlockMaterial): void {
    const sound = MATERIAL_DESTROY_SOUNDS[material];
    if (!sound) {
      this.logger.warn(`No destroy sound for material: ${material}`);
      return;
    }

    this.playSound(sound, { volume: SFX_CONFIG.destroyVolume });
  }

  playPigDestroy(): void {
    const now = performance.now();
    const pitchConfig = PIG_DESTROY_PITCH_CONFIG;

    if (now - this.lastPigDestroyTime > pitchConfig.resetWindowMs) {
      this.recentPigDestroys = 0;
    }

    this.recentPigDestroys++;
    this.lastPigDestroyTime = now;

    const soundIndex = Math.floor(Math.random() * PIG_DESTROY_SOUNDS.length);
    const soundKey = PIG_DESTROY_SOUNDS[soundIndex];

    const pitchMultiplier = Math.min(
      pitchConfig.basePitch + (this.recentPigDestroys - 1) * pitchConfig.pitchIncrement,
      pitchConfig.maxPitch
    );

    this.playSound(soundKey, { volume: SFX_CONFIG.destroyVolume, rate: pitchMultiplier });
  }

  playBirdLaunch(power: number): void {
    const normalizedPower = Math.min(power / SFX_CONFIG.birdLaunch.powerNormalization, 1);
    this.playSound(AUDIO_KEYS.BIRD_LAUNCH, {
      volume:
        SFX_CONFIG.birdLaunch.volumeBase + normalizedPower * SFX_CONFIG.birdLaunch.volumeRange,
      rate: SFX_CONFIG.birdLaunch.rateBase + normalizedPower * SFX_CONFIG.birdLaunch.rateRange,
    });
  }

  playBirdImpact(impactSpeed: number): void {
    const normalizedSpeed = Math.min(impactSpeed / SFX_CONFIG.birdImpact.speedNormalization, 1);
    this.playSound(AUDIO_KEYS.BIRD_IMPACT, {
      volume:
        SFX_CONFIG.birdImpact.volumeBase + normalizedSpeed * SFX_CONFIG.birdImpact.volumeRange,
      rate: SFX_CONFIG.birdImpact.rateBase + normalizedSpeed * SFX_CONFIG.birdImpact.rateRange,
    });
  }

  playScore(): void {
    this.playSound(AUDIO_KEYS.SCORE_POP, { volume: SFX_CONFIG.scoreVolume });
  }

  playExplosion(): void {
    this.playSound(AUDIO_KEYS.EXPLOSION, { volume: SFX_CONFIG.explosionVolume });
  }

  playSplit(): void {
    this.playSound(AUDIO_KEYS.BIRD_SPLIT, {
      volume: SFX_CONFIG.split.volume,
      rate: SFX_CONFIG.split.rate,
    });
  }

  playEggDrop(): void {
    this.playSound(AUDIO_KEYS.EGG_DROP, { volume: SFX_CONFIG.eggDropVolume });
  }

  stopAll(): void {
    this.activeSounds.forEach((sounds) => {
      sounds.forEach((sound) => {
        sound.stop();
        sound.destroy();
      });
    });
    this.activeSounds.clear();
  }

  private playSound(key: string, config: SoundConfig): void {
    if (!this.cachedSfxEnabled) return;
    this.playWithLimit(key, config);
  }

  private playWithLimit(key: string, config: SoundConfig): void {
    if (!this.adapter.exists(key)) {
      this.logger.warn(`Sound key not found: ${key}`);
      return;
    }

    let active = this.activeSounds.get(key);
    if (!active) {
      active = new Set();
      this.activeSounds.set(key, active);
    }

    active.forEach((sound) => {
      if (!sound.isPlaying) {
        active!.delete(sound);
        this.releaseSoundToPool(key, sound);
      }
    });

    if (active.size >= MAX_CONCURRENT_SOUNDS) {
      const oldest = active.values().next().value;
      if (oldest) {
        oldest.stop();
        active.delete(oldest);
        this.releaseSoundToPool(key, oldest);
      }
    }

    const sound = this.adapter.play(key, {
      ...config,
      volume: (config.volume ?? 1) * this.cachedSfxVolume,
    });

    if (sound) {
      active.add(sound);
      sound.once("complete", () => {
        active!.delete(sound);
        this.releaseSoundToPool(key, sound);
      });
    }
  }

  private releaseSoundToPool(key: string, sound: ISoundInstance): void {
    const adapterWithPool = this.adapter as unknown as {
      releaseToPool?: (k: string, s: ISoundInstance) => void;
    };
    if (adapterWithPool.releaseToPool) {
      adapterWithPool.releaseToPool(key, sound);
    } else {
      sound.destroy();
    }
  }

  private handleSettingsChange(settings: AudioSettings): void {
    this.cachedSfxEnabled = settings.sfxEnabled;
    this.cachedSfxVolume = settings.sfxVolume;

    if (!settings.sfxEnabled) {
      this.stopAll();
    }
  }
}
