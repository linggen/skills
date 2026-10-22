// sfx.js — the scene's sounds, by name only (Hanli 10-22: sound made once, in the shell). The scene still says what happened —
// a pop for each soldier joining, good and bad for a gate, thud, hit and slam for the clash and the boss, the tick and
// go of the lead-in — and each name goes to the shell's one sound layer (games/kit/sound.js), which plays what
// games/kit/audio/sounds.json says `sadou` sounds like, with its own gaps and voice cap. No audio context here; win and
// lose are the shell's (its result). Without a shell (a bare bundle) it is silent.
const NAMES = ['pop', 'good', 'bad', 'thud', 'hit', 'slam', 'tick', 'go', 'win', 'lose'];

export class Sfx {
  constructor(shell = null) {
    this.shell = shell;
    for (const name of NAMES) this[name] = () => this.shell?.sound?.(name);
  }

  wake() {} // the shell wakes the page's one context on the first touch
  close() {}
}
