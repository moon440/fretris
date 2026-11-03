# Contributing

Thanks for wanting to improve a free game. This project is
**AGPL-3.0-only** — see [`COPYING`](COPYING). Anything you contribute becomes
part of that copyleft work, and that is a feature, not a gotcha.

## Ground rules

- **Keep `-Werror` clean.** CI compiles the native tests and the wasm with
  `-Wall -Wextra -Werror`. Warnings fail the build.
- **Freestanding core stays dependency-free.** `src/tetris.c` uses no libc and
  no malloc. New rules logic belongs there; rendering/audio policy belongs in
  `web/glue.js`. Don't pull a library into the core.
- **Tests must pass.** `./build.ps1` (or the CI commands) runs the regression
  suite: row tiling, guideline spawn columns, wall containment, and seed
  determinism. Add a test for any rule you change.

## Good first contributions

1. **Optional Guideline modes**, flag-gated so defaults stay standard:
   - T-spin recognition and bonus scoring (3-corner detection).
   - Combo and back-to-back chains.
   - Full 20-level gravity table.
   The SRS kick tables and spawn constants are isolated data — new rules are
   easy to add cleanly.
2. A **replay recorder**: the `key(code, down)` input model plus `init(seed)`
   already makes runs fully reproducible; serialize the tape and play it back.
3. An **alternative skin** in `glue.js` (the wasm only exposes a framebuffer
   and event bits, so themes are pure host code).

## Before you open a PR

```sh
# from repo root
powershell -File ./build.ps1        # Windows
# or the two `zig cc` commands from README.md "Build"
```

Both must succeed. Describe what changed in terms of the Tetris Guideline,
not just the diff.

## A note on the name

TETRIS is a trademark of the Tetris Company. This is an independent,
educational fan project; it ships no assets from any commercial release.
Name forks clearly as forks.
