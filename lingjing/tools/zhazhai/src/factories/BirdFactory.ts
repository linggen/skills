import Phaser from "phaser";
import { Bird } from "../objects/Bird";
import { BirdType } from "../types/BirdType";
import type { IWakeCascadeManager } from "../interfaces/IWakeCascadeManager";

export interface BirdCreateOptions {
  x: number;
  y: number;
  type?: BirdType;
  id?: string;
  wakeManager?: IWakeCascadeManager;
}

export interface IBirdFactory {
  create(scene: Phaser.Scene, options: BirdCreateOptions): Bird;
}

export class BirdFactory implements IBirdFactory {
  public create(scene: Phaser.Scene, options: BirdCreateOptions): Bird {
    return new Bird(
      scene,
      options.x,
      options.y,
      options.type ?? BirdType.RED,
      options.id,
      options.wakeManager
    );
  }
}
