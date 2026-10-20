import type { ThemeType } from "../config/GameConfig";

export interface IGroundManager {
  setTheme(theme: ThemeType): void;
  getTheme(): ThemeType;
  getGroundY(): number;
  create(): void;
  update(cameraX: number): void;
  destroy(): void;
}
