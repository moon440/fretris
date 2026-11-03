# TETRIS.WASM

A standard, modern Tetris in **freestanding C compiled to WebAssembly** — with the
look and sound of the 1990 MS-DOS text-mode classic: VGA palette, block glyphs, a
CGA-blue boot title, and PC-speaker square-wave audio (including Korobeiniki).

Rules follow the documented **Tetris Guideline**: 10x20 field, 7-bag randomizer,
SRS rotation with official wall kicks, hold, next-3 preview, ghost piece,
500 ms lock delay, guideline gravity and scoring. No ads, no accounts, no
phone-home: one 35 KB `.wasm`, one 5 KB JS host, any browser, forever.

This is a fan homage. TETRIS is a trademark of the Tetris Company.

## Play

Open `web/index.html` through any static server:

```sh
cd web && python -m http.server 8123
# -> http://localhost:8123/
```

Or enable GitHub Pages for this repository (`Settings -> Pages -> root, /web branch`)
and open the site — `web/tetris.wasm` is committed, no build step needed to play.

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

Requires [Zig](https://ziglang.org/download/) (any 0.11+; ships clang + wasm-ld).
`build.ps1` runs tests then compiles:

```powershell
.\build.ps1            # or: $env:ZIG="C:\path\to\zig.exe"; .\build.ps1
```

Manual equivalents:

```sh
# native regression test (row tiling, clear scoring, seed determinism)
zig cc -std=c99 -Wall -Wextra -Werror -O2 -DTEST_MAIN src/tetris.c -o tetris_test && ./tetris_test

# wasm
zig cc -std=c99 -O2 -Wall -Wextra -Werror -target wasm32-freestanding -nostdlib \
    -Wl,--no-entry -Wl,--export-dynamic -Wl,--export-memory \
    -Wl,--initial-memory=2097152 -Wl,--max-memory=2097152 \
    src/tetris.c -o web/tetris.wasm
```

## Design notes

- **No libc, no malloc.** The wasm module owns one static RGBA framebuffer
  (480x400) plus game state; the host blits it each frame. All drawing is a
  5x7 bitmap font and inset-border blocks.
- **Deterministic.** `init(seed)` seeds the 7-bag xorshift. Same seed + same
  input events = identical game: score runs are replayable and verifiable.
  The input model (`key(code, down)`) is exactly what you would record.
- **Exports:** `init, tick, key, framebuffer, score, level, lines, state, events`.
  The `events` bitmask drives the host's PC-speaker beeps, decoupling rules
  from sound.
- **Standard by construction:** SRS kick tables and guideline gravity/scoring
  are data tables in `src/tetris.c`, easy to swap (e.g. NES rotation, no-KO).
- Fork it, port it to a GPU demo scene, wire it into a puzzle tournament
  harness — it's AGPL, your improvements stay free.

## License

AGPL-3.0-only (see `COPYING`). Copyright (C) 2026 moon440.
