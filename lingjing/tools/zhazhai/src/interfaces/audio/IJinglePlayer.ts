export interface IJinglePlayer {
  playWinJingle(): Promise<void>;
  playLoseJingle(): Promise<void>;
  stop(): void;
}
