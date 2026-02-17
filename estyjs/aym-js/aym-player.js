/*
 * aym-player.js - Copyright (c) 2001-2025 - Olivier Poncet
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

import { AYM_PlayerModel } from './aym-player-model.js';
import { AYM_PlayerView  } from './aym-player-view.js';

// ---------------------------------------------------------------------------
// AYM_Player
// ---------------------------------------------------------------------------

export class AYM_Player {
    constructor() {
        this.model = new AYM_PlayerModel(this);
        this.view  = new AYM_PlayerView(this);
    }

    async onLoadWindow() {
        this.view.bind();
    }

    async onClickPlay() {
        this.model.sendPlay();
    }

    async onClickStop() {
        this.model.sendStop();
    }

    async onClickPrev() {
        this.model.sendPrev();
    }

    async onClickNext() {
        this.model.sendNext();
    }

    async onInputSeek() {
        const seek = this.view.getSeekValue();
        this.model.sendSeek(seek);
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

    async onClickPower() {
        if(this.model.isNotPowered()) {
            await this.model.powerOn();
            await this.view.powerOn();
        }
        else {
            await this.view.powerOff();
            await this.model.powerOff();
        }
    }

    async onClickReset() {
        this.model.sendReset();
    }

    async onClickPause() {
        this.model.sendPause();
    }

    async onClickAnalyse() {
        this.view.renderFFT();
    }

    async recvTitle(title) {
        this.view.setDisplay(title);
    }

    async recvSeek(seek) {
        this.view.setSeekValue(seek);
    }

    async recvPlaying() {
        this.view.setPlaying();
    }

    async recvStopped() {
        this.view.setStopped();
    }

    async recvChanged() {
        this.view.setChanged();
    }

    async recvUnchanged() {
        this.view.setUnchanged();
    }

    async recvPaused() {
        this.view.setPaused();
    }

    async recvResumed() {
        this.view.setResumed();
    }

    async recvMutedA() {
        this.view.setMutedA();
    }

    async recvUnmutedA() {
        this.view.setUnmutedA();
    }

    async recvMutedB() {
        this.view.setMutedB();
    }

    async recvUnmutedB() {
        this.view.setUnmutedB();
    }

    async recvMutedC() {
        this.view.setMutedC();
    }

    async recvUnmutedC() {
        this.view.setUnmutedC();
    }
}

// ---------------------------------------------------------------------------
// End-Of-File
// ---------------------------------------------------------------------------
