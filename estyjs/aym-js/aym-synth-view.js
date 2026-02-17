/*
 * aym-synth-view.js - Copyright (c) 2001-2025 - Olivier Poncet
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
// Some useful constants
// ---------------------------------------------------------------------------

const AYM_CHIP0 = 0;
const AYM_CHIP1 = 1;

// ---------------------------------------------------------------------------
// AYM_SynthView
// ---------------------------------------------------------------------------

export class AYM_SynthView {
    constructor(controller) {
        this.controller = controller;
        this.aymDisplay = null;
        this.aymGain    = null;
        this.aymChip0   = null;
        this.aymMuteA   = null;
        this.aymMuteB   = null;
        this.aymMuteC   = null;
        this.aymChip1   = null;
        this.aymMuteD   = null;
        this.aymMuteE   = null;
        this.aymMuteF   = null;
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
        this.enableGain();
        this.enableChip0();
        this.enableMuteA();
        this.enableMuteB();
        this.enableMuteC();
        this.enableChip1();
        this.enableMuteD();
        this.enableMuteE();
        this.enableMuteF();
        this.enableReset();
        this.enablePause();
        this.enableAnalyse();
        this.enableCanvas();
        this.setDisplay('AYM·Synth is On');
    }

    async powerOff() {
        this.disableCanvas();
        this.disableAnalyse();
        this.disablePause();
        this.disableReset();
        this.disableMuteF();
        this.disableMuteE();
        this.disableMuteD();
        this.disableChip1();
        this.disableMuteC();
        this.disableMuteB();
        this.disableMuteA();
        this.disableChip0();
        this.disableGain();
        this.setDisplay('AYM·Synth is Off');
    }

    bind() {
        this.bindDisplay();
        this.bindGain();
        this.bindChip0();
        this.bindMuteA();
        this.bindMuteB();
        this.bindMuteC();
        this.bindChip1();
        this.bindMuteD();
        this.bindMuteE();
        this.bindMuteF();
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

    bindChip1() {
        if(this.aymChip1 == null) {
            this.aymChip1 = $('#aymChip1');
            this.aymChip1.disabled = true;
            this.aymChip1.addEventListener('click', async () => { await this.controller.onClickChip1(); });
        }
    }

    bindMuteD() {
        if(this.aymMuteD == null) {
            this.aymMuteD = $('#aymMuteD');
            this.aymMuteD.disabled = true;
            this.aymMuteD.addEventListener('click', async () => { await this.controller.onClickMuteD(); });
        }
    }

    bindMuteE() {
        if(this.aymMuteE == null) {
            this.aymMuteE = $('#aymMuteE');
            this.aymMuteE.disabled = true;
            this.aymMuteE.addEventListener('click', async () => { await this.controller.onClickMuteE(); });
        }
    }

    bindMuteF() {
        if(this.aymMuteF == null) {
            this.aymMuteF = $('#aymMuteF');
            this.aymMuteF.disabled = true;
            this.aymMuteF.addEventListener('click', async () => { await this.controller.onClickMuteF(); });
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

    enableChip1() {
        AYM_Utils.enableElement(this.aymChip1);
    }

    disableChip1() {
        AYM_Utils.disableElement(this.aymChip1);
    }

    enableMuteD() {
        AYM_Utils.enableElement(this.aymMuteD);
    }

    disableMuteD() {
        AYM_Utils.disableElement(this.aymMuteD);
    }

    enableMuteE() {
        AYM_Utils.enableElement(this.aymMuteE);
    }

    disableMuteE() {
        AYM_Utils.disableElement(this.aymMuteE);
    }

    enableMuteF() {
        AYM_Utils.enableElement(this.aymMuteF);
    }

    disableMuteF() {
        AYM_Utils.disableElement(this.aymMuteF);
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

    setPaused(chip_id) {
        if(this.aymPause != null) {
            this.aymPause.className = 'is-toggled';
        }
        if((chip_id == AYM_CHIP0) && (this.aymChip0 != null)) {
            this.aymChip0.className = 'is-toggled';
        }
        if((chip_id == AYM_CHIP1) && (this.aymChip1 != null)) {
            this.aymChip1.className = 'is-toggled';
        }
    }

    setResumed(chip_id) {
        if(this.aymPause != null) {
            this.aymPause.className = '';
        }
        if((chip_id == AYM_CHIP0) && (this.aymChip0 != null)) {
            this.aymChip0.className = '';
        }
        if((chip_id == AYM_CHIP1) && (this.aymChip1 != null)) {
            this.aymChip1.className = '';
        }
    }

    setMutedA(chip_id) {
        if((chip_id == AYM_CHIP0) && (this.aymMuteA != null)) {
            this.aymMuteA.className = 'is-toggled';
        }
        if((chip_id == AYM_CHIP1) && (this.aymMuteD != null)) {
            this.aymMuteD.className = 'is-toggled';
        }
    }

    setUnmutedA(chip_id) {
        if((chip_id == AYM_CHIP0) && (this.aymMuteA != null)) {
            this.aymMuteA.className = '';
        }
        if((chip_id == AYM_CHIP1) && (this.aymMuteD != null)) {
            this.aymMuteD.className = '';
        }
    }

    setMutedB(chip_id) {
        if((chip_id == AYM_CHIP0) && (this.aymMuteB != null)) {
            this.aymMuteB.className = 'is-toggled';
        }
        if((chip_id == AYM_CHIP1) && (this.aymMuteE != null)) {
            this.aymMuteE.className = 'is-toggled';
        }
    }

    setUnmutedB(chip_id) {
        if((chip_id == AYM_CHIP0) && (this.aymMuteB != null)) {
            this.aymMuteB.className = '';
        }
        if((chip_id == AYM_CHIP1) && (this.aymMuteE != null)) {
            this.aymMuteE.className = '';
        }
    }

    setMutedC(chip_id) {
        if((chip_id == AYM_CHIP0) && (this.aymMuteC != null)) {
            this.aymMuteC.className = 'is-toggled';
        }
        if((chip_id == AYM_CHIP1) && (this.aymMuteF != null)) {
            this.aymMuteF.className = 'is-toggled';
        }
    }

    setUnmutedC(chip_id) {
        if((chip_id == AYM_CHIP0) && (this.aymMuteC != null)) {
            this.aymMuteC.className = '';
        }
        if((chip_id == AYM_CHIP1) && (this.aymMuteF != null)) {
            this.aymMuteF.className = '';
        }
    }

    setDisplay(message) {
        AYM_Utils.setInnerText(this.aymDisplay, message);
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
