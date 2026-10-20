// Material configuration registry
export { MaterialConfigRegistry, materialRegistry } from "./MaterialConfigRegistry";

export type {
  MaterialConfig,
  MaterialVFXProfile,
  MaterialCameraConfig,
  MaterialSoundConfig,
  MaterialExplosionConfig,
  MaterialFragmentConfig,
} from "./MaterialConfigRegistry";

// Dependency injection container
export { ServiceContainer, ServiceTokens, createServiceContainer } from "./ServiceContainer";

export type { ServiceToken, ServiceFactory, ServiceRegistration } from "./ServiceContainer";
