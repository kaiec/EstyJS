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


// fdc (wd1770) emulation routines for EstyJs
// written by Darren Coles
//
// Sectors are found by matching the address field on the track, not by
// computing an offset into the image. The disk comes from disk.js.
//
// Write sector and write multiple change .ST and .MSA disks. STX disks are
// always write protected. Write track (formatting) answers write protected.
//
// TOS notices a disk change through the write protect bit of the type I
// status: the sensor is covered while a disk goes in or out. The bit is held
// for CHANGE_ROWS after every insert and eject.
"use strict";

EstyJs.fdc = function (opts) {
    var self = {};

    var selectedDrive = '';

    var bug = opts.bug;

    var mfp = opts.mfp;

    var fileManager = opts.fileManager;

    var memory = null;

    var aborted = false;

    //half a second
    var CHANGE_ROWS = 313 * 25;

    function newDrive() {
        return {
            disk: null,
            currentTrack: 0,
            status: 0x64,
            typeI: true,           //status holds a type I status
            hblCount: 0,           //number of hbls since last command
            addressIndex: 0,       //which address field read address hands over next
            writeProtected: false,
            dirty: false,          //written since inserted or clearDirty
            changeRows: 0          //rows the write protect bit is held for a disk change
        };
    }

    var drives = { 'A': newDrive(), 'B': newDrive() };

    var driveSide = 0;
    var trackNo = 0;
    var sectorNo = 0;
    var sectorCount = 0;
    var dataReg = 0;
    var stepDir = 0;

    var commandNo = 0;
    var dmaAddr = 0;
    var commandCompleteTimer = 0;
    var dmaStatusReg = 0;

    /* ----------------------------------------------------------- the drive */

    function drive() {
        return drives[selectedDrive] || null;
    }

    function diskInserted() {
        var d = drive();
        return d != null && d.disk != null;
    }

    function currentTrack() {
        var d = drive();
        return d ? d.currentTrack : 0;
    }

    function setcurrentTrack(val) {
        var d = drive();
        if (d) d.currentTrack = val;
    }

    function writeProtectBit(d) {
        if (d.changeRows > 0) return 0x40;
        return d.disk != null && d.writeProtected ? 0x40 : 0;
    }

    function readDriveStatus() {
        var d = drive();
        if (d == null) return 0x64;
        return d.typeI ? (d.status & 0xbf) | writeProtectBit(d) : d.status;
    }

    function writeDriveStatus(val) {
        var d = drive();
        if (d) d.status = val;
    }

    function resetHblSinceLastCommand() {
        var d = drive();
        if (d) d.hblCount = 0;
    }

    /* ---------------------------------------------------------- the sector */

    function trackSectors() {
        var d = drive();
        if (d == null || d.disk == null) return null;

        //the track register says where the head is; drift is not modelled
        var track = d.disk.getTrack(trackNo, driveSide);
        return track ? track.sectors : null;
    }

    // The sector number must match an address field on the track, and the
    // track number in that address field must match the track register.
    // Protected disks rely on the mismatch answering record-not-found.
    function findSector(number) {
        var sectors = trackSectors();
        if (sectors == null) return null;

        for (var i = 0; i < sectors.length; i++) {
            if (sectors[i].id.number == number && sectors[i].id.track == trackNo) {
                return sectors[i];
            }
        }

        return null;
    }

    // Type II status: bit 7 motor on, bit 5 deleted data mark, bit 4 record
    // not found, bit 3 CRC error in the data field.
    function sectorStatus(sector) {
        if (sector == null) return 0x90;

        var status = 0x80;
        if (sector.noData) status |= 0x10;
        if (sector.deleted) status |= 0x20;
        if (sector.crcError) status |= 0x08;

        return status;
    }

    // The mask marks the bits that read the same on every revolution. The rest
    // are noise.
    function sectorByte(sector, offset) {
        var value = (sector.data != null && offset < sector.data.length) ? sector.data[offset] : 0;

        if (sector.fuzzyMask != null && offset < sector.fuzzyMask.length) {
            var mask = sector.fuzzyMask[offset];
            value = (value & mask) | (((Math.random() * 256) | 0) & ~mask & 0xff);
        }

        return value;
    }

    function transferSector(sector) {
        for (var i = 0; i < sector.size; i++) {
            memory.writeByte(dmaAddr++, sectorByte(sector, i));
        }
    }

    // Returns the next address field the head passes. Without a rotation model
    // the sectors are handed out in turn.
    function readAddress() {
        var sectors = trackSectors();
        if (sectors == null || sectors.length == 0) return 0x90;

        var d = drive();
        var sector = sectors[d.addressIndex % sectors.length];
        d.addressIndex = (d.addressIndex + 1) % sectors.length;

        memory.writeByte(dmaAddr++, sector.id.track);
        memory.writeByte(dmaAddr++, sector.id.head);
        memory.writeByte(dmaAddr++, sector.id.number);
        memory.writeByte(dmaAddr++, sector.id.size);
        memory.writeByte(dmaAddr++, (sector.crc >> 8) & 0xff);
        memory.writeByte(dmaAddr++, sector.crc & 0xff);

        //the controller leaves the track address in the sector register
        sectorNo = sector.id.track;

        return sector.crcError ? 0x88 : 0x80;
    }

    // Returns the whole track, gaps and address marks included, from the STX
    // track image. Always starts at the index, since the head position is not
    // modelled.
    function readTrack() {
        var d = drive();
        if (d == null || d.disk == null) return null;

        var track = d.disk.getTrack(trackNo, driveSide);
        if (track == null || track.image == null) return null;

        for (var i = 0; i < track.image.length; i++) {
            memory.writeByte(dmaAddr++, track.image[i]);
        }

        return track.image.length;
    }

    // Type II status: bit 6 write protected, bit 4 record not found. Write
    // multiple runs until the count is used up or a sector is not found.
    function writeSectors(count) {
        var d = drive();
        if (d == null || d.disk == null) return 0x90;
        if (d.writeProtected) return 0xc0;

        var number = sectorNo;
        var written = 0;

        while (count-- > 0) {
            var sector = findSector(number++);
            if (sector == null || sector.data == null) break;

            for (var i = 0; i < sector.size; i++) {
                sector.data[i] = memory.readByte(dmaAddr++);
            }
            written++;
        }

        if (written == 0) return 0x90;

        d.disk.written();
        d.dirty = true;
        return 0x80;
    }

    /* --------------------------------------------------------- the command */

    function processCommand() {
        var d = drive();
        if (d) d.typeI = (commandNo & 0x80) == 0 || (commandNo & 0xf0) == 0xd0;

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
                    //runs until the sector count is used up or a sector is
                    //not found
                    var number = sectorNo;
                    var remaining = sectorCount;

                    while (remaining-- > 0) {
                        var sector = findSector(number++);
                        if (sector == null || sector.noData) break;
                        transferSector(sector);
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

    // Returns what the image turned out to be, or that it was not a disk
    // image. null ejects the disk. Writing leaves arrayBuffer unchanged.
    self.insertDisk = function (drive, arrayBuffer, writeProtected) {
        var target = drives[drive];
        if (target == null) return { ok: false };

        var disk = arrayBuffer == null ? null : EstyJs.diskImage.load(arrayBuffer);

        if (target.disk != null || disk != null) target.changeRows = CHANGE_ROWS;

        target.disk = disk;
        target.addressIndex = 0;
        target.dirty = false;
        target.writeProtected = disk != null && (writeProtected == true || !disk.writable);

        if (arrayBuffer == null) return { ok: false };

        if (disk == null) {
            bug.say("drive " + drive + ": not a readable disk image");
            return { ok: false };
        }

        bug.say("drive " + drive + ": " + disk.format + " image, " + disk.tracks +
                " tracks, " + disk.sides + " side(s), " + disk.sectorsPerTrack +
                " sectors per track");

        return {
            ok: true,
            format: disk.format,
            tracks: disk.tracks,
            sides: disk.sides,
            sectorsPerTrack: disk.sectorsPerTrack,
            writeProtected: target.writeProtected
        };
    }

    // A copy of the image in the drive, or null. A written disk is an .ST
    // image.
    self.getDiskBytes = function (drive) {
        var target = drives[drive];
        if (target == null || target.disk == null) return null;
        return new Uint8Array(target.disk.bytes);
    }

    // {format, writeProtected, dirty} of the disk in the drive, or null.
    self.getDiskInfo = function (drive) {
        var target = drives[drive];
        if (target == null || target.disk == null) return null;
        return {
            format: target.disk.format,
            writeProtected: target.writeProtected,
            dirty: target.dirty
        };
    }

    self.clearDirty = function (drive) {
        var target = drives[drive];
        if (target != null) target.dirty = false;
    }

    // Loading is asynchronous. callback reports what the file turned out to
    // be, or that it was not a disk image.
    self.loadFile = function (drive, filename, callback) {
        if (drives[drive] == null) return;

        fileManager.loadFile(filename, function (arrayBuffer) {
            var result = self.insertDisk(drive, arrayBuffer);
            if (callback) callback(result);
        });
    }

    // Registers and drive positions. The disks are saved apart from it.
    self.getState = function () {
        var state = {
            selectedDrive: selectedDrive, aborted: aborted,
            driveSide: driveSide, trackNo: trackNo, sectorNo: sectorNo,
            sectorCount: sectorCount, dataReg: dataReg, stepDir: stepDir,
            commandNo: commandNo, dmaAddr: dmaAddr,
            commandCompleteTimer: commandCompleteTimer, dmaStatusReg: dmaStatusReg,
            drives: {}
        };
        for (var name in drives) {
            var d = drives[name];
            state.drives[name] = {
                currentTrack: d.currentTrack, status: d.status, typeI: d.typeI,
                hblCount: d.hblCount, addressIndex: d.addressIndex,
                writeProtected: d.writeProtected, changeRows: d.changeRows
            };
        }
        return state;
    }

    self.setState = function (state) {
        selectedDrive = state.selectedDrive; aborted = state.aborted;
        driveSide = state.driveSide; trackNo = state.trackNo; sectorNo = state.sectorNo;
        sectorCount = state.sectorCount; dataReg = state.dataReg; stepDir = state.stepDir;
        commandNo = state.commandNo; dmaAddr = state.dmaAddr;
        commandCompleteTimer = state.commandCompleteTimer; dmaStatusReg = state.dmaStatusReg;
        for (var name in drives) {
            var d = drives[name], s = state.drives[name];
            d.currentTrack = s.currentTrack; d.status = s.status; d.typeI = s.typeI;
            d.hblCount = s.hblCount; d.addressIndex = s.addressIndex;
            d.writeProtected = s.writeProtected; d.changeRows = s.changeRows;
        }
    }

    self.setMemory = function (mem) {
        memory = mem;
    }


    self.processRow = function () {
        for (var name in drives) {
            var d = drives[name];

            if (d.changeRows > 0) d.changeRows--;

            if (d.status & 0x80) {
                d.hblCount++;
                if (d.hblCount > 200 * 50 * 2) {
                    d.status &= 0x7f;
                    d.hblCount = 0;
                }
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
                            var sector = findSector(sectorNo);

                            if (sector != null && !sector.noData) {
                                transferSector(sector);
                            }

                            status = sectorStatus(sector);
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
                        //write sector
                        status = selectedDrive != '' ? writeSectors(1) : 0x90;
                        break;
                    case 0xb0:
                        //write multiple
                        status = selectedDrive != '' ? writeSectors(sectorCount) : 0x90;
                        break;
                    case 0xc0:
                        //read addr
                        status = 0x90;
                        if (selectedDrive != '') {
                            status = readAddress();
                        }
                        break;
                    case 0xd0:
                        //force interrupt
                        status = 0x80;
                        break;
                    case 0xe0:
                        //read track
                        status = 0xe0 | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        if (selectedDrive != '' && readTrack() != null) status = 0x80;
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

        if (drives['A'].status & 0x80) {
            result.push('A: ' + drives['A'].currentTrack.toString());
        }

        if (drives['B'].status & 0x80) {
            result.push('B: ' + drives['B'].currentTrack.toString());
        }

        return result;
    }

    return self;
}
