/*
 * check-store.js - check saved states in a real browser.
 *
 * Serves the working copy and drives headless Chromium over the DevTools
 * protocol, with a profile of its own. Boots the disk, saves states through
 * the panel's functions, loads them, exports, deletes and imports, and checks
 * the reference counts of the shared blobs on the way. Also checks that a key
 * held when saving is released after loading, and that a database set up by
 * a newer EstyJS is reported.
 *
 * usage:
 *   node tools/check-store.js <disk> [--port N]
 *
 * Needs `chromium` on PATH. IndexedDB does not exist under Node.
 */

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEBUG_PORT = 9336;

const args = process.argv.slice(2);
let disk = null, port = 8126;
for (let i = 0; i < args.length; i++) {
    if (args[i] == '--port') port = parseInt(args[++i], 10);
    else disk = args[i];
}
if (!disk) {
    console.error('usage: node tools/check-store.js <disk> [--port N]');
    process.exit(1);
}

let failed = 0;
function check(what, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : '\n       got:  ' + JSON.stringify(got) +
                '\n       want: ' + JSON.stringify(want)));
}

// ----------------------------------------------------------------- server ---

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = http.createServer((req, res) => {
    let name = decodeURIComponent(req.url.split('?')[0]);
    if (name == '/') name = '/index.html';
    const file = name == '/__disk__' ? disk : path.join(ROOT, name);
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(data);
    });
});

// ---------------------------------------------------------------- browser ---

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function browser() {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'estyjs-store-'));
    const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--mute-audio',
        `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, 'about:blank'],
        { stdio: ['ignore', 'ignore', 'ignore'] });

    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
        await sleep(200);
        try { targets = await (await fetch(`http://localhost:${DEBUG_PORT}/json/list`)).json(); } catch {}
    }
    if (!targets) throw new Error('chromium did not start');

    const socket = new WebSocket(targets.find(t => t.type == 'page').webSocketDebuggerUrl);
    await new Promise(r => { socket.onopen = r; });

    let nextId = 0;
    const waiting = new Map();
    const errors = [];
    socket.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
        else if (m.method == 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || 'exception');
    };
    const send = (method, params = {}) => new Promise(resolve => {
        const id = ++nextId;
        waiting.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
    });

    // Runs an async function body in the page and returns its value.
    const page = async (body) => {
        const m = await send('Runtime.evaluate', {
            expression: `(async () => { ${body} })()`, returnByValue: true, awaitPromise: true
        });
        if (m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description);
        return m.result.result.value;
    };

    const open = async () => {
        await send('Page.navigate', { url: `http://localhost:${port}/` });
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            try { if (await page('return typeof estyjs == "object" && estyjs != null;')) return; } catch {}
        }
        throw new Error('EstyJS did not start');
    };

    await send('Runtime.enable');
    await send('Page.enable');
    // a headless page never has the focus, so no field would get it
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });

    const exited = new Promise(r => chrome.on('exit', r));
    const close = async () => {
        chrome.kill();
        await exited;
        fs.rmSync(profile, { recursive: true, force: true });
    };
    // Types text as key presses into whatever has the focus, then Enter.
    const type = async (text) => {
        for (const ch of text) {
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, code: 'Key' + ch.toUpperCase() });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Key' + ch.toUpperCase() });
        }
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    };

    return { page, open, close, type, errors };
}

// ------------------------------------------------------------------ checks ---

