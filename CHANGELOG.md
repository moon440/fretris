# Changelog

## v1.0.0 — 2026-11-03

Initial release.

- Tetris Guideline ruleset: SRS rotation with all wall kicks, 7-bag
  randomizer, hold, next-3 preview, ghost piece, lock delay with
  move-reset cap, DAS/ARR auto-repeat, guideline gravity and scoring
- Freestanding C core: no libc, no malloc, no prebuilt blobs; single
  translation unit compiles to a 40 KB WebAssembly module
- Regression suite: row tiling, guideline spawn columns, wall
  containment, seed determinism — run natively in CI on every push
- Reproducible build: CI rebuilds the wasm and byte-compares against
  the committed binary
- JavaScript host: input, framebuffer presentation, square-wave audio
