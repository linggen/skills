import type { ICameraShake } from "./camera/ICameraShake";
import type { ICameraFlash } from "./camera/ICameraFlash";
import type { ICameraTimeEffects } from "./camera/ICameraTimeEffects";

/**
 * Composite interface for all camera effects
 * Covers non-authoritative camera polish only.
 */
export interface ICameraEffects extends ICameraShake, ICameraFlash, ICameraTimeEffects {
  destroy(): void;
}
