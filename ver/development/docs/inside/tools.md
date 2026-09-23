# Tools

Command line helpers in `tools/`, run from the repository root. Node only, no dependencies. Not
part of the emulator and not served to the browser.

`esty-headless.js` boots EstyJS under Node with the browser objects it touches stubbed out, and
exposes `run(frames)`, `insertDisk`, `mouseTo`, `click`, `key`, `saveScreen` and `saveWrites`.
Frames are pumped by hand, so runs are deterministic and about thirteen times faster than real time.
The other tools are built on it.

## Publishing

    tools/publish-pages.sh [--remote NAME] [--branch NAME] [--root REF] [--into DIR]
                           [--skip PATTERN] [--push] [--jekyll] [--dry-run]

Publishes the root ref at the root of the `pages` branch, and every other branch and tag under
`ver/`, with `ver/index.html` listing them. Commits, and pushes only with `--push`.

The container directory keeps the root clean and reserves one name instead of one per branch.
`--into` changes it, `--into .` publishes at the root. Publishing stops if the root ref already has
an entry of that name.

`.nojekyll` is written unless `--jekyll` is given. GitHub Pages otherwise runs the branch through
Jekyll, which drops folders called `vendor` or `node_modules` and anything starting with `_` or `.`.
It has no effect on git-pages.

The branch is rebuilt from the refs on each run, so a deleted branch loses its directory. Identical
files share their git object: publishing five versions of EstyJS costs about 12 KiB.

Forgejo releases are their tags, which are published. Release assets are not.

git-pages does not poll, so a push has to reach it through a webhook or the git-pages Forgejo
action. GitHub Pages rebuilds on push.

## Checks

    node tools/check-docs.js
    node tools/check-keymap.js [--list]
    node tools/check-onscreen-keyboard.js [--list]
    node tools/check-picker.js
    node tools/check-disks.js [--check known.json] <image>...
    node tools/check-joystick.js <disk>

`check-docs` verifies that every page in the navigation exists, that every page is reachable, that
links and images resolve, that marked parses every page, and that the website links to real pages.
It then runs the viewer against a stub DOM.

`check-keymap` drives the keyboard alone: a key event goes in, the bytes the ACIA hands the ST come
out. Checks the scancode of every physical key, that all 95 ST keys are reachable, that unknown keys
send nothing, and that browser auto-repeat does not produce repeated make codes. `--list` prints the
mapping table.

`check-onscreen-keyboard` checks the panel's structure from source: row widths, every ST key present
once, four countries with keycaps, the national differences, the ISO key rule. `--list` prints the
keycaps side by side.

`check-picker` runs the file picker handlers from `esty2-gui.js` against a stub DOM and a stub
emulator, and checks message and drive state per file type.

`check-disks` boots each image and hashes the frame. Unless `--boot-only` is given it opens the
drive A window first, so the frame is a directory listing, which only renders correctly if geometry,
boot sector, FAT and directory were read correctly. `--save` writes the hashes, `--check` compares
against them, `--png DIR` writes the frames as raw RGBA.

`check-joystick` measures the joystick switch through a game that responds to joystick 1 only: two
identical machines, one key press, and whether the frames differ. Needs a disk that stops at a
joystick prompt, such as Buggy Boy.

## Sound

Sound fails in two independent ways. Whether the emulated program writes the right values to the
YM2149 at the right time is answered offline by `record-psg.js` and `render-psg.mjs`. Whether the
audio path delivers them without starving can only be answered in a browser, by `browser-capture.js`
and `check-audio.mjs`.

### Recording what a disk plays

    node tools/record-psg.js <disk.st> <out.json> [options]

Boots the disk headlessly and logs every PSG register write with the ST clock cycle it happened on,
plus a screenshot of the final frame. Screenshots are raw 640x512 RGBA:

    ffmpeg -f rawvideo -pix_fmt rgba -s 640x512 -i /tmp/x.screen.raw /tmp/x.png

Self-booting disks need no options. Others drop at the EmuTOS desktop and the program has to be
launched with `--run X,Y`, in ST pixels (x 0-639, y 0-199). Record one frame first to find the icon.
`--key 32,32` presses keys after booting. Joystick 1 is the cursor keys (37/38/39/40) and control
(17), so `--key 17` presses fire. For anything longer, drive `esty-headless.js` directly.

### Rendering a recording

    node tools/render-psg.mjs <log.json> <out.wav> [sampleRate]

Renders the log through the same aym-js chip emulation the browser uses. This is the reference for
what EstyJS should sound like, with real-time behaviour taken out.

### Recording from a browser

    node tools/browser-capture.js <disk.st> <out.wav> [options]

Serves the working copy, drives headless Chromium, boots the disk, switches sound on and writes out
what was played. Takes the same `--run` and `--key` options, plus `--mash 17,250` to keep pressing a
key while recording (sound effects usually need one held) and `--shot out.png`. Prints the
worklet's buffer lead and speed correction: in good health, three to five frames of lead and a speed
within a percent or two of 1. Needs `chromium` on `PATH`.

### Looking for dropouts

    node tools/check-audio.mjs <file.wav> [...]

Reports stretches where the signal falls to near nothing, and flags those whose length is a multiple
of 128 samples, the browser's render quantum and the signature of a buffer underrun.

Staccato music has gaps of its own, so compare against a `render-psg.mjs` render of the same music.
In `xmas1987.st` both the offline render and a clean browser recording report dozens of gaps of
500-600 samples, none of them dropouts. A `record-psg.js` recording also covers booting and clicking
through the desktop, which shows up as one long gap at the start.

### A worked comparison

    node tools/record-psg.js rick.st /tmp/rick.json --key 32,32 --frames 1200
    node tools/render-psg.mjs /tmp/rick.json /tmp/reference.wav
    node tools/browser-capture.js rick.st /tmp/played.wav --key 32,32 --seconds 20
    node tools/check-audio.mjs /tmp/reference.wav /tmp/played.wav

Before the sound rework `/tmp/played.wav` contains 306 dropouts in 20 seconds, 305 of them exactly
128 samples long. After it, none.

### Effects are not music

Rick Dangerous plays music with the tone generators, and its gun and explosions by switching a
channel's tone and noise off and driving the volume register as a DAC. A capture of the title screen
says nothing about whether effects work; it has to be a capture of actual play.
