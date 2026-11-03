# Changelog

## Unreleased

- Soft drop: constant descent rate while held, slightly gentler
- Lock delay: 700 ms measured in real time, identical whether or not the
  piece was soft-dropped (previously could lock up to 2× faster after a
  held-down drop)
- Panel: last four score gains listed under SCORE

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
