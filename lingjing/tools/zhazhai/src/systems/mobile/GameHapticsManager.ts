import { gameEvents } from "../../events/EventBus";
import { DesignTokens as T } from "../../config/DesignTokens";
import type { IMobileSettingsProvider } from "../../interfaces/IMobileSettings";
import { BirdType } from "../../types/BirdType";
import type { ExplosionTier } from "../../config/PhysicsConfig";
import type { BlockMaterial } from "../../constants/Materials";

type HapticPattern = number | readonly number[];

export function executeVibration(pattern: HapticPattern): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  if (Array.isArray(pattern)) {
    navigator.vibrate([...pattern] as number[]);
  } else {
    navigator.vibrate(pattern as number);
  }
}

interface CooldownState {
  lastSlingshotPull: number;
  lastImpact: number;
  lastDestruction: number;
  lastExplosion: number;
  lastUI: number;
  lastFragment: number;
}

export interface GameHapticsManagerDeps {
  settingsProvider?: IMobileSettingsProvider;
}

export class GameHapticsManager {
  private settingsProvider?: IMobileSettingsProvider;
  private cooldowns: CooldownState = {
    lastSlingshotPull: 0,
    lastImpact: 0,
    lastDestruction: 0,
    lastExplosion: 0,
    lastUI: 0,
    lastFragment: 0,
  };

  constructor(deps: GameHapticsManagerDeps) {
    this.settingsProvider = deps.settingsProvider;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    gameEvents.on("birdCollision", this.onBirdCollision.bind(this));
    gameEvents.on("pigDestroyed", this.onPigDestroyed.bind(this));
    gameEvents.on("explosion", this.onExplosion.bind(this));
    gameEvents.on("birdAbilityActivated", this.onAbilityActivated.bind(this));
    gameEvents.on("birdSplit", this.onBirdSplit.bind(this));
    gameEvents.on("eggDrop", this.onEggDrop.bind(this));
    gameEvents.on("ui-results", this.onGameResults.bind(this));
  }

  private isHapticEnabled(): boolean {
    if (this.settingsProvider) {
      return this.settingsProvider.getSettings().hapticEnabled;
    }
    return T.mobile.hapticEnabled;
  }

  private vibrate(pattern: HapticPattern): void {
    if (!this.isHapticEnabled()) return;
    executeVibration(pattern);
  }

  private canTrigger(cooldownKey: keyof CooldownState, cooldownMs: number): boolean {
    const now = Date.now();
    const lastTrigger = this.cooldowns[cooldownKey];
    if (now - lastTrigger < cooldownMs) {
      return false;
    }
    this.cooldowns[cooldownKey] = now;
    return true;
  }

  private onBirdCollision(payload: { impactSpeed: number }): void {
    if (!this.canTrigger("lastImpact", T.mobile.hapticCooldowns.impact)) return;

    const speed = payload.impactSpeed;
    const haptic = T.mobile.haptic.impact;
    const thresholds = T.mobile.haptic.impact.speedThresholds;

    let pattern: HapticPattern;
    if (speed > thresholds.critical) {
      pattern = haptic.critical;
    } else if (speed > thresholds.heavy) {
      pattern = haptic.heavy;
    } else if (speed > thresholds.medium) {
      pattern = haptic.medium;
    } else {
      pattern = haptic.light;
    }

    this.vibrate(pattern);
  }

  private onPigDestroyed(): void {
    if (!this.canTrigger("lastDestruction", T.mobile.hapticCooldowns.destruction)) return;
    this.vibrate(T.mobile.haptic.destruction.pig);
  }

  onBlockDestroyed(material: BlockMaterial | "pig"): void {
    if (!this.canTrigger("lastDestruction", T.mobile.hapticCooldowns.destruction)) return;

    if (material === "pig") {
      this.vibrate(T.mobile.haptic.destruction.pig);
    } else if (material === "glass") {
      this.vibrate(T.mobile.haptic.destruction.debris);
    } else {
      this.vibrate(T.mobile.haptic.destruction.block);
    }
  }

  private onExplosion(payload: { radius: number }): void {
    if (!this.canTrigger("lastExplosion", T.mobile.hapticCooldowns.explosion)) return;

    const radius = payload.radius;
    const haptic = T.mobile.haptic.explosion;
    const thresholds = T.mobile.haptic.explosion.radiusThresholds;

    let pattern: HapticPattern;
    if (radius > thresholds.tnt) {
      pattern = haptic.tnt;
    } else if (radius > thresholds.large) {
      pattern = haptic.large;
    } else if (radius > thresholds.medium) {
      pattern = haptic.medium;
    } else {
      pattern = haptic.small;
    }

    this.vibrate(pattern);
  }

  triggerExplosionByTier(tier: ExplosionTier): void {
    if (!this.canTrigger("lastExplosion", T.mobile.hapticCooldowns.explosion)) return;

    const haptic = T.mobile.haptic.explosion;
    const tierPatterns: Record<ExplosionTier, HapticPattern> = {
      tntSmall: haptic.small,
      tntMedium: haptic.medium,
      tntLarge: haptic.large,
      blackBird: haptic.tnt,
    };

    this.vibrate(tierPatterns[tier] ?? haptic.medium);
  }

