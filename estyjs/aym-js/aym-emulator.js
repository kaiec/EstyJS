/*
 * aym-emulator.js - Copyright (c) 2001-2025 - Olivier Poncet
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

// ---------------------------------------------------------------------------
// AY_DAC
// ---------------------------------------------------------------------------

const AY_DAC = new Float32Array([
    0.0000000, 0.0000000, 0.0099947, 0.0099947,
    0.0144503, 0.0144503, 0.0210575, 0.0210575,
    0.0307012, 0.0307012, 0.0455482, 0.0455482,
    0.0644999, 0.0644999, 0.1073625, 0.1073625,
    0.1265888, 0.1265888, 0.2049897, 0.2049897,
    0.2922103, 0.2922103, 0.3728389, 0.3728389,
    0.4925307, 0.4925307, 0.6353246, 0.6353246,
    0.8055848, 0.8055848, 1.0000000, 1.0000000
]);

// ---------------------------------------------------------------------------
// YM_DAC
// ---------------------------------------------------------------------------

const YM_DAC = new Float32Array([
    0.0000000, 0.0000000, 0.0046540, 0.0077211,
    0.0109560, 0.0139620, 0.0169986, 0.0200198,
    0.0243687, 0.0296941, 0.0350652, 0.0403906,
    0.0485389, 0.0583352, 0.0680552, 0.0777752,
    0.0925154, 0.1110857, 0.1297475, 0.1484855,
    0.1766690, 0.2115511, 0.2463874, 0.2811017,
    0.3337301, 0.4004273, 0.4673838, 0.5344320,
    0.6351720, 0.7580072, 0.8799268, 1.0000000
]);

// ---------------------------------------------------------------------------
// AYM_State
// ---------------------------------------------------------------------------

class AYM_State {
    constructor() {
        this.index = 0;
        this.array = new Uint8Array(16);
    }

    reset() {
        this.index &= 0;
        const count = this.array.length;
        for(let index = 0; index < count; ++index) {
            this.array[index] &= 0;
        }
    }
}

// ---------------------------------------------------------------------------
// AYM_ToneGenerator
// ---------------------------------------------------------------------------

class AYM_ToneGenerator {
    constructor() {
        this.counter = 0;
        this.period  = 0;
        this.phase   = 0;
    }

    reset() {
        this.counter &= 0;
        this.period  &= 0;
        this.phase   &= 0;
    }

    clock() {
        if(++this.counter >= this.period) {
            this.counter &= 0;
            this.phase   ^= 1;
        }
    }

    set_coarse_tune(value) {
        const msb = ((value & 0xff) << 8);
        const lsb = (this.period & (0xff << 0));
        this.period = (msb | lsb);
    }

    set_fine_tune(value) {
        const msb = (this.period & (0xff << 8));
        const lsb = ((value & 0xff) << 0);
        this.period = (msb | lsb);
    }
}

// ---------------------------------------------------------------------------
// AYM_NoiseGenerator
// ---------------------------------------------------------------------------

class AYM_NoiseGenerator {
    constructor() {
        this.counter = 0;
        this.period  = 0;
        this.phase   = 0;
        this.lfsr    = 0;
    }

    reset() {
        this.counter &= 0;
        this.period  &= 0;
        this.phase   &= 0;
        this.lfsr    &= 0;
    }

    clock() {
        if(++this.counter >= this.period) {
            this.counter &= 0;
            const lfsr = this.lfsr;
            const bit0 = (lfsr << 16);
            const bit3 = (lfsr << 13);
            const msb  = (~(bit0 ^ bit3) & 0x10000);
            const lsb  = ((lfsr >> 1) & 0x0ffff);
            this.lfsr  = (msb | lsb);
            this.phase = (this.lfsr & 1);
        }
    }

    set_coarse_tune(value) {
        const msb = ((value & 0xff) << 9);
        const lsb = (this.period & (0xff << 1));
        this.period = (msb | lsb);
    }

    set_fine_tune(value) {
        const msb = (this.period & (0xff << 9));
        const lsb = ((value & 0xff) << 1);
        this.period = (msb | lsb);
    }
}

// ---------------------------------------------------------------------------
// AYM_EnvelopeGenerator
// ---------------------------------------------------------------------------

class AYM_EnvelopeGenerator {
    constructor() {
        this.counter = 0;
        this.period  = 0;
        this.shape   = 0;
        this.phase   = 0;
        this.level   = 0;

        const ramp_up = () => {
            this.level = ((this.level + 1) & 0x1f);
            if(this.level == 0x1f) {
                this.phase ^= 1;
            }
        };

        const ramp_down = () => {
            this.level = ((this.level - 1) & 0x1f);
            if(this.level == 0x00) {
                this.phase ^= 1;
            }
        };

        const hold_up = () => {
            this.level = 0x1f;
        };

        const hold_down = () => {
            this.level = 0x00;
        };

        this.cycles = [
            [ ramp_down, hold_down ],
            [ ramp_down, hold_down ],
            [ ramp_down, hold_down ],
            [ ramp_down, hold_down ],
            [ ramp_up  , hold_down ],
            [ ramp_up  , hold_down ],
            [ ramp_up  , hold_down ],
            [ ramp_up  , hold_down ],
            [ ramp_down, ramp_down ],
            [ ramp_down, hold_down ],
            [ ramp_down, ramp_up   ],
            [ ramp_down, hold_up   ],
            [ ramp_up  , ramp_up   ],
            [ ramp_up  , hold_up   ],
            [ ramp_up  , ramp_down ],
            [ ramp_up  , hold_down ],
        ];
    }

    reset() {
        this.counter &= 0;
        this.period  &= 0;
        this.shape   &= 0;
        this.phase   &= 0;
        this.level   &= 0;
    }

    clock() {
        if(++this.counter >= this.period) {
            this.counter &= 0;
            this.cycles[this.shape][this.phase]();
        }
    }

    set_coarse_tune(value) {
        const msb = ((value & 0xff) << 8);
        const lsb = (this.period & (0xff << 0));
        this.period = (msb | lsb);
    }

    set_fine_tune(value) {
        const msb = (this.period & (0xff << 8));
        const lsb = ((value & 0xff) << 0);
        this.period = (msb | lsb);
    }

    set_shape(value) {
        this.shape = value;
        this.phase = 0;
        this.level = ((this.shape & 0x04) != 0 ? 0x00 : 0x1f);
    }

    get_level() {
        return this.level;
    }
}

// ---------------------------------------------------------------------------
// AYM_ToneAndNoiseMixer
// ---------------------------------------------------------------------------

class AYM_ToneAndNoiseMixer {
    constructor() {
        this.sound0 = 0;
        this.noise0 = 0;
        this.level0 = 0;
        this.sound1 = 0;
        this.noise1 = 0;
        this.level1 = 0;
        this.sound2 = 0;
        this.noise2 = 0;
        this.level2 = 0;
    }

    reset() {
        this.sound0 &= 0;
        this.noise0 &= 0;
        this.level0 &= 0;
        this.sound1 &= 0;
        this.noise1 &= 0;
        this.level1 &= 0;
        this.sound2 &= 0;
        this.noise2 &= 0;
        this.level2 &= 0;
    }

    clock(envelope) {
        const level = envelope.get_level();

        if((this.level0 & 0x20) != 0) {
            this.level0 = ((this.level0 & 0xe0) | (level & 0x1f));
        }
        if((this.level1 & 0x20) != 0) {
            this.level1 = ((this.level1 & 0xe0) | (level & 0x1f));
        }
        if((this.level2 & 0x20) != 0) {
            this.level2 = ((this.level2 & 0xe0) | (level & 0x1f));
        }
    }

    set_configuration(value) {
        this.sound0 = (((value & 0x01) == 0) | 0);
        this.sound1 = (((value & 0x02) == 0) | 0);
        this.sound2 = (((value & 0x04) == 0) | 0);
        this.noise0 = (((value & 0x08) == 0) | 0);
        this.noise1 = (((value & 0x10) == 0) | 0);
        this.noise2 = (((value & 0x20) == 0) | 0);
    }

    set_channel0_amplitude(value) {
        this.level0 = (((value << 1) & 0x3e) | ((value >> 3) & 0x01));
    }

    set_channel1_amplitude(value) {
        this.level1 = (((value << 1) & 0x3e) | ((value >> 3) & 0x01));
    }

    set_channel2_amplitude(value) {
        this.level2 = (((value << 1) & 0x3e) | ((value >> 3) & 0x01));
    }
}

// ---------------------------------------------------------------------------
// AYM_Emulator
// ---------------------------------------------------------------------------

export class AYM_Emulator {
    constructor(setup) {
        this.state = new AYM_State();
        this.tone0 = new AYM_ToneGenerator();
        this.tone1 = new AYM_ToneGenerator();
        this.tone2 = new AYM_ToneGenerator();
        this.noise = new AYM_NoiseGenerator();
        this.envel = new AYM_EnvelopeGenerator();
        this.mixer = new AYM_ToneAndNoiseMixer();
        this.master_clock = 1000000;
        this.clock_divide = 0;
        this.dac          = AY_DAC;
        this.set_type(setup.type || 'default');
        this.reset();
    }

    set_type(type) {
        switch(type) {
            case 'AY':
                this.set_type_ay();
                break;
            case 'YM':
                this.set_type_ym();
                break;
            default:
                break;
        }
    }

    set_type_ay() {
        this.dac = AY_DAC;
    }

    set_type_ym() {
        this.dac = YM_DAC;
    }

    reset() {
        this.state.reset();
        this.tone0.reset();
        this.tone1.reset();
        this.tone2.reset();
        this.noise.reset();
        this.envel.reset();
        this.mixer.reset();
        this.master_clock |= 0;
        this.clock_divide &= 0;
        for(let index = 0; index < 16; ++index) {
            this.set_register_index(index);
            this.set_register_value(0);
            this.set_register_index(0);
        }
    }

    clock() {
        const clk_div = (this.clock_divide = ((this.clock_divide + 1) & 0xff));
        if((clk_div & 0x07) == 0) {
            this.fixup_tones();
            this.tone0.clock();
            this.tone1.clock();
            this.tone2.clock();
            this.noise.clock();
            this.envel.clock();
            this.mixer.clock(this.envel);
        }
    }

    fixup_tones() {
        const fixup = (lhs, rhs) => {
            if((lhs.period == rhs.period) && (lhs.counter != rhs.counter)) {
                lhs.counter = rhs.counter;
                lhs.phase   = rhs.phase;
            }
        };
        fixup(this.tone0, this.tone1);
        fixup(this.tone0, this.tone2);
        fixup(this.tone1, this.tone2);
    }

    set_register_index(reg_index) {
        this.state.index = (reg_index &= 0xff);

        return reg_index;
    }

    get_register_value(reg_value) {
        const reg_index = this.state.index;
        const reg_array = this.state.array;

        if((reg_index >= 0) && (reg_index <= 15)) {
            reg_value = reg_array[reg_index];
        }
        return reg_value;
    }

    set_register_value(reg_value) {
        const reg_index = this.state.index;
        const reg_array = this.state.array;

        switch(reg_index) {
            case 0x00: /* CHANNEL_A_FINE_TUNE */
                reg_array[reg_index] = (reg_value &= 0xff);
                this.tone0.set_fine_tune(reg_value);
                break;
            case 0x01: /* CHANNEL_A_COARSE_TUNE */
                reg_array[reg_index] = (reg_value &= 0x0f);
                this.tone0.set_coarse_tune(reg_value);
                break;
            case 0x02: /* CHANNEL_B_FINE_TUNE */
                reg_array[reg_index] = (reg_value &= 0xff);
                this.tone1.set_fine_tune(reg_value);
                break;
            case 0x03: /* CHANNEL_B_COARSE_TUNE */
                reg_array[reg_index] = (reg_value &= 0x0f);
                this.tone1.set_coarse_tune(reg_value);
                break;
            case 0x04: /* CHANNEL_C_FINE_TUNE */
                reg_array[reg_index] = (reg_value &= 0xff);
                this.tone2.set_fine_tune(reg_value);
                break;
            case 0x05: /* CHANNEL_C_COARSE_TUNE */
                reg_array[reg_index] = (reg_value &= 0x0f);
                this.tone2.set_coarse_tune(reg_value);
                break;
            case 0x06: /* NOISE_GENERATOR */
                reg_array[reg_index] = (reg_value &= 0x1f);
                this.noise.set_fine_tune(reg_value);
                break;
            case 0x07: /* MIXER_AND_IO_CONTROL */
                reg_array[reg_index] = (reg_value &= 0xff);
                this.mixer.set_configuration(reg_value);
                break;
            case 0x08: /* CHANNEL_A_AMPLITUDE */
                reg_array[reg_index] = (reg_value &= 0x1f);
                this.mixer.set_channel0_amplitude(reg_value);
                break;
            case 0x09: /* CHANNEL_B_AMPLITUDE */
                reg_array[reg_index] = (reg_value &= 0x1f);
                this.mixer.set_channel1_amplitude(reg_value);
                break;
            case 0x0a: /* CHANNEL_C_AMPLITUDE */
                reg_array[reg_index] = (reg_value &= 0x1f);
                this.mixer.set_channel2_amplitude(reg_value);
                break;
            case 0x0b: /* ENVELOPE_FINE_TUNE */
                reg_array[reg_index] = (reg_value &= 0xff);
                this.envel.set_fine_tune(reg_value);
                break;
            case 0x0c: /* ENVELOPE_COARSE_TUNE */
                reg_array[reg_index] = (reg_value &= 0xff);
                this.envel.set_coarse_tune(reg_value);
                break;
            case 0x0d: /* ENVELOPE_SHAPE */
                reg_array[reg_index] = (reg_value &= 0x0f);
                this.envel.set_shape(reg_value);
                break;
            case 0x0e: /* IO_PORT_A */
                reg_array[reg_index] = (reg_value &= 0xff);
                break;
            case 0x0f: /* IO_PORT_B */
                reg_array[reg_index] = (reg_value &= 0xff);
                break;
            default:
                break;
        }
        return reg_value;
    }

    get_master_clock() {
        return this.master_clock;
    }

    set_master_clock(master_clock) {
        this.master_clock = (master_clock | 0);
        if(this.master_clock <= 0) {
            this.master_clock = 1000000;
        }
        return this.master_clock;
    }

    get_channel0_original() {
        const sound = (this.tone0.phase & this.mixer.sound0);
        const noise = (this.noise.phase & this.mixer.noise0);
        const level = (this.dac[this.mixer.level0 & 0x1f]);

        return ((((sound | noise) * level) * 2.0) - 1.0);
    }

    get_channel1_original() {
        const sound = (this.tone1.phase & this.mixer.sound1);
        const noise = (this.noise.phase & this.mixer.noise1);
        const level = (this.dac[this.mixer.level1 & 0x1f]);

        return ((((sound | noise) * level) * 2.0) - 1.0);
    }

    get_channel2_original() {
        const sound = (this.tone2.phase & this.mixer.sound2);
        const noise = (this.noise.phase & this.mixer.noise2);
        const level = (this.dac[this.mixer.level2 & 0x1f]);

        return ((((sound | noise) * level) * 2.0) - 1.0);
    }

    get_channel0() {
        const has_sound = this.mixer.sound0;
        const has_noise = this.mixer.noise0;
        const sig_sound = (this.tone0.phase != 0 ? +1 : -1);
        const sig_noise = (this.noise.phase != 0 ? +1 : -1);
        const amplitude = this.dac[this.mixer.level0 & 0x1f];
        let   output    = 0;

        if(has_sound != 0) {
            output |= sig_sound;
        }
        if(has_noise != 0) {
            output |= sig_noise;
        }
        return output * amplitude;
    }

    get_channel1() {
        const has_sound = this.mixer.sound1;
        const has_noise = this.mixer.noise1;
        const sig_sound = (this.tone1.phase != 0 ? +1 : -1);
        const sig_noise = (this.noise.phase != 0 ? +1 : -1);
        const amplitude = this.dac[this.mixer.level1 & 0x1f];
        let   output    = 0;

        if(has_sound != 0) {
            output |= sig_sound;
        }
        if(has_noise != 0) {
            output |= sig_noise;
        }
        return output * amplitude;
    }

    get_channel2() {
        const has_sound = this.mixer.sound2;
        const has_noise = this.mixer.noise2;
        const sig_sound = (this.tone2.phase != 0 ? +1 : -1);
        const sig_noise = (this.noise.phase != 0 ? +1 : -1);
        const amplitude = this.dac[this.mixer.level2 & 0x1f];
        let   output    = 0;

        if(has_sound != 0) {
            output |= sig_sound;
        }
        if(has_noise != 0) {
            output |= sig_noise;
        }
        return output * amplitude;
    }
}

// ---------------------------------------------------------------------------
// End-Of-File
// ---------------------------------------------------------------------------
