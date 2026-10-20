import Phaser from "phaser";
import Matter from "matter-js";
import { BlockMaterial } from "../constants/Materials";
import { CollisionCategory } from "../constants";
import { BodyLabels } from "../constants/BodyLabels";
import type { IFragmentManager, IFragmentCollidable } from "../interfaces/IFragmentManager";
import { applyRadialImpulse } from "../utils/PhysicsUtils";
import {
  FRAGMENT_CONFIG,
  FRAGMENT_BODY_CONFIG,
  FRAGMENT_MANAGER_CONFIG,
  FRAGMENT_DEVICE_DETECTION_CONFIG,
} from "../config/PhysicsConfig";
import { DesignTokens } from "../config/DesignTokens";
import { materialRegistry } from "../config/registries/MaterialConfigRegistry";
import { FragmentVelocity } from "./fragment/FragmentVelocity";
import { FragmentAtlasCache, type BlockPreWarmConfig } from "./fragment/FragmentAtlasCache";
import { PerformanceManager } from "./PerformanceManager";
import { FragmentWorkerClient } from "../workers/fragmentWorkerClient";
import { LEVEL_ATLAS_KEY } from "../config/assetManifest";
import type { IWakeCascadeManager } from "../interfaces/IWakeCascadeManager";

interface FragmentEntry {
  body: Phaser.Physics.Matter.Image;
  spawnTime: number;
  poolSlotIndex?: number;
  material: BlockMaterial;
  area: number;
  vertexString: string;
  vertices: { x: number; y: number }[];
}

interface PooledFragment {
  body: Phaser.Physics.Matter.Image;
  vertexString: string;
  inUse: boolean;
}

interface QueuedFragment {
  fragX: number;
  fragY: number;
  atlasKey: string;
  frameName: string;
  vertexString: string;
  vertices: { x: number; y: number }[];
  originX: number;
  originY: number;
  rotation: number;
  vx: number;
  vy: number;
  angularVelocity: number;
  density: number;
  restitution: number;
  friction: number;
  spawnTime: number;
  material: BlockMaterial;
  area: number;
}

export type FragmentCollisionSoundCallback = (material: BlockMaterial, impactSpeed: number) => void;
export type FragmentCollisionHapticCallback = (
  material: BlockMaterial,
  impactSpeed: number,
  areaRatio: number
) => void;

const IMMEDIATE_TIME_BUDGET_MS = 4;

export class FragmentManager implements IFragmentManager {
  private readonly minFragmentSpeedSquared: number =
    FRAGMENT_MANAGER_CONFIG.minFragmentSpeed * FRAGMENT_MANAGER_CONFIG.minFragmentSpeed;
  private readonly collisionRadiusSquared: number =
    FRAGMENT_MANAGER_CONFIG.collisionRadius * FRAGMENT_MANAGER_CONFIG.collisionRadius;
  private readonly hapticCooldownMs: number = DesignTokens.mobile.hapticCooldowns.fragment;

  private scene: Phaser.Scene;
  private atlasCache: FragmentAtlasCache;
  private activeFragments: FragmentEntry[] = [];
  private fragmentPool: PooledFragment[] = [];
  private fragmentQueueHead: number = 0;
  private fragmentQueue: QueuedFragment[] = [];
  private poolByVertexString: Map<string, number[]> = new Map();
  private cleanupTimer!: Phaser.Time.TimerEvent | null;
  private destroyed: boolean = false;
  private frameCreatedCount: number = 0;
  private isLowEndDevice: boolean;
  private wakeManager: IWakeCascadeManager | null = null;
  private collisionSoundCallback: FragmentCollisionSoundCallback | null = null;
  private collisionHapticCallback: FragmentCollisionHapticCallback | null = null;
  private lastCollisionSoundTime: number = 0;
  private lastCollisionHapticTime: number = 0;
  private maxFragmentArea: number = 0;

  constructor(scene: Phaser.Scene, atlasCache?: FragmentAtlasCache) {
    this.scene = scene;
    this.atlasCache = atlasCache ?? new FragmentAtlasCache(scene);
    this.isLowEndDevice = PerformanceManager.isLowEndCPU();
    this.startBatchCleanup();
  }

