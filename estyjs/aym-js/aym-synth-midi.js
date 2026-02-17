/*
 * aym-synth-midi.js - Copyright (c) 2001-2025 - Olivier Poncet
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { AYM_Utils } from './aym-utils.js';

// ---------------------------------------------------------------------------
// MIDI note/frequency conversion table
// ---------------------------------------------------------------------------

const MIDI_NOTE_TO_FREQUENCY = [
    /*   0 */     8.176,
    /*   1 */     8.662,
    /*   2 */     9.177,
    /*   3 */     9.723,
    /*   4 */    10.301,
    /*   5 */    10.913,
    /*   6 */    11.562,
    /*   7 */    12.250,
    /*   8 */    12.978,
    /*   9 */    13.750,
    /*  10 */    14.568,
    /*  11 */    15.434,
    /*  12 */    16.352,
    /*  13 */    17.324,
    /*  14 */    18.354,
    /*  15 */    19.445,
    /*  16 */    20.602,
    /*  17 */    21.827,
    /*  18 */    23.125,
    /*  19 */    24.500,
    /*  20 */    25.957,
    /*  21 */    27.500,
    /*  22 */    29.135,
    /*  23 */    30.868,
    /*  24 */    32.703,
    /*  25 */    34.648,
    /*  26 */    36.708,
    /*  27 */    38.891,
    /*  28 */    41.203,
    /*  29 */    43.654,
    /*  30 */    46.249,
    /*  31 */    48.999,
    /*  32 */    51.913,
    /*  33 */    55.000,
    /*  34 */    58.270,
    /*  35 */    61.735,
    /*  36 */    65.406,
    /*  37 */    69.296,
    /*  38 */    73.416,
    /*  39 */    77.782,
    /*  40 */    82.407,
    /*  41 */    87.307,
    /*  42 */    92.499,
    /*  43 */    97.999,
    /*  44 */   103.826,
    /*  45 */   110.000,
    /*  46 */   116.541,
    /*  47 */   123.471,
    /*  48 */   130.813,
    /*  49 */   138.591,
    /*  50 */   146.832,
    /*  51 */   155.563,
    /*  52 */   164.814,
    /*  53 */   174.614,
    /*  54 */   184.997,
    /*  55 */   195.998,
    /*  56 */   207.652,
    /*  57 */   220.000,
    /*  58 */   233.082,
    /*  59 */   246.942,
    /*  60 */   261.626,
    /*  61 */   277.183,
    /*  62 */   293.665,
    /*  63 */   311.127,
    /*  64 */   329.628,
    /*  65 */   349.228,
    /*  66 */   369.994,
    /*  67 */   391.995,
    /*  68 */   415.305,
    /*  69 */   440.000,
    /*  70 */   466.164,
    /*  71 */   493.883,
    /*  72 */   523.251,
    /*  73 */   554.365,
    /*  74 */   587.330,
    /*  75 */   622.254,
    /*  76 */   659.255,
    /*  77 */   698.456,
    /*  78 */   739.989,
    /*  79 */   783.991,
    /*  80 */   830.609,
    /*  81 */   880.000,
    /*  82 */   932.328,
    /*  83 */   987.767,
    /*  84 */  1046.502,
    /*  85 */  1108.731,
    /*  86 */  1174.659,
    /*  87 */  1244.508,
    /*  88 */  1318.510,
    /*  89 */  1396.913,
    /*  90 */  1479.978,
    /*  91 */  1567.982,
    /*  92 */  1661.219,
    /*  93 */  1760.000,
    /*  94 */  1864.655,
    /*  95 */  1975.533,
    /*  96 */  2093.005,
    /*  97 */  2217.461,
    /*  98 */  2349.318,
    /*  99 */  2489.016,
    /* 100 */  2637.020,
    /* 101 */  2793.826,
    /* 102 */  2959.955,
    /* 103 */  3135.963,
    /* 104 */  3322.438,
    /* 105 */  3520.000,
    /* 106 */  3729.310,
    /* 107 */  3951.066,
    /* 108 */  4186.009,
    /* 109 */  4434.922,
    /* 110 */  4698.636,
    /* 111 */  4978.032,
    /* 112 */  5274.041,
    /* 113 */  5587.652,
    /* 114 */  5919.911,
    /* 115 */  6271.927,
    /* 116 */  6644.875,
    /* 117 */  7040.000,
    /* 118 */  7458.620,
    /* 119 */  7902.133,
    /* 120 */  8372.018,
    /* 121 */  8869.844,
    /* 122 */  9397.273,
    /* 123 */  9956.063,
    /* 124 */ 10548.080,
    /* 125 */ 11175.300,
    /* 126 */ 11839.820,
    /* 127 */ 12543.850,
];

