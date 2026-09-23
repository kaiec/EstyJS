/*
 * check-joystick.js - check the joystick switch.
 *
 * With the switch on, cursor keys and control are joystick 1; with it off they
 * are keys. Measured through a game that responds to joystick 1 only: two
 * identical machines, one key press, and whether the frames differ.
 *
 * Needs a disk that stops at a joystick prompt. The default frame count suits
 * Buggy Boy's course selection screen.
 *
 * usage:
 *   node tools/check-joystick.js <disk> [boot-frames]
 */

const path = require('path');
const crypto = require('crypto');
const { createMachine } = require('./esty-headless');

const disk = process.argv[2];
const boot = parseInt(process.argv[3] || '1500', 10);

if (!disk) {
    console.error('usage: node tools/check-joystick.js <disk> [boot-frames]');
    process.exit(1);
}

const estyjs = path.join(__dirname, '..', 'estyjs');
const AFTER = 90;

function run(joystickOn, keyCode) {
    const m = createMachine(estyjs, { quiet: true });
    m.setJoystick(joystickOn);
    m.insertDisk('A', disk);
    m.run(boot);
    if (keyCode !== null) m.key(keyCode, 10);
    m.run(AFTER);
    return crypto.createHash('sha1').update(Buffer.from(m.screen.data.buffer)).digest('hex');
}

const CONTROL = 17, DOWN = 40;
let failed = 0;

function check(what, got, want) {
    const ok = got === want;
    if (!ok) failed++;
    console.log((ok ? 'ok   ' : 'FAIL ') + what);
}

for (const on of [true, false]) {
    const idle = run(on, null);
    const label = 'joystick ' + (on ? 'on ' : 'off') + ': ';
    check(label + 'control ' + (on ? 'is fire' : 'is not fire'), run(on, CONTROL) !== idle, on);
    check(label + 'cursor down ' + (on ? 'moves the stick' : 'does not'), run(on, DOWN) !== idle, on);
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
