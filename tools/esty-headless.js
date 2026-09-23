/*
 * esty-headless.js - run EstyJS outside a browser.
 *
 * Boots the emulator under Node with the handful of browser objects it touches
 * replaced by stubs, then lets a script drive it frame by frame: move the
 * mouse, click, grab the screen, and record every PSG register write with the
 * exact ST clock cycle it happened on.
 *
 * Frames are pumped by hand rather than by the clock, so a run is deterministic
 * and goes as fast as the CPU allows (~13x real time).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CYCLES_PER_ROW   = 512;
const ROWS_PER_FRAME   = 313;
const CYCLES_PER_FRAME = CYCLES_PER_ROW * ROWS_PER_FRAME;   // 160256

function createMachine(estyDir, opts = {}) {
    const machine = {};

    // ---------------------------------------------------------------- DOM ---
    // keyboard.js keeps a reference to the canvas and hangs its mouse handlers
    // on it, so the same object has to come back every time.
    const canvas = {
        width: 640, height: 400,
        offsetLeft: 0, offsetTop: 0, offsetWidth: 640, offsetHeight: 400,
        clientWidth: 640, clientHeight: 400,
        getContext: () => ({
            createImageData: (w, h) => ({ width: w, height: h,
                                          data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: (img) => { machine.screen = img; },
            drawImage() {}, fillRect() {}, fillText() {},
            fillStyle: '', font: '', globalAlpha: 1
        }),
        addEventListener() {}, removeEventListener() {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 400 })
    };

    const doc = {
        getElementById: () => canvas,
        createElement: () => canvas,
        addEventListener() {}, removeEventListener() {},
        body: { addEventListener() {} }
    };

    // Frames the emulator has scheduled but we have not run yet.
    const scheduled = [];
    let virtualMs = 0;

    const sandbox = {
        console: opts.quiet ? { log() {}, warn() {}, error() {} } : console,
        document: doc,
        navigator: { userAgent: 'node', getGamepads: () => [] },
        performance: { now: () => virtualMs },
        setTimeout: (fn) => { scheduled.push(fn); return scheduled.length; },
        clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        requestAnimationFrame: () => 0,
        XMLHttpRequest: function () {
            this.open = (m, url) => { this._url = url; };
            this.send = () => {
                const buf = machine.files[this._url] ||
                            fs.readFileSync(path.join(estyDir, '..', this._url));
                this.response = new Uint8Array(buf).buffer;
                if (this.onload) this.onload({});
            };
        },
        Uint8Array, Uint8ClampedArray, Uint32Array, Int32Array, Float32Array,
        DataView, ArrayBuffer, Math, Date, JSON, Object, Array, String, Number
    };
    sandbox.window = { console: sandbox.console, performance: sandbox.performance };
    sandbox.window.window = sandbox.window;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);

    machine.files = {};          // virtual URL -> Buffer  (disk images, ROM)
    machine.screen = null;

    // ------------------------------------------------------------- source ---
    // Everything except sound.js, which is replaced by the recorder below:
    // there is no audio hardware here, and the recording is the point.
    const SOURCES = ['estyjs.js', 'processor.js', 'keyboard.js', 'mfp.js',
                     'fdc.js', 'io.js', 'bug.js', 'display.js', 'memory.js',
                     'snapshot.js', 'files.js', 'js-unzip.js', 'rawinflate.js'];
    for (const f of SOURCES) {
        const src = fs.readFileSync(path.join(estyDir, f), 'utf8').replace(/^﻿/, '');
        vm.runInContext(src, sandbox, { filename: f });
    }

    // ------------------------------------------------------- PSG recorder ---
    // Stands in for EstyJs.Sound. Records writes against a monotonic ST cycle
    // count so the log can later be replayed through any chip emulation at any
    // sample rate.
    const writes = [];
    let frame = 0, row = 0, cpu = null, regIndex = 0;
    const regs = new Uint8Array(16);

    vm.runInContext('var __recorder;', sandbox);
    sandbox.__recorder = function (o) {
        const fdc = o.fdc;
        return {
            startFrame() { row = 0; },
            processRow()  { row++; },
            endFrame()    { frame++; },
            reset() { regIndex = 0; regs.fill(0); },
            setProcessor(p) { cpu = p; },
            init() {},
            selectRegister(v) { regIndex = v & 0xff; },
            readRegister() { return regIndex < 16 ? regs[regIndex] : 0xff; },
            writeRegister(v) {
                v &= 0xff;
                if (regIndex === 14) fdc.selectDrive((~v) & 7);
                if (regIndex > 15) return;
                regs[regIndex] = v;
                writes.push({
                    cycle: frame * CYCLES_PER_FRAME + row * CYCLES_PER_ROW +
                           (cpu ? cpu.getRowCycleCount() : 0),
                    reg: regIndex, val: v
                });
            }
        };
    };
    vm.runInContext('EstyJs.Sound = __recorder;', sandbox);

    // ------------------------------------------------------------- driving ---
    vm.runInContext('var esty = EstyJs("screen"); esty.soundToggle();', sandbox);
    machine.setJoystick = function (on) {
        vm.runInContext('esty.setJoystick(' + (on ? 'true' : 'false') + ');', sandbox);
        return machine;
    };

    machine.writes = writes;
    machine.frameCount = () => frame;

    machine.run = function (frames) {
        const target = frame + frames;
        let guard = 0;
        while (frame < target && guard++ < frames * 4 + 100) {
            const fn = scheduled.shift();
            if (!fn) break;
            virtualMs += 20;
            fn();
        }
        return machine;
    };

    // drive is 'A' or 'B' - EstyJS matches it as a string.
    machine.insertDisk = function (drive, file) {
        const url = '__disk' + drive + '__';
        machine.files[url] = fs.readFileSync(file);
        vm.runInContext(`esty.openFloppyFile("${drive}", "${url}");`, sandbox);
        return machine;
    };

    machine.reset = function () { vm.runInContext('esty.reset();', sandbox); return machine; };

    // --- mouse -------------------------------------------------------------
    // EstyJS sends *relative* movement to the ST, derived from the difference
    // between successive mousemove positions. So we park the pointer in the
    // top-left corner first, then every later move is measured from there.
    let pageX = 0, pageY = 0;
    const PARK = -5000;

    function moveTo(x, y) {
        pageX = x; pageY = y * 2;    // medium res: the driver halves mouseY
        canvas.onmousemove({ pageX, pageY });
    }

    machine.parkMouse = function () {
        moveTo(PARK, PARK);
        machine.run(4);
        return machine;
    };

    machine.mouseTo = function (x, y) {
        moveTo(PARK + x, PARK + y);
        machine.run(4);
        return machine;
    };

    const ev = (button) => ({ button, stopPropagation() {}, preventDefault() {} });

    machine.click = function (times = 1, hold = 5, gap = 5) {
        for (let i = 0; i < times; i++) {
            canvas.onmousedown(ev(0)); machine.run(hold);
            canvas.onmouseup(ev(0));   machine.run(gap);
        }
        return machine;
    };

    // GEM's double-click window is a few frames wide, so press twice quickly.
    machine.doubleClick = function () { return machine.click(2, 3, 3); };

    // --- keyboard ----------------------------------------------------------
    // Joystick 1 is the cursor keys plus control: 37/38/39/40 and 17.
    const keyEvent = (keyCode) => ({ keyCode, which: keyCode, metaKey: false,
                                     stopPropagation() {}, preventDefault() {} });

    machine.keyDown = function (keyCode) {
        sandbox.document.onkeydown(keyEvent(keyCode));
        return machine;
    };

    machine.keyUp = function (keyCode) {
        sandbox.document.onkeyup(keyEvent(keyCode));
        return machine;
    };

    machine.key = function (keyCode, frames = 4) {
        machine.keyDown(keyCode); machine.run(frames);
        machine.keyUp(keyCode);   machine.run(frames);
        return machine;
    };

    // --- output ------------------------------------------------------------
    machine.saveScreen = function (file) {
        if (!machine.screen) throw new Error('no frame rendered yet');
        fs.writeFileSync(file, Buffer.from(machine.screen.data.buffer));
        return machine;
    };

    machine.saveWrites = function (file) {
        fs.writeFileSync(file, JSON.stringify({
            cyclesPerFrame: CYCLES_PER_FRAME, frames: frame, writes
        }));
        return machine;
    };

    return machine;
}

module.exports = { createMachine, CYCLES_PER_FRAME, CYCLES_PER_ROW, ROWS_PER_FRAME };
