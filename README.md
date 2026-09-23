![](img/logo.png)

# EstyJS 2.0

An emulator for the Atari ST, written in 100% pure JavaScript. Originally developed by
[Darren Coles](https://github.com/dmcoles/EstyJs/); maintained by Kai Eckert since 2024, marked by
the release of EstyJS 2.0 on November 13th.

EstyJS 2.0 runs here: [https://kaiec.github.io/EstyJS/](https://kaiec.github.io/EstyJS/)

## Documentation

Everything lives in [docs/](docs/index.md):

| | |
| --- | --- |
| [Disk images](docs/using/disks.md) | the formats it reads, and the ones it does not |
| [Keyboard](docs/using/keyboard.md) | how a host keyboard maps onto the ST's, and the full table |
| [Joystick](docs/using/joystick.md) | cursor keys, gamepads, and the switch between them |
| [Limitations](docs/using/limitations.md) | what is not emulated |
| [Tools](docs/inside/tools.md) | the command line helpers for sound, disks and the keyboard |
| [Releases](docs/releases.md) | what changed, and when |
| [Credits and license](docs/credits.md) | |

## Running it yourself

There is no build step: clone the repository and serve the directory with any static web server, for
example `python3 -m http.server`. Opening `index.html` straight from the file system does not work,
because browsers refuse the request that loads the TOS ROM from a `file://` page.

## Feedback

Please use the [issue system](https://github.com/kaiec/EstyJS/issues) to give feedback, report bugs
or suggest ideas for further improvements.

## License

EstyJS (i.e., the JavaScript files) is licensed under the GPL v2 (or later) license. See
[credits](docs/credits.md) for the parts that come from elsewhere.
