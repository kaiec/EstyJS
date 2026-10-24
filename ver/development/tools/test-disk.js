/*
 * test-disk.js - a 720 KB test disk for the write checks.
 *
 * makeDisk builds a FAT12 disk holding AUTO\TEST.PRG. The program creates
 * A:\OUT.TXT through GEMDOS, then waits three seconds, then reads
 * A:\SECOND.TXT. Results go to RAM at RESULTS:
 *
 *   +0 'WRIT'  +4 Fcreate  +8 Fwrite  +12 Fclose  +16 'DONE'
 *   +20 largest Mediach(0) while waiting  +24 Fopen  +28 Fread  +32 'END!'
 *   +$40 the bytes read
 *
 * readFile reads a file from the root directory of such a disk, toMSA
 * stores it as .msa.
 */

/* ------------------------------------------------------------ the program */

const OUT_TEXT = 'EstyJS wrote this file.\r\n';
const SECOND_TEXT = 'Read from the second disk.\r\n';
const RESULTS = 0xf0000;

// 68000 code, position independent apart from RESULTS. Labels are resolved
// in a second pass.
function assemble() {
    const words = [];
    const labels = {};
    const refs = [];

    const w = (...ws) => ws.forEach(x => words.push(x & 0xffff));
    const long = (v) => w(v >>> 16, v);
    const label = (name) => { labels[name] = words.length * 2; };
    // A 16 bit displacement from the extension word, as d16(pc) and dbra use it.
    const disp = (name) => { refs.push({ at: words.length, name }); w(0); };
    const four = (s) => (s.charCodeAt(0) << 24 | s.charCodeAt(1) << 16 | s.charCodeAt(2) << 8 | s.charCodeAt(3)) >>> 0;

    w(0x4bf9); long(RESULTS);                       // lea     RESULTS,a5
    w(0x2abc); long(four('WRIT'));                  // move.l  #'WRIT',(a5)

    w(0x4267);                                      // clr.w   -(sp)
    w(0x487a); disp('out');                         // pea     out(pc)
    w(0x3f3c, 0x3c, 0x4e41, 0x508f);                // Fcreate
    w(0x2b40, 4);                                   // move.l  d0,4(a5)
    w(0x3e00);                                      // move.w  d0,d7

    w(0x487a); disp('text');                        // pea     text(pc)
    w(0x2f3c); long(OUT_TEXT.length);               // move.l  #length,-(sp)
    w(0x3f07);                                      // move.w  d7,-(sp)
    w(0x3f3c, 0x40, 0x4e41, 0x4fef, 12);            // Fwrite
    w(0x2b40, 8);                                   // move.l  d0,8(a5)

    w(0x3f07);                                      // move.w  d7,-(sp)
    w(0x3f3c, 0x3e, 0x4e41, 0x588f);                // Fclose
    w(0x2b40, 12);                                  // move.l  d0,12(a5)
    w(0x2b7c); long(four('DONE')); w(16);           // move.l  #'DONE',16(a5)

    // 150 frames, keeping the largest Mediach(0) seen
    w(0x42ad, 20);                                  // clr.l   20(a5)
    w(0x3c3c, 149);                                 // move.w  #149,d6
    label('wait');
    w(0x4267, 0x3f3c, 9, 0x4e4d, 0x588f);           // Mediach(0)
    w(0xb0ad, 20);                                  // cmp.l   20(a5),d0
    w(0x6f04);                                      // ble.s   +4
    w(0x2b40, 20);                                  // move.l  d0,20(a5)
    w(0x3f3c, 37, 0x4e4e, 0x548f);                  // Vsync
    w(0x51ce); disp('wait');                        // dbra    d6,wait

    w(0x4267);                                      // clr.w   -(sp)
    w(0x487a); disp('second');                      // pea     second(pc)
    w(0x3f3c, 0x3d, 0x4e41, 0x508f);                // Fopen
    w(0x2b40, 24);                                  // move.l  d0,24(a5)
    w(0x3e00);                                      // move.w  d0,d7

    w(0x4879); long(RESULTS + 0x40);                // pea     RESULTS+$40
    w(0x2f3c); long(64);                            // move.l  #64,-(sp)
    w(0x3f07);                                      // move.w  d7,-(sp)
    w(0x3f3c, 0x3f, 0x4e41, 0x4fef, 12);            // Fread
    w(0x2b40, 28);                                  // move.l  d0,28(a5)
    w(0x2b7c); long(four('END!')); w(32);           // move.l  #'END!',32(a5)
    w(0x60fe);                                      // bra.s   *

    const strings = [['out', 'A:\\OUT.TXT\0'], ['second', 'A:\\SECOND.TXT\0'], ['text', OUT_TEXT]];
    const code = Buffer.alloc(words.length * 2);
    words.forEach((x, i) => code.writeUInt16BE(x, i * 2));

    let text = code;
    for (const [name, s] of strings) {
        labels[name] = text.length;
        text = Buffer.concat([text, Buffer.from(s, 'latin1')]);
    }
    if (text.length & 1) text = Buffer.concat([text, Buffer.alloc(1)]);

    for (const { at, name } of refs) text.writeInt16BE(labels[name] - at * 2, at * 2);

    // GEMDOS program header, no relocation
    const header = Buffer.alloc(28);
    header.writeUInt16BE(0x601a, 0);
    header.writeUInt32BE(text.length, 2);
    return Buffer.concat([header, text, Buffer.alloc(4)]);
}

