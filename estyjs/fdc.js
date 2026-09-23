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


// fdc (wd1770) emulation routines for EstyJS
// written by Darren Coles
"use strict";

EstyJs.fdc = function (opts) {
    var self = {};

    var selectedDrive = '';

    var bug = opts.bug;

    var mfp = opts.mfp;

    var fileManager = opts.fileManager;

    var memory = null;

    var aborted = false;

    var floppyAdata = new Uint8Array(0);
    var floppyBdata = new Uint8Array(0);

    var driveSide = 0;
    var trackNo = 0;
    var sectorNo = 0;
    var sectorCount = 0;
    var dataReg = 0;
    var driveStatusA = 0x64; //
    var driveStatusB = 0x64; //

    var hblCountA = 0;  //number of hbls since last command A
    var hblCountB = 0; //number of hbls since last command B

    var driveAcurrentTrack = 0;
    var driveBcurrentTrack = 0;

    var commandNo = 0;
    var dmaAddr = 0;
    var commandCompleteTimer = 0;
    var dmaStatusReg = 0;

    // MSA images store, for every track and side, either the raw track or an
    // RLE stream in which 0xe5 introduces a <byte><count> run. The header says
    // how many blocks to expect; the stream itself carries no end marker, so
    // the decoder has to be driven by the header rather than by the data.
    function decodeMSA(dataview) {
        var sectors = dataview.getUint16(2);
        var sides = dataview.getUint16(4) + 1;  //stored as number of sides - 1
        var startTrack = dataview.getUint16(6);
        var endTrack = dataview.getUint16(8);

        var trackSize = sectors * 512; //one side of one track
        var data = new Uint8Array((endTrack - startTrack + 1) * sides * trackSize);

        var offset = 10;
        var out = 0;

        for (var track = startTrack; track <= endTrack; track++) {
            for (var side = 0; side < sides; side++) {
                if (offset + 2 > dataview.byteLength) return data;

                var blockSize = dataview.getUint16(offset);
                offset += 2;

                var blockEnd = Math.min(offset + blockSize, dataview.byteLength);
                var trackEnd = out + trackSize;

                if (blockSize == trackSize) {
                    while (offset < blockEnd) data[out++] = dataview.getUint8(offset++);
                } else {
                    while (offset < blockEnd && out < trackEnd) {
                        var code = dataview.getUint8(offset++);
                        if (code != 0xe5) {
                            data[out++] = code;
                        } else {
                            if (offset + 3 > blockEnd) break;
                            code = dataview.getUint8(offset++);
                            var run = dataview.getUint16(offset, false);
                            offset += 2;
                            while (run-- && out < trackEnd) data[out++] = code;
                        }
                    }
                }

                //a malformed track must not shift everything after it
                out = trackEnd;
                offset = blockEnd;
            }
        }

        return data;
    }

    function processFile(arrayBuffer) {
        if (arrayBuffer == null) return new Uint8Array(0);

        var dv = new DataView(arrayBuffer);

        if (dv.byteLength > 10 && dv.getUint16(0, false) == 0x0e0f) {
            return decodeMSA(dv);
        }

        return new Uint8Array(arrayBuffer);
    }

    function processFileA(arrayBuffer) {
        floppyAdata = processFile(arrayBuffer);
    }

    function processFileB(arrayBuffer) {
        floppyBdata = processFile(arrayBuffer);
    }

    function trackAndSectorValid(geo) {
        return (sectorNo <= geo.sectors && trackNo < geo.tracks && driveSide < geo.sides);
    }

    function getDiskGeometry() {
        var result = new Object();

        var floppyData = null;
        var possibleTracks = 0;

        switch (selectedDrive) {
            case 'A':
                floppyData = floppyAdata;
                break;
            case 'B':
                floppyData = floppyBdata;
                break;
        }

        result.sectors = floppyData[24];

        if (result.sectors < 9 | result.sectors > 11 | (floppyData.length / result.sectors != Math.floor(floppyData.length / result.sectors))) {
            if (floppyData.length / (9 * 512) == Math.floor(floppyData.length / (9 * 512))) {
                possibleTracks = floppyData.length / 9 / 512;
                if (possibleTracks > 100) possibleTracks >>= 1;
                if (possibleTracks < 85) {
                    result.sectors = 9;
                }
            }
            if (floppyData.length / (10 * 512) == Math.floor(floppyData.length / (10 * 512))) {
                possibleTracks = floppyData.length / 10 / 512;
                if (possibleTracks > 100) possibleTracks >>= 1;
                if (possibleTracks < 85) {
                    result.sectors = 10;
                }
            }
            if (floppyData.length / (11 * 512) == Math.floor(floppyData.length / (11 * 512))) {
                possibleTracks = floppyData.length / 11 / 512;
                if (possibleTracks > 100) possibleTracks >>= 1;
                if (possibleTracks < 85) {
                    result.sectors = 11;
                }
            }
        }

        result.tracks = floppyData.length / result.sectors / 512;

        if (result.tracks > 100) {
            result.sides = 2;
            result.tracks >>= 1;
        }
        else {
            result.sides = 1;
        }

        //result.sectors = Math.floor(floppyData.length / 80 / result.sides / 512);

        return result;
    }

    function getDiskByte(diskGeo,byteOffset) {
        var sectorOffset = ((sectorNo - 1) + (trackNo * diskGeo.sectors * diskGeo.sides) + (driveSide * diskGeo.sectors)) * 512;

        switch (selectedDrive) {
            case 'A':
                if (floppyAdata.length > sectorOffset + byteOffset) return floppyAdata[sectorOffset + byteOffset];
            case 'B':
                if (floppyBdata.length > sectorOffset + byteOffset) return floppyBdata[sectorOffset + byteOffset];

        }
        return 0;

    }

    function diskInserted() {
        switch (selectedDrive) {
            case 'A':
                return floppyAdata.length > 0;
            case 'B':
                return floppyBdata.length > 0;
            default:
                return false;
        }
    }

    function currentTrack() {
        switch (selectedDrive) {
            case 'A':
                return driveAcurrentTrack;
            case 'B':
                return driveBcurrentTrack;
            default:
                return 0;
        }
    }

    function setcurrentTrack(val) {
        switch (selectedDrive) {
            case 'A':
                driveAcurrentTrack = val;
                break;
            case 'B':
                driveBcurrentTrack = val;
                break;
        }
    }

    function readDriveStatus() {
        switch (selectedDrive) {
            case 'A':
                return driveStatusA;
            case 'B':
                return driveStatusB;
            default:
                return 0x64;
        }
    }

    function resetHblSinceLastCommand() {
        switch (selectedDrive) {
            case 'A':
                hblCountA = 0;
                break;
            case 'B':
                hblCountB = 0;
                break;
        }
    }

    function writeDriveStatus(val) {
        switch (selectedDrive) {
            case 'A':
                driveStatusA = val;
                break;
            case 'B':
                driveStatusB = val;
                break;
        }
    }

    function processCommand() {
        switch (commandNo & 0xf0) {
            case 0x0:
                //track 0 seek
                //bug.say(sprintf("fdc process command - restore %s", selectedDrive));
                commandCompleteTimer = 10;
                //set busy flag

                break;
            case 0x10:
                //seek track				
                //bug.say(("fdc process command - seek %s - track %d", selectedDrive, dataReg));
                commandCompleteTimer = 5;
                break;
            case 0x20:
                bug.say("fdc process command - step");
                commandCompleteTimer = 2;
                break;
            case 0x30:
                bug.say("fdc process command - step with update");
                commandCompleteTimer = 2;
                break;
            case 0x40:
                bug.say("fdc process command - step in");
                stepDir = 1;
                commandCompleteTimer = 2;
                break;
            case 0x50:
                bug.say("fdc process command - step in with update");
                stepDir = 1;
                commandCompleteTimer = 2;
                break;
            case 0x60:
                bug.say("fdc process command - step out");
                stepDir = 0;
                commandCompleteTimer = 2;
                break;
            case 0x70:
                bug.say("fdc process command - step out with update");
                stepDir = 0;
                commandCompleteTimer = 2;
                break;
            case 0x80:
                commandCompleteTimer = 30;
                //bug.say(sprintf("fdc: command read sector - %s - side: %d - track: %d - sector: %d - sector count: %d - addr: $%06x", selectedDrive, driveSide, trackNo, sectorNo, sectorCount, dmaAddr));
                dmaStatusReg = 1 | (sectorCount ? 2 : 0);
                mfp.setFloppyGpio();
                break;
            case 0x90:
                //bug.say(sprintf("fdc: command read sector multiple - %s - side: %d - track: %d - sector: %d - sector count: %d - addr: $%06x", selectedDrive, driveSide, trackNo, sectorNo, sectorCount, dmaAddr));
                commandCompleteTimer = 5;
                if (selectedDrive != '') {
                    var diskGeo = getDiskGeometry();
                    if (trackAndSectorValid(diskGeo)) {

                        var byteCount = sectorCount * 512;

                        if (sectorCount + sectorNo > diskGeo.sectors) {
                            byteCount = (diskGeo.sectors - (sectorNo - 1)) * 512;
                        }

                        //bug.say(sprintf("read from offset $%8x",(((sectorNo-1) + (trackNo * 18) + (driveSide * 9)) * 512)));
                        for (var i = 0; i < byteCount; i++) {
                            memory.writeByte(dmaAddr++, getDiskByte(diskGeo,i));
                        }
                    }
                    mfp.setFloppyGpio();
                }
                break;
            case 0xa0:
                bug.say("fdc process command - write sector");
                commandCompleteTimer = 5;
                break;
            case 0xb0:
                bug.say("fdc process command - write sector multiple");
                commandCompleteTimer = 5;
                break;
            case 0xc0:
                bug.say("fdc process command - read addr");
                commandCompleteTimer = 5;
                break;
            case 0xd0:
                bug.say("fdc process command - force interrupt");
                //clear busyflag
                writeDriveStatus(readDriveStatus() & 0xfe);
                resetHblSinceLastCommand();
                dmaStatusReg = 1;
                if (commandCompleteTimer > 0) {
                    commandCompleteTimer = 0;
                    aborted = true;
                }
                mfp.clearFloppyGpio();
                return;
                break;
            case 0xe0:
                bug.say("fdc process command - read track");
                commandCompleteTimer = 5;
                break;
            case 0xf0:
                bug.say("fdc process command - write track");
                commandCompleteTimer = 5;
                break;
        }
        resetHblSinceLastCommand();
        writeDriveStatus(0x81);
        dmaStatusReg = 1;
        mfp.setFloppyGpio();
        aborted = false;
    }

    self.selectDrive = function (drive) {
        switch (drive & 6) {
            case 0:
                //no drive selected
                //bug.say("deslect drives");
                selectedDrive = '';
                break;
            case 2:
                //drive A selected
                //bug.say("select drive A");
                selectedDrive = 'A';
                break;
            case 4:
                //drive B selected
                //bug.say("select drive B");
                selectedDrive = 'B';
                break;
            case 6:
                //both drives selected - invalid
                //bug.say("select both drives, invalid!");
                selectedDrive = 'A';
                break;
        }

        driveSide = (drive & 1);
    }

    self.setTrackRegisterHi = function (v) {
        trackNo = (trackNo & 0xff) | (v << 8);
    }

    self.setTrackRegisterLo = function (v) {
        trackNo = (trackNo & 0xff00) | v;
    }

    self.setSectorRegisterHi = function (v) {
        //sectorNo = (sectorNo & 0xff) | (v << 8);
    }

    self.setSectorRegisterLo = function (v) {
        sectorNo = (sectorNo & 0xff00) | v;
    }

    self.setSectorCountRegisterHi = function (v) {
        sectorCount = (sectorCount & 0xff) | (v << 8);
    }

    self.setSectorCountRegisterLo = function (v) {
        sectorCount = (sectorCount & 0xff00) | v;
    }

    self.setDataRegisterHi = function (v) {
        dataReg = (dataReg & 0xff) | (v << 8);
    }

    self.setDataRegisterLo = function (v) {
        dataReg = (dataReg & 0xff00) | v;
    }

    self.setCommandRegisterHi = function (v) {
        commandNo = (commandNo & 0xff) | (v << 8);
        mfp.setFloppyGpio();
    }

    self.setCommandRegisterLo = function (v) {
        commandNo = (commandNo & 0xff00) | v;
        mfp.setFloppyGpio();
        processCommand();
    }

    self.setDmaAddrHi = function (v) {
        dmaAddr = (dmaAddr & 0x00ffff) | (v << 16);
    }

    self.setDmaAddrMid = function (v) {
        dmaAddr = (dmaAddr & 0xff00ff) | (v << 8);
    }

    self.setDmaAddrLo = function (v) {
        dmaAddr = (dmaAddr & 0xffff00) | v;
    }

    self.getDmaStatus = function () {
        return dmaStatusReg;
    }

    self.getTrackNo = function () {
        //bug.say("get track reg");
        return trackNo;
    }

    self.getSectorNo = function () {
        //bug.say("get sector reg");
        return sectorNo;
    }

    self.getSectorCount = function () {
        //bug.say("get sector count: "+sectorCount.toString());
        return sectorCount;
    }

    self.getDataRegister = function () {
        //bug.say("get data reg");
        return dataReg;
    }

    self.getDmaAddr = function () {
        return dmaAddr;
    }

    self.getDriveStatus = function () {
        mfp.setFloppyGpio();
        var status = readDriveStatus();
        //bug.say(sprintf("read drive status, gpio reset, status = %8x ", status));
        return status;
    }

    self.loadFile = function (drive, filename) {
        switch (drive) {
            case 'A':
                fileManager.loadFile(filename, processFileA);
                break;
            case 'B':
                fileManager.loadFile(filename, processFileB);
                break;
        }

    }

    self.setMemory = function (mem) {
        memory = mem;
    }


    self.processRow = function () {
        if (driveStatusA & 0x80) {
            hblCountA++;
            if ((hblCountA > 200 * 50 * 2)) {
                driveStatusA &= 0x7f;
                hblCountA = 0;
            }

        }

        if (driveStatusB & 0x80) {
            hblCountB++;
            if ((hblCountB > 200 * 50 * 2)) {
                driveStatusB &= 0x7f;
                hblCountB = 0;
            }

        }

        if (commandCompleteTimer) {
            commandCompleteTimer--;

            if (!commandCompleteTimer && !aborted) {
                var status;

                bug.say("command complete");

                //command complete trigger interrupt and transfer data if appropriate
                switch (commandNo & 0xf0) {
                    case 0x00:
                        setcurrentTrack(0);
                        trackNo = 0;
                        status = 0xe0 | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0x10:
                        //seek
                        setcurrentTrack(dataReg);
                        trackNo = dataReg;
                        status = 0xe2 | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0x20:
                        //step
                        if (stepDir) setcurrentTrack(currentTrack() + 1); else if (currentTrack()) setcurrentTrack(currentTrack() - 1);
                        status = 0xe0 | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0x30:
                        //step with update
                        if (stepDir) setcurrentTrack(currentTrack() + 1); else if (currentTrack()) setcurrentTrack(currentTrack() - 1);
                        trackNo = currentTrack();
                        status = 0xe0 | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0x40:
                        //step in
                        setcurrentTrack(currentTrack() + 1);
                        status = 0xe0 | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0x50:
                        //step in with update
                        setcurrentTrack(currentTrack() + 1);
                        trackNo = currentTrack();
                        status = 0xe0 | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0x60:
                        //step out
                        status = 0xe0 | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0x70:
                        if (currentTrack()) setcurrentTrack(currentTrack() - 1);
                        trackNo = currentTrack();
                        status = 0xe0 | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0x80:
                        //read data
                        status = 0x90;
                        if (selectedDrive != '') {
							var diskGeo = getDiskGeometry();
                            if (trackAndSectorValid(diskGeo)) {
                                var byteCount = 512;
                                //bug.say(sprintf("read from offset $%8x",(((sectorNo-1) + (trackNo * 18) + (driveSide * 9)) * 512)));
                                for (var i = 0; i < byteCount; i++) {
                                    memory.writeByte(dmaAddr++, getDiskByte(diskGeo,i));
                                }
								status = 0x80; // | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                            }
                        }
                        else {
                            bug.say("sector read when no selected drive");
                        }
                        break;
                    case 0x90:
                        //read data multiple
                        if (selectedDrive != '') {
                            return;
                        } else {
                            bug.say("multiple sector read when no selected drive");
                            status = 0x90;
                        }

                        dmaStatusReg = 1 | (sectorCount ? 2 : 0);
                        status = 0x80; // | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;

                    case 0xa0:
                        //write - write protected
                        status = 0xc0; // | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0xb0:
                        //write multiple - write protected
                        status = 0xc0; // | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0xc0:
                        //read addr
                        status = 0x80;
                        break;
                    case 0xd0:
                        //force interrupt
                        status = 0x80;
                        break;
                    case 0xe0:
                        //read track
                        status = 0xe0 | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0xf0:
                        //write track
                        status = 0xc0; // | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;



                    default:
                        status = 0xe0 | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                }
                writeDriveStatus(status);

                aborted = false;

                dmaStatusReg = 1;

                mfp.clearFloppyGpio();

                //trigger interrupt
                mfp.interruptRequest(7);

            }
        }

    }

    self.getDisplayData = function () {
        var result = new Array();
        if (driveStatusA & 0x80) {
            result.push('A: ' + driveAcurrentTrack.toString());
        }

        if (driveStatusB & 0x80) {
            result.push('B: ' + driveBcurrentTrack.toString());
        }

        return result;
    }

    return self;
}