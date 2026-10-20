import Phaser from "phaser";
import {
  gameEvents,
  type EventSubscription,
  type GameEvents,
  type GameEventKey,
} from "../../events/EventBus";
import type { IAbilityHandler, AbilityEventType } from "./IAbilityHandler";
import type { IExplosionSystem } from "../explosion/IExplosionSystem";
import type { ISFXPlayer } from "../../interfaces/audio";
import type { IEventEmitter } from "../../interfaces/IEventEmitter";
import { ExplosionHandler, SplitHandler, EggDropHandler } from "./index";
import type { AbilityVFXManager } from "../vfx/AbilityVFXManager";

export interface AbilityHandlerRegistryDeps {
  scene: Phaser.Scene;
}

export class AbilityHandlerRegistry {
  private handlers: Map<AbilityEventType, IAbilityHandler<AbilityEventType>> = new Map();
  private subscriptions: Map<AbilityEventType, EventSubscription> = new Map();
  private scene: Phaser.Scene;

  constructor(deps: AbilityHandlerRegistryDeps) {
    this.scene = deps.scene;
  }

  public register<K extends AbilityEventType>(handler: IAbilityHandler<K>): void {
    const eventType = handler.eventType;

    if (this.handlers.has(eventType)) {
      console.warn(`Handler already registered for ${eventType}, replacing`);
      this.unregister(eventType);
    }

    this.handlers.set(eventType, handler as IAbilityHandler<AbilityEventType>);

    const boundHandler = (event: GameEvents[K]) => {
      handler.handle(event, this.scene);
    };

    const subscription = gameEvents.subscribe(eventType as K & GameEventKey, boundHandler);
    this.subscriptions.set(eventType, subscription);
  }

  public unregister(eventType: AbilityEventType): void {
    const subscription = this.subscriptions.get(eventType);
    if (subscription) {
      subscription.dispose();
      this.subscriptions.delete(eventType);
    }
    this.handlers.delete(eventType);
  }

  public get<K extends AbilityEventType>(eventType: K): IAbilityHandler<K> | undefined {
    return this.handlers.get(eventType) as IAbilityHandler<K> | undefined;
  }

  public has(eventType: AbilityEventType): boolean {
    return this.handlers.has(eventType);
  }

  public getRegisteredTypes(): AbilityEventType[] {
    return Array.from(this.handlers.keys());
  }

  public clear(): void {
    this.subscriptions.forEach((subscription) => {
      subscription.dispose();
    });
    this.subscriptions.clear();
    this.handlers.clear();
  }

  public destroy(): void {
    this.clear();
  }
}

export interface CreateAbilityHandlerRegistryDeps extends AbilityHandlerRegistryDeps {
  explosionSystem: IExplosionSystem;
  vfxManager: AbilityVFXManager;
  sfx: ISFXPlayer;
  eventEmitter: IEventEmitter;
}

export function createAbilityHandlerRegistry(
  deps: CreateAbilityHandlerRegistryDeps
): AbilityHandlerRegistry {
  const registry = new AbilityHandlerRegistry({ scene: deps.scene });

  registry.register(
    new ExplosionHandler({
      explosionSystem: deps.explosionSystem,
    })
  );

  registry.register(
    new SplitHandler({
      vfxManager: deps.vfxManager,
      sfx: deps.sfx,
      eventEmitter: deps.eventEmitter,
      getScene: () => deps.scene,
    })
  );

  registry.register(
    new EggDropHandler({
      vfxManager: deps.vfxManager,
      sfx: deps.sfx,
      eventEmitter: deps.eventEmitter,
    })
  );

  return registry;
}
