export interface ICameraFlash {
  flash(color?: number, intensity?: number): void;
  flashFromImpact(impactSpeed: number, material?: string): void;
}
