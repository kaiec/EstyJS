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

Current maintainer (since 2024): Kai Eckert
*/

// The playback half of EstyJs sound, running on the browser's audio thread.
//
// sound.js sends one message per emulated frame containing every write the
// program made to the YM2149, each tagged with the ST clock cycle it happened
// on. This processor replays them: it walks its own position along the ST
// timeline, applies each write as that position passes it, and clocks the chip
// emulation once per output sample.
//
// Because the audio thread decides how far to advance per sample, it - not the
// emulator - sets the pace, and there is never a moment where audio has to be
// stretched or discarded to fill a buffer.
//
// The two clocks still have to meet somewhere. The emulator's frame loop is a
// setTimeout, so it delivers frames a little faster or slower than real time
// and the amount of unplayed timeline ("lead") drifts. Instead of correcting
// that with cuts or silence, playback speed is nudged by a fraction of a
// percent to hold the lead steady. A constant offset of that size is inaudible;
// what would be audible - dropouts, and the warble of a buffer being resampled
// every callback - never happens.

import { AYM_Emulator } from './aym-js/aym-emulator.js';
import { createYM2149, createDcBlocker } from './ym2149.js';

const YM2149 = createYM2149(AYM_Emulator);

// Atari ST (PAL): the CPU runs at 8.021247 MHz and the YM2149 is fed a quarter
// of that. These have to be the real figures rather than round ones - the speed
// correction below would otherwise spend its whole range making up the
// difference instead of tracking the emulator.
const CPU_CLOCK = 8021247;
const CHIP_CLOCK = CPU_CLOCK / 4;

// How much unplayed timeline to keep in hand, in frames. This is the latency
// budget: enough to ride out an irregular frame loop, small enough that sound
// effects still feel attached to the picture.
const TARGET_LEAD_FRAMES = 3;

// How hard to correct a lead error, and the most we will ever bend playback
// speed. With the clocks above matching what estyjs.js actually delivers, the
// correction settles within a fraction of a percent of 1 and the limit is only
// there for when something goes badly wrong.
//
// The gain is deliberately weak. A frame or two of delivery jitter is normal -
// it happens every time the main thread does something slow - and the cushion
// above exists precisely to absorb it. Reacting hard to that jitter would turn
// it into pitch movement, which is the one artefact worth avoiding here.
const RATE_GAIN = 0.008;
const RATE_LIMIT = 0.05;

// Playback speed is smoothed towards its target so corrections arrive as a
// slow glide rather than a step. At a 128 sample quantum this is a second or
// two.
const RATE_SMOOTHING = 0.002;

// If the main thread stops feeding us for this long, fade out rather than
// letting the last note drone on. Happens when the tab is hidden and
// setTimeout gets throttled.
const STARVED_FRAMES = 6;
const FADE_SECONDS = 0.02;

// Ceiling on unplayed frames. Nothing should come close - the speed correction
// holds the lead at a handful - but if the audio thread is suspended while the
// emulator keeps running, frames would otherwise pile up without limit.
const MAX_QUEUED_FRAMES = 200;

class EstySoundProcessor extends AudioWorkletProcessor {

    constructor(options) {
        super();

        const opts = options.processorOptions || {};
        this.cyclesPerFrame = opts.cyclesPerFrame || (512 * 313);

        this.chip = new YM2149({ type: 'YM' });
        this.chip.set_master_clock(CHIP_CLOCK);
        this.chip.reset();

        // Fractional accumulator for clocking the chip from the sample rate.
        this.chipTicks = 0;

        this.blockDc = createDcBlocker(sampleRate);

        // Frames handed over by sound.js but not played yet. Each holds the
        // flat (cycle, register, value) triples for one emulated frame.
        this.queue = [];

        // Where playback has reached on the ST timeline, in CPU cycles since
        // power-on, and how far the emulator has run past it.
        this.cycle = 0;
        this.leadEnd = 0;
        this.started = false;

        this.rate = 1;
        this.gain = 1;

        // Samples until the next status report. The feedback loop below is
        // invisible from the main thread otherwise, and a report a second is
        // cheap enough to leave switched on.
        this.statusCountdown = 0;

        this.port.onmessage = (event) => this.receive(event.data);
    }

