import type { IAudioContext } from "./IAudioContext";
import type { IMusicPlayer } from "./IMusicPlayer";
import type { ISFXPlayer } from "./ISFXPlayer";
import type { IUIAudioPlayer } from "./IUIAudioPlayer";
import type { IJinglePlayer } from "./IJinglePlayer";
import type { ISettingsProvider } from "./ISettingsProvider";

export interface IAudioSystem {
  readonly context: IAudioContext;
  readonly music: IMusicPlayer;
  readonly sfx: ISFXPlayer;
  readonly ui: IUIAudioPlayer;
  readonly jingles: IJinglePlayer;
  readonly settings: ISettingsProvider;

  validateAssets(): boolean;
  pauseAll(): void;
  resumeAll(): void;
  destroy(): void;
}
