import type {
  IJinglePlayer,
  IPhaserSoundAdapter,
  ISettingsProvider,
  ILogger,
  ISoundInstance,
  IMusicPlayer,
} from "../../../interfaces/audio";
import { AUDIO_KEYS, MUSIC_DUCK_VOLUME, AUDIO_SPRITE_KEY } from "../config/AudioConfig";

export class JinglePlayer implements IJinglePlayer {
  private currentJingle: ISoundInstance | null = null;
  private isPlayingFlag: boolean = false;
  private resolvePromise: (() => void) | null = null;

  constructor(
    private readonly adapter: IPhaserSoundAdapter,
    private readonly settings: ISettingsProvider,
    private readonly musicPlayer: IMusicPlayer,
    private readonly logger: ILogger
  ) {}

  async playWinJingle(): Promise<void> {
    return this.playJingle(AUDIO_KEYS.JINGLE_WIN);
  }

  async playLoseJingle(): Promise<void> {
    return this.playJingle(AUDIO_KEYS.JINGLE_LOSE);
  }

  stop(): void {
    if (this.currentJingle) {
      this.currentJingle.stop();
      this.currentJingle.destroy();
      this.currentJingle = null;
    }

    this.musicPlayer.unduck();
    this.isPlayingFlag = false;

    if (this.resolvePromise) {
      this.resolvePromise();
      this.resolvePromise = null;
    }
  }

  private async playJingle(spriteName: string): Promise<void> {
    if (this.isPlayingFlag) {
      this.logger.warn("Jingle already playing, skipping");
      return;
    }

    if (!this.settings.getSettings().sfxEnabled) {
      this.logger.debug("SFX disabled, skipping jingle");
      return;
    }

    if (!this.adapter.exists(AUDIO_SPRITE_KEY)) {
      this.logger.warn(`Audio sprite not found: ${AUDIO_SPRITE_KEY}`);
      return;
    }

    this.isPlayingFlag = true;

    const sfxSettings = this.settings.getSettings();
    this.currentJingle = this.adapter.add(AUDIO_SPRITE_KEY, {
      volume: sfxSettings.sfxVolume,
    });

    this.musicPlayer.duck(MUSIC_DUCK_VOLUME);

    return new Promise((resolve) => {
      this.resolvePromise = resolve;

      this.currentJingle!.once("complete", () => {
        this.musicPlayer.unduck();
        this.currentJingle?.destroy();
        this.currentJingle = null;
        this.isPlayingFlag = false;
        this.resolvePromise = null;
        resolve();
      });

      this.currentJingle!.play(spriteName);
    });
  }
}
