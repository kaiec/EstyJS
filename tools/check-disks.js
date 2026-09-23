/*
 * check-disks.js - boot a set of disk images and check nothing changed.
 *
 * Reading a disk is easy to break in ways that do not throw: a geometry guessed
 * differently, a sector found at the wrong offset, a format decoded as noise.
 * What catches that is the picture on screen, because it only looks right if
 * the boot sector, the FAT and the directory were all read correctly.
 *
 * Each image is booted headlessly; unless --boot-only is given the drive A
 * window is opened, so the frame that gets hashed is a directory listing.
 *
 * usage:
 *   node tools/check-disks.js <image>...              print a hash per image
 *   node tools/check-disks.js --save known.json <image>...
 *   node tools/check-disks.js --check known.json <image>...
 *
 * options:
 *   --boot-only     do not open the drive window (self-booting disks)
 *   --frames N      frames to boot for (default 400)
 *   --png DIR       also write a PNG-able raw RGBA frame per image
 *
 * Raw frames are 640x512 RGBA:
 *   ffmpeg -f rawvideo -pix_fmt rgba -s 640x512 -i frame.raw frame.png
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createMachine } = require('./esty-headless');

const args = process.argv.slice(2);
const opts = { bootOnly: false, frames: 400, save: null, check: null, png: null };
const images = [];

for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case '--boot-only': opts.bootOnly = true; break;
        case '--frames':    opts.frames = parseInt(args[++i], 10); break;
        case '--save':      opts.save = args[++i]; break;
        case '--check':     opts.check = args[++i]; break;
        case '--png':       opts.png = args[++i]; break;
        default:            images.push(args[i]);
    }
}

if (!images.length) {
    console.error('usage: node tools/check-disks.js [options] <image>...');
    process.exit(1);
}

const estyjs = path.join(__dirname, '..', 'estyjs');

function hashOf(image) {
    const m = createMachine(estyjs, { quiet: true });
    m.insertDisk('A', image);
    m.run(opts.frames);

    if (!opts.bootOnly) {
        m.parkMouse();
        m.mouseTo(70, 30);      // the DISK A icon
        m.doubleClick();
        m.run(200);
    }

    if (!m.screen) throw new Error('no frame rendered');

    const frame = Buffer.from(m.screen.data.buffer);
    if (opts.png) {
        fs.mkdirSync(opts.png, { recursive: true });
        fs.writeFileSync(path.join(opts.png, path.basename(image) + '.raw'), frame);
    }

    return crypto.createHash('sha1').update(frame).digest('hex');
}

const known = opts.check ? JSON.parse(fs.readFileSync(opts.check, 'utf8')) : {};
const result = {};
let failed = 0;

for (const image of images) {
    const name = path.basename(image);
    const hash = hashOf(image);
    result[name] = hash;

    if (opts.check) {
        if (known[name] === undefined) {
            console.log('?  ' + name + '  (not in ' + path.basename(opts.check) + ')');
        } else if (known[name] === hash) {
            console.log('ok ' + name);
        } else {
            console.log('FAILED ' + name + '\n   expected ' + known[name] + '\n   got      ' + hash);
            failed++;
        }
    } else {
        console.log(hash + '  ' + name);
    }
}

if (opts.save) {
    fs.writeFileSync(opts.save, JSON.stringify(result, null, 2) + '\n');
    console.log('saved ' + images.length + ' hashes to ' + opts.save);
}

process.exit(failed ? 1 : 0);