  public setCollisionSoundCallback(callback: FragmentCollisionSoundCallback | null): void {
    this.collisionSoundCallback = callback;
  }

  public setCollisionHapticCallback(callback: FragmentCollisionHapticCallback | null): void {
    this.collisionHapticCallback = callback;
  }

  public setWakeCascadeManager(manager: IWakeCascadeManager): void {
    this.wakeManager = manager;
  }

  private startBatchCleanup(): void {
    this.cleanupTimer = this.scene.time.addEvent({
      delay: FRAGMENT_MANAGER_CONFIG.cleanupIntervalMs,
      callback: this.processExpiredFragments,
      callbackScope: this,
      loop: true,
    });
  }

  private processExpiredFragments(): void {
    if (this.destroyed || this.activeFragments.length === 0) return;

    const now = Date.now();
    const wakePositions: { x: number; y: number }[] = [];

    for (let i = this.activeFragments.length - 1; i >= 0; i--) {
      const entry = this.activeFragments[i];

      if (now - entry.spawnTime >= FRAGMENT_CONFIG.lifetime) {
        if (this.wakeManager && entry.body.active) {
          const pos = entry.body.getCenter();
          wakePositions.push({ x: pos.x, y: pos.y });
        }

        this.releaseFragment(entry.body, entry.poolSlotIndex, entry.vertexString);
        this.activeFragments.splice(i, 1);
      }
    }

    if (wakePositions.length > 0 && this.wakeManager) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      for (const p of wakePositions) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const radius = Math.max(maxX - minX, maxY - minY) / 2 + FRAGMENT_MANAGER_CONFIG.wakeRadius;

      this.wakeManager.wakeInRadiusImmediate(centerX, centerY, radius);
    }
  }

  public async createFragments(
    x: number,
    y: number,
    textureKey: string,
    width: number,
    height: number,
    material: string,
    impactSpeed: number,
    impactAngle: number = Math.PI / 2,
    rotation: number = 0
  ): Promise<Phaser.Physics.Matter.Image[]> {
    if (this.destroyed) return [];

    const mat = material as BlockMaterial;
    const fragmentConfig = materialRegistry.getFragment(mat);
    const baseCount = fragmentConfig?.count ?? 5;
    const fragmentCount = PerformanceManager.getScaledCount(this.scene, baseCount, 1);
    const relaxationIterations = fragmentConfig?.voronoiRelaxation ?? 2;

    const workerClient = FragmentWorkerClient.getInstance();
    const fragments = await workerClient.getOrGenerate(
      width,
      height,
      material,
      fragmentCount,
      relaxationIterations
    );

    const atlas = await this.atlasCache.getOrCreateAsync(
      LEVEL_ATLAS_KEY,
      textureKey,
      fragments,
      width,
      height,
      material
    );

    if (!atlas) {
      return [];
    }

    this.enforceFragmentCap(fragments.length);

    const qualityMultiplier = PerformanceManager.getQualityMultiplier(this.scene);
    const isHighQuality = qualityMultiplier >= FRAGMENT_BODY_CONFIG.qualityThreshold;
    const fragmentImages: Phaser.Physics.Matter.Image[] = [];
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const now = Date.now();

    const density = (fragmentConfig?.density ?? 0.006) * FRAGMENT_CONFIG.densityMultiplier;
    const restitution =
      fragmentConfig?.restitution ?? FRAGMENT_DEVICE_DETECTION_CONFIG.defaultRestitution;
    const friction = fragmentConfig?.friction ?? FRAGMENT_DEVICE_DETECTION_CONFIG.defaultFriction;

    const queuedItems: QueuedFragment[] = [];

    for (let index = 0; index < fragments.length; index++) {
      const fragment = fragments[index];

      if (fragment.area < FRAGMENT_CONFIG.minimumArea) {
        continue;
      }

      const vertexString = isHighQuality ? fragment.vertexStringHigh : fragment.vertexStringLow;
      if (!vertexString) continue;

      const rawVerts = isHighQuality
        ? fragment.simplifiedVerticesHigh
        : fragment.simplifiedVerticesLow;
      const vertices = rawVerts.map((v) => ({
        x: v.x - fragment.centerX,
        y: v.y - fragment.centerY,
      }));

      let spaceCount = 0;
      for (let i = 0; i < vertexString.length && spaceCount < 5; i++) {
        if (vertexString[i] === " ") spaceCount++;
      }
      if (spaceCount < 5) continue;

      const localX = fragment.centerX - width / 2;
      const localY = fragment.centerY - height / 2;
      const rotatedX = localX * cos - localY * sin;
      const rotatedY = localX * sin + localY * cos;
      const fragX = x + rotatedX;
      const fragY = y + rotatedY;

      const velocityData = FragmentVelocity.calculate(
        fragmentConfig,
        impactSpeed,
        impactAngle,
        fragment,
        width
      );

      queuedItems.push({
        fragX,
        fragY,
        atlasKey: atlas.atlasKey,
        frameName: atlas.frameNames[index],
        vertexString,
        vertices,
        originX: fragment.originX,
        originY: fragment.originY,
        rotation,
        vx: velocityData.vx,
        vy: velocityData.vy,
        angularVelocity: velocityData.angularVelocity,
        density,
        restitution,
        friction,
        spawnTime: now,
        material: mat,
        area: fragment.area,
      });
    }

    let maxArea = 0;
    for (let i = 0; i < queuedItems.length; i++) {
      if (queuedItems[i].area > maxArea) maxArea = queuedItems[i].area;
    }
    this.maxFragmentArea = Math.max(this.maxFragmentArea, maxArea);

    const immediateBudget = Math.max(
      0,
      FRAGMENT_MANAGER_CONFIG.fragmentsPerFrame - this.frameCreatedCount
    );
    const maxImmediate = this.isLowEndDevice
      ? FRAGMENT_MANAGER_CONFIG.lowEndImmediateFragments
      : FRAGMENT_MANAGER_CONFIG.immediateFragments;

    const budgetStart = performance.now();
    let immediateCount = 0;
    for (let i = 0; i < queuedItems.length; i++) {
      if (immediateCount >= maxImmediate || immediateCount >= immediateBudget) break;
      if (performance.now() - budgetStart >= IMMEDIATE_TIME_BUDGET_MS) break;

      const data = queuedItems[i];
      try {
        const body = this.createFragmentFromQueueData(data);
        fragmentImages.push(body);
        this.frameCreatedCount++;
        immediateCount++;
      } catch (e) {
        console.warn("Immediate fragment creation failed:", e);
      }
    }

    for (let i = immediateCount; i < queuedItems.length; i++) {
      this.fragmentQueue.push(queuedItems[i]);
    }

    return fragmentImages;
  }

  public processQueue(): void {
    this.frameCreatedCount = 0;

    if (this.destroyed || this.fragmentQueueHead >= this.fragmentQueue.length) {
      this.compactQueue();
      return;
    }

    const maxPerFrame = this.isLowEndDevice
      ? FRAGMENT_MANAGER_CONFIG.lowEndQueuePerFrame
      : FRAGMENT_MANAGER_CONFIG.maxQueueProcessingPerFrame;

    const budgetStart = performance.now();
    let processed = 0;

    while (this.fragmentQueueHead < this.fragmentQueue.length && processed < maxPerFrame) {
      if (performance.now() - budgetStart >= IMMEDIATE_TIME_BUDGET_MS) break;

      const data = this.fragmentQueue[this.fragmentQueueHead++];
      try {
        this.createFragmentFromQueueData(data);
        processed++;
      } catch (e) {
        console.warn("Queued fragment creation failed:", e);
      }
    }

    if (this.fragmentQueueHead >= this.fragmentQueue.length) {
      this.compactQueue();
    }
  }

  private compactQueue(): void {
    if (this.fragmentQueueHead > 0) {
      this.fragmentQueue.length = 0;
      this.fragmentQueueHead = 0;
    }
  }

  public hasQueuedFragments(): boolean {
    return this.fragmentQueueHead < this.fragmentQueue.length;
  }

  private createFragmentFromQueueData(data: QueuedFragment): Phaser.Physics.Matter.Image {
    const { body, poolSlotIndex } = this.acquireFragment(
      data.fragX,
      data.fragY,
      data.atlasKey,
      data.frameName,
      data.vertexString,
      data.vertices,
      data.originX,
      data.originY,
      data.density,
      data.restitution,
      data.friction,
      data.rotation
    );

    FragmentVelocity.applyFromData(body, {
      vx: data.vx,
      vy: data.vy,
      angularVelocity: data.angularVelocity,
    });

    body.setDepth(FRAGMENT_MANAGER_CONFIG.depth);
    body.setCollisionCategory(CollisionCategory.DEBRIS);
    body.setCollidesWith([
      CollisionCategory.BLOCK,
      CollisionCategory.GROUND,
      CollisionCategory.DEBRIS,
      CollisionCategory.PIG,
      CollisionCategory.BIRD,
    ]);

    if (body.body) {
      (body.body as Matter.Body).label = BodyLabels.FRAGMENT;
    }

    const material = data.material;
    const area = data.area;
    body.setOnCollide((event: Phaser.Types.Physics.Matter.MatterCollisionData) => {
      this.handleFragmentCollision(event, material, area);
    });

    this.activeFragments.push({
      body,
      spawnTime: data.spawnTime,
      poolSlotIndex,
      material,
      area,
      vertexString: data.vertexString,
      vertices: data.vertices,
    });

    return body;
  }

  private handleFragmentCollision(
    event: Phaser.Types.Physics.Matter.MatterCollisionData,
    material: BlockMaterial,
    area: number
  ): void {
    const dx = event.bodyA.velocity.x - event.bodyB.velocity.x;
    const dy = event.bodyA.velocity.y - event.bodyB.velocity.y;
    const speedSquared = dx * dx + dy * dy;

    if (speedSquared < FRAGMENT_MANAGER_CONFIG.minFragmentSpeed ** 2) return;

    const now = Date.now();
    const impactSpeed = Math.sqrt(speedSquared);
    const areaRatio = this.maxFragmentArea > 0 ? area / this.maxFragmentArea : 0.5;

    if (
      this.collisionSoundCallback &&
      now - this.lastCollisionSoundTime >= FRAGMENT_MANAGER_CONFIG.soundCooldownMs
    ) {
      this.lastCollisionSoundTime = now;
      this.collisionSoundCallback(material, impactSpeed);
    }

    if (
      this.collisionHapticCallback &&
      now - this.lastCollisionHapticTime >= this.hapticCooldownMs
    ) {
      this.lastCollisionHapticTime = now;
      this.collisionHapticCallback(material, impactSpeed, areaRatio);
    }
  }

  public hasActiveFragments(): boolean {
    return this.activeFragments.length > 0;
  }

  public getActiveFragmentCount(): number {
    return this.activeFragments.length;
  }

  private enforceFragmentCap(incomingCount: number): void {
    while (
      this.activeFragments.length > 0 &&
      this.activeFragments.length + incomingCount > FRAGMENT_MANAGER_CONFIG.maxActiveFragments
    ) {
      const entry = this.activeFragments.shift()!;
      this.releaseFragment(entry.body, entry.poolSlotIndex, entry.vertexString);
    }
  }

  private acquireFragment(
    x: number,
    y: number,
    textureKey: string,
    frameName: string,
    vertexString: string,
    vertices: { x: number; y: number }[],
    originX: number,
    originY: number,
    density: number,
    restitution: number,
    friction: number,
    rotation: number
  ): { body: Phaser.Physics.Matter.Image; poolSlotIndex?: number } {
    const pooled = this.tryGetFromPool(vertexString);
    if (pooled) {
      return {
        body: this.reinitializePooledFragment(
          pooled.body,
          x,
          y,
          textureKey,
          frameName,
          originX,
          originY,
          rotation
        ),
        poolSlotIndex: pooled.poolIdx,
      };
    }

    return {
      body: this.createFragmentBody(
        x,
        y,
        textureKey,
        frameName,
        vertexString,
        vertices,
        density,
        restitution,
        friction,
        originX,
        originY,
        rotation
      ),
    };
  }

  private tryGetFromPool(
    vertexString: string
  ): { body: Phaser.Physics.Matter.Image; poolIdx: number } | null {
    const indices = this.poolByVertexString.get(vertexString);
    if (!indices || indices.length === 0) {
      return null;
    }

    while (indices.length > 0) {
      const poolIdx = indices.pop()!;
      const pooled = this.fragmentPool[poolIdx];
      if (pooled && pooled.body?.scene) {
        pooled.inUse = true;
        return { body: pooled.body, poolIdx };
      }
    }

    return null;
  }

  private reinitializePooledFragment(
    body: Phaser.Physics.Matter.Image,
    x: number,
    y: number,
    textureKey: string,
    frameName: string,
    originX: number,
    originY: number,
    rotation: number
  ): Phaser.Physics.Matter.Image {
    body
      .setActive(true)
      .setVisible(true)
      .setTexture(textureKey, frameName)
      .setFrame(frameName, true, true)
      .setPosition(x, y)
      .setRotation(rotation)
      .setOrigin(originX, originY)
      .setStatic(false)
      .setSensor(false)
      .setIgnoreGravity(false)
      .setAwake()
      .setDepth(FRAGMENT_MANAGER_CONFIG.depth);

    return body;
  }

  private createFragmentBody(
    x: number,
    y: number,
    textureKey: string,
    frameName: string,
    _vertexString: string,
    vertices: { x: number; y: number }[],
    density: number,
    restitution: number,
    friction: number,
    originX: number,
    originY: number,
    rotation: number
  ): Phaser.Physics.Matter.Image {
    const body = this.scene.matter.add.image(x, y, textureKey, frameName, {
      shape: {
        type: "fromVertices",
        verts: vertices,
      },
      density,
      restitution,
      friction,
      frictionAir: FRAGMENT_CONFIG.frictionAir,
    });

    body.setOrigin(originX, originY);
    body.setRotation(rotation);
    body.setDepth(FRAGMENT_MANAGER_CONFIG.depth);
    body.setCollisionCategory(CollisionCategory.DEBRIS);
    body.setCollidesWith([
      CollisionCategory.BLOCK,
      CollisionCategory.GROUND,
      CollisionCategory.DEBRIS,
      CollisionCategory.PIG,
      CollisionCategory.BIRD,
    ]);

    if (body.body) {
      (body.body as Matter.Body).label = BodyLabels.FRAGMENT;
    }

    return body;
  }

  private releaseFragment(
    body: Phaser.Physics.Matter.Image,
    returnToSlot?: number,
    vertexString?: string
  ): void {
    if (!body.scene || this.fragmentPool.length >= FRAGMENT_MANAGER_CONFIG.maxPoolSize) {
      if (body.scene) {
        body.destroy();
      }
      if (returnToSlot !== undefined && returnToSlot < this.fragmentPool.length) {
        this.fragmentPool[returnToSlot] = null as unknown as PooledFragment;
      }
      return;
    }

    body.setVelocity(0, 0);
    body.setAngularVelocity(0);
    body.setSensor(true);
    body.setStatic(true);
    body.setIgnoreGravity(true);
    body.setPosition(
      FRAGMENT_MANAGER_CONFIG.poolHidePosition,
      FRAGMENT_MANAGER_CONFIG.poolHidePosition
    );
    body.setVisible(false);
    body.setActive(false);
    Matter.Sleeping.set(body.body as Matter.Body, true);

    if (returnToSlot !== undefined && vertexString) {
      const pooled: PooledFragment = { body, vertexString, inUse: false };
      if (returnToSlot < this.fragmentPool.length && this.fragmentPool[returnToSlot] === null) {
        this.fragmentPool[returnToSlot] = pooled;
      } else {
        this.fragmentPool.push(pooled);
      }

      if (!this.poolByVertexString.has(vertexString)) {
        this.poolByVertexString.set(vertexString, []);
      }
      this.poolByVertexString.get(vertexString)!.push(returnToSlot);
    } else if (body.scene) {
      body.destroy();
    }
  }

  public checkFragmentPigCollisions(targets: IFragmentCollidable[]): void {
    if (this.destroyed || this.activeFragments.length === 0) return;
    if (!PerformanceManager.shouldRunFragmentDamage(this.scene)) return;

    const camera = this.scene.cameras.main;
    const viewLeft = camera.scrollX - FRAGMENT_MANAGER_CONFIG.outOfBoundsMargin;
    const viewRight = camera.scrollX + camera.width + FRAGMENT_MANAGER_CONFIG.outOfBoundsMargin;
    const viewTop = camera.scrollY - FRAGMENT_MANAGER_CONFIG.outOfBoundsMargin;
    const viewBottom = camera.scrollY + camera.height + FRAGMENT_MANAGER_CONFIG.outOfBoundsMargin;

    for (const entry of this.activeFragments) {
      const fragment = entry.body;
      if (!fragment.active) continue;

      const fragPos = fragment.getCenter();

      if (
        fragPos.x < viewLeft ||
        fragPos.x > viewRight ||
        fragPos.y < viewTop ||
        fragPos.y > viewBottom
      ) {
        continue;
      }

      const fragVelocity = fragment.body?.velocity ?? { x: 0, y: 0 };
      const speedSquared = fragVelocity.x * fragVelocity.x + fragVelocity.y * fragVelocity.y;
      if (speedSquared < this.minFragmentSpeedSquared) continue;

      for (const target of targets) {
        if (target.isDestroyed()) continue;

        const targetPos = target.getPosition();
        const dx = fragPos.x - targetPos.x;
        const dy = fragPos.y - targetPos.y;
        const distSquared = dx * dx + dy * dy;

        if (distSquared < this.collisionRadiusSquared) {
          target.takeDamage(1);
        }
      }
    }
  }

  public cleanupOutOfBoundsFragments(bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): void {
    if (this.destroyed || this.activeFragments.length === 0) return;

    const margin = FRAGMENT_MANAGER_CONFIG.outOfBoundsMargin;

    for (let i = this.activeFragments.length - 1; i >= 0; i--) {
      const entry = this.activeFragments[i];
      const fragment = entry.body;
      if (!fragment.active) {
        this.releaseFragment(fragment, entry.poolSlotIndex, entry.vertexString);
        this.activeFragments.splice(i, 1);
        continue;
      }

      const pos = fragment.getCenter();
      if (
        pos.x < bounds.minX - margin ||
        pos.x > bounds.maxX + margin ||
        pos.y < bounds.minY - margin ||
        pos.y > bounds.maxY + margin
      ) {
        this.cleanupFragment(fragment, entry.poolSlotIndex, entry.vertexString);
      }
    }
  }

  private cleanupFragment(
    fragment: Phaser.Physics.Matter.Image,
    poolSlotIndex?: number,
    vertexString?: string
  ): void {
    this.releaseFragment(fragment, poolSlotIndex, vertexString);
    const idx = this.activeFragments.findIndex((e) => e.body === fragment);
    if (idx >= 0) {
      this.activeFragments.splice(idx, 1);
    }
  }

  public applyExplosionToActiveFragments(
    explosionX: number,
    explosionY: number,
    radius: number,
    pushSpeed: number
  ): void {
    if (this.destroyed || this.activeFragments.length === 0) return;

    for (const entry of this.activeFragments) {
      const body = entry.body;
      if (!body || !body.body) continue;

      const matterBody = body.body as Matter.Body;
      if (matterBody.isStatic) continue;

      applyRadialImpulse(matterBody, explosionX, explosionY, radius, pushSpeed);
    }
  }

  public async preWarmForLevel(configs: BlockPreWarmConfig[]): Promise<void> {
    return this.atlasCache.preWarmForLevel(configs);
  }

  public resetLevelState(): void {
    this.maxFragmentArea = 0;
    this.lastCollisionSoundTime = 0;
    this.lastCollisionHapticTime = 0;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.cleanupTimer) {
      this.cleanupTimer.remove();
      this.cleanupTimer = null;
    }

    this.fragmentQueue = [];

    for (const entry of this.activeFragments) {
      if (entry.body.active) {
        entry.body.destroy();
      }
    }
    this.activeFragments = [];

    for (const pooled of this.fragmentPool) {
      if (pooled && pooled.body.scene) {
        pooled.body.destroy();
      }
    }
    this.fragmentPool = [];
    this.poolByVertexString.clear();

    this.atlasCache.destroy();
  }
}
