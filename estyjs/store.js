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
//   boxes    key id     { title, items }
//   disks    key id     { box, title, hasLabel, accent, body, writeProtected,
//                         blob, name, format, created, modified }
//   states   key id     { name, created, format, machine, rom, drives, thumbnail }
//
// Binary content is kept once in blobs, keyed by its SHA-256 in hex. refs
// counts the records using a blob, which goes when the count reaches 0.
//
// items runs from the back of the box to the front: { disk: id } or
// { sep: name, side: 'L' or 'R', id }. A disk is in one box. Its blob is the
// image file, name the file it came from.
//
// In a state, machine and rom are blob hashes, drives is
// { A: { blob, name, disk } or null, B: ... } (disk is the id of the disk in
// the box it came from, or null), thumbnail a PNG.
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

    // One connection for the page, also when opened from several places at
    // once. A second one would block the upgrade of a newer EstyJS.
    var opening = null;
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
        if (opening != null) return opening;
        if (typeof indexedDB == 'undefined') {
            return Promise.reject(new Error('This browser offers no storage (IndexedDB).'));
        }

        opening = new Promise(function (resolve, reject) {
            var request = indexedDB.open(NAME, VERSION);

            request.onupgradeneeded = function () {
                var d = request.result;
                if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'hash' });
                if (!d.objectStoreNames.contains('disks')) d.createObjectStore('disks', { keyPath: 'id', autoIncrement: true });
                if (!d.objectStoreNames.contains('boxes')) d.createObjectStore('boxes', { keyPath: 'id', autoIncrement: true });
                if (!d.objectStoreNames.contains('states')) d.createObjectStore('states', { keyPath: 'id', autoIncrement: true });
            };

            request.onsuccess = function () {
                var db = request.result;
                // a newer EstyJS in another tab wants to upgrade
                db.onversionchange = function () { db.close(); opening = null; };
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
        opening.catch(function () { opening = null; });
        return opening;
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
    // machine and rom as bytes and drives as { A: { bytes, name, disk } or
    // null, B }.
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
                    record.drives[drive] = { blob: hashes[next], name: disk.name || '', disk: disk.disk || null };
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

    // { record, machine, rom, drives: { A: { bytes, name, disk } or null, B } }, with
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
                    return bytes(disk.blob).then(function (b) {
                        return { bytes: b, name: disk.name, disk: disk.disk || null };
                    });
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

    /* ------------------------------------------------- boxes and disks */

    self.listBoxes = function () {
        return self.open().then(function (d) {
            return promise(d.transaction('boxes').objectStore('boxes').getAll());
        });
    };

    self.getBox = function (id) {
        return self.open().then(function (d) {
            return promise(d.transaction('boxes').objectStore('boxes').get(id));
        });
    };

    // Returns the id.
    self.addBox = function (title) {
        return self.open().then(function (d) {
            persist();
            return promise(d.transaction('boxes', 'readwrite').objectStore('boxes').add({ title: title, items: [] }));
        });
    };

    // Title and the order of items. Disks come and go through addDisk,
    // removeDisk and moveDisk.
    self.saveBox = function (box) {
        return self.open().then(function (d) {
            var tx = d.transaction('boxes', 'readwrite');
            tx.objectStore('boxes').put(box);
            return done(tx);
        });
    };

    // With the disks in it.
    self.deleteBox = function (id) {
        return self.open().then(function (d) {
            var tx = d.transaction(['blobs', 'boxes', 'disks'], 'readwrite');
            var disks = tx.objectStore('disks');
            disks.getAll().onsuccess = function (e) {
                var hashes = [];
                e.target.result.forEach(function (disk) {
                    if (disk.box != id) return;
                    hashes.push(disk.blob);
                    disks.delete(disk.id);
                });
                dropRefs(tx.objectStore('blobs'), hashes);
            };
            tx.objectStore('boxes').delete(id);
            return done(tx);
        });
    };

    // The disk records of a box, without their images.
    self.listDisks = function (boxId) {
        return self.open().then(function (d) {
            return promise(d.transaction('disks').objectStore('disks').getAll());
        }).then(function (disks) {
            return disks.filter(function (disk) { return disk.box == boxId; });
        });
    };

    self.getDisk = function (id) {
        return self.open().then(function (d) {
            return promise(d.transaction('disks').objectStore('disks').get(id));
        });
    };

    self.getDiskBytes = function (id) {
        return self.open().then(function (d) {
            var tx = d.transaction(['blobs', 'disks']);
            return promise(tx.objectStore('disks').get(id)).then(function (disk) {
                if (disk == null) throw new Error('The disk is gone.');
                return promise(tx.objectStore('blobs').get(disk.blob));
            }).then(function (blob) {
                if (blob == null) throw new Error('The image of the disk is missing.');
                return blob.bytes;
            });
        });
    };

    function placeIn(box, diskId, at) {
        var item = { disk: diskId };
        if (at == null || at < 0 || at > box.items.length) box.items.push(item);
        else box.items.splice(at, 0, item);
    }

    // disk: { title, hasLabel, accent, body, writeProtected, name, format,
    // bytes }. at is the index in items, null for the front. Returns the id.
    self.addDisk = function (boxId, disk, at) {
        return self.hash(disk.bytes).then(function (hash) {
            return self.open().then(function (d) {
                persist();
                var now = Date.now();
                var record = {
                    box: boxId, title: disk.title || '', hasLabel: disk.hasLabel !== false,
                    accent: disk.accent, body: disk.body, writeProtected: !!disk.writeProtected,
                    blob: hash, name: disk.name || '', format: disk.format || '',
                    created: now, modified: now
                };

                var tx = d.transaction(['blobs', 'boxes', 'disks'], 'readwrite');
                var boxes = tx.objectStore('boxes');
                var counts = {};
                counts[hash] = { bytes: disk.bytes, n: 1 };
                addRefs(tx.objectStore('blobs'), counts);

                var id = null;
                tx.objectStore('disks').add(record).onsuccess = function (e) {
                    id = e.target.result;
                    boxes.get(boxId).onsuccess = function (e) {
                        var box = e.target.result;
                        if (box == null) { tx.abort(); return; }
                        placeIn(box, id, at);
                        boxes.put(box);
                    };
                };
                return done(tx).then(function () { return id; });
            });
        });
    };

    // title, hasLabel, accent, body, writeProtected
    self.updateDisk = function (id, fields) {
        return self.open().then(function (d) {
            var tx = d.transaction('disks', 'readwrite');
            var disks = tx.objectStore('disks');
            disks.get(id).onsuccess = function (e) {
                var disk = e.target.result;
                if (disk == null) return;
                ['title', 'hasLabel', 'accent', 'body', 'writeProtected'].forEach(function (key) {
                    if (fields.hasOwnProperty(key)) disk[key] = fields[key];
                });
                disks.put(disk);
            };
            return done(tx);
        });
    };

    // The image after the ST wrote to it. States keep the blob they hold.
    self.writeDisk = function (id, bytes, format) {
        return self.hash(bytes).then(function (hash) {
            return self.open().then(function (d) {
                var tx = d.transaction(['blobs', 'disks'], 'readwrite');
                var blobs = tx.objectStore('blobs');
                var disks = tx.objectStore('disks');
                disks.get(id).onsuccess = function (e) {
                    var disk = e.target.result;
                    if (disk == null || disk.blob == hash) return;
                    var counts = {};
                    counts[hash] = { bytes: bytes, n: 1 };
                    addRefs(blobs, counts);
                    dropRefs(blobs, [disk.blob]);
                    disk.blob = hash;
                    disk.format = format;
                    disk.modified = Date.now();
                    disks.put(disk);
                };
                return done(tx);
            });
        });
    };

    function takeOut(boxes, boxId, diskId, then) {
        boxes.get(boxId).onsuccess = function (e) {
            var box = e.target.result;
            if (box != null) {
                box.items = box.items.filter(function (item) { return item.disk != diskId; });
                boxes.put(box);
            }
            if (then) then();
        };
    }

    self.removeDisk = function (id) {
        return self.open().then(function (d) {
            var tx = d.transaction(['blobs', 'boxes', 'disks'], 'readwrite');
            var disks = tx.objectStore('disks');
            disks.get(id).onsuccess = function (e) {
                var disk = e.target.result;
                if (disk == null) return;
                takeOut(tx.objectStore('boxes'), disk.box, id);
                dropRefs(tx.objectStore('blobs'), [disk.blob]);
                disks.delete(id);
            };
            return done(tx);
        });
    };

    // To the front of another box.
    self.moveDisk = function (id, toBox) {
        return self.open().then(function (d) {
            var tx = d.transaction(['boxes', 'disks'], 'readwrite');
            var boxes = tx.objectStore('boxes');
            var disks = tx.objectStore('disks');
            disks.get(id).onsuccess = function (e) {
                var disk = e.target.result;
                if (disk == null || disk.box == toBox) return;
                takeOut(boxes, disk.box, id, function () {
                    boxes.get(toBox).onsuccess = function (e) {
                        var box = e.target.result;
                        if (box == null) { tx.abort(); return; }
                        placeIn(box, id, null);
                        boxes.put(box);
                        disk.box = toBox;
                        disks.put(disk);
                    };
                });
            };
            return done(tx);
        });
    };

    // A second disk with the same image and label, at the front of a box.
    // Returns the id.
    self.copyDisk = function (id, toBox) {
        return self.open().then(function (d) {
            var tx = d.transaction(['blobs', 'boxes', 'disks'], 'readwrite');
            var boxes = tx.objectStore('boxes');
            var disks = tx.objectStore('disks');
            var copyId = null;
            disks.get(id).onsuccess = function (e) {
                var disk = e.target.result;
                if (disk == null) return;
                var copy = Object.assign({}, disk, { box: toBox, created: Date.now() });
                delete copy.id;
                var counts = {};
                counts[disk.blob] = { bytes: null, n: 1 };
                addRefs(tx.objectStore('blobs'), counts);
                disks.add(copy).onsuccess = function (e) {
                    copyId = e.target.result;
                    boxes.get(toBox).onsuccess = function (e) {
                        var box = e.target.result;
                        if (box == null) { tx.abort(); return; }
                        placeIn(box, copyId, null);
                        boxes.put(box);
                    };
                };
            };
            return done(tx).then(function () { return copyId; });
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

    /* ----------------------------------------- box export and import */

    // Version of box.json and the .json beside each disk.
    var BOX_VERSION = 1;

    var EXTENSIONS = { ST: '.st', MSA: '.msa', STX: '.stx' };

    function extensionOf(name) {
        var dot = name.lastIndexOf('.');
        return dot < 0 ? '' : name.slice(dot).toLowerCase();
    }

    // A file or folder name from a label: no characters file systems refuse,
    // and unique in its folder (taken holds the names used, in lower case).
    function fileName(text, extension, taken) {
        var base = (text || '').replace(/[\\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim();
        base = (base || 'Disk').slice(0, 60);
        var name = base + extension;
        for (var n = 2; taken[name.toLowerCase()]; n++) name = base + ' (' + n + ')' + extension;
        taken[name.toLowerCase()] = true;
        return name;
    }

    function json(value) {
        return new TextEncoder().encode(JSON.stringify(value, null, 1));
    }

    // A ZIP with a folder per box: box.json, the disk images named after
    // their labels with a .json beside each, and a folder per divider holding
    // the disks behind it. Unsorted disks sit in the box folder. box.json is
    // { version, title, items }, items as in a box with paths for disk ids.
    self.exportBoxes = function (ids) {
        var files = [];
        var boxNames = {};

        return ids.reduce(function (chain, id) {
            return chain.then(function () {
                return Promise.all([self.getBox(id), self.listDisks(id)]);
            }).then(function (r) {
                var box = r[0];
                var disks = {};
                r[1].forEach(function (disk) { disks[disk.id] = disk; });

                var folder = fileName(box.title, '', boxNames) + '/';
                var taken = { '': {} };
                var paths = {};
                var dir = '';

                // a disk belongs to the divider in front of it
                for (var i = box.items.length - 1; i >= 0; i--) {
                    var item = box.items[i];
                    if (item.sep != null) {
                        dir = fileName(item.sep, '', taken['']) + '/';
                        taken[dir] = {};
                        item.path = dir.slice(0, -1);
                    } else if (disks[item.disk]) {
                        var disk = disks[item.disk];
                        var title = disk.title.split('\n')[0] || disk.name.replace(/\.[^.]+$/, '');
                        paths[item.disk] = dir + fileName(title, EXTENSIONS[disk.format] || '.st', taken[dir]);
                    }
                }

                var items = [];
                box.items.forEach(function (item) {
                    if (item.sep != null) items.push({ sep: item.sep, side: item.side, folder: item.path });
                    else if (paths[item.disk]) items.push({ disk: paths[item.disk] });
                });
                files.push({ name: folder + 'box.json', bytes: json({ version: BOX_VERSION, title: box.title, items: items }) });

                return r[1].reduce(function (chain, disk) {
                    if (paths[disk.id] == null) return chain;
                    return chain.then(function () {
                        return self.getDiskBytes(disk.id);
                    }).then(function (bytes) {
                        var path = folder + paths[disk.id];
                        files.push({ name: path, bytes: bytes });
                        files.push({
                            name: path.replace(/\.[^.\/]+$/, '.json'), bytes: json({
                                version: BOX_VERSION, title: disk.title, hasLabel: disk.hasLabel,
                                accent: disk.accent, body: disk.body, writeProtected: disk.writeProtected,
                                name: disk.name, created: disk.created, modified: disk.modified
                            })
                        });
                    });
                }, Promise.resolve());
            });
        }, Promise.resolve()).then(function () {
            return EstyJs.zip.write(files);
        });
    };

    // entries from the back to the front: { sep, side } or { disk } with the
    // disk as for addDisk. One transaction. Returns the id.
    self.addBoxWithDisks = function (title, entries) {
        var disks = entries.filter(function (e) { return e.disk; });

        return Promise.all(disks.map(function (e) { return self.hash(e.disk.bytes); })).then(function (hashes) {
            return self.open().then(function (d) {
                persist();
                var tx = d.transaction(['blobs', 'boxes', 'disks'], 'readwrite');
                var boxes = tx.objectStore('boxes');
                var store = tx.objectStore('disks');
                var now = Date.now();

                var counts = {};
                disks.forEach(function (e, i) {
                    if (counts[hashes[i]]) counts[hashes[i]].n++;
                    else counts[hashes[i]] = { bytes: e.disk.bytes, n: 1 };
                });
                addRefs(tx.objectStore('blobs'), counts);

                var boxId = null;
                boxes.add({ title: title, items: [] }).onsuccess = function (e) {
                    boxId = e.target.result;
                    var items = [];
                    var left = disks.length;
                    var next = 0;

                    function finish() {
                        boxes.put({ id: boxId, title: title, items: items });
                    }

                    entries.forEach(function (entry, i) {
                        if (entry.sep != null) {
                            items[i] = { sep: entry.sep, side: entry.side == 'R' ? 'R' : 'L',
                                         id: Math.random().toString(36).slice(2, 10) };
                            return;
                        }
                        var disk = entry.disk;
                        var record = {
                            box: boxId, title: disk.title || '', hasLabel: disk.hasLabel !== false,
                            accent: disk.accent, body: disk.body, writeProtected: !!disk.writeProtected,
                            blob: hashes[next++], name: disk.name || '', format: disk.format || '',
                            created: disk.created || now, modified: disk.modified || now
                        };
                        store.add(record).onsuccess = function (e) {
                            items[i] = { disk: e.target.result };
                            if (--left == 0) finish();
                        };
                    });
                    if (left == 0) finish();
                };
                return done(tx).then(function () { return boxId; });
            });
        });
    };

    // Adds the boxes in a ZIP: one per top level folder, files outside a
    // folder go into a box named after the ZIP. Without box.json the disks
    // in the box folder are unsorted, and each folder below it becomes a
    // divider with the disks behind it, in alphabetical order. Files that are
    // no disk image EstyJS reads are left out. More than 60 items go on into
    // a second box. Returns { boxes: [ids], disks, skipped }.
    self.importBoxes = function (bytes, zipName) {
        return EstyJs.zip.read(bytes).then(function (files) {
            var groups = {};
            var order = [];
            var fallback = (zipName || 'Disks').replace(/\.zip$/i, '');

            files.forEach(function (f) {
                var parts = f.name.split('/');
                var group = parts.length > 1 ? parts.shift() : fallback;
                if (!groups[group]) { groups[group] = {}; order.push(group); }
                groups[group][parts.join('/')] = f.bytes;
            });

            var result = { boxes: [], disks: 0, skipped: 0 };

            function image(group, path) {
                var b = groups[group][path];
                if (b == null) return null;
                var disk = EstyJs.diskImage.load(b.slice(0).buffer);
                if (disk == null) { result.skipped++; return null; }

                var meta = {};
                var side = groups[group][path.replace(/\.[^.\/]+$/, '.json')];
                if (side) {
                    try { meta = JSON.parse(new TextDecoder().decode(side)); } catch (e) { meta = {}; }
                }
                var name = path.split('/').pop();
                return {
                    title: typeof meta.title == 'string' ? meta.title : name.replace(/\.[^.]+$/, ''),
                    hasLabel: meta.hasLabel, accent: meta.accent, body: meta.body,
                    writeProtected: meta.writeProtected || !disk.writable,
                    name: meta.name || name, format: disk.format, bytes: b,
                    created: meta.created, modified: meta.modified
                };
            }

            function isImage(path) {
                return ['.st', '.msa', '.stx'].indexOf(extensionOf(path)) >= 0;
            }

            function entriesOf(group) {
                var paths = Object.keys(groups[group]);
                var entries = [];
                var used = {};
                var index = null;

                if (groups[group]['box.json']) {
                    try { index = JSON.parse(new TextDecoder().decode(groups[group]['box.json'])); } catch (e) { index = null; }
                }

                if (index && Array.isArray(index.items)) {
                    index.items.forEach(function (item) {
                        if (item.sep != null) {
                            entries.push({ sep: String(item.sep).slice(0, 24), side: item.side });
                        } else if (typeof item.disk == 'string' && !used[item.disk]) {
                            used[item.disk] = true;
                            var disk = image(group, item.disk);
                            if (disk) entries.push({ disk: disk });
                        }
                    });
                    // images box.json does not list go to the front
                    paths.sort().forEach(function (path) {
                        if (used[path] || !isImage(path)) return;
                        var disk = image(group, path);
                        if (disk) entries.push({ disk: disk });
                    });
                    return { title: typeof index.title == 'string' ? index.title : group, entries: entries };
                }

                // from the front: the box folder, then a divider per folder
                var front = [];
                var folders = {};
                paths.sort().forEach(function (path) {
                    if (!isImage(path)) {
                        if (extensionOf(path) != '.json') result.skipped++;
                        return;
                    }
                    var parts = path.split('/');
                    if (parts.length == 1) front.push(path);
                    else (folders[parts[0]] = folders[parts[0]] || []).push(path);
                });

                var fromFront = [];
                front.forEach(function (path) { fromFront.push({ path: path }); });
                Object.keys(folders).sort().forEach(function (folder, i) {
                    fromFront.push({ sep: folder.toUpperCase().slice(0, 24), side: i % 2 ? 'R' : 'L' });
                    folders[folder].forEach(function (path) { fromFront.push({ path: path }); });
                });

                fromFront.reverse().forEach(function (e) {
                    if (e.sep != null) { entries.push(e); return; }
                    var disk = image(group, e.path);
                    if (disk) entries.push({ disk: disk });
                });
                return { title: group, entries: entries };
            }

            return order.reduce(function (chain, group) {
                return chain.then(function () {
                    var box = entriesOf(group);
                    var parts = [];
                    for (var i = 0; i < box.entries.length || i == 0; i += 60) parts.push(box.entries.slice(i, i + 60));
                    return parts.reduce(function (chain, entries, n) {
                        return chain.then(function () {
                            var title = n ? box.title + ' (' + (n + 1) + ')' : box.title;
                            return self.addBoxWithDisks(title, entries).then(function (id) {
                                result.boxes.push(id);
                                result.disks += entries.filter(function (e) { return e.disk; }).length;
                            });
                        });
                    }, Promise.resolve());
                });
            }, Promise.resolve()).then(function () { return result; });
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
