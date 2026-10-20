export enum CameraMode {
  Idle = "idle",
  Aim = "aim",
  ReleaseHold = "releaseHold",
  FlightAcquire = "flightAcquire",
  FlightCruise = "flightCruise",
  ImpactFocus = "impactFocus",
}

export function isFlightCameraMode(mode: CameraMode): boolean {
  return mode === CameraMode.FlightAcquire || mode === CameraMode.FlightCruise;
}

export function usesReleaseBlend(mode: CameraMode): boolean {
  return mode === CameraMode.ReleaseHold || mode === CameraMode.FlightAcquire;
}

export function blocksAimReset(mode: CameraMode): boolean {
  return (
    mode === CameraMode.ReleaseHold ||
    mode === CameraMode.FlightAcquire ||
    mode === CameraMode.FlightCruise
  );
}
