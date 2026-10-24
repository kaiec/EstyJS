/*
 * check-states.js - check that a saved state continues as the machine would.
 *
 * Boots an image, saves the state, runs on and keeps the frame and the state.
 * A fresh machine restores the saved state and runs the same frames with the
 * same input. Both must end with the same frame and the same state. A field
 * that getState misses shows up as a difference, here or later in RAM.
 *
 * Both machines get the same random seed at the save point, so fuzzy bytes on
 * STX disks read the same.
 *
 * usage:
 *   node tools/check-states.js [options] <image>...
 *
 * options:
 *   --boot N     frames before saving (default 1500)
 *   --after N    frames after saving (default 600)
 *   --desktop    open the drive A window before saving (disks that do not boot)
 *   --512k       save from a 512 KB machine
 *   --mono       save from a machine with a monochrome monitor
 *
 * The restoring machine always starts as 1 MB with a colour monitor, so the
 * last two check that a state carries memory size and monitor.
 */

const path = require('path');
const crypto = require('crypto');
const { createMachine } = require('./esty-headless');

const args = process.argv.slice(2);
const opts = { boot: 1500, after: 600, desktop: false, small: false, mono: false };
const images = [];

for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case '--boot':    opts.boot = parseInt(args[++i], 10); break;
        case '--after':   opts.after = parseInt(args[++i], 10); break;
        case '--desktop': opts.desktop = true; break;
        case '--512k':    opts.small = true; break;
        case '--mono':    opts.mono = true; break;
        default:          images.push(args[i]);
    }
}

if (!images.length) {
    console.error('usage: node tools/check-states.js [options] <image>...');
    process.exit(1);
}

const estyjs = path.join(__dirname, '..', 'estyjs');
const SEED = 1987;

const hash = (bytes) => crypto.createHash('sha1').update(Buffer.from(bytes)).digest('hex');
const diskHash = (bytes) => bytes ? hash(bytes) : 'empty';

// Mouse, keys and joystick, so that the IKBD state is exercised as well.
function play(m) {
    m.run(30);
    m.parkMouse();
    m.mouseTo(100, 60);
    m.click();
    m.key('Space');
    m.key('ControlLeft');
    m.key('ArrowDown', 10);
    m.run(opts.after - 30 - 8 - 4 - 10 - 8 - 8 - 20);
}

// Path and values of the first difference between two decoded states.
function firstDifference(a, b, where) {
    if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
        if (a.length != b.length) return where + ': length ' + a.length + ' / ' + b.length;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return where + '[' + i + ']: ' + a[i] + ' / ' + b[i];
        }
        return null;
    }
    if (a && b && typeof a == 'object' && typeof b == 'object') {
        const keys = new Set(Object.keys(a).concat(Object.keys(b)));
        for (const k of keys) {
            const d = firstDifference(a[k], b[k], where ? where + '.' + k : k);
            if (d) return d;
        }
        return null;
    }
    return a === b ? null : where + ': ' + JSON.stringify(a) + ' / ' + JSON.stringify(b);
}

let failed = 0;

function check(what, ok, detail) {
    if (!ok) failed++;
    console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok || !detail ? '' : '\n     ' + detail));
}

for (const image of images) {
    const name = path.basename(image);

    const a = createMachine(estyjs, { quiet: true });
    if (opts.small) a.setMemory(false);
    if (opts.mono) a.setMonoMonitor(true);
    a.insertDisk('A', image);
    a.run(opts.boot);
    if (opts.desktop) {
        a.parkMouse();
        a.mouseTo(70, 30);
        a.doubleClick();
        a.run(100);
    }

    a.seedRandom(SEED);
    const saved = a.saveState();

    const again = a.saveState();
    check(name + ': saving twice gives the same bytes',
          hash(saved.machine) == hash(again.machine));

    play(a);
    const wantFrame = hash(a.screen.data.buffer);
    const wantState = a.saveState();

    const b = createMachine(estyjs, { quiet: true });
    b.restoreState(saved);
    b.seedRandom(SEED);
    play(b);
    const gotFrame = hash(b.screen.data.buffer);
    const gotState = b.saveState();

    check(name + ': same frame after ' + opts.after + ' frames', gotFrame == wantFrame);
    check(name + ': same state after ' + opts.after + ' frames',
          hash(gotState.machine) == hash(wantState.machine),
          firstDifference(a.decodeState(wantState.machine), b.decodeState(gotState.machine), ''));
    check(name + ': same disks in the drives',
          ['A', 'B'].every((d) => diskHash(wantState.disks[d]) == diskHash(gotState.disks[d])));
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
