/*

This file is part of EstyJS.

EstyJS is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 2 of the License, or (at your option) any later
version.

EstyJS is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
EstyJS. If not, see <https://www.gnu.org/licenses/>.

Get in touch: https://github.com/kaiec/EstyJS

Original author (2013-2024): Darren Coles
Current maintainer (since 2024): Kai Eckert
*/

"use strict";

import { AYM_Emulator } from './aym-js/aym-emulator.js';

EstyJs.Sound = function (opts) {
    var self = {};

    var bug = opts.bug;
    var fdc = opts.fdc;

    var MASTER_CLOCK    = 2000000;
    var samplesPerFrame = 882;
    var sampleRate      = 44100;

    // ── Low-pass filter (removes aliasing from square wave transitions) ───────
    var LPF_ALPHA = (2 * Math.PI * 8000) / (2 * Math.PI * 8000 + sampleRate);
    var lpf_state = 0;

    // ── SAB ring constants ────────────────────────────────────────────────────
    // Ctrl layout (Int32, 8 slots = 32 bytes):
    //   [0] write cursor   (main thread advances)
    //   [1] read  cursor   (audio thread advances)
    //   [2] total callbacks
    //   [3] callbacks with underruns
    //   [4] total underrun samples
    var RING_SIZE  = 16384;
    var RING_MASK  = RING_SIZE - 1;
    var SAB_CTRL_BYTES = 32;        // 8 × Int32

    var sab        = null;
    var sabCtrl    = null;
    var sabData    = null;
    var useWorklet = false;

    // ── ScriptProcessor fallback ring ─────────────────────────────────────────
    var spRing = null;
    var spHead = 0;
    var spTail = 0;

    function spPush(s) {
        spRing[spHead & RING_MASK] = s;
        spHead = (spHead + 1) >>> 0;
        if (((spHead - spTail) >>> 0) > RING_SIZE) {
            spTail = (spTail + 1) >>> 0; // drop oldest on overflow
        }
    }
    function spPop() {
        if (spHead === spTail) return 0;
        var s = spRing[spTail & RING_MASK];
        spTail = (spTail + 1) >>> 0;
        return s;
    }

    var audioContext = null;
    var audioNode    = null;
    var audioOutput  = null;
    var audioBuffer  = null;

    var soundEnabled = true;
    var regSelect    = 0;

    var soundDataFrameBytes = 0;
    var frameCount          = 0;
    var rowCount            = 0;
    var processor           = null;
    var lastWritten         = new Date();
    var chip_ticks          = 0;
    var chip                = new AYM_Emulator({ type: 'YM' });

    // ── Diagnostic state ──────────────────────────────────────────────────────
    var diag_samplesGenerated  = 0;
    var diag_intervalId        = null;
    var diag_lastCallbacks     = 0;
    var diag_lastUnderrunCbs   = 0;
    var diag_lastUnderrunSamps = 0;

    function startDiagnostics() {
        // Print a status report every 5 seconds
        diag_intervalId = setInterval(function () {
            if (useWorklet) {
                var totalCbs      = Atomics.load(sabCtrl, 2);
                var underrunCbs   = Atomics.load(sabCtrl, 3);
                var underrunSamps = Atomics.load(sabCtrl, 4);

                var deltaCbs      = totalCbs      - diag_lastCallbacks;
                var deltaUCbs     = underrunCbs   - diag_lastUnderrunCbs;
                var deltaUSamps   = underrunSamps  - diag_lastUnderrunSamps;

                var writeHead = Atomics.load(sabCtrl, 0);
                var readTail  = Atomics.load(sabCtrl, 1);
                var buffered  = (writeHead - readTail + RING_SIZE * 2) % (RING_SIZE * 2);

                var pctUnderrun = deltaCbs > 0
                    ? ((deltaUCbs / deltaCbs) * 100).toFixed(1)
                    : '0.0';

                console.log(
                    '[EstyJS Sound | AudioWorklet] ' +
                    'callbacks/5s: ' + deltaCbs +
                    ' | underrun callbacks: ' + deltaUCbs + ' (' + pctUnderrun + '%)' +
                    ' | underrun samples: ' + deltaUSamps +
                    ' | ring buffered: ' + buffered + '/' + RING_SIZE + ' samples' +
                    ' | samples generated: ' + diag_samplesGenerated
                );

                if (deltaUCbs === 0 && deltaCbs > 0) {
                    console.log('[EstyJS Sound | AudioWorklet] ✓ No underruns — audio thread healthy');
                } else if (deltaUCbs > 0) {
                    console.warn('[EstyJS Sound | AudioWorklet] ✗ Underruns detected — emulator may be running too slow');
                }

                diag_lastCallbacks     = totalCbs;
                diag_lastUnderrunCbs   = underrunCbs;
                diag_lastUnderrunSamps = underrunSamps;
                diag_samplesGenerated  = 0;

            } else if (spRing !== null) {
                var bufferedSP = ((spHead - spTail) >>> 0) & RING_MASK;
                console.log(
                    '[EstyJS Sound | ScriptProcessor fallback] ' +
                    'ring buffered: ' + bufferedSP + '/' + RING_SIZE + ' samples' +
                    ' | samples generated: ' + diag_samplesGenerated
                );
                diag_samplesGenerated = 0;
            }
        }, 5000);
    }

    // ── Chip clocking ─────────────────────────────────────────────────────────

    function renderSample() {
        var raw = (chip.get_channel0() + chip.get_channel1() + chip.get_channel2()) / 3.0;
        lpf_state = LPF_ALPHA * raw + (1.0 - LPF_ALPHA) * lpf_state;
        return lpf_state;
    }

    function generateSample() {
        chip_ticks += MASTER_CLOCK;
        while (chip_ticks >= sampleRate) {
            chip_ticks -= sampleRate;
            chip.clock();
        }
        return renderSample();
    }

    function pushSample(s) {
        if (useWorklet) {
            var head = Atomics.load(sabCtrl, 0);
            sabData[head & RING_MASK] = s;
            Atomics.store(sabCtrl, 0, (head + 1) >>> 0);
        } else if (spRing !== null) {
            spPush(s);
        } else if (audioBuffer !== null) {
            audioBuffer.push(s);
        }
    }

    function handleAySound(size) {
        size = ~~size;
        if (size <= 0) return;
        while (size-- > 0) {
            pushSample(soundEnabled ? generateSample() : 0);
            soundDataFrameBytes++;
            diag_samplesGenerated++;
        }
    }

    // ── ScriptProcessor callback ──────────────────────────────────────────────

    function processAudio(e) {
        var out = e.outputBuffer.getChannelData(0);
        var n   = out.length;
        for (var i = 0; i < n; i++) out[i] = spPop();
    }

    // ── mozAudio legacy ───────────────────────────────────────────────────────

    function resampleBuffer(count) {
        var src = audioBuffer, len = src.length;
        if (len === 0) return;
        var nb = new Array(count);
        for (var i = 0; i < count; i++) nb[i] = src[~~(i / count * len)] || 0;
        audioBuffer = nb;
    }

    function writeSampleData(enabled) {
        soundEnabled = enabled;
        if (audioOutput !== null && audioBuffer !== null) {
            var now  = new Date();
            var need = ~~(sampleRate / (1000 / (now - lastWritten)));
            if (audioBuffer.length < need) resampleBuffer(need);
            lastWritten = now;
            audioOutput.mozWriteAudio(audioBuffer);
            audioBuffer.length = 0;
        }
    }

    // ── Public interface ──────────────────────────────────────────────────────

    self.startFrame = function () {
        rowCount            = 0;
        soundDataFrameBytes = 0;
    };

    self.endFrame = function (enabled) {
        soundEnabled = enabled;
        handleAySound(samplesPerFrame - soundDataFrameBytes);
        soundDataFrameBytes = 0;
        frameCount++;
        if (frameCount < 2) return;
        if (audioOutput !== null) writeSampleData(enabled);
    };

    self.processRow = function () {
        rowCount++;
        var target = Math.round(rowCount * samplesPerFrame / 313);
        handleAySound(target - soundDataFrameBytes);
    };

    self.reset = function () {
        chip_ticks          = 0;
        soundDataFrameBytes = 0;
        frameCount          = 0;
        rowCount            = 0;
        lpf_state           = 0;
        spHead              = 0;
        spTail              = 0;
        if (sabCtrl) {
            Atomics.store(sabCtrl, 0, 0);
            Atomics.store(sabCtrl, 1, 0);
        }
        chip = new AYM_Emulator({ type: 'YM' });
        chip.set_master_clock(MASTER_CLOCK);
    };

    self.selectRegister = function (reg) {
        regSelect = reg & 0x0f;
        chip.set_register_index(regSelect);
    };

    self.readRegister = function () {
        chip.set_register_index(regSelect);
        return chip.get_register_value();
    };

    self.writeRegister = function (val) {
        var cycle  = processor.getRowCycleCount();
        var target = Math.round((rowCount + cycle / 512) * samplesPerFrame / 313);
        handleAySound(target - soundDataFrameBytes);
        if (regSelect === 14) fdc.selectDrive((~val) & 7);
        chip.set_register_index(regSelect);
        chip.set_register_value(val);
    };

    self.setProcessor = function (p) { processor = p; };

    // ── Initialisation ────────────────────────────────────────────────────────

    self.init = function () {
        chip.set_master_clock(MASTER_CLOCK);

        console.log('[EstyJS Sound] Initialising...');
        console.log('[EstyJS Sound] AudioWorklet supported: ' + (typeof AudioWorkletNode !== 'undefined'));
        console.log('[EstyJS Sound] SharedArrayBuffer supported: ' + (typeof SharedArrayBuffer !== 'undefined'));
        if (typeof SharedArrayBuffer === 'undefined') {
            console.warn('[EstyJS Sound] SharedArrayBuffer unavailable — page may be missing COOP/COEP headers:');
            console.warn('  Cross-Origin-Opener-Policy: same-origin');
            console.warn('  Cross-Origin-Embedder-Policy: require-corp');
        }

        var AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.warn('[EstyJS Sound] Web Audio API not available, trying mozAudio');
            audioOutput = new Audio();
            if (typeof audioOutput.mozSetup !== 'undefined') {
                audioBuffer = [];
                audioOutput.mozSetup(1, sampleRate);
                console.log('[EstyJS Sound] mozAudio initialised');
            } else {
                audioOutput = null;
                console.error('[EstyJS Sound] No audio backend available');
            }
            return;
        }

        audioContext = new AudioContext();
        console.log('[EstyJS Sound] AudioContext created, state: ' + audioContext.state +
                    ', sampleRate: ' + audioContext.sampleRate + ' Hz');

        if (audioContext.sampleRate !== sampleRate) {
            console.warn('[EstyJS Sound] Context sampleRate (' + audioContext.sampleRate +
                         ') differs from target (' + sampleRate + ') — audio may be resampled by browser');
        }

        if (typeof AudioWorkletNode !== 'undefined' &&
            typeof SharedArrayBuffer !== 'undefined') {

            sab     = new SharedArrayBuffer(SAB_CTRL_BYTES + RING_SIZE * 4);
            sabCtrl = new Int32Array(sab, 0, 8);
            sabData = new Float32Array(sab, SAB_CTRL_BYTES, RING_SIZE);

            console.log('[EstyJS Sound] Attempting AudioWorklet load (sound-processor.js)...');

            audioContext.audioWorklet
                .addModule('estyjs/sound-processor.js')
                .then(function () {
                    console.log('[EstyJS Sound] ✓ AudioWorklet module loaded successfully');

                    var node = new AudioWorkletNode(audioContext, 'esty-sound-processor', {
                        processorOptions: { sab: sab },
                        outputChannelCount: [1]
                    });
                    node.connect(audioContext.destination);
                    audioNode  = node;
                    useWorklet = true;

                    console.log('[EstyJS Sound] ✓ AudioWorklet node connected');
                    console.log('[EstyJS Sound] ✓ Ring buffer: ' + RING_SIZE +
                                ' samples (' + (RING_SIZE / sampleRate * 1000).toFixed(0) + ' ms)');
                    console.log('[EstyJS Sound] Diagnostics will print every 5 seconds...');
                    startDiagnostics();
                })
                .catch(function (err) {
                    console.error('[EstyJS Sound] ✗ AudioWorklet failed: ' + err);
                    console.warn('[EstyJS Sound] Falling back to ScriptProcessor');
                    initScriptProcessor();
                });

        } else {
            console.warn('[EstyJS Sound] AudioWorklet or SharedArrayBuffer not available, using ScriptProcessor fallback');
            initScriptProcessor();
        }
    };

    function initScriptProcessor() {
        spRing = new Float32Array(RING_SIZE);
        spHead = 0;
        spTail = 0;

        var bufSize = 4096;
        if (audioContext.createScriptProcessor) {
            audioNode = audioContext.createScriptProcessor(bufSize, 1, 1);
        } else if (audioContext.createJavaScriptNode) {
            audioNode = audioContext.createJavaScriptNode(bufSize, 1, 1);
        }

        if (audioNode) {
            audioNode.onaudioprocess = processAudio;
            audioNode.connect(audioContext.destination);
            console.log('[EstyJS Sound] ScriptProcessor initialised (bufSize=' + bufSize + ')');
            console.warn('[EstyJS Sound] ScriptProcessor runs on main thread — ' +
                         'audio quality depends on emulator CPU load');
            startDiagnostics();
        } else {
            console.error('[EstyJS Sound] Failed to create ScriptProcessor node');
        }
    }

    return self;
};