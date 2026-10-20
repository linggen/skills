import type {
  IAudioSystem,
  IAudioContext,
  IMusicPlayer,
  ISFXPlayer,
  IUIAudioPlayer,
  IJinglePlayer,
  ISettingsProvider,
  IPhaserSoundAdapter,
  ILogger,
} from "../../interfaces/audio";
import { AUDIO_SPRITE_KEY } from "./config/AudioConfig";

export class AudioSystem implements IAudioSystem {
  constructor(
    public readonly context: IAudioContext,
    public readonly music: IMusicPlayer,
    public readonly sfx: ISFXPlayer,
    public readonly ui: IUIAudioPlayer,
    public readonly jingles: IJinglePlayer,
    public readonly settings: ISettingsProvider,
    private readonly adapter: IPhaserSoundAdapter,
    private readonly logger: ILogger
  ) {}

  validateAssets(): boolean {
    if (!this.adapter.exists(AUDIO_SPRITE_KEY)) {
      this.logger.warn(`Audio sprite not found: ${AUDIO_SPRITE_KEY}`);
      return false;
    }

    this.logger.info("All audio assets validated successfully");
    return true;
  }

  pauseAll(): void {
    this.adapter.pauseAll();
    this.logger.debug("All audio paused");
  }

  resumeAll(): void {
    this.adapter.resumeAll();
    this.logger.debug("All audio resumed");
  }

  destroy(): void {
    this.jingles.stop();
    this.sfx.stopAll();
    this.music.stopMusic(0);
    this.logger.info("Audio system destroyed");
  }
}
