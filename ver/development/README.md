![](img/logo.png)

# EstyJS 2.0

This is the new official home of EstyJS, since I took over the further maintenance from [Darren Coles](https://github.com/dmcoles/EstyJs/) in 2024, marked by the release of EstyJS 2.0 on November 13th.

EstyJS 2.0 runs here: [https://kaiec.github.io/EstyJS/](https://kaiec.github.io/EstyJS/)

## Documentation

[docs/](docs/index.md), rendered in the browser by `docs.html`.

- [Disk images](docs/using/disks.md)
- [Keyboard](docs/using/keyboard.md)
- [Joystick](docs/using/joystick.md)
- [Limitations](docs/using/limitations.md)
- [Tools](docs/inside/tools.md)
- [Releases](docs/releases.md)
- [Credits and license](docs/credits.md)

## Running it yourself

No build step. Serve the directory with any static web server, for example `python3 -m http.server`.
Opening `index.html` from the file system does not work, because browsers refuse the request that
loads the TOS ROM from a `file://` page.

## Feedback

Please use the [issue system](https://github.com/kaiec/EstyJS/issues) to give feedback, report bugs or suggest ideas for further improvements.

## License and Credits

EstyJS (i.e., the JavaScript files) is licensed under the GPL v2 (or later) license. See [credits](docs/credits.md).
