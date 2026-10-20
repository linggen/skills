export interface SoundConfig {
  volume?: number;
  rate?: number;
  loop?: boolean;
}

export interface ISoundInstance {
  play(markerOrConfig?: string | SoundConfig, config?: SoundConfig): boolean;
  stop(): boolean;
  pause(): boolean;
  resume(): boolean;
  volume: number;
  readonly isPlaying: boolean;
  readonly key: string;
  once(event: string, callback: () => void): void;
  destroy(): void;
}

export interface IPhaserSoundAdapter {
  readonly locked: boolean;
  readonly contextState: "suspended" | "running" | "closed";

  exists(key: string): boolean;
  get(key: string): ISoundInstance | undefined;
  play(key: string, config?: SoundConfig): ISoundInstance | undefined;
  add(key: string, config?: SoundConfig): ISoundInstance | null;
  stopAll(): void;
  pauseAll(): void;
  resumeAll(): void;
  unlock(): Promise<void>;

  onUnlocked(callback: () => void): void;
  offUnlocked(callback: () => void): void;
}
