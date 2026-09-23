/*
 * check-onscreen-keyboard.js - check the ST keyboard drawn in the page.
 *
 * The panel is a picture of a real ST keyboard, so the things that can quietly
 * go wrong are structural: a key listed twice, a row that no longer adds up to
 * the width of the others, an ST key that disappeared, a country missing its
 * keycaps. All of that is in the source, so it is checked from the source
 * rather than by driving a browser.
 *
 * usage:
 *   node tools/check-onscreen-keyboard.js [--list]
 */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'esty2-keyboard.js'), 'utf8');

// ST scancodes that no key on the ST keyboard produces
const UNUSED = [0x37, 0x45, 0x46, 0x49, 0x4C, 0x4F, 0x51, 0x54,
                0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x5B, 0x5C, 0x5D, 0x5E, 0x5F];

function blockOf(name, width) {
    const m = src.match(new RegExp('var ' + name + ' = \\[([\\s\\S]*?)\\n    \\];'));
    if (!m) throw new Error('no ' + name + ' in esty2-keyboard.js');

    // each [ ... ] inside is one row
    const rows = m[1].match(/\[[^\[\]]*\]/g) || [];
    return {
        name, width,
        rows: rows.map(row => {
            const keys = [];
            for (const k of row.match(/\{[^}]*\}/g) || []) {
                const scancode = k.match(/s:\s*(0x[0-9A-Fa-f]+)/);
                const w = k.match(/w:\s*(\d+)/);
                const pad = k.match(/(?:pad|skip):\s*(\d+)/);
                const reserves = /skip:/.test(k);
                const rows = k.match(/r:\s*(\d+)/);
                keys.push({
                    s: scancode ? parseInt(scancode[1], 16) : null,
                    w: pad ? parseInt(pad[1], 10) : (w ? parseInt(w[1], 10) : 4),
                    spacer: !!pad,
                    reserves: reserves,
                    rows: rows ? parseInt(rows[1], 10) : 1
                });
            }
            return keys;
        })
    };
}

const blocks = [blockOf('MAIN', 64), blockOf('MIDDLE', 12), blockOf('KEYPAD', 16)];
let failed = 0;
const fail = (m) => { console.log('FAIL ' + m); failed++; };

// 1. every row fills its block exactly, or the keys do not line up. A row
// under a tall key (Return, keypad Enter) is short by exactly that key's width.
for (const block of blocks) {
    block.rows.forEach((row, i) => {
        let width = row.reduce((sum, k) => sum + k.w, 0);

        // a row that already reserves the space with a skip has counted it
        if (!row.some(k => k.reserves)) {
            block.rows.forEach((above, j) => {
                if (j >= i) return;
                for (const key of above) if (j + key.rows > i) width += key.w;
            });
        }

        if (width !== block.width) {
            fail(block.name + ' row ' + (i + 1) + ' covers ' + width +
                 ' quarter keys, not ' + block.width);
        }
    });
}
if (!failed) console.log('ok   every row is the same width as its block');

// 2. each ST key appears exactly once
const seen = {};
for (const block of blocks)
    for (const row of block.rows)
        for (const key of row)
            if (!key.spacer && key.s !== null) {
                if (seen[key.s]) fail('scancode 0x' + key.s.toString(16) + ' appears more than once');
                seen[key.s] = true;
            }

const missing = [];
for (let sc = 0x01; sc <= 0x72; sc++) if (!UNUSED.includes(sc) && !seen[sc]) missing.push(sc);
if (missing.length) fail('ST keys not on the panel: ' + missing.map(c => '0x' + c.toString(16)).join(' '));
else console.log('ok   all ' + Object.keys(seen).length + ' ST keys are on the panel, once each');

// 3. every country has keycaps, and they differ where they should
const legends = eval('(' + src.match(/var LEGENDS = (\{[\s\S]*?\n    \});/)[1] + ')');
const countries = Object.keys(legends);
if (countries.length < 4) fail('expected at least four countries, found ' + countries.join(' '));

for (const cc of countries) {
    const caps = Object.keys(legends[cc]).length;
    if (caps < 70) fail(cc + ' has only ' + caps + ' keycaps');
}
console.log('ok   ' + countries.length + ' countries: ' + countries.map(c => c + ' (' + Object.keys(legends[c]).length + ')').join(', '));

// the differences that make the countries worth having
const check = (cc, sc, want, what) => {
    const got = (legends[cc][sc] || [])[0];
    if (got !== want) fail(cc + ' 0x' + sc.toString(16) + ' should be "' + want + '" (' + what + '), got "' + got + '"');
};
check('de', 0x15, 'z', 'QWERTZ');
check('de', 0x2c, 'y', 'QWERTZ');
check('us', 0x15, 'y', 'QWERTY');
check('fr', 0x10, 'a', 'AZERTY');
check('fr', 0x2c, 'w', 'AZERTY');
check('uk', 0x2b, '#', 'UK hash beside Return');
check('de', 0x1a, 'ü', 'German umlaut');
console.log('ok   the national differences are there');

// 4. a US ST has no key between left shift and Z; every European one does
if (legends.us[0x60] !== undefined) fail('the US layout should have no ISO key (0x60)');
for (const cc of ['uk', 'de', 'fr'])
    if (legends[cc][0x60] === undefined) fail(cc + ' should have the ISO key (0x60)');
if (!src.includes("LEGENDS[country][0x60] !== undefined")) fail('the panel does not hide the ISO key for the US layout');
console.log('ok   the ISO key follows the country');

if (process.argv.includes('--list')) {
    console.log('\nscancode  ' + countries.map(c => c.toUpperCase().padEnd(8)).join(''));
    for (const sc of Object.keys(seen).map(Number).sort((a, b) => a - b)) {
        const caps = countries.map(c => ((legends[c][sc] || []).join(' ') || '-').padEnd(8));
        console.log('  0x' + sc.toString(16).padStart(2, '0') + '    ' + caps.join(''));
    }
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
