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


// gamepads as joystick 1
//
// A gamepad with a layout set up by the player is read through it. Otherwise
// a gamepad the browser knows (mapping "standard") is read as D-pad, left
// stick and buttons 0 to 11 as fire. Any other gamepad lays out its controls
// as its maker chose: axes 0 and 1, buttons 0 to 3 as fire.
//
// A layout names one control per direction and one for fire:
//
//   { up, right, down, left, fire }
//
//   control    { button: n }, or { axis: n, value: v }
//
// An axis control near +1 or -1 counts from halfway, so a stick works too.
// Other values are the steps of a hat switch, one axis for all eight
// directions. When all four directions sit on one axis it is read as a hat,
// diagonals included.
//
// Joystick position as the IKBD reports it: bit 0 up, 1 down, 2 left,
// 3 right, 7 fire.
"use strict";

EstyJs.gamepad = (function () {
    var self = {};

    var UP = 1, DOWN = 2, LEFT = 4, RIGHT = 8, FIRE = 128;

    // gamepad id -> layout
    var layouts = {};

    // While a layout is being set up, the ST does not see the gamepad.
    self.learning = false;

    self.setLayout = function (id, layout) {
        if (layout) layouts[id] = layout;
        else delete layouts[id];
    }

    self.getLayout = function (id) {
        return layouts[id] || null;
    }

    // The first gamepad connected, or null. Firefox and Chrome leave gaps
    // in the list.
    self.first = function () {
        if (typeof navigator == 'undefined' || !navigator.getGamepads) return null;
        var pads = navigator.getGamepads();
        for (var i = 0; i < pads.length; i++) {
            if (pads[i] && pads[i].connected !== false) return pads[i];
        }
        return null;
    }

    /* ------------------------------------------------------------ reading */

    function pressed(gamepad, n) {
        return n < gamepad.buttons.length && gamepad.buttons[n].pressed;
    }

    function axis(gamepad, n) {
        return n < gamepad.axes.length ? gamepad.axes[n] : 0;
    }

    function isStick(value) {
        return Math.abs(value) >= 0.9;
    }

    function active(gamepad, control) {
        if (control == null) return false;
        if (control.button != null) return pressed(gamepad, control.button);

        var a = axis(gamepad, control.axis);
        if (isStick(control.value)) return a * control.value > 0.5;
        return Math.abs(a - control.value) < 0.1;
    }

    function isHat(layout) {
        var a = layout.up.axis;
        return a != null && layout.right.axis === a && layout.down.axis === a && layout.left.axis === a;
    }

    // The four recorded steps fix the step size and where each direction
    // lies. A diagonal is the step between two directions.
    function readHat(gamepad, layout) {
        var up = layout.up.value;
        var step = (layout.down.value - up) / 4;
        if (step == 0) return 0;

        var pos = Math.round((axis(gamepad, layout.up.axis) - up) / step);
        if (pos < 0 || pos > 7) return 0;

        var at = [];
        var dirs = [[layout.up, UP], [layout.right, RIGHT], [layout.down, DOWN], [layout.left, LEFT]];
        for (var i = 0; i < dirs.length; i++) {
            at[(Math.round((dirs[i][0].value - up) / step) + 8) % 8] = dirs[i][1];
        }

        if (at[pos]) return at[pos];
        return (at[(pos + 7) % 8] || 0) | (at[(pos + 1) % 8] || 0);
    }

    function readLayout(gamepad, layout) {
        var pos = 0;

        if (isHat(layout)) {
            pos = readHat(gamepad, layout);
        } else {
            if (active(gamepad, layout.up)) pos |= UP;
            if (active(gamepad, layout.down)) pos |= DOWN;
            if (active(gamepad, layout.left)) pos |= LEFT;
            if (active(gamepad, layout.right)) pos |= RIGHT;
        }

        if (active(gamepad, layout.fire)) pos |= FIRE;
        return pos;
    }

    function readAxes(gamepad) {
        var pos = 0;
        if (axis(gamepad, 1) < -0.5) pos |= UP;
        if (axis(gamepad, 1) > 0.5) pos |= DOWN;
        if (axis(gamepad, 0) < -0.5) pos |= LEFT;
        if (axis(gamepad, 0) > 0.5) pos |= RIGHT;
        return pos;
    }

    function readStandard(gamepad) {
        var pos = readAxes(gamepad);
        if (pressed(gamepad, 12)) pos |= UP;
        if (pressed(gamepad, 13)) pos |= DOWN;
        if (pressed(gamepad, 14)) pos |= LEFT;
        if (pressed(gamepad, 15)) pos |= RIGHT;
        for (var i = 0; i < 12; i++) {
            if (pressed(gamepad, i)) pos |= FIRE;
        }
        return pos;
    }

    function readOther(gamepad) {
        var pos = readAxes(gamepad);
        for (var i = 0; i < 4; i++) {
            if (pressed(gamepad, i)) pos |= FIRE;
        }
        return pos;
    }

    // Joystick position.
    self.read = function (gamepad) {
        var layout = layouts[gamepad.id];
        if (layout) return readLayout(gamepad, layout);
        if (gamepad.mapping == 'standard') return readStandard(gamepad);
        return readOther(gamepad);
    }

    // How a gamepad is read: 'layout', 'standard' or 'other'.
    self.describe = function (gamepad) {
        if (layouts[gamepad.id]) return 'layout';
        return gamepad.mapping == 'standard' ? 'standard' : 'other';
    }

    /* ------------------------------------------------------------ setting up */

    // Learns one control at a time. poll() is called with the gamepad
    // regularly and returns the control once it has been pressed and released.
    // Axes are measured against where they rest when learning starts: a hat
    // switch or a trigger does not rest at 0. An axis gives the value it held
    // for the most polls, which skips what it passed on the way: half a stick,
    // the diagonal before a direction on a hat.
    self.learner = function (gamepad) {
        var rest = gamepad.axes.slice(0);
        var button = null;
        var counts = {};

        function poll(gamepad) {
            var pressedNow = false;

            for (var i = 0; i < gamepad.buttons.length; i++) {
                if (gamepad.buttons[i].pressed) {
                    if (button == null) button = i;
                    pressedNow = true;
                }
            }

            for (var i = 0; i < gamepad.axes.length && i < rest.length; i++) {
                if (Math.abs(gamepad.axes[i] - rest[i]) > 0.5) {
                    var key = i + ':' + Math.round(gamepad.axes[i] * 100) / 100;
                    counts[key] = (counts[key] || 0) + 1;
                    pressedNow = true;
                }
            }

            if (pressedNow) return null;

            var control = null;
            if (button != null) {
                control = { button: button };
            } else {
                var most = 0;
                for (var key in counts) {
                    if (counts[key] > most) {
                        most = counts[key];
                        var parts = key.split(':');
                        control = { axis: +parts[0], value: +parts[1] };
                    }
                }
            }

            button = null;
            counts = {};
            return control;
        }

        return { poll: poll };
    }

    // The order a layout is set up in.
    self.STEPS = ['up', 'right', 'down', 'left', 'fire'];

    return self;
})();
