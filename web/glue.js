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

/* palette -> gradient pairs; integer keys 0xBBGGRR */
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

function cellKey(u32, cx, cy) { return u32[cy * FBW + cx] & 0xffffff; }

/* one solid fill + light top-left / dark bottom-right edge per cell */
function paintCell(d, x, y, s, g) {
  const c0 = g[0], c1 = g[1];
  const fr = (c0[0] + c1[0]) >> 1, fg = (c0[1] + c1[1]) >> 1, fb = (c0[2] + c1[2]) >> 1;
  for (let j = 0; j < s; j++) {
    const row = y + j;
    if (row < 0 || row >= FBH) continue;
    for (let i = 0; i < s; i++) {
      const col = x + i;
      if (col < 0 || col >= FBW) continue;
      let r = fr, gg = fg, b = fb;
      if (j === 0 || i === 0) { r += 26; gg += 26; b += 26; }
      else if (j === s - 1 || i === s - 1) { r = r * 0.76 | 0; gg = gg * 0.76 | 0; b = b * 0.76 | 0; }
      const p = (row * FBW + col) * 4;
      d[p] = r; d[p + 1] = gg; d[p + 2] = b;
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
  return grids;
}
function buildTitleGrids() {
  const grids = [];
  for (let i = 0; i < 15; i++) grids.push([12 + i * 31, FBH - 36, 28]);
  return grids;
}

/* background solid colors */
const BG = [
  [gkey(0, 0, 85),   [46, 50, 88]],
  [gkey(0, 0, 170),  [42, 52, 102]],
  [gkey(85, 85, 255),[158, 164, 214]],
];
const BG_WORDS = BG.map(([k, rgb]) => [k, 0xff000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]]);

const GRIDS = buildGrids();
const GRIDS_TITLE = buildTitleGrids();

function polish(d, u32, state) {
  const b0 = BG_WORDS[0], b1 = BG_WORDS[1], b2 = BG_WORDS[2];
  for (let i = 0; i < FBW * FBH; i++) {
    const flat = u32[i] & 0xffffff;
    if (flat === b0[0]) u32[i] = b0[1];
    else if (flat === b1[0]) u32[i] = b1[1];
    else if (flat === b2[0]) u32[i] = b2[1];
  }
  for (const [x, y, s] of (state === 0 ? GRIDS_TITLE : GRIDS)) {
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

/* display mode: polished (default) or raw high-contrast engine colors (H) */
let showPolish = true;

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
    if (e.repeat) return;                 /* OS key-repeat must not re-trigger drops/DAS */
    if (!ac) { ac = new AudioContext(); if (songOn) startSong(); }
    if (e.code === "KeyM") { songOn = !songOn; songOn ? startSong() : stopSong(); return; }
    if (e.code === "KeyH") { showPolish = !showPolish; firstDraw = true; return; }
    const m = KEY[e.code];
    if (m) { e.preventDefault(); ex.key(m[1], 1); }
  });
  addEventListener("keyup", (e) => {
    const m = KEY[e.code];
    if (m) { e.preventDefault(); ex.key(m[1], 0); }
  });

  /* pointer/touch: hold = keydown..keyup, tap = down+up; engine owns auto-repeat */
  const ensureAudio = () => { if (!ac) { ac = new AudioContext(); if (songOn) startSong(); } };
  document.querySelectorAll("[data-key]").forEach((btn) => {
    const code = +btn.getAttribute("data-key");
    const tap = btn.hasAttribute("data-tap");
    let held = false;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault(); ensureAudio(); btn.setPointerCapture(e.pointerId);
      held = true; ex.key(code, 1); if (tap) { ex.key(code, 0); held = false; }
    });
    const release = () => { if (held) { ex.key(code, 0); held = false; } };
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", release);
  });
  document.querySelectorAll("[data-hc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showPolish = !showPolish;
      btn.setAttribute("aria-pressed", String(showPolish));
      firstDraw = true;
    });
  });

  let last = performance.now();
  const prev = new Uint32Array(FBW * FBH);
  prev.fill(0xffffffff);
  let firstDraw = true;
  let lastSc = -1, lastLv = -1, lastLn = -1, lastSt = -1;
  const statusEl = document.getElementById("status");
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
      prev.set(cur);              /* keep raw pixels; polish mutates cur in place */
      if (showPolish) polish(img.data, cur, ex.state());
      ctx.putImageData(img, 0, 0);
      firstDraw = false;
    }
    const sc = ex.score(), lv = ex.level(), ln = ex.lines(), st = ex.state();
    if (statusEl && (sc !== lastSc || lv !== lastLv || ln !== lastLn || st !== lastSt)) {
      lastSc = sc; lastLv = lv; lastLn = ln; lastSt = st;
      statusEl.textContent = st === 1 ? `Playing. Score ${sc}, level ${lv}, ${ln} lines cleared.`
        : st === 2 ? "Paused."
        : st === 3 ? `Game over. Score ${sc}, ${ln} lines. Press Enter to restart.`
        : "Fretris. Press Enter to start.";
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
