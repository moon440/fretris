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

/* flat palette -> gradient pairs, keyed by "r,g,b" */
const GRAD = {
  "85,255,255":  [[180, 255, 255], [ 30, 150, 250]],
  "255,255,85":  [[255, 245, 160], [255, 150,  20]],
  "170,85,255":  [[238, 165, 255], [140,  40, 238]],
  "85,255,85":   [[185, 255, 160], [ 40, 195,  80]],
  "255,85,85":   [[255, 175, 150], [245,  50,  70]],
  "85,85,255":   [[165, 175, 255], [ 50,  70, 245]],
  "212,212,212": [[255, 228, 185], [245, 140,  70]],
};
const HALF = {}; /* pc/2 -> same gradient, for ghost tints */
for (const k in GRAD) HALF[k.split(",").map(v => (v / 2) | 0).join(",")] = k;

function cellKey(d, cx, cy) {
  const p = (cy * FBW + cx) * 4;
  return d[p] + "," + d[p + 1] + "," + d[p + 2];
}

function paintCell(d, x, y, s, g) {
  const c0 = g[0], c1 = g[1];
  for (let j = 0; j < s; j++) {
    for (let i = 0; i < s; i++) {
      if (i + j < 2 || (s - 1 - i) + (s - 1 - j) < 2) continue;
      const t = j / (s - 1);
      let r = c0[0] + (c1[0] - c0[0]) * t,
          gg = c0[1] + (c1[1] - c0[1]) * t,
          b = c0[2] + (c1[2] - c0[2]) * t;
      const hl = 0.45 - t;
      if (hl > 0) { r += (255 - r) * hl * 1.1; gg += (255 - gg) * hl * 1.1; b += (255 - b) * hl * 1.1; }
      else if (t > 0.78) { r *= 0.8; gg *= 0.8; b *= 0.8; }
      if (j === 0 || i === 0) { r += 34; gg += 34; b += 34; }
      if (j === s - 1 || i === s - 1) { r *= 0.55; gg *= 0.55; b *= 0.55; }
      const p = ((y + j) * FBW + (x + i)) * 4;
      d[p] = r; d[p + 1] = gg; d[p + 2] = b;
    }
  }
}

function polish(d) {
  /* backgrounds first: exact flat colors -> vertical gradients */
  for (let y = 0; y < FBH; y++) {
    const t = y / FBH;
    let bg = null;
    for (let x = 0; x < FBW; x++) {
      const p = (y * FBW + x) * 4;
      const k = d[p] + "," + d[p + 1] + "," + d[p + 2];
      if (k === "0,0,85")       bg = [0x28 + 0x14 * (1 - t), 0x18, 0x4e + 0x18 * t];
      else if (k === "0,0,170") bg = [0x26 + 0x24 * t, 0x1c + 0x14 * t, 0x62 + 0x5a * t];
      else if (k === "85,85,255") bg = [0xb4 - 0x6a * t, 0x8c + 0x50 * t, 0xff];
      if (bg) { d[p] = bg[0]; d[p + 1] = bg[1]; d[p + 2] = bg[2]; }
    }
  }
  /* solid cells on known grids */
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

  const ghostSeen = [];
  for (const [x, y, s] of grids) {
    const k = cellKey(d, x + (s >> 1), y + (s >> 1));
    if (GRAD[k]) paintCell(d, x, y, s, GRAD[k]);
    else if (HALF[k]) ghostSeen.push([x, y, s, HALF[k]]);
  }
  /* ghost outlines: brighten border pixels, tint interior */
  for (const [x, y, s, key] of ghostSeen) {
    const g = GRAD[key], c = g[0];
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const p = ((y + j) * FBW + (x + i)) * 4;
        const edge = j === 0 || i === 0 || j === s - 1 || i === s - 1;
        if (edge) {
          d[p] = Math.min(255, c[0] * 0.8 + 60); d[p + 1] = Math.min(255, c[1] * 0.8 + 60); d[p + 2] = Math.min(255, c[2] * 0.8 + 60);
        } else {
          d[p] += c[0] * 0.10; d[p + 1] += c[1] * 0.10; d[p + 2] += c[2] * 0.14;
        }
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
  function frame(now) {
    const dt = Math.min(now - last, 50);
    last = now;
    ex.tick(dt >>> 0);
    let ev = ex.events();
    for (const bit of [1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1])
      if (ev & bit) { SND[bit](); ev &= ~bit; }
    img.data.set(new Uint8Array(ex.memory.buffer, ex.framebuffer(), FBW * FBH * 4));
    polish(img.data);
    ctx.putImageData(img, 0, 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
