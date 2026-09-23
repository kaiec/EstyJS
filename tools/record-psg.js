/*
 * record-psg.js - boot a disk headlessly and record what it writes to the PSG.
 *
 * Produces a JSON log of every YM2149 register write with the ST clock cycle it
 * happened on, plus a screenshot so you can see what the machine was doing.
 * Feed the log to render-psg.mjs to hear it.
 *
 * usage:
 *   node tools/record-psg.js <disk.st> <out.json> [options]
 *
 * options:
 *   --frames N        frames to record after the program starts (default 1500)
 *   --boot N          frames to wait for the machine to boot (default 400)
 *   --key K [,K...]   key codes to press once booted, e.g. 32 for space
 *   --run X,Y         launch a program from the desktop: opens drive A, makes
 *                     the window full size and double-clicks at ST coordinate
 *                     X,Y. Needed for disks that are not self-booting.
 *   --estyjs DIR      source directory (default <repo>/estyjs)
 *
 * Self-booting disks need no --run or --key; a disk that drops you at the
 * desktop does. Take a screenshot first to find the icon you want:
 *   node tools/record-psg.js disk.st out.json --run 0,0 --frames 1
 */

const fs = require('fs');
const path = require('path');
const { createMachine } = require('./esty-headless');

function parseArgs(argv) {
    const opts = { frames: 1500, boot: 400, keys: [], run: null,
                   estyjs: path.join(__dirname, '..', 'estyjs') };
    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--frames':  opts.frames = parseInt(argv[++i], 10); break;
            case '--boot':    opts.boot   = parseInt(argv[++i], 10); break;
            case '--estyjs':  opts.estyjs = argv[++i]; break;
            case '--key':     opts.keys   = argv[++i].split(',').map(Number); break;
            case '--run':     opts.run    = argv[++i].split(',').map(Number); break;
            default: throw new Error('unknown option ' + argv[i]);
        }
    }
    return opts;
}

const [disk, out, ...rest] = process.argv.slice(2);
if (!disk || !out) {
    console.error('usage: node tools/record-psg.js <disk.st> <out.json> [options]');
    process.exit(1);
}
const opts = parseArgs(rest);

const m = createMachine(opts.estyjs, { quiet: true });
m.insertDisk('A', disk);
m.run(opts.boot);

if (opts.run) {
    // The desktop drives the mouse relatively, so park the pointer in the
    // corner first and measure everything from there.
    m.parkMouse();
    m.mouseTo(70, 30);          // the DISK A icon
    m.doubleClick();
    m.run(150);
    m.mouseTo(628, 52);         // the window's full-size box
    m.click(1, 6, 6);
    m.run(100);
    m.mouseTo(opts.run[0], opts.run[1]);
    m.doubleClick();
    m.run(60);
}

for (const key of opts.keys) {
    m.key(key, 10);
    m.run(600);
}

m.run(opts.frames);
m.saveWrites(out);

const screen = out.replace(/\.json$/, '') + '.screen.raw';
m.saveScreen(screen);

const used = [...new Set(m.writes.map(w => w.reg))].sort((a, b) => a - b);
console.log(`${out}: ${m.frameCount()} frames, ${m.writes.length} writes, registers ${used.join(',')}`);
console.log(`${screen}: 640x512 RGBA - view with`);
console.log(`  ffmpeg -f rawvideo -pix_fmt rgba -s 640x512 -i ${path.basename(screen)} screen.png`);

if (m.writes.length < 100) {
    console.log('\nAlmost nothing was written to the sound chip. The program is');
    console.log('probably not running yet - check the screenshot, and see --run.');
}
