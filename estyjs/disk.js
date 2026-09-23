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


// disk image decoding for EstyJS
//
// Every supported format is decoded into the same shape, so that the FDC only
// ever deals with tracks and sectors and never with file layouts:
//
//   disk.format            'ST', 'MSA' or 'STX'
//   disk.sides             1 or 2
//   disk.tracks            tracks per side
//   disk.sectorsPerTrack   nominal, for reporting only
//   disk.getTrack(t, side) -> { sectors: [...], image } or null if unformatted
//
// image is the raw track as a read track command would return it, present only
// for STX images of disks that carry something a sector cannot describe.
//
// and each sector carries what the WD1772 would find on the disk:
//
//   id      { track, head, number, size }   the address field, as recorded
//   crc     the address field CRC, as recorded
//   size    data length in bytes, 128 << id.size
//   data    Uint8Array, or null when the sector has no data block
//   crcError, deleted, noData, fuzzy        FDC status as recorded
//   fuzzyMask  bytes that read the same every time (STX only)
//
// A plain .ST or .MSA image has no address fields of its own, so it gets the
// ones a normally formatted disk would have: sectors numbered from 1, the ID
// track and side matching where the sector physically sits.
"use strict";

EstyJs.diskImage = (function () {
    var self = {};

    /* ------------------------------------------------------------ helpers */

    function makeSector(track, side, number, data) {
        return {
            id: { track: track, head: side, number: number, size: 2 },
            size: 512,
            data: data,
            crc: 0,
            crcError: false,
            deleted: false,
            noData: false,
            fuzzy: false,
            fuzzyMask: null,
            bitPosition: 0,
            readTime: 0
        };
    }

    function makeDisk(format, tracks, sides, sectorsPerTrack, trackTable) {
        return {
            format: format,
            tracks: tracks,
            sides: sides,
            sectorsPerTrack: sectorsPerTrack,
            getTrack: function (track, side) {
                var key = track * 2 + (side & 1);
                return trackTable[key] || null;
            }
        };
    }

    /* -------------------------------------------------------- raw sectors */

    // .ST images carry no geometry of their own: it has to be recovered from
    // the image length and the sector count in the boot sector. Kept exactly as
    // it always was, because which images load depends on it.
    function rawGeometry(data) {
        var sectors = data[24];
        var possibleTracks = 0;

        if (sectors < 9 | sectors > 11 | (data.length / sectors != Math.floor(data.length / sectors))) {
            if (data.length / (9 * 512) == Math.floor(data.length / (9 * 512))) {
                possibleTracks = data.length / 9 / 512;
                if (possibleTracks > 100) possibleTracks >>= 1;
                if (possibleTracks < 85) sectors = 9;
            }
            if (data.length / (10 * 512) == Math.floor(data.length / (10 * 512))) {
                possibleTracks = data.length / 10 / 512;
                if (possibleTracks > 100) possibleTracks >>= 1;
                if (possibleTracks < 85) sectors = 10;
            }
            if (data.length / (11 * 512) == Math.floor(data.length / (11 * 512))) {
                possibleTracks = data.length / 11 / 512;
                if (possibleTracks > 100) possibleTracks >>= 1;
                if (possibleTracks < 85) sectors = 11;
            }
        }

        var tracks = data.length / sectors / 512;
        var sides = 1;

        if (tracks > 100) {
            sides = 2;
            tracks >>= 1;
        }

        return { sectors: sectors, tracks: tracks, sides: sides };
    }

    // Sectors are stored in the order the drive meets them: track 0 side 0,
    // track 0 side 1, track 1 side 0, and so on.
    function fromRaw(data, format) {
        var geo = rawGeometry(data);
        var trackTable = {};

        for (var track = 0; track < geo.tracks; track++) {
            for (var side = 0; side < geo.sides; side++) {
                var sectors = new Array();

                for (var s = 0; s < geo.sectors; s++) {
                    var offset = ((track * geo.sides + side) * geo.sectors + s) * 512;
                    if (offset + 512 > data.length) break;
                    sectors.push(makeSector(track, side, s + 1, data.subarray(offset, offset + 512)));
                }

                if (sectors.length) trackTable[track * 2 + side] = { sectors: sectors, image: null };
            }
        }

        return makeDisk(format, geo.tracks, geo.sides, geo.sectors, trackTable);
    }

    /* ----------------------------------------------------------------- MSA */

    // MSA stores, for every track and side, either the raw track or an RLE
    // stream in which 0xe5 introduces a <byte><count> run. The header says how
    // many blocks to expect; the stream itself carries no end marker, so the
    // decoder has to be driven by the header rather than by the data.
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

    /* ----------------------------------------------------------------- STX */

    // Pasti images describe what is actually on the disk: the address field of
    // every sector with its recorded FDC status, an optional image of the whole
    // track, and a mask for bytes that read differently every revolution.
    //
    // Layout, all little-endian:
    //   file descriptor  16 bytes, 'RSY\0', version 3
    //   track record     descriptor(16) [sector descriptors] [fuzzy mask] track data
    //
    // Sector data offsets are relative to the start of the track data, and may
    // point either into the track image or at a separate sector image.
    function decodeSTX(dataview, bytes) {
        if (dataview.byteLength < 16) return null;
        if (dataview.getUint8(0) != 0x52 || dataview.getUint8(1) != 0x53 ||
            dataview.getUint8(2) != 0x59 || dataview.getUint8(3) != 0x00) return null;
        if (dataview.getUint16(4, true) != 3) return null;   //only version 3 is documented

        var trackCount = dataview.getUint8(10);
        var trackTable = {};
        var maxTrack = 0;
        var maxSide = 0;
        var commonSectorCount = 0;

        var offset = 16;

        for (var i = 0; i < trackCount; i++) {
            if (offset + 16 > dataview.byteLength) break;

            var recordSize = dataview.getUint32(offset, true);
            var fuzzyCount = dataview.getUint32(offset + 4, true);
            var sectorCount = dataview.getUint16(offset + 8, true);
            var trackFlags = dataview.getUint16(offset + 10, true);
            var trackLength = dataview.getUint16(offset + 12, true);
            var trackNumber = dataview.getUint8(offset + 14);

            var track = trackNumber & 0x7f;
            var side = (trackNumber >> 7) & 1;
            var sectors = new Array();
            var trackImage = null;

            var p = offset + 16;

            if (trackFlags & 0x01) {
                //sector descriptors, then the fuzzy mask, then the track data
                var descriptors = new Array();

                for (var s = 0; s < sectorCount && p + 16 <= dataview.byteLength; s++) {
                    descriptors.push({
                        dataOffset: dataview.getUint32(p, true),
                        bitPosition: dataview.getUint16(p + 4, true),
                        readTime: dataview.getUint16(p + 6, true),
                        id: {
                            track: dataview.getUint8(p + 8),
                            head: dataview.getUint8(p + 9),
                            number: dataview.getUint8(p + 10),
                            size: dataview.getUint8(p + 11)
                        },
                        crc: dataview.getUint16(p + 12, true),
                        fdcFlags: dataview.getUint8(p + 14)
                    });
                    p += 16;
                }

                var fuzzyStart = p;
                p += fuzzyCount;

                var trackDataStart = p;
                var fuzzyUsed = 0;

                //the track image, when present, sits at the front of the track
                //data, behind a header of two or four bytes
                if (trackFlags & 0x40) {
                    var q = trackDataStart;
                    if (trackFlags & 0x80) q += 2;   //first sync offset, unused here
                    var imageSize = dataview.getUint16(q, true);
                    q += 2;
                    if (q + imageSize <= bytes.length) {
                        trackImage = bytes.subarray(q, q + imageSize);
                    }
                }

                for (var s = 0; s < descriptors.length; s++) {
                    var d = descriptors[s];
                    var size = 128 << (d.id.size & 3);
                    var noData = (d.fdcFlags & 0x10) != 0;
                    var data = null;
                    var mask = null;

                    if (!noData) {
                        var from = trackDataStart + d.dataOffset;
                        if (from >= 0 && from + size <= bytes.length) {
                            data = bytes.subarray(from, from + size);
                        } else {
                            noData = true;   //descriptor points outside the file
                        }
                    }

                    //fuzzy mask bytes are handed out to the fuzzy sectors in turn
                    if ((d.fdcFlags & 0x80) && fuzzyStart + fuzzyUsed + size <= bytes.length &&
                        fuzzyUsed + size <= fuzzyCount) {
                        mask = bytes.subarray(fuzzyStart + fuzzyUsed, fuzzyStart + fuzzyUsed + size);
                        fuzzyUsed += size;
                    }

                    sectors.push({
                        id: d.id,
                        size: size,
                        data: data,
                        crc: d.crc,
                        crcError: (d.fdcFlags & 0x08) != 0,
                        deleted: (d.fdcFlags & 0x20) != 0,
                        noData: noData,
                        fuzzy: mask != null,
                        fuzzyMask: mask,
                        bitPosition: d.bitPosition,
                        readTime: d.readTime
                    });
                }
            } else if (sectorCount) {
                //no descriptors: standard 512 byte sectors numbered from 1
                for (var s = 0; s < sectorCount; s++) {
                    var from = offset + 16 + s * 512;
                    if (from + 512 > bytes.length) break;
                    sectors.push(makeSector(track, side, s + 1, bytes.subarray(from, from + 512)));
                }
            }

            if (sectors.length) {
                trackTable[track * 2 + side] = {
                    sectors: sectors, image: trackImage, trackLength: trackLength
                };
                if (track > maxTrack) maxTrack = track;
                if (side > maxSide) maxSide = side;
                if (sectors.length > commonSectorCount) commonSectorCount = sectors.length;
            }

            if (recordSize < 16) break;   //refuse to loop forever on a broken file
            offset += recordSize;
        }

        return makeDisk('STX', maxTrack + 1, maxSide + 1, commonSectorCount, trackTable);
    }

    /* --------------------------------------------------------------- entry */

    // Formats are told apart by content, not by file name, so a mislabelled
    // image still loads and a file that is not an image at all is rejected
    // instead of being mounted as noise.
    self.load = function (arrayBuffer) {
        if (arrayBuffer == null || arrayBuffer.byteLength < 16) return null;

        var dataview = new DataView(arrayBuffer);
        var bytes = new Uint8Array(arrayBuffer);

        if (dataview.getUint16(0, false) == 0x0e0f) {
            var raw = decodeMSA(dataview);
            return raw.length ? fromRaw(raw, 'MSA') : null;
        }

        if (bytes[0] == 0x52 && bytes[1] == 0x53 && bytes[2] == 0x59 && bytes[3] == 0x00) {
            return decodeSTX(dataview, bytes);
        }

        //anything else is taken as a raw sector dump, which has no signature to
        //check, so only the shape of it can say whether it is plausible
        if (arrayBuffer.byteLength < 512 || (arrayBuffer.byteLength % 512) != 0) return null;

        return fromRaw(bytes, 'ST');
    };

    return self;
})();
