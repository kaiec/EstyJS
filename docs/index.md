# EstyJS

EstyJS is an emulator for the Atari ST, written in 100% pure JavaScript, originally developed by
Darren Coles. Since 2024 and the release of EstyJS 2.0, the project is maintained by Kai Eckert.

It runs here: [https://kaiec.github.io/EstyJS/](https://kaiec.github.io/EstyJS/)

EstyJS is not a full emulation. It focuses on running games and old software in a browser tab, and
is honest about where it stops - see [limitations](using/limitations.md).

## Using it

- [Disk images](using/disks.md) - the formats it reads, and the ones it does not
- [Keyboard](using/keyboard.md) - how a host keyboard maps onto the ST's, and the full table
- [Joystick](using/joystick.md) - cursor keys, gamepads, and the switch between them
- [Limitations](using/limitations.md) - what is not emulated

## Working on it

- [Tools](inside/tools.md) - the command line helpers for sound, disks and the keyboard

## How this is published

These pages are markdown files under `docs/`, rendered in the browser by
[`docs.html`](../docs.html) using [marked](https://github.com/markedjs/marked). There is no build
step and no generator: the files are the documentation, whether they are read here, in an editor, or
on whichever forge the repository is hosted on. Any copy of the repository is a complete
documentation site, served by any static web server.

The navigation above is read from this page, so a new page is added by writing it and linking it
here.

## About

- [Releases](releases.md) - what changed, and when
- [Credits and license](credits.md)

## The machine

![An Atari ST](../img/Atari_1040STf-600.png)

The Atari ST was a 16 bit home computer that was very popular in the late 80's and early 90's. It
was the direct competitor of the Commodore Amiga and both machines were based upon the 68000 CPU.
It was first released in 1985 and was very sucessful in the professional music industry due to
having MIDI ports as standard.
