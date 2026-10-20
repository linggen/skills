export interface ICameraSequencer {
  startIntroPan(onComplete: () => void): void;
  skipIntroPan(): void;
  isIntroPanning(): boolean;
  resetToInitial(immediate?: boolean): void;
}
