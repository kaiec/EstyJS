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

// YM2149 (PSG) sound for EstyJs.
//
// This half runs on the main thread and does no synthesis at all. It only
// records what the emulated program writes to the sound chip, tagging every
// write with the exact ST clock cycle it happened on, and ships one frame's
// worth of writes to the AudioWorklet in sound-processor.js.
//
// Keeping synthesis out of the main thread is the whole point. The emulator
// frame loop is driven by setTimeout, so it runs at roughly - but never
// exactly - 50 Hz, while the sound card consumes samples at a rock steady
// rate of its own. Any design that generates a fixed number of samples per
// emulated frame has to reconcile those two clocks, and reconciling them by
// stretching or dropping audio is what made earlier versions sound jittery.
// Here the audio thread owns the clock: it plays the recorded writes at its
// own pace and gently adjusts that pace to track the emulator. See
// sound-processor.js for the playback side.

"use strict";

EstyJs.Sound = function (opts) {
    var self = {};

    var bug = opts.bug;
    var fdc = opts.fdc;

    // An ST video frame is 313 scanlines of 512 CPU cycles.
    var CYCLES_PER_ROW = 512;
    var ROWS_PER_FRAME = 313;
    var CYCLES_PER_FRAME = CYCLES_PER_ROW * ROWS_PER_FRAME;

    // Loaded relative to the page, like the ROM images in memory.js.
    var PROCESSOR_URL = 'estyjs/sound-processor.js';

    // Writes are handed over as flat triples of (cycle within frame, register,
    // value) so that a frame costs one small array instead of a bag of objects.
    var WRITE_FIELDS = 3;
    var MAX_WRITES_PER_FRAME = 1024;

    var processor = null;

    var audioContext = null;
    var workletNode = null;
    var gainNode = null;
    var starting = false;

    // Register file as the emulated machine sees it. The chip itself lives in
    // the worklet, so reads are answered from this mirror.
    var regIndex = 0;
    var regs = new Uint8Array(16);

    // Last report from the worklet: how many frames of sound are buffered
    // ahead of playback, and the speed correction being applied to hold it
    // there. Useful when sound misbehaves - see getStatus().
    var status = { lead: 0, rate: 1, starved: false };

    // Position within the current frame, and the frame number since power-on.
    // Together they give each write an unambiguous place on the ST's timeline.
    var rowCount = 0;
    var frameCount = 0;

    var writes = new Int32Array(MAX_WRITES_PER_FRAME * WRITE_FIELDS);
    var writeCount = 0;

    // Cycle within the current frame at which the CPU is executing right now.
    function currentCycle() {
        var cycle = rowCount * CYCLES_PER_ROW;
        if (processor != null) cycle += processor.getRowCycleCount();
        return cycle < CYCLES_PER_FRAME ? cycle : CYCLES_PER_FRAME - 1;
    }

    function recordWrite(reg, val) {
        if (writeCount >= MAX_WRITES_PER_FRAME) return;
        var i = writeCount * WRITE_FIELDS;
        writes[i] = currentCycle();
        writes[i + 1] = reg;
        writes[i + 2] = val;
        writeCount++;
    }

    self.selectRegister = function (reg) {
        regIndex = reg & 0xff;
    };

    self.readRegister = function () {
        return regIndex < 16 ? regs[regIndex] : 0xff;
    };

    self.writeRegister = function (val) {
        val &= 0xff;

        if (regIndex > 15) return;

        // Port A doubles as the floppy drive select on the ST, so this has to
        // happen whether or not anybody is listening to the sound.
        if (regIndex == 14) fdc.selectDrive((~val) & 7);

        regs[regIndex] = val;
        recordWrite(regIndex, val);
    };

    self.startFrame = function () {
        rowCount = 0;
        writeCount = 0;
    };

    self.processRow = function () {
        rowCount++;
    };

    self.endFrame = function (enabled) {
        if (workletNode == null) {
            writeCount = 0;
            frameCount++;
            return;
        }

        if (gainNode != null) {
            // Ramp rather than jump, so muting does not click.
            gainNode.gain.setTargetAtTime(enabled ? 1 : 0, audioContext.currentTime, 0.01);
        }

        // Transfer just the part of the buffer we filled.
        var frameWrites = writes.slice(0, writeCount * WRITE_FIELDS);
        workletNode.port.postMessage({
            type: 'frame',
            frame: frameCount,
            writes: frameWrites
        }, [frameWrites.buffer]);

        writeCount = 0;
        frameCount++;
    };

    self.reset = function () {
        regIndex = 0;
        regs.fill(0);
        rowCount = 0;
        writeCount = 0;
        frameCount = 0;
        if (workletNode != null) workletNode.port.postMessage({ type: 'reset' });
    };

    self.setProcessor = function (p) {
        processor = p;
    };

    self.getStatus = function () {
        return status;
    };

    self.init = function () {
        if (audioContext != null || starting) return;

        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass || typeof AudioWorkletNode == 'undefined') {
            bug.say('sound: no AudioWorklet support, sound disabled');
            return;
        }

        starting = true;
        audioContext = new AudioContextClass();

        audioContext.audioWorklet.addModule(PROCESSOR_URL).then(function () {
            var node = new AudioWorkletNode(audioContext, 'esty-sound-processor', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [1],
                processorOptions: {
                    cyclesPerFrame: CYCLES_PER_FRAME
                }
            });

            gainNode = audioContext.createGain();
            gainNode.gain.value = 1;

            node.connect(gainNode);
            gainNode.connect(audioContext.destination);

            node.port.onmessage = function (event) {
                if (event.data.type == 'status') status = event.data;
            };

            workletNode = node;
            workletNode.port.postMessage({ type: 'reset' });

            // A context created before the user has interacted starts suspended.
            if (audioContext.state == 'suspended') audioContext.resume();

            bug.say('sound: worklet running at ' + audioContext.sampleRate + 'Hz');
            starting = false;
        }).catch(function (err) {
            bug.say('sound: could not start worklet - ' + err);
            starting = false;
        });
    };

    return self;
};
