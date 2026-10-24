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


// the disk box
//
// Disks are kept in boxes, as in a 3.5" disk box. estyjs/store.js keeps them,
// this draws the open box over the emulator with WebGL2 and edits it.
// Clicking a drive takes its disk out and opens the box. Inserting a disk
// closes it, closing it leaves the drive empty.
//
// A disk the ST wrote to goes back into the box when the drive light goes
// off, when it is taken out, and when the page is hidden. A disk that came
// from a saved state stays apart from the box. Taken out after the ST wrote
// to it, it goes into the box as a new disk.
//
// Ported from the disk box prototype (a repository of its own). The box and
// the parts of disks and dividers are flat polygons from its Blender model
// (diskbox/geometry.json). Items run from the back of the box to the front.
// k is the number of items tipped forward, the front-most item not tipped is
// the open one. A divider labels the disks behind it and is never the open
// item. The camera moves along the box with the open slot, so the open disk
// is always seen from the same angle and at the same size.
"use strict";

var EstyDiskbox = (function () {
  const self = { available: false };

  const MAX = 60;
  const VIEW = 'estyjs-diskbox';                       // localStorage: current box, position per box

  const BODY_COLORS = ['#1d1d20', '#2b4ea3', '#b3322c', '#8a8b90', '#e3e0d6', '#2f7a46', '#d4ae2b'];
  const ACCENT_COLORS = ['#d42a2a', '#2563c9', '#2f9a44', '#f2c11d', '#f07a14', '#8a3fb5', '#6b6b70'];
  const PAPER = '#f3f1ea', INK = '#17307a';
  const LABEL_FONT = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
  const TAB_FONT = '"Avenir Next", "Helvetica Neue", Arial, sans-serif';
  const MAT = {                                   // box materials
    tray: '#ddd5bf', lid: '#4a4744', chrome: '#c9ccd2', steel: '#9aa0a6', black: '#1e1e1e',
  };
  const FLOOR_COLOR = '#e3e2de', CLEAR = [0.80, 0.80, 0.79];
  const LIGHT = norm([-0.35, 0.55, 0.76]);

  // The part of the camera frame shown: the open disk, the tabs behind it and
  // the tipped stack in front. The lid shows only at the top.
  const CROP = { x: 120, y: 330, w: 960, h: 459 };

  let G, CAM, S, D, SEP, W, H, A, CA, SA, LL, DISK_BOX, LABEL_QUAD;
  let gl = null, loc, boxOpaque, boxLid, boxPick, items, itemsPick, quad, pickFB;

  // the open box: items with the disk records merged in
  let boxId = null, boxTitle = '', boxes = [];
  let state = { items: [], k: 0, sel: null };

  // Per drive: { disk: id } for a disk from a box, { disk: id or null,
  // detached: true, name } for one from a saved state, or null.
  const drives = { A: null, B: null };
  let target = null;                                  // the drive the box was opened for
  let queue = Promise.resolve();                      // store writes, one after the other

  // ---------------------------------------------------------------- helpers
  const uid = () => Math.random().toString(36).slice(2, 10);
  const openIndex = () => state.items.length - state.k - 1;      // front-most leaning-back item

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(label, action, cls) {
    const b = el('button', 'db-button' + (cls ? ' ' + cls : ''), label);
    b.addEventListener('click', action);
    return b;
  }

  function enqueue(fn) {
    queue = queue.then(fn);
    queue.catch(e => say(e && e.message ? e.message : String(e), true));
    return queue;
  }

  let dom = {};

  function say(text, problem) {
    if (dom.message) {
      dom.message.textContent = text;
      dom.message.className = 'db-message' + (problem ? ' problem' : '');
    }
    diskMessage(text, problem);
  }

  function firstLine(it) {
    return (it.title || '').split('\n')[0].trim() || it.name || 'Disk';
  }

  function loadView() {
    try { return JSON.parse(localStorage.getItem(VIEW)) || {}; } catch (e) { return {}; }
  }

  function saveView() {
    const v = loadView();
    v.box = boxId;
    v.k = v.k || {};
    v.k[boxId] = state.k;
    try { localStorage.setItem(VIEW, JSON.stringify(v)); } catch (e) { }
  }

  // A divider is never the open item: it would only show its blank card.
  // Browsing forward (or clicking it) tips it along so the disk behind it is
  // open; browsing back over it also brings back the disk in front of it.
  function settle(dir) {
    const n = state.items.length;
    state.k = Math.max(0, Math.min(state.k, n - 1));
    if (!state.items.some(it => it.type === 'disk')) return;
    for (let guard = 0; guard <= 2 * n; guard++) {
      const it = state.items[openIndex()];
      if (!it || it.type !== 'sep') return;
      if (dir > 0 && state.k < n - 1) state.k++;
      else if (dir < 0 && state.k > 0) state.k--;
      else dir = -dir || 1;
    }
  }

  // the panel edits the selected item: a clicked divider, otherwise the open disk
  const selIndex = () => {
    const i = state.items.findIndex(it => it.id === state.sel);
    return i >= 0 ? i : openIndex();
  };
  const selected = () => state.items[selIndex()];

  // ------------------------------------------------------------------ math
  function norm(v) { const l = Math.hypot(...v); return v.map(c => c / l); }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function newell(pts) {
    const n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return norm(n);
  }
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  const shadeOf = n => 0.6 + 0.4 * Math.max(0, dot(n, LIGHT));
  const lit = (hex, n, f = 1) => rgb(hex).map(c => Math.min(1, c * shadeOf(n) * f));

  // item pose: "b" leaning back in slot n from the back wall, "f" tipped forward,
  // n-th from the front. Returns a transform of item-frame points / normals.
  function pose(mode, n, t) {
    let o, th;
    if (mode === 'b') {
      o = [S.x0, S.y_wall + (n - 1) * S.slot / CA + t * CA, S.floor + t * SA];
      th = Math.PI / 2 + A;
    } else {
      o = [S.x0, S.y_ref - (n - 1) * S.slot / CA, S.floor];
      th = Math.PI / 2 - A;
    }
    const c = Math.cos(th), s = Math.sin(th);
    const rot = p => [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]];
    return { p: p => { const r = rot(p); return [o[0] + r[0], o[1] + r[1], o[2] + r[2]]; }, n: rot };
  }

  // ------------------------------------------------------------------ camera
  const camState = { dy: 0, init: false };
  function camTargetDy() {
    const o = openIndex();
    const slot = o >= 0 ? o + 1 : S.slots;
    return (slot - S.slots) * S.slot / CA;          // keep the open slot where slot 60 is framed
  }
  function stepCamera() {
    const t = camTargetDy();
    if (!camState.init) { camState.dy = t; camState.init = true; return false; }
    const d = t - camState.dy;
    if (Math.abs(d) < 0.05) { camState.dy = t; return false; }
    camState.dy += d * 0.2;
    return true;
  }
  function viewProj() {
    const R = CAM.rot, pos = [CAM.pos[0], CAM.pos[1] + camState.dy, CAM.pos[2]];
    const ax = [0, 1, 2].map(j => [R[0][j], R[1][j], R[2][j]]);      // camera right, up, back
    const near = 5, far = 4000, fx = 2 * CAM.f / W, fy = 2 * CAM.f / H;
    // column-major view and projection
    const V = [ax[0][0], ax[1][0], ax[2][0], 0, ax[0][1], ax[1][1], ax[2][1], 0,
      ax[0][2], ax[1][2], ax[2][2], 0, -dot(ax[0], pos), -dot(ax[1], pos), -dot(ax[2], pos), 1];
    const P = [fx, 0, 0, 0, 0, fy, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0];
    const M = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += P[k * 4 + r] * V[c * 4 + k];
      M[c * 4 + r] = v;
    }
    // from the whole frame to CROP
    const sx = W / CROP.w, tx = W / CROP.w - 2 * CROP.x / CROP.w - 1;
    const sy = H / CROP.h, ty = 1 - H / CROP.h + 2 * CROP.y / CROP.h;
    for (let c = 0; c < 4; c++) {
      const w = M[c * 4 + 3];
      M[c * 4] = sx * M[c * 4] + tx * w;
      M[c * 4 + 1] = sy * M[c * 4 + 1] + ty * w;
    }
    return { M, pos };
  }
  function project(VP, p) {                         // world point -> pixel in the CROP frame
    const M = VP.M;
    const x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12];
    const y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13];
    const w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
    return [(x / w + 1) * CROP.w / 2, (1 - y / w) * CROP.h / 2];
  }

  // ------------------------------------------------------------------ WebGL
  const VS = `#version 300 es
in vec3 aPos; in vec3 aCol; in vec2 aUV;
uniform mat4 uVP;
out vec3 vCol; out vec2 vUV;
void main() { gl_Position = uVP * vec4(aPos, 1.0); vCol = aCol; vUV = aUV; }`;
  const FS = `#version 300 es
precision highp float;
in vec3 vCol; in vec2 vUV;
uniform sampler2D uTex; uniform int uMode; uniform float uAlpha;
out vec4 o;
void main() {
  if (uMode == 1) {                       // texture, lit by the vertex colour
    vec4 t = texture(uTex, vUV);
    if (t.a < 0.5) discard;
    o = vec4(t.rgb * vCol, 1.0);
  } else {
    o = vec4(vCol, uAlpha);
  }
}`;

  // interleaved vertex buffers: x y z r g b u v
  class Batch {
    constructor() { this.v = []; this.buf = gl.createBuffer(); this.n = 0; }
    poly(pts, col, uv) {                            // convex polygon as a triangle fan
      const v = this.v;
      for (let i = 1; i + 1 < pts.length; i++) {
        for (const k of [0, i, i + 1]) {
          const p = pts[k], t = uv ? uv[k] : [0, 0];
          v.push(p[0], p[1], p[2], col[0], col[1], col[2], t[0], t[1]);
        }
      }
    }
    upload(usage = gl.DYNAMIC_DRAW) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.v), usage);
      this.n = this.v.length / 8;
    }
    draw() {
      if (!this.n) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.enableVertexAttribArray(loc.pos); gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(loc.col); gl.vertexAttribPointer(loc.col, 3, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(loc.uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 32, 24);
      gl.drawArrays(gl.TRIANGLES, 0, this.n);
    }
  }

  function setupGL() {
    function shader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    loc = {
      pos: gl.getAttribLocation(prog, 'aPos'), col: gl.getAttribLocation(prog, 'aCol'), uv: gl.getAttribLocation(prog, 'aUV'),
      vp: gl.getUniformLocation(prog, 'uVP'), mode: gl.getUniformLocation(prog, 'uMode'),
      alpha: gl.getUniformLocation(prog, 'uAlpha'), tex: gl.getUniformLocation(prog, 'uTex'),
    };

    // static scene: floor, tray, lid hardware (opaque) and the smoked lid (transparent)
    boxOpaque = new Batch(); boxLid = new Batch(); boxPick = new Batch();
    const F = 1500;
    boxOpaque.poly([[-F, -F, 0], [F, -F, 0], [F, F, 0], [-F, F, 0]], rgb(FLOOR_COLOR));
    boxPick.poly([[-F, -F, 0], [F, -F, 0], [F, F, 0], [-F, F, 0]], [0, 0, 0]);
    for (const f of G.box) {
      const n = newell(f.p);
      if (f.m === 'lid') { boxLid.poly(f.p, lit(MAT.lid, n)); continue; }
      boxOpaque.poly(f.p, lit(MAT[f.m] || MAT.tray, n));
      boxPick.poly(f.p, [0, 0, 0]);
    }
    boxOpaque.upload(gl.STATIC_DRAW); boxLid.upload(gl.STATIC_DRAW); boxPick.upload(gl.STATIC_DRAW);
    items = new Batch(); itemsPick = new Batch(); quad = new Batch();

    // picking: render item ids into an offscreen buffer and read one pixel
    pickFB = gl.createFramebuffer();
    const pickRB = gl.createRenderbuffer(), pickDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, pickRB); gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, CROP.w, CROP.h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, pickDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, CROP.w, CROP.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickFB);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, pickRB);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, pickDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ------------------------------------------------------------------ label / tab textures
  const PX = 8;                                         // texture px per mm
  const textures = new Map();                           // key -> {tex, sig}
  function texture(key, sig, paint) {
    let e = textures.get(key);
    if (e && e.sig === sig) return e.tex;
    const c = paint();
    if (!e) { e = { tex: gl.createTexture() }; textures.set(key, e); }
    e.sig = sig;
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return e.tex;
  }

  function labelLayout() {
    const L = D.label;
    return {
      w: L.w_mm, h: L.h_mm,
      lineY: i => L.line_y0_mm - L.top_mm + i * L.line_step_mm,     // from the label's top edge
      x0: L.x0_mm + L.w_mm - L.line_x_mm[1], x1: L.x0_mm + L.w_mm - L.line_x_mm[0],
      font: 4.8, step: L.line_step_mm, n: L.line_n, band: L.band_mm - L.top_mm,
    };
  }

  function paintLabel(it) {
    const c = document.createElement('canvas');
    c.width = Math.round(LL.w * PX); c.height = Math.round(LL.h * PX);
    const x = c.getContext('2d');
    x.scale(PX, PX);
    const r = 3.25;
    x.beginPath();                                  // rounded corners at the far end
    x.moveTo(0, 0); x.lineTo(LL.w, 0); x.lineTo(LL.w, LL.h - r); x.arcTo(LL.w, LL.h, LL.w - r, LL.h, r);
    x.lineTo(r, LL.h); x.arcTo(0, LL.h, 0, LL.h - r, r); x.closePath();
    x.fillStyle = PAPER; x.fill();
    x.fillStyle = it.accent; x.fillRect(0, 0, LL.w, LL.band);
    x.strokeStyle = it.accent; x.lineWidth = 0.35;
    for (let i = 0; i < LL.n; i++) {
      x.beginPath(); x.moveTo(LL.x0, LL.lineY(i)); x.lineTo(LL.x1, LL.lineY(i)); x.stroke();
    }
    x.fillStyle = INK; x.font = `700 ${LL.font}px ${LABEL_FONT}`; x.textBaseline = 'alphabetic';
    (it.title || '').split('\n').slice(0, LL.n).forEach((line, i) => x.fillText(line, LL.x0 + 1, LL.lineY(i) - 0.6));
    return c;
  }

  function paintTab(name) {
    const T = SEP.tab, c = document.createElement('canvas');
    c.width = Math.round(T.w_mm * PX * 1.5); c.height = Math.round(T.h_mm * PX * 1.5);
    const x = c.getContext('2d');
    x.scale(PX * 1.5, PX * 1.5);
    x.fillStyle = '#f7f5ef'; x.fillRect(0, 0, T.w_mm, T.h_mm);
    x.strokeStyle = '#c9c2ad'; x.lineWidth = 0.25; x.strokeRect(0.15, 0.15, T.w_mm - 0.3, T.h_mm - 0.3);
    let size = T.h_mm * 0.6;
    x.font = `600 ${size}px ${TAB_FONT}`;
    while (x.measureText(name).width > T.w_mm * 0.92 && size > 1.5) { size -= 0.2; x.font = `600 ${size}px ${TAB_FONT}`; }
    x.fillStyle = '#26304a'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name, T.w_mm / 2, T.h_mm * 0.55);
    return c;
  }

  // ------------------------------------------------------------------ scene building
  // Items fill the box from the back. Tipped items fall forward "in place": the
  // separators are fixed at the bottom in reality and hold the disks together as if
  // the box were full, so the tipped group always lies where it would in a full box
  // (shifted back by the number of empty slots), right in front of the open item.
  function poseOf(i) {
    const n = state.items.length, j = n - i;
    return j <= state.k ? ['f', j + S.slots - n] : ['b', i + 1];
  }
  const idColor = i => [((i + 1) & 255) / 255, (((i + 1) >> 8) & 255) / 255, 0];
  const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

  function boxFaces(x0, x1, y0, y1, z0, z1) {          // item-frame cuboid faces with normals
    const P = (x, y, z) => [x, y, z];
    return [
      { n: [0, 0, -1], p: [P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0)], k: 'front' },
      { n: [0, 0, 1], p: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], k: 'back' },
      { n: [0, 1, 0], p: [P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)], k: 'edge' },
      { n: [0, -1, 0], p: [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], k: 'edge' },
      { n: [-1, 0, 0], p: [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], k: 'edge' },
      { n: [1, 0, 0], p: [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], k: 'edge' },
    ];
  }

  function buildItems(quads) {
    items.v = []; itemsPick.v = [];
    state.items.forEach((it, i) => {
      const [mode, n] = poseOf(i);
      const id = idColor(i);
      if (it.type === 'disk') {
        const T = pose(mode, n, S.disk_t), P = pts => pts.map(T.p);
        const nf = T.n([0, 0, -1]), nb = T.n([0, 0, 1]), nt = T.n([0, 1, 0]);
        for (const f of DISK_BOX) {
          const wn = T.n(f.n), pts = P(f.p);
          items.poly(pts, lit(it.body, wn, f.k === 'edge' ? 0.8 : 1));
          itemsPick.poly(pts, id);
        }
        // the write protect window is open on a protected disk
        const wp = it.writeProtected ? [0.03, 0.03, 0.03] : null;
        items.poly(P(D.front.shutter), lit('#b9bdc4', nf));
        items.poly(P(D.front.window), lit(it.body, nf, 0.85));
        items.poly(P(D.front.wp), wp || lit(it.body, nf, 0.7));
        items.poly(P(D.back.shutter), lit('#b9bdc4', nb));
        items.poly(P(D.back.window), lit(it.body, nb, 0.85));
        items.poly(P(D.back.hub), lit('#9ca1a8', nb));
        items.poly(P(D.back.wp), wp || lit(it.body, nb, 0.7));
        if (it.hasLabel) {
          items.poly(P(D.back.label), lit(it.accent, nb));
          items.poly(P(D.labelEdge), lit(it.accent, nt));
          const sig = [it.title, it.accent].join('|');
          quads.push({ tex: texture('L' + it.id, sig, () => paintLabel(it)), pts: P(LABEL_QUAD), col: [1, 1, 1].map(() => shadeOf(nf)), id });
        }
      } else {
        const T = pose(mode, n, S.sep_t);
        const turned = it.side === 'L';                 // the plain card has its tab on the viewer's right
        const L = p => (turned ? [D.w - p[0], p[1], S.sep_t - p[2]] : p);
        const P = pts => pts.map(p => T.p(L(p)));
        const N = v => T.n(turned ? [-v[0], v[1], -v[2]] : v);
        const cream = '#e8e0c8', ol = SEP.outline;
        const front = ol.map(([x, y]) => [x, y, 0]), back = ol.map(([x, y]) => [x, y, S.sep_t]);
        items.poly(P(front), lit(cream, N([0, 0, -1])));
        items.poly(P(back), lit(cream, N([0, 0, 1])));
        itemsPick.poly(P(front), id); itemsPick.poly(P(back), id);
        for (let k = 0; k < ol.length; k++) {           // the thin rim
          const a = ol[k], b = ol[(k + 1) % ol.length];
          const pts = P([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], S.sep_t], [a[0], a[1], S.sep_t]]);
          items.poly(pts, lit(cream, N(norm([b[1] - a[1], a[0] - b[0], 0])), 0.85));
          itemsPick.poly(pts, id);
        }
        const tex = texture('T' + it.id, it.name, () => paintTab(it.name));
        quads.push({ tex, pts: P(SEP.tabFront), col: [1, 1, 1].map(() => shadeOf(N([0, 0, -1]))), id });
        quads.push({ tex, pts: P(SEP.tabBack), col: [1, 1, 1].map(() => shadeOf(N([0, 0, 1]))), id });
      }
    });
    items.upload(); itemsPick.upload();
  }

  // ------------------------------------------------------------------ drawing
  let pending = false, VP = null, quads = [];
  function requestDraw() {
    if (pending || !gl || dom.overlay.hidden) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; draw(); });
  }
  function resize() {
    if (dom.overlay.hidden) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    dom.canvas.width = Math.round(dom.stage.clientWidth * dpr);
    dom.canvas.height = Math.round(dom.stage.clientHeight * dpr);
    requestDraw();
  }

  function drawQuads(pick) {
    for (const q of quads) {
      quad.v = [];
      quad.poly(q.pts, pick ? q.id : q.col, UV);
      quad.upload();
      if (!pick) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, q.tex); }
      gl.uniform1i(loc.mode, pick ? 0 : 1);
      quad.draw();
    }
  }

  function render(pick) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.uniformMatrix4fv(loc.vp, false, VP.M);
    gl.uniform1f(loc.alpha, 1);
    gl.uniform1i(loc.mode, 0);
    gl.uniform1i(loc.tex, 0);
    if (pick) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      boxPick.draw(); itemsPick.draw(); drawQuads(true);
      return;
    }
    gl.clearColor(...CLEAR, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);                         // decals sit 0.01..0.1 mm above their faces
    boxOpaque.draw(); items.draw();
    gl.disable(gl.POLYGON_OFFSET_FILL);
    drawQuads(false);
    gl.uniform1i(loc.mode, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(loc.alpha, 0.42);
    boxLid.draw();                                  // smoked lid, behind everything else
    gl.depthMask(true);
  }

  function draw() {
    const moving = stepCamera();
    VP = viewProj();
    quads = [];
    buildItems(quads);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, dom.canvas.width, dom.canvas.height);
    render(false);
    placeLabelText();
    if (moving) requestDraw();
  }

  function pickAt(ev) {
    if (!VP) return -1;
    const r = dom.canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left) * CROP.w / r.width), y = Math.floor((ev.clientY - r.top) * CROP.h / r.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickFB);
    gl.viewport(0, 0, CROP.w, CROP.h);
    render(true);
    const px = new Uint8Array(4);
    gl.readPixels(x, CROP.h - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    requestDraw();
    return px[0] + (px[1] << 8) - 1;
  }

  // ------------------------------------------------------------------ label text editing
  function homography(w, h, q) {                     // rectangle w x h -> quad, as CSS matrix3d
    const src = [[0, 0], [w, 0], [w, h], [0, h]], Am = [], b = [];
    src.forEach(([x, y], i) => {
      const [u, v] = q[i];
      Am.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      Am.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    });
    const m = Am.map((r, i) => [...r, b[i]]), n = 8;
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      [m[c], m[p]] = [m[p], m[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = m[r][c] / m[c][c];
        for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
      }
    }
    const [a, bb, c, d, e, f, g, hh] = m.map((r, i) => r[n] / r[i]);
    return [a, d, 0, g, bb, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1];
  }

  const TPX = 10;                                     // textarea layout: px per label mm
  function placeLabelText() {
    const labelText = dom.labelText;
    const o = openIndex(), it = state.items[o];
    if (!it || it.type !== 'disk' || !it.hasLabel) { labelText.style.display = 'none'; return; }
    const T = pose('b', o + 1, S.disk_t);
    const s = dom.stage.clientWidth / CROP.w;
    const q = LABEL_QUAD.map(p => project(VP, T.p(p)).map(c => c * s));
    const w = LL.w * TPX, h = LL.h * TPX;
    Object.assign(labelText.style, {
      display: 'block', width: w + 'px', height: h + 'px',
      fontSize: LL.font * TPX + 'px', lineHeight: LL.step * TPX + 'px',
      // first line box ends on the first writing line, text baseline ~0.6 mm above it
      paddingTop: (LL.lineY(0) - LL.step + 0.5) * TPX + 'px',
      paddingLeft: (LL.x0 + 1) * TPX + 'px', paddingRight: (LL.w - LL.x1) * TPX + 'px',
      transform: `matrix3d(${homography(w, h, q).join(',')})`,
    });
    if (document.activeElement !== labelText) labelText.value = it.title || '';
  }

  // The label is stored once typing pauses.
  let titleTimer = null, pendingTitle = null;
  function labelInput() {
    const it = state.items[openIndex()];
    if (!it || it.type !== 'disk') return;
    const lines = dom.labelText.value.split('\n');
    if (lines.length > LL.n) dom.labelText.value = lines.slice(0, LL.n).join('\n');
    it.title = dom.labelText.value;
    pendingTitle = { id: it.id, title: it.title };
    clearTimeout(titleTimer);
    titleTimer = setTimeout(flushTitle, 400);
    requestDraw();
  }

  function flushTitle() {
    clearTimeout(titleTimer);
    if (pendingTitle == null) return;
    const p = pendingTitle;
    pendingTitle = null;
    enqueue(() => EstyJs.store.updateDisk(p.id, { title: p.title }));
  }

  // ------------------------------------------------------------------ the box in the store
  function boxRecord() {
    return {
      id: boxId, title: boxTitle,
      items: state.items.map(it => it.type === 'disk' ? { disk: it.id } : { sep: it.name, side: it.side, id: it.id })
    };
  }

  function saveItems() {
    const box = boxRecord();
    return enqueue(() => EstyJs.store.saveBox(box));
  }

  // Reads the box and its disks, after the writes before. keep is a disk id
  // to open afterwards.
  function reload(keep) {
    flushTitle();
    return enqueue(() => Promise.all([EstyJs.store.listBoxes(), EstyJs.store.getBox(boxId), EstyJs.store.listDisks(boxId)]))
      .then(([all, box, disks]) => {
        boxes = all;
        const byId = new Map(disks.map(d => [d.id, d]));
        boxTitle = box.title;
        state.items = box.items.map(item => {
          if (item.disk != null) {
            const d = byId.get(item.disk);
            // imported disks may come without colours
            return d ? Object.assign({ type: 'disk' }, d, { accent: d.accent || ACCENT_COLORS[0], body: d.body || BODY_COLORS[0] }) : null;
          }
          return { type: 'sep', id: item.id || uid(), name: item.sep, side: item.side };
        }).filter(it => it);
        if (keep != null) {
          const i = state.items.findIndex(it => it.type === 'disk' && it.id === keep);
          if (i >= 0) state.k = state.items.length - i - 1;
        }
        update();
      });
  }

  function switchBox(id, k) {
    boxId = id;
    state.k = k != null ? k : ((loadView().k || {})[id] || 0);
    state.sel = null;
    camState.init = false;
    return reload();
  }

  function newBox() {
    const title = 'Box ' + (boxes.length + 1);
    return enqueue(() => EstyJs.store.addBox(title)).then(id => switchBox(id, 0)).then(() => {
      dom.title.focus();
      dom.title.select();
    });
  }

  function deleteBox() {
    const disks = state.items.filter(it => it.type === 'disk');
    if (disks.some(it => inDrive(it.id))) {
      say('A disk of this box is in a drive. Take it out first.', true);
      return;
    }
    if (!confirm('Delete the box "' + boxTitle + '"' +
                 (disks.length ? ' with its ' + disks.length + (disks.length == 1 ? ' disk' : ' disks') : '') + '?')) return;
    const gone = boxId;
    enqueue(() => EstyJs.store.deleteBox(gone))
      .then(() => EstyJs.store.listBoxes())
      .then(all => all.length ? all[0].id : EstyJs.store.addBox('Disks'))
      .then(id => switchBox(id));
  }

  // ------------------------------------------------------------------ export and import
  function download(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    const a = el('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function exportBoxes(all) {
    flushTitle();
    const ids = all ? boxes.map(b => b.id) : [boxId];
    const name = all ? 'EstyJS disk boxes.zip' : boxTitle.replace(/[\\\/:*?"<>|]/g, '_') + '.zip';
    enqueue(() => EstyJs.store.exportBoxes(ids)).then(zip => {
      download(zip, name);
      say('Exported ' + (all ? ids.length + (ids.length == 1 ? ' box' : ' boxes') : '"' + boxTitle + '"') + '.', false);
    });
  }

  function importBoxes(file) {
    file.arrayBuffer()
      .then(buffer => enqueue(() => EstyJs.store.importBoxes(new Uint8Array(buffer), file.name)))
      .then(result => {
        const n = result.boxes.length;
        say('Imported ' + n + (n == 1 ? ' box' : ' boxes') + ' with ' + result.disks +
            (result.disks == 1 ? ' disk' : ' disks') + ' from ' + file.name + '.' +
            (result.skipped ? ' Left out ' + result.skipped + (result.skipped == 1 ? ' file' : ' files') +
                              ' that ' + (result.skipped == 1 ? 'is' : 'are') + ' no disk image.' : ''), false);
        if (n) return switchBox(result.boxes[0], 0);
      }).catch(e => say('Could not import ' + file.name + ': ' + e.message, true));
  }

  // ------------------------------------------------------------------ adding images
  function extensionOf(name) {
    const dot = name.lastIndexOf('.');
    return dot < 0 ? '' : name.slice(dot).toLowerCase();
  }

  // { bytes, name } of the disk image in a file, a ZIP holding one included.
  function imageOf(file) {
    return file.arrayBuffer().then(buffer => {
      const bytes = new Uint8Array(buffer);
      if (extensionOf(file.name) != '.zip') return { bytes, name: file.name };
      return EstyJs.zip.read(bytes).then(files => {
        const image = files.find(f => ['.st', '.msa', '.stx'].includes(extensionOf(f.name)));
        if (image == null) throw new Error(file.name + ' holds no .st, .msa or .stx image.');
        return { bytes: image.bytes, name: image.name.split('/').pop() };
      });
    });
  }

  function addFile(file) {
    if (state.items.length >= MAX) { say('The box is full.', true); return; }

    if (extensionOf(file.name) == '.sts') {
      estyjs.openSnapshotFile(file);
      say('Loaded the snapshot in ' + file.name + '.', false);
      close();
      return;
    }

    const at = openIndex() + 1;
    imageOf(file).then(image => {
      const disk = EstyJs.diskImage.load(image.bytes.slice(0).buffer);
      if (disk == null) throw new Error(image.name + ' is not a disk image EstyJS can read.');
      return enqueue(() => EstyJs.store.addDisk(boxId, {
        title: image.name.replace(/\.[^.]+$/, ''), hasLabel: true,
        accent: ACCENT_COLORS[0], body: BODY_COLORS[0],
        writeProtected: !disk.writable, name: image.name, format: disk.format, bytes: image.bytes
      }, at));
    }).then(id => {
      say('Added ' + file.name + ' to the box.', false);
      return reload(id);
    }).catch(e => say(e.message, true));
  }

  // ------------------------------------------------------------------ drives
  function inDrive(diskId) {
    for (const d of ['A', 'B']) {
      if (drives[d] && !drives[d].detached && drives[d].disk === diskId) return d;
    }
    return null;
  }

  // Writes a disk the ST changed back into the box.
  function writeBack(drive) {
    const held = drives[drive];
    const info = estyjs.getDiskInfo(drive);
    if (!held || held.detached || !info || !info.dirty) return Promise.resolve();
    const bytes = estyjs.getDiskBytes(drive);
    estyjs.clearDirty(drive);
    return enqueue(() => EstyJs.store.writeDisk(held.disk, bytes, info.format)).catch(e => {
      say('Could not keep what was written to the disk in drive ' + drive + ': ' + e.message, true);
    });
  }

  function checkWrites() {
    for (const d of ['A', 'B']) {
      const info = estyjs && estyjs.getDiskInfo(d);
      if (info && info.dirty && !info.motor) writeBack(d);
    }
  }

  // Takes the disk out of a drive. A disk from a box is written back, one
  // from a saved state goes into the open box if the ST wrote to it.
  function takeOut(drive) {
    const held = drives[drive];
    let done = Promise.resolve();

    if (held && !held.detached) {
      done = writeBack(drive);
    } else if (held && held.detached) {
      const info = estyjs.getDiskInfo(drive);
      if (info && info.dirty) {
        const bytes = estyjs.getDiskBytes(drive);
        const from = held.disk != null ? EstyJs.store.getDisk(held.disk) : Promise.resolve(null);
        done = from.then(rec => enqueue(() => EstyJs.store.addDisk(boxId, {
          title: (rec ? rec.title : held.name) || 'Disk', hasLabel: true,
          accent: rec ? rec.accent : ACCENT_COLORS[0], body: rec ? rec.body : BODY_COLORS[0],
          writeProtected: false, name: held.name || '', format: info.format, bytes
        }, null))).then(id => {
          say('The disk from the saved state in drive ' + drive + ' went into the box as a new disk.', false);
          return reload(id);
        });
      }
    }

    drives[drive] = null;
    estyjs.insertDisk(drive, null);
    driveNames[drive] = null;
    showDrive(drive, false);
    return done;
  }

  function insert(drive) {
    const it = selected();
    if (!it || it.type !== 'disk') return;
    const other = inDrive(it.id);
    if (other && other != drive) { say('The disk is in drive ' + other + '.', true); return; }

    const ready = drives[drive] ? takeOut(drive) : Promise.resolve();
    ready.then(() => EstyJs.store.getDiskBytes(it.id)).then(bytes => {
      const result = estyjs.insertDisk(drive, bytes.slice(0).buffer, it.writeProtected);
      if (!result.ok) throw new Error(firstLine(it) + ' is not a disk image EstyJS can read.');
      drives[drive] = { disk: it.id };
      driveNames[drive] = firstLine(it);
      showDrive(drive, true);
      close(true);
      say('Drive ' + drive + ': ' + firstLine(it) + ' (' + describeDisk(result) + ')', false);
    }).catch(e => say(e.message, true));
  }

  // ------------------------------------------------------------------ the panel
  function swatches(container, colors, get, set) {
    container.textContent = '';
    colors.forEach(c => {
      const b = el('button');
      b.style.background = c; b.title = c;
      b.setAttribute('aria-pressed', String(get() === c));
      b.addEventListener('click', () => set(c));
      container.appendChild(b);
    });
  }

  function setDisk(it, fields) {
    Object.assign(it, fields);
    enqueue(() => EstyJs.store.updateDisk(it.id, fields));
    update();
  }

  function updatePanel() {
    const it = selected();
    dom.count.textContent = `${state.items.length} / ${MAX}`;
    dom.addDisk.disabled = dom.addSep.disabled = state.items.length >= MAX;
    dom.boxes.textContent = '';
    boxes.forEach(b => {
      const o = el('option', null, b.title);
      o.value = b.id;
      o.selected = b.id === boxId;
      dom.boxes.appendChild(o);
    });
    if (document.activeElement !== dom.title) dom.title.value = boxTitle;

    const drive = it && it.type === 'disk' ? inDrive(it.id) : null;
    dom.remove.disabled = !it || drive != null;
    dom.diskProps.hidden = !it || it.type !== 'disk';
    dom.sepProps.hidden = !it || it.type !== 'sep';
    if (!it) return;

    if (it.type === 'disk') {
      dom.hasLabel.checked = it.hasLabel;
      swatches(dom.accent, ACCENT_COLORS, () => it.accent, c => setDisk(it, { accent: c }));
      swatches(dom.body, BODY_COLORS, () => it.body, c => setDisk(it, { body: c }));
      dom.wp.checked = it.writeProtected;
      dom.wp.disabled = it.format == 'STX' || drive != null;
      dom.image.textContent = (it.name || 'No file name') + ', ' + it.format +
        (drive ? '. In drive ' + drive + '.' : '.');
      dom.intoA.disabled = drive != null;
      dom.intoB.disabled = drive != null;
      dom.intoA.classList.toggle('db-target', target === 'A');
      dom.intoB.classList.toggle('db-target', target === 'B');

      dom.others.textContent = '';
      const others = boxes.filter(b => b.id !== boxId);
      others.forEach(b => {
        const o = el('option', null, b.title);
        o.value = b.id;
        dom.others.appendChild(o);
      });
      dom.otherBlock.hidden = others.length == 0;
    } else if (document.activeElement !== dom.sepName) {
      dom.sepName.value = it.name;
    }
  }

  function update() {
    settle(1);
    if (boxId != null) saveView();
    updatePanel();
    requestDraw();
  }

  function browse(dir) {
    state.k += dir;
    settle(dir);
    state.sel = null;
    update();
  }

  function addSep() {
    if (state.items.length >= MAX) return;
    const last = [...state.items].reverse().find(it => it.type === 'sep');
    const item = { id: uid(), type: 'sep', name: 'CATEGORY', side: last && last.side === 'L' ? 'R' : 'L' };
    state.items.splice(openIndex() + 1, 0, item);           // into the gap in front of the open disk
    settle(1);
    state.sel = item.id;
    saveItems();
    update();
    dom.sepName.focus();
    dom.sepName.select();
  }

  function remove() {
    const i = selIndex(), it = state.items[i];
    if (!it) return;
    if (it.type === 'sep') {
      state.items.splice(i, 1);
      state.sel = null;
      saveItems();
      update();
      return;
    }
    if (inDrive(it.id)) return;
    if (!confirm('Remove the disk "' + firstLine(it) + '" from the box? Its image is deleted.')) return;
    enqueue(() => EstyJs.store.removeDisk(it.id)).then(() => reload());
  }

  function toOtherBox(move) {
    const it = selected(), to = +dom.others.value;
    if (!it || it.type !== 'disk' || !to) return;
    const other = boxes.find(b => b.id === to);
    if (other && other.items.length >= MAX) { say('The box "' + other.title + '" is full.', true); return; }
    const action = move ? () => EstyJs.store.moveDisk(it.id, to) : () => EstyJs.store.copyDisk(it.id, to);
    enqueue(action).then(() => {
      say((move ? 'Moved "' : 'Copied "') + firstLine(it) + '" to the front of "' + (other ? other.title : '') + '".', false);
      return reload();
    });
  }

  // ------------------------------------------------------------------ the dialog
  function build(container) {
    const overlay = el('div', 'db-overlay');
    overlay.hidden = true;
    const dialog = el('div', 'db-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Disk box');
    dialog.tabIndex = -1;

    const head = el('div', 'db-head');
    const boxesSelect = el('select', 'db-boxes');
    boxesSelect.setAttribute('aria-label', 'Box');
    boxesSelect.addEventListener('change', () => switchBox(+boxesSelect.value));
    const title = el('input', 'db-title');
    title.type = 'text';
    title.maxLength = 40;
    title.setAttribute('aria-label', 'Name of the box');
    title.addEventListener('change', () => {
      boxTitle = title.value.trim() || boxTitle;
      title.value = boxTitle;
      saveItems().then(() => EstyJs.store.listBoxes()).then(all => { boxes = all; updatePanel(); });
    });
    title.addEventListener('keyup', e => { if (e.key == 'Enter') title.blur(); });
    const count = el('span', 'db-count');
    const importInput = el('input');
    importInput.type = 'file';
    importInput.accept = '.zip';
    importInput.hidden = true;
    importInput.addEventListener('change', () => {
      const f = importInput.files[0];
      importInput.value = '';
      if (f) importBoxes(f);
    });
    head.append(boxesSelect, title, button('New box', newBox), button('Delete box', deleteBox),
                button('Export box', () => exportBoxes(false)), button('Export all', () => exportBoxes(true)),
                button('Import', () => importInput.click()), importInput, count,
                button('Close box', () => close(), 'db-close'));

    const body = el('div', 'db-body');
    const stage = el('div', 'db-stage');
    const canvas = el('canvas');
    const labelText = el('textarea', 'db-label');
    labelText.spellcheck = false;
    labelText.setAttribute('aria-label', 'Label of the open disk');
    labelText.addEventListener('input', labelInput);
    stage.append(canvas, labelText);

    const panel = el('div', 'db-panel');
    const file = el('input');
    file.type = 'file';
    file.accept = '.st,.msa,.stx,.zip,.sts';
    file.hidden = true;
    file.addEventListener('change', () => {
      const f = file.files[0];
      file.value = '';
      if (f) addFile(f);
    });
    const addDisk = button('Add disk image', () => file.click());
    const addSepButton = button('Add divider', addSep);
    const removeButton = button('Remove', remove);
    const tools = el('div', 'db-tools');
    tools.append(addDisk, addSepButton, removeButton, file);

    const row = (label, ...content) => {
      const r = el('div', 'db-row');
      r.append(el('span', null, label), ...content);
      return r;
    };

    const diskProps = el('section');
    const hasLabel = el('input');
    hasLabel.type = 'checkbox';
    hasLabel.addEventListener('change', () => setDisk(selected(), { hasLabel: hasLabel.checked }));
    const accent = el('div', 'db-swatches'), bodyColors = el('div', 'db-swatches');
    const wp = el('input');
    wp.type = 'checkbox';
    wp.addEventListener('change', () => setDisk(selected(), { writeProtected: wp.checked }));
    const image = el('p', 'db-small');
    const intoA = button('Into drive A', () => insert('A'));
    const intoB = button('Into drive B', () => insert('B'));
    const drivesRow = el('div', 'db-row db-drives');
    drivesRow.append(intoA, intoB);
    const others = el('select', 'db-others');
    others.setAttribute('aria-label', 'Other box');
    const otherRow = el('div', 'db-row db-other');
    otherRow.append(others, button('Copy', () => toOtherBox(false)), button('Move', () => toOtherBox(true)));
    const otherBlock = el('div');
    otherBlock.append(el('h3', null, 'Other box'), otherRow);
    diskProps.append(el('h3', null, 'Disk'), row('Label', hasLabel), row('Label colour', accent),
                     row('Case', bodyColors), row('Write protected', wp), image, drivesRow, otherBlock);

    const sepProps = el('section');
    const sepName = el('input');
    sepName.type = 'text';
    sepName.maxLength = 24;
    sepName.addEventListener('input', () => {
      const it = selected();
      it.name = sepName.value.toUpperCase();
      requestDraw();
    });
    sepName.addEventListener('change', () => saveItems());
    sepName.addEventListener('keyup', e => { if (e.key == 'Enter') sepName.blur(); });
    sepProps.append(el('h3', null, 'Divider'), row('Name', sepName),
                    row('Tab', button('Other side', () => {
                      const it = selected();
                      it.side = it.side === 'L' ? 'R' : 'L';
                      saveItems();
                      update();
                    })));

    panel.append(tools, diskProps, sepProps);
    body.append(stage, panel);

    const message = el('p', 'db-message');
    const hint = el('p', 'db-hint', 'Click a disk or divider, or use the mouse wheel or the arrow keys to browse. ' +
                    'Write on the label of the open disk.');
    dialog.append(head, body, message, hint);
    overlay.append(dialog);
    container.append(overlay);

    dom = {
      overlay, dialog, boxes: boxesSelect, title, count, stage, canvas, labelText, message,
      addDisk, addSep: addSepButton, remove: removeButton, diskProps, sepProps, hasLabel, accent,
      body: bodyColors, wp, image, intoA, intoB, others, otherBlock, sepName
    };

    canvas.addEventListener('click', ev => {
      const i = pickAt(ev);
      if (i < 0 || i >= state.items.length) return;
      const j = state.items.length - i;                  // position counted from the front
      if (state.items[i].type === 'sep') {
        state.k = j;                                     // tip the divider, open the disk behind it
        settle(1);
        state.sel = state.items[i].id;
      } else {
        state.k = j - 1;                                 // the clicked disk becomes the open one
        state.sel = null;
      }
      update();
    });
    let hoverPending = false;
    canvas.addEventListener('mousemove', ev => {
      if (hoverPending) return;
      hoverPending = true;
      requestAnimationFrame(() => { hoverPending = false; canvas.style.cursor = pickAt(ev) >= 0 ? 'pointer' : 'default'; });
    });
    canvas.addEventListener('wheel', ev => {
      ev.preventDefault();
      browse(ev.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    window.addEventListener('keydown', ev => {
      if (overlay.hidden) return;
      if (ev.key === 'Escape') { close(); return; }
      const tag = ev.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') browse(1);
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') browse(-1);
    });
    new ResizeObserver(resize).observe(stage);
  }

  // ------------------------------------------------------------------ public
  // Builds the dialog into container and finds out whether the browser can
  // show it. available stays false without WebGL2 or storage.
  self.create = function (containerId) {
    const container = document.getElementById(containerId);
    if (container == null) return Promise.resolve(false);
    build(container);

    gl = dom.canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) return Promise.resolve(false);

    return Promise.all([
      fetch('diskbox/geometry.json').then(r => r.json()),
      document.fonts.load(`700 40px ${LABEL_FONT}`).catch(() => {}),
      EstyJs.store.listBoxes()
    ]).then(([geometry, , all]) => {
      G = geometry;
      CAM = G.camera; S = G.stack; D = G.disk; SEP = G.separator; W = CAM.w; H = CAM.h;
      A = S.lean_deg * Math.PI / 180; CA = Math.cos(A); SA = Math.sin(A);
      LL = labelLayout();
      DISK_BOX = boxFaces(0, D.w, 0, D.h, D.body.z[0], D.body.z[1]);
      // the simplified body has no label recess: put the front label just in front of it
      LABEL_QUAD = D.front.labelQuad.map(p => [p[0], p[1], D.body.z[0] - 0.03]);
      setupGL();

      const view = loadView();
      const known = all.find(b => b.id === view.box) || all[0];
      return known ? known.id : EstyJs.store.addBox('Disks');
    }).then(id => switchBox(id)).then(() => {
      setInterval(checkWrites, 1000);
      // the light may never go off before the page goes away
      window.addEventListener('pagehide', () => { writeBack('A'); writeBack('B'); });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { writeBack('A'); writeBack('B'); }
      });
      self.available = true;
      return true;
    }).catch(e => {
      console.log('disk box not available: ' + (e && e.message ? e.message : e));
      return false;
    });
  };

  // Takes the disk out of the drive (null for none) and shows the box, open
  // at that disk.
  self.open = function (drive) {
    if (!self.available) return;
    target = drive || null;
    const held = drive ? drives[drive] : null;
    const ready = drive ? takeOut(drive) : Promise.resolve();
    dom.overlay.hidden = false;
    estyjs.setKeyboardEnabled(false);
    dom.message.textContent = drive ? 'Choose a disk for drive ' + drive + '.' : '';
    dom.message.className = 'db-message';
    dom.dialog.focus();
    resize();
    ready.then(() => {
      if (!held || held.detached) return reload();
      return EstyJs.store.getDisk(held.disk).then(rec => {
        if (rec && rec.box !== boxId) {
          boxId = rec.box;
          state.sel = null;
          camState.init = false;
        }
        return reload(rec ? rec.id : null);
      });
    }).catch(e => say(e.message, true));
  };

  function close(inserted) {
    if (dom.overlay.hidden) return;
    flushTitle();
    dom.overlay.hidden = true;
    estyjs.setKeyboardEnabled(true);
    if (!inserted && target) diskMessage('Drive ' + target + ' is empty.', false);
    target = null;
  }
  self.close = function () { close(); };

  // For a saved state: the disk in the drive, from a box or from a state.
  self.diskInDrive = function (drive) {
    return drives[drive] ? drives[drive].disk : null;
  };

  // Before a state is loaded: takes both disks out.
  self.takeOutAll = function () {
    if (!self.available) return Promise.resolve();
    return Promise.all([takeOut('A'), takeOut('B')]);
  };

  // After a state was loaded. disks: { A: { disk, name } or null, B }.
  self.stateLoaded = function (disks) {
    for (const d of ['A', 'B']) {
      drives[d] = disks[d] ? { disk: disks[d].disk, detached: true, name: disks[d].name } : null;
    }
  };

  return self;
})();
