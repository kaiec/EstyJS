/*
 * aym-synth-model.js - Copyright (c) 2001-2025 - Olivier Poncet
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
// Some useful constants
// ---------------------------------------------------------------------------

const AYM_CHIP0 = 0;
const AYM_CHIP1 = 1;

// ---------------------------------------------------------------------------
// AYM_SynthModel
// ---------------------------------------------------------------------------

export class AYM_SynthModel {
    constructor(controller) {
        this.controller = controller;
        this.waContext  = null;
        this.waAnalyser = null;
        this.waGain     = null;
        this.waWorklet0 = null;
        this.waWorklet1 = null;
    }

    async powerOn() {
        await this.createContext();
        await this.createAnalyser();
        await this.createGain();
        await this.createWorklets();
        await this.controller.onInputGain();
        await this.sendState();
    }

    async powerOff() {
        await this.destroyWorklets();
        await this.destroyGain();
        await this.destroyAnalyser();
        await this.destroyContext();
    }

    async createContext() {
        if(this.waContext == null) {
            this.waContext = new AudioContext();
            await this.waContext.audioWorklet.addModule('/vendor/aym-js/js/aym-synth-processor.js');
        }
    }

    async destroyContext() {
        if(this.waContext != null) {
            await this.waContext.close();
            this.waContext = null;
        }
    }

    async createAnalyser() {
        if(this.waAnalyser == null) {
            this.waAnalyser = this.waContext.createAnalyser();
            this.waAnalyser.connect(this.waContext.destination);
        }
    }

    async destroyAnalyser() {
        if(this.waAnalyser != null) {
            this.waAnalyser.disconnect();
            this.waAnalyser = null;
        }
    }

    async createGain() {
        if(this.waGain == null) {
            this.waGain = new GainNode(this.waContext);
            this.waGain.connect(this.waAnalyser);
        }
    }

    async destroyGain() {
        if(this.waGain != null) {
            this.waGain.disconnect();
            this.waGain = null;
        }
    }

    async createWorklets() {
        const audioWorkletProcessorOptions = {
            unused: null
        };
        const audioWorkletNodeOptions = {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            processorOptions: audioWorkletProcessorOptions,
        };
        if(this.waWorklet0 == null) {
            this.waWorklet0 = new AudioWorkletNode(this.waContext, 'aym-synth-processor', audioWorkletNodeOptions);
            this.waWorklet0.connect(this.waGain);
            this.waWorklet0.port.onmessage = (message) => {
                this.recvMessage(AYM_CHIP0, message);
            };
        }
        if(this.waWorklet1 == null) {
            this.waWorklet1 = new AudioWorkletNode(this.waContext, 'aym-synth-processor', audioWorkletNodeOptions);
            this.waWorklet1.connect(this.waGain);
            this.waWorklet1.port.onmessage = (message) => {
                this.recvMessage(AYM_CHIP1, message);
            };
        }
    }

    async destroyWorklets() {
        if(this.waWorklet0 != null) {
            this.waWorklet0.disconnect();
            this.waWorklet0 = null;
        }
        if(this.waWorklet1 != null) {
            this.waWorklet1.disconnect();
            this.waWorklet1 = null;
        }
    }

    isPowered() {
        if((this.waWorklet0 != null) && (this.waWorklet1 != null)) {
            return true;
        }
        return false;
    }

    isNotPowered() {
        if((this.waWorklet0 == null) || (this.waWorklet1 == null)) {
            return true;
        }
        return false;
    }

    sendMessage(chip_id = -1, type = null, data = null) {
        switch(chip_id) {
            case AYM_CHIP0:
                if(this.waWorklet0 != null) {
                    this.waWorklet0.port.postMessage({ message_type: type, message_data: data });
                }
                break;
            case AYM_CHIP1:
                if(this.waWorklet1 != null) {
                    this.waWorklet1.port.postMessage({ message_type: type, message_data: data });
                }
                break;
            default:
                break;
        }
    }

    recvMessage(chip_id, message) {
        const payload = message.data;

        switch(payload.message_type) {
            case 'Paused':
                this.controller.recvPaused(chip_id);
                break;
            case 'Resumed':
                this.controller.recvResumed(chip_id);
                break;
            case 'MutedA':
                this.controller.recvMutedA(chip_id);
                break;
            case 'UnmutedA':
                this.controller.recvUnmutedA(chip_id);
                break;
            case 'MutedB':
                this.controller.recvMutedB(chip_id);
                break;
            case 'UnmutedB':
                this.controller.recvUnmutedB(chip_id);
                break;
            case 'MutedC':
                this.controller.recvMutedC(chip_id);
                break;
            case 'UnmutedC':
                this.controller.recvUnmutedC(chip_id);
                break;
            default:
                break;
        }
    }

    sendState() {
        this.sendMessage(AYM_CHIP0, 'State');
        this.sendMessage(AYM_CHIP1, 'State');
    }

    sendReset() {
        this.sendMessage(AYM_CHIP0, 'Reset');
        this.sendMessage(AYM_CHIP1, 'Reset');
    }

    sendPause() {
        this.sendMessage(AYM_CHIP0, 'Pause');
        this.sendMessage(AYM_CHIP1, 'Pause');
    }

    sendMuteA() {
        this.sendMessage(AYM_CHIP0, 'MuteA');
    }

    sendMuteB() {
        this.sendMessage(AYM_CHIP0, 'MuteB');
    }

    sendMuteC() {
        this.sendMessage(AYM_CHIP0, 'MuteC');
    }

    sendMuteD() {
        this.sendMessage(AYM_CHIP1, 'MuteA');
    }

    sendMuteE() {
        this.sendMessage(AYM_CHIP1, 'MuteB');
    }

    sendMuteF() {
        this.sendMessage(AYM_CHIP1, 'MuteC');
    }

    sendNoteOn(channel, frequency, amplitude) {
        const chip_id = ((channel / 3) | 0);
        const chan_id = ((channel % 3) | 0);

        this.sendMessage(chip_id, 'NoteOn', { channel: chan_id, frequency: frequency, amplitude: amplitude });
    }

    sendNoteOff(channel, frequency, amplitude) {
        const chip_id = ((channel / 3) | 0);
        const chan_id = ((channel % 3) | 0);

        this.sendMessage(chip_id, 'NoteOff', { channel: chan_id, frequency: frequency, amplitude: amplitude });
    }

    setGain(gain) {
        if(this.waGain != null) {
            const chip_count = 2.0;
            const gain_val   = gain / chip_count;
            const gain_min   = 0.0;
            const gain_max   = 1.0 / chip_count;
            this.waGain.gain.value = AYM_Utils.clamp_flt(gain_val, gain_min, gain_max);
        }
    }
}

// ---------------------------------------------------------------------------
// End-Of-File
// ---------------------------------------------------------------------------
