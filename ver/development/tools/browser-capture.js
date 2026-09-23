/*
 * browser-capture.js - record what EstyJs plays, in a real browser.
 *
 * Serves the working copy, drives headless Chromium over the DevTools protocol,
 * boots a disk, switches sound on and taps the audio graph, then writes what
 * came out to a WAV file. Prints the worklet's buffer lead and the speed
 * correction applied to hold it.
 *
 * render-psg.mjs covers the emulation and the chip. This covers the audio path
 * in real time.
 *
 * usage:
 *   node tools/browser-capture.js <disk.st> <out.wav> [options]
 *
 * options:
 *   --seconds N     how long to record once sound is on (default 20)
 *   --boot N        seconds to wait for the machine to boot (default 9)
 *   --key K[,K...]  key codes to press after booting, 7s apart (32 = space)
 *   --run X,Y       launch a program from the desktop, as in record-psg.js
 *   --port N        port for the local server (default 8123)
 *   --status        print the worklet's per-second report rather than a summary
 *   --shot FILE     save a PNG of the screen when the recording ends
 *   --mash C,MS     hold key code C for MS milliseconds, repeatedly, while
 *                   recording - for sound effects that need a button pressed
 *                   (17 is the joystick fire button)
 *
 * Needs `chromium` on PATH. Nothing is installed and no data leaves the machine.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEBUG_PORT = 9333;

// ---------------------------------------------------------------- options ---

const [disk, outWav, ...rest] = process.argv.slice(2);
if (!disk || !outWav) {
    console.error('usage: node tools/browser-capture.js <disk.st> <out.wav> [options]');
    process.exit(1);
}

const opts = { seconds: 20, boot: 9, keys: [], run: null, port: 8123, status: false,
               mash: null, shot: null };
for (let i = 0; i < rest.length; i++) {
    switch (rest[i]) {
        case '--seconds': opts.seconds = parseFloat(rest[++i]); break;
        case '--boot':    opts.boot    = parseFloat(rest[++i]); break;
        case '--port':    opts.port    = parseInt(rest[++i], 10); break;
        case '--key':     opts.keys    = rest[++i].split(',').map(Number); break;
        case '--status':  opts.status  = true; break;
        case '--mash':    opts.mash    = rest[++i].split(',').map(Number); break;
        case '--shot':    opts.shot    = rest[++i]; break;
        case '--run':     opts.run     = rest[++i].split(',').map(Number); break;
        default: console.error('unknown option ' + rest[i]); process.exit(1);
    }
}

// ----------------------------------------------------------------- server ---

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.png': 'image/png', '.mjs': 'text/javascript' };

const server = http.createServer((req, res) => {
    let name = decodeURIComponent(req.url.split('?')[0]);
    if (name == '/') name = '/index.html';

    // The disk under test is served from wherever it lives on disk.
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

// ------------------------------------------------------------- page script ---

function pageScript() {
    return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Catch whatever EstyJs connects to the speakers, so we can tap it.
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
        if (dest && dest.constructor && /Destination/.test(dest.constructor.name)) {
            window.__tap = this;
        }
        return connect.call(this, dest, ...rest);
    };

    const canvas = document.getElementById('EstyJsOutput');
    const PARK = -5000;
    const move = (x, y) => canvas.onmousemove({ pageX: PARK + x, pageY: (PARK + y) * 2 });
    const button = b => ({ button: b, stopPropagation(){}, preventDefault(){} });
    const click = async (hold = 60) => {
        canvas.onmousedown(button(0)); await sleep(hold);
        canvas.onmouseup(button(0));   await sleep(hold);
    };

    estyjs.openFloppyFile('A', '__disk__');
    await sleep(600);
    estyjs.reset();
    await sleep(${opts.boot} * 1000);

    ${opts.run ? `
    canvas.onmousemove({ pageX: PARK, pageY: PARK * 2 }); await sleep(400);
    move(70, 30);  await sleep(500); await click(); await click(); await sleep(3500);
    move(628, 52); await sleep(400); await click(120);            await sleep(2500);
    move(${opts.run[0]}, ${opts.run[1]}); await sleep(400);
    await click(); await click(); await sleep(6000);` : ''}

    for (const code of ${JSON.stringify(opts.keys)}) {
        const ev = { keyCode: code, which: code, preventDefault(){}, stopPropagation(){} };
        document.onkeydown(ev); await sleep(150); document.onkeyup(ev);
        await sleep(7000);
    }

    soundToggle();
    for (let i = 0; i < 60 && !window.__tap; i++) await sleep(200);
    if (!window.__tap) return { error: 'sound never started - nothing reached the speakers' };

    const ctx = window.__tap.context;
    const recorder = \`class Rec extends AudioWorkletProcessor {
        process(inputs) {
            const input = inputs[0][0];
            if (input) this.port.postMessage(new Int16Array(
                Array.from(input, v => Math.max(-1, Math.min(1, v)) * 32767)));
            return true;
        }
    }
    registerProcessor('rec', Rec);\`;
    await ctx.audioWorklet.addModule(
        URL.createObjectURL(new Blob([recorder], { type: 'text/javascript' })));

    const node = new AudioWorkletNode(ctx, 'rec', { numberOfOutputs: 0 });
    const chunks = [];
    node.port.onmessage = e => chunks.push(e.data);
    window.__tap.connect(node);

    ${opts.mash ? `
    const mash = setInterval(() => {
        const ev = { keyCode: ${opts.mash[0]}, which: ${opts.mash[0]},
                     preventDefault(){}, stopPropagation(){} };
        document.onkeydown(ev);
        setTimeout(() => document.onkeyup(ev), ${opts.mash[1]});
    }, ${opts.mash[1] * 2});` : ''}

    const status = [];
    for (let i = 0; i < ${Math.ceil(opts.seconds)}; i++) {
        status.push(estyjs.getSoundStatus ? estyjs.getSoundStatus() : null);
        await sleep(1000);
    }
    ${opts.mash ? 'clearInterval(mash);' : ''}
    node.port.onmessage = null;

    let total = 0;
    for (const c of chunks) total += c.length;
    const all = new Int16Array(total);
    let at = 0;
    for (const c of chunks) { all.set(c, at); at += c.length; }

    const bytes = new Uint8Array(all.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    const shot = ${opts.shot ? 'canvas.toDataURL("image/png").slice(22)' : 'null'};
    return { sampleRate: ctx.sampleRate, status, shot, pcm: btoa(binary) };
})()`;
}

// -------------------------------------------------------------------- CDP ---

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
    await new Promise(r => server.listen(opts.port, r));
    console.log(`serving ${ROOT} on http://localhost:${opts.port}`);

    const chrome = spawn('chromium', [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--mute-audio',
        '--autoplay-policy=no-user-gesture-required',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${path.join(require('os').tmpdir(), 'estyjs-capture')}`,
        'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    chrome.stderr.on('data', () => {});
    chrome.on('error', () => {
        console.error('could not start chromium - is it installed and on PATH?');
        process.exit(1);
    });

    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
        await sleep(200);
        try { targets = await (await fetch(`http://localhost:${DEBUG_PORT}/json/list`)).json(); }
        catch { /* not up yet */ }
    }
    if (!targets) throw new Error('chromium never opened a debugging port');

    const socket = new WebSocket(targets.find(t => t.type == 'page').webSocketDebuggerUrl);
    let nextId = 0;
    const waiting = new Map();
    const send = (method, params = {}) => new Promise(resolve => {
        const id = ++nextId;
        waiting.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
    });

    await new Promise(r => { socket.onopen = r; });
    socket.onmessage = event => {
        const msg = JSON.parse(event.data);
        if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg.result); waiting.delete(msg.id); }
        else if (msg.method == 'Runtime.exceptionThrown') {
            console.error('page error: ' + msg.params.exceptionDetails.text);
        }
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: `http://localhost:${opts.port}/` });

    // The splash screen has to finish before `estyjs` exists.
    console.log('waiting for the splash screen...');
    for (let i = 0; i < 60; i++) {
        await sleep(500);
        const r = await send('Runtime.evaluate',
            { expression: 'typeof estyjs == "object" && estyjs != null', returnByValue: true });
        if (r.result && r.result.value) break;
    }

    console.log(`booting, then recording ${opts.seconds}s...`);
    const reply = await send('Runtime.evaluate', {
        expression: pageScript(), awaitPromise: true, returnByValue: true
    });

    chrome.kill();
    server.close();

    const result = reply.result && reply.result.value;
    if (!result) throw new Error('no result from the page: ' + JSON.stringify(reply).slice(0, 400));
    if (result.error) throw new Error(result.error);
    return result;
}

