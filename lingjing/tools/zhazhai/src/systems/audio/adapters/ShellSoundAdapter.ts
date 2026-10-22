// ShellSoundAdapter — 砸寨's sounds go to the shell's one sound layer (scripts/games/kit/sound.js; Hanli 10-22: sound
// made once, in the shell). It replaces upstream's PhaserSoundAdapter: the players above keep naming their sprite
// keys (impactWoodHeavy, birdLaunch, click …), and each name is sent to the shell, which plays what
// games/kit/audio/sounds.json says `zhazhai` sounds like, from the shared CC0 bank. No sprite of its own, no Phaser
// sound (the game runs with noAudio). The music tracks are not sent: the shell plays the throw kit's bed. Without a
// shell it is silent.
import type { IPhaserSoundAdapter, ISoundInstance, SoundConfig } from "../../../interfaces/audio";
import { Runtime } from "../../../zhazhai/runtime";

const send = (name: string): void => {
  if (!name.startsWith("music")) Runtime.shell?.sound?.(name);
};

/** A sound that only names itself: it "ends" at once, so the players' bookkeeping (pools, a jingle's music
    restore) carries on as before. */
class Named implements ISoundInstance {
  volume = 1;
  isPlaying = false;
  constructor(readonly key: string) {}
  play(marker?: string | SoundConfig): boolean {
    send(typeof marker === "string" ? marker : this.key);
    return true;
  }
  stop(): boolean { return true; }
  pause(): boolean { return true; }
  resume(): boolean { return true; }
  once(_event: string, callback: () => void): void { setTimeout(callback, 0); }
  destroy(): void {}
}

export class ShellSoundAdapter implements IPhaserSoundAdapter {
  readonly locked = false;
  readonly contextState = "running" as const;
  exists(): boolean { return true; }
  get(): ISoundInstance | undefined { return undefined; }
  play(key: string): ISoundInstance | undefined {
    send(key);
    return new Named(key);
  }
  add(key: string): ISoundInstance | null { return new Named(key); }
  stopAll(): void {}
  pauseAll(): void {}
  resumeAll(): void {}
  async unlock(): Promise<void> {}
  onUnlocked(callback: () => void): void { callback(); }
  offUnlocked(): void {}
}
