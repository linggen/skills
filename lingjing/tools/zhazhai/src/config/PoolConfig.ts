export interface PoolSizeConfig {
  initialSize: number;
  maxSize: number;
}

export interface PoolConfigType {
  offScreenPosition: number;
  offScreenPosition2D: { x: number; y: number };
  default: PoolSizeConfig;
  image: PoolSizeConfig;
  text: PoolSizeConfig;
  graphics: PoolSizeConfig;
  circle: PoolSizeConfig & { defaultRadius: number };
  rectangle: PoolSizeConfig;
}

export const POOL_CONFIG: PoolConfigType = {
  offScreenPosition: -1000,
  offScreenPosition2D: { x: -1000, y: -1000 },
  default: { initialSize: 10, maxSize: 100 },
  image: { initialSize: 10, maxSize: 100 },
  text: { initialSize: 10, maxSize: 50 },
  graphics: { initialSize: 10, maxSize: 50 },
  circle: { initialSize: 10, maxSize: 50, defaultRadius: 10 },
  rectangle: { initialSize: 5, maxSize: 20 },
} as const;
