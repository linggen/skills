# DJ Karaoke — product spec

Sing to your library on the big screen. DJ finds the karaoke version, throws
lyrics on the TV, and mixes your voice with reverb over the track. Two modes:
**Party** (priority 1) and **Practice** (later).

## Party mode

All-in-one software karaoke. No extra hardware to start.

- **Video/lyrics → HDMI → TV.** TV speakers off. Wired, not AirPlay (AirPlay
  latency causes voice echo).
- **Audio → a speaker, never through the TV.** TV is the lyrics screen only.
- **Voice = Web Audio in the app.** Mic capture → reverb (`ConvolverNode`) +
  echo (`DelayNode`) → mixed with the backing track (`GainNode`) → output.
- Wired mic + wired speaker. **Bluetooth is banned on the live path** (adds
  100–300 ms).

## Source

Per track, best first:

1. **Karaoke video** — `ytsearch:<song> karaoke` → `yt-dlp` video. Lyrics burned
   in, vocals already removed. No vocal-removal step.
2. **Fallback: vocal removal** on the regular track — ffmpeg center-cancel
   (`pan=stereo|c0=c0-c1|c1=c1-c0`). Demucs is a later, opt-in clean tier.

Lyrics already auto-fetched (LRCLIB `.lrc`); a karaoke video needs none.

## Tiers + agent upsell

Agent guides the user up as they engage; each tier is optional.

- **Tier 0 — zero gear.** Built-in mic + any speaker. 30-second try.
- **Tier 1 — starter (~$20).** Wired USB mic. App does capture + FX + mix.
  Default party experience.
- **Tier 2 — upgrade.** Hardware mixer / powered karaoke speaker. App detects
  external output and switches to **external-mix mode**: drops software FX, plays
  backing track + lyrics only; hardware owns the voice.

Agent watches usage (sessions, device, room size) → suggests the next tier.

## Effects

Per-voice, real-time, software:

- Reverb amount, echo/delay, mic gain, key/pitch shift (later).
- `loudnorm` on backing tracks (already shipped in `download.js`).

## Practice mode (later)

Solo, Mac-only. Mic → local **DSP in JS** (pitch + timing, no Python) → score.
Numbers → LLM → coaching ("flat on the chorus highs — try head voice").
Optional: Gemini audio-listen for qualitative notes; transcription → staff
(Basic Pitch + VexFlow). Not a party feature; latency/bleed don't apply.

## Not in v1

Practice/coach mode; Demucs; pitch/key shift; transcription-to-staff;
multi-singer scoring; software echo-cancellation for speaker bleed.
