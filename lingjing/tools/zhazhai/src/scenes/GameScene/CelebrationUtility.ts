import type { IBirdQueue } from "../../interfaces/IBirdQueue";
import type { IGroundManager } from "../../interfaces/IGroundManager";
import type { Slingshot } from "../../objects/Slingshot";
import { BIRD_ASSET_MAP } from "../../config/PhysicsConfig";
import type { Bird } from "../../objects/Bird";
import { CELEBRATION_CONFIG } from "../../config/GameConfig";

export interface CelebrationBirdPosition {
  x: number;
  y: number;
  texture: string;
}

export interface CelebrationConfig {
  birdQueueSystem: IBirdQueue | null;
  slingshot: Slingshot | null;
  groundManager: IGroundManager | null;
  birdLaunchOrchestrator: {
    getCurrentBird: () => Bird | null;
  } | null;
}

export class CelebrationUtility {
  public static getBirdPositions(config: CelebrationConfig): CelebrationBirdPosition[] {
    const positions: CelebrationBirdPosition[] = [];

    const queue = config.birdQueueSystem?.getQueue() ?? [];
    const pouchRestPos = config.slingshot?.getBirdRestPosition();

    queue.forEach((birdType, index) => {
      const texture = BIRD_ASSET_MAP[birdType];
      const firstBirdX =
        (pouchRestPos?.x ?? CELEBRATION_CONFIG.defaultPouchRestX) -
        CELEBRATION_CONFIG.birdStartXOffset;
      const spacing = CELEBRATION_CONFIG.birdSpacing;
      const x = firstBirdX - index * spacing;
      const y = config.groundManager?.getGroundY() ?? CELEBRATION_CONFIG.defaultGroundY;

      positions.push({ x, y, texture });
    });

    const currentBird = config.birdLaunchOrchestrator?.getCurrentBird();
    if (currentBird) {
      const pos = currentBird.getPosition();
      const birdType = currentBird.type;
      const texture = BIRD_ASSET_MAP[birdType];
      positions.push({ x: pos.x, y: pos.y, texture });
    }

    return positions;
  }
}