  private onAbilityActivated(payload: { type: BirdType }): void {
    const haptic = T.mobile.haptic.ability;
    const typePatterns: Partial<Record<BirdType, HapticPattern>> = {
      [BirdType.YELLOW]: haptic.speedBoost,
      [BirdType.BLUE]: haptic.split,
      [BirdType.WHITE]: haptic.eggDrop,
      [BirdType.BLACK]: haptic.explosion,
    };

    const pattern = typePatterns[payload.type] ?? haptic.speedBoost;
    this.vibrate(pattern);
  }

  private onBirdSplit(): void {
    this.vibrate(T.mobile.haptic.ability.split);
  }

  private onEggDrop(): void {
    this.vibrate(T.mobile.haptic.ability.eggDrop);
  }

  private onGameResults(payload: { won: boolean; stars: number }): void {
    const haptic = T.mobile.haptic.game;
    const delays = T.mobile.haptic.game.starRevealDelays;

    if (payload.won) {
      this.vibrate(haptic.win);
      if (payload.stars > 0) {
        setTimeout(() => this.vibrate(haptic.starReveal), delays.first);
      }
      if (payload.stars === 3) {
        setTimeout(() => this.vibrate(haptic.levelComplete), delays.second);
      }
    } else {
      this.vibrate(haptic.lose);
    }
  }

  triggerSlingshotPull(powerRatio: number): void {
    if (!this.canTrigger("lastSlingshotPull", T.mobile.hapticCooldowns.slingshotPull)) return;

    const haptic = T.mobile.haptic.slingshot;
    const thresholds = T.mobile.haptic.slingshot.pullThresholds;
    let pattern: HapticPattern;

    if (powerRatio >= thresholds.max) {
      pattern = haptic.pullMax;
    } else if (powerRatio > thresholds.heavy) {
      pattern = haptic.pullHeavy;
    } else if (powerRatio > thresholds.medium) {
      pattern = haptic.pullMedium;
    } else if (powerRatio > thresholds.light) {
      pattern = haptic.pullLight;
    } else {
      return;
    }

    this.vibrate(pattern);
  }

  triggerSlingshotFire(): void {
    this.vibrate(T.mobile.haptic.slingshot.fire);
  }

  triggerUIButton(): void {
    if (!this.canTrigger("lastUI", T.mobile.hapticCooldowns.ui)) return;
    this.vibrate(T.mobile.haptic.ui.buttonPress);
  }

  triggerUIToggle(): void {
    if (!this.canTrigger("lastUI", T.mobile.hapticCooldowns.ui)) return;
    this.vibrate(T.mobile.haptic.ui.toggle);
  }

  triggerUISlider(): void {
    if (!this.canTrigger("lastUI", T.mobile.hapticCooldowns.ui)) return;
    this.vibrate(T.mobile.haptic.ui.slider);
  }

  triggerUICardSelect(): void {
    if (!this.canTrigger("lastUI", T.mobile.hapticCooldowns.ui)) return;
    this.vibrate(T.mobile.haptic.ui.cardSelect);
  }

  triggerUICardLocked(): void {
    if (!this.canTrigger("lastUI", T.mobile.hapticCooldowns.ui)) return;
    this.vibrate(T.mobile.haptic.ui.cardLocked);
  }

  onFragmentImpact(material: BlockMaterial, impactSpeed: number, areaRatio: number): void {
    if (!this.canTrigger("lastFragment", T.mobile.hapticCooldowns.fragment)) return;

    const haptic = T.mobile.haptic.fragment;
    const config = T.mobile.haptic.fragment;
    const isLightMaterial = material === "glass";

    const speedFactor = Math.min(1, impactSpeed / config.speedNormalization);
    const sizeFactor = Math.min(1, areaRatio);
    const combinedFactor =
      speedFactor * sizeFactor * (isLightMaterial ? config.lightMaterialFactor : 1);

    let pattern: HapticPattern;
    if (combinedFactor < config.intensityThresholds.medium) {
      pattern = haptic.light;
    } else if (combinedFactor < config.intensityThresholds.heavy) {
      pattern = haptic.medium;
    } else {
      pattern = haptic.heavy;
    }

    this.vibrate(pattern);
  }

  destroy(): void {
    gameEvents.off("birdCollision", this.onBirdCollision.bind(this));
    gameEvents.off("pigDestroyed", this.onPigDestroyed.bind(this));
    gameEvents.off("explosion", this.onExplosion.bind(this));
    gameEvents.off("birdAbilityActivated", this.onAbilityActivated.bind(this));
    gameEvents.off("birdSplit", this.onBirdSplit.bind(this));
    gameEvents.off("eggDrop", this.onEggDrop.bind(this));
    gameEvents.off("ui-results", this.onGameResults.bind(this));
  }
}
