/*
 * check-audio.mjs - look for dropouts in a WAV file.
 *
 * Reports stretches where the signal falls to near nothing. A buffer underrun
 * shows up as runs that are an exact multiple of the browser's 128-sample
 * render quantum, usually clustered a few milliseconds apart.
 *
 * Beware of false positives: music with staccato notes has real gaps of its
 * own. Run this against a render-psg.mjs render of the same music as well - if
 * the two reports look alike, the gaps are in the music, not the audio path.
 *
 * usage: node tools/check-audio.mjs <file.wav> [...]
 */

import fs from 'fs';

function readWav(file) {
    const buf = fs.readFileSync(file);
    if (buf.toString('latin1', 0, 4) != 'RIFF') throw new Error(file + ': not a WAV');

    let channels = 1, sampleRate = 44100, bits = 16, data = null;
    let pos = 12;
    while (pos + 8 <= buf.length) {
        const id = buf.toString('latin1', pos, pos + 4);
        const size = buf.readUInt32LE(pos + 4);
        if (id == 'fmt ') {
            channels = buf.readUInt16LE(pos + 10);
            sampleRate = buf.readUInt32LE(pos + 12);
            bits = buf.readUInt16LE(pos + 22);
        } else if (id == 'data') {
            data = buf.subarray(pos + 8, pos + 8 + size);
        }
        pos += 8 + size + (size & 1);
    }
    if (!data || bits != 16) throw new Error(file + ': expected 16-bit PCM');

    const frames = Math.floor(data.length / 2 / channels);
    const mono = new Float64Array(frames);
    for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2);
        mono[i] = sum / channels / 32768;
    }
    return { mono, sampleRate };
}

// Root-mean-square over short blocks, then runs of blocks far below the median.
function findGaps(x, sampleRate) {
    const BLOCK = 64;
    const blocks = Math.floor(x.length / BLOCK);
    const rms = new Float64Array(blocks);
    for (let b = 0; b < blocks; b++) {
        let sum = 0;
        for (let i = 0; i < BLOCK; i++) { const v = x[b * BLOCK + i]; sum += v * v; }
        rms[b] = Math.sqrt(sum / BLOCK);
    }

    const sorted = Float64Array.from(rms).sort();
    const median = sorted[blocks >> 1];
    const floor = median * 0.08;

    const gaps = [];
    for (let b = 0; b < blocks; b++) {
        if (rms[b] >= floor) continue;
        let e = b;
        while (e < blocks && rms[e] < floor) e++;
        const length = (e - b) * BLOCK;
        if (length >= 128) gaps.push({ start: b * BLOCK, length });
        b = e;
    }
    return { gaps, median };
}

for (const file of process.argv.slice(2)) {
    const { mono, sampleRate } = readWav(file);
    const { gaps, median } = findGaps(mono, sampleRate);
    const silent = gaps.reduce((a, g) => a + g.length, 0);

    console.log(`${file}`);
    console.log(`  ${(mono.length / sampleRate).toFixed(2)}s @${sampleRate}Hz, ` +
                `median block RMS ${median.toFixed(4)}`);

    if (!gaps.length) { console.log('  no gaps found'); continue; }

    const lengths = gaps.map(g => g.length).sort((a, b) => a - b);
    const quantum = gaps.filter(g => g.length % 128 == 0).length;
    console.log(`  ${gaps.length} gaps, ${(silent / sampleRate * 1000).toFixed(0)}ms total ` +
                `(${(silent / mono.length * 100).toFixed(1)}% of the file)`);
    console.log(`  gap length: shortest ${lengths[0]}, median ` +
                `${lengths[lengths.length >> 1]}, longest ${lengths[lengths.length - 1]} samples`);
    // One or two quantum-sized gaps prove nothing - a quiet moment in the music
    // can be any length. Underruns come in numbers.
    const underruns = gaps.length >= 5 && quantum >= gaps.length * 0.8 &&
                      lengths[lengths.length >> 1] <= 512;
    console.log(`  ${quantum}/${gaps.length} are an exact multiple of 128 samples` +
                (underruns ? '  <- looks like underruns' : ''));
    console.log(`  first few at: ${gaps.slice(0, 6)
        .map(g => (g.start / sampleRate).toFixed(2) + 's').join(', ')}`);
}
