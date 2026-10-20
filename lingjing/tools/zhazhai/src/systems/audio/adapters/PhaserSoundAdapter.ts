import Phaser from "phaser";
import type {
  IPhaserSoundAdapter,
  ISoundInstance,
  SoundConfig,
  ILogger,
} from "../../../interfaces/audio";
import { AUDIO_SPRITE_KEY } from "../config/AudioConfig";

type SoundLike = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;

interface PooledSound {
  sound: SoundLike;
  inUse: boolean;
}

const MAX_POOL_SIZE_PER_KEY = 5;
const MAX_TOTAL_POOL_SIZE = 30;

export class PhaserSoundAdapter implements IPhaserSoundAdapter {
  private sound: Phaser.Sound.BaseSoundManager;
  private unlockCallbacks: Set<() => void> = new Set();
  private soundPool: Map<string, PooledSound[]> = new Map();
  private totalPooled: number = 0;
  private activeSpriteSounds: Set<SoundLike> = new Set();
  private spriteLoaded: boolean = false;

  constructor(
    game: Phaser.Game,
    private readonly logger: ILogger
  ) {
    this.sound = game.sound;
    this.sound.on(Phaser.Sound.Events.UNLOCKED, this.handleUnlocked, this);
    this.spriteLoaded = this.checkSpriteLoaded();
  }

  private checkSpriteLoaded(): boolean {
    return !!(this.sound.game.cache.audio && this.sound.game.cache.audio.has(AUDIO_SPRITE_KEY));
  }

  get locked(): boolean {
    return this.sound.locked;
  }

  get contextState(): "suspended" | "running" | "closed" {
    const webAudioManager = this.sound as Phaser.Sound.WebAudioSoundManager;
    if (webAudioManager.context) {
      return webAudioManager.context.state;
    }
    return "closed";
  }

  exists(key: string): boolean {
    if (key === AUDIO_SPRITE_KEY) {
      return this.checkSpriteLoaded();
    }
    if (this.spriteLoaded) {
      return true;
    }
    if (!this.sound.game.cache.audio) {
      return false;
    }
    return this.sound.game.cache.audio.has(key);
  }

  get(key: string): ISoundInstance | undefined {
    const sound = this.sound.get(key);
    return sound as SoundLike | undefined;
  }

  play(key: string, config?: SoundConfig): ISoundInstance | undefined {
    if (this.spriteLoaded) {
      return this.playSprite(key, config);
    }

    if (!this.exists(key)) {
      this.logger.warn(`Sound key not found: ${key}`);
      return undefined;
    }

    const pooled = this.acquireFromPool(key);
    if (pooled) {
      if (config?.volume !== undefined) {
        pooled.setVolume(config.volume);
      }
      if (config?.rate !== undefined) {
        pooled.setRate(config.rate);
      }
      pooled.play();
      return pooled;
    }

    const sound = this.sound.add(key, config) as SoundLike;
    sound.play();
    return sound;
  }

  private playSprite(spriteName: string, config?: SoundConfig): ISoundInstance | undefined {
    try {
      const spriteSound = this.sound.addAudioSprite(AUDIO_SPRITE_KEY) as SoundLike;

      if (!spriteSound) {
        this.logger.warn(`Failed to create audio sprite for: ${spriteName}`);
        return undefined;
      }

      if (config?.volume !== undefined) {
        spriteSound.setVolume(config.volume);
      }
      if (config?.rate !== undefined) {
        spriteSound.setRate(config.rate);
      }

      spriteSound.play(spriteName);
      this.activeSpriteSounds.add(spriteSound);

      spriteSound.once(Phaser.Sound.Events.COMPLETE, () => {
        this.activeSpriteSounds.delete(spriteSound);
        spriteSound.destroy();
      });

      return spriteSound;
    } catch (e) {
      this.logger.error(`Error playing sprite ${spriteName}:`, e);
      return undefined;
    }
  }

  private acquireFromPool(key: string): SoundLike | null {
    const pool = this.soundPool.get(key);
    if (!pool) return null;

    for (const entry of pool) {
      if (!entry.inUse && !entry.sound.isPlaying) {
        entry.inUse = true;
        return entry.sound;
      }
    }

    return null;
  }

  releaseToPool(key: string, sound: SoundLike): void {
    const pool = this.soundPool.get(key) ?? [];

    if (this.totalPooled >= MAX_TOTAL_POOL_SIZE) {
      sound.destroy();
      return;
    }

    const existing = pool.find((e) => e.sound === sound);
    if (existing) {
      existing.inUse = !sound.isPlaying;
      return;
    }

    if (pool.length >= MAX_POOL_SIZE_PER_KEY) {
      sound.destroy();
      return;
    }

    pool.push({ sound, inUse: false });
    this.soundPool.set(key, pool);
    this.totalPooled++;
  }

  add(key: string, config?: SoundConfig): ISoundInstance | null {
    if (this.spriteLoaded) {
      const spriteSound = this.sound.addAudioSprite(AUDIO_SPRITE_KEY) as SoundLike;
      if (!spriteSound) {
        this.logger.warn(`Failed to create audio sprite instance`);
        return null;
      }
      this.activeSpriteSounds.add(spriteSound);

      if (config?.volume !== undefined) {
        spriteSound.setVolume(config.volume);
      }
      if (config?.loop !== undefined) {
        spriteSound.setLoop(config.loop);
      }

      return spriteSound;
    }

    return this.sound.add(key, config) as SoundLike;
  }

  stopAll(): void {
    for (const sprite of this.activeSpriteSounds) {
      sprite.stop();
      sprite.destroy();
    }
    this.activeSpriteSounds.clear();
    this.sound.stopAll();
  }

  pauseAll(): void {
    this.sound.pauseAll();
  }

  resumeAll(): void {
    this.sound.resumeAll();
  }

  async unlock(): Promise<void> {
    if (!this.locked) {
      this.handleUnlocked();
      return;
    }

    const unlockMethod = (this.sound as unknown as { unlock: () => void }).unlock;
    if (unlockMethod) {
      unlockMethod.call(this.sound);
    }

    return new Promise((resolve) => {
      if (!this.locked) {
        resolve();
        return;
      }

      const callback = () => {
        this.offUnlocked(callback);
        resolve();
      };
      this.onUnlocked(callback);
    });
  }

  onUnlocked(callback: () => void): void {
    this.unlockCallbacks.add(callback);
  }

  offUnlocked(callback: () => void): void {
    this.unlockCallbacks.delete(callback);
  }

  private handleUnlocked(): void {
    this.unlockCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        this.logger.error("Error in unlock callback", e);
      }
    });
  }

  destroy(): void {
    for (const sprite of this.activeSpriteSounds) {
      sprite.destroy();
    }
    this.activeSpriteSounds.clear();

    for (const pool of this.soundPool.values()) {
      for (const entry of pool) {
        entry.sound.destroy();
      }
    }
    this.soundPool.clear();
    this.totalPooled = 0;
  }
}
