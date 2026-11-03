# fretris

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](COPYING)
[![build](https://github.com/moon440/fretris/actions/workflows/build.yml/badge.svg)](https://github.com/moon440/fretris/actions/workflows/build.yml)

Tetris in freestanding C, compiled to WebAssembly. No libc, no malloc, no
dependencies. AGPL-3.0-only.

Play: https://moon440.github.io/fretris/

Follows the Tetris Guideline: 10x20 field, 7-bag randomizer, SRS rotation with
wall kicks, hold, next-3 preview, ghost piece, lock delay, guideline gravity
and scoring. Combos, back-to-back and T-spin bonuses are not implemented.
Games are deterministic (`init(seed)` + input tape = replay).

## Controls

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
| H | High-contrast colors |
| M | Music |
| Enter | Start |

## Build

Needs [Zig](https://ziglang.org/download/) 0.14.1.

```sh
zig cc -std=c99 -Wall -Wextra -Werror -O2 -DTEST_MAIN src/tetris.c -o tetris_test && ./tetris_test

zig cc -std=c99 -O2 -Wall -Wextra -Werror -target wasm32-freestanding -nostdlib \
    -Wl,--no-entry -Wl,--export-dynamic -Wl,--export-memory \
    -Wl,--initial-memory=2097152 -Wl,--max-memory=2097152 \
    src/tetris.c -o web/tetris.wasm
```

Or `./build.ps1` on Windows.

## Reproducible builds

`web/tetris.wasm` is byte-identical to the output of the command above
(Zig 0.14.1, x86-64 Linux). CI rebuilds it and compares on every push.

```
sha256  80ca36b64d59d35994e60766a20a79cc9aec1068552d404245dff54cf4140dfa
```

## Layout

- `src/tetris.c` — game rules, static framebuffer, 5x7 font. Exports:
  `init, tick, key, framebuffer, score, level, lines, state, events`
- `web/glue.js` — canvas blit, input, square-wave audio, display tinting

## License

AGPL-3.0-only, see [`COPYING`](COPYING). Copyright (C) 2026 moon440.

Tetris is a trademark of the Tetris Company; this project uses no assets from
commercial releases.
