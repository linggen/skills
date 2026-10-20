import Phaser from "phaser";
import { bootstrapAudio } from "../config/bootstrap";
import { DesignTokens as T } from "../config/DesignTokens";
import { LayoutManager } from "../ui/LayoutManager";
import { MobileManager } from "../systems/mobile";
import { FragmentWorkerClient } from "../workers/fragmentWorkerClient";
import {
  BOOT_SCENE_CONFIG,
  BOOT_PROGRESS_BAR_CONFIG,
  BOOT_SCENE_TEXT_CONFIG,
} from "../config/BootSceneConfig";

const TIPS = [
  "Aim for the Aliens!",
  "Some blocks are easier to break than others.",
  "Friendly Aliens have different abilities.",
  "Higher scores earn more stars!",
  "Watch out for TNT crates!",
];

const PROGRESS_WIDTH = BOOT_PROGRESS_BAR_CONFIG.width;
const PROGRESS_HEIGHT = BOOT_PROGRESS_BAR_CONFIG.height;
const PROGRESS_RADIUS = BOOT_PROGRESS_BAR_CONFIG.radius;
const C = BOOT_SCENE_CONFIG;
const PC = C.progressColors;

export class BootScene extends Phaser.Scene {
  private progressBarFill!: Phaser.GameObjects.Graphics;
  private progressBarBg!: Phaser.GameObjects.Graphics;
  private loadingText!: Phaser.GameObjects.Text;
  private tipText!: Phaser.GameObjects.Text;
  private tipTimerEvent: Phaser.Time.TimerEvent | null = null;
  private currentTipIndex: number = 0;

  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    this.createLoadingScreen();
    this.loadAssets();

    this.load.on("progress", (value: number) => {
      this.drawProgressFill(value);
    });

