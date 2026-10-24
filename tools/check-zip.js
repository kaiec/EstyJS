/*
 * check-zip.js - check estyjs/zip.js.
 *
 * Writes and reads back stored and deflated entries with UTF-8 names. Reads
 * an archive as macOS Finder writes it (sizes in a data descriptor behind the
 * data, folder entries, __MACOSX), one with a code page 437 name, and refuses
 * what is no ZIP archive.
 *
 * usage:
 *   node tools/check-zip.js
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const zlib = require('zlib');

const sandbox = {
    Response, Blob, CompressionStream, DecompressionStream, TextEncoder, TextDecoder,
    Uint8Array, Uint32Array, DataView, ArrayBuffer, Promise, Error, Date
};
vm.createContext(sandbox);
vm.runInContext('var EstyJs = {};' + fs.readFileSync(path.join(__dirname, '..', 'estyjs', 'zip.js'), 'utf8'), sandbox);
const zip = sandbox.EstyJs.zip;

let failed = 0;
function check(what, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : '\n       got:  ' + JSON.stringify(got) +
                '\n       want: ' + JSON.stringify(want)));
}

const same = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) == 0;

// An archive as Finder writes it: a folder entry, and for each file the local
// header without sizes (flag bit 3), the deflated data, then a data
// descriptor. Built by hand from the specification.
function finderZip(entries) {
    const parts = [], central = [];
    let offset = 0;
    for (const e of entries) {
        const name = Buffer.from(e.name, 'utf8');
        const folder = e.name.endsWith('/');
        const data = folder ? Buffer.alloc(0) : zlib.deflateRawSync(e.bytes);
        const crc = folder ? 0 : zlib.crc32(e.bytes);
        const size = folder ? 0 : e.bytes.length;
        const flags = (folder ? 0 : 0x08) | 0x0800;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(flags, 6);
        local.writeUInt16LE(folder ? 0 : 8, 8);
        local.writeUInt16LE(name.length, 26);

        const descriptor = Buffer.alloc(folder ? 0 : 16);
        if (!folder) {
            descriptor.writeUInt32LE(0x08074b50, 0);
            descriptor.writeUInt32LE(crc, 4);
            descriptor.writeUInt32LE(data.length, 8);
            descriptor.writeUInt32LE(size, 12);
        }

        const entry = Buffer.alloc(46);
        entry.writeUInt32LE(0x02014b50, 0);
        entry.writeUInt16LE(20, 4);
        entry.writeUInt16LE(20, 6);
        entry.writeUInt16LE(flags, 8);
        entry.writeUInt16LE(folder ? 0 : 8, 10);
        entry.writeUInt32LE(crc, 16);
        entry.writeUInt32LE(data.length, 20);
        entry.writeUInt32LE(size, 24);
        entry.writeUInt16LE(name.length, 28);
        entry.writeUInt32LE(offset, 42);

        parts.push(local, name, data, descriptor);
        central.push(entry, name);
        offset += 30 + name.length + data.length + descriptor.length;
    }
    const size = central.reduce((n, p) => n + p.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(offset, 16);
    return new Uint8Array(Buffer.concat([...parts, ...central, end]));
}

(async () => {
    const random = new Uint8Array(4000).map(() => Math.random() * 256);
    const text = new TextEncoder().encode('{"a": 1}'.repeat(200));

    // round trip
    const files = [
        { name: 'Spiele/Bubble Bobble ä.st', bytes: text },
        { name: 'random', bytes: random },
        { name: 'empty', bytes: new Uint8Array(0) }
    ];
    const written = await zip.write(files);
    const back = await zip.read(written);
    check('round trip: names', back.map(f => f.name), files.map(f => f.name));
    check('round trip: contents', back.map((f, i) => same(f.bytes, files[i].bytes)), [true, true, true]);
    check('round trip: compressible is deflated', written.length < text.length + random.length, true);

    const buffer = await zip.write([{ name: 'buffer', bytes: random.buffer }]);
    check('write: takes an ArrayBuffer', same((await zip.read(buffer))[0].bytes, random), true);

    // the archive must open elsewhere too: zlib inflates what write deflated
    const view = Buffer.from(written);
    const nameLength = view.readUInt16LE(26);
    const method = view.readUInt16LE(8);
    const length = view.readUInt32LE(18);
    const data = view.subarray(30 + nameLength, 30 + nameLength + length);
    check('write: deflate as zlib reads it', method == 8 && same(zlib.inflateRawSync(data), text), true);
    check('write: crc as zlib computes it', view.readUInt32LE(14), zlib.crc32(text));

    // Finder
    const finder = finderZip([
        { name: 'Box/' }, { name: 'Box/Spiele/' },
        { name: 'Box/Spiele/Oids.st', bytes: random },
        { name: 'Box/Notes.json', bytes: text },
        { name: 'Box/.DS_Store', bytes: text },
        { name: '__MACOSX/' }, { name: '__MACOSX/Box/' },
        { name: '__MACOSX/Box/Spiele/._Oids.st', bytes: text }
    ]);
    const read = await zip.read(finder);
    check('Finder: folders and macOS files left out', read.map(f => f.name), ['Box/Spiele/Oids.st', 'Box/Notes.json']);
    check('Finder: contents', read.map(f => same(f.bytes, f.name.endsWith('.st') ? random : text)), [true, true]);

    // a name without the UTF-8 flag
    const cp437 = Buffer.from(await zip.write([{ name: 'Disk', bytes: text }]));
    cp437.writeUInt16LE(0, 6);
    const centralAt = cp437.readUInt32LE(cp437.length - 6);
    cp437.writeUInt16LE(0, centralAt + 8);
    check('name without UTF-8 flag', (await zip.read(new Uint8Array(cp437)))[0].name, 'Disk');

    // not an archive
    try {
        await zip.read(new Uint8Array(100));
        check('not a ZIP: refused', 'read', 'refused');
    } catch (e) {
        check('not a ZIP: refused', e.message, 'not a ZIP archive');
    }

    console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
