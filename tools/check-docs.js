/*
 * check-docs.js - check the documentation.
 *
 * Every page in the navigation exists, every page is reachable from it, every
 * relative link and image resolves, marked parses every page, and the website
 * links to real pages. Then runs the viewer against a stub DOM.
 *
 * usage:
 *   node tools/check-docs.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const docsDir = path.join(root, 'docs');
const { marked } = require(path.join(root, 'vendor', 'marked.min.js'));

let failed = 0;
const fail = (message) => { console.log('FAIL ' + message); failed++; };

function allDocs(dir = docsDir, prefix = '') {
    const found = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) found.push(...allDocs(path.join(dir, entry.name), prefix + entry.name + '/'));
        else if (entry.name.endsWith('.md')) found.push(prefix + entry.name.replace(/\.md$/, ''));
    }
    return found;
}

//read the same way the viewer reads it
function navigationOf(markdown) {
    const pages = [];
    let section = null;

    for (const token of marked.lexer(markdown)) {
        if (token.type === 'heading' && token.depth === 2) section = token.text;
        if (token.type === 'list' && section)
            for (const item of token.items) {
                const link = item.text.match(/\[([^\]]+)\]\(([^)]+\.md)\)/);
                if (link) pages.push({ section, title: link[1], page: link[2].replace(/\.md$/, '') });
            }
    }
    return pages;
}

const index = fs.readFileSync(path.join(docsDir, 'index.md'), 'utf8');
const nav = navigationOf(index);
const docs = allDocs();

// 1. everything the navigation points at is there
for (const entry of nav)
    if (!docs.includes(entry.page))
        fail('the navigation lists "' + entry.title + '" but docs/' + entry.page + '.md does not exist');
if (!failed) console.log('ok   ' + nav.length + ' pages in the navigation, all present');

// 2. every page can be reached from the navigation
const listed = new Set(nav.map(e => e.page).concat(['index']));
const orphans = docs.filter(d => !listed.has(d));
if (orphans.length) fail('not reachable from the navigation: ' + orphans.map(o => 'docs/' + o + '.md').join(', '));
else console.log('ok   all ' + docs.length + ' pages are reachable');

// 3. links and images resolve, and marked can parse the page
for (const page of docs) {
    const file = path.join(docsDir, page + '.md');
    const markdown = fs.readFileSync(file, 'utf8');

    try { marked.parse(markdown); }
    catch (e) { fail('docs/' + page + '.md does not parse: ' + e.message); }

    const from = path.dirname(path.join(docsDir, page));
    const targets = [...markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1])
        .concat([...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1]));

    for (const target of new Set(targets)) {
        if (/^(https?:|mailto:|#|data:)/.test(target)) continue;
        const resolved = path.resolve(from, target.replace(/[?#].*$/, ''));
        if (!fs.existsSync(resolved))
            fail('docs/' + page + '.md links to ' + target + ', which does not exist');
    }
}
if (!failed) console.log('ok   every link and image resolves, and every page parses');

// 4. the viewer has what it needs
for (const file of ['docs.html', 'esty2-docs.js', 'vendor/marked.min.js', 'css/docs.css'])
    if (!fs.existsSync(path.join(root, file))) fail('missing ' + file);

const site = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const m of site.matchAll(/href="docs\.html#([^"]*)"/g))
    if (!docs.includes(m[1])) fail('index.html links to docs.html#' + m[1] + ', which is not a page');
console.log('ok   the viewer and the links from the website are in place');

// 5. the viewer, driven without a browser
const vm = require('vm');

function element(tag) {
    const self = {
        tagName: tag, children: [], textContent: '', className: '', title: '',
        style: {}, dataset: {}, attributes: {},
        appendChild(child) { self.children.push(child); return child; },
        insertBefore(child) { self.children.unshift(child); return child; },
        setAttribute(k, v) { self.attributes[k] = v; },
        getAttribute(k) { return self.attributes[k]; },
        get firstChild() { return self.children[0] || null; },
        querySelectorAll(selector) { return self._find(selector); },
        querySelector(selector) { return self._find(selector)[0] || null; },
        _find(selector) {
            const tag = selector.replace(/\[.*/, '');
            const found = [];
            const walk = (node) => {
                for (const child of node.children || []) {
                    if (child.tagName === tag) found.push(child);
                    walk(child);
                }
            };
            walk(self);
            return found;
        },
        set innerHTML(html) {
            self.children = [];
            self._html = html;
            //enough of a parse for what the viewer touches
            for (const m of html.matchAll(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
                const a = element('a');
                a.attributes.href = m[1];
                a.textContent = m[2].replace(/<[^>]*>/g, '');
                self.children.push(a);
            }
            for (const m of html.matchAll(/<img src="([^"]*)"/g)) {
                const img = element('img');
                img.attributes.src = m[1];
                Object.defineProperty(img, 'src', {
                    get() { return img.attributes.src; },
                    set(v) { img.attributes.src = v; }, configurable: true
                });
                self.children.push(img);
            }
            for (const m of html.matchAll(/<(h1|h2)[^>]*>([\s\S]*?)<\/\1>/g)) {
                const h = element(m[1]);
                h.textContent = m[2].replace(/<[^>]*>/g, '');
                h.scrollIntoView = () => {};
                self.children.push(h);
            }
        },
        get innerHTML() { return self._html || ''; }
    };
    Object.defineProperty(self, 'href', {
        get() { return self.attributes.href; },
        set(v) { self.attributes.href = v; }, configurable: true
    });
    return self;
}

