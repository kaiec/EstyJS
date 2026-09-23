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
// Sectors are found the way the controller finds them: by matching the address
// field written on the track, not by computing an offset into the image. The
// disk itself comes from disk.js, which presents every image format as tracks
// and sectors, so nothing here needs to know about file layouts.
"use strict";

EstyJs.fdc = function (opts) {
    var self = {};

    var selectedDrive = '';

    var bug = opts.bug;

    var mfp = opts.mfp;

    var fileManager = opts.fileManager;

    var memory = null;

    var aborted = false;

    function newDrive() {
        return {
            disk: null,
            currentTrack: 0,
            status: 0x64,
            hblCount: 0,      //number of hbls since last command
            addressIndex: 0   //which address field read address hands over next
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

    function readDriveStatus() {
        var d = drive();
        return d ? d.status : 0x64;
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

        //the track register says where the head is, as it did before: nothing
        //here models the head drifting away from it
        var track = d.disk.getTrack(trackNo, driveSide);
        return track ? track.sectors : null;
    }

    // The controller compares the sector number it was asked for against the
    // address fields on the track, and the track number in that address field
    // against its own track register. A disk whose address fields disagree with
    // where they physically sit is how copy protection works, and answering
    // record-not-found is how it is meant to behave.
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

    // Status after a type II command: bit 7 motor on, bit 5 deleted data mark,
    // bit 4 record not found, bit 3 CRC error in the data field.
    function sectorStatus(sector) {
        if (sector == null) return 0x90;

        var status = 0x80;
        if (sector.noData) status |= 0x10;
        if (sector.deleted) status |= 0x20;
        if (sector.crcError) status |= 0x08;

        return status;
    }

    // A fuzzy sector does not hold all of its bits stably: the mask marks the
    // ones that read the same on every revolution, and the rest are noise.
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

    // Read address hands over the next address field the head passes, which is
    // how a program finds out what a track really holds. Without a rotation
    // model the sectors are simply handed out in turn.
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

    // Read track hands back the whole track as it is written on the disk,
    // gaps and address marks included. Only an image that records that much can
    // answer it, and a protection asking the question is usually the reason the
    // image was made in the first place. The real head starts wherever it
    // happens to be; without a rotation model this always starts at the index.
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

    /* --------------------------------------------------------- the command */

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
                    //a multiple read runs on until the sector count is used up
                    //or the track runs out of sectors to find
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

    // The load is asynchronous, so whether the file turned out to be a disk at
    // all is only known later: callback is how the caller gets told.
    self.loadFile = function (drive, filename, callback) {
        var target = drives[drive];
        if (target == null) return;

        fileManager.loadFile(filename, function (arrayBuffer) {
            var disk = EstyJs.diskImage.load(arrayBuffer);

            target.disk = disk;
            target.addressIndex = 0;

            if (disk == null) {
                bug.say("drive " + drive + ": not a readable disk image");
            } else {
                bug.say("drive " + drive + ": " + disk.format + " image, " + disk.tracks +
                        " tracks, " + disk.sides + " side(s), " + disk.sectorsPerTrack +
                        " sectors per track");
            }

            if (callback) {
                callback(disk == null ? { ok: false } : {
                    ok: true,
                    format: disk.format,
                    tracks: disk.tracks,
                    sides: disk.sides,
                    sectorsPerTrack: disk.sectorsPerTrack
                });
            }
        });
    }

    self.setMemory = function (mem) {
        memory = mem;
    }


    self.processRow = function () {
        for (var name in drives) {
            var d = drives[name];

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
                        //write - write protected
                        status = 0xc0; // | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
                        break;
                    case 0xb0:
                        //write multiple - write protected
                        status = 0xc0; // | (currentTrack() ? 0 : 4) | (diskInserted() ? 0 : 16);
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
