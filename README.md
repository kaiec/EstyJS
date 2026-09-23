![](img/logo.png)

# EstyJS 2.0

This is the new official home of EstyJS, since I took over the further maintenance from [Darren Coles](https://github.com/dmcoles/EstyJs/) in 2024, marked by the release of EstyJS 2.0 on November 13th.

EstyJS 2.0 runs here: [https://kaiec.github.io/EstyJS/](https://kaiec.github.io/EstyJS/)

## Changes from 1.0
- Fully working mouse pointer synchronisation.
- Fullscreen mode.
- All lines of the display are rendered, instead of only every other line to create a scan line effect. The scan line effect can still be activated if desired.
- EmuTOS 1.4 256k is used as ROM, so that EstyJS is fully open source and does not use any proprietary software.
- Sound is rewritten around the AYM·JS chip emulation and played from an AudioWorklet, which fixes the long-standing jitter, the wandering pitch, and sampled sound effects that were silent (issue #1).
- Design of the new logo.
- Redesign of the default website.

## Disk images

Every image format is decoded into the same thing - tracks holding sectors, each sector carrying the
address field the disk controller would find on it - so the FDC never deals with file layouts. A
sector is located by matching that address field against the sector and track registers, the way the
WD1772 does, rather than by computing an offset into the image.

| Format | What it is | EstyJS |
| --- | --- | --- |
| `.st` | Raw dump of all sectors, no header. Written for PaCifiST and now the common exchange format. | **yes** |
| `.msa` | Magic Shadow Archiver: 10 byte header, then one block per track and side, run length encoded on `$E5`. | **yes** |
| `.stx` | Pasti. Track level, with the address field, FDC status and unstable bytes of every sector recorded, so protected originals can be preserved. | **yes**, see below |
| `.zip` | Archive holding one `.st`, `.msa` or `.stx` image. | **yes** |
| `.sts` | Steem memory snapshot. Not a disk image, but loaded through the same button. | **load only** |
| `.dim` | FastCopy Pro: 32 byte header, then sectors. Some images hold only the sectors the FAT marks as used. | no, but could be |
| `.stt` | Steem track level format (`STEM` magic), sector and raw track data per track. | no |
| `.ipf`, `.ctr` | Software Preservation Society and KryoFlux. Track and flux level, read through the closed source CAPS library. | no |
| `.scp` | SuperCard Pro flux capture. | no |
| `.stw` | Steem's own writable track level format. | no |
| `.hfe` | HxC bitstream image, used by hardware floppy emulators such as the Gotek. | no |
| `.st.gz`, `.msa.gz` | Gzipped images. | no |
| `.img`, `.hdv` | ACSI or IDE hard disk images. EstyJS has no hard disk emulation at all. | no |

The geometry of an `.st` image is not stored anywhere in the file: it is worked out from the image
length together with the sector count in the boot sector, trying 9, 10 and 11 sectors per track.
Images with an unusual layout and no usable boot sector may therefore be misread. `.msa` and `.stx`
carry their geometry with them and do not have that problem.

### What .stx support covers

Read from the image and acted on:

- the address field of every sector, so unusual sector numbers work and a sector whose recorded track
  number disagrees with the track register answers record-not-found, as it would on the real machine;
- the recorded FDC status of each sector: CRC errors, deleted data marks, and sectors that have an
  address field but no data;
- fuzzy bytes, which read differently on every revolution, from the mask the image stores;
- whole track reads, answered from the track image, which is what several protected originals check;
- read address, which is how a program discovers what a track really holds.

Not emulated, all of it to do with time:

- the disk does not rotate. There is no index pulse, and a sector is found immediately instead of
  when it comes round;
- the read time recorded for each sector is ignored, as are the timing records that describe bit rate
  variation inside a sector (Macrodos and Speedlock protections);
- a track read always starts at the index, rather than wherever the head happens to be.

Protections that measure how long something takes, or where on the track the head is, therefore
still fail. Writing to an `.stx` image and formatting are not supported.

## Keyboard

Keys are identified by position, not by the character they produce: the emulator reads
`KeyboardEvent.code`, which names the physical key the same way on every keyboard layout and in
every browser, and an ST scancode means a position too. So the table below is the whole story
regardless of whether the keyboard is US, German or French - what matters is where a key sits, not
what is printed on it.

The consequence worth knowing: EmuTOS here uses a US keyboard table. On a German keyboard the key
marked `Z` sits where a US keyboard has `Y`, so the ST receives `Y`. That is the right answer for
games, which read scancodes by position, and the wrong one for typing. A symbolic mode, where the
character matters more than the position, would be a second mapping on top of this one.

Keys the ST has and a PC does not:

| ST key | Where it is |
| --- | --- |
| Undo | `PageUp` |
| Help | `PageDown` |
| ISO key (`< >` on a European ST) | `IntlBackslash`, the key beside left shift on ISO keyboards |
| Keypad `(` | `NumLock` |
| Keypad `)` | `ScrollLock` |

Cursor keys and control are joystick 1 unless the Joystick button is switched off.

`node tools/check-keymap.js` checks that every one of these reaches the ST as the right scancode,
and `--list` prints the table.

<details>
<summary>The full mapping, all 97 physical keys</summary>

| Physical key | ST key | Scancode |
| --- | --- | --- |
| `Escape` | `Esc` | `0x01` |
| `Digit1` | `1` | `0x02` |
| `Digit2` | `2` | `0x03` |
| `Digit3` | `3` | `0x04` |
| `Digit4` | `4` | `0x05` |
| `Digit5` | `5` | `0x06` |
| `Digit6` | `6` | `0x07` |
| `Digit7` | `7` | `0x08` |
| `Digit8` | `8` | `0x09` |
| `Digit9` | `9` | `0x0A` |
| `Digit0` | `0` | `0x0B` |
| `Minus` | `-` | `0x0C` |
| `Equal` | `=` | `0x0D` |
| `Backspace` | `Backspace` | `0x0E` |
| `Tab` | `Tab` | `0x0F` |
| `KeyQ` | `Q` | `0x10` |
| `KeyW` | `W` | `0x11` |
| `KeyE` | `E` | `0x12` |
| `KeyR` | `R` | `0x13` |
| `KeyT` | `T` | `0x14` |
| `KeyY` | `Y` | `0x15` |
| `KeyU` | `U` | `0x16` |
| `KeyI` | `I` | `0x17` |
| `KeyO` | `O` | `0x18` |
| `KeyP` | `P` | `0x19` |
| `BracketLeft` | `[` | `0x1A` |
| `BracketRight` | `]` | `0x1B` |
| `Enter` | `Return` | `0x1C` |
| `ControlLeft` | `Control` | `0x1D` |
| `ControlRight` | `Control` | `0x1D` |
| `KeyA` | `A` | `0x1E` |
| `KeyS` | `S` | `0x1F` |
| `KeyD` | `D` | `0x20` |
| `KeyF` | `F` | `0x21` |
| `KeyG` | `G` | `0x22` |
| `KeyH` | `H` | `0x23` |
| `KeyJ` | `J` | `0x24` |
| `KeyK` | `K` | `0x25` |
| `KeyL` | `L` | `0x26` |
| `Semicolon` | `;` | `0x27` |
| `Quote` | `'` | `0x28` |
| `Backquote` | ``` | `0x29` |
| `ShiftLeft` | `left Shift` | `0x2A` |
| `Backslash` | `\\` | `0x2B` |
| `KeyZ` | `Z` | `0x2C` |
| `KeyX` | `X` | `0x2D` |
| `KeyC` | `C` | `0x2E` |
| `KeyV` | `V` | `0x2F` |
| `KeyB` | `B` | `0x30` |
| `KeyN` | `N` | `0x31` |
| `KeyM` | `M` | `0x32` |
| `Comma` | `,` | `0x33` |
| `Period` | `.` | `0x34` |
| `Slash` | `/` | `0x35` |
| `ShiftRight` | `right Shift` | `0x36` |
| `AltLeft` | `Alternate` | `0x38` |
| `AltRight` | `Alternate` | `0x38` |
| `Space` | `Space` | `0x39` |
| `CapsLock` | `Caps Lock` | `0x3A` |
| `F1` | `F1` | `0x3B` |
| `F2` | `F2` | `0x3C` |
| `F3` | `F3` | `0x3D` |
| `F4` | `F4` | `0x3E` |
| `F5` | `F5` | `0x3F` |
| `F6` | `F6` | `0x40` |
| `F7` | `F7` | `0x41` |
| `F8` | `F8` | `0x42` |
| `F9` | `F9` | `0x43` |
| `F10` | `F10` | `0x44` |
| `Home` | `Home` | `0x47` |
| `ArrowUp` | `Up` | `0x48` |
| `ArrowLeft` | `Left` | `0x4B` |
| `ArrowRight` | `Right` | `0x4D` |
| `ArrowDown` | `Down` | `0x50` |
| `Insert` | `Insert` | `0x52` |
| `Delete` | `Delete` | `0x53` |
| `IntlBackslash` | the ISO key, < > on a European ST | `0x60` |
| `PageUp` | `Undo` | `0x61` |
| `PageDown` | `Help` | `0x62` |
| `NumLock` | keypad ( | `0x63` |
| `ScrollLock` | keypad ) | `0x64` |
| `NumpadDivide` | keypad / | `0x65` |
| `NumpadMultiply` | keypad * | `0x66` |
| `NumpadSubtract` | keypad - | `0x4A` |
| `NumpadAdd` | keypad + | `0x4E` |
| `Numpad7` | keypad 7 | `0x67` |
| `Numpad8` | keypad 8 | `0x68` |
| `Numpad9` | keypad 9 | `0x69` |
| `Numpad4` | keypad 4 | `0x6A` |
| `Numpad5` | keypad 5 | `0x6B` |
| `Numpad6` | keypad 6 | `0x6C` |
| `Numpad1` | keypad 1 | `0x6D` |
| `Numpad2` | keypad 2 | `0x6E` |
| `Numpad3` | keypad 3 | `0x6F` |
| `Numpad0` | keypad 0 | `0x70` |
| `NumpadDecimal` | keypad . | `0x71` |
| `NumpadEnter` | keypad Enter | `0x72` |

</details>

## Feedback
Please use the [issue system](https://github.com/kaiec/EstyJS/issues) to give feedback, report bugs or suggest ideas for further improvements.

## License and Credits

EstyJS (i.e., the JavaScript files) is licensed under the GPL v2 (or later) license.  

Further credits:
- **processor.js** is based on code from [SAE](https://github.com/naTmeg/ScriptedAmigaEmulator), licensed under GPL V2. It is based on [WinUAE](https://github.com/tonioni/WinUAE) and [UAE](https://github.com/bernds/UAE/) respectively, both GPL V2.
- **estyjs/aym-js/aym-emulator.js** is the YM2149 emulation from [AYM·JS](https://github.com/ponceto/aym-js) by Olivier Poncet, licensed under GPL V2 (or later), included unmodified. `estyjs/ym2149.js` carries the one correction EstyJS needs on top of it, as a subclass, so that the vendored copy stays replaceable.
- **sound.js** used code from the [DelphiSpec emulator](https://worldofspectrum.net/pub/sinclair/emulators/pc/windows/DelphiSpecSource03.zip), licensed under GPL V2, until it was rewritten around AYM·JS.
- **etos256us.img** and **etos192us.img** are EmuTOS 1.4 (US English), licensed under GPL V2, and no integral part of this project.
- **Atari_1040STf-600.png** is adapted from [Bill Bertram](https://en.wikipedia.org/wiki/File:Atari_1040STf.jpg), licensed under CC-BY-SA 2.5.
- **Sporniket Nostalgie v2** is a font inspired from the Atari ST system font, created by [David Sporn](https://github.com/sporniket/Sporniket-Nostalgie-Sans), licensed under SIL OFL 1.1.
