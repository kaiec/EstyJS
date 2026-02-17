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

// NOTE: This file must be loaded as an ES module:
//   <script type="module" src="sound.js"></script>
// A plain <script src="sound.js"> will throw a SyntaxError on the import
// statement above and EstyJs.Sound will never be defined.

EstyJs.Sound = function (opts) {
    var self = {};

    var bug = opts.bug;
    var fdc = opts.fdc;

    // The Atari ST clocks the YM2149 at 2 MHz.
    // AYM_Emulator.clock() accepts one master-clock tick and divides
    // internally by 8, so we drive it at the full 2 MHz master rate.
    var MASTER_CLOCK = 512 * 313 * 50 / 2; // ~2,003,200 Hz, matches original

    // 44100 Hz output, locked to 50 Hz frame rate
    var samplesPerFrame = 882;                    // 44100 / 50
    var sampleRate      = samplesPerFrame * 50;   // 44100

    var audioContext = null;
    var audioNode    = null;
    var audioOutput  = null;  // legacy mozAudio fallback
    var audioBuffer  = null;

    var soundEnabled = true;

    // Currently latched PSG register number (set by selectRegister)
    var regSelect = 0;

    var soundDataFrameBytes = 0;
    var frameCount          = 0;
    var rowCount            = 0;

    var processor = null;

    var lastWritten = new Date();

    // Sub-sample clocking accumulator — avoids floating-point drift.
    // We need MASTER_CLOCK / sampleRate chip.clock() calls per output sample.
    var chip_ticks = 0;

    // YM2149 emulator in YM DAC mode (correct for Atari ST)
    var chip = new AYM_Emulator({ type: 'YM' });

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    // Mix the three chip channels into a mono sample in [-1, +1].
    // Each channel is already scaled by the DAC table; dividing by 3
    // prevents clipping when all three are at full volume simultaneously.
    function renderSample() {
        var a = chip.get_channel0();
        var b = chip.get_channel1();
        var c = chip.get_channel2();
        return (a + b + c) / 3.0;
    }

    // Advance the chip by the correct number of master-clock ticks for one
    // output sample period, then snapshot the resulting output.
    function generateSample() {
        chip_ticks += MASTER_CLOCK;
        while (chip_ticks >= sampleRate) {
            chip_ticks -= sampleRate;
            chip.clock();
        }
        return renderSample();
    }

    // Generate `size` samples and append to audioBuffer.
    function handleAySound(size) {
        if (audioBuffer === null) return;
        size = ~~size;
        while (size-- > 0) {
            audioBuffer.push(generateSample());
            soundDataFrameBytes++;
        }
    }

    // -------------------------------------------------------------------------
    // Web Audio / mozAudio output path
    // -------------------------------------------------------------------------

    function processAudio(e) {
        fillBuffer(e.outputBuffer.getChannelData(0));
    }

    function fillBuffer(outputArray) {
        try {
            bug.say("audio fillBuffer");
            var n = outputArray.length;
            if (!soundEnabled) {
                for (var i = 0; i < n; i++) outputArray[i] = 0;
                audioBuffer.length = 0;
                return;
            }
            resampleBuffer(n);
            for (var i = 0; i < n; i++) {
                outputArray[i] = audioBuffer[i] || 0;
            }
            audioBuffer.splice(0, n);
        } catch (e) {
            bug.say("audio fillBuffer error " + e.message);
        }
    }

    function resampleBuffer(count) {
        var src = audioBuffer;
        var len = src.length;
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
    // Public interface — identical signatures to original EstyJs.Sound
    // -------------------------------------------------------------------------

    self.startFrame = function () {
        rowCount            = 0;
        soundDataFrameBytes = 0;
        frameCount++;
    };

    self.endFrame = function (enabled) {
        handleAySound(sampleRate / 50 - soundDataFrameBytes);
        soundDataFrameBytes = 0;
        if (frameCount++ < 2) return;
        writeSampleData(enabled);
    };

    self.processRow = function () {
        rowCount++;
        handleAySound(Math.round(rowCount * sampleRate / 50 / 313) - soundDataFrameBytes);
    };

    self.reset = function () {
        chip_ticks = 0;
        chip = new AYM_Emulator({ type: 'YM' });
        chip.set_master_clock(MASTER_CLOCK);
    };

    self.selectRegister = function (reg) {
        regSelect = reg;
        // Pre-select in chip so readRegister() can be called without
        // needing to set the index again.
        chip.set_register_index(reg);
    };

    self.readRegister = function () {
        chip.set_register_index(regSelect);
        return chip.get_register_value();
    };

    self.writeRegister = function (val) {
        // Cycle-accurate: generate samples up to the current CPU cycle
        // position within the scanline before committing the register write.
        var cycle      = processor.getRowCycleCount();
        var sound_size = Math.round(
            (rowCount * 512 + cycle) * sampleRate / 50 / 313 / 512
        ) - soundDataFrameBytes;
        handleAySound(sound_size);

        // IO Port A (register 14) drives the floppy drive-select lines.
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

            if (audioContext.createJavaScriptNode != null) {
                audioNode = audioContext.createJavaScriptNode(16384, 1, 1);
            } else if (audioContext.createScriptProcessor != null) {
                audioNode = audioContext.createScriptProcessor(16384, 1, 1);
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
