/*
 * check-picker.js - check the file picker.
 *
 * Runs the handlers from esty2-gui.js against a stub DOM and a stub emulator,
 * and checks the message and the drive state per file type.
 *
 * usage:
 *   node tools/check-picker.js
 */

const fs = require('fs'), vm = require('vm'), path = require('path');

function makeContext(loadResult) {
    const els = {
        '#diskmessage': { textContent: '', className: '' },
        '#floppy-1': { src: 'img/floppy-empty.png' },
        '#floppy-2': { src: 'img/floppy-empty.png' }
    };
    const calls = [];
    const sandbox = {
        console,
        document: { querySelector: (q) => els[q] || null, getElementById: () => ({ click() {} }) },
        setTimeout: () => 0,
        requestAnimationFrame: () => 0,
        Image: function () {},
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'esty2-gui.js'), 'utf8'), sandbox);
    // the script declares `var estyjs = null`, so the stub goes in afterwards
    sandbox.estyjs = {
        openFloppyFile: (d, f, cb) => { calls.push('floppy:' + d); cb && cb(loadResult); },
        openZipFile: (d, f, cb) => { calls.push('zip:' + d); cb && cb(loadResult); },
        openSnapshotFile: () => { calls.push('snapshot'); },
        changeTOS: () => { calls.push('tos'); },
        getMouseLocked: () => false
    };
    return { sandbox, els, calls };
}

const evt = (name) => ({ target: { files: name === null ? [] : [{ name }], value: 'x' } });

let failed = 0;
function check(what, got, want) {
    const ok = got === want;
    if (!ok) failed++;
    console.log((ok ? 'ok   ' : 'FAIL ') + what + '\n       got:  ' + JSON.stringify(got) +
                (ok ? '' : '\n       want: ' + JSON.stringify(want)));
}

// a disk that reads
let c = makeContext({ ok: true, format: 'STX', tracks: 80, sides: 1 });
c.sandbox.fileSelected(evt('Buggy Boy - Elite.stx'));
check('good .stx message', c.els['#diskmessage'].textContent,
      'Drive A: Buggy Boy - Elite.stx (STX, 80 tracks, single sided)');
check('good .stx marks drive full', c.els['#floppy-1'].src, 'img/floppy-active.png');
check('good .stx not flagged', c.els['#diskmessage'].className, '');

// a file with a disk extension that is not a disk
c = makeContext({ ok: false });
c.els['#floppy-1'].src = 'img/floppy-active.png';   // something was in the drive
c.sandbox.fileSelected(evt('Dungeon Master.stx'));
check('unreadable .stx message', c.els['#diskmessage'].textContent,
      'Drive A is empty: Dungeon Master.stx is not a disk image EstyJS can read.');
check('unreadable .stx empties drive', c.els['#floppy-1'].src, 'img/floppy-empty.png');
check('unreadable .stx flagged', c.els['#diskmessage'].className, 'problem');

// a format EstyJS does not read at all
c = makeContext({ ok: true, format: 'ST', tracks: 80, sides: 2 });
c.els['#floppy-1'].src = 'img/floppy-active.png';
c.sandbox.fileSelected(evt('Xenon.ipf'));
check('.ipf message', c.els['#diskmessage'].textContent,
      'EstyJS cannot read .ipf files. It reads .st, .msa, .stx, .zip and .sts.');
check('.ipf loads nothing', c.calls.length, 0);
check('.ipf leaves the drive alone', c.els['#floppy-1'].src, 'img/floppy-active.png');

// no extension at all
c = makeContext({ ok: true, format: 'ST', tracks: 80, sides: 2 });
c.sandbox.fileSelected(evt('README'));
check('no extension message', c.els['#diskmessage'].textContent,
      'EstyJS cannot read files without an extension. It reads .st, .msa, .stx, .zip and .sts.');

// drive B, double sided
c = makeContext({ ok: true, format: 'MSA', tracks: 84, sides: 2 });
c.sandbox.fileSelected2(evt('gfa.msa'));
check('drive B message', c.els['#diskmessage'].textContent,
      'Drive B: gfa.msa (MSA, 84 tracks, double sided)');
check('drive B image', c.els['#floppy-2'].src, 'img/floppy-active.png');
check('drive A untouched', c.els['#floppy-1'].src, 'img/floppy-empty.png');

// a zip with nothing usable inside
c = makeContext({ ok: false });
c.sandbox.fileSelected(evt('demos.zip'));
check('empty zip message', c.els['#diskmessage'].textContent,
      'Drive A is empty: demos.zip is not a disk image EstyJS can read.');

// snapshot
c = makeContext({ ok: true, snapshot: true });
c.sandbox.fileSelected(evt('game.sts'));
check('snapshot message', c.els['#diskmessage'].textContent, 'Loaded the snapshot in game.sts.');
check('snapshot does not mark a drive', c.els['#floppy-1'].src, 'img/floppy-empty.png');

// rom picker
c = makeContext({ ok: true });
c.sandbox.tosSelected(evt('tos104.txt'));
check('wrong rom type message', c.els['#diskmessage'].textContent, 'A ROM has to be a .img file.');
check('wrong rom loads nothing', c.calls.length, 0);
c.sandbox.tosSelected(evt('tos104.img'));
check('rom accepted', c.els['#diskmessage'].textContent, 'Using the ROM in tos104.img.');

// cancelled picker
c = makeContext({ ok: true });
c.sandbox.fileSelected(evt(null));
check('cancelled picker says nothing', c.els['#diskmessage'].textContent, '');

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
