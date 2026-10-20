import Phaser from "phaser";
import type { ITweenProvider, ITween, TweenConfig } from "../../../interfaces/audio";

export class PhaserTweenProvider implements ITweenProvider {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  createTween(config: TweenConfig): ITween {
    const target = { value: config.from };

    const tween = this.scene.tweens.add({
      targets: target,
      value: config.to,
      duration: config.duration,
      onUpdate: () => config.onUpdate(target.value),
      onComplete: config.onComplete,
    });

    return {
      stop: () => tween.stop(),
    };
  }
}
