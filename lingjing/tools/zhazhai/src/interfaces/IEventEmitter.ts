import type { GameEvents } from "../events/EventBus";

export interface IEventEmitter {
  emit<K extends keyof GameEvents>(event: K, data: GameEvents[K]): void;
}
