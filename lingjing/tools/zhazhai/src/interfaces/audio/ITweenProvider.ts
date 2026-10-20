export interface TweenConfig {
  from: number;
  to: number;
  duration: number;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}

export interface ITween {
  stop(): void;
}

export interface ITweenProvider {
  createTween(config: TweenConfig): ITween;
}
