import { BlendModes } from "phaser";

export function getMobileSafeBlendMode(fpsMultiplier: number, isMobileDevice: boolean): BlendModes {
  if (!isMobileDevice) return BlendModes.ADD;
  return fpsMultiplier < 0.7 ? BlendModes.NORMAL : BlendModes.ADD;
}
