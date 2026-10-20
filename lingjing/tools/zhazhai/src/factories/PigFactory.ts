import Phaser from "phaser";
import { Pig } from "../objects/Pig";
import { PigSize } from "../constants";
import type { IWakeCascadeManager } from "../interfaces/IWakeCascadeManager";

export interface PigCreateOptions {
  x: number;
  y: number;
  size?: PigSize;
  id?: string;
  wakeManager?: IWakeCascadeManager;
}

export interface IPigFactory {
  create(scene: Phaser.Scene, options: PigCreateOptions): Pig;
}

export class PigFactory implements IPigFactory {
  private wakeManager?: IWakeCascadeManager;

  constructor(wakeManager?: IWakeCascadeManager) {
    this.wakeManager = wakeManager;
  }

  public create(scene: Phaser.Scene, options: PigCreateOptions): Pig {
    return new Pig(
      scene,
      options.x,
      options.y,
      options.size ?? PigSize.MEDIUM,
      options.id,
      options.wakeManager ?? this.wakeManager
    );
  }
}
