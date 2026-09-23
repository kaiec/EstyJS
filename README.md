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
