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


// the saved states panel
//
// Save state keeps the machine, the disks in the drives and the ROM in the
// browser, with a picture of the screen. The panel lists the states, newest
// first, to load, rename, export or delete. Export writes a ZIP that Import
// reads back, in this browser or another.
"use strict";

var EstyStates = (function () {
    var self = {};

    var THUMB_WIDTH = 160, THUMB_HEIGHT = 100;

    var panel = null;
    var list = null;
    var usage = null;
    var importInput = null;
    var thumbUrls = [];

    // The state last loaded or saved. The next save takes its name, renames
    // included.
    var current = { id: null, name: null };

    function button(label, action) {
        var b = document.createElement('button');
        b.className = 'st-button';
        b.textContent = label;
        b.addEventListener('click', action);
        return b;
    }

    function megabytes(n) {
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function when(created) {
        return new Date(created).toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    function fileName(name) {
        return name.replace(/[\\\/:*?"<>|]/g, '_') + '.zip';
    }

    function download(bytes, name) {
        var url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    }

    // The screen as a small PNG, or null.
    function thumbnail() {
        var screen = document.getElementById('EstyJsOutput');
        if (screen == null) return Promise.resolve(null);

        var canvas = document.createElement('canvas');
        canvas.width = THUMB_WIDTH;
        canvas.height = THUMB_HEIGHT;
        canvas.getContext('2d').drawImage(screen, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);

        return new Promise(function (resolve) {
            canvas.toBlob(function (blob) {
                if (blob == null) resolve(null);
                else blob.arrayBuffer().then(resolve, function () { resolve(null); });
            }, 'image/png');
        });
    }

    function failed(what) {
        return function (e) {
            diskMessage(what + ': ' + (e && e.message ? e.message : e), true);
        };
    }

    /* ------------------------------------------------------- the list */

    function row(record) {
        var li = document.createElement('li');
        li.className = 'st-row';

        var img = document.createElement('img');
        img.className = 'st-thumb';
        img.width = THUMB_WIDTH;
        img.height = THUMB_HEIGHT;
        img.alt = '';
        if (record.thumbnail) {
            var url = URL.createObjectURL(new Blob([record.thumbnail], { type: 'image/png' }));
            thumbUrls.push(url);
            img.src = url;
        }

        var info = document.createElement('div');
        info.className = 'st-info';

        var name = document.createElement('input');
        name.className = 'st-name';
        name.value = record.name;
        name.setAttribute('aria-label', 'Name');
        //Enter finishes, so that keys go to the ST again. On release, so the
        //release does not reach the ST either.
        name.addEventListener('keyup', function (e) {
            if (e.key == 'Enter') name.blur();
        });
        name.addEventListener('change', function () {
            var value = name.value.trim() || record.name;
            name.value = value;
            EstyJs.store.renameState(record.id, value).then(function () {
                record.name = value;
                if (current.id == record.id) current.name = value;
            }, failed('Could not rename the state'));
        });

        var meta = document.createElement('div');
        meta.className = 'st-meta';
        var drives = ['A', 'B'].map(function (d) {
            var disk = record.drives[d];
            return d + ': ' + (disk ? disk.name || 'disk' : 'empty');
        });
        meta.textContent = when(record.created) + '. ' + drives.join(', ') + '.';

        info.appendChild(name);
        info.appendChild(meta);

        var actions = document.createElement('div');
        actions.className = 'st-actions';

        var load = button('Load', function () { self.load(record.id); });
        if (record.format != estyjs.getStateFormat()) {
            load.disabled = true;
            var note = document.createElement('div');
            note.className = 'st-meta problem';
            note.textContent = 'Saved by another version of EstyJS. Cannot be loaded here.';
            info.appendChild(note);
        }

        actions.appendChild(load);
        actions.appendChild(button('Export', function () {
            EstyJs.store.exportStates([record.id]).then(function (zip) {
                download(zip, fileName(record.name));
            }, failed('Could not export the state'));
        }));
        actions.appendChild(button('Delete', function () {
            if (!confirm('Delete the state "' + record.name + '"?')) return;
            EstyJs.store.deleteState(record.id).then(self.refresh, failed('Could not delete the state'));
        }));

        li.appendChild(img);
        li.appendChild(info);
        li.appendChild(actions);
        return li;
    }

    self.refresh = function () {
        if (list == null) return Promise.resolve();

        return EstyJs.store.listStates().then(function (records) {
            thumbUrls.forEach(URL.revokeObjectURL);
            thumbUrls = [];
            list.textContent = '';

            if (records.length == 0) {
                var empty = document.createElement('li');
                empty.className = 'st-empty';
                empty.textContent = 'No saved states.';
                list.appendChild(empty);
            }
            records.forEach(function (r) { list.appendChild(row(r)); });

            return EstyJs.store.estimate();
        }).then(function (estimate) {
            usage.textContent = estimate ? 'Storage in use: ' + megabytes(estimate.usage) + '.' : '';
        }, function (e) {
            list.textContent = '';
            usage.textContent = e.message;
        });
    };

    /* ---------------------------------------------------- the actions */

    // The id of the disk in the disk box the drive holds, or null.
    function diskIn(drive) {
        return typeof EstyDiskbox != 'undefined' ? EstyDiskbox.diskInDrive(drive) : null;
    }

    self.save = function () {
        var state = estyjs.saveState();
        var name = current.name || driveNames.A || 'No disk';

        return thumbnail().then(function (png) {
            return EstyJs.store.addState({
                name: name,
                created: Date.now(),
                format: estyjs.getStateFormat(),
                machine: state.machine,
                rom: state.rom,
                drives: {
                    A: state.disks.A ? { bytes: state.disks.A, name: driveNames.A, disk: diskIn('A') } : null,
                    B: state.disks.B ? { bytes: state.disks.B, name: driveNames.B, disk: diskIn('B') } : null
                },
                thumbnail: png
            });
        }).then(function (id) {
            current = { id: id, name: name };
            diskMessage('Saved the state "' + name + '".', false);
            return self.refresh();
        }, failed('Could not save the state'));
    };

    self.load = function (id) {
        var s = null;
        return EstyJs.store.getState(id).then(function (loaded) {
            s = loaded;
            //disks from the box go back first, with what the ST wrote to them
            return typeof EstyDiskbox != 'undefined' ? EstyDiskbox.takeOutAll() : null;
        }).then(function () {
            estyjs.restoreState({
                machine: s.machine,
                rom: s.rom,
                disks: {
                    A: s.drives.A ? s.drives.A.bytes : null,
                    B: s.drives.B ? s.drives.B.bytes : null
                }
            });
            estyjs.releaseHostInput();
            if (typeof EstyDiskbox != 'undefined') EstyDiskbox.stateLoaded(s.drives);

            ['A', 'B'].forEach(function (d) {
                driveNames[d] = s.drives[d] ? s.drives[d].name : null;
                showDrive(d, s.drives[d] != null);
            });
            showMonitor();
            current = { id: id, name: s.record.name };
            diskMessage('Loaded the state "' + s.record.name + '".', false);
        }).catch(failed('Could not load the state'));
    };

    // Opens the panel.
    self.show = function () {
        if (panel == null) return;
        panel.open = true;
        panel.scrollIntoView({ block: 'nearest' });
    };

    function exportAll() {
        EstyJs.store.listStates().then(function (records) {
            if (records.length == 0) {
                diskMessage('There are no states to export.', false);
                return;
            }
            return EstyJs.store.exportStates(records.map(function (r) { return r.id; })).then(function (zip) {
                download(zip, 'EstyJS states.zip');
            });
        }).catch(failed('Could not export the states'));
    }

    function imported() {
        var file = importInput.files[0];
        importInput.value = '';
        if (file == null) return;

        file.arrayBuffer().then(function (buffer) {
            return EstyJs.store.importStates(new Uint8Array(buffer));
        }).then(function (ids) {
            diskMessage('Imported ' + ids.length + (ids.length == 1 ? ' state' : ' states') +
                        ' from ' + file.name + '.', false);
            return self.refresh();
        }).catch(failed('Could not import ' + file.name));
    }

    self.create = function (panelId, containerId) {
        panel = document.getElementById(panelId);
        var container = document.getElementById(containerId);
        if (container == null) return;

        importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.zip';
        importInput.hidden = true;
        importInput.addEventListener('change', imported);

        var tools = document.createElement('div');
        tools.className = 'st-tools';
        tools.appendChild(button('Export all', exportAll));
        tools.appendChild(button('Import', function () { importInput.click(); }));
        tools.appendChild(importInput);

        usage = document.createElement('span');
        usage.className = 'st-usage';
        tools.appendChild(usage);

        list = document.createElement('ul');
        list.className = 'st-list';

        container.appendChild(tools);
        container.appendChild(list);

        self.refresh();
    };

    return self;
})();
