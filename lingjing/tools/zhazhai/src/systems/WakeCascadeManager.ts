import Matter from "matter-js";
import Phaser from "phaser";
import type { IWakeCascadeManager } from "../interfaces/IWakeCascadeManager";
import { WAKE_CASCADE_CONFIG } from "../config/PhysicsConfig";
import { BodyCache } from "../utils/BodyCache";

interface WakeRequest {
  x: number;
  y: number;
  radius: number;
}

interface CascadeRequest {
  x: number;
  y: number;
  blockWidth: number;
}

export class WakeCascadeManager implements IWakeCascadeManager {
  private scene: Phaser.Scene | null = null;
  private engine: Matter.Engine | null = null;
  private pendingWakeRequests: WakeRequest[] = [];
  private pendingCascadeRequests: CascadeRequest[] = [];
  private isProcessing: boolean = false;
  private processScheduled: boolean = false;

  constructor() {}

  initialize(scene: Phaser.Scene): void {
    this.scene = scene;
    this.engine = scene.matter.world.engine as Matter.Engine;
    BodyCache.getInstance().initialize(scene);
  }

  reset(): void {
    this.pendingWakeRequests = [];
    this.pendingCascadeRequests = [];
    this.isProcessing = false;
    this.processScheduled = false;
  }

  destroy(): void {
    this.reset();
    this.scene = null;
    this.engine = null;
  }

  requestWakeInRadius(x: number, y: number, radius: number): void {
    this.pendingWakeRequests.push({ x, y, radius });
    this.scheduleProcessing();
  }

