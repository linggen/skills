import Phaser from "phaser";
import { Block } from "../objects/Block";
import { BlockMaterial } from "../constants/Materials";
import type { IWakeCascadeManager } from "../interfaces/IWakeCascadeManager";

export interface BlockCreateOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  material?: BlockMaterial;
  rotation?: number;
  id?: string;
  elementIndex?: string;
  wakeManager?: IWakeCascadeManager;
}

export interface IBlockFactory {
  create(scene: Phaser.Scene, options: BlockCreateOptions): Block;
}

export class BlockFactory implements IBlockFactory {
  private wakeManager?: IWakeCascadeManager;

  constructor(wakeManager?: IWakeCascadeManager) {
    this.wakeManager = wakeManager;
  }

  public create(scene: Phaser.Scene, options: BlockCreateOptions): Block {
    return new Block(
      scene,
      options.x,
      options.y,
      options.width,
      options.height,
      options.material ?? BlockMaterial.WOOD,
      options.rotation ?? 0,
      options.id,
      options.elementIndex,
      options.wakeManager ?? this.wakeManager
    );
  }
}
