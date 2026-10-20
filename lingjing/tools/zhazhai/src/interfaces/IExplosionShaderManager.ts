export interface IExplosionShaderManager {
  init(): void;
  triggerExplosion(x: number, y: number, radius: number, material?: string): void;
  update(delta: number): void;
  isExploding(): boolean;
  destroy(): void;
}
