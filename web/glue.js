/* tetris.wasm host — keyboard, framebuffer blit, PC-speaker beeps.
 * Copyright (C) 2026 moon440  SPDX-License-Identifier: AGPL-3.0-only */
"use strict";

const KEY = {
  ArrowLeft: [0, 0], ArrowRight: [0, 1], ArrowDown: [0, 2],
  ArrowUp: [0, 3], KeyX: [0, 3], KeyZ: [0, 4],
  KeyC: [0, 5], ShiftLeft: [0, 5], ShiftRight: [0, 5],
  Space: [0, 6], KeyP: [0, 7], Enter: [0, 8], KeyR: [0, 9],
};
const FBW = 480, FBH = 400;

/* ---- audio: square-wave "PC speaker" ---- */
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
  1: (e) => beep(220, 25),                    // move
  2: (e) => beep(300, 25),                    // rotate
  4: (e) => beep(180, 15),                    // soft drop
  8: (e) => beep(140, 40),                    // hard drop
  16: (e) => beep(110, 30),                   // lock
  32: (e) => { beep(523, 60); beep(659, 60, .04, 70); beep(784, 80, .04, 140); }, // clear
  64: (e) => { beep(523, 50); beep(659, 50, .05, 55); beep(784, 50, .05, 110); beep(1047, 120, .05, 165); }, // tetris
  128: (e) => beep(440, 30),                  // hold
  256: (e) => { beep(660, 60); beep(880, 90, .05, 70); }, // level up
  512: (e) => { beep(330, 120); beep(262, 120, .05, 130); beep(196, 260, .05, 260); }, // over
  1024: (e) => beep(880, 40),                 // start
};

/* ---- Korobeiniki (public-domain folk tune), eighth notes ---- */
const N = { g3: 196, c4: 262, d4: 294, e4: 330, f4: 349, g4: 392, a4: 440, b4: 494,
            c5: 523, d5: 587, e5: 659, f5: 698, g5: 784, a5: 880, _: 0 };
const SONG = [ // [note, eighths]
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
  const step = 250; // ms per eighth
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
  const restart = () => { ex.init((Date.now() >>> 0) || 1); ex.key(8, 1); ex.key(8, 0); };

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
    const fb = new Uint8Array(ex.memory.buffer, ex.framebuffer(), FBW * FBH * 4);
    img.data.set(fb);
    ctx.putImageData(img, 0, 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
