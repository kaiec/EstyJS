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
