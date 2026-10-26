// kit/device.js — a game line that names a key, a mouse button or a click is data with two faces, never a
// sentence code builds (Hanli 10-26, through the coordinator: 「空格亦可」 stood on the phone). A line is a plain
// string (the same everywhere) or `{ desk, touch }`: `desk` where a mouse and a keyboard are, `touch` on a
// phone. The host says which (the phone app's page sets <html data-input="touch">, games/phone/host.js); with
// no word from the host, the device's own pointer decides.

/// 'touch' or 'desk' for this page.
export function inputKind(doc = globalThis.document) {
  const said = doc?.documentElement?.dataset?.input;
  if (said === 'touch' || said === 'desk') return said;
  const mm = globalThis.matchMedia;
  return typeof mm === 'function' && mm('(hover: none) and (pointer: coarse)').matches ? 'touch' : 'desk';
}

/// The face of `line` for this input: a `{ desk, touch }` pair's own, else the line as it is.
export function forInput(line, kind = inputKind()) {
  if (line && typeof line === 'object' && ('desk' in line || 'touch' in line)) return line[kind] ?? line.desk ?? line.touch ?? '';
  return line ?? '';
}

/// A `{ zh, en }` text whose sides may be pairs: the side for `lang`, then its face for the input.
export const howFor = (how, lang, kind = inputKind()) => forInput(how?.[lang] ?? how?.zh, kind);
