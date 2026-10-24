/*
 * check-gamepad.js - check how gamepads are read and set up.
 *
 * Runs estyjs/gamepad.js against made up gamepads: one the browser knows, a
 * SNES style pad as Firefox reports it, a pad with a hat switch and one with
 * the D-pad on buttons. Each is set up by pressing and releasing controls as
 * the panel asks for them, then read in every direction.
 *
 * With a disk, also drives Buggy Boy's course selection through a set up
 * gamepad, to check that the IKBD gets what the gamepad says.
 *
 * usage:
 *   node tools/check-gamepad.js [disk] [boot-frames]
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

let pads = [];
const sandbox = { navigator: { getGamepads: () => pads }, Math, JSON };
vm.createContext(sandbox);
vm.runInContext('var EstyJs = {};' + fs.readFileSync(path.join(ROOT, 'estyjs', 'gamepad.js'), 'utf8'), sandbox);
const G = sandbox.EstyJs.gamepad;

const UP = 1, DOWN = 2, LEFT = 4, RIGHT = 8, FIRE = 128;

let failed = 0;
function check(what, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : '\n       got:  ' + JSON.stringify(got) +
                '\n       want: ' + JSON.stringify(want)));
}

function pad(id, mapping, axes, buttons) {
    return {
        id, mapping, connected: true, index: 0,
        rest: axes.slice(0),
        axes: axes.slice(0),
        buttons: Array.from({ length: buttons }, () => ({ pressed: false, value: 0 }))
    };
}

// Controls as they are pressed: {button: n} or {axis: n, value: v}.
function press(p, controls) {
    p.axes = p.rest.slice(0);
    p.buttons.forEach(b => { b.pressed = false; });
    for (const c of controls) {
        if (c.button != null) p.buttons[c.button].pressed = true;
        else p.axes[c.axis] = c.value;
    }
}

const release = (p) => press(p, []);

// What the panel does: one press and release per step, with a few polls in
// between. An axis passes through another value on its way.
function setUp(p, steps) {
    release(p);
    const learner = G.learner(p);
    const layout = {};
    G.STEPS.forEach((name, i) => {
        const c = steps[i];
        if (c.axis != null) { press(p, [{ axis: c.axis, value: c.value * 0.6 }]); learner.poll(p); }
        press(p, [c]);
        learner.poll(p); learner.poll(p);
        release(p);
        layout[name] = learner.poll(p);
    });
    G.setLayout(p.id, layout);
    return layout;
}

function readAll(p, cases) {
    for (const [what, controls, want] of cases) {
        press(p, controls);
        check(p.label + ': ' + what, G.read(p), want);
    }
    release(p);
}

// ---------------------------------------------------- SNES pad in Firefox ---
// As reported for 081f:e401: D-pad on axes 1 (x) and 2 (y), axis 0 unused.

const snes = pad('081f-e401-USB gamepad           ', '', [0, 0, 0], 12);
snes.label = 'SNES pad, Firefox';
pads = [null, snes];

check('first connected gamepad, behind a gap', G.first() === snes, true);
check(snes.label + ': not set up', G.describe(snes), 'other');

readAll(snes, [
    ['not set up, button 2 is fire', [{ button: 2 }], FIRE],
    ['not set up, start (9) is not fire', [{ button: 9 }], 0],
    ['not set up, left reads as up', [{ axis: 1, value: -1 }], UP]
]);

const snesLayout = setUp(snes, [
    { axis: 2, value: -1 }, { axis: 1, value: 1 }, { axis: 2, value: 1 }, { axis: 1, value: -1 }, { button: 2 }
]);
check(snes.label + ': layout learnt', snesLayout, {
    up: { axis: 2, value: -1 }, right: { axis: 1, value: 1 }, down: { axis: 2, value: 1 },
    left: { axis: 1, value: -1 }, fire: { button: 2 }
});
check(snes.label + ': set up', G.describe(snes), 'layout');

readAll(snes, [
    ['nothing', [], 0],
    ['up', [{ axis: 2, value: -1 }], UP],
    ['right', [{ axis: 1, value: 1 }], RIGHT],
    ['down', [{ axis: 2, value: 1 }], DOWN],
    ['left', [{ axis: 1, value: -1 }], LEFT],
    ['up and right', [{ axis: 2, value: -1 }, { axis: 1, value: 1 }], UP | RIGHT],
    ['down, left and fire', [{ axis: 2, value: 1 }, { axis: 1, value: -1 }, { button: 2 }], DOWN | LEFT | FIRE],
    ['start is not fire', [{ button: 9 }], 0]
]);

// --------------------------------------------------------- standard pad ---
// Read as before the layouts: D-pad buttons, left stick, buttons 0-11 fire.

const std = pad('Xbox 360 Controller', 'standard', [0, 0, 0, 0], 17);
std.label = 'standard pad';
pads = [std];

check(std.label + ': read as standard', G.describe(std), 'standard');
readAll(std, [
    ['D-pad up', [{ button: 12 }], UP],
    ['D-pad down', [{ button: 13 }], DOWN],
    ['D-pad left', [{ button: 14 }], LEFT],
    ['D-pad right', [{ button: 15 }], RIGHT],
    ['stick up left', [{ axis: 1, value: -0.8 }, { axis: 0, value: -0.8 }], UP | LEFT],
    ['stick barely moved', [{ axis: 0, value: 0.3 }], 0],
    ['A is fire', [{ button: 0 }], FIRE],
    ['button 11 is fire', [{ button: 11 }], FIRE],
    ['guide (16) is not fire', [{ button: 16 }], 0]
]);

// ----------------------------------------------------------- hat switch ---
// One axis for all directions, eight steps of 2/7 from -1, resting off the
// scale. Chrome reports many generic pads like this.

const HAT = [-1, -5 / 7, -3 / 7, -1 / 7, 1 / 7, 3 / 7, 5 / 7, 1];
const hat = pad('USB Joystick (Vendor: 0079 Product: 0006)', '', [0, 0, 0, 0, 0, 0, 0, 0, 0, 9 / 7], 10);
hat.label = 'hat switch';
pads = [hat];

setUp(hat, [
    { axis: 9, value: HAT[0] }, { axis: 9, value: HAT[2] }, { axis: 9, value: HAT[4] }, { axis: 9, value: HAT[6] },
    { button: 1 }
]);

readAll(hat, [
    ['resting', [], 0],
    ['up', [{ axis: 9, value: HAT[0] }], UP],
    ['up right', [{ axis: 9, value: HAT[1] }], UP | RIGHT],
    ['right', [{ axis: 9, value: HAT[2] }], RIGHT],
    ['down right', [{ axis: 9, value: HAT[3] }], DOWN | RIGHT],
    ['down', [{ axis: 9, value: HAT[4] }], DOWN],
    ['down left', [{ axis: 9, value: HAT[5] }], DOWN | LEFT],
    ['left', [{ axis: 9, value: HAT[6] }], LEFT],
    ['up left and fire', [{ axis: 9, value: HAT[7] }, { button: 1 }], UP | LEFT | FIRE]
]);

// ------------------------------------------------------ D-pad on buttons ---
// With a trigger resting at -1, which must not be taken for a press.

const btn = pad('Generic pad', '', [0, 0, -1], 12);
btn.label = 'D-pad on buttons';
pads = [btn];

setUp(btn, [{ button: 4 }, { button: 7 }, { button: 5 }, { button: 6 }, { button: 0 }]);

readAll(btn, [
    ['trigger resting', [], 0],
    ['up', [{ button: 4 }], UP],
    ['down right', [{ button: 5 }, { button: 7 }], DOWN | RIGHT],
    ['left and fire', [{ button: 6 }, { button: 0 }], LEFT | FIRE],
    ['trigger pulled is nothing', [{ axis: 2, value: 1 }], 0]
]);

G.setLayout(btn.id, null);
check(btn.label + ': forgotten', G.describe(btn), 'other');

// ------------------------------------------------------------- learning ---

{
    const p = pad('Learner', '', [0, 0, 0], 4);
    release(p);
    const learner = G.learner(p);
    press(p, [{ axis: 0, value: 0.6 }]);
    check('learner: nothing while held', learner.poll(p), null);
    press(p, [{ axis: 0, value: 1 }]);
    learner.poll(p); learner.poll(p); learner.poll(p);
    press(p, [{ axis: 0, value: 0.7 }]);
    learner.poll(p);
    release(p);
    check('learner: an axis gives the value held longest', learner.poll(p), { axis: 0, value: 1 });
    check('learner: nothing more after release', learner.poll(p), null);
}

// ------------------------------------------------------------- the ST ---

const disk = process.argv[2];
if (disk) {
    const { createMachine } = require('./esty-headless');
    const boot = parseInt(process.argv[3] || '1500', 10);

    function frame(steps) {
        const m = createMachine(path.join(ROOT, 'estyjs'), { quiet: true });
        const p = pad('081f-e401-USB gamepad           ', '', [0, 0, 0], 12);
        m.gamepads = [p];
        m.setGamepadLayout(p.id, snesLayout);
        m.insertDisk('A', disk);
        m.run(boot);
        for (const controls of steps) {
            press(p, controls); m.run(10);
            release(p); m.run(10);
        }
        m.run(90);
        return crypto.createHash('sha1').update(Buffer.from(m.screen.data.buffer)).digest('hex');
    }

    function keys(code) {
        const m = createMachine(path.join(ROOT, 'estyjs'), { quiet: true });
        m.insertDisk('A', disk);
        m.run(boot);
        if (code) { m.keyDown(code); m.run(10); m.keyUp(code); m.run(10); }
        m.run(90);
        return crypto.createHash('sha1').update(Buffer.from(m.screen.data.buffer)).digest('hex');
    }

    const idle = frame([]);
    const down = frame([[{ axis: 2, value: 1 }]]);
    check('ST: gamepad down changes the screen', down !== idle, true);
    check('ST: gamepad down is cursor down', down, keys('ArrowDown'));
    check('ST: gamepad left is cursor left', frame([[{ axis: 1, value: -1 }]]), keys('ArrowLeft'));
    check('ST: gamepad fire is control', frame([[{ button: 2 }]]), keys('ControlLeft'));
    check('ST: start does nothing', frame([[{ button: 9 }]]), idle);
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
