/*

This file is part of EstyJS.

EstyJS is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 2 of the License, or (at your option) any later
version.

EstyJS is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
EstyJS. If not, see <https://www.gnu.org/licenses/>.

Get in touch: https://github.com/kaiec/EstyJS

Current maintainer (since 2024): Kai Eckert
*/


// the ST keyboard, drawn in the page
//
// It does two jobs with one picture. Press a key on the host keyboard and the
// ST key it arrives as lights up, which is the only way to see what the mapping
// actually does. Click a key and it is sent to the ST, which is how keys a PC
// keyboard has no equivalent for - the keypad's brackets, the ISO key - can be
// reached at all.
//
// The key positions are those of a real ST keyboard. The legends come from
// EmuTOS's own country tables, so switching country shows what is printed on
// that national ST's keycaps. It does not change what the ST types: that
// follows the keyboard table in the TOS image being used, which is US here.
"use strict";

var EstyKeyboard = (function () {
    var self = {};

    // Legends from EmuTOS bios/keyb_<country>.h, indexed by ST scancode, as
    // [unshifted, shifted].
    var LEGENDS = {
        'us': { 2:["1", "!"], 3:["2", "@"], 4:["3", "#"], 5:["4", "$"], 6:["5", "%"], 7:["6", "^"], 8:["7", "&"], 9:["8", "*"], 10:["9", "("], 11:["0", ")"], 12:["-", "_"], 13:["=", "+"], 16:["q", "Q"], 17:["w", "W"], 18:["e", "E"], 19:["r", "R"], 20:["t", "T"], 21:["y", "Y"], 22:["u", "U"], 23:["i", "I"], 24:["o", "O"], 25:["p", "P"], 26:["[", "{"], 27:["]", "}"], 30:["a", "A"], 31:["s", "S"], 32:["d", "D"], 33:["f", "F"], 34:["g", "G"], 35:["h", "H"], 36:["j", "J"], 37:["k", "K"], 38:["l", "L"], 39:[";", ":"], 40:["'", "\""], 41:["`", "~"], 43:["\\", "|"], 44:["z", "Z"], 45:["x", "X"], 46:["c", "C"], 47:["v", "V"], 48:["b", "B"], 49:["n", "N"], 50:["m", "M"], 51:[",", "<"], 52:[".", ">"], 53:["/", "?"], 57:[" "], 71:["", "7"], 72:["", "8"], 74:["-"], 75:["", "4"], 77:["", "6"], 78:["+"], 80:["", "2"], 82:["", "0"], 83:["Del"], 99:["("], 100:[")"], 101:["/"], 102:["*"], 103:["7"], 104:["8"], 105:["9"], 106:["4"], 107:["5"], 108:["6"], 109:["1"], 110:["2"], 111:["3"], 112:["0"], 113:["."] },
        'uk': { 2:["1", "!"], 3:["2", "\""], 4:["3", "£"], 5:["4", "$"], 6:["5", "%"], 7:["6", "^"], 8:["7", "&"], 9:["8", "*"], 10:["9", "("], 11:["0", ")"], 12:["-", "_"], 13:["=", "+"], 16:["q", "Q"], 17:["w", "W"], 18:["e", "E"], 19:["r", "R"], 20:["t", "T"], 21:["y", "Y"], 22:["u", "U"], 23:["i", "I"], 24:["o", "O"], 25:["p", "P"], 26:["[", "{"], 27:["]", "}"], 30:["a", "A"], 31:["s", "S"], 32:["d", "D"], 33:["f", "F"], 34:["g", "G"], 35:["h", "H"], 36:["j", "J"], 37:["k", "K"], 38:["l", "L"], 39:[";", ":"], 40:["'", "@"], 41:["`", "¯"], 43:["#", "~"], 44:["z", "Z"], 45:["x", "X"], 46:["c", "C"], 47:["v", "V"], 48:["b", "B"], 49:["n", "N"], 50:["m", "M"], 51:[",", "<"], 52:[".", ">"], 53:["/", "?"], 57:[" "], 71:["", "7"], 72:["", "8"], 74:["-"], 75:["", "4"], 77:["", "6"], 78:["+"], 80:["", "2"], 82:["", "0"], 83:["Del"], 96:["\\", "|"], 99:["("], 100:[")"], 101:["/"], 102:["*"], 103:["7"], 104:["8"], 105:["9"], 106:["4"], 107:["5"], 108:["6"], 109:["1"], 110:["2"], 111:["3"], 112:["0"], 113:["."] },
        'de': { 2:["1", "!"], 3:["2", "\""], 4:["3", "§"], 5:["4", "$"], 6:["5", "%"], 7:["6", "&"], 8:["7", "/"], 9:["8", "("], 10:["9", ")"], 11:["0", "="], 12:["ß", "?"], 13:["'", "`"], 16:["q", "Q"], 17:["w", "W"], 18:["e", "E"], 19:["r", "R"], 20:["t", "T"], 21:["z", "Z"], 22:["u", "U"], 23:["i", "I"], 24:["o", "O"], 25:["p", "P"], 26:["ü", "Ü"], 27:["+", "*"], 30:["a", "A"], 31:["s", "S"], 32:["d", "D"], 33:["f", "F"], 34:["g", "G"], 35:["h", "H"], 36:["j", "J"], 37:["k", "K"], 38:["l", "L"], 39:["ö", "Ö"], 40:["ä", "Ä"], 41:["#", "^"], 43:["~", "|"], 44:["y", "Y"], 45:["x", "X"], 46:["c", "C"], 47:["v", "V"], 48:["b", "B"], 49:["n", "N"], 50:["m", "M"], 51:[",", ";"], 52:[".", ":"], 53:["-", "_"], 57:[" "], 71:["", "7"], 72:["", "8"], 74:["-"], 75:["", "4"], 77:["", "6"], 78:["+"], 80:["", "2"], 82:["", "0"], 83:["Del"], 96:["<", ">"], 99:["("], 100:[")"], 101:["/"], 102:["*"], 103:["7"], 104:["8"], 105:["9"], 106:["4"], 107:["5"], 108:["6"], 109:["1"], 110:["2"], 111:["3"], 112:["0"], 113:["."] },
        'fr': { 2:["&", "1"], 3:["é", "2"], 4:["\"", "3"], 5:["'", "4"], 6:["(", "5"], 7:["§", "6"], 8:["è", "7"], 9:["!", "8"], 10:["ç", "9"], 11:["à", "0"], 12:[")", "°"], 13:["-", "_"], 16:["a", "A"], 17:["z", "Z"], 18:["e", "E"], 19:["r", "R"], 20:["t", "T"], 21:["y", "Y"], 22:["u", "U"], 23:["i", "I"], 24:["o", "O"], 25:["p", "P"], 26:["^", "¨"], 27:["$", "*"], 30:["q", "Q"], 31:["s", "S"], 32:["d", "D"], 33:["f", "F"], 34:["g", "G"], 35:["h", "H"], 36:["j", "J"], 37:["k", "K"], 38:["l", "L"], 39:["m", "M"], 40:["ù", "%"], 41:["`", "£"], 43:["#", "|"], 44:["w", "W"], 45:["x", "X"], 46:["c", "C"], 47:["v", "V"], 48:["b", "B"], 49:["n", "N"], 50:[",", "?"], 51:[";", "."], 52:[":", "/"], 53:["=", "+"], 57:[" "], 71:["", "7"], 72:["", "8"], 74:["-"], 75:["", "4"], 77:["", "6"], 78:["+"], 80:["", "2"], 82:["", "0"], 83:["Del"], 96:["<", ">"], 99:["("], 100:[")"], 101:["/"], 102:["*"], 103:["7"], 104:["8"], 105:["9"], 106:["4"], 107:["5"], 108:["6"], 109:["1"], 110:["2"], 111:["3"], 112:["0"], 113:["."] }
    };

    var COUNTRIES = [
        { code: 'us', name: 'US' },
        { code: 'uk', name: 'UK' },
        { code: 'de', name: 'DE' },
        { code: 'fr', name: 'FR' }
    ];

    // Keys whose keycap carries a word or an arrow rather than a character.
    var NAMES = {
        0x01: 'Esc', 0x0E: 'Backspace', 0x0F: 'Tab', 0x1C: 'Return', 0x1D: 'Control',
        0x2A: 'Shift', 0x36: 'Shift', 0x38: 'Alternate', 0x39: '', 0x3A: 'Caps Lock',
        0x47: 'Clr Home', 0x48: '↑', 0x4B: '←', 0x4D: '→', 0x50: '↓',
        0x52: 'Insert', 0x53: 'Delete', 0x61: 'Undo', 0x62: 'Help', 0x72: 'Enter'
    };
    for (var f = 0; f < 10; f++) NAMES[0x3B + f] = 'F' + (f + 1);

    // The three blocks of the ST keyboard, in quarter key widths. Rows are laid
    // out left to right; a key with r: 2 is the tall one (Return, keypad Enter).
    var MAIN = [
        [{ pad: 4 }, { s: 0x3B, w: 6 }, { s: 0x3C, w: 6 }, { s: 0x3D, w: 6 }, { s: 0x3E, w: 6 },
         { s: 0x3F, w: 6 }, { s: 0x40, w: 6 }, { s: 0x41, w: 6 }, { s: 0x42, w: 6 },
         { s: 0x43, w: 6 }, { s: 0x44, w: 6 }],
        [{ s: 0x01 }, { s: 0x02 }, { s: 0x03 }, { s: 0x04 }, { s: 0x05 }, { s: 0x06 }, { s: 0x07 },
         { s: 0x08 }, { s: 0x09 }, { s: 0x0A }, { s: 0x0B }, { s: 0x0C }, { s: 0x0D }, { s: 0x29 },
         { s: 0x0E, w: 8 }],
        [{ s: 0x0F, w: 6 }, { s: 0x10 }, { s: 0x11 }, { s: 0x12 }, { s: 0x13 }, { s: 0x14 },
         { s: 0x15 }, { s: 0x16 }, { s: 0x17 }, { s: 0x18 }, { s: 0x19 }, { s: 0x1A }, { s: 0x1B },
         { s: 0x1C, w: 6, r: 2 }, { s: 0x53 }],
        [{ s: 0x1D, w: 10 }, { s: 0x1E }, { s: 0x1F }, { s: 0x20 }, { s: 0x21 }, { s: 0x22 },
         { s: 0x23 }, { s: 0x24 }, { s: 0x25 }, { s: 0x26 }, { s: 0x27 }, { s: 0x28 },
         { skip: 6 }, { s: 0x2B }],
        [{ s: 0x2A, w: 6 }, { s: 0x60 }, { s: 0x2C }, { s: 0x2D }, { s: 0x2E }, { s: 0x2F },
         { s: 0x30 }, { s: 0x31 }, { s: 0x32 }, { s: 0x33 }, { s: 0x34 }, { s: 0x35 },
         { s: 0x36, w: 14 }],
        [{ s: 0x38, w: 10 }, { s: 0x39, w: 44 }, { s: 0x3A, w: 10 }]
    ];

    var MIDDLE = [
        [{ s: 0x62, w: 6 }, { s: 0x61, w: 6 }],
        [{ s: 0x52 }, { s: 0x48 }, { s: 0x47 }],
        [{ s: 0x4B }, { s: 0x50 }, { s: 0x4D }]
    ];

    var KEYPAD = [
        [{ s: 0x63 }, { s: 0x64 }, { s: 0x65 }, { s: 0x66 }],
        [{ s: 0x67 }, { s: 0x68 }, { s: 0x69 }, { s: 0x4A }],
        [{ s: 0x6A }, { s: 0x6B }, { s: 0x6C }, { s: 0x4E }],
        [{ s: 0x6D }, { s: 0x6E }, { s: 0x6F }, { s: 0x72, r: 2 }],
        [{ s: 0x70, w: 8 }, { s: 0x71 }]
    ];

    var country = 'us';
    var keyElements = {};     // scancode -> element
    var held = {};            // scancode -> true, for keys held by the pointer
    var root = null;
    var status = null;

    /* --------------------------------------------------------------- draw */

    function legendFor(scancode) {
        if (NAMES[scancode] !== undefined) return [NAMES[scancode], ''];

        var legend = LEGENDS[country][scancode];
        if (!legend) return ['', ''];

        return [legend[0] || '', legend[1] || ''];
    }

    function label(element, scancode) {
        var legend = legendFor(scancode);

        element.innerHTML = '';
        if (legend[1]) {
            var shifted = document.createElement('span');
            shifted.className = 'shifted';
            shifted.textContent = legend[1];
            element.appendChild(shifted);
        }
        var plain = document.createElement('span');
        plain.className = NAMES[scancode] !== undefined ? 'named' : 'plain';
        plain.textContent = legend[0];
        element.appendChild(plain);

        element.title = 'scancode 0x' + scancode.toString(16).toUpperCase();
    }

    function block(rows, columns, firstRow) {
        var grid = document.createElement('div');
        grid.className = 'kb-block';
        grid.style.gridTemplateColumns = 'repeat(' + columns + ', var(--kb-qu))';

        for (var r = 0; r < rows.length; r++) {
            var column = 1;

            for (var i = 0; i < rows[r].length; i++) {
                var key = rows[r][i];
                var width = key.w || 4;

                if (key.pad || key.skip) { column += (key.pad || key.skip); continue; }

                var element = document.createElement('button');
                element.type = 'button';
                element.className = 'kb-key';
                element.style.gridColumn = column + ' / span ' + width;
                element.style.gridRow = (firstRow + r) + ' / span ' + (key.r || 1);
                element.dataset.scancode = key.s;
                label(element, key.s);

                grid.appendChild(element);
                keyElements[key.s] = element;
                column += width;
            }
        }

        return grid;
    }

    // A US ST has no key between the left shift and Z: the shift is wider
    // instead. Every European model has one, and EmuTOS's tables say which is
    // which by whether the country has a legend for it.
    function relabel() {
        for (var scancode in keyElements) label(keyElements[scancode], parseInt(scancode, 10));

        var iso = keyElements[0x60];
        var leftShift = keyElements[0x2A];
        var hasIso = LEGENDS[country][0x60] !== undefined;

        if (iso) iso.style.display = hasIso ? '' : 'none';
        if (leftShift) leftShift.style.gridColumn = '1 / span ' + (hasIso ? 6 : 10);
    }

    /* ---------------------------------------------------------- the keys */

    function press(scancode) {
        if (held[scancode]) return;
        held[scancode] = true;
        show(scancode, true);
        if (window.estyjs) estyjs.pressKey(scancode);
        report(null, scancode, true);
    }

    function release(scancode) {
        if (!held[scancode]) return;
        delete held[scancode];
        show(scancode, false);
        if (window.estyjs) estyjs.releaseKey(scancode);
    }

    function releaseAll() {
        for (var scancode in held) release(parseInt(scancode, 10));
    }

    function show(scancode, down) {
        var element = keyElements[scancode];
        if (element) element.classList.toggle('down', down);
    }

    // What the host keyboard did with the last key, in the ST's terms.
    function report(physicalKey, scancode, down) {
        if (!status || !down) return;

        var legend = legendFor(scancode);
        var name = legend[0] || legend[1] || '';
        var text = (physicalKey ? physicalKey : 'clicked') + '  →  ' +
                   (name ? name + '  ' : '') + '0x' + scancode.toString(16).toUpperCase();

        if (physicalKey && window.joystickEnabled &&
            (scancode === 0x48 || scancode === 0x50 || scancode === 0x4B ||
             scancode === 0x4D || scancode === 0x1D)) {
            text += '   (joystick 1, not a key)';
        }

        status.textContent = text;
    }

    /* --------------------------------------------------------------- wire */

    self.create = function (containerId) {
        root = document.getElementById(containerId);
        if (root == null) return;

        var chooser = document.createElement('div');
        chooser.className = 'kb-countries';
        chooser.appendChild(document.createTextNode('Keycaps: '));

        COUNTRIES.forEach(function (entry) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'kb-country' + (entry.code === country ? ' chosen' : '');
            button.textContent = entry.name;
            button.onclick = function () {
                country = entry.code;
                relabel();
                var all = chooser.querySelectorAll('.kb-country');
                for (var i = 0; i < all.length; i++) all[i].classList.remove('chosen');
                button.classList.add('chosen');
            };
            chooser.appendChild(button);
        });

        var keyboard = document.createElement('div');
        keyboard.className = 'kb-keyboard';
        keyboard.appendChild(block(MAIN, 64, 1));
        keyboard.appendChild(block(MIDDLE, 12, 2));
        keyboard.appendChild(block(KEYPAD, 16, 2));

        status = document.createElement('div');
        status.className = 'kb-status';
        status.textContent = 'Press a key to see where it lands, or click one to send it to the ST.';

        root.appendChild(chooser);
        root.appendChild(keyboard);
        root.appendChild(status);

        relabel();

        // clicking a key sends it; the pointer is followed to the end so that a
        // key released outside its own keycap does not stay down
        keyboard.addEventListener('pointerdown', function (event) {
            var element = event.target.closest('.kb-key');
            if (!element) return;
            event.preventDefault();
            press(parseInt(element.dataset.scancode, 10));
        });

        document.addEventListener('pointerup', releaseAll);
        document.addEventListener('pointercancel', releaseAll);
        window.addEventListener('blur', releaseAll);

        //keep the ST keyboard in step with the host one
        if (window.estyjs) estyjs.setKeyListener(function (scancode, down, physicalKey) {
            show(scancode, down);
            report(physicalKey, scancode, down);
        });
    };

    // The emulator is built after the page loads, so the listener is attached
    // once it exists.
    self.listen = function () {
        if (window.estyjs && root) estyjs.setKeyListener(function (scancode, down, physicalKey) {
            show(scancode, down);
            report(physicalKey, scancode, down);
        });
    };

    return self;
})();
