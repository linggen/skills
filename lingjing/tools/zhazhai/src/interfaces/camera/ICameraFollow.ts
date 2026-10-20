export interface CameraFollowConfig {
  lerp: number;
  roundPixels: boolean;
  preserveOffset?: boolean;
  manualTracking?: boolean;
}

export interface ICameraFollow {
  startFollow(target: Phaser.GameObjects.GameObject, config?: CameraFollowConfig): void;
  stopFollow(): void;
  setFollowLerp(lerp: number): void;
  isFollowing(): boolean;
  setFollowing(following: boolean): void;
}