    this.load.on("complete", () => {
      this.onLoadComplete();
    });
  }

  private createLoadingScreen(): void {
    const { CENTER_X, CENTER_Y, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } = LayoutManager;

    const bg = this.add.graphics();
    bg.fillStyle(C.backgroundColor, 1);
    bg.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    bg.lineStyle(C.grid.lineWidth, C.grid.lineColor, 1);
    for (let y = 0; y < VIEWPORT_HEIGHT; y += C.grid.lineSpacing) {
      bg.moveTo(0, y);
      bg.lineTo(VIEWPORT_WIDTH, y);
    }
    for (let x = 0; x < VIEWPORT_WIDTH; x += C.grid.lineSpacing) {
      bg.moveTo(x, 0);
      bg.lineTo(x, VIEWPORT_HEIGHT);
    }
    bg.strokePath();

    this.progressBarBg = this.add.graphics();
    this.drawProgressBg();

    this.progressBarFill = this.add.graphics();
    this.drawProgressFill(0);

    this.loadingText = this.add.text(CENTER_X, CENTER_Y + C.loadingTextY, "LOADING...", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.button}px`,
      color: T.colors.neutral.white,
      stroke: T.colors.neutral.black,
      strokeThickness: BOOT_SCENE_TEXT_CONFIG.loadingStrokeThickness,
    });
    this.loadingText.setOrigin(0.5);

    this.tipText = this.add.text(CENTER_X, CENTER_Y + C.tipTextY, "", {
      fontFamily: T.fonts.family,
      fontSize: `${T.fonts.sizes.label}px`,
      color: T.colors.neutral.grey,
      stroke: T.colors.neutral.black,
      strokeThickness: BOOT_SCENE_TEXT_CONFIG.tipStrokeThickness,
      wordWrap: { width: VIEWPORT_WIDTH - C.wordWrapPadding },
      align: "center",
    });
    this.tipText.setOrigin(0.5);
    this.updateTip();

    this.tipTimerEvent = this.time.addEvent({
      delay: C.tipRotationDelay,
      callback: this.updateTip,
      callbackScope: this,
      loop: true,
    });
  }

  private drawProgressBg(): void {
    const { CENTER_X, CENTER_Y } = LayoutManager;
    const x = CENTER_X - PROGRESS_WIDTH / 2;
    const y = CENTER_Y;

    this.progressBarBg.clear();

    this.progressBarBg.fillStyle(PC.background, 1);
    this.progressBarBg.fillRoundedRect(
      x - C.borderPadding,
      y - C.borderPadding,
      PROGRESS_WIDTH + C.borderPadding * 2,
      PROGRESS_HEIGHT + C.borderPadding * 2,
      PROGRESS_RADIUS + C.borderRadius / C.borderPadding
    );

    this.progressBarBg.lineStyle(C.borderLineWidth, PC.border, 1);
    this.progressBarBg.strokeRoundedRect(x, y, PROGRESS_WIDTH, PROGRESS_HEIGHT, PROGRESS_RADIUS);

    this.progressBarBg.fillStyle(PC.innerBg, 1);
    this.progressBarBg.fillRoundedRect(x, y, PROGRESS_WIDTH, PROGRESS_HEIGHT, PROGRESS_RADIUS);
  }

  private drawProgressFill(value: number): void {
    const { CENTER_X, CENTER_Y } = LayoutManager;
    const x = CENTER_X - PROGRESS_WIDTH / 2;
    const y = CENTER_Y;
    const fillWidth = Math.max(0, (PROGRESS_WIDTH - C.borderPadding) * Math.min(1, value));

    this.progressBarFill.clear();

    if (fillWidth > 0) {
      this.progressBarFill.fillStyle(PC.fill, 1);
      this.progressBarFill.fillRoundedRect(
        x + C.borderPadding / 2,
        y + C.borderPadding / 2,
        fillWidth,
        PROGRESS_HEIGHT - C.borderPadding,
        PROGRESS_RADIUS - C.borderPadding / 2
      );

      this.progressBarFill.fillStyle(PC.highlight, PC.highlightAlpha);
      this.progressBarFill.fillRoundedRect(
        x + C.borderPadding / 2,
        y + C.borderPadding / 2,
        fillWidth,
        (PROGRESS_HEIGHT - C.borderPadding) / 2,
        PROGRESS_RADIUS - C.borderPadding / 2
      );
    }
  }

  private updateTip(): void {
    const tip = TIPS[this.currentTipIndex];

    this.tweens.add({
      targets: this.tipText,
      alpha: 0,
      duration: T.duration.fast,
      ease: "Quad.In",
      onComplete: () => {
        this.tipText.setText(`"${tip}"`);
        this.tweens.add({
          targets: this.tipText,
          alpha: 1,
          duration: T.duration.normal,
          ease: "Quad.Out",
        });
      },
    });

    this.currentTipIndex = (this.currentTipIndex + 1) % TIPS.length;
  }

  private onLoadComplete(): void {
    this.loadingText.setText("READY!");

    FragmentWorkerClient.getInstance();

    this.cameras.main.fadeOut(C.fadeOutDuration, 0, 0, 0);
    this.time.delayedCall(C.fadeOutDuration, () => {
      this.scene.start("MenuScene");
    });
  }

  private loadAssets(): void {
    this.loadFonts();
    this.loadBackgrounds();
    this.loadUI();
    this.loadLevel();
    this.loadVFX();
    this.loadAudio();
    this.loadShaders();
  }

  private loadShaders(): void {
    this.load.glsl("ExplosionShader", "shaders/explosion.frag");
    this.load.glsl("TransitionShader", "shaders/transition.frag");
  }

  private loadFonts(): void {
    this.load.font("Kenney Bold", "UI/fonts/kenney_bold-webfont.woff", "woff");
  }

  private loadBackgrounds(): void {
    this.load.atlas("backgrounds", "atlases/background.png", "atlases/background.json");
  }

  private loadUI(): void {
    this.load.atlas("UI", "atlases/UI.png", "atlases/UI.json");
  }

  private loadLevel(): void {
    this.load.atlas("level", "atlases/level.png", "atlases/level.json");
  }

  private loadVFX(): void {
    this.load.atlas("vfx", "atlases/vfx.png", "atlases/vfx.json");
  }

  private loadAudio(): void {
    this.load.audioSprite("sfx-master", "audio/sprites/sfx-master.json");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(`#${C.backgroundColor.toString(16).padStart(6, "0")}`);
    bootstrapAudio(this.game, this);
    this.setupMobileFeatures();
  }

  private setupMobileFeatures(): void {
    const mobileManager = MobileManager.getInstance();

    // Setup auto-fullscreen on first touch for mobile
    if (mobileManager.isMobile()) {
      this.input.once("pointerdown", () => {
        mobileManager.requestFullscreen();
      });
    }

    // Attempt to lock orientation to landscape
    mobileManager.lockLandscape();
  }

  shutdown(): void {
    if (this.tipTimerEvent) {
      this.tipTimerEvent.remove();
      this.tipTimerEvent = null;
    }

    if (this.progressBarFill) {
      this.progressBarFill.destroy();
    }

    if (this.progressBarBg) {
      this.progressBarBg.destroy();
    }

    if (this.loadingText) {
      this.loadingText.destroy();
    }

    if (this.tipText) {
      this.tipText.destroy();
    }
  }
}

export default BootScene;
