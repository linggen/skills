import type { BlockMaterial } from "../../constants/Materials";

export interface ISFXPlayer {
  playImpact(material: BlockMaterial, impactSpeed: number): void;
  playDestroy(material: BlockMaterial): void;
  playPigDestroy(): void;
  playBirdLaunch(power: number): void;
  playBirdImpact(impactSpeed: number): void;
  playScore(): void;
  playExplosion(): void;
  playSplit(): void;
  playEggDrop(): void;
  stopAll(): void;
}
