/*
 * check-keymap.js - check the keyboard mapping.
 *
 * Drives the keyboard without the rest of the machine: a key event goes in, the
 * bytes the ACIA hands the ST come out.
 *
 * usage:
 *   node tools/check-keymap.js [--list]
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// From the ST scancode table, not from the emulator, so this is a check and
// not an echo.
const EXPECTED = {
    Escape: 0x01, Digit1: 0x02, Digit0: 0x0B, Minus: 0x0C, Equal: 0x0D,
    Backspace: 0x0E, Tab: 0x0F, KeyQ: 0x10, KeyY: 0x15, KeyP: 0x19,
    BracketLeft: 0x1A, BracketRight: 0x1B, Enter: 0x1C,
    ControlLeft: 0x1D, ControlRight: 0x1D,
    KeyA: 0x1E, KeyL: 0x26, Semicolon: 0x27, Quote: 0x28, Backquote: 0x29,
    ShiftLeft: 0x2A, Backslash: 0x2B, KeyZ: 0x2C, KeyM: 0x32,
    Comma: 0x33, Period: 0x34, Slash: 0x35, ShiftRight: 0x36,
    AltLeft: 0x38, AltRight: 0x38, Space: 0x39, CapsLock: 0x3A,
    F1: 0x3B, F10: 0x44, Home: 0x47, ArrowUp: 0x48, NumpadSubtract: 0x4A,
    ArrowLeft: 0x4B, ArrowRight: 0x4D, NumpadAdd: 0x4E, ArrowDown: 0x50,
    Insert: 0x52, Delete: 0x53, IntlBackslash: 0x60, PageUp: 0x61, PageDown: 0x62,
    NumLock: 0x63, ScrollLock: 0x64, NumpadDivide: 0x65, NumpadMultiply: 0x66,
    Numpad7: 0x67, Numpad0: 0x70, NumpadDecimal: 0x71, NumpadEnter: 0x72
};

// ST scancodes that no key on the ST keyboard produces
const UNUSED = [0x37, 0x45, 0x46, 0x49, 0x4C, 0x4F, 0x51, 0x54,
                0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x5B, 0x5C, 0x5D, 0x5E, 0x5F];

function makeKeyboard() {
    const element = {
        width: 640, height: 400, offsetLeft: 0, offsetTop: 0,
        offsetWidth: 640, offsetHeight: 400,
        addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 })
    };
    const doc = { getElementById: () => element, addEventListener() {} };
    const sandbox = {
        console, document: doc, navigator: { getGamepads: () => [] },
        setTimeout: () => 0, Math, Date, Array, Object, String, Number
    };
    vm.createContext(sandbox);
    vm.runInContext('function EstyJs(){}', sandbox);
    const src = fs.readFileSync(path.join(__dirname, '..', 'estyjs', 'keyboard.js'), 'utf8');
    vm.runInContext(src.replace(/^﻿/, ''), sandbox, { filename: 'keyboard.js' });

    sandbox.__mfp = { setAciaGpio() {}, clearAciaGpio() {}, interruptRequest() {} };
    vm.runInContext("var kb = EstyJs.Keyboard({ control: 'screen', mfp: __mfp });", sandbox);
    return { sandbox, doc };
}

const { sandbox, doc } = makeKeyboard();
const kb = sandbox.kb;
kb.KeypadJoystick = false;      // so the cursor keys and control are keys here

const event = (code, repeat) => ({ code, repeat: !!repeat, metaKey: false,
                                   stopPropagation() {}, preventDefault() {} });

// Every byte the ST would read from the ACIA since the last call.
function drain() {
    const out = [];
    for (let i = 0; i < 40; i++) {
        kb.processRow();
        if (kb.readControl() & 1) out.push(kb.readData());
    }
    return out;
}

function press(code) { doc.onkeydown(event(code)); return drain(); }
function release(code) { doc.onkeyup(event(code)); return drain(); }

let failed = 0;
const fail = (msg) => { console.log('FAIL ' + msg); failed++; };

drain();   // the power-on self test byte

// 1. the keys that matter, by name
for (const [code, want] of Object.entries(EXPECTED)) {
    const made = press(code), broke = release(code);
    if (made.length !== 1 || made[0] !== want) {
        fail(code + ': expected make 0x' + want.toString(16) + ', got [' +
             made.map(b => '0x' + b.toString(16)).join(' ') + ']');
    } else if (broke.length !== 1 || broke[0] !== (want | 0x80)) {
        fail(code + ': expected break 0x' + (want | 0x80).toString(16) + ', got [' +
             broke.map(b => '0x' + b.toString(16)).join(' ') + ']');
    }
}
console.log('ok   ' + Object.keys(EXPECTED).length + ' keys send the scancode the ST expects');

// 2. every ST key is reachable from some physical key
const table = {};
for (const code of Object.keys(sandbox.kb && {})) {}   // table is private; probe it instead
const PROBE = fs.readFileSync(path.join(__dirname, '..', 'estyjs', 'keyboard.js'), 'utf8');
const declared = [...PROBE.matchAll(/^\s*'([A-Za-z0-9]+)':\s*(0x[0-9A-F]{2}),/gm)]
    .map(m => ({ code: m[1], sc: parseInt(m[2], 16) }));
const reached = new Set();
for (const d of declared) {
    const made = press(d.code); release(d.code);
    if (made.length !== 1 || made[0] !== d.sc) {
        fail(d.code + ': table says 0x' + d.sc.toString(16) + ', keyboard sent [' +
             made.map(b => '0x' + b.toString(16)).join(' ') + ']');
    }
    reached.add(d.sc);
}
const missing = [];
for (let sc = 0x01; sc <= 0x72; sc++) if (!UNUSED.includes(sc) && !reached.has(sc)) missing.push(sc);
if (missing.length) fail('ST keys no physical key reaches: ' +
                         missing.map(c => '0x' + c.toString(16)).join(' '));
else console.log('ok   all ' + reached.size + ' ST keys are reachable, from ' + declared.length + ' physical keys');

// 3. a key the ST does not have is ignored rather than sending something
if (press('MetaLeft').length !== 0) fail('MetaLeft should send nothing');
else console.log('ok   keys the ST does not have send nothing');

// 4. browser auto-repeat is not the ST repeating
press('KeyA');
const repeated = (doc.onkeydown(event('KeyA', true)), drain());
release('KeyA');
if (repeated.length !== 0) fail('auto-repeat should not send another make code');
else console.log('ok   held keys do not stream make codes');

// 5. with the joystick switch on, the cursor keys and control are not keys
// (control reports as a mouse button rather than fire while the ST is reading
// the mouse on port 0, so the check is only that no scancode is sent)
kb.KeypadJoystick = true;
for (const [code, sc] of [['ArrowUp', 0x48], ['ArrowDown', 0x50], ['ArrowLeft', 0x4B],
                          ['ArrowRight', 0x4D], ['ControlLeft', 0x1D]]) {
    const made = press(code); release(code);
    if (made.includes(sc)) fail(code + ' should be joystick 1 while the switch is on, not a key');
}
console.log('ok   the joystick switch still takes the cursor keys and control');

if (process.argv.includes('--list')) {
    console.log('\nphysical key        ST key');
    const labels = [...PROBE.matchAll(/^\s*'([A-Za-z0-9]+)':\s*0x[0-9A-F]{2},\s*\/\/ (.*)$/gm)];
    for (const m of labels) console.log('  ' + m[1].padEnd(18) + m[2].trim());
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
