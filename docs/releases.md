# Releases

## Unreleased
- `.stx` (Pasti) images are read. Sectors are found by address field, with the recorded FDC status.
- `.msa` decoding of single sided images fixed.
- Keys are identified by position (`KeyboardEvent.code`) instead of by key code. All 95 ST keys are
  reachable on any layout.
- Joystick switch is a button again, and switches.
- ST keyboard drawn in the page, as key tester and on screen keyboard.
- The file picker reports files it cannot read.
- Documentation moved to `docs/`, rendered by `docs.html`.

## 2.0
- Fully working mouse pointer synchronisation.
- Fullscreen mode.
- All lines of the display are rendered, instead of only every other line to create a scan line effect. The scan line effect can still be activated if desired.
- EmuTOS 1.4 256k is used as ROM, so that EstyJS is fully open source and does not use any proprietary software.
- Sound rewritten around the AYM·JS chip emulation and played from an AudioWorklet. Fixes jitter, wandering pitch and silent sampled effects (issue #1).
- Design of the new logo.
- Redesign of the default website.
