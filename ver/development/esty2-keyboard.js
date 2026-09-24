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
// A key pressed on the host keyboard lights up where it lands on the ST. A key
// clicked here is sent to the ST, including the keypad brackets, which a PC
// keyboard does not have.
//
// Key positions are those of a real ST keyboard. Legends come from the EmuTOS
// country tables, so the country switch changes the keycaps only. What the ST
// types follows the keyboard table in the TOS image, which is US here.
"use strict";

var EstyKeyboard = (function () {
    var self = {};

    // From EmuTOS bios/keyb_<country>.h, by ST scancode, as
    // [unshifted, shifted, alternate, alternate shifted].
    var LEGENDS = {
        'us': { 2:["1", "!"], 3:["2", "@"], 4:["3", "#"], 5:["4", "$"], 6:["5", "%"], 7:["6", "^"], 8:["7", "&"], 9:["8", "*"], 10:["9", "("], 11:["0", ")"], 12:["-", "_"], 13:["=", "+"], 16:["q", "Q"], 17:["w", "W"], 18:["e", "E"], 19:["r", "R"], 20:["t", "T"], 21:["y", "Y"], 22:["u", "U"], 23:["i", "I"], 24:["o", "O"], 25:["p", "P"], 26:["[", "{"], 27:["]", "}"], 30:["a", "A"], 31:["s", "S"], 32:["d", "D"], 33:["f", "F"], 34:["g", "G"], 35:["h", "H"], 36:["j", "J"], 37:["k", "K"], 38:["l", "L"], 39:[";", ":"], 40:["'", "\""], 41:["`", "~"], 43:["\\", "|"], 44:["z", "Z"], 45:["x", "X"], 46:["c", "C"], 47:["v", "V"], 48:["b", "B"], 49:["n", "N"], 50:["m", "M"], 51:[",", "<"], 52:[".", ">"], 53:["/", "?"], 57:[" "], 71:["", "7"], 72:["", "8"], 74:["-"], 75:["", "4"], 77:["", "6"], 78:["+"], 80:["", "2"], 82:["", "0"], 83:["Del"], 99:["("], 100:[")"], 101:["/"], 102:["*"], 103:["7"], 104:["8"], 105:["9"], 106:["4"], 107:["5"], 108:["6"], 109:["1"], 110:["2"], 111:["3"], 112:["0"], 113:["."] },
        'uk': { 2:["1", "!"], 3:["2", "\""], 4:["3", "£"], 5:["4", "$"], 6:["5", "%"], 7:["6", "^"], 8:["7", "&"], 9:["8", "*"], 10:["9", "("], 11:["0", ")"], 12:["-", "_"], 13:["=", "+"], 16:["q", "Q"], 17:["w", "W"], 18:["e", "E"], 19:["r", "R"], 20:["t", "T"], 21:["y", "Y"], 22:["u", "U"], 23:["i", "I"], 24:["o", "O"], 25:["p", "P"], 26:["[", "{"], 27:["]", "}"], 30:["a", "A"], 31:["s", "S"], 32:["d", "D"], 33:["f", "F"], 34:["g", "G"], 35:["h", "H"], 36:["j", "J"], 37:["k", "K"], 38:["l", "L"], 39:[";", ":"], 40:["'", "@"], 41:["`", "¯"], 43:["#", "~"], 44:["z", "Z"], 45:["x", "X"], 46:["c", "C"], 47:["v", "V"], 48:["b", "B"], 49:["n", "N"], 50:["m", "M"], 51:[",", "<"], 52:[".", ">"], 53:["/", "?"], 57:[" "], 71:["", "7"], 72:["", "8"], 74:["-"], 75:["", "4"], 77:["", "6"], 78:["+"], 80:["", "2"], 82:["", "0"], 83:["Del"], 96:["\\", "|"], 99:["("], 100:[")"], 101:["/"], 102:["*"], 103:["7"], 104:["8"], 105:["9"], 106:["4"], 107:["5"], 108:["6"], 109:["1"], 110:["2"], 111:["3"], 112:["0"], 113:["."] },
        'de': { 2:["1", "!"], 3:["2", "\""], 4:["3", "§"], 5:["4", "$"], 6:["5", "%"], 7:["6", "&"], 8:["7", "/"], 9:["8", "("], 10:["9", ")"], 11:["0", "="], 12:["ß", "?"], 13:["'", "`"], 16:["q", "Q"], 17:["w", "W"], 18:["e", "E"], 19:["r", "R"], 20:["t", "T"], 21:["z", "Z"], 22:["u", "U"], 23:["i", "I"], 24:["o", "O"], 25:["p", "P"], 26:["ü", "Ü", "@", "\\"], 27:["+", "*"], 30:["a", "A"], 31:["s", "S"], 32:["d", "D"], 33:["f", "F"], 34:["g", "G"], 35:["h", "H"], 36:["j", "J"], 37:["k", "K"], 38:["l", "L"], 39:["ö", "Ö", "[", "{"], 40:["ä", "Ä", "]", "}"], 41:["#", "^"], 43:["~", "|"], 44:["y", "Y"], 45:["x", "X"], 46:["c", "C"], 47:["v", "V"], 48:["b", "B"], 49:["n", "N"], 50:["m", "M"], 51:[",", ";"], 52:[".", ":"], 53:["-", "_"], 57:[" "], 71:["", "7"], 72:["", "8"], 74:["-"], 75:["", "4"], 77:["", "6"], 78:["+"], 80:["", "2"], 82:["", "0"], 83:["Del"], 96:["<", ">"], 99:["("], 100:[")"], 101:["/"], 102:["*"], 103:["7"], 104:["8"], 105:["9"], 106:["4"], 107:["5"], 108:["6"], 109:["1"], 110:["2"], 111:["3"], 112:["0"], 113:["."] },
        'fr': { 2:["&", "1"], 3:["é", "2"], 4:["\"", "3"], 5:["'", "4"], 6:["(", "5"], 7:["§", "6"], 8:["è", "7"], 9:["!", "8"], 10:["ç", "9"], 11:["à", "0"], 12:[")", "°"], 13:["-", "_"], 16:["a", "A"], 17:["z", "Z"], 18:["e", "E"], 19:["r", "R"], 20:["t", "T"], 21:["y", "Y"], 22:["u", "U"], 23:["i", "I"], 24:["o", "O"], 25:["p", "P"], 26:["^", "¨", "[", "{"], 27:["$", "*", "]", "}"], 30:["q", "Q"], 31:["s", "S"], 32:["d", "D"], 33:["f", "F"], 34:["g", "G"], 35:["h", "H"], 36:["j", "J"], 37:["k", "K"], 38:["l", "L"], 39:["m", "M"], 40:["ù", "%", "\\", ""], 41:["`", "£"], 43:["#", "|", "@", "~"], 44:["w", "W"], 45:["x", "X"], 46:["c", "C"], 47:["v", "V"], 48:["b", "B"], 49:["n", "N"], 50:[",", "?"], 51:[";", "."], 52:[":", "/"], 53:["=", "+"], 57:[" "], 71:["", "7"], 72:["", "8"], 74:["-"], 75:["", "4"], 77:["", "6"], 78:["+"], 80:["", "2"], 82:["", "0"], 83:["Del"], 96:["<", ">"], 99:["("], 100:[")"], 101:["/"], 102:["*"], 103:["7"], 104:["8"], 105:["9"], 106:["4"], 107:["5"], 108:["6"], 109:["1"], 110:["2"], 111:["3"], 112:["0"], 113:["."] }
    };

    // TOS country codes, for the keycaps that go with a loaded ROM
    var TOS_COUNTRIES = { 0: 'us', 1: 'de', 2: 'fr', 3: 'uk' };

    var COUNTRIES = [
        { code: 'us', name: 'US' },
        { code: 'uk', name: 'UK' },
        { code: 'de', name: 'DE' },
        { code: 'fr', name: 'FR' }
    ];

    // Keycaps carrying a word or an arrow instead of a character.
    var NAMES = {
        0x01: 'Esc', 0x0E: 'Backspace', 0x0F: 'Tab', 0x1C: 'Return', 0x1D: 'Control',
        0x2A: 'Shift', 0x36: 'Shift', 0x38: 'Alternate', 0x39: '', 0x3A: 'Caps Lock',
        0x47: 'Clr Home', 0x48: '↑', 0x4B: '←', 0x4D: '→', 0x50: '↓',
        0x52: 'Insert', 0x53: 'Delete', 0x61: 'Undo', 0x62: 'Help', 0x72: 'Enter'
    };
    for (var f = 0; f < 10; f++) NAMES[0x3B + f] = 'F' + (f + 1);

    // The three blocks, in quarter key widths. r: 2 is a tall key (Return,
    // keypad Enter).
    var MAIN = [
        { flex: true, keys: [{ s: 0x3B }, { s: 0x3C }, { s: 0x3D }, { s: 0x3E }, { s: 0x3F },
                             { s: 0x40 }, { s: 0x41 }, { s: 0x42 }, { s: 0x43 }, { s: 0x44 }] },
        [{ s: 0x01 }, { s: 0x02 }, { s: 0x03 }, { s: 0x04 }, { s: 0x05 }, { s: 0x06 }, { s: 0x07 },
         { s: 0x08 }, { s: 0x09 }, { s: 0x0A }, { s: 0x0B }, { s: 0x0C }, { s: 0x0D }, { s: 0x29 },
         { s: 0x0E, w: 8 }],
        [{ s: 0x0F, w: 6 }, { s: 0x10 }, { s: 0x11 }, { s: 0x12 }, { s: 0x13 }, { s: 0x14 },
         { s: 0x15 }, { s: 0x16 }, { s: 0x17 }, { s: 0x18 }, { s: 0x19 }, { s: 0x1A }, { s: 0x1B },
         { s: 0x1C, w: 5, blank: true }, { s: 0x53, w: 5 }],
        [{ s: 0x1D, w: 7 }, { s: 0x1E }, { s: 0x1F }, { s: 0x20 }, { s: 0x21 }, { s: 0x22 },
         { s: 0x23 }, { s: 0x24 }, { s: 0x25 }, { s: 0x26 }, { s: 0x27 }, { s: 0x28 },
         { s: 0x1C, w: 8, cont: true }, { s: 0x2B, w: 5 }],
        [{ s: 0x2A, w: 5 }, { s: 0x60 }, { s: 0x2C }, { s: 0x2D }, { s: 0x2E }, { s: 0x2F },
         { s: 0x30 }, { s: 0x31 }, { s: 0x32 }, { s: 0x33 }, { s: 0x34 }, { s: 0x35 },
         { s: 0x36, w: 15 }],
        [{ pad: 4 }, { s: 0x38, w: 8 }, { s: 0x39, w: 40 }, { s: 0x3A, w: 8 }, { pad: 4 }]
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
    var keyElements = {};     // scancode -> elements (Return has two)
    var held = {};            // scancode -> true, for keys held by the pointer
    var root = null;
    var status = null;

    /* --------------------------------------------------------------- draw */

    function legendFor(scancode) {
        if (NAMES[scancode] !== undefined) return [NAMES[scancode], ''];

        var legend = LEGENDS[country][scancode];
        if (!legend) return ['', ''];

        var plain = legend[0] || '';
        var shifted = legend[1] || '';
        var alt = (legend[2] || '') + (legend[3] || '');

        //letters carry their upper case only, as the keycaps do
        if (shifted && plain && shifted === plain.toUpperCase()) return [shifted, '', alt];

        return [plain, shifted, alt];
    }

    function label(element, scancode) {
        var legend = element.classList.contains('kb-blank') ? ['', ''] : legendFor(scancode);

        element.innerHTML = '';
        element.classList.toggle('two', !!legend[1]);
        if (legend[1]) {
            var shifted = document.createElement('span');
            shifted.className = 'shifted';
            shifted.textContent = legend[1];
            element.appendChild(shifted);
        }
        var plain = document.createElement('span');
        //a word is set small, a single glyph such as an arrow is not
        plain.className = legend[0].length > 1 ? 'named' : 'plain';
        plain.textContent = legend[0];
        element.appendChild(plain);

        //what the Alternate key reaches, printed at the right as on the keycap
        if (legend[2]) {
            var alt = document.createElement('span');
            alt.className = 'alt';
            alt.textContent = legend[2].split('').reverse().join('\n');
            element.appendChild(alt);
        }

        element.title = 'scancode 0x' + scancode.toString(16).toUpperCase();
    }

    function block(rows, columns, firstRow) {
        var grid = document.createElement('div');
        grid.className = 'kb-block';
        grid.style.gridTemplateColumns = 'repeat(' + columns + ', var(--kb-qu))';

        for (var r = 0; r < rows.length; r++) {
            var column = 1;

            //a flex row fills the block, whatever the column count is
            var flexRow = null;
            if (rows[r].flex) {
                flexRow = document.createElement('div');
                flexRow.className = 'kb-fnrow';
                flexRow.style.gridRow = (firstRow + r);
                flexRow.style.gridColumn = '1 / -1';
                grid.appendChild(flexRow);
            }

            var keys = flexRow ? rows[r].keys : rows[r];

            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var width = key.w || 4;

                if (key.pad || key.skip) { column += (key.pad || key.skip); continue; }

                var element = document.createElement('button');
                element.type = 'button';
                if (flexRow) { element.className = 'kb-key kb-fn'; }
                else {
                    element.className = 'kb-key' + (key.cont ? ' kb-cont' : '') +
                                        (key.blank ? ' kb-blank kb-joined' : '');
                    element.style.gridColumn = column + ' / span ' + width;
                    element.style.gridRow = (firstRow + r) + ' / span ' + (key.r || 1);
                }
                element.dataset.scancode = key.s;
                label(element, key.s);

                (flexRow || grid).appendChild(element);
                (keyElements[key.s] = keyElements[key.s] || []).push(element);
                column += width;
            }
        }

        return grid;
    }

    // A US ST has no key between the left shift and Z, and a wider shift
    // instead. The country tables say which is which.
    function relabel() {
        for (var scancode in keyElements)
            keyElements[scancode].forEach(function (element) {
                label(element, parseInt(scancode, 10));
            });

        var iso = keyElements[0x60];
        var leftShift = keyElements[0x2A];
        var hasIso = LEGENDS[country][0x60] !== undefined;

        if (iso) iso[0].style.display = hasIso ? '' : 'none';
        if (leftShift) leftShift[0].style.gridColumn = '1 / span ' + (hasIso ? 5 : 9);
    }

    /* ---------------------------------------------------------- the keys */

    // window.estyjs is the emulator once the page has built it. The page also
    // has a div with that id, which the browser exposes under the same name, so
    // the methods are what is checked for.
    function emulator() {
        return (window.estyjs && typeof window.estyjs.pressKey === 'function') ? window.estyjs : null;
    }

    function press(scancode) {
        if (held[scancode]) return;
        held[scancode] = true;
        show(scancode, true);
        var esty = emulator();
        if (esty) esty.pressKey(scancode);
        report(null, scancode, true);
    }

    function release(scancode) {
        if (!held[scancode]) return;
        delete held[scancode];
        show(scancode, false);
        var esty = emulator();
        if (esty) esty.releaseKey(scancode);
    }

    function releaseAll() {
        for (var scancode in held) release(parseInt(scancode, 10));
    }

    function show(scancode, down) {
        var elements = keyElements[scancode];
        if (elements) elements.forEach(function (element) { element.classList.toggle('down', down); });
    }

    // The last key, in ST terms.
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

    self.choose = function (code) {
        if (!LEGENDS[code]) return;

        country = code;
        relabel();

        var all = document.querySelectorAll('.kb-country');
        for (var i = 0; i < all.length; i++) {
            all[i].classList.toggle('chosen', all[i].dataset.country === code);
        }
    };

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
            button.dataset.country = entry.code;
            button.onclick = function () { self.choose(entry.code); };
            chooser.appendChild(button);
        });

        var keyboard = document.createElement('div');
        keyboard.className = 'kb-keyboard';

        //where the machine carries its own badge
        var badge = document.createElement('div');
        badge.className = 'kb-badge';
        var mark = document.createElement('img');
        mark.src = 'img/logo.png';
        mark.alt = 'EstyJS';
        badge.appendChild(mark);
        keyboard.appendChild(badge);

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

        //the pointer is followed to the end, so a key released outside its own
        //keycap does not stay down
        keyboard.addEventListener('pointerdown', function (event) {
            var element = event.target.closest('.kb-key');
            if (!element) return;
            event.preventDefault();
            press(parseInt(element.dataset.scancode, 10));
        });

        document.addEventListener('pointerup', releaseAll);
        document.addEventListener('pointercancel', releaseAll);
        window.addEventListener('blur', releaseAll);

        self.listen();
    };

    // The emulator is built after the page loads.
    self.listen = function () {
        var esty = emulator();
        if (!esty || !root) return;

        if (typeof esty.setKeyListener === 'function') {
            esty.setKeyListener(function (scancode, down, physicalKey) {
                show(scancode, down);
                report(physicalKey, scancode, down);
            });
        }

        //a German TOS means a German keyboard, here and on the machine
        if (typeof esty.setTosListener === 'function') {
            esty.setTosListener(function (code) { self.choose(TOS_COUNTRIES[code]); });
            self.choose(TOS_COUNTRIES[esty.getTosCountry()]);
        }
    };

    return self;
})();
