export interface IAudioContext {
  readonly isUnlocked: boolean;
  readonly contextState: "suspended" | "running" | "closed";
  unlock(): Promise<void>;
  onUnlocked(callback: () => void): void;
}
