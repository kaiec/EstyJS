/*
 * check-write.js - check writing to floppy disks.
 *
 * Boots the test disk from test-disk.js. Its program creates A:\OUT.TXT
 * through GEMDOS, then waits three seconds, then reads A:\SECOND.TXT. The
 * check swaps in a second disk holding SECOND.TXT while the program waits, so
 * TOS has to notice the disk change.
 *
 * Checks the written image as .ST and as .MSA, a write protected disk, the
 * disk change, and that a state carries the written disk. With an STX image,
 * also that it is write protected.
 *
 * usage:
 *   node tools/check-write.js [--tos ROM] [image.stx]
 */

const path = require('path');
const { createMachine } = require('./esty-headless');

const ESTYJS = path.join(__dirname, '..', 'estyjs');

const args = process.argv.slice(2);
let tos = null, stx = null;
for (let i = 0; i < args.length; i++) {
    if (args[i] == '--tos') tos = args[++i];
    else stx = args[i];
}

function createST() {
    const m = createMachine(ESTYJS, { quiet: true });
    if (tos) m.changeTOS(tos);
    return m;
}

let failed = 0;
function check(what, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : '\n       got:  ' + JSON.stringify(got) +
                '\n       want: ' + JSON.stringify(want)));
}

const { OUT_TEXT, SECOND_TEXT, RESULTS, makeDisk, readFile, toMSA } = require('./test-disk');

/* -------------------------------------------------------------- running */

function results(m) {
    const ram = Buffer.from(m.decodeState(m.saveState().machine).memory.ram);
    const at = (o) => ram.readInt32BE(RESULTS + o);
    const tag = (o) => ram.toString('latin1', RESULTS + o, RESULTS + o + 4);
    return {
        started: tag(0) == 'WRIT',
        done: tag(16) == 'DONE',
        end: tag(32) == 'END!',
        create: at(4), write: at(8), close: at(12), mediach: at(20),
        open: at(24), read: at(28),
        readText: ram.toString('latin1', RESULTS + 0x40, RESULTS + 0x40 + Math.max(0, at(28)))
    };
}

// Runs until test(results) holds, 20 frames at a time.
function runUntil(m, test, frames) {
    for (let i = 0; i < frames; i += 20) {
        m.run(20);
        const r = results(m);
        if (test(r)) return r;
    }
    return results(m);
}

// What the checks compare, without the drive light.
function info(m) {
    const i = m.getDiskInfo('A');
    return { format: i.format, writeProtected: i.writeProtected, dirty: i.dirty };
}

const disk1 = makeDisk(0x123456, []);
const disk2 = makeDisk(0x654321, [['SECOND  TXT', SECOND_TEXT]]);

function boot(bytes, writeProtected) {
    const m = createST();
    check('insert: accepted', m.insertDiskBytes('A', bytes, writeProtected).ok, true);
    return m;
}

// ------------------------------------------------------------------ .ST ---
{
    const m = boot(disk1, false);
    check('ST: writable', info(m), { format: 'ST', writeProtected: false, dirty: false });

    const r = runUntil(m, r => r.done, 3000);
    check('ST: program ran', r.started && r.done, true);
    check('ST: Fcreate gave a handle', r.create >= 6, true);
    check('ST: Fwrite wrote all', r.write, OUT_TEXT.length);
    check('ST: Fclose', r.close, 0);
    check('ST: disk is dirty', info(m), { format: 'ST', writeProtected: false, dirty: true });
    check('ST: OUT.TXT in the image', readFile(m.getDiskBytes('A'), 'OUT     TXT'), OUT_TEXT);
    check('ST: buffer passed in unchanged', readFile(disk1, 'OUT     TXT'), null);

    // state taken now carries the written disk
    const state = m.saveState();
    const n = createST();
    n.restoreState(state);
    check('state: carries the written disk', readFile(n.getDiskBytes('A'), 'OUT     TXT'), OUT_TEXT);
    check('state: restored disk is clean', info(n), { format: 'ST', writeProtected: false, dirty: false });

    // the disk change
    m.insertDiskBytes('A', disk2, false);
    const e = runUntil(m, r => r.end, 600);
    check('change: program finished', e.end, true);
    check('change: Mediach saw it', e.mediach > 0, true);
    check('change: SECOND.TXT opened', e.open >= 6, true);
    check('change: SECOND.TXT read', e.readText, SECOND_TEXT);
    check('change: second disk not written', m.getDiskInfo('A').dirty, false);
    m.run(100);
    check('change: drive light off after the reads', m.getDiskInfo('A').motor, false);
}

// ----------------------------------------------------------------- .MSA ---
{
    const m = boot(toMSA(disk1), false);
    check('MSA: writable', info(m), { format: 'MSA', writeProtected: false, dirty: false });
    const r = runUntil(m, r => r.done, 3000);
    check('MSA: Fwrite wrote all', r.write, OUT_TEXT.length);
    check('MSA: now an .ST image', info(m), { format: 'ST', writeProtected: false, dirty: true });
    check('MSA: image size', m.getDiskBytes('A').length, disk1.length);
    check('MSA: OUT.TXT in the image', readFile(m.getDiskBytes('A'), 'OUT     TXT'), OUT_TEXT);
}

// ------------------------------------------------------- write protected ---
{
    const m = boot(disk1, true);
    check('protected: reported', info(m), { format: 'ST', writeProtected: true, dirty: false });
    const r = runUntil(m, r => r.done, 3000);
    check('protected: program ran', r.done, true);
    check('protected: Fcreate fails', r.create < 0, true);
    check('protected: image unchanged', Buffer.compare(Buffer.from(m.getDiskBytes('A')), disk1), 0);
    check('protected: not dirty', m.getDiskInfo('A').dirty, false);
}

// ------------------------------------------------------------------ STX ---
if (stx) {
    const m = createST();
    m.insertDisk('A', stx);
    m.run(1);
    check('STX: always write protected', m.getDiskInfo('A').writeProtected, true);
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
