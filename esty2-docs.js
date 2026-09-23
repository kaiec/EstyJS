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


// the documentation viewer
//
// Renders the markdown files under docs/ in the browser. Nothing is generated,
// so the files are the documentation wherever they are read.
//
// The navigation is the link list in docs/index.md.
"use strict";

var EstyDocs = (function () {
    var self = {};

    var ROOT = 'docs/';
    var START = 'index';

    var navigation = [];      // [{ section, pages: [{ title, page, note }] }]
    var current = null;

    /* -------------------------------------------------------------- paths */

    // Links are relative to the document, as they are when read unrendered.
    function resolve(href, fromPage) {
        return new URL(href, new URL(ROOT + fromPage, window.location.href));
    }

    // .../docs/using/keyboard.md -> using/keyboard
    function pageOf(url) {
        var base = new URL(ROOT, window.location.href).href;
        if (url.href.indexOf(base) !== 0) return null;
        if (!/\.md($|[?#])/.test(url.href)) return null;
        return url.href.slice(base.length).replace(/[?#].*$/, '').replace(/\.md$/, '');
    }

    function pageFromHash() {
        var hash = window.location.hash.replace(/^#/, '').trim();
        return hash ? hash.replace(/\.md$/, '') : START;
    }

    /* ------------------------------------------------------------ loading */

    function fetchDoc(page) {
        return fetch(ROOT + page + '.md').then(function (response) {
            if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
            return response.text();
        });
    }

    /* --------------------------------------------------------- navigation */

    // A level two heading starts a section, every .md link under it is a page.
    function readNavigation(markdown) {
        var sections = [];
        var section = null;

        marked.lexer(markdown).forEach(function (token) {
            if (token.type === 'heading' && token.depth === 2) {
                section = { section: token.text, pages: [] };
                sections.push(section);
            }

            if (token.type === 'list' && section) {
                token.items.forEach(function (item) {
                    var link = item.text.match(/\[([^\]]+)\]\(([^)]+\.md)\)/);
                    if (!link) return;

                    var note = item.text.replace(/^.*?\)\s*/, '').replace(/^[-–—]\s*/, '');
                    section.pages.push({
                        title: link[1],
                        page: link[2].replace(/\.md$/, ''),
                        note: note
                    });
                });
            }
        });

        return sections.filter(function (s) { return s.pages.length; });
    }

    function drawNavigation() {
        var nav = document.getElementById('docsnav');
        nav.innerHTML = '';

        navigation.forEach(function (section) {
            var heading = document.createElement('h2');
            heading.textContent = section.section;
            nav.appendChild(heading);

            var list = document.createElement('ul');
            section.pages.forEach(function (entry) {
                var item = document.createElement('li');
                var link = document.createElement('a');
                link.href = '#' + entry.page;
                link.textContent = entry.title;
                link.title = entry.note || '';
                if (entry.page === current) link.className = 'here';
                item.appendChild(link);
                list.appendChild(item);
            });
            nav.appendChild(list);
        });
    }

    /* ----------------------------------------------------------- one page */

    // Links between documents become hash routes. Everything else is resolved
    // against the document's directory.
    function adjustLinks(container, page) {
        container.querySelectorAll('a[href]').forEach(function (link) {
            var href = link.getAttribute('href');
            if (/^(https?:|mailto:|#)/.test(href)) {
                if (/^https?:/.test(href)) { link.target = '_blank'; link.rel = 'noopener'; }
                return;
            }

            var url = resolve(href, page);
            var target = pageOf(url);
            link.href = target !== null ? '#' + target : url.href;
        });

        container.querySelectorAll('img[src]').forEach(function (image) {
            var src = image.getAttribute('src');
            if (!/^(https?:|data:)/.test(src)) image.src = resolve(src, page).href;
        });
    }

    // Sections of a long page. They scroll instead of linking, since the hash
    // is the route.
    function drawContents(container) {
        var headings = container.querySelectorAll('h2');
        if (headings.length < 3) return;

        var contents = document.createElement('nav');
        contents.className = 'onthispage';
        contents.appendChild(document.createElement('h2')).textContent = 'On this page';

        var list = document.createElement('ul');
        headings.forEach(function (heading) {
            var item = document.createElement('li');
            var link = document.createElement('a');
            link.href = 'javascript:void(0)';
            link.textContent = heading.textContent;
            link.onclick = function () { heading.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
            item.appendChild(link);
            list.appendChild(item);
        });

        contents.appendChild(list);
        container.insertBefore(contents, container.firstChild.nextSibling);
    }

    function show(page) {
        var content = document.getElementById('docscontent');

        fetchDoc(page).then(function (markdown) {
            current = page;
            content.innerHTML = marked.parse(markdown);
            adjustLinks(content, page);
            drawContents(content);

            var title = content.querySelector('h1');
            document.title = (title ? title.textContent + ' - ' : '') + 'EstyJS documentation';

            drawNavigation();
            window.scrollTo(0, 0);
        }).catch(function (error) {
            content.innerHTML = '';

            var heading = document.createElement('h1');
            heading.textContent = 'Not here';
            var explain = document.createElement('p');
            explain.textContent = 'docs/' + page + '.md could not be read (' + error.message + ').';
            var hint = document.createElement('p');
            hint.innerHTML = 'If this page was opened straight from the file system, that is the ' +
                'reason: browsers refuse to read files from a <code>file://</code> page. Serve the ' +
                'directory with any static web server, for example <code>python3 -m http.server</code>.';

            content.appendChild(heading);
            content.appendChild(explain);
            content.appendChild(hint);
        });
    }

    /* --------------------------------------------------------------- wire */

    self.start = function () {
        marked.use({ gfm: true, breaks: false });

        fetchDoc(START).then(function (markdown) {
            navigation = readNavigation(markdown);
            drawNavigation();
        }).catch(function () {
            //without a contents list the viewer still works page by page
        }).then(function () {
            show(pageFromHash());
        });

        window.addEventListener('hashchange', function () { show(pageFromHash()); });
    };

    return self;
})();