  wakeInRadiusImmediate(x: number, y: number, radius: number): void {
    if (!this.engine) return;

    // Pre-compute squared radius for faster distance check
    const radiusSquared = radius * radius;

    const bounds = {
      min: { x: x - radius, y: y - radius },
      max: { x: x + radius, y: y + radius },
    };

    const bodiesInRegion = BodyCache.getInstance().getBodiesInRegion(this.engine, bounds);

    for (const body of bodiesInRegion) {
      if (body.isStatic || !body.isSleeping) continue;

      const dx = body.position.x - x;
      const dy = body.position.y - y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared < radiusSquared) {
        Matter.Sleeping.set(body, false);
      }
    }
  }

  requestCascadeOnDestruction(x: number, y: number, blockWidth: number): void {
    const coalesceDistanceSquared = WAKE_CASCADE_CONFIG.cascadeCoalesceDistance ** 2;

    for (const existing of this.pendingCascadeRequests) {
      const dx = existing.x - x;
      const dy = existing.y - y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared < coalesceDistanceSquared) {
        return;
      }
    }

    this.pendingCascadeRequests.push({ x, y, blockWidth });

    for (let pass = 1; pass < WAKE_CASCADE_CONFIG.cascadePasses; pass++) {
      this.scene?.time.delayedCall(WAKE_CASCADE_CONFIG.delayMs * pass, () => {
        this.pendingCascadeRequests.push({ x, y, blockWidth });
        this.scheduleProcessing();
      });
    }

    this.scheduleProcessing();
  }

  private scheduleProcessing(): void {
    if (this.processScheduled || !this.scene) return;

    this.processScheduled = true;

    this.scene.time.delayedCall(0, () => {
      this.processScheduled = false;
      this.processAllRequests();
    });
  }

  private processAllRequests(): void {
    if (this.isProcessing || !this.engine) return;
    if (this.pendingWakeRequests.length === 0 && this.pendingCascadeRequests.length === 0) return;

    this.isProcessing = true;

    if (this.pendingWakeRequests.length > 0 && this.pendingCascadeRequests.length > 0) {
      this.processWithSpatialQuery();
    } else if (this.pendingWakeRequests.length > 0) {
      this.processWakeRequestsOnly();
    } else {
      this.processCascadeRequestsOnly();
    }

    this.isProcessing = false;

    if (this.pendingWakeRequests.length > 0 || this.pendingCascadeRequests.length > 0) {
      this.scheduleProcessing();
    }
  }

  private processWithSpatialQuery(): void {
    // Reference swap instead of spread copy - avoids allocating new arrays
    const wakeRequests = this.pendingWakeRequests;
    const cascadeRequests = this.pendingCascadeRequests;
    this.pendingWakeRequests = [];
    this.pendingCascadeRequests = [];

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const req of wakeRequests) {
      minX = Math.min(minX, req.x - req.radius);
      minY = Math.min(minY, req.y - req.radius);
      maxX = Math.max(maxX, req.x + req.radius);
      maxY = Math.max(maxY, req.y + req.radius);
    }

    for (const req of cascadeRequests) {
      const halfWidth = req.blockWidth / 2 + WAKE_CASCADE_CONFIG.horizontalMargin;
      minX = Math.min(minX, req.x - halfWidth);
      minY = Math.min(minY, req.y - WAKE_CASCADE_CONFIG.verticalRange);
      maxX = Math.max(maxX, req.x + halfWidth);
      maxY = Math.max(maxY, req.y + WAKE_CASCADE_CONFIG.verticalRange);
    }

    // Expand degenerate bounds (all requests at same position with 0 radius)
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    const minExpand = 1;
    if (boundsWidth < minExpand) {
      const center = (minX + maxX) / 2;
      minX = center - minExpand / 2;
      maxX = center + minExpand / 2;
    }
    if (boundsHeight < minExpand) {
      const center = (minY + maxY) / 2;
      minY = center - minExpand / 2;
      maxY = center + minExpand / 2;
    }

    const bounds = {
      min: { x: minX, y: minY },
      max: { x: maxX, y: maxY },
    };

    const bodiesInRegion = BodyCache.getInstance().getBodiesInRegion(this.engine!, bounds);

    for (const body of bodiesInRegion) {
      if (body.isStatic || !body.isSleeping) continue;
      if (body.collisionFilter?.category === WAKE_CASCADE_CONFIG.debrisCategory) continue;

      const bodyX = body.position.x;
      const bodyY = body.position.y;

      let shouldWake = false;

      // Check against wake requests - compute radiusSquared inline instead of pre-allocating map
      for (let i = 0; i < wakeRequests.length; i++) {
        const req = wakeRequests[i];
        const dx = bodyX - req.x;
        const dy = bodyY - req.y;
        const distSquared = dx * dx + dy * dy;
        const radiusSquared = req.radius * req.radius;

        if (distSquared < radiusSquared) {
          shouldWake = true;
          break;
        }
      }

      if (!shouldWake) {
        for (const req of cascadeRequests) {
          const halfWidth = req.blockWidth / 2 + WAKE_CASCADE_CONFIG.horizontalMargin;
          const range = WAKE_CASCADE_CONFIG.verticalRange;

          if (Math.abs(bodyY - req.y) < range && Math.abs(bodyX - req.x) < halfWidth) {
            shouldWake = true;
            break;
          }
        }
      }

      if (shouldWake) {
        Matter.Sleeping.set(body, false);
      }
    }
  }

  private processWakeRequestsOnly(): void {
    // Reference swap instead of spread copy
    const wakeRequests = this.pendingWakeRequests;
    this.pendingWakeRequests = [];

    if (wakeRequests.length === 0 || !this.engine) return;

    if (wakeRequests.length === 1) {
      // Single request - direct call is cheaper than spatial query setup
      const req = wakeRequests[0];
      this.wakeInRadiusImmediate(req.x, req.y, req.radius);
      return;
    }

    // Multiple requests - compute merged bounds for a single spatial query
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const req of wakeRequests) {
      minX = Math.min(minX, req.x - req.radius);
      minY = Math.min(minY, req.y - req.radius);
      maxX = Math.max(maxX, req.x + req.radius);
      maxY = Math.max(maxY, req.y + req.radius);
    }

    const bounds = {
      min: { x: minX, y: minY },
      max: { x: maxX, y: maxY },
    };

    const bodiesInRegion = BodyCache.getInstance().getBodiesInRegion(this.engine, bounds);

    for (const body of bodiesInRegion) {
      if (body.isStatic || !body.isSleeping) continue;

      const bodyX = body.position.x;
      const bodyY = body.position.y;

      for (const req of wakeRequests) {
        const dx = bodyX - req.x;
        const dy = bodyY - req.y;
        const distSquared = dx * dx + dy * dy;
        const radiusSquared = req.radius * req.radius;

        if (distSquared < radiusSquared) {
          Matter.Sleeping.set(body, false);
          break;
        }
      }
    }
  }

  private processCascadeRequestsOnly(): void {
    // Reference swap instead of spread copy
    const cascadeRequests = this.pendingCascadeRequests;
    this.pendingCascadeRequests = [];

    if (cascadeRequests.length === 0 || !this.engine) return;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const req of cascadeRequests) {
      const halfWidth = req.blockWidth / 2 + WAKE_CASCADE_CONFIG.horizontalMargin;
      minX = Math.min(minX, req.x - halfWidth);
      minY = Math.min(minY, req.y - WAKE_CASCADE_CONFIG.verticalRange);
      maxX = Math.max(maxX, req.x + halfWidth);
      maxY = Math.max(maxY, req.y + WAKE_CASCADE_CONFIG.verticalRange);
    }

    const bounds = {
      min: { x: minX, y: minY },
      max: { x: maxX, y: maxY },
    };

    const bodiesInRegion = BodyCache.getInstance().getBodiesInRegion(this.engine!, bounds);

    for (const body of bodiesInRegion) {
      if (body.isStatic || !body.isSleeping) continue;
      if (body.collisionFilter?.category === WAKE_CASCADE_CONFIG.debrisCategory) continue;

      const bodyX = body.position.x;
      const bodyY = body.position.y;

      for (const req of cascadeRequests) {
        const halfWidth = req.blockWidth / 2 + WAKE_CASCADE_CONFIG.horizontalMargin;
        const range = WAKE_CASCADE_CONFIG.verticalRange;

        if (Math.abs(bodyY - req.y) < range && Math.abs(bodyX - req.x) < halfWidth) {
          Matter.Sleeping.set(body, false);
          break;
        }
      }
    }
  }

  wakeBodyDirectly(body: Matter.Body): void {
    if (body.isSleeping && !body.isStatic) {
      Matter.Sleeping.set(body, false);
    }
  }
}
