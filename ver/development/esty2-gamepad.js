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


// the gamepad panel
//
// Says which gamepad is connected and how it is read, and sets up a layout by
// asking for the four directions and fire. Layouts are kept in the browser,
// per gamepad name, so a gamepad is set up once.
"use strict";

var EstyGamepad = (function () {
    var self = {};

    var STORE = 'estyjs-gamepads';

    var PROMPTS = {
        up: 'Press up.',
        right: 'Press right.',
        down: 'Press down.',
        left: 'Press left.',
        fire: 'Press the button to use as fire.'
    };

    var status = null;
    var prompt = null;
    var setupButton = null;
    var forgetButton = null;
    var cancelButton = null;

    // { id, learner, step, layout, timer } while setting up
    var learning = null;

    // Storage can be missing or refused (private windows), which loses the
    // layouts but nothing else.
    function loadLayouts() {
        try {
            return JSON.parse(localStorage.getItem(STORE)) || {};
        } catch (e) {
            return {};
        }
    }

    function saveLayout(id, layout) {
        var all = loadLayouts();
        if (layout) all[id] = layout;
        else delete all[id];
        try {
            localStorage.setItem(STORE, JSON.stringify(all));
        } catch (e) { }
    }

    function nameOf(gamepad) {
        return gamepad.id.trim();
    }

    function show(message) {
        var gamepad = EstyJs.gamepad.first();

        if (learning) {
            status.textContent = nameOf(gamepad || { id: learning.id }) + ': setting up.';
        } else if (gamepad == null) {
            status.textContent = 'No gamepad found. Connect one and press a button on it.';
        } else {
            var how = {
                layout: 'set up.',
                standard: 'read as a standard gamepad.',
                other: 'not set up. Read as axes 0 and 1, buttons 0 to 3 as fire.'
            };
            status.textContent = nameOf(gamepad) + ': ' + how[EstyJs.gamepad.describe(gamepad)];
        }

        prompt.textContent = learning ? PROMPTS[EstyJs.gamepad.STEPS[learning.step]] : (message || '');
        setupButton.hidden = learning != null || gamepad == null;
        forgetButton.hidden = learning != null || gamepad == null || EstyJs.gamepad.describe(gamepad) != 'layout';
        cancelButton.hidden = learning == null;
    }

    function stop(message) {
        clearInterval(learning.timer);
        learning = null;
        EstyJs.gamepad.learning = false;
        show(message);
    }

    function poll() {
        var gamepad = EstyJs.gamepad.first();
        if (gamepad == null || gamepad.id != learning.id) {
            stop('The gamepad went away. Nothing was changed.');
            return;
        }

        var control = learning.learner.poll(gamepad);
        if (control == null) return;

        learning.layout[EstyJs.gamepad.STEPS[learning.step]] = control;
        learning.step++;

        if (learning.step < EstyJs.gamepad.STEPS.length) {
            show();
            return;
        }

        EstyJs.gamepad.setLayout(learning.id, learning.layout);
        saveLayout(learning.id, learning.layout);
        stop('Done.');
    }

    function setUp() {
        var gamepad = EstyJs.gamepad.first();
        if (gamepad == null) return;

        EstyJs.gamepad.learning = true;
        learning = {
            id: gamepad.id,
            learner: EstyJs.gamepad.learner(gamepad),
            step: 0,
            layout: {},
            timer: setInterval(poll, 20)
        };
        show();
    }

    function forget() {
        var gamepad = EstyJs.gamepad.first();
        if (gamepad == null) return;
        EstyJs.gamepad.setLayout(gamepad.id, null);
        saveLayout(gamepad.id, null);
        show('Layout removed.');
    }

    function button(label, action) {
        var b = document.createElement('button');
        b.className = 'gp-button';
        b.textContent = label;
        b.addEventListener('click', action);
        return b;
    }

    self.create = function (containerId) {
        var container = document.getElementById(containerId);
        if (container == null) return;

        var layouts = loadLayouts();
        for (var id in layouts) EstyJs.gamepad.setLayout(id, layouts[id]);

        status = document.createElement('p');
        status.className = 'gp-status';
        prompt = document.createElement('p');
        prompt.className = 'gp-prompt';

        setupButton = button('Set up', setUp);
        forgetButton = button('Forget', forget);
        cancelButton = button('Cancel', function () { stop('Cancelled. Nothing was changed.'); });

        var buttons = document.createElement('div');
        buttons.appendChild(setupButton);
        buttons.appendChild(forgetButton);
        buttons.appendChild(cancelButton);

        container.appendChild(status);
        container.appendChild(prompt);
        container.appendChild(buttons);

        window.addEventListener('gamepadconnected', function () { if (!learning) show(); });
        window.addEventListener('gamepaddisconnected', function () { if (!learning) show(); });

        show();
    }

    return self;
})();
