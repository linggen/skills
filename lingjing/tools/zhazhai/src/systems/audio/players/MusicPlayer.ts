import type {
  IMusicPlayer,
  IPhaserSoundAdapter,
  ISettingsProvider,
  ITweenProvider,
  ILogger,
  ISoundInstance,
  AudioSettings,
} from "../../../interfaces/audio";
import type { ThemeType } from "../../../config/GameConfig";
import {
  THEME_MUSIC,
  DEFAULT_MUSIC,
  MUSIC_CROSSFADE_DURATION,
  AUDIO_SPRITE_KEY,
} from "../config/AudioConfig";

export class MusicPlayer implements IMusicPlayer {
  private currentTrackInstance: ISoundInstance | null = null;
  private currentKey: string | null = null;
  private currentSpriteName: string | null = null;
  private duckedVolume: number = 1;
  private baseVolume: number;
  private crossfadeTween: import("../../../interfaces/audio").ITween | null = null;
  private pendingTrack: string | null = null;

  private readonly handleSettingsChangeBound: (settings: AudioSettings) => void;

  constructor(
    private readonly adapter: IPhaserSoundAdapter,
    private readonly settings: ISettingsProvider,
    private readonly tweenProvider: ITweenProvider,
    private readonly logger: ILogger
  ) {
    this.baseVolume = settings.getSettings().musicVolume;
    this.handleSettingsChangeBound = this.handleSettingsChange.bind(this);
    settings.onChange(this.handleSettingsChangeBound);
  }

  get isPlaying(): boolean {
    return this.currentTrackInstance?.isPlaying ?? false;
  }

  get currentTrack(): string | null {
    return this.currentKey;
  }

  playMenuMusic(): void {
    this.playTrack("musicMenu");
  }

  playLevelMusic(theme: ThemeType): void {
    const trackKey = THEME_MUSIC[theme] ?? DEFAULT_MUSIC;
    this.playTrack(trackKey);
  }

  playTrack(spriteName: string): void {
    if (!this.settings.getSettings().musicEnabled) {
      this.pendingTrack = spriteName;
      this.logger.debug(`Music disabled, queuing: ${spriteName}`);
      return;
    }

    this.pendingTrack = null;

    if (spriteName === this.currentSpriteName && this.isPlaying) {
      this.logger.debug(`Already playing: ${spriteName}`);
      return;
    }

    if (!this.adapter.exists(AUDIO_SPRITE_KEY)) {
      this.logger.warn(`Audio sprite not found: ${AUDIO_SPRITE_KEY}`);
      return;
    }

    this.currentTrackInstance?.stop();
    this.currentTrackInstance?.destroy();

    const soundInstance = this.adapter.add(AUDIO_SPRITE_KEY, {
      volume: this.baseVolume * this.duckedVolume,
      loop: true,
    });

    if (!soundInstance) {
      this.logger.warn(`Failed to create sound instance for: ${spriteName}`);
      return;
    }

    this.currentTrackInstance = soundInstance;
    this.currentKey = spriteName;
    this.currentSpriteName = spriteName;
    this.currentTrackInstance.play(spriteName, {
      loop: true,
      volume: this.baseVolume * this.duckedVolume,
    });

    this.logger.debug(`Playing music: ${spriteName}`);
  }

  stopMusic(fadeOutMs: number = 500): void {
    if (!this.currentTrackInstance) return;

    if (fadeOutMs > 0) {
      this.crossfadeTween?.stop();
      this.crossfadeTween = this.tweenProvider.createTween({
        from: this.baseVolume * this.duckedVolume,
        to: 0,
        duration: fadeOutMs,
        onUpdate: (value) => {
          if (this.currentTrackInstance) {
            this.currentTrackInstance.volume = value;
          }
        },
        onComplete: () => {
          this.currentTrackInstance?.stop();
          this.currentTrackInstance?.destroy();
          this.currentTrackInstance = null;
          this.currentKey = null;
          this.crossfadeTween = null;
        },
      });
    } else {
      this.currentTrackInstance.stop();
      this.currentTrackInstance.destroy();
      this.currentTrackInstance = null;
      this.currentKey = null;
    }
  }

  pauseMusic(): void {
    this.currentTrackInstance?.pause();
  }

  resumeMusic(): void {
    if (this.settings.getSettings().musicEnabled) {
      this.currentTrackInstance?.resume();
    }
  }

  crossfadeTo(spriteName: string, durationMs: number = MUSIC_CROSSFADE_DURATION): void {
    if (!this.settings.getSettings().musicEnabled) return;
    if (spriteName === this.currentSpriteName) return;

    if (!this.adapter.exists(AUDIO_SPRITE_KEY)) {
      this.logger.warn(`Audio sprite not found: ${AUDIO_SPRITE_KEY}`);
      return;
    }

    const oldTrack = this.currentTrackInstance;

    const newTrack = this.adapter.add(AUDIO_SPRITE_KEY, {
      volume: 0,
      loop: true,
    });

    if (!newTrack) {
      this.logger.warn(`Failed to create sound instance for crossfade: ${spriteName}`);
      return;
    }

    newTrack.play(spriteName, { loop: true, volume: 0 });

    this.crossfadeTween?.stop();

    this.crossfadeTween = this.tweenProvider.createTween({
      from: 0,
      to: this.baseVolume * this.duckedVolume,
      duration: durationMs,
      onUpdate: (value) => {
        newTrack.volume = value;
        if (oldTrack) {
          oldTrack.volume = this.baseVolume * this.duckedVolume - value;
        }
      },
      onComplete: () => {
        oldTrack?.stop();
        oldTrack?.destroy();
        this.currentTrackInstance = newTrack;
        this.currentKey = spriteName;
        this.currentSpriteName = spriteName;
        this.crossfadeTween = null;
        this.logger.debug(`Crossfaded to: ${spriteName}`);
      },
    });
  }

  duck(volumeMultiplier: number): void {
    this.duckedVolume = volumeMultiplier;
    this.updateVolume();
  }

  unduck(): void {
    this.duckedVolume = 1;
    this.updateVolume();
  }

  destroy(): void {
    this.settings.offChange(this.handleSettingsChangeBound);
    this.crossfadeTween?.stop();
    this.currentTrackInstance?.stop();
    this.currentTrackInstance?.destroy();
    this.currentTrackInstance = null;
    this.currentKey = null;
    this.currentSpriteName = null;
  }

  private handleSettingsChange(settings: AudioSettings): void {
    this.baseVolume = settings.musicVolume;

    if (!settings.musicEnabled && this.isPlaying) {
      this.currentTrackInstance?.pause();
      this.logger.debug("Music paused due to settings");
    } else if (
      settings.musicEnabled &&
      this.currentTrackInstance &&
      !this.currentTrackInstance.isPlaying
    ) {
      this.currentTrackInstance.resume();
      this.logger.debug("Music resumed due to settings");
    } else if (settings.musicEnabled && this.pendingTrack) {
      const trackToPlay = this.pendingTrack;
      this.pendingTrack = null;
      this.playTrack(trackToPlay);
      this.logger.debug(`Playing queued track: ${trackToPlay}`);
    }

    this.updateVolume();
  }

  private updateVolume(): void {
    if (this.currentTrackInstance) {
      this.currentTrackInstance.volume = this.baseVolume * this.duckedVolume;
    }
  }
}
