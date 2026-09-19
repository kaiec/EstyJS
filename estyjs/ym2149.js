/*

This file is part of EstyJS.

EstyJS is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 2 of the License, or (at your option) any later
version.

EstyJS is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
EstyJS. If not, see <https://www.gnu.org/licenses/>.

Get in touch: https://github.com/kaiec/EstyJS

Current maintainer (since 2024): Kai Eckert
*/

// One correction to the aym-js chip emulation, kept here so that the vendored
// copy in aym-js/ stays byte-identical with upstream and can be replaced
// wholesale when it is updated.
//
// A YM2149 channel is gated by
//
//     (tone high OR tone switched off) AND (noise high OR noise switched off)
//
// so a channel with *both* tone and noise switched off is not silent - it is
// held permanently on, and its output is simply whatever the volume register
// says. That is not an edge case on the ST: it is how games play digitised
// sound. They switch a channel's tone and noise off and then rewrite the volume
// register a few thousand times a second, using it as a 4-bit DAC. Rick
// Dangerous drives all three channels that way for its gun and explosions,
// about forty writes per channel per frame.
//
// aym-js returns 0 for that case, which silences every one of those sounds
// while leaving ordinary music untouched. The three overrides below restate the
// gate above; for every other combination they agree with upstream exactly.
//
// The base class is passed in rather than imported so that this file has no
// imports of its own, which lets the offline renderer in tools/ load it
// alongside the vendored emulator without a module resolver.

// A channel held on sits at a constant level rather than at zero, so playing
// samples this way rides the sound on a DC pedestal - up to full scale if all
// three channels do it at once. The ST's output is AC coupled, which removes
// exactly that; without it the pedestal eats headroom and steps audibly as
// effects start and stop. 15 Hz is well below the lowest note the chip can play.
export function createDcBlocker(sampleRate) {
    const pole = 1 - 2 * Math.PI * 15 / sampleRate;
    let lastIn = 0, lastOut = 0;
    return function (sample) {
        lastOut = sample - lastIn + pole * lastOut;
        lastIn = sample;
        return lastOut;
    };
}

export function createYM2149(AYM_Emulator) {

    // Channels swing between plus and minus the selected level rather than
    // between it and zero, matching the convention the rest of aym-js uses.
    function gated(tonePhase, noisePhase, toneOn, noiseOn, level) {
        const open = (tonePhase != 0 || toneOn == 0) &&
                     (noisePhase != 0 || noiseOn == 0);
        return open ? level : -level;
    }

    return class YM2149 extends AYM_Emulator {

        get_channel0() {
            return gated(this.tone0.phase, this.noise.phase,
                         this.mixer.sound0, this.mixer.noise0,
                         this.dac[this.mixer.level0 & 0x1f]);
        }

        get_channel1() {
            return gated(this.tone1.phase, this.noise.phase,
                         this.mixer.sound1, this.mixer.noise1,
                         this.dac[this.mixer.level1 & 0x1f]);
        }

        get_channel2() {
            return gated(this.tone2.phase, this.noise.phase,
                         this.mixer.sound2, this.mixer.noise2,
                         this.dac[this.mixer.level2 & 0x1f]);
        }
    };
}
