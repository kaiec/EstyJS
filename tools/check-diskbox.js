/*
 * check-diskbox.js - check the disk box in a real browser.
 *
 * Serves the working copy to headless Chromium (WebGL on SwiftShader) with a
 * profile of its own. Adds the test disk from test-disk.js to the box through
 * the file input, inserts it into drive A and resets the ST. The program on
 * the disk creates a file, which has to reach the disk in the box once the
 * drive light goes off. Then takes the disk out again, copies it to a second
 * box, saves and loads a state, exports and imports boxes, and checks the
 * fallback to the file picker without WebGL2 or IndexedDB.
 *
 * usage:
 *   node tools/check-diskbox.js [image.stx] [--port N]
 *
 * With an STX image, also checks that it goes into the box write protected.
 * Needs `chromium` on PATH.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { serve, browser, sleep } = require('./chromium');
const { OUT_TEXT, makeDisk } = require('./test-disk');

const DEBUG_PORT = 9337;

const args = process.argv.slice(2);
let stx = null, port = 8127;
for (let i = 0; i < args.length; i++) {
    if (args[i] == '--port') port = parseInt(args[++i], 10);
    else stx = path.resolve(args[i]);
}

let failed = 0;
function check(what, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : '\n       got:  ' + JSON.stringify(got) +
                '\n       want: ' + JSON.stringify(want)));
}

// Asks the page every second until test returns something other than null.
async function until(b, body, seconds) {
    for (let i = 0; i < seconds; i++) {
        const value = await b.page(body);
        if (value != null) return value;
        await sleep(1000);
    }
    return null;
}

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estyjs-diskbox-'));
    const testDisk = path.join(dir, 'test.st');
    fs.writeFileSync(testDisk, makeDisk(0x123456, []));

    const server = await serve(port);
    const b = await browser(port, DEBUG_PORT);

    try {
        await b.open('typeof EstyDiskbox == "object" && EstyDiskbox.available');
        await b.page(`
            window.__sent = [];
            estyjs.setKeyListener((scancode) => __sent.push(scancode));
            window.__overlay = () => !document.querySelector('.db-overlay').hidden;
            window.__message = () => document.querySelector('.db-message').textContent;
            window.__open = () => document.querySelector('.db-label').value;
            window.__button = (label) => Array.from(document.querySelectorAll('.db-overlay button'))
                .find(e => e.textContent == label && e.offsetParent != null);`);

        // opening an empty drive
        await b.page(`driveClicked('A');`);
        await sleep(500);
        check('open: shown', await b.page(`return __overlay();`), true);
        check('open: asks for a disk', await b.page(`return __message();`), 'Choose a disk for drive A.');

        await b.type('x');
        check('open: keys do not reach the ST', await b.page(`return __sent;`), []);

        // adding images
        await b.pick('.db-tools input[type=file]', [testDisk]);
        check('add: message', await until(b, `return __message().startsWith('Added') ? __message() : null;`, 10),
              'Added test.st to the box.');
        check('add: count', await b.page(`return document.querySelector('.db-count').textContent;`), '1 / 60');
        check('add: open with its name as label', await b.page(`return __open();`), 'test');

        if (stx) {
            await b.pick('.db-tools input[type=file]', [stx]);
            await until(b, `return __message().startsWith('Added ${path.basename(stx)}') ? true : null;`, 10);
            check('add STX: write protected', await b.page(`
                const wp = Array.from(document.querySelectorAll('.db-panel input[type=checkbox]'))[1];
                return [wp.checked, wp.disabled];`), [true, true]);
            await b.page(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));`);
            await sleep(300);
            check('browse: back to the test disk', await b.page(`return __open();`), 'test');
        }

        // into drive A, and the ST writes to it
        await b.page(`__button('Into drive A').click();`);
        await sleep(1000);
        check('insert: box closed', await b.page(`return __overlay();`), false);
        check('insert: message', await b.page(`return document.querySelector('#diskmessage').textContent;`),
              'Drive A: test (ST, 80 tracks, double sided)');
        check('insert: in the drive', await b.page(`
            const i = estyjs.getDiskInfo('A');
            return [i.format, i.writeProtected];`), ['ST', false]);

        await b.page(`estyjs.reset();`);
        const written = await until(b, `
            const box = (await EstyJs.store.listBoxes())[0];
            const disk = (await EstyJs.store.listDisks(box.id)).find(d => d.name == 'test.st');
            const bytes = await EstyJs.store.getDiskBytes(disk.id);
            // the directory entry, and the text a second time (the program holds it too)
            const text = new TextDecoder('latin1').decode(bytes);
            return text.includes('OUT     TXT') && text.split(${JSON.stringify(OUT_TEXT)}).length == 3
                ? { light: estyjs.getDiskInfo('A').motor, dirty: estyjs.getDiskInfo('A').dirty } : null;`, 60);
        check('write back: the file reached the box', written != null, true);
        check('write back: after the light went off', written, { light: false, dirty: false });

        // taking it out again
        await b.page(`driveClicked('A');`);
        await sleep(1000);
        check('take out: drive empty', await b.page(`return estyjs.getDiskInfo('A');`), null);
        check('take out: box open at the disk', await b.page(`return __open();`), 'test');

        // a second box
        const boxes = await b.page(`
            const blobs = await EstyJs.store.countBlobs();
            __button('New box').click();
            await new Promise(r => setTimeout(r, 1000));
            const select = document.querySelector('.db-boxes');
            select.value = select.options[0].value;
            select.dispatchEvent(new Event('change'));
            await new Promise(r => setTimeout(r, 1000));
            const it = __open();
            __button('Copy').click();
            await new Promise(r => setTimeout(r, 1000));
            const all = await EstyJs.store.listBoxes();
            const counts = [];
            for (const box of all) counts.push((await EstyJs.store.listDisks(box.id)).length);
            return { boxes: all.length, counts, opened: it, sameBlobs: (await EstyJs.store.countBlobs()) == blobs };`);
        check('second box: created', boxes.boxes, 2);
        check('second box: copy', boxes.counts, [stx ? 2 : 1, 1]);
        check('second box: copy shares the image', boxes.sameBlobs, true);

        // closing leaves the drive empty
        await b.page(`__button('Close box').click();`);
        await sleep(300);
        check('close: hidden', await b.page(`return __overlay();`), false);
        check('close: message', await b.page(`return document.querySelector('#diskmessage').textContent;`),
              'Drive A is empty.');
        await b.type('y');
        check('close: keys reach the ST again', (await b.page(`return __sent;`)).length > 0, true);

        // states know the disk
        const states = await b.page(`
            driveClicked('A');
            await new Promise(r => setTimeout(r, 1000));
            const select = document.querySelector('.db-boxes');
            select.value = select.options[0].value;
            select.dispatchEvent(new Event('change'));
            await new Promise(r => setTimeout(r, 1000));
            __button('Into drive A').click();
            await new Promise(r => setTimeout(r, 1000));
            const id = EstyDiskbox.diskInDrive('A');
            await EstyStates.save();
            const record = (await EstyJs.store.listStates())[0];
            await EstyStates.load(record.id);
            return { saved: record.drives.A.disk == id, loaded: EstyDiskbox.diskInDrive('A') == id,
                     inDrive: estyjs.getDiskInfo('A') != null };`);
        check('state: saved with the disk', states.saved, true);
        check('state: loaded with the disk', states.loaded, true);
        check('state: disk in the drive', states.inDrive, true);

        // export and import: a divider with a disk behind it first
        await b.page(`
            driveClicked('B');
            await new Promise(r => setTimeout(r, 1000));
            const select = document.querySelector('.db-boxes');
            select.value = select.options[0].value;
            select.dispatchEvent(new Event('change'));
            await new Promise(r => setTimeout(r, 1000));
            __button('Add divider').click();
            const name = document.querySelector('.db-panel input[type=text]');
            name.value = 'Games';
            name.dispatchEvent(new Event('input'));
            name.dispatchEvent(new Event('change'));
            await new Promise(r => setTimeout(r, 500));
            __button('Close box').click();`);

        const roundTrip = await b.page(`
            const store = EstyJs.store;
            async function describe(id) {
                const box = await store.getBox(id);
                const disks = new Map((await store.listDisks(id)).map(d => [d.id, d]));
                return { title: box.title, items: box.items.map(item => {
                    if (item.sep != null) return 'sep ' + item.sep + ' ' + item.side;
                    const d = disks.get(item.disk);
                    return [d.title, d.hasLabel, d.accent, d.body, d.writeProtected, d.name, d.format, d.blob].join('|');
                }) };
            }
            const before = (await store.listBoxes()).map(b => b.id);
            // nothing at its default, so a field export or import drops shows
            const first = (await store.listDisks(before[0])).find(d => d.name == 'test.st');
            await store.updateDisk(first.id, { title: 'test\\nsecond line', hasLabel: false, accent: '#2563c9',
                                               body: '#b3322c', writeProtected: true });
            const zip = await store.exportBoxes(before);
            const names = (await EstyJs.zip.read(zip)).map(f => f.name);
            const result = await store.importBoxes(zip, 'export.zip');
            const same = [];
            for (let i = 0; i < before.length; i++) {
                same.push(JSON.stringify(await describe(before[i])) == JSON.stringify(await describe(result.boxes[i])));
            }
            return { names, same, skipped: result.skipped };`);
        check('export: a folder for the divider', roundTrip.names.some(n => /^Disks\/GAMES\/test\.st$/.test(n)), true);
        check('export: label beside the image', roundTrip.names.includes('Disks/GAMES/test.json'), true);
        check('export: box.json per box', roundTrip.names.filter(n => n.endsWith('/box.json')).length, 2);
        check('import of an export: boxes as they were', roundTrip.same, [true, true]);
        check('import of an export: nothing left out', roundTrip.skipped, 0);

        const handmade = await b.page(`
            const store = EstyJs.store;
            const box = (await store.listBoxes())[0];
            const disk = (await store.listDisks(box.id)).find(d => d.name == 'test.st');
            const st = await store.getDiskBytes(disk.id);
            const zip = await EstyJs.zip.write([
                { name: 'Handmade/Loose.st', bytes: st },
                { name: 'Handmade/Games/Game.st', bytes: st },
                { name: 'Handmade/Tools/Tool.st', bytes: st },
                { name: 'Handmade/readme.txt', bytes: new TextEncoder().encode('hello') },
                { name: 'Top.st', bytes: st }
            ]);
            const result = await store.importBoxes(zip, 'pack.zip');
            const out = [];
            for (const id of result.boxes) {
                const b = await store.getBox(id);
                const disks = new Map((await store.listDisks(id)).map(d => [d.id, d]));
                out.push(b.title + ': ' + b.items.map(i => i.sep != null ? '[' + i.sep + ']' : disks.get(i.disk).title).join(' '));
            }
            const many = await EstyJs.zip.write(Array.from({ length: 61 }, (_, i) => ({ name: 'Many/' + i + '.st', bytes: st })));
            const split = await store.importBoxes(many, 'many.zip');
            const sizes = [];
            for (const id of split.boxes) { const b = await store.getBox(id); sizes.push(b.title + ' ' + b.items.length); }
            return { boxes: out, disks: result.disks, skipped: result.skipped, sizes };`);
        check('import by hand: boxes, from the back', handmade.boxes,
              ['Handmade: Tool [TOOLS] Game [GAMES] Loose', 'pack: Top']);
        check('import by hand: disks', handmade.disks, 4);
        check('import by hand: readme left out', handmade.skipped, 1);
        check('import of 61 disks: two boxes', handmade.sizes, ['Many 60', 'Many (2) 1']);

        check('no page errors', b.errors, []);

        // the file picker without IndexedDB, and without WebGL2
        for (const [what, source] of [
            ['no IndexedDB', `Object.defineProperty(window, 'indexedDB', { value: undefined });`],
            ['no WebGL2', `const get = HTMLCanvasElement.prototype.getContext;
                           HTMLCanvasElement.prototype.getContext = function (type, o) {
                               return type == 'webgl2' ? null : get.call(this, type, o); };`]]) {
            const script = await b.beforeLoad(source);
            await b.open();
            await sleep(2000);
            check(what + ': box not available', await b.page(`return EstyDiskbox.available;`), false);
            check(what + ': drive opens the file picker', await b.page(`
                let picked = null;
                document.getElementById('selectedFile').click = () => { picked = 'A'; };
                driveClicked('A');
                return picked;`), 'A');
            await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.result.identifier });
        }
    } catch (e) {
        failed++;
        console.log('FAIL ' + e.message);
    } finally {
        await b.close();
        server.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }

    console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
