# Releases

## 2.0
- Fully working mouse pointer synchronisation.
- Fullscreen mode.
- All lines of the display are rendered, instead of only every other line to create a scan line effect. The scan line effect can still be activated if desired.
- EmuTOS 1.4 256k is used as ROM, so that EstyJS is fully open source and does not use any proprietary software.
- Sound is rewritten around the AYM·JS chip emulation and played from an AudioWorklet, which fixes the long-standing jitter, the wandering pitch, and sampled sound effects that were silent (issue #1).
- Design of the new logo.
- Redesign of the default website.
