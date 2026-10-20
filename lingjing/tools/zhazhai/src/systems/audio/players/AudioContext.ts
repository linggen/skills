import type { IAudioContext, IPhaserSoundAdapter, ILogger } from "../../../interfaces/audio";

export class AudioContext implements IAudioContext {
  private unlockCallbacks: Set<() => void> = new Set();
  private _isUnlocked: boolean = false;

  constructor(
    private readonly adapter: IPhaserSoundAdapter,
    private readonly logger: ILogger
  ) {
    this._isUnlocked = !adapter.locked;

    adapter.onUnlocked(this.handleAdapterUnlocked.bind(this));
  }

  get isUnlocked(): boolean {
    return this._isUnlocked;
  }

  get contextState(): "suspended" | "running" | "closed" {
    return this.adapter.contextState;
  }

  async unlock(): Promise<void> {
    if (this._isUnlocked) {
      this.logger.debug("Audio already unlocked");
      return;
    }

    this.logger.info("Unlocking audio context...");
    await this.adapter.unlock();
  }

  onUnlocked(callback: () => void): void {
    this.unlockCallbacks.add(callback);
  }

  private handleAdapterUnlocked(): void {
    if (this._isUnlocked) return;

    this._isUnlocked = true;
    this.logger.info("Audio context unlocked");

    this.unlockCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        this.logger.error("Error in unlock callback", e);
      }
    });
  }
}
