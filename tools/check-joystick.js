/*
 * check-joystick.js - check that the joystick switch switches.
 *
 * With the switch on, the cursor keys and control are joystick 1; with it off
 * they have to be ordinary keys again. Nothing in the emulator reports that
 * directly, so it is measured through a game that only responds to the
 * joystick: two identical machines are run, a key is pressed in one of them,
 * and the question is whether the picture ends up different.
 *
 * Needs a disk that sits at a joystick prompt after booting. Buggy Boy stops at
 * its course selection screen, which is what the default frame count is for.
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