const nodes = { docsnav: element('nav'), docscontent: element('main') };
const base = 'http://localhost/EstyJS/docs.html';

const sandbox = {
    console, marked, URL, Promise, Object, Array, String, RegExp, Error,
    document: {
        getElementById: (id) => nodes[id],
        createElement: element,
        addEventListener() {},
        title: ''
    },
    window: {
        location: { href: base, hash: '' },
        addEventListener() {},
        scrollTo() {}
    },
    fetch(url) {
        const file = path.join(root, decodeURI(new URL(url, base).pathname.replace('/EstyJS/', '')));
        return Promise.resolve(fs.existsSync(file)
            ? { ok: true, text: () => Promise.resolve(fs.readFileSync(file, 'utf8')) }
            : { ok: false, status: 404, statusText: 'Not Found', text: () => Promise.resolve('') });
    }
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'esty2-docs.js'), 'utf8'), sandbox, { filename: 'esty2-docs.js' });

(async () => {
    sandbox.EstyDocs.start();
    await new Promise(r => setTimeout(r, 50));

    const navLinks = nodes.docsnav._find('a');
    if (navLinks.length !== nav.length)
        fail('the viewer built ' + navLinks.length + ' navigation links, expected ' + nav.length);
    if (!navLinks.some(a => a.href === '#using/keyboard'))
        fail('the navigation has no link to #using/keyboard');

    // a table renders, and a relative link to a sibling page is rewritten
    sandbox.window.location.hash = '#using/disks';
    sandbox.EstyDocs.start();
    await new Promise(r => setTimeout(r, 50));

    const html = nodes.docscontent.innerHTML;
    if (!/<table>/.test(html)) fail('the disk images page rendered without its table');

    // any page that links to a sibling will do
    let linking = null;
    for (const page of docs) {
        const markdown = fs.readFileSync(path.join(docsDir, page + '.md'), 'utf8');
        const link = markdown.match(/\]\((?!https?:|#|mailto:)([^)]+\.md)\)/);
        if (link) {
            const dir = path.dirname(page);
            linking = {
                page,
                expect: '#' + path.normalize(path.join(dir === '.' ? '' : dir, link[1]))
                    .replace(/\\/g, '/').replace(/\.md$/, '')
            };
            break;
        }
    }

    if (!linking) fail('no page links to another, so link rewriting is untested');
    else {
        sandbox.window.location.hash = '#' + linking.page;
        sandbox.EstyDocs.start();
        await new Promise(r => setTimeout(r, 50));

        const links = nodes.docscontent._find('a').map(a => a.href);
        if (!links.includes(linking.expect))
            fail(linking.page + ': expected a link rewritten to ' + linking.expect +
                 ', got: ' + links.join(' '));
    }

    // the front page image lives outside docs/, so it must resolve out of it
    sandbox.window.location.hash = '#index';
    sandbox.EstyDocs.start();
    await new Promise(r => setTimeout(r, 50));

    const images = nodes.docscontent._find('img').map(i => i.attributes.src);
    if (!images.some(src => /\/EstyJS\/img\//.test(src)))
        fail('the image on the front page did not resolve out of docs/, got: ' + images.join(' '));

    // a page that is not there says so rather than showing nothing
    sandbox.window.location.hash = '#nope';
    sandbox.EstyDocs.start();
    await new Promise(r => setTimeout(r, 50));
    const missing = nodes.docscontent._find('h1').map(h => h.textContent);
    if (!missing.includes('Not here')) fail('a missing page did not report itself');

    if (!failed) console.log('ok   the viewer renders, links between pages, and reports a missing page');

    console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
