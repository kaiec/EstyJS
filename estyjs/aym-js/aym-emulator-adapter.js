/*
 * aym-emulator-adapter.js - Copyright (c) 2001-2025 - Olivier Poncet
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

import { AYM_Utils    } from './aym-utils.js';
import { AYM_Emulator } from './aym-emulator.js';

// ---------------------------------------------------------------------------
// AYM_EmulatorAdapter
// ---------------------------------------------------------------------------

export class AYM_EmulatorAdapter {
    constructor(emulator) {
        this.emulator = emulator;
    }

    get_emulator() {
        return this.emulator;
    }

    set_type_ay() {
        this.emulator.set_type_ay();
    }

    set_type_ym() {
        this.emulator.set_type_ym();
    }

    get_master_clock() {
        return this.emulator.get_master_clock();
    }

    set_master_clock(master_clock) {
        return this.emulator.set_master_clock(master_clock);
    }

    get_channel0() {
        return this.emulator.get_channel0();
    }

    get_channel1() {
        return this.emulator.get_channel1();
    }

    get_channel2() {
        return this.emulator.get_channel2();
    }

    get_register(reg_index, reg_value) {
        this.emulator.set_register_index(reg_index);

        return this.emulator.get_register_value(reg_value);
    }

    set_register(reg_index, reg_value) {
        this.emulator.set_register_index(reg_index);

        return this.emulator.set_register_value(reg_value);
    }

    reset() {
        this.emulator.reset();
    }

    clock() {
        this.emulator.clock();
    }

    set_channel0_period(period) {
        const min_period = 0;
        const max_period = 4095;
        const req_period = AYM_Utils.clamp_int(period, min_period, max_period) | 0;
        this.set_register(0x00, ((req_period >> 0) & 0xff));
        this.set_register(0x01, ((req_period >> 8) & 0xff));
    }

    set_channel1_period(period) {
        const min_period = 0;
        const max_period = 4095;
        const req_period = AYM_Utils.clamp_int(period, min_period, max_period) | 0;
        this.set_register(0x02, ((req_period >> 0) & 0xff));
        this.set_register(0x03, ((req_period >> 8) & 0xff));
    }

    set_channel2_period(period) {
        const min_period = 0;
        const max_period = 4095;
        const req_period = AYM_Utils.clamp_int(period, min_period, max_period) | 0;
        this.set_register(0x04, ((req_period >> 0) & 0xff));
        this.set_register(0x05, ((req_period >> 8) & 0xff));
    }

    set_noise_period(period) {
        const min_period = 0;
        const max_period = 31;
        const req_period = AYM_Utils.clamp_int(period, min_period, max_period) | 0;
        this.set_register(0x06, ((req_period >> 0) & 0xff));
    }

    set_mixer_configuration(sound0, sound1, sound2, noise0, noise1, noise2) {
        let mixer_configuration = 0;
        if((sound0 | 0) == 0) { mixer_configuration |= 0x01; }
        if((sound1 | 0) == 0) { mixer_configuration |= 0x02; }
        if((sound2 | 0) == 0) { mixer_configuration |= 0x04; }
        if((noise0 | 0) == 0) { mixer_configuration |= 0x08; }
        if((noise1 | 0) == 0) { mixer_configuration |= 0x10; }
        if((noise2 | 0) == 0) { mixer_configuration |= 0x20; }
        this.set_register(0x07, mixer_configuration);
    }

    set_channel0_amplitude(amplitude, envelope) {
        const min_amplitude = 0;
        const max_amplitude = 15;
        const req_amplitude = AYM_Utils.clamp_int(amplitude, min_amplitude, max_amplitude) | 0;
        const req_envelope  = ((envelope | 0) != 0 ? 0x10 : 0x00);
        this.set_register(0x08, (req_envelope | req_amplitude));
    }

    set_channel1_amplitude(amplitude, envelope) {
        const min_amplitude = 0;
        const max_amplitude = 15;
        const req_amplitude = AYM_Utils.clamp_int(amplitude, min_amplitude, max_amplitude) | 0;
        const req_envelope  = ((envelope | 0) != 0 ? 0x10 : 0x00);
        this.set_register(0x09, (req_envelope | req_amplitude));
    }

    set_channel2_amplitude(amplitude, envelope) {
        const min_amplitude = 0;
        const max_amplitude = 15;
        const req_amplitude = AYM_Utils.clamp_int(amplitude, min_amplitude, max_amplitude) | 0;
        const req_envelope  = ((envelope | 0) != 0 ? 0x10 : 0x00);
        this.set_register(0x0a, (req_envelope | req_amplitude));
    }

    set_envelope_period(period) {
        const min_period = 0;
        const max_period = 65535;
        const req_period = AYM_Utils.clamp_int(period, min_period, max_period) | 0;
        this.set_register(0x0b, ((req_period >> 0) & 0xff));
        this.set_register(0x0c, ((req_period >> 8) & 0xff));
    }

    set_envelope_shape(shape) {
        this.set_register(0x0d, (shape & 0x0f));
    }

    set_channel0_frequency(frequency) {
        let period = 0;
        if(frequency > 0) {
            period = (this.emulator.master_clock / (16 * frequency));
        }
        this.set_channel0_period(period);
    }

    set_channel1_frequency(frequency) {
        let period = 0;
        if(frequency > 0) {
            period = (this.emulator.master_clock / (16 * frequency));
        }
        this.set_channel1_period(period);
    }

    set_channel2_frequency(frequency) {
        let period = 0;
        if(frequency > 0) {
            period = (this.emulator.master_clock / (16 * frequency));
        }
        this.set_channel2_period(period);
    }

    set_noise_frequency(frequency) {
        let period = 0;
        if(frequency > 0) {
            period = (this.emulator.master_clock / (16 * frequency));
        }
        this.set_noise_period(period);
    }

    set_channel0_sound(enabled) {
        let mixer_configuration = this.get_register(0x07, 0x00);
        if((enabled | 0) != 0) {
            mixer_configuration &= ~0x01;
        }
        else {
            mixer_configuration |=  0x01;
        }
        this.set_register(0x07, mixer_configuration);
    }

    set_channel1_sound(enabled) {
        let mixer_configuration = this.get_register(0x07, 0x00);
        if((enabled | 0) != 0) {
            mixer_configuration &= ~0x02;
        }
        else {
            mixer_configuration |=  0x02;
        }
        this.set_register(0x07, mixer_configuration);
    }

    set_channel2_sound(enabled) {
        let mixer_configuration = this.get_register(0x07, 0x00);
        if((enabled | 0) != 0) {
            mixer_configuration &= ~0x04;
        }
        else {
            mixer_configuration |=  0x04;
        }
        this.set_register(0x07, mixer_configuration);
    }

    set_channel0_noise(enabled) {
        let mixer_configuration = this.get_register(0x07, 0x00);
        if((enabled | 0) != 0) {
            mixer_configuration &= ~0x08;
        }
        else {
            mixer_configuration |=  0x08;
        }
        this.set_register(0x07, mixer_configuration);
    }

    set_channel1_noise(enabled) {
        let mixer_configuration = this.get_register(0x07, 0x00);
        if((enabled | 0) != 0) {
            mixer_configuration &= ~0x10;
        }
        else {
            mixer_configuration |=  0x10;
        }
        this.set_register(0x07, mixer_configuration);
    }

    set_channel2_noise(enabled) {
        let mixer_configuration = this.get_register(0x07, 0x00);
        if((enabled | 0) != 0) {
            mixer_configuration &= ~0x20;
        }
        else {
            mixer_configuration |=  0x20;
        }
        this.set_register(0x07, mixer_configuration);
    }
}

// ---------------------------------------------------------------------------
// AYM_EmulatorAdapterTest
// ---------------------------------------------------------------------------

export class AYM_EmulatorAdapterTest {
    constructor(emulator_adapter) {
        this.chip = emulator_adapter;
    }

    test_sound_only() {
        this.chip.reset();
        this.chip.set_channel0_frequency(330);
        this.chip.set_channel1_frequency(440);
        this.chip.set_channel2_frequency(550);
        this.chip.set_channel0_amplitude(15, false);
        this.chip.set_channel1_amplitude(15, false);
        this.chip.set_channel2_amplitude(15, false);
        this.chip.set_noise_period(0);
        this.chip.set_mixer_configuration(1, 1, 1, 0, 0, 0);
        this.chip.set_envelope_period(0);
        this.chip.set_envelope_shape(0);
    }

    test_sound_with_noise() {
        this.chip.reset();
        this.chip.set_channel0_frequency(330);
        this.chip.set_channel1_frequency(440);
        this.chip.set_channel2_frequency(550);
        this.chip.set_channel0_amplitude(15, false);
        this.chip.set_channel1_amplitude(15, false);
        this.chip.set_channel2_amplitude(15, false);
        this.chip.set_noise_period(7);
        this.chip.set_mixer_configuration(1, 1, 1, 1, 1, 1);
        this.chip.set_envelope_period(0);
        this.chip.set_envelope_shape(0);
    }

    test_sound_with_noise_and_envelope() {
        this.chip.reset();
        this.chip.set_channel0_frequency(220);
        this.chip.set_channel1_frequency(330);
        this.chip.set_channel2_frequency(440);
        this.chip.set_channel0_amplitude(0, true);
        this.chip.set_channel1_amplitude(0, true);
        this.chip.set_channel2_amplitude(0, true);
        this.chip.set_noise_period(7);
        this.chip.set_mixer_configuration(1, 1, 1, 1, 1, 1);
        this.chip.set_envelope_period(4096);
        this.chip.set_envelope_shape(14);
    }

    set_test(test) {
        switch(test) {
            case 'sound-only':
                this.test_sound_only();
                break;
            case 'sound-with-noise':
                this.test_sound_with_noise();
                break;
            case 'sound-with-noise-and-envelope':
                this.test_sound_with_noise_and_envelope();
                break;
            default:
                break;
        }
    }
}

// ---------------------------------------------------------------------------
// End-Of-File
// ---------------------------------------------------------------------------
