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

    // The Atari ST clocks the YM2149 at 2 MHz.
    // chip.clock() divides internally by 8, giving an effective chip rate of 250 kHz.
    var MASTER_CLOCK = 2000000;

    // 44100 Hz output, locked to 50 Hz frame rate
    var samplesPerFrame = 882;               // 44100 / 50
    var sampleRate      = samplesPerFrame * 50;  // 44100

    var audioContext = null;
    var audioNode    = null;
    var audioOutput  = null;  // legacy mozAudio fallback
    var audioBuffer  = null;  // ring of Float32 samples waiting to be consumed

    var soundEnabled = true;

    var regSelect = 0;

    var soundDataFrameBytes = 0;
    var frameCount          = 0;
    var rowCount            = 0;

    var processor = null;

    var lastWritten = new Date();

    // Integer Bresenham-style clock accumulator — avoids floating-point drift.
    var chip_ticks = 0;

    var chip = new AYM_Emulator({ type: 'YM' });

    // -------------------------------------------------------------------------
    // Chip clocking / sample generation
    // -------------------------------------------------------------------------

    function renderSample() {
        var a = chip.get_channel0();
        var b = chip.get_channel1();
        var c = chip.get_channel2();
        return (a + b + c) / 3.0;
    }

    function generateSample() {
        chip_ticks += MASTER_CLOCK;
        while (chip_ticks >= sampleRate) {
            chip_ticks -= sampleRate;
            chip.clock();
        }
        return renderSample();
    }

    function handleAySound(size) {
        if (audioBuffer === null) return;
        size = ~~size;
        if (size <= 0) return;
        while (size-- > 0) {
            audioBuffer.push(generateSample());
            soundDataFrameBytes++;
        }
    }

    // -------------------------------------------------------------------------
    // Web Audio output
    //
    // The ScriptProcessor callback asks for exactly `n` samples at a time
    // (n = the buffer size set in createScriptProcessor, here 4096).
    // We simply drain that many samples from the front of audioBuffer,
    // padding with silence if we're momentarily behind.  We never resample —
    // that was the root cause of the dropout pattern observed in the broken
    // recording (resampleBuffer was stretching a partial frame to fill 16 384
    // samples and then discarding everything, creating 60-scanline-long
    // silence/audio alternations at ~260 Hz).
    // -------------------------------------------------------------------------

    function processAudio(e) {
        var outputArray = e.outputBuffer.getChannelData(0);
        var n = outputArray.length;
        bug.say("audio fillBuffer");

        if (!soundEnabled) {
            for (var i = 0; i < n; i++) outputArray[i] = 0;
            return;
        }

        for (var i = 0; i < n; i++) {
            // If we have buffered samples, consume them; otherwise output silence.
            outputArray[i] = (audioBuffer.length > 0) ? audioBuffer.shift() : 0;
        }
    }

    // -------------------------------------------------------------------------
    // mozAudio legacy output (unchanged — only used on old Firefox)
    // -------------------------------------------------------------------------

    function resampleBuffer(count) {
        var src = audioBuffer;
        var len = src.length;
        if (len === 0) return;
        var newBuffer = new Array(count);
        for (var i = 0; i < count; i++) {
            newBuffer[i] = src[~~(i / count * len)] || 0;
        }
        audioBuffer = newBuffer;
    }

    function writeSampleData(soundIsEnabled) {
        soundEnabled = soundIsEnabled;
        if (audioBuffer === null) return;

        if (!soundEnabled) {
            audioBuffer.length = 0;
            lastWritten = new Date();
            return;
        }

        if (audioOutput !== null) {
            var currTime = new Date();
            var samplesNeeded = ~~(sampleRate / (1000 / (currTime - lastWritten)));
            if (audioBuffer.length < samplesNeeded) resampleBuffer(samplesNeeded);
            lastWritten = currTime;
            audioOutput.mozWriteAudio(audioBuffer);
            audioBuffer.length = 0;
        }
    }

    // -------------------------------------------------------------------------
    // Public interface
    // -------------------------------------------------------------------------

    self.startFrame = function () {
        rowCount            = 0;
        soundDataFrameBytes = 0;
        // NOTE: frameCount is incremented only in endFrame.
    };

    self.endFrame = function (enabled) {
        // Fill any remaining samples to complete this 50 Hz frame.
        handleAySound(samplesPerFrame - soundDataFrameBytes);
        soundDataFrameBytes = 0;
        frameCount++;
        if (frameCount < 2) return;
        writeSampleData(enabled);
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

        if (regSelect === 14) {
            fdc.selectDrive((~val) & 7);
        }

        chip.set_register_index(regSelect);
        chip.set_register_value(val);
    };

    self.setProcessor = function (p) {
        processor = p;
    };

    self.init = function () {
        chip.set_master_clock(MASTER_CLOCK);

        var AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            audioBuffer  = [];
            audioContext = new AudioContext();

            // Use a smaller buffer (4096) so latency stays reasonable.
            // The original 16384 meant the callback fired every ~371 ms —
            // far too infrequently relative to the 20 ms frame budget, which
            // exacerbated the buffer-starvation problem.
            var bufSize = 4096;

            if (audioContext.createJavaScriptNode != null) {
                audioNode = audioContext.createJavaScriptNode(bufSize, 1, 1);
            } else if (audioContext.createScriptProcessor != null) {
                audioNode = audioContext.createScriptProcessor(bufSize, 1, 1);
            } else {
                audioNode = null;
            }

            if (audioNode !== null) {
                audioNode.onaudioprocess = processAudio;
                audioNode.connect(audioContext.destination);
            }
        } else if (typeof Audio !== 'undefined') {
            audioOutput = new Audio();
            if (typeof audioOutput.mozSetup !== 'undefined') {
                audioBuffer = [];
                audioOutput.mozSetup(1, sampleRate);
            } else {
                audioOutput = null;
            }
        }
    };

    return self;
};