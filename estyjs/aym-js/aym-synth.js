/*
 * aym-synth.js - Copyright (c) 2001-2025 - Olivier Poncet
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

import { AYM_SynthModel } from './aym-synth-model.js';
import { AYM_SynthView  } from './aym-synth-view.js';
import { AYM_SynthMIDI  } from './aym-synth-midi.js';

// ---------------------------------------------------------------------------
// AYM_Synth
// ---------------------------------------------------------------------------

export class AYM_Synth {
    constructor() {
        this.model = new AYM_SynthModel(this);
        this.view  = new AYM_SynthView(this);
        this.midi  = new AYM_SynthMIDI(this);
        this.note_to_voice = new Int8Array(127)
        this.note_to_voice.fill(-1);
        this.voice_to_note = new Int8Array(6)
        this.voice_to_note.fill(-1);
    }

    async onLoadWindow() {
        this.view.bind();
    }

    async onInputGain() {
        const gain = this.view.getGainValue();
        this.model.setGain(gain);
    }

    async onClickChip0() {
        /* do nothing */
    }

    async onClickMuteA() {
        this.model.sendMuteA();
    }

    async onClickMuteB() {
        this.model.sendMuteB();
    }

    async onClickMuteC() {
        this.model.sendMuteC();
    }

    async onClickChip1() {
        /* do nothing */
    }

    async onClickMuteD() {
        this.model.sendMuteD();
    }

    async onClickMuteE() {
        this.model.sendMuteE();
    }

    async onClickMuteF() {
        this.model.sendMuteF();
    }

    async onClickPower() {
        if(this.model.isNotPowered()) {
            await this.model.powerOn();
            await this.view.powerOn();
            await this.midi.powerOn();
        }
        else {
            await this.midi.powerOff();
            await this.view.powerOff();
            await this.model.powerOff();
        }
    }

    async onClickReset() {
        this.note_to_voice.fill(-1);
        this.voice_to_note.fill(-1);
        this.model.sendReset();
    }

    async onClickPause() {
        this.model.sendPause();
    }

    async onClickAnalyse() {
        this.view.renderFFT();
    }

    async recvPaused(chip_id) {
        this.view.setPaused(chip_id);
    }

    async recvResumed(chip_id) {
        this.view.setResumed(chip_id);
    }

    async recvMutedA(chip_id) {
        this.view.setMutedA(chip_id);
    }

    async recvUnmutedA(chip_id) {
        this.view.setUnmutedA(chip_id);
    }

    async recvMutedB(chip_id) {
        this.view.setMutedB(chip_id);
    }

    async recvUnmutedB(chip_id) {
        this.view.setUnmutedB(chip_id);
    }

    async recvMutedC(chip_id) {
        this.view.setMutedC(chip_id);
    }

    async recvUnmutedC(chip_id) {
        this.view.setUnmutedC(chip_id);
    }

    midiNoteToVoice(note) {
        const voice = this.note_to_voice[note];

        if(voice < 0) {
            return this.voice_to_note.findIndex((entry) => {
                return entry == -1;
            });
        }
        return voice;
    }

    midiNoteOn(channel, note, velocity) {
        const voice = this.midiNoteToVoice(note);

        if(voice >= 0) {
            this.note_to_voice[note]  = voice;
            this.voice_to_note[voice] = note;
            const frequency = this.midi.convertNoteToFrequency(note);
            const amplitude = this.midi.convertVelocityToAmplitude(velocity);
            this.model.sendNoteOn(voice, ((frequency | 0) >> 0), ((amplitude | 0) >> 3));
        }
    }

    midiNoteOff(channel, note, velocity) {
        const voice = this.midiNoteToVoice(note);

        if(voice >= 0) {
            this.note_to_voice[note]  = -1;
            this.voice_to_note[voice] = -1;
            const frequency = 0;
            const amplitude = 0;
            this.model.sendNoteOff(voice, ((frequency | 0) >> 0), ((amplitude | 0) >> 3));
        }
    }

    midiIsNotSupported() {
        this.view.setDisplay('Web MIDI is not supported or authorized!');
    }
}

// ---------------------------------------------------------------------------
// End-Of-File
// ---------------------------------------------------------------------------
