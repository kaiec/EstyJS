/*
 * aym-player-model.js - Copyright (c) 2001-2025 - Olivier Poncet
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
// AYM_PlayerModel
// ---------------------------------------------------------------------------

export class AYM_PlayerModel {
    constructor(controller) {
        this.controller = controller;
        this.waContext  = null;
        this.waAnalyser = null;
        this.waGain     = null;
        this.waWorklet  = null;
    }

    async powerOn() {
        await this.createContext();
        await this.createAnalyser();
        await this.createGain();
        await this.createWorklet();
        await this.controller.onInputGain();
        await this.sendState();
    }

    async powerOff() {
        await this.destroyWorklet();
        await this.destroyGain();
        await this.destroyAnalyser();
        await this.destroyContext();
    }

    async createContext() {
        if(this.waContext == null) {
            this.waContext = new AudioContext();
            await this.waContext.audioWorklet.addModule('/vendor/aym-js/js/aym-player-processor.js');
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

    async createWorklet() {
        if(this.waWorklet == null) {
            const audioWorkletProcessorOptions = {
                unused: null
            };
            const audioWorkletNodeOptions = {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2],
                processorOptions: audioWorkletProcessorOptions,
            };
            this.waWorklet = new AudioWorkletNode(this.waContext, 'aym-player-processor', audioWorkletNodeOptions);
            this.waWorklet.connect(this.waGain);
            this.waWorklet.port.onmessage = (message) => {
                this.recvMessage(message);
            };
        }
    }

    async destroyWorklet() {
        if(this.waWorklet != null) {
            this.waWorklet.disconnect();
            this.waWorklet = null;
        }
    }

    isPowered() {
        if(this.waWorklet != null) {
            return true;
        }
        return false;
    }

    isNotPowered() {
        if(this.waWorklet == null) {
            return true;
        }
        return false;
    }

    sendMessage(type = null, data = null) {
        if(this.waWorklet != null) {
            this.waWorklet.port.postMessage({ message_type: type, message_data: data });
        }
    }

    recvMessage(message) {
        const payload = message.data;

        switch(payload.message_type) {
            case 'Paused':
                this.controller.recvPaused();
                break;
            case 'Resumed':
                this.controller.recvResumed();
                break;
            case 'MutedA':
                this.controller.recvMutedA();
                break;
            case 'UnmutedA':
                this.controller.recvUnmutedA();
                break;
            case 'MutedB':
                this.controller.recvMutedB();
                break;
            case 'UnmutedB':
                this.controller.recvUnmutedB();
                break;
            case 'MutedC':
                this.controller.recvMutedC();
                break;
            case 'UnmutedC':
                this.controller.recvUnmutedC();
                break;
            case 'Title':
                this.controller.recvTitle(payload.message_data);
                break;
            case 'Seek':
                this.controller.recvSeek(payload.message_data);
                break;
            case 'Playing':
                this.controller.recvPlaying();
                break;
            case 'Stopped':
                this.controller.recvStopped();
                break;
            case 'Changed':
                this.controller.recvChanged();
                break;
            case 'Unchanged':
                this.controller.recvUnchanged();
                break;
            default:
                break;
        }
    }

    sendState() {
        this.sendMessage('State');
    }

    sendReset() {
        this.sendMessage('Reset');
    }

    sendPause() {
        this.sendMessage('Pause');
    }

    sendMuteA() {
        this.sendMessage('MuteA');
    }

    sendMuteB() {
        this.sendMessage('MuteB');
    }

    sendMuteC() {
        this.sendMessage('MuteC');
    }

    sendPlay() {
        this.sendMessage('Play');
    }

    sendStop() {
        this.sendMessage('Stop');
    }

    sendPrev() {
        this.sendMessage('Prev');
    }

    sendNext() {
        this.sendMessage('Next');
    }

    sendSeek(seek) {
        this.sendMessage('Seek', seek);
    }

    setGain(gain) {
        if(this.waGain != null) {
            this.waGain.gain.value = AYM_Utils.clamp_flt(gain, 0.0, 1.0);
        }
    }
}

// ---------------------------------------------------------------------------
// End-Of-File
// ---------------------------------------------------------------------------
