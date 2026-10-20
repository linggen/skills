import Phaser from "phaser";
import { LayoutManager } from "../ui/LayoutManager";
import { SCENE_KEYS } from "../config/UIConstants";
import { DesignTokens } from "../config/DesignTokens";
import {
  type TransitionColors,
  TRANSITION_THEME_COLORS,
  DEFAULT_TRANSITION_COLORS,
  PATTERN_KEYS,
  TRANSITION_DURATION,
} from "../config/TransitionConfig";
import type { ThemeType } from "../config/GameConfig";

interface TransitionData {
  targetScene: string;
  sceneData?: object;
  colors: TransitionColors;
  patternKey: string;
  scenesToStop: string[];
}

type TransitionPhase = "idle" | "covering" | "holding" | "revealing";

export class TransitionScene extends Phaser.Scene {
  private shader: Phaser.GameObjects.Shader | null = null;
  private inputBlocker: Phaser.GameObjects.Rectangle | null = null;
  private phase: TransitionPhase = "idle";
  private progress: number = 0;
  private duration: number = 0;
  private elapsedTime: number = 0;
  private pendingTransition: TransitionData | null = null;
  private revealRequested: boolean = false;

  constructor() {
    super({ key: SCENE_KEYS.TRANSITION });
  }

  create(): void {
    // Reset state in case scene was stopped and relaunched
    this.phase = "idle";
    this.progress = 0;
    this.elapsedTime = 0;
    this.pendingTransition = null;
    this.revealRequested = false;

    const { VIEWPORT_WIDTH, VIEWPORT_HEIGHT, CENTER_X, CENTER_Y } = LayoutManager;

    this.shader = this.add.shader("TransitionShader", 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    this.shader.setOrigin(0);
    this.shader.setDepth(DesignTokens.depth.overlay);
    this.shader.setScrollFactor(0);
    this.shader.setVisible(false);

    this.inputBlocker = this.add.rectangle(
      CENTER_X,
      CENTER_Y,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
      0x000000,
      0
    );
    this.inputBlocker.setInteractive();
    this.inputBlocker.setDepth(DesignTokens.depth.overlay - 1);
    this.inputBlocker.setScrollFactor(0);
    this.inputBlocker.setVisible(false);
  }

  /**
   * Start a transition to a new scene.
   * Called via SceneNavigator.
   */
  startTransition(
    targetScene: string,
    sceneData: object | undefined,
    colors: TransitionColors,
    scenesToStop: string[],
    patternKey?: string
  ): void {
    if (this.phase !== "idle") {
      console.warn("Transition already in progress");
      return;
    }

    const selectedPattern = patternKey ?? Phaser.Utils.Array.GetRandom([...PATTERN_KEYS]);

    this.pendingTransition = {
      targetScene,
      sceneData,
      colors,
      patternKey: selectedPattern,
      scenesToStop,
    };

    this.setupShader(colors, selectedPattern);

    this.shader?.setVisible(true);
    this.inputBlocker?.setVisible(true);

    this.phase = "covering";
    this.progress = 0;
    this.elapsedTime = 0;
    this.duration = TRANSITION_DURATION.COVER;
    this.shader?.setUniform("uDirection.value", 1.0);
    this.shader?.setUniform("uProgress.value", 0.0);
  }

  private setupShader(colors: TransitionColors, patternKey: string): void {
    if (!this.shader) return;

    const frame = this.textures.getFrame("vfx", patternKey);
    if (frame) {
      this.shader.setUniform("uFrameUV0.value.x", frame.u0);
      this.shader.setUniform("uFrameUV0.value.y", frame.v0);
      this.shader.setUniform("uFrameUV1.value.x", frame.u1);
      this.shader.setUniform("uFrameUV1.value.y", frame.v1);
    }

    this.shader.setSampler2D("iChannel0", "vfx", 0);

    this.shader.setUniform("uColor1.value.x", colors.primary[0]);
    this.shader.setUniform("uColor1.value.y", colors.primary[1]);
    this.shader.setUniform("uColor1.value.z", colors.primary[2]);
    this.shader.setUniform("uColor2.value.x", colors.secondary[0]);
    this.shader.setUniform("uColor2.value.y", colors.secondary[1]);
    this.shader.setUniform("uColor2.value.z", colors.secondary[2]);
  }

  /**
   * Called by target scene in create() to trigger reveal phase.
   */
  requestReveal(): void {
    if (this.phase === "holding") {
      this.startReveal();
    } else {
      this.revealRequested = true;
    }
  }

  private startReveal(): void {
    this.phase = "revealing";
    this.progress = 0;
    this.elapsedTime = 0;
    this.duration = TRANSITION_DURATION.REVEAL;
    this.shader?.setUniform("uDirection.value", 0.0);
    this.shader?.setUniform("uProgress.value", 0.0);
  }

  update(_time: number, delta: number): void {
    if (this.phase === "idle") return;

    this.elapsedTime += delta;
    this.progress = Math.min(this.elapsedTime / this.duration, 1.0);

    this.shader?.setUniform("uProgress.value", this.progress);

    if (this.phase === "covering" && this.progress >= 1.0) {
      this.onCoverComplete();
    } else if (this.phase === "revealing" && this.progress >= 1.0) {
      this.onRevealComplete();
    }
  }

  private onCoverComplete(): void {
    this.phase = "holding";

    if (this.pendingTransition) {
      // Stop old scenes now that they're fully covered
      for (const key of this.pendingTransition.scenesToStop) {
        if (this.scene.isActive(key)) {
          this.scene.stop(key);
        }
      }

      this.scene.launch(this.pendingTransition.targetScene, this.pendingTransition.sceneData);
    }

    if (this.revealRequested) {
      this.revealRequested = false;
      this.startReveal();
    }
  }

  private onRevealComplete(): void {
    this.phase = "idle";
    this.shader?.setVisible(false);
    this.inputBlocker?.setVisible(false);
    this.pendingTransition = null;
    this.revealRequested = false;
  }

  isTransitioning(): boolean {
    return this.phase !== "idle";
  }

  static getColorsForTheme(theme?: ThemeType): TransitionColors {
    if (!theme) return DEFAULT_TRANSITION_COLORS;
    return TRANSITION_THEME_COLORS[theme] ?? DEFAULT_TRANSITION_COLORS;
  }

  shutdown(): void {
    if (this.shader) {
      this.shader.destroy();
      this.shader = null;
    }

    if (this.inputBlocker) {
      this.inputBlocker.destroy();
      this.inputBlocker = null;
    }

    this.pendingTransition = null;
    this.phase = "idle";
    this.progress = 0;
    this.elapsedTime = 0;
    this.revealRequested = false;
  }
}