/* ---------------------------------------------------------------- FAT12 */

// 720 KB: 2 sides, 80 tracks, 9 sectors. Boot sector, two FATs of 5 sectors,
// 7 sectors root directory, then clusters of 2 sectors from cluster 2.
const SECTOR = 512, FAT_START = 1, FAT_SECTORS = 5, ROOT_START = 11, ROOT_SECTORS = 7, DATA_START = 18;

function fatGet(fat, n) {
    const o = (n * 3) >> 1;
    const v = fat[o] | (fat[o + 1] << 8);
    return n & 1 ? v >> 4 : v & 0xfff;
}

function fatSet(fat, n, v) {
    const o = (n * 3) >> 1;
    if (n & 1) {
        fat[o] = (fat[o] & 0x0f) | ((v << 4) & 0xf0);
        fat[o + 1] = (v >> 4) & 0xff;
    } else {
        fat[o] = v & 0xff;
        fat[o + 1] = (fat[o + 1] & 0xf0) | ((v >> 8) & 0x0f);
    }
}

const clusterOffset = (c) => (DATA_START + (c - 2) * 2) * SECTOR;

function dirEntry(image, offset, name, attr, cluster, size) {
    image.write(name, offset, 11, 'latin1');
    image[offset + 11] = attr;
    image.writeUInt16LE(cluster, offset + 26);
    image.writeUInt32LE(size, offset + 28);
}

// files: [[name as 8.3 without dot, contents]], all in one cluster each.
function makeDisk(serial, files) {
    const image = Buffer.alloc(80 * 2 * 9 * SECTOR);

    image[0] = 0x60; image[1] = 0x1c;
    image.writeUIntLE(serial, 8, 3);
    image.writeUInt16LE(SECTOR, 11);
    image[13] = 2;
    image.writeUInt16LE(1, 14);
    image[16] = 2;
    image.writeUInt16LE(112, 17);
    image.writeUInt16LE(1440, 19);
    image[21] = 0xf9;
    image.writeUInt16LE(FAT_SECTORS, 22);
    image.writeUInt16LE(9, 24);
    image.writeUInt16LE(2, 26);

    const fat = Buffer.alloc(FAT_SECTORS * SECTOR);
    fatSet(fat, 0, 0xff9);
    fatSet(fat, 1, 0xfff);

    const root = ROOT_START * SECTOR;
    const prg = assemble();

    // AUTO in cluster 2, TEST.PRG in cluster 3
    dirEntry(image, root, 'AUTO       ', 0x10, 2, 0);
    dirEntry(image, clusterOffset(2), '.          ', 0x10, 2, 0);
    dirEntry(image, clusterOffset(2) + 32, '..         ', 0x10, 0, 0);
    dirEntry(image, clusterOffset(2) + 64, 'TEST    PRG', 0, 3, prg.length);
    prg.copy(image, clusterOffset(3));
    fatSet(fat, 2, 0xfff);
    fatSet(fat, 3, 0xfff);

    files.forEach(([name, contents], i) => {
        const cluster = 4 + i;
        dirEntry(image, root + 32 * (i + 1), name, 0, cluster, contents.length);
        Buffer.from(contents, 'latin1').copy(image, clusterOffset(cluster));
        fatSet(fat, cluster, 0xfff);
    });

    fat.copy(image, FAT_START * SECTOR);
    fat.copy(image, (FAT_START + FAT_SECTORS) * SECTOR);
    return image;
}

// Contents of a file in the root directory, or null.
function readFile(image, name) {
    image = Buffer.from(image);
    const fat = image.subarray(FAT_START * SECTOR, (FAT_START + FAT_SECTORS) * SECTOR);

    for (let i = 0; i < 112; i++) {
        const offset = ROOT_START * SECTOR + i * 32;
        if (image[offset] == 0) break;
        if (image.toString('latin1', offset, offset + 11) != name) continue;

        let size = image.readUInt32LE(offset + 28);
        let cluster = image.readUInt16LE(offset + 26);
        const parts = [];
        while (size > 0 && cluster >= 2 && cluster < 0xff0) {
            const n = Math.min(size, 2 * SECTOR);
            parts.push(image.subarray(clusterOffset(cluster), clusterOffset(cluster) + n));
            size -= n;
            cluster = fatGet(fat, cluster);
        }
        return Buffer.concat(parts).toString('latin1');
    }
    return null;
}

// MSA with every track stored as is.
function toMSA(image) {
    const header = Buffer.alloc(10);
    header.writeUInt16BE(0x0e0f, 0);
    header.writeUInt16BE(9, 2);
    header.writeUInt16BE(1, 4);
    header.writeUInt16BE(0, 6);
    header.writeUInt16BE(79, 8);

    const parts = [header];
    for (let t = 0; t < 160; t++) {
        const length = Buffer.alloc(2);
        length.writeUInt16BE(9 * SECTOR, 0);
        parts.push(length, image.subarray(t * 9 * SECTOR, (t + 1) * 9 * SECTOR));
    }
    return Buffer.concat(parts);
}

module.exports = { OUT_TEXT, SECOND_TEXT, RESULTS, makeDisk, readFile, toMSA };
