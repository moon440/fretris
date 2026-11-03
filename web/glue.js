/* fretris host — keyboard, framebuffer, audio, display.
 * Copyright (C) 2026 moon440  SPDX-License-Identifier: AGPL-3.0-only */
"use strict";

const KEY = {
  ArrowLeft: [0, 0], ArrowRight: [0, 1], ArrowDown: [0, 2],
  ArrowUp: [0, 3], KeyX: [0, 3], KeyZ: [0, 4],
  KeyC: [0, 5], ShiftLeft: [0, 5], ShiftRight: [0, 5],
  Space: [0, 6], KeyP: [0, 7], Enter: [0, 8], KeyR: [0, 9],
};
const FBW = 480, FBH = 400;

/* field geometry mirrors the module constants */
const OX = 30, OY = 20, CELL = 18, COLS = 10, VISIBLE = 20;

/* flat palette -> gradient pairs; integer keys 0xBBGGRR */
const _g = {};
function gkey(r, g, b) { return (b << 16) | (g << 8) | r; }
/* source colors -> [topRGB, botRGB] */
_g[gkey(85, 255, 255)]  = [[180, 255, 255], [ 30, 150, 250]];
_g[gkey(255, 255, 85)]  = [[255, 245, 160], [255, 150,  20]];
_g[gkey(170, 85, 255)]  = [[238, 165, 255], [140,  40, 238]];
_g[gkey(85, 255, 85)]   = [[185, 255, 160], [ 40, 195,  80]];
_g[gkey(255, 85, 85)]   = [[255, 175, 150], [245,  50,  70]];
_g[gkey(85, 85, 255)]   = [[165, 175, 255], [ 50,  70, 245]];
_g[gkey(212, 212, 212)] = [[255, 228, 185], [245, 140,  70]];
const HALFK = {};
for (const k in _g) {
  const r = +k & 255, g = (+k >> 8) & 255, b = (+k >> 16) & 255;
  HALFK[gkey(r >> 1, g >> 1, b >> 1)] = +k;
}
const GRAD = new Map(Object.entries(_g).map(([k, v]) => [+k, v]));

/* background flat colors -> vertical gradient endpoints */
const BG = [
  [gkey(0, 0, 85),   [0x28, 0x18, 0x4e], [0x3c, 0x18, 0x66]],
  [gkey(0, 0, 170),  [0x26, 0x1c, 0x62], [0x4a, 0x30, 0xbc]],
  [gkey(85, 85, 255),[0xb4, 0x8c, 0xff], [0x4a, 0xdc, 0xff]],
];
const BG_LUT = new Map();           /* color -> Uint8ClampedArray(3*FBH) built lazily per pass */

function cellKey(u32, cx, cy) { return u32[cy * FBW + cx] & 0xffffff; }

function paintCell(d, x, y, s, g) {
  const c0 = g[0], c1 = g[1];
  for (let j = 0; j < s; j++) {
    const t = j / (s - 1);
    let r = c0[0] + (c1[0] - c0[0]) * t,
        gg = c0[1] + (c1[1] - c0[1]) * t,
        b = c0[2] + (c1[2] - c0[2]) * t;
    const hl = 0.45 - t;
    if (hl > 0) { r += (255 - r) * hl * 1.1; gg += (255 - gg) * hl * 1.1; b += (255 - b) * hl * 1.1; }
    else if (t > 0.78) { r *= 0.8; gg *= 0.8; b *= 0.8; }
    const row = y + j;
    if (row < 0 || row >= FBH) continue;
    for (let i = 0; i < s; i++) {
      if (i + j < 2 || (s - 1 - i) + (s - 1 - j) < 2) continue;
      let rr = r, g2 = gg, bb = b;
      if (j === 0 || i === 0) { rr += 34; g2 += 34; bb += 34; }
      if (j === s - 1 || i === s - 1) { rr *= 0.55; g2 *= 0.55; bb *= 0.55; }
      const p = (row * FBW + x + i) * 4;
      d[p] = rr; d[p + 1] = g2; d[p + 2] = bb;
    }
  }
}

/* precomputed grids: [x, y, size] triples for every block cell the module can draw */
function buildGrids() {
  const grids = [];
  for (let r = 0; r < VISIBLE; r++)
    for (let c = 0; c < COLS; c++)
      grids.push([OX + c * CELL, OY + r * CELL, CELL]);
  for (let i = 0; i < 3; i++)
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        grids.push([330 + 25 + c * 14, 30 + i * 66 + 8 + r * 14, 14]);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      grids.push([424 + c * 11, 36 + r * 11, 11]);
  for (let i = 0; i < 15; i++) grids.push([12 + i * 31, FBH - 36, 28]);
  return grids;
}

const GRIDS = buildGrids();