(async () => {
    await new Promise(r => server.listen(port, r));
    const b = await browser();

    try {
        await b.open();

        // helpers inside the page
        await b.page(`
            window.__decode = (buffer) => EstyJs.SnapshotFile({}).decode(buffer);
            window.__key = (code, down) => document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
            window.__rows = () => document.querySelectorAll('#statepanelbody .st-row').length;
        `);

        await b.page(`openFileInDrive('__disk__', 'A');`);
        await sleep(6000);

        // first state, with A held
        await b.page(`__key('KeyA', true);`);
        await sleep(300);
        await b.page(`await EstyStates.save();`);
        await b.page(`__key('KeyA', false);`);
        check('save: listed', await b.page(`return (await EstyJs.store.listStates()).length;`), 1);
        check('save: machine, ROM and disk blobs', await b.page(`return EstyJs.store.countBlobs();`), 3);
        check('save: row in the panel', await b.page(`return __rows();`), 1);
        check('save: message', await b.page(`return document.querySelector('#diskmessage').textContent;`),
              'Saved the state "__disk__".');

        const first = await b.page(`
            const r = (await EstyJs.store.listStates())[0];
            const s = await EstyJs.store.getState(r.id);
            return { id: r.id, keys: __decode(s.machine).keyboard.keysDown, thumbnail: r.thumbnail.byteLength > 0,
                     drives: r.drives.A.name + ',' + r.drives.B };`);
        check('save: key A held in the state', first.keys, [0x1e]);
        check('save: thumbnail', first.thumbnail, true);
        check('save: drive names', first.drives, '__disk__,null');

        await sleep(2000);
        await b.page(`await EstyStates.save();`);
        check('second save: ROM and disk shared', await b.page(`return EstyJs.store.countBlobs();`), 4);

        // loading gives the machine as saved, then releases A
        const loaded = await b.page(`
            estyjs.pauseResume();
            await EstyStates.load(${first.id});
            const r = await EstyJs.store.getState(${first.id});
            const now = __decode(estyjs.saveState().machine);
            const saved = __decode(r.machine);
            estyjs.pauseResume();
            return {
                ram: now.memory.ram.every((v, i) => v == saved.memory.ram[i]),
                pc: now.processor.pc == saved.processor.pc,
                keys: now.keyboard.keysDown,
                sent: Array.from(now.keyboard.dataOut).slice(-1),
                message: document.querySelector('#diskmessage').textContent
            };`);
        check('load: RAM as saved', loaded.ram, true);
        check('load: PC as saved', loaded.pc, true);
        check('load: key A released', loaded.keys, []);
        check('load: break code for A sent', loaded.sent, [0x9e]);
        check('load: message', loaded.message, 'Loaded the state "__disk__".');

        // rename
        await b.page(`await EstyJs.store.renameState(${first.id}, 'Renamed'); await EstyStates.refresh();`);
        check('rename: stored', await b.page(`return (await EstyJs.store.getState(${first.id})).record.name;`), 'Renamed');
        check('rename: shown', await b.page(`return Array.from(document.querySelectorAll('.st-name')).map(e => e.value).sort();`),
              ['Renamed', '__disk__']);

        // typing into the name field renames, and the ST gets none of it
        await b.page(`
            window.__sent = [];
            estyjs.setKeyListener((scancode, down) => __sent.push(scancode));
            EstyStates.show();
            const field = document.querySelector('.st-name');
            field.focus();
            field.select();`);
        await b.type('typed');
        await sleep(300);
        const typed = await b.page(`
            const records = await EstyJs.store.listStates();
            return { names: records.map(r => r.name).sort(),
                     focus: document.activeElement.className,
                     sent: __sent };`);
        check('typing: renamed', typed.names, ['Renamed', 'typed']);
        check('typing: Enter leaves the field', typed.focus != 'st-name', true);
        check('typing: no keys for the ST', typed.sent, []);

        // export, delete all, import twice
        const exported = await b.page(`
            const ids = (await EstyJs.store.listStates()).map(r => r.id);
            window.__zip = await EstyJs.store.exportStates(ids);
            const files = await EstyJs.zip.read(window.__zip);
            for (const id of ids) await EstyJs.store.deleteState(id);
            return { files: files.map(f => f.name.replace(/[0-9a-f]{64}/, 'HASH')).sort(),
                     left: (await EstyJs.store.listStates()).length, blobs: await EstyJs.store.countBlobs() };`);
        check('export: files', exported.files,
              ['blobs/HASH', 'blobs/HASH', 'blobs/HASH', 'blobs/HASH', 'states.json', 'thumbnails/1.png', 'thumbnails/2.png']);
        check('delete: no states left', exported.left, 0);
        check('delete: no blobs left', exported.blobs, 0);

        const reimported = await b.page(`
            const ids = await EstyJs.store.importStates(window.__zip);
            const blobs = await EstyJs.store.countBlobs();
            await EstyJs.store.importStates(window.__zip);
            const records = await EstyJs.store.listStates();
            const again = await EstyJs.store.countBlobs();
            const loads = (await EstyJs.store.getState(ids[0])).machine.byteLength > 0;
            for (const id of ids) await EstyJs.store.deleteState(id);
            const half = await EstyJs.store.countBlobs();
            return { ids: ids.length, blobs, again, half, names: records.map(r => r.name).sort(),
                     loads };`);
        check('import: two states', reimported.ids, 2);
        check('import: blobs back', reimported.blobs, 4);
        check('import again: blobs shared', reimported.again, 4);
        check('import again: names', reimported.names, ['Renamed', 'Renamed', 'typed', 'typed']);
        check('delete one copy: blobs kept', reimported.half, 4);
        check('import: state readable', reimported.loads, true);

        check('import: not a ZIP', await b.page(`
            try { await EstyJs.store.importStates(new Uint8Array(100)); return 'no error'; }
            catch (e) { return e.message; }`), 'not a ZIP archive');

        // the next save takes the name of the state loaded or saved before
        const kept = await b.page(`
            const typed = (await EstyJs.store.listStates()).find(r => r.name == 'typed');
            await EstyStates.load(typed.id);
            const message = document.querySelector('#diskmessage').textContent;
            await EstyStates.save();
            const afterLoad = (await EstyJs.store.listStates())[0].name;
            const field = document.querySelector('.st-name');
            field.focus();
            field.select();
            return { afterLoad, message };`);
        await b.type('later');
        await sleep(300);
        const renamed = await b.page(`
            await EstyStates.save();
            return (await EstyJs.store.listStates()).map(r => r.name);`);
        check('import: loads', kept.message, 'Loaded the state "typed".');
        check('name: kept after load', kept.afterLoad, 'typed');
        check('name: rename of the current state kept', renamed.slice(0, 2), ['later', 'later']);

        // a newer EstyJS raised the database version
        await b.page(`
            await EstyJs.store.open();
            await new Promise((resolve, reject) => {
                const r = indexedDB.open('estyjs', 2);
                r.onsuccess = () => { r.result.close(); resolve(); };
                r.onerror = () => reject(r.error);
            });`);
        await b.open();
        await sleep(500);
        check('newer database: reported', await b.page(`return document.querySelector('.st-usage').textContent;`),
              'The storage was set up by a newer EstyJS. Open that version to use it.');

        check('no page errors', b.errors, []);
    } catch (e) {
        failed++;
        console.log('FAIL ' + e.message);
    } finally {
        await b.close();
        server.close();
    }

    console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
