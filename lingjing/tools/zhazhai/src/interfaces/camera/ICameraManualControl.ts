export interface ICameraManualControl {
  handleDrag(deltaX: number): void;
  handleDragEnd(): void;
  zoomTo(scale: number, duration?: number): void;
  handleManualZoom(delta: number): void;
}
