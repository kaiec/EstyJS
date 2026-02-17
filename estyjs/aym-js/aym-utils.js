/*
 * aym-utils.js - Copyright (c) 2001-2025 - Olivier Poncet
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
// AYM_Utils
// ---------------------------------------------------------------------------

export class AYM_Utils {
    static log(label, value) {
        console.log(label, value);
    }

    static clamp_flt(val, min, max) {
        const flt_val = +val;
        const flt_min = +min;
        const flt_max = +max;
        if(flt_val < flt_min) {
            return flt_min;
        }
        if(flt_val > flt_max) {
            return flt_max;
        }
        return flt_val;
    }

    static clamp_int(val, min, max) {
        const int_val = (val | 0);
        const int_min = (min | 0);
        const int_max = (max | 0);
        if(int_val < int_min) {
            return int_min;
        }
        if(int_val > int_max) {
            return int_max;
        }
        return int_val;
    }

    static sleep(delay) {
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    static random() {
        return ((2.0 * Math.random()) - 1.0);
    }

    static getElementById(id, required = true) {
        const element = document.getElementById(id);
        if((required != false) && (element == null)) {
            throw new Error('element <' + id + '> not found');
        }
        return element;
    }

    static getElementsByName(name, required = true) {
        const elements = document.getElementsByName(name);
        if((required != false) && ((elements == null) || (elements.length == 0))) {
            throw new Error('elements <' + name + '> not found');
        }
        return elements;
    }

    static getElementsByClassName(name, required = true) {
        const elements = document.getElementsByClassName(name);
        if((required != false) && ((elements == null) || (elements.length == 0))) {
            throw new Error('elements <' + name + '> not found');
        }
        return elements;
    }

    static enableElement(element) {
        if(element != null) {
            element.disabled = false;
        }
    }

    static disableElement(element) {
        if(element != null) {
            element.disabled = true;
        }
    }

    static checkElement(element) {
        if(element != null) {
            element.checked = true;
        }
    }

    static uncheckElement(element) {
        if(element != null) {
            element.checked = false;
        }
    }

    static setValue(element, value) {
        if(element != null) {
            element.value = value;
        }
    }

    static setInnerText(element, text) {
        if(element != null) {
            element.innerText = text;
        }
    }
}

// ---------------------------------------------------------------------------
// DOM selector
// ---------------------------------------------------------------------------

export function $(identifier, required = true) {
    const selector = identifier.charAt(0);

    if(selector == '#') {
        return AYM_Utils.getElementById(identifier.substring(1), required);
    }
    if(selector == '.') {
        return AYM_Utils.getElementsByClassName(identifier.substring(1), required);
    }
    return AYM_Utils.getElementsByName(identifier, required);
}

// ---------------------------------------------------------------------------
// End-Of-File
// ---------------------------------------------------------------------------
