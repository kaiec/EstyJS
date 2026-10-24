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


// ZIP archives for export and import, on CompressionStream
//
//   EstyJs.zip.write(files)   -> Promise of Uint8Array
//   EstyJs.zip.read(bytes)    -> Promise of files
//
//   files   [{ name, bytes }], name with '/' between folders, bytes a
//           Uint8Array (write also takes an ArrayBuffer)
//
// Written entries are deflated, or stored when deflating does not make them
// smaller. Names are UTF-8. Reading goes through the central directory, so
// archives with data descriptors (macOS Finder) read too. Folder entries and
// what macOS adds (__MACOSX/, ._ files, .DS_Store) are left out.
"use strict";

EstyJs.zip = (function () {
    var self = {};

    var LOCAL = 0x04034b50, CENTRAL = 0x02014b50, END = 0x06054b50;
    var UTF8 = 0x0800;

    var crcTable = null;

    function crc32(bytes) {
        if (crcTable == null) {
            crcTable = new Uint32Array(256);
            for (var n = 0; n < 256; n++) {
                var c = n;
                for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
                crcTable[n] = c >>> 0;
            }
        }

        var crc = 0xffffffff;
        for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    function through(bytes, stream) {
        return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()
            .then(function (buffer) { return new Uint8Array(buffer); });
    }

    function dosTime(date) {
        return (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    }

    function dosDate(date) {
        return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    }

    self.write = function (files) {
        var encoder = new TextEncoder();
        var now = new Date();

        files = files.map(function (f) {
            return { name: f.name, bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes) };
        });

        return Promise.all(files.map(function (f) {
            return through(f.bytes, new CompressionStream('deflate-raw'));
        })).then(function (deflated) {
            var parts = [];
            var central = [];
            var offset = 0;

            files.forEach(function (f, i) {
                var name = encoder.encode(f.name);
                var method = deflated[i].length < f.bytes.length ? 8 : 0;
                var data = method == 8 ? deflated[i] : f.bytes;

                var local = new DataView(new ArrayBuffer(30));
                local.setUint32(0, LOCAL, true);
                local.setUint16(4, 20, true);
                local.setUint16(6, UTF8, true);
                local.setUint16(8, method, true);
                local.setUint16(10, dosTime(now), true);
                local.setUint16(12, dosDate(now), true);
                local.setUint32(14, crc32(f.bytes), true);
                local.setUint32(18, data.length, true);
                local.setUint32(22, f.bytes.length, true);
                local.setUint16(26, name.length, true);

                var entry = new DataView(new ArrayBuffer(46));
                entry.setUint32(0, CENTRAL, true);
                entry.setUint16(4, 20, true);
                for (var b = 4; b < 30; b++) entry.setUint8(b + 2, local.getUint8(b));
                entry.setUint32(42, offset, true);

                parts.push(new Uint8Array(local.buffer), name, data);
                central.push(new Uint8Array(entry.buffer), name);
                offset += 30 + name.length + data.length;
            });

            var size = central.reduce(function (sum, p) { return sum + p.length; }, 0);
            var end = new DataView(new ArrayBuffer(22));
            end.setUint32(0, END, true);
            end.setUint16(8, files.length, true);
            end.setUint16(10, files.length, true);
            end.setUint32(12, size, true);
            end.setUint32(16, offset, true);

            var all = parts.concat(central, [new Uint8Array(end.buffer)]);
            var out = new Uint8Array(offset + size + 22);
            var at = 0;
            all.forEach(function (p) { out.set(p, at); at += p.length; });
            return out;
        });
    };

    self.read = function (bytes) {
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        var end = -1;
        for (var i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 0xffff; i--) {
            if (view.getUint32(i, true) == END) { end = i; break; }
        }
        if (end < 0) return Promise.reject(new Error('not a ZIP archive'));

        var count = view.getUint16(end + 10, true);
        var at = view.getUint32(end + 16, true);
        var utf8 = new TextDecoder('utf-8');
        var latin1 = new TextDecoder('latin1');
        var entries = [];

        for (var n = 0; n < count; n++) {
            if (at + 46 > bytes.length || view.getUint32(at, true) != CENTRAL) {
                return Promise.reject(new Error('damaged ZIP archive'));
            }

            var flags = view.getUint16(at + 8, true);
            var method = view.getUint16(at + 10, true);
            var size = view.getUint32(at + 20, true);
            var nameLength = view.getUint16(at + 28, true);
            var skip = view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
            var local = view.getUint32(at + 42, true);
            var rawName = bytes.subarray(at + 46, at + 46 + nameLength);
            var name = (flags & UTF8 ? utf8 : latin1).decode(rawName);
            at += 46 + nameLength + skip;

            var base = name.split('/').pop();
            if (base == '' || name.indexOf('__MACOSX/') == 0 || base.indexOf('._') == 0 || base == '.DS_Store') continue;
            if (method != 0 && method != 8) return Promise.reject(new Error(name + ': unknown compression'));

            var start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
            entries.push({ name: name, method: method, data: bytes.subarray(start, start + size) });
        }

        return Promise.all(entries.map(function (e) {
            var data = e.method == 8 ? through(e.data, new DecompressionStream('deflate-raw'))
                                     : Promise.resolve(e.data.slice(0));
            return data.then(function (out) { return { name: e.name, bytes: out }; });
        }));
    };

    return self;
})();
