/*
 * sound-processor.js — AudioWorklet processor for EstyJS
 *
 * Runs on the browser's dedicated audio rendering thread.
 * Samples are delivered via a SharedArrayBuffer ring buffer.
 *
 * SAB layout:
 *   Int32  [0]  write cursor  (main thread advances)
 *   Int32  [1]  read  cursor  (audio thread advances)
 *   Int32  [2]  total callbacks fired  (audio thread increments)
 *   Int32  [3]  total underrun callbacks (audio thread increments)
 *   Int32  [4]  total underrun samples  (audio thread increments)
 *   Float32[8..8+RING_SIZE-1]  sample data
 */

const RING_SIZE = 16384; // power of two — ~371 ms at 44100 Hz

class EstySoundProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const sab = options.processorOptions.sab;
        this._ctrl = new Int32Array(sab, 0, 8);   // 8 x int32 = 32 bytes ctrl area
        this._data = new Float32Array(sab, 32, RING_SIZE);
        this._mask = RING_SIZE - 1;
    }

    process(inputs, outputs) {
        const out  = outputs[0][0];
        const n    = out.length;
        const data = this._data;
        const mask = this._mask;

        const head = Atomics.load(this._ctrl, 0); // write cursor
        let   tail = Atomics.load(this._ctrl, 1); // read cursor

        // Count how many samples are available
        const available = (head - tail + RING_SIZE * 2) % (RING_SIZE * 2);

        let underruns = 0;
        for (let i = 0; i < n; i++) {
            if (i < available) {
                out[i] = data[tail & mask];
                tail = (tail + 1) >>> 0;
            } else {
                out[i] = 0;
                underruns++;
            }
        }

        Atomics.store(this._ctrl, 1, tail);

        // Update diagnostic counters
        Atomics.add(this._ctrl, 2, 1);           // total callbacks
        if (underruns > 0) {
            Atomics.add(this._ctrl, 3, 1);       // callbacks with underruns
            Atomics.add(this._ctrl, 4, underruns); // total underrun samples
        }

        return true;
    }
}

registerProcessor('esty-sound-processor', EstySoundProcessor);