// ---------------------------------------------------------------------------
// MIDI velocity/amplitude conversion table
// ---------------------------------------------------------------------------

const MIDI_VELOCITY_TO_AMPLITUDE = [
    /*   0 */   0,
    /*   1 */   1,
    /*   2 */  19,
    /*   3 */  30,
    /*   4 */  37,
    /*   5 */  43,
    /*   6 */  48,
    /*   7 */  52,
    /*   8 */  55,
    /*   9 */  59,
    /*  10 */  61,
    /*  11 */  64,
    /*  12 */  66,
    /*  13 */  68,
    /*  14 */  70,
    /*  15 */  72,
    /*  16 */  74,
    /*  17 */  75,
    /*  18 */  77,
    /*  19 */  78,
    /*  20 */  79,
    /*  21 */  81,
    /*  22 */  82,
    /*  23 */  83,
    /*  24 */  84,
    /*  25 */  85,
    /*  26 */  86,
    /*  27 */  87,
    /*  28 */  88,
    /*  29 */  89,
    /*  30 */  90,
    /*  31 */  91,
    /*  32 */  92,
    /*  33 */  92,
    /*  34 */  93,
    /*  35 */  94,
    /*  36 */  95,
    /*  37 */  95,
    /*  38 */  96,
    /*  39 */  97,
    /*  40 */  97,
    /*  41 */  98,
    /*  42 */  99,
    /*  43 */  99,
    /*  44 */ 100,
    /*  45 */ 100,
    /*  46 */ 101,
    /*  47 */ 102,
    /*  48 */ 102,
    /*  49 */ 103,
    /*  50 */ 103,
    /*  51 */ 104,
    /*  52 */ 104,
    /*  53 */ 105,
    /*  54 */ 105,
    /*  55 */ 106,
    /*  56 */ 106,
    /*  57 */ 107,
    /*  58 */ 107,
    /*  59 */ 108,
    /*  60 */ 108,
    /*  61 */ 108,
    /*  62 */ 109,
    /*  63 */ 109,
    /*  64 */ 110,
    /*  65 */ 110,
    /*  66 */ 110,
    /*  67 */ 111,
    /*  68 */ 111,
    /*  69 */ 112,
    /*  70 */ 112,
    /*  71 */ 112,
    /*  72 */ 113,
    /*  73 */ 113,
    /*  74 */ 113,
    /*  75 */ 114,
    /*  76 */ 114,
    /*  77 */ 114,
    /*  78 */ 115,
    /*  79 */ 115,
    /*  80 */ 115,
    /*  81 */ 116,
    /*  82 */ 116,
    /*  83 */ 116,
    /*  84 */ 117,
    /*  85 */ 117,
    /*  86 */ 117,
    /*  87 */ 118,
    /*  88 */ 118,
    /*  89 */ 118,
    /*  90 */ 119,
    /*  91 */ 119,
    /*  92 */ 119,
    /*  93 */ 119,
    /*  94 */ 120,
    /*  95 */ 120,
    /*  96 */ 120,
    /*  97 */ 120,
    /*  98 */ 121,
    /*  99 */ 121,
    /* 100 */ 121,
    /* 101 */ 122,
    /* 102 */ 122,
    /* 103 */ 122,
    /* 104 */ 122,
    /* 105 */ 123,
    /* 106 */ 123,
    /* 107 */ 123,
    /* 108 */ 123,
    /* 109 */ 124,
    /* 110 */ 124,
    /* 111 */ 124,
    /* 112 */ 124,
    /* 113 */ 124,
    /* 114 */ 125,
    /* 115 */ 125,
    /* 116 */ 125,
    /* 117 */ 125,
    /* 118 */ 126,
    /* 119 */ 126,
    /* 120 */ 126,
    /* 121 */ 126,
    /* 122 */ 126,
    /* 123 */ 127,
    /* 124 */ 127,
    /* 125 */ 127,
    /* 126 */ 127,
    /* 127 */ 127,
];

