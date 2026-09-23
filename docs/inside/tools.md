# Tools

Command line helpers for working on EstyJS. Node only, no dependencies, nothing
to install. They are not part of the emulator and are not served to the browser.
They live in `tools/`, and are run from the repository root.

## Why these exist

Sound has two halves that fail in completely different ways, and the useful
thing these tools do is tell them apart:

- **Is the emulation right?** Does the emulated program write the right values
  to the YM2149 at the right moments? `record-psg.js` captures those writes and
  `render-psg.mjs` turns them into a WAV without any real-time behaviour
  involved. If that WAV sounds right, the emulator and the chip are fine.
- **Does the audio survive being played?** That is a question about clocks and
  buffering, and only a real browser can answer it. `browser-capture.js` records
  what actually comes out of the audio graph; `check-audio.mjs` looks for the
  dropouts that mean the audio path is starving.

The jitter that these tools were written to chase was entirely in the second
half. Checking both is what made that clear.

## Recording what a disk plays

```
node tools/record-psg.js <disk.st> <out.json> [options]
```

Boots the disk headlessly and logs every PSG register write with the ST clock
cycle it happened on, plus a screenshot of the final frame.

Self-booting disks need nothing else. Most `.st` images drop you at the EmuTOS
desktop instead, and the program has to be launched:

```
# find the program icon: record one frame and look at the screenshot
node tools/record-psg.js xmas1987.st /tmp/x.json --run 0,0 --frames 1
ffmpeg -f rawvideo -pix_fmt rgba -s 640x512 -i /tmp/x.screen.raw /tmp/x.png

# then double-click it (coordinates are ST pixels: x 0-639, y 0-199)
node tools/record-psg.js xmas1987.st /tmp/xmas.json --run 233,95 --frames 1500
```

`--key 32,32` presses keys after booting, for title screens that wait for one.
Joystick 1 is the cursor keys (37/38/39/40) and control (17), so `--key 17`
presses fire. For anything more involved - walking into a level and shooting -
drive `esty-headless.js` directly with `keyDown`/`keyUp`.

Screenshots come out as raw 640x512 RGBA, which `ffmpeg` will convert as above.

## Checking the documentation

```
node tools/check-docs.js
```

The documentation is markdown rendered in the browser, so nothing fails loudly
when a link goes stale. This checks that every page in the navigation exists,
that every page is reachable from it, that every relative link and image
resolves, that marked can parse all of them, and that the links from the website
point at real pages. It then runs the viewer itself against a stand-in for the
browser, to check that pages render and that links between them are rewritten.

## Checking that disks still read

```
node tools/check-disks.js [--check known.json] <image>...
```

Boots each image and hashes the frame. By default it opens the drive A window
first, so what gets hashed is a directory listing: it only comes out right if
the geometry, the boot sector, the FAT and the directory were all read
correctly, which makes it a usable check on the disk code.

```
node tools/check-disks.js --save known.json disks/*.st disks/*.msa disks/*.stx
node tools/check-disks.js --check known.json disks/*.st disks/*.msa disks/*.stx
```

`--boot-only` skips opening the window, for self-booting disks. `--png DIR`
writes the frames out as raw RGBA next to the hashes, converted the same way as
the screenshots above.

## Checking the keyboard mapping

```
node tools/check-keymap.js [--list]
```

Drives the keyboard on its own, without the rest of the machine: a key event
goes in, and the bytes the ACIA would hand the ST come out. Checks that every
physical key sends the scancode the ST expects, that all 95 ST keys are
reachable, that keys the ST does not have send nothing, and that browser
auto-repeat does not turn into a stream of make codes. `--list` prints the
mapping table.

## Checking the on screen keyboard

```
node tools/check-onscreen-keyboard.js [--list]
```

The panel in the page is a picture of a real ST keyboard, so what can quietly
go wrong is structural: a key listed twice, a row that no longer lines up with
the others, a missing ST key, a country missing its keycaps. All of that is in
the source, so it is checked there rather than by driving a browser. `--list`
prints the keycaps of all four countries side by side.

## Checking the joystick switch

```
node tools/check-joystick.js "disks/Buggy Boy - Elite.stx"
```

With the switch on, the cursor keys and control are joystick 1; with it off they
have to be ordinary keys. Nothing reports that directly, so it is measured
through a game that only listens to the joystick: two identical machines, one
key press, and whether the picture ends up different.

## Checking the file picker

```
node tools/check-picker.js
```

Runs the picker handlers from `esty2-gui.js` against a stub DOM and a stub
emulator, and checks the message and the drive state for each kind of file: one
that reads, one with a known extension that turns out not to be a disk, a format
EstyJS does not support, a snapshot, a cancelled dialog.

## Rendering a recording

```
node tools/render-psg.mjs <log.json> <out.wav> [sampleRate]
```

Renders the log through the same aym-js chip emulation the browser uses, walking
the sample grid and applying each write as it comes due. This is the reference:
what EstyJs should sound like with the real-time question taken out.

## Recording from a real browser

```
node tools/browser-capture.js <disk.st> <out.wav> [options]
```

Serves the working copy, drives headless Chromium, boots the disk, switches
sound on, taps the audio graph and writes out what was actually played. Takes
the same `--run` and `--key` options, plus `--mash 17,250` to keep pressing a
key while recording (sound effects usually need one held) and `--shot out.png`
to see where the machine actually got to. Also prints the worklet's own view of
itself: how many frames of sound are buffered ahead of playback, and the speed
correction being applied to hold it there. In good health that is a lead of
three to five frames and a speed within a percent or two of 1, barely moving.

Needs `chromium` on `PATH`.

## Looking for dropouts

```
node tools/check-audio.mjs <file.wav> [...]
```

Reports stretches where the signal falls to near nothing, and flags the ones
whose length is an exact multiple of 128 samples - the browser's render quantum,
and so the signature of a buffer underrun rather than a gap in the music.

Music with staccato notes has real gaps of its own, so always compare against a
`render-psg.mjs` render of the same music. If both reports show gaps of a
similar length, they are in the music. `xmas1987.st` is a good example: its
notes are short enough that both the offline render and a clean browser
recording report dozens of gaps, all around 500-600 samples, and none of them
are dropouts.

A recording made with `record-psg.js` also covers the time spent booting and
clicking through the desktop, which shows up as one long gap at the start. Only
the short ones are worth comparing.

## A worked comparison

```
node tools/record-psg.js rick.st /tmp/rick.json --key 32,32 --frames 1200
node tools/render-psg.mjs /tmp/rick.json /tmp/reference.wav
node tools/browser-capture.js rick.st /tmp/played.wav --key 32,32 --seconds 20
node tools/check-audio.mjs /tmp/reference.wav /tmp/played.wav
```

Run against the commit before the sound rework, `/tmp/played.wav` contains 306
dropouts in 20 seconds, 305 of them exactly 128 samples long. After it, none.

## A trap worth knowing

Sound effects and music can fail independently. Rick Dangerous plays its music
with the tone generators and its gun and explosions by switching a channel's
tone and noise off and driving the volume register as a DAC. A capture of the
title screen therefore says nothing at all about whether effects work - it has
to be a capture of actual play. Getting that wrong once cost a whole round of
"I checked, that case never happens".

## esty-headless.js

The module the recording tool is built on: it boots EstyJs under Node with the
browser objects it touches stubbed out, and exposes `run(frames)`, `insertDisk`,
`mouseTo`/`click`/`key`, `saveScreen` and `saveWrites`. Frames are pumped by hand
rather than by the clock, so runs are deterministic and go about thirteen times
faster than real time. Useful for any headless test, not just sound.
