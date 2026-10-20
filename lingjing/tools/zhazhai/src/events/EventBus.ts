import Phaser from "phaser";
import Matter from "matter-js";
import type { BirdType } from "../types/BirdType";
import type { Bird } from "../objects/Bird";
import type { Pig } from "../objects/Pig";
import type { PigSize } from "../constants";
import type { ScoreBreakdown } from "../systems/scoring/IScoringSystem";
import type { Position, Velocity } from "../types/Vector2";
import { ThemeType } from "../config/GameConfig";

export interface GameEvents {
  "score-changed": { score: number; breakdown: ScoreBreakdown };
  "ui-update": { score: number; pigsRemaining: number };
  "ui-birdQueue": { queue: BirdType[] };
  "ui-level": { level: number };
  "ui-pause": { isPaused: boolean };
  "ui-results": {
    level: number;
    score: number;
    stars: number;
    won: boolean;
    birdPositions?: { x: number; y: number; texture: string }[];
    pigPositions?: Position[];
    breakdown?: ScoreBreakdown;
  };
  "celebration-birds": { positions: { x: number; y: number; texture: string }[] };
  "celebration-pigs": { positions: Position[] };
  "ui-reset": void;
  "ui-pause-toggle": { isPaused: boolean };
  "ui-help-toggle": void;
  "ui-request-initial-state": void;

  birdCollision: { bird: Bird; impactSpeed: number; target: string; x: number; y: number };
  birdLaunched: { bird: Bird; velocity: Velocity };
  birdLanded: { bird: Bird };
  birdAbilityActivated: { bird: Bird; type: BirdType };
  splitCameraHandoff: { target: Phaser.GameObjects.GameObject; velocity: Velocity };

  pigCollision: { pig: Pig; impactSpeed: number; damage: number; target: string };
  pigDamaged: { pig: Pig; damage: number; currentHealth: number; maxHealth: number };
  pigDestroyed: { pig: Pig; size: PigSize; position: Position };

  explosion: { x: number; y: number; radius: number; sourceBody?: Matter.Body };
  birdSplit: {
    originalBird: Bird;
    x: number;
    y: number;
    count: number;
    angleOffset: number;
    velocity: Velocity;
  };
  eggDrop: { bird: Bird; x: number; y: number };

  "parallax:scroll": { scrollX: number; scrollY: number; zoom: number };
  "parallax:theme": { theme: ThemeType; transition?: boolean };
  "parallax:reset": void;
}

export type GameEventKey = keyof GameEvents;

export interface EventSubscription {
  dispose(): void;
}

export class SubscriptionGroup {
  private subscriptions: EventSubscription[] = [];

  add(subscription: EventSubscription): void {
    this.subscriptions.push(subscription);
  }

  disposeAll(): void {
    this.subscriptions.forEach((s) => s.dispose());
    this.subscriptions = [];
  }
}

export class EventBus {
  private emitter: Phaser.Events.EventEmitter;

  constructor() {
    this.emitter = new Phaser.Events.EventEmitter();
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof GameEvents>(
    event: K,
    callback: (payload: GameEvents[K]) => void,
    context?: unknown
  ): void {
    this.emitter.on(event, callback, context);
  }

  subscribe<K extends keyof GameEvents>(
    event: K,
    callback: (payload: GameEvents[K]) => void,
    context?: unknown
  ): EventSubscription {
    this.emitter.on(event, callback, context);

    return {
      dispose: () => {
        this.emitter.off(event, callback, context);
      },
    };
  }

  off<K extends keyof GameEvents>(
    event: K,
    callback: (payload: GameEvents[K]) => void,
    context?: unknown
  ): void {
    this.emitter.off(event, callback, context);
  }

  once<K extends keyof GameEvents>(
    event: K,
    callback: (payload: GameEvents[K]) => void,
    context?: unknown
  ): void {
    this.emitter.once(event, callback, context);
  }

  removeAllListeners(event?: keyof GameEvents): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}

export const gameEvents = new EventBus();
