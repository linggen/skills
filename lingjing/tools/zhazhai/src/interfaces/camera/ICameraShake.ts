export interface ICameraShake {
  shake(intensity: number, duration?: number): void;
  shakeFromImpact(impactSpeed: number, material?: string): void;
  rumble(intensity?: number, duration?: number): void;
}
