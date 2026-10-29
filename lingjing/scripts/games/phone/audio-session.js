// Web Audio in iOS defaults to ambient even when the native app uses playback.
// This page is the phone's explicit game playback; unsupported browsers stay as they are.
export function enablePlayback(nav = globalThis.navigator) {
  try {
    if (!nav?.audioSession) return false;
    nav.audioSession.type = 'playback';
    return nav.audioSession.type === 'playback';
  } catch {
    return false;
  }
}
