/*
 * aym-player-view.js - Copyright (c) 2001-2025 - Olivier Poncet
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

import { AYM_Utils, $ } from './aym-utils.js';

// ---------------------------------------------------------------------------
// AYM_PlayerView
// ---------------------------------------------------------------------------

export class AYM_PlayerView {
    constructor(controller) {
        this.controller = controller;
        this.aymDisplay = null;
        this.aymPlay    = null;
        this.aymStop    = null;
        this.aymPrev    = null;
        this.aymNext    = null;
        this.aymSeek    = null;
        this.aymGain    = null;
        this.aymChip0   = null;
        this.aymMuteA   = null;
        this.aymMuteB   = null;
        this.aymMuteC   = null;
        this.aymPower   = null;
        this.aymReset   = null;
        this.aymPause   = null;
        this.aymAnalyse = null;
        this.aymCanvas  = null;
        this.aymContext = null;
        this.fftData    = null;
        window.addEventListener('load', async () => { await this.controller.onLoadWindow(); });
    }

    async powerOn() {
        this.enablePlay();
        this.disableStop();
        this.enablePrev();
        this.enableNext();
        this.enableSeek();
        this.enableGain();
        this.enableChip0();
        this.enableMuteA();
        this.enableMuteB();
        this.enableMuteC();
        this.enableReset();
        this.enablePause();
        this.enableAnalyse();
        this.enableCanvas();
        this.setDisplay('AYM·Player is On');
    }

    async powerOff() {
        this.disableCanvas();
        this.disableAnalyse();
        this.disablePause();
        this.disableReset();
        this.disableMuteC();
        this.disableMuteB();
        this.disableMuteA();
        this.disableChip0();
        this.disableGain();
        this.disableSeek();
        this.disableNext();
        this.disablePrev();
        this.disableStop();
        this.disablePlay();
        this.setDisplay('AYM·Player is Off');
    }

    bind() {
        this.bindDisplay();
        this.bindPlay();
        this.bindStop();
        this.bindPrev();
        this.bindNext();
        this.bindSeek();
        this.bindGain();
        this.bindChip0();
        this.bindMuteA();
        this.bindMuteB();
        this.bindMuteC();
        this.bindPower();
        this.bindReset();
        this.bindPause();
        this.bindAnalyse();
        this.bindCanvas();
    }

    bindDisplay() {
        if(this.aymDisplay == null) {
            this.aymDisplay = $('#aymDisplay');
        }
    }

    bindPlay() {
        if(this.aymPlay == null) {
            this.aymPlay = $('#aymPlay');
            this.aymPlay.disabled = true;
            this.aymPlay.addEventListener('click', async () => { await this.controller.onClickPlay(); });
        }
    }

    bindStop() {
        if(this.aymStop == null) {
            this.aymStop = $('#aymStop');
            this.aymStop.disabled = true;
            this.aymStop.addEventListener('click', async () => { await this.controller.onClickStop(); });
        }
    }

    bindPrev() {
        if(this.aymPrev == null) {
            this.aymPrev = $('#aymPrev');
            this.aymPrev.disabled = true;
            this.aymPrev.addEventListener('click', async () => { await this.controller.onClickPrev(); });
        }
    }

    bindNext() {
        if(this.aymNext == null) {
            this.aymNext = $('#aymNext');
            this.aymNext.disabled = true;
            this.aymNext.addEventListener('click', async () => { await this.controller.onClickNext(); });
        }
    }

    bindSeek() {
        if(this.aymSeek == null) {
            this.aymSeek = $('#aymSeek');
            this.aymSeek.disabled = true;
            this.aymSeek.min = 0;
            this.aymSeek.max = 1000;
            this.aymSeek.value = 0;
            this.aymSeek.addEventListener('input', async () => { await this.controller.onInputSeek(); });
        }
    }

    bindGain() {
        if(this.aymGain == null) {
            this.aymGain = $('#aymGain');
            this.aymGain.disabled = true;
            this.aymGain.min = 0;
            this.aymGain.max = 1000;
            this.aymGain.value = 500;
            this.aymGain.addEventListener('input', async () => { await this.controller.onInputGain(); });
        }
    }

    bindChip0() {
        if(this.aymChip0 == null) {
            this.aymChip0 = $('#aymChip0');
            this.aymChip0.disabled = true;
            this.aymChip0.addEventListener('click', async () => { await this.controller.onClickChip0(); });
        }
    }

    bindMuteA() {
        if(this.aymMuteA == null) {
            this.aymMuteA = $('#aymMuteA');
            this.aymMuteA.disabled = true;
            this.aymMuteA.addEventListener('click', async () => { await this.controller.onClickMuteA(); });
        }
    }

    bindMuteB() {
        if(this.aymMuteB == null) {
            this.aymMuteB = $('#aymMuteB');
            this.aymMuteB.disabled = true;
            this.aymMuteB.addEventListener('click', async () => { await this.controller.onClickMuteB(); });
        }
    }

    bindMuteC() {
        if(this.aymMuteC == null) {
            this.aymMuteC = $('#aymMuteC');
            this.aymMuteC.disabled = true;
            this.aymMuteC.addEventListener('click', async () => { await this.controller.onClickMuteC(); });
        }
    }

    bindPower() {
        if(this.aymPower == null) {
            this.aymPower = $('#aymPower');
            this.aymPower.disabled = false;
            this.aymPower.addEventListener('click', async () => { await this.controller.onClickPower(); });
        }
    }

    bindReset() {
        if(this.aymReset == null) {
            this.aymReset = $('#aymReset');
            this.aymReset.disabled = true;
            this.aymReset.addEventListener('click', async () => { await this.controller.onClickReset(); });
        }
    }

    bindPause() {
        if(this.aymPause == null) {
            this.aymPause = $('#aymPause');
            this.aymPause.disabled = true;
            this.aymPause.addEventListener('click', async () => { await this.controller.onClickPause(); });
        }
    }

    bindAnalyse() {
        if(this.aymAnalyse == null) {
            this.aymAnalyse = $('#aymAnalyse');
            this.aymAnalyse.disabled = true;
            this.aymAnalyse.addEventListener('click', async () => { await this.controller.onClickAnalyse(); });
        }
    }

    bindCanvas() {
        if(this.aymCanvas == null) {
            this.aymCanvas = $('#aymCanvas');
            this.aymCanvas.disabled = true;
            this.aymContext = this.aymCanvas.getContext('2d');
        }
    }

    enablePlay() {
        AYM_Utils.enableElement(this.aymPlay);
    }

    disablePlay() {
        AYM_Utils.disableElement(this.aymPlay);
    }

    enableStop() {
        AYM_Utils.enableElement(this.aymStop);
    }

    disableStop() {
        AYM_Utils.disableElement(this.aymStop);
    }

    enablePrev() {
        AYM_Utils.enableElement(this.aymPrev);
    }

    disablePrev() {
        AYM_Utils.disableElement(this.aymPrev);
    }

    enableNext() {
        AYM_Utils.enableElement(this.aymNext);
    }

    disableNext() {
        AYM_Utils.disableElement(this.aymNext);
    }

    enableSeek() {
        AYM_Utils.enableElement(this.aymSeek);
    }

    disableSeek() {
        AYM_Utils.disableElement(this.aymSeek);
    }

    enableGain() {
        AYM_Utils.enableElement(this.aymGain);
    }

    disableGain() {
        AYM_Utils.disableElement(this.aymGain);
    }

    enableChip0() {
        AYM_Utils.enableElement(this.aymChip0);
    }

    disableChip0() {
        AYM_Utils.disableElement(this.aymChip0);
    }

    enableMuteA() {
        AYM_Utils.enableElement(this.aymMuteA);
    }

    disableMuteA() {
        AYM_Utils.disableElement(this.aymMuteA);
    }

    enableMuteB() {
        AYM_Utils.enableElement(this.aymMuteB);
    }

    disableMuteB() {
        AYM_Utils.disableElement(this.aymMuteB);
    }

    enableMuteC() {
        AYM_Utils.enableElement(this.aymMuteC);
    }

    disableMuteC() {
        AYM_Utils.disableElement(this.aymMuteC);
    }

    enablePower() {
        AYM_Utils.enableElement(this.aymPower);
    }

    disablePower() {
        AYM_Utils.disableElement(this.aymPower);
    }

    enableReset() {
        AYM_Utils.enableElement(this.aymReset);
    }

    disableReset() {
        AYM_Utils.disableElement(this.aymReset);
    }

    enablePause() {
        AYM_Utils.enableElement(this.aymPause);
    }

    disablePause() {
        AYM_Utils.disableElement(this.aymPause);
    }

    enableAnalyse() {
        AYM_Utils.enableElement(this.aymAnalyse);
    }

    disableAnalyse() {
        AYM_Utils.uncheckElement(this.aymAnalyse);
        AYM_Utils.disableElement(this.aymAnalyse);
    }

    enableCanvas() {
        AYM_Utils.enableElement(this.aymCanvas);
    }

    disableCanvas() {
        AYM_Utils.disableElement(this.aymCanvas);
    }

    setPlaying() {
        this.disablePlay();
        this.enableStop();
    }

    setStopped() {
        this.disableStop();
        this.enablePlay();
    }

    setChanged() {
        /* do nothing */
    }

    setUnchanged() {
        /* do nothing */
    }

    setMutedA() {
        if(this.aymMuteA != null) {
            this.aymMuteA.className = 'is-toggled';
        }
    }

    setUnmutedA() {
        if(this.aymMuteA != null) {
            this.aymMuteA.className = '';
        }
    }

    setMutedB() {
        if(this.aymMuteB != null) {
            this.aymMuteB.className = 'is-toggled';
        }
    }

    setUnmutedB() {
        if(this.aymMuteB != null) {
            this.aymMuteB.className = '';
        }
    }

    setMutedC() {
        if(this.aymMuteC != null) {
            this.aymMuteC.className = 'is-toggled';
        }
    }

    setUnmutedC() {
        if(this.aymMuteC != null) {
            this.aymMuteC.className = '';
        }
    }

    setPaused() {
        if(this.aymPause != null) {
            this.aymPause.className = 'is-toggled';
        }
        if(this.aymChip0 != null) {
            this.aymChip0.className = 'is-toggled';
        }
    }

    setResumed() {
        if(this.aymPause != null) {
            this.aymPause.className = '';
        }
        if(this.aymChip0 != null) {
            this.aymChip0.className = '';
        }
    }

    setDisplay(message) {
        AYM_Utils.setInnerText(this.aymDisplay, message);
    }

    setSeekValue(seek) {
        const min = 0;
        const max = 1000;
        const val = ((seek * 1000.0) | 0);

        AYM_Utils.setValue(this.aymSeek, AYM_Utils.clamp_int(val, min, max));
    }

    getSeekValue() {
        const min = 0;
        const max = 1000;
        const val = (this.aymSeek != null ? (this.aymSeek.value | 0) : 0);

        return AYM_Utils.clamp_int(val, min, max) / +max;
    }

    getGainValue() {
        const min = 0;
        const max = 1000;
        const val = (this.aymGain != null ? (this.aymGain.value | 0) : 0);

        return AYM_Utils.clamp_int(val, min, max) / +max;
    }

    renderFFT() {
        const analyser  = this.controller.model.waAnalyser;
        const canvas    = this.aymCanvas;
        const context   = this.aymContext;
        const backcolor = '#e0e0e0';
        const linecolor = '#ff4444';
        const barcolor  = '#ff5555';

        const fftEnabled = () => {
            if(this.aymAnalyse != null) {
                return this.aymAnalyse.checked;
            }
            return false;
        }

        const canRender = () => {
            if((analyser != null) && (canvas != null) && (context != null) && (this.fftData == null)) {
                return true;
            }
            return false;
        }

        const fftRender = () => {
            const canvas_w = canvas.width;
            const canvas_h = canvas.height;

            if(fftEnabled() && (this.fftData != null)) {
                analyser.getByteFrequencyData(this.fftData);
                context.fillStyle = backcolor;
                context.fillRect(0, 0, canvas_w, canvas_h);
                context.fillStyle = barcolor;
                const count = this.fftData.length;
                const bar_w = (canvas_w / count);
                for(let index = 0; index < count; index++) {
                    const value = this.fftData[index];
                    const bar_h = ((value * canvas_h) / 255);
                    const bar_x = (index * bar_w);
                    const bar_y = ((canvas_h - bar_h) / 2);
                    context.fillRect(bar_x, bar_y, bar_w, bar_h);
                }
                context.fillStyle = linecolor;
                context.fillRect(0, (canvas_h / 2) - 1, canvas_w, 2);
                requestAnimationFrame(fftRender);
            }
            else {
                context.clearRect(0, 0, canvas_w, canvas_h);
                this.fftData = null;
            }
        };

        if(fftEnabled() && canRender()) {
            this.fftData = new Uint8Array(analyser.frequencyBinCount);
            requestAnimationFrame(fftRender);
        }
    }
}

// ---------------------------------------------------------------------------
// End-Of-File
// ---------------------------------------------------------------------------