    receive(msg) {
        if (msg.type == 'reset') {
            this.queue.length = 0;
            this.chip.reset();
            this.chipTicks = 0;
            this.cycle = 0;
            this.leadEnd = 0;
            this.started = false;
            this.rate = 1;
            return;
        }

        if (msg.type != 'frame') return;

        const base = msg.frame * this.cyclesPerFrame;
        this.queue.push({ base: base, writes: msg.writes, index: 0 });
        this.leadEnd = base + this.cyclesPerFrame;

        while (this.queue.length > MAX_QUEUED_FRAMES) this.queue.shift();
    }

    // Put playback exactly TARGET_LEAD_FRAMES behind the emulator. Done on the
    // audio thread rather than when a frame arrives, because frames keep
    // arriving in the gap before the first render call and the lead would
    // otherwise start too large - which the loop below would then have to
    // correct, audibly, as a pitch slide.
    anchor() {
        this.cycle = this.leadEnd - TARGET_LEAD_FRAMES * this.cyclesPerFrame;
        this.rate = 1;
        this.started = true;
    }

    // Apply every recorded write that playback has now reached.
    applyWritesUpTo(cycle) {
        const queue = this.queue;
        while (queue.length > 0) {
            const frame = queue[0];
            const writes = frame.writes;
            while (frame.index < writes.length) {
                if (frame.base + writes[frame.index] > cycle) return;
                this.chip.set_register_index(writes[frame.index + 1]);
                this.chip.set_register_value(writes[frame.index + 2]);
                frame.index += 3;
            }
            if (frame.base + this.cyclesPerFrame > cycle) return;
            queue.shift();
        }
    }

    // Hold the unplayed lead near its target by bending playback speed.
    updateRate() {
        const error = (this.leadEnd - this.cycle) / this.cyclesPerFrame - TARGET_LEAD_FRAMES;
        const wanted = 1 + Math.max(-RATE_LIMIT, Math.min(RATE_LIMIT, error * RATE_GAIN));
        this.rate += (wanted - this.rate) * RATE_SMOOTHING;
    }

    process(inputs, outputs) {
        const out = outputs[0][0];
        if (!out) return true;

        // Start, or start again, once the emulator has built up a cushion.
        if (!this.started && this.queue.length >= TARGET_LEAD_FRAMES) this.anchor();

        if (this.started) {
            const lead = this.leadEnd - this.cycle;

            if (lead > (TARGET_LEAD_FRAMES + STARVED_FRAMES) * this.cyclesPerFrame) {
                // The emulator raced ahead - a reset, or a hidden tab catching
                // up. Jump rather than grind through the backlog at 5%.
                this.anchor();
            } else if (-lead > STARVED_FRAMES * this.cyclesPerFrame) {
                // It has stopped feeding us instead. Fade out and wait for a
                // fresh cushion rather than let the last note drone on.
                this.started = false;
            }
        }

        const running = this.started;
        const targetGain = running ? 1 : 0;
        const gainStep = 1 / (FADE_SECONDS * sampleRate);

        // Already faded out and still nothing to play: leave the buffer silent.
        if (!running && this.gain == 0) return true;

        this.updateRate();

        // The chip is clocked from the same adjusted rate as the timeline, so
        // pitch and the placement of register writes can never drift apart.
        const chip = this.chip;
        const cyclesPerSample = CPU_CLOCK * this.rate / sampleRate;
        const ticksPerSample = CHIP_CLOCK * this.rate;

        for (let i = 0; i < out.length; i++) {
            // While faded out the queue is left untouched, so that resuming
            // waits for a full cushion instead of chasing single frames.
            if (running) this.applyWritesUpTo(this.cycle);

            const sample = this.blockDc((chip.get_channel0() + chip.get_channel1() +
                                         chip.get_channel2()) / 3);

            if (this.gain < targetGain) this.gain = Math.min(targetGain, this.gain + gainStep);
            else if (this.gain > targetGain) this.gain = Math.max(targetGain, this.gain - gainStep);

            out[i] = sample * this.gain;

            this.chipTicks += ticksPerSample;
            while (this.chipTicks >= sampleRate) {
                this.chipTicks -= sampleRate;
                chip.clock();
            }

            if (running) this.cycle += cyclesPerSample;
        }

        this.statusCountdown -= out.length;
        if (this.statusCountdown <= 0) {
            this.statusCountdown = sampleRate;
            this.port.postMessage({
                type: 'status',
                lead: (this.leadEnd - this.cycle) / this.cyclesPerFrame,
                rate: this.rate,
                starved: !running
            });
        }

        return true;
    }
}

registerProcessor('esty-sound-processor', EstySoundProcessor);