// ---------------------------------------------------------------------------
// AYM_SynthMIDI
// ---------------------------------------------------------------------------

export class AYM_SynthMIDI {
    constructor(controller) {
        this.controller = controller;
        this.inputs     = null;
        this.outputs    = null;
    }

    async powerOn() {
        if((this.inputs == null) && (this.outputs == null)) {
            navigator.requestMIDIAccess().then(
                (midi) => { this.onSuccess(midi) },
                (midi) => { this.onFailure(midi) }
            );
        }
    }

    async powerOff() {
        /* do nothing */
    }

    onSuccess(midi) {
        const registerInput = (input) => {
            input.onmidimessage = (message) => {
                this.onMessage(message);
            };
        };

        const registerInputs = () => {
            const inputs = midi.inputs;
            inputs.forEach((input) => {
                registerInput(input);
            });
            return inputs;
        };

        const registerOutput = (output) => {
            /* do nothing */
        };

        const registerOutputs = () => {
            const outputs = midi.outputs;
            outputs.forEach((output) => {
                registerOutput(output);
            });
            return outputs;
        };

        this.inputs  = registerInputs();
        this.outputs = registerOutputs();
    }

    onFailure(midi) {
        this.controller.midiIsNotSupported();
    }

    onNoteOff(message) {
        const channel  = (message.data[0] & 0x0f);
        const note     = (message.data[1] & 0xff);
        const velocity = (message.data[2] & 0xff);
        const note_min = 16;
        const note_max = 111;
        if((note >= note_min) && (note <= note_max)) {
            this.controller.midiNoteOff(channel, note, velocity);
        }
    }

    onNoteOn(message) {
        const channel  = (message.data[0] & 0x0f);
        const note     = (message.data[1] & 0xff);
        const velocity = (message.data[2] & 0xff);
        const note_min = 16;
        const note_max = 111;
        if((note >= note_min) && (note <= note_max)) {
            if(velocity == 0) {
                this.controller.midiNoteOff(channel, note, 127);
            }
            else {
                this.controller.midiNoteOn(channel, note, velocity);
            }
        }
    }

    onAftertouch(message) {
        /* TODO */
    }

    onControlChange(message) {
        /* TODO */
    }

    onProgramChange(message) {
        /* TODO */
    }

    onChannelPressure(message) {
        /* TODO */
    }

    onPitchBend(message) {
        /* TODO */
    }

    onSystemControl(message) {
        /* TODO */
    }

    onMessage(message) {
        const command = (message.data[0] >> 4);

        switch(command) {
            case 0x8:
                this.onNoteOff(message);
                break;
            case 0x9:
                this.onNoteOn(message);
                break;
            case 0xa:
                this.onAftertouch(message);
                break;
            case 0xb:
                this.onControlChange(message);
                break;
            case 0xc:
                this.onProgramChange(message);
                break;
            case 0xd:
                this.onChannelPressure(message);
                break;
            case 0xe:
                this.onPitchBend(message);
                break;
            case 0xf:
                this.onSystemControl(message);
                break;
            default:
                break;
        }
    }

    convertNoteToFrequency(value) {
        const min = 0;
        const max = 127;
        const val = AYM_Utils.clamp_int(value, min, max);

        return MIDI_NOTE_TO_FREQUENCY[val];
    }

    convertVelocityToAmplitude(value) {
        const min = 0;
        const max = 127;
        const val = AYM_Utils.clamp_int(value, min, max);

        return MIDI_VELOCITY_TO_AMPLITUDE[val];
    }
}

// ---------------------------------------------------------------------------
// End-Of-File
// ---------------------------------------------------------------------------
