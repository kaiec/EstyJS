/*
 * render-psg.mjs - render a recorded PSG log to a WAV file.
 *
 * This is the reference renderer: it walks the output sample grid, applies each
 * register write as the grid passes the cycle it was recorded at, and clocks the
 * chip. Nothing here runs in real time, so the result is what EstyJs *should*
 * sound like, free of any question about buffering or scheduling.
 *
 * Comparing a browser recording against this separates "the emulation is wrong"
 * from "the audio path is wrong" - which is the whole reason it exists.
 *
 * usage: node tools/render-psg.mjs <log.json> <out.wav> [sampleRate]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

// aym-emulator.js is an ES module, but it lives in a directory with no
// package.json saying so, and Node decides that from the file extension. Import
// it through a data: URL so the vendored copy can stay byte-identical upstream.
const emulatorSource = fs.readFileSync(
    path.join(here, '..', 'estyjs', 'aym-js', 'aym-emulator.js'), 'utf8');
const { AYM_Emulator } = await import(
    'data:text/javascript;base64,' + Buffer.from(emulatorSource).toString('base64'));

const [logFile, outFile, rateArg] = process.argv.slice(2);
if (!logFile || !outFile) {
    console.error('usage: node tools/render-psg.mjs <log.json> <out.wav> [sampleRate]');
    process.exit(1);
}
const sampleRate = parseInt(rateArg || '48000', 10);

const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
const writes = log.writes;
if (!writes.length) {
    console.error('log contains no register writes');
    process.exit(1);
}

// Same clocks the worklet uses: 8 MHz CPU, YM2149 at a quarter of it.
const CPU_CLOCK = 8000000;
const CHIP_CLOCK = CPU_CLOCK / 4;

const chip = new AYM_Emulator({ type: 'YM' });
chip.set_master_clock(CHIP_CLOCK);
chip.reset();

const totalSamples = Math.floor(writes[writes.length - 1].cycle / CPU_CLOCK * sampleRate);
const pcm = Buffer.alloc(totalSamples * 2);

let next = 0, ticks = 0;
for (let s = 0; s < totalSamples; s++) {
    const cycle = (s + 1) * CPU_CLOCK / sampleRate;
    while (next < writes.length && writes[next].cycle <= cycle) {
        chip.set_register_index(writes[next].reg);
        chip.set_register_value(writes[next].val);
        next++;
    }

    const v = (chip.get_channel0() + chip.get_channel1() + chip.get_channel2()) / 3;
    pcm.writeInt16LE(Math.max(-1, Math.min(1, v)) * 32767 | 0, s * 2);

    ticks += CHIP_CLOCK;
    while (ticks >= sampleRate) { ticks -= sampleRate; chip.clock(); }
}

const wav = Buffer.alloc(44 + pcm.length);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
pcm.copy(wav, 44);
fs.writeFileSync(outFile, wav);

console.log(`${outFile}: ${(totalSamples / sampleRate).toFixed(2)}s mono @${sampleRate}Hz` +
            ` from ${writes.length} register writes`);
