import type {
  IUIAudioPlayer,
  IPhaserSoundAdapter,
  ISettingsProvider,
  ILogger,
  SoundConfig,
} from "../../../interfaces/audio";
import { AUDIO_KEYS, AUDIO_SPRITE_KEY } from "../config/AudioConfig";
import { UI_AUDIO_CONFIG } from "../../../config/AudioConfig";

export class UIAudioPlayer implements IUIAudioPlayer {
  constructor(
    private readonly adapter: IPhaserSoundAdapter,
    private readonly settings: ISettingsProvider,
    private readonly logger: ILogger
  ) {}

  playClick(): void {
    this.playSound(AUDIO_KEYS.CLICK, { volume: UI_AUDIO_CONFIG.defaultVolume });
  }

  playSelect(): void {
    this.playSound(AUDIO_KEYS.SELECT, { volume: UI_AUDIO_CONFIG.defaultVolume });
  }

  playBack(): void {
    this.playSound(AUDIO_KEYS.BACK, { volume: UI_AUDIO_CONFIG.defaultVolume });
  }

  private playSound(key: string, config: SoundConfig): void {
    if (!this.settings.getSettings().sfxEnabled) return;

    if (!this.adapter.exists(AUDIO_SPRITE_KEY)) {
      this.logger.warn("Audio sprite not found");
      return;
    }

    const sfxSettings = this.settings.getSettings();
    this.adapter.play(key, {
      ...config,
      volume: (config.volume ?? 1) * sfxSettings.sfxVolume,
    });
  }
}
