/*
 * chromium.js - the working copy in headless Chromium, for the browser checks.
 *
 * serve() serves the repository, with extra files at given paths. browser()
 * starts Chromium with a profile of its own and drives it over the DevTools
 * protocol. WebGL runs on SwiftShader.
 *
 *   const server = await serve(port, { '/__disk__': '/path/to/image' });
 *   const b = await browser(port, debugPort);
 *   await b.open();                    // loads the page, waits for EstyJS
 *   await b.page('return 1 + 1;');     // an async function body, run in the page
 *   await b.close(); server.close();
 *
 * Needs `chromium` on PATH.
 */

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
                '.json': 'application/json' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

// extra: URL path -> file
function serve(port, extra = {}) {
    const server = http.createServer((req, res) => {
        let name = decodeURIComponent(req.url.split('?')[0]);
        if (name == '/') name = '/index.html';
        const file = extra[name] || path.join(ROOT, name);
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, {
                'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            res.end(data);
        });
    });
    return new Promise(r => server.listen(port, () => r(server)));
}

async function browser(port, debugPort) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'estyjs-check-'));
    const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--mute-audio',
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'],
        { stdio: ['ignore', 'ignore', 'ignore'] });
    const exited = new Promise(r => chrome.on('exit', r));

    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
        await sleep(200);
        try { targets = await (await fetch(`http://localhost:${debugPort}/json/list`)).json(); } catch {}
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

    // ready: a page expression that is true once the page is set up
    const open = async (ready = 'typeof estyjs == "object" && estyjs != null') => {
        await send('Page.navigate', { url: `http://localhost:${port}/` });
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            try { if (await page(`return ${ready};`)) return; } catch {}
        }
        throw new Error('EstyJS did not start');
    };

    // Script run in every page before its own scripts, for faking a browser
    // that lacks something.
    const beforeLoad = (source) => send('Page.addScriptToEvaluateOnNewDocument', { source });

    // Types text as key presses into whatever has the focus, then Enter.
    const type = async (text) => {
        for (const ch of text) {
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, code: 'Key' + ch.toUpperCase() });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Key' + ch.toUpperCase() });
        }
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    };

    // Hands files to an <input type="file"> as if picked.
    const pick = async (selector, files) => {
        const doc = await send('DOM.getDocument', {});
        const node = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector });
        await send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files });
    };

    const close = async () => {
        chrome.kill();
        await exited;
        fs.rmSync(profile, { recursive: true, force: true });
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('DOM.enable');
    // a headless page never has the focus, so no field would get it
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 900, deviceScaleFactor: 1, mobile: false });

    return { page, open, close, type, pick, beforeLoad, send, errors };
}

module.exports = { serve, browser, sleep };
