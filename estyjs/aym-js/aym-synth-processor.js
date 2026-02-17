/*
 * aym-synth-processor.js - Copyright (c) 2001-2025 - Olivier Poncet
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

import { AYM_Emulator        } from './aym-emulator.js';
import { AYM_EmulatorAdapter } from './aym-emulator-adapter.js';

// ---------------------------------------------------------------------------
// Some useful constants
// ---------------------------------------------------------------------------

const AYM_FLAG_RESET = 0x01;
const AYM_FLAG_PAUSE = 0x02;
const AYM_FLAG_MUTEA = 0x10;
const AYM_FLAG_MUTEB = 0x20;
const AYM_FLAG_MUTEC = 0x40;

// ---------------------------------------------------------------------------
// AYM_Processor
// ---------------------------------------------------------------------------

export class AYM_SynthProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.chip         = new AYM_Emulator({});
        this.chip_adapter = new AYM_EmulatorAdapter(this.chip);
        this.chip_flags   = 0;
        this.chip_ticks   = 0;
        this.chip_clock   = 0;
        this.channel_a    = null;
        this.channel_b    = null;
        this.channel_c    = null;
        this.port.onmessage = (message) => {
            this.recvMessage(message);
        };
        this.setChipMasterClock(1000000);
    }

    sendMessage(type = null, data = null) {
        this.port.postMessage({ message_type: type, message_data: data });
    }

    recvMessage(message) {
        const payload = message.data;

        switch(payload.message_type) {
            case 'State':
                this.recvState();
                break;
            case 'Reset':
                this.recvReset();
                break;
            case 'Pause':
                this.recvPause();
                break;
            case 'MuteA':
                this.recvMuteA();
                break;
            case 'MuteB':
                this.recvMuteB();
                break;
            case 'MuteC':
                this.recvMuteC();
                break;
            case 'NoteOn':
                this.recvNoteOn(payload.message_data);
                break;
            case 'NoteOff':
                this.recvNoteOff(payload.message_data);
                break;
            default:
                break;
        }
    }

    recvState() {
        if((this.chip_flags & AYM_FLAG_PAUSE) != 0) {
            this.sendPaused();
        }
        else {
            this.sendResumed();
        }
        if((this.chip_flags & AYM_FLAG_MUTEA) != 0) {
            this.sendMutedA();
        }
        else {
            this.sendUnmutedA();
        }
        if((this.chip_flags & AYM_FLAG_MUTEB) != 0) {
            this.sendMutedB();
        }
        else {
            this.sendUnmutedB();
        }
        if((this.chip_flags & AYM_FLAG_MUTEC) != 0) {
            this.sendMutedC();
        }
        else {
            this.sendUnmutedC();
        }
    }

    recvReset() {
        this.chip_flags |= AYM_FLAG_RESET;
    }

    recvPause() {
        if((this.chip_flags & AYM_FLAG_PAUSE) == 0) {
            this.chip_flags |= AYM_FLAG_PAUSE;
            this.sendPaused();
        }
        else {
            this.chip_flags &= ~AYM_FLAG_PAUSE;
            this.sendResumed();
        }
    }

    recvMuteA() {
        if((this.chip_flags & AYM_FLAG_MUTEA) == 0) {
            this.chip_flags |= AYM_FLAG_MUTEA;
            this.sendMutedA();
        }
        else {
            this.chip_flags &= ~AYM_FLAG_MUTEA;
            this.sendUnmutedA();
        }
    }

    recvMuteB() {
        if((this.chip_flags & AYM_FLAG_MUTEB) == 0) {
            this.chip_flags |= AYM_FLAG_MUTEB;
            this.sendMutedB();
        }
        else {
            this.chip_flags &= ~AYM_FLAG_MUTEB;
            this.sendUnmutedB();
        }
    }

    recvMuteC() {
        if((this.chip_flags & AYM_FLAG_MUTEC) == 0) {
            this.chip_flags |= AYM_FLAG_MUTEC;
            this.sendMutedC();
        }
        else {
            this.chip_flags &= ~AYM_FLAG_MUTEC;
            this.sendUnmutedC();
        }
    }

    recvNoteOn(data) {
        const adapter   = this.chip_adapter;
        const frequency = (data.frequency | 0);
        const amplitude = (data.amplitude | 0);
        switch(data.channel | 0) {
            case 0:
                adapter.set_channel0_frequency(frequency);
                adapter.set_channel0_amplitude(amplitude, false);
                adapter.set_channel0_sound(true);
                adapter.set_channel0_noise(false);
                break;
            case 1:
                adapter.set_channel1_frequency(frequency);
                adapter.set_channel1_amplitude(amplitude, false);
                adapter.set_channel1_sound(true);
                adapter.set_channel1_noise(false);
                break;
            case 2:
                adapter.set_channel2_frequency(frequency);
                adapter.set_channel2_amplitude(amplitude, false);
                adapter.set_channel2_sound(true);
                adapter.set_channel2_noise(false);
                break;
            default:
                break;
        }
    }

    recvNoteOff(data) {
        const adapter   = this.chip_adapter;
        const frequency = (data.frequency & 0);
        const amplitude = (data.amplitude & 0);
        switch(data.channel | 0) {
            case 0:
                adapter.set_channel0_frequency(frequency);
                adapter.set_channel0_amplitude(amplitude, false);
                adapter.set_channel0_sound(false);
                adapter.set_channel0_noise(false);
                break;
            case 1:
                adapter.set_channel1_frequency(frequency);
                adapter.set_channel1_amplitude(amplitude, false);
                adapter.set_channel1_sound(false);
                adapter.set_channel1_noise(false);
                break;
            case 2:
                adapter.set_channel2_frequency(frequency);
                adapter.set_channel2_amplitude(amplitude, false);
                adapter.set_channel2_sound(false);
                adapter.set_channel2_noise(false);
                break;
            default:
                break;
        }
    }

    sendPaused() {
        this.sendMessage('Paused');
    }

    sendResumed() {
        this.sendMessage('Resumed');
    }

    sendMutedA() {
        this.sendMessage('MutedA');
    }

    sendUnmutedA() {
        this.sendMessage('UnmutedA');
    }

    sendMutedB() {
        this.sendMessage('MutedB');
    }

    sendUnmutedB() {
        this.sendMessage('UnmutedB');
    }

    sendMutedC() {
        this.sendMessage('MutedC');
    }

    sendUnmutedC() {
        this.sendMessage('UnmutedC');
    }

    setChipMasterClock(master_clock) {
        this.chip_clock = this.chip.set_master_clock(master_clock);
        this.chip.reset();
    }

    hasReset() {
        if((this.chip_flags & AYM_FLAG_RESET) != 0) {
            this.chip_flags &= ~AYM_FLAG_RESET;
            this.chip_ticks &= 0;
            this.chip.reset();
            return true;
        }
        return false;
    }

    hasPause() {
        if((this.chip_flags & AYM_FLAG_PAUSE) != 0) {
            return true;
        }
        return false;
    }

    process(inputs, outputs, parameters) {
        if(this.hasReset() || this.hasPause()) {
            return true;
        }

        const numSamples = () => {
            if(outputs.length > 0) {
                const output0 = outputs[0];
                if(output0.length > 0) {
                    const channel0 = output0[0];
                    if(channel0.length > 0) {
                        return channel0.length;
                    }
                }
            }
            return 128;
        };

        const getChannelA = (samples) => {
            if((this.channel_a == null) || (this.channel_a.length < samples)) {
                this.channel_a = new Float32Array(samples);
            }
            return this.channel_a;
        };

        const getChannelB = (samples) => {
            if((this.channel_b == null) || (this.channel_b.length < samples)) {
                this.channel_b = new Float32Array(samples);
            }
            return this.channel_b;
        };

        const getChannelC = (samples) => {
            if((this.channel_c == null) || (this.channel_c.length < samples)) {
                this.channel_c = new Float32Array(samples);
            }
            return this.channel_c;
        };

        const samples   = numSamples();
        const channel_a = getChannelA(samples);
        const channel_b = getChannelB(samples);
        const channel_c = getChannelC(samples);

        const mixMono = (channel) => {
            for(let sample = 0; sample < samples; ++sample) {
                let output = 0;
                if((this.chip_flags & AYM_FLAG_MUTEA) == 0) {
                    output += channel_a[sample];
                }
                if((this.chip_flags & AYM_FLAG_MUTEB) == 0) {
                    output += channel_b[sample];
                }
                if((this.chip_flags & AYM_FLAG_MUTEC) == 0) {
                    output += channel_c[sample];
                }
                channel[sample] = (output / 3.0);
            }
        };

        const mixStereo = (channel1, channel2) => {
            for(let sample = 0; sample < samples; ++sample) {
                let output1 = 0;
                let output2 = 0;
                if((this.chip_flags & AYM_FLAG_MUTEA) == 0) {
                    output1 += (channel_a[sample] * 0.75);
                    output2 += (channel_a[sample] * 0.25);
                }
                if((this.chip_flags & AYM_FLAG_MUTEB) == 0) {
                    output1 += (channel_b[sample] * 0.50);
                    output2 += (channel_b[sample] * 0.50);
                }
                if((this.chip_flags & AYM_FLAG_MUTEC) == 0) {
                    output1 += (channel_c[sample] * 0.25);
                    output2 += (channel_c[sample] * 0.75);
                }
                channel1[sample] = (output1 / 1.5);
                channel2[sample] = (output2 / 1.5);
            }
        };

        const clockChip = () => {
            for(let sample = 0; sample < samples; ++sample) {
                channel_a[sample] = this.chip.get_channel0();
                channel_b[sample] = this.chip.get_channel1();
                channel_c[sample] = this.chip.get_channel2();
                while(this.chip_ticks < this.chip_clock) {
                    this.chip_ticks += sampleRate;
                    this.chip.clock();
                }
                this.chip_ticks -= this.chip_clock;
            }
            for(const output of outputs) {
                if(output.length >= 2) {
                    mixStereo(output[0], output[1]);
                    continue;
                }
                if(output.length >= 1) {
                    mixMono(output[0]);
                    continue;
                }
            }
            return true;
        };

        return clockChip();
    }
}

// ---------------------------------------------------------------------------
// register AYM_SynthProcessor
// ---------------------------------------------------------------------------

registerProcessor("aym-synth-processor", AYM_SynthProcessor);

// ---------------------------------------------------------------------------
// End-Of-File
// ---------------------------------------------------------------------------
