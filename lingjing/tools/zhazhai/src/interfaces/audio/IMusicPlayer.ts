import type { ThemeType } from "../../config/GameConfig";

export interface IMusicPlayer {
  playMenuMusic(): void;
  playLevelMusic(theme: ThemeType): void;
  playTrack(key: string): void;
  stopMusic(fadeOutMs?: number): void;
  pauseMusic(): void;
  resumeMusic(): void;
  crossfadeTo(key: string, durationMs?: number): void;

  duck(volumeMultiplier: number): void;
  unduck(): void;

  readonly isPlaying: boolean;
  readonly currentTrack: string | null;

  destroy(): void;
}