// ------------------------------------------------------------------- main ---

run().then(result => {
    const pcm = Buffer.from(result.pcm, 'base64');
    const rate = result.sampleRate;

    const wav = Buffer.alloc(44 + pcm.length);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8);
    wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24);
    wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
    pcm.copy(wav, 44);
    fs.writeFileSync(outWav, wav);

    console.log(`\n${outWav}: ${(pcm.length / 2 / rate).toFixed(2)}s mono @${rate}Hz`);

    if (opts.shot && result.shot) {
        fs.writeFileSync(opts.shot, Buffer.from(result.shot, 'base64'));
        console.log(`${opts.shot}: screen at the end of the recording`);
    }

    // Ignore the reports from before playback starts, which read zero by
    // definition, and anything a build without getSoundStatus() returned.
    const status = (result.status || []).filter(s => s && !s.starved);
    if (status.length > 2) {
        const settled = status.slice(2);
        const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
        const lead = settled.map(s => s.lead), rate_ = settled.map(s => s.rate);
        const spread = a => `${mean(a).toFixed(3)} (${Math.min(...a).toFixed(3)}..${Math.max(...a).toFixed(3)})`;
        console.log(`worklet: lead ${spread(lead)} frames, speed ${spread(rate_)}`);
    }
    if (opts.status) {
        (result.status || []).forEach((s, i) => {
            if (s) console.log(`  ${String(i).padStart(3)}s  lead ${s.lead.toFixed(2).padStart(6)}` +
                               `  speed ${s.rate.toFixed(4)}${s.starved ? '  (nothing to play)' : ''}`);
        });
    }
    const starved = (result.status || []).filter(s => s && s.starved).length;
    if (starved > 2) console.log(`worklet ran dry in ${starved} of the status reports`);

    console.log(`\nnow run: node tools/check-audio.mjs ${outWav}`);
    process.exit(0);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
