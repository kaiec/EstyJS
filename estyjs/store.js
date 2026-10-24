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


// storage in the browser, IndexedDB database "estyjs"
//
//   blobs    key hash   { hash, bytes, refs }
//   disks    key id     disks in the disk box
//   boxes    key id     disk boxes
//   states   key id     { name, created, format, machine, rom, drives, thumbnail }
//
// Binary content is kept once in blobs, keyed by its SHA-256 in hex. refs
// counts the records using a blob, which goes when the count reaches 0.
// In a state, machine and rom are blob hashes, drives is
// { A: { blob, name } or null, B: ... }, thumbnail a PNG.
//
// All functions return promises. The schema only grows: an older EstyJS
// (under ver/, same origin) refuses to open a newer database.
"use strict";

EstyJs.store = (function () {
    var self = {};

    var NAME = 'estyjs';
    var VERSION = 1;

    // Version of the export format.
    var EXPORT_VERSION = 1;

    var db = null;
    var persistAsked = false;

    function promise(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error); };
        });
    }

    function done(tx) {
        return new Promise(function (resolve, reject) {
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(readable(tx.error)); };
            tx.onabort = function () { reject(readable(tx.error)); };
        });
    }

    function readable(error) {
        if (error && error.name == 'QuotaExceededError') {
            return new Error('The browser has no more room for EstyJS.');
        }
        return error || new Error('The storage transaction was aborted.');
    }

    self.open = function () {
        if (db != null) return Promise.resolve(db);
        if (typeof indexedDB == 'undefined') {
            return Promise.reject(new Error('This browser offers no storage (IndexedDB).'));
        }

        return new Promise(function (resolve, reject) {
            var request = indexedDB.open(NAME, VERSION);

            request.onupgradeneeded = function () {
                var d = request.result;
                if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'hash' });
                if (!d.objectStoreNames.contains('disks')) d.createObjectStore('disks', { keyPath: 'id', autoIncrement: true });
                if (!d.objectStoreNames.contains('boxes')) d.createObjectStore('boxes', { keyPath: 'id', autoIncrement: true });
                if (!d.objectStoreNames.contains('states')) d.createObjectStore('states', { keyPath: 'id', autoIncrement: true });
            };

            request.onsuccess = function () {
                db = request.result;
                // a newer EstyJS in another tab wants to upgrade
                db.onversionchange = function () { db.close(); db = null; };
                resolve(db);
            };

            request.onerror = function () {
                var e = request.error;
                if (e && e.name == 'VersionError') {
                    e = new Error('The storage was set up by a newer EstyJS. Open that version to use it.');
                }
                reject(e);
            };

            request.onblocked = function () {
                reject(new Error('Another tab with an older EstyJS holds the storage. Close it and reload.'));
            };
        });
    };

    // Safari otherwise deletes the storage of a site not visited for 7 days.
    function persist() {
        if (persistAsked) return;
        persistAsked = true;
        if (typeof navigator != 'undefined' && navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().catch(function () { });
        }
    }

    self.hash = function (bytes) {
        return crypto.subtle.digest('SHA-256', bytes).then(function (digest) {
            return Array.from(new Uint8Array(digest), function (b) {
                return (b < 16 ? '0' : '') + b.toString(16);
            }).join('');
        });
    };

    /* ---------------------------------------------------------- blobs */

    // counts: hash -> { bytes, n }, bytes needed where the blob may be new
    function addRefs(blobs, counts) {
        Object.keys(counts).forEach(function (hash) {
            blobs.get(hash).onsuccess = function (e) {
                var blob = e.target.result;
                if (blob) {
                    blob.refs += counts[hash].n;
                } else {
                    blob = { hash: hash, bytes: counts[hash].bytes, refs: counts[hash].n };
                }
                blobs.put(blob);
            };
        });
    }

    function dropRefs(blobs, hashes) {
        hashes.forEach(function (hash) {
            blobs.get(hash).onsuccess = function (e) {
                var blob = e.target.result;
                if (blob == null) return;
                blob.refs--;
                if (blob.refs > 0) blobs.put(blob);
                else blobs.delete(hash);
            };
        });
    }

    function stateHashes(record) {
        var hashes = [record.machine, record.rom];
        ['A', 'B'].forEach(function (drive) {
            if (record.drives[drive]) hashes.push(record.drives[drive].blob);
        });
        return hashes;
    }

    /* --------------------------------------------------------- states */

    // state: { name, created, format, machine, rom, drives, thumbnail } with
    // machine and rom as bytes and drives as { A: { bytes, name } or null, B }.
    // Returns the id.
    self.addState = function (state) {
        var parts = [state.machine, state.rom];
        ['A', 'B'].forEach(function (drive) {
            if (state.drives[drive]) parts.push(state.drives[drive].bytes);
        });

        return Promise.all(parts.map(self.hash)).then(function (hashes) {
            return self.open().then(function (d) {
                persist();

                var record = {
                    name: state.name,
                    created: state.created,
                    format: state.format,
                    machine: hashes[0],
                    rom: hashes[1],
                    drives: { A: null, B: null },
                    thumbnail: state.thumbnail || null
                };

                var counts = {};
                function count(hash, bytes) {
                    if (counts[hash]) counts[hash].n++;
                    else counts[hash] = { bytes: bytes, n: 1 };
                }
                count(hashes[0], state.machine);
                count(hashes[1], state.rom);

                var next = 2;
                ['A', 'B'].forEach(function (drive) {
                    var disk = state.drives[drive];
                    if (disk == null) return;
                    record.drives[drive] = { blob: hashes[next], name: disk.name || '' };
                    count(hashes[next], disk.bytes);
                    next++;
                });

                var tx = d.transaction(['blobs', 'states'], 'readwrite');
                addRefs(tx.objectStore('blobs'), counts);
                var id = null;
                tx.objectStore('states').add(record).onsuccess = function (e) { id = e.target.result; };
                return done(tx).then(function () { return id; });
            });
        });
    };

    // The records, newest first, without their blobs.
    self.listStates = function () {
        return self.open().then(function (d) {
            return promise(d.transaction('states').objectStore('states').getAll());
        }).then(function (records) {
            return records.sort(function (a, b) { return b.created - a.created; });
        });
    };

    // { record, machine, rom, drives: { A: { bytes, name } or null, B } }, with
    // machine as an ArrayBuffer (an imported one is stored as a Uint8Array).
    self.getState = function (id) {
        return self.open().then(function (d) {
            var tx = d.transaction(['blobs', 'states']);
            var blobs = tx.objectStore('blobs');

            return promise(tx.objectStore('states').get(id)).then(function (record) {
                if (record == null) throw new Error('The state is gone.');

                function bytes(hash) {
                    return promise(blobs.get(hash)).then(function (blob) {
                        if (blob == null) throw new Error('Part of the state is missing.');
                        return blob.bytes;
                    });
                }

                function drive(name) {
                    var disk = record.drives[name];
                    if (disk == null) return Promise.resolve(null);
                    return bytes(disk.blob).then(function (b) { return { bytes: b, name: disk.name }; });
                }

                return Promise.all([bytes(record.machine), bytes(record.rom), drive('A'), drive('B')])
                    .then(function (r) {
                        var machine = r[0] instanceof ArrayBuffer ? r[0] : r[0].slice(0).buffer;
                        return { record: record, machine: machine, rom: r[1], drives: { A: r[2], B: r[3] } };
                    });
            });
        });
    };

    self.renameState = function (id, name) {
        return self.open().then(function (d) {
            var tx = d.transaction('states', 'readwrite');
            var states = tx.objectStore('states');
            states.get(id).onsuccess = function (e) {
                var record = e.target.result;
                if (record == null) return;
                record.name = name;
                states.put(record);
            };
            return done(tx);
        });
    };

    self.deleteState = function (id) {
        return self.open().then(function (d) {
            var tx = d.transaction(['blobs', 'states'], 'readwrite');
            var states = tx.objectStore('states');
            states.get(id).onsuccess = function (e) {
                var record = e.target.result;
                if (record == null) return;
                dropRefs(tx.objectStore('blobs'), stateHashes(record));
                states.delete(id);
            };
            return done(tx);
        });
    };

    // Number of blobs, for the checks.
    self.countBlobs = function () {
        return self.open().then(function (d) {
            return promise(d.transaction('blobs').objectStore('blobs').count());
        });
    };

    /* ----------------------------------------------- export and import */

    // A ZIP holding states.json, blobs/<hash> and thumbnails/<n>.png.
    // states.json is { version, states: [record without id] }, with each
    // thumbnail replaced by its file name.
    self.exportStates = function (ids) {
        return Promise.all(ids.map(self.getState)).then(function (states) {
            var files = [];
            var seen = {};
            var list = [];

            function blob(hash, bytes) {
                if (seen[hash]) return;
                seen[hash] = true;
                files.push({ name: 'blobs/' + hash, bytes: bytes });
            }

            states.forEach(function (s, i) {
                var r = s.record;
                var entry = {
                    name: r.name, created: r.created, format: r.format,
                    machine: r.machine, rom: r.rom, drives: r.drives, thumbnail: null
                };
                blob(r.machine, s.machine);
                blob(r.rom, s.rom);
                ['A', 'B'].forEach(function (drive) {
                    if (r.drives[drive]) blob(r.drives[drive].blob, s.drives[drive].bytes);
                });
                if (r.thumbnail) {
                    entry.thumbnail = 'thumbnails/' + (i + 1) + '.png';
                    files.push({ name: entry.thumbnail, bytes: new Uint8Array(r.thumbnail) });
                }
                list.push(entry);
            });

            var json = JSON.stringify({ version: EXPORT_VERSION, states: list }, null, 1);
            files.unshift({ name: 'states.json', bytes: new TextEncoder().encode(json) });
            return EstyJs.zip.write(files);
        });
    };

    // Adds the states in an export. Returns the new ids.
    self.importStates = function (bytes) {
        return EstyJs.zip.read(bytes).then(function (files) {
            var byName = {};
            files.forEach(function (f) { byName[f.name] = f.bytes; });

            if (byName['states.json'] == null) throw new Error('This is not an EstyJS state export.');
            var index = JSON.parse(new TextDecoder().decode(byName['states.json']));
            if (index.version != EXPORT_VERSION) {
                throw new Error('This state export is from another EstyJS version.');
            }

            function blob(hash) {
                var b = byName['blobs/' + hash];
                if (b == null) throw new Error('The export misses ' + hash + '.');
                return b;
            }

            var states = index.states.map(function (e) {
                var drives = { A: null, B: null };
                ['A', 'B'].forEach(function (drive) {
                    var disk = e.drives && e.drives[drive];
                    if (disk) drives[drive] = { bytes: blob(disk.blob), name: disk.name };
                });
                return {
                    name: e.name, created: e.created, format: e.format,
                    machine: blob(e.machine), rom: blob(e.rom), drives: drives,
                    thumbnail: e.thumbnail && byName[e.thumbnail] ? byName[e.thumbnail].buffer : null
                };
            });

            // one after the other, so the reference counts add up
            var ids = [];
            return states.reduce(function (chain, state) {
                return chain.then(function () {
                    return self.addState(state).then(function (id) { ids.push(id); });
                });
            }, Promise.resolve()).then(function () { return ids; });
        });
    };

    // { usage, quota } in bytes, or null where the browser does not say.
    self.estimate = function () {
        if (typeof navigator == 'undefined' || !navigator.storage || !navigator.storage.estimate) {
            return Promise.resolve(null);
        }
        return navigator.storage.estimate().catch(function () { return null; });
    };

    return self;
})();
