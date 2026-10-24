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

Original author (2013-2024): Darren Coles
Current maintainer (since 2024): Kai Eckert
*/

// snapshot file handling emulation routines for EstyJs
// written by Darren Coles
"use strict";

EstyJs.SnapshotFile = function (opts) {
    var self = {};

    var processor = opts.processor;
    var memory = opts.memory;
    var io = opts.io;
    var display = opts.display;
    var keyboard = opts.keyboard;
    var mfp = opts.mfp;
    var fileManager = opts.fileManager;

    function readByte(buffer, offset) {
        return buffer[offset];
    }

    function readWord(buffer, offset) {
        return buffer[offset] + (buffer[offset + 1] << 8);
    }

    function readLong(buffer, offset) {
        return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16) + (buffer[offset + 3] << 24);
    }

    function processSnapshot(arrayBuffer) {


        var buffer = new Uint8Array(arrayBuffer);

        var regs = new Object();
        regs.pc = readLong(buffer, 4);
        regs.regs = new Array();
        for (var i = 0; i < 16; i++) {
            regs.regs.push(readLong(buffer, 16 + (i * 4)));
        }
        regs.sr = readWord(buffer, 80);
        regs.othersp = readLong(buffer, 82);

        processor.setSnapshotRegs(regs);


        var displayRegs = new Object();
        displayRegs.screenAddr = readLong(buffer, 86);
        displayRegs.freq = readLong(buffer, 142);
        displayRegs.screenMode = readByte(buffer, 166);
        displayRegs.palette = new Array();
        for (var i = 0; i < 32; i++) {
            displayRegs.palette.push(readByte(buffer, 94 + (i ^ 1)));   /// ^1 to reverse the byte order
        }

        display.setSnapshotRegs(displayRegs);

        //mmu config - not sure about this
        //io.write(0xFF8001,readByte(buffer,167));

        //io.write(0xFFFA07,0);
        //io.write(0xFFFA09,64);

        var mfpregs = new Array();
        for (var i = 0; i < 24; i++) {
            mfpregs.push(readByte(buffer, 172 + i));
        }
        mfp.setSnapshotRegs(mfpregs);

        var keyboardregs = new Object();
        switch (readLong(buffer, 295)) {
            case 8:
                keyboardregs.mouseMode = 'R';
                break;
            case 9:
                keyboardregs.mouseMode = 'A';
                break;
            case 0xa:
                keyboardregs.mouseMode = 'K';
                break;
            case 0x12:
                keyboardregs.mouseMode = '';
                break;
        }

        switch (readLong(buffer, 299)) {
            case 0x14:
                keyboardregs.joystickMode = 'E';
                break;
            case 0x15:
            case 0x1a:
                keyboardregs.joystickMode = '';
                break;
            case 0x19:
                keyboardregs.joystickMode = 'K';
                break;
        }

        keyboard.setSnapshotRegs(keyboardregs);

        var tosFileLen = readLong(buffer, 1954);
        var rambanksize1 = readLong(buffer, 1958 + tosFileLen + 2);
        var rambanksize2 = readLong(buffer, 1958 + tosFileLen + 6);
        var stringStart = 1958 + tosFileLen + 10;
        for (i = 0; i < 30; i++) {
            var stringLen = readLong(buffer, stringStart);
            stringStart += 4 + stringLen;
        }


        var membuff = new Array();
        memoffset = readLong(buffer, stringStart + 284);
        var memvalue = readWord(buffer, memoffset);
        var repeatvalue = 0;
        memoffset += 2;
        var o = rambanksize1 + rambanksize2;
        membuff = new ArrayBuffer(o);
		memDataView = new DataView(membuff);
        while (memvalue != 0xffff) {
            if (memvalue < 0x8000) {
                for (var i = 0; i < memvalue; i++) {
                    o -= 2;
                    memDataView.setUint8(o + 1,(readByte(buffer, memoffset)));
                    memDataView.setUint8(o,(readByte(buffer, memoffset + 1)));
                    memoffset += 2;
                }
            }
            else if (memvalue < 0xfffe) {
                repeatvalue1 = readByte(buffer, memoffset);
                repeatvalue2 = readByte(buffer, memoffset + 1);
                memoffset += 2;
                for (var i = 0; i < (memvalue & 0x7fff); i++) {
                    o -= 2;
                    memDataView.setUint8(o + 1,repeatvalue1);
                    memDataView.setUint8(o,repeatvalue2);
                }
            }
            var memvalue = readWord(buffer, memoffset);
            memoffset += 2;
        }
        memory.setSnapshotMemory(membuff);

    }

    self.loadSnapshot = function (file) {
        fileManager.loadFile(file, processSnapshot);
    }

    /* ------------------------------------------------- EstyJS machine state */

    // A state is a tree of plain values and typed arrays. Stored as:
    //   'ESTY'           4 bytes
    //   format           uint32, little-endian
    //   JSON length      uint32, little-endian
    //   JSON             UTF-8, typed arrays replaced by {$type, $offset, $length}
    //   typed arrays     their bytes, one after the other, in host byte order
    self.FORMAT = 1;

    var TYPES = { Uint8Array: Uint8Array, Int32Array: Int32Array, Uint32Array: Uint32Array };

    self.encode = function (state) {
        var chunks = [];
        var size = 0;

        var json = JSON.stringify(state, function (key, value) {
            if (ArrayBuffer.isView(value)) {
                var type = value.constructor.name;
                if (!TYPES.hasOwnProperty(type)) throw new Error('state: cannot store ' + type);
                var bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                chunks.push(bytes);
                size += bytes.length;
                return { $type: type, $offset: size - bytes.length, $length: value.length };
            }
            return value;
        });

        var text = new TextEncoder().encode(json);
        var out = new Uint8Array(12 + text.length + size);
        var view = new DataView(out.buffer);

        out.set([0x45, 0x53, 0x54, 0x59]);
        view.setUint32(4, self.FORMAT, true);
        view.setUint32(8, text.length, true);
        out.set(text, 12);

        var p = 12 + text.length;
        for (var i = 0; i < chunks.length; i++) {
            out.set(chunks[i], p);
            p += chunks[i].length;
        }

        return out.buffer;
    }

    // Throws if the buffer is not a state in this format.
    self.decode = function (buffer) {
        var bytes = new Uint8Array(buffer);
        var view = new DataView(buffer);

        if (bytes.length < 12 || bytes[0] != 0x45 || bytes[1] != 0x53 ||
            bytes[2] != 0x54 || bytes[3] != 0x59) throw new Error('state: not an EstyJS state');

        var format = view.getUint32(4, true);
        if (format != self.FORMAT) throw new Error('state: format ' + format + ', expected ' + self.FORMAT);

        var length = view.getUint32(8, true);
        var base = 12 + length;
        var json = new TextDecoder().decode(bytes.subarray(12, base));

        return JSON.parse(json, function (key, value) {
            if (value != null && typeof value == 'object' && value.$type) {
                var type = TYPES.hasOwnProperty(value.$type) ? TYPES[value.$type] : null;
                if (type == null) throw new Error('state: unknown array type ' + value.$type);
                var from = base + value.$offset;
                return new type(buffer.slice(from, from + value.$length * type.BYTES_PER_ELEMENT));
            }
            return value;
        });
    }


    return self;
}