let bgWords = null;
function polish(d, u32) {
  if (!bgWords) {
    bgWords = BG.map(([, a, b]) => {
      const w = new Uint32Array(FBH);
      for (let y = 0; y < FBH; y++) {
        const t = y / FBH;
        const r = (a[0] + (b[0] - a[0]) * t) | 0,
              g = (a[1] + (b[1] - a[1]) * t) | 0,
              bl = (a[2] + (b[2] - a[2]) * t) | 0;
        w[y] = 0xff000000 | (bl << 16) | (g << 8) | r;
      }
      return w;
    });
    bgWords.k = BG.map(([k]) => k);
  }
  const k0 = bgWords.k[0], k1 = bgWords.k[1], k2 = bgWords.k[2];
  const w0 = bgWords[0], w1 = bgWords[1], w2 = bgWords[2];
  for (let y = 0; y < FBH; y++) {
    const base = y * FBW;
    const a0 = w0[y], a1 = w1[y], a2 = w2[y];
    for (let i = 0; i < FBW; i++) {
      const v = u32[base + i];
      const flat = v & 0xffffff;
      if (flat === k0) u32[base + i] = a0;
      else if (flat === k1) u32[base + i] = a1;
      else if (flat === k2) u32[base + i] = a2;
    }
  }
  for (const [x, y, s] of GRIDS) {
    const k = cellKey(u32, x + (s >> 1), y + (s >> 1));
    const g = GRAD.get(k);
    if (g) { paintCell(d, x, y, s, g); continue; }
    const hk = HALFK[k];
    if (hk === undefined) continue;
    const c = GRAD.get(hk)[0];
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const p = ((y + j) * FBW + (x + i)) * 4;
        if (j === 0 || i === 0 || j === s - 1 || i === s - 1) {
          d[p] = Math.min(255, c[0] * 0.8 + 60); d[p + 1] = Math.min(255, c[1] * 0.8 + 60); d[p + 2] = Math.min(255, c[2] * 0.8 + 60);
        } else { d[p] += c[0] * 0.10; d[p + 1] += c[1] * 0.10; d[p + 2] += c[2] * 0.14; }
      }
  }
}

/* ---- audio: square-wave ---- */
let ac = null;
function beep(freq, ms, vol = 0.04, when = 0) {
  if (!ac) return;
  const t = ac.currentTime + when / 1000;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = "square"; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + ms / 1000);
}
const SND = {
  1: (e) => beep(220, 25),
  2: (e) => beep(300, 25),
  4: (e) => beep(180, 15),
  8: (e) => beep(140, 40),
  16: (e) => beep(110, 30),
  32: (e) => { beep(523, 60); beep(659, 60, .04, 70); beep(784, 80, .04, 140); },
  64: (e) => { beep(523, 50); beep(659, 50, .05, 55); beep(784, 50, .05, 110); beep(1047, 120, .05, 165); },
  128: (e) => beep(440, 30),
  256: (e) => { beep(660, 60); beep(880, 90, .05, 70); },
  512: (e) => { beep(330, 120); beep(262, 120, .05, 130); beep(196, 260, .05, 260); },
  1024: (e) => beep(880, 40),
};

/* ---- Korobeiniki (public-domain folk tune), eighth notes ---- */
const N = { g3: 196, c4: 262, d4: 294, e4: 330, f4: 349, g4: 392, a4: 440, b4: 494,
            c5: 523, d5: 587, e5: 659, f5: 698, g5: 784, a5: 880, _: 0 };
const SONG = [
  ["e5",2],["b4",1],["c5",1],["d5",2],["c5",1],["b4",1],
  ["a4",2],["a4",1],["c5",1],["e5",2],["d5",1],["c5",1],
  ["b4",3],["c5",1],["d5",2],["e5",2],
  ["c5",2],["a4",2],["a4",2],["_",2],
  ["d5",3],["f5",1],["a5",2],["g5",1],["f5",1],
  ["e5",3],["c5",1],["e5",2],["d5",1],["c5",1],
  ["b4",2],["b4",1],["c5",1],["d5",2],["e5",2],
  ["c5",2],["a4",2],["a4",2],["_",2],
];
let songOn = true, songTimer = null;
function startSong() {
  if (songTimer || !ac) return;
  const step = 250;
  let i = 0;
  songTimer = setInterval(() => {
    let [note, len] = SONG[i];
    const f = N[note];
    if (f) beep(f, step * len * 0.9, 0.025);
    i = (i + len) % SONG.length;
  }, step);
}
function stopSong() { clearInterval(songTimer); songTimer = null; }

/* ---- main ---- */
(async function boot() {
  const cv = document.getElementById("screen");
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(FBW, FBH);
  const { instance } = await WebAssembly.instantiateStreaming(
    fetch("tetris.wasm"), { env: {} });
  const ex = instance.exports;

  ex.init(Date.now() >>> 0);

  addEventListener("keydown", (e) => {
    if (!ac) { ac = new AudioContext(); if (songOn) startSong(); }
    if (e.code === "KeyM") { songOn = !songOn; songOn ? startSong() : stopSong(); return; }
    const m = KEY[e.code];
    if (m) { e.preventDefault(); ex.key(m[1], 1); }
  });
  addEventListener("keyup", (e) => {
    const m = KEY[e.code];
    if (m) { e.preventDefault(); ex.key(m[1], 0); }
  });

  let last = performance.now();
  const u32 = new Uint32Array(img.data.buffer);
  const prev = new Uint32Array(FBW * FBH);
  prev.fill(0xffffffff);
  let firstDraw = true;
  function frame(now) {
    const dt = Math.min(now - last, 50);
    last = now;
    ex.tick(dt >>> 0);
    let ev = ex.events();
    for (const bit of [1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1])
      if (ev & bit) { SND[bit](); ev &= ~bit; }
    const fb = new Uint8Array(ex.memory.buffer, ex.framebuffer(), FBW * FBH * 4);
    img.data.set(fb);
    const cur = new Uint32Array(img.data.buffer);
    if (firstDraw || !sameFrame(cur, prev)) {
      polish(img.data, cur);
      ctx.putImageData(img, 0, 0);
      prev.set(cur);
      firstDraw = false;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

function sameFrame(a, b) {
  for (let i = 0; i < a.length; i += 64) if (a[i] !== b[i]) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
