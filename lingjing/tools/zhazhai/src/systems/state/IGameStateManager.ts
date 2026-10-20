export interface GameState {
  birdsRemaining: number;
  pigsRemaining: number;
  isPaused: boolean;
  isGameOver: boolean;
}

export interface GameStateCallbacks {
  onStateChange?: (state: GameState) => void;
  onPauseChange?: (isPaused: boolean) => void;
  onGameOver?: (won: boolean) => void;
}

export interface IGameStateManager {
  getState(): Readonly<GameState>;
  getBirdsRemaining(): number;
  setBirdsRemaining(count: number): void;
  decrementBirds(): void;
  getPigsRemaining(): number;
  setPigsRemaining(count: number): void;
  decrementPigs(): void;
  isPaused(): boolean;
  togglePause(): void;
  setPaused(paused: boolean): void;
  isGameOver(): boolean;
  isTransitioning(): boolean;
  setTransitioning(value: boolean): void;
  triggerWin(): void;
  triggerLose(): void;
  hasWon(): boolean;
  hasLost(): boolean;
  reset(initialBirds?: number, initialPigs?: number): void;
  setCallbacks(callbacks: GameStateCallbacks): void;
}
