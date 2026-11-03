# FRETRIS

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](COPYING)
[![WebAssembly](https://img.shields.io/badge/compiled%20to-WebAssembly-8CC84B.svg)](https://webassembly.org/)
[![build](https://github.com/moon440/fretris/actions/workflows/build.yml/badge.svg)](https://github.com/moon440/fretris/actions/workflows/build.yml)
[![play](https://img.shields.io/badge/%E2%96%B6_play-live%20demo-brightgreen)](https://moon440.github.io/fretris/)

SPDX-License-Identifier: **AGPL-3.0-only**

A standard, modern Tetris in **freestanding C compiled to WebAssembly**. No
frameworks, no build system beyond a compiler, no telemetry — one 35 KB
`.wasm`, one JS host, any browser, forever.

**This is copyleft software.** You are free to run, study, share, and modify
it. Because it is the **Affero** GPL, anyone who offers a modified version to
users over a network must also make its source available to those users.
Forks stay free — that is the whole point.

## About the name

FRETRIS is a wordplay: **free** + **TETRA…tris**. It is *not* a GNU Project
package and is unaffiliated with the FSF. It is an independent fan project;
TETRIS is a trademark of the Tetris Company. No game data, art, or sound
recordings from commercial releases are used or distributed.

## Tetris Guideline compliance

The rules follow the documented Tetris Guideline / SRS, verified by the CI
regression suite (row tiling, spawn columns, wall containment, determinism).

| Feature | Status |
|---|---|
| 10×20 playfield, 4-row spawn buffer | ✓ |
| 7-bag randomizer (Fisher-Yates, seeded) | ✓ |
| SRS tetromino shapes | ✓ |
| SRS wall kicks (all JLSTZ + I transitions) | ✓ |
| Guideline spawn columns (O at 4–5, rest left-of-center) | ✓ |
| Hold (one swap per piece) | ✓ |
| Next-3 preview | ✓ |
| Ghost piece | ✓ |
| Lock delay 500 ms, 15 move-resets | ✓ |
| DAS 150 ms / ARR 40 ms auto-repeat | ✓ |
| Guideline gravity table (levels 1–15+) | ✓ |
| Guideline line scores (100/300/500/800 × level) | ✓ |
| Soft drop +1/cell, hard drop +2/cell | ✓ |
| Block-out game over | ✓ |
| Combos, back-to-back, T-spin bonus | – not yet (see CONTRIBUTING) |

## Play

**▶ Live demo (no install):** https://moon440.github.io/fretris/

Play locally from any static server:

```sh
cd web && python -m http.server 8123     # -> http://localhost:8123/
```

The `web/` folder is committed and self-contained (`index.html`, `glue.js`,
`tetris.wasm`); GitHub Pages is deployed from it on every push to `main`.

### Controls

| Key | Action |
|---|---|
| Left / Right | Move (DAS 150 ms, ARR 40 ms) |
| Down | Soft drop (+1/cell) |
| Up or X | Rotate CW |
| Z | Rotate CCW |
| Space | Hard drop (+2/cell) |
| C or Shift | Hold |
| P | Pause |
| R | Restart |
| M | Toggle music |
| Enter | Start |

## Build

Requires [Zig](https://ziglang.org/download/) 0.14.1 (ships clang + wasm-ld).
`build.ps1` runs the native regression tests, then compiles with
`-Wall -Wextra -Werror`:

```powershell
.\build.ps1            # or: $env:ZIG="C:\path\to\zig.exe"; .\build.ps1
```

Manual equivalents:

```sh
zig cc -std=c99 -Wall -Wextra -Werror -O2 -DTEST_MAIN src/tetris.c -o tetris_test && ./tetris_test

zig cc -std=c99 -O2 -Wall -Wextra -Werror -target wasm32-freestanding -nostdlib \
    -Wl,--no-entry -Wl,--export-dynamic -Wl,--export-memory \
    -Wl,--initial-memory=2097152 -Wl,--max-memory=2097152 \
    src/tetris.c -o web/tetris.wasm
```

## Reproducible build

`web/tetris.wasm` is intended to be the byte-exact output of the command
above (Zig 0.14.1) applied to `src/tetris.c`. CI rebuilds it on every push
and compares against the committed bytes; a mismatch fails the build.

```
sha256  2f910ba9d4e0864df949c9aed2f6823185d666dab00fb64642b05d6dda788999
```

The module is `nostdlib` and contains no prebuilt object blobs — the entire
binary is generated from the one C file, so you can audit what you run.

## Architecture

- **No libc, no malloc.** The wasm module owns one static RGBA framebuffer
  (480×400) plus game state; the host blits it each frame.
- **Exports:** `init, tick, key, framebuffer, score, level, lines, state,
  events`. The `events` bitmask keeps rules and sound decoupled.
- **Deterministic.** `init(seed)` seeds the bag; same seed + same input
  events = identical game. Input tapes are replayable and verifiable.
- **Standard by construction:** SRS kick tables and guideline
  gravity/scoring are plain data tables in `src/tetris.c` — swap in NES
  rotation or custom rules for a variant fork.

## License

Copyright (C) 2026 moon440.

Released under the **GNU Affero General Public License v3.0 only**. The full
text is in [`COPYING`](COPYING). Every source file carries the SPDX header.
