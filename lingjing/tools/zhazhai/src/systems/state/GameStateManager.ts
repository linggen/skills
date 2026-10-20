import type { IGameStateManager, GameState, GameStateCallbacks } from "./IGameStateManager";

export class GameStateManager implements IGameStateManager {
  private state: GameState;
  private callbacks: GameStateCallbacks = {};
  private transitioning: boolean = false;

  constructor(initialBirds: number = 5, initialPigs: number = 3) {
    this.state = {
      birdsRemaining: initialBirds,
      pigsRemaining: initialPigs,
      isPaused: false,
      isGameOver: false,
    };
  }

  public getState(): Readonly<GameState> {
    return this.state;
  }

  public getBirdsRemaining(): number {
    return this.state.birdsRemaining;
  }

  public setBirdsRemaining(count: number): void {
    this.state.birdsRemaining = count;
    this.callbacks.onStateChange?.(this.state);
  }

  public decrementBirds(): void {
    this.state.birdsRemaining--;
    this.callbacks.onStateChange?.(this.state);
  }

  public getPigsRemaining(): number {
    return this.state.pigsRemaining;
  }

  public setPigsRemaining(count: number): void {
    this.state.pigsRemaining = count;
    this.callbacks.onStateChange?.(this.state);
  }

  public decrementPigs(): void {
    this.state.pigsRemaining--;
    this.callbacks.onStateChange?.(this.state);
  }

  public isPaused(): boolean {
    return this.state.isPaused;
  }

  public togglePause(): void {
    if (this.state.isGameOver) return;
    this.state.isPaused = !this.state.isPaused;
    this.callbacks.onPauseChange?.(this.state.isPaused);
  }

  public setPaused(paused: boolean): void {
    if (this.state.isGameOver) return;
    this.state.isPaused = paused;
    this.callbacks.onPauseChange?.(this.state.isPaused);
  }

  public isGameOver(): boolean {
    return this.state.isGameOver;
  }

  public isTransitioning(): boolean {
    return this.transitioning;
  }

  public setTransitioning(value: boolean): void {
    this.transitioning = value;
  }

  public triggerWin(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.state.isGameOver = true;
    this.callbacks.onGameOver?.(true);
  }

  public triggerLose(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.state.isGameOver = true;
    this.callbacks.onGameOver?.(false);
  }

  public hasWon(): boolean {
    return this.state.pigsRemaining <= 0;
  }

  public hasLost(): boolean {
    return this.state.birdsRemaining <= 0 && this.state.pigsRemaining > 0;
  }

  public reset(initialBirds: number = 5, initialPigs: number = 3): void {
    this.state = {
      birdsRemaining: initialBirds,
      pigsRemaining: initialPigs,
      isPaused: false,
      isGameOver: false,
    };
    this.transitioning = false;
    this.callbacks.onStateChange?.(this.state);
  }

  public setCallbacks(callbacks: GameStateCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
}
