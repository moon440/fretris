# build.ps1 — compile tetris.wasm and run tests. Needs only Zig (or set $Zig).
# Usage:  powershell -File build.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Zig  = if ($env:ZIG) { $env:ZIG } else { "E:\AI JAN\tools\zig\zig-x86_64-windows-0.14.1\zig.exe" }
if (-not (Test-Path $Zig)) { Write-Error "zig not found at $Zig - set `$ZIG to your zig.exe" }

New-Item -ItemType Directory -Force -Path "$root\build", "$root\web" | Out-Null

Write-Host "[1/2] native test..."
& $Zig cc -std=c99 -Wall -Wextra -Werror -O2 -DTEST_MAIN "$root\src\tetris.c" -o "$root\build\tetris_test.exe"
& "$root\build\tetris_test.exe"

Write-Host "[2/2] wasm..."
& $Zig cc -std=c99 -O2 -Wall -Wextra -Werror -target wasm32-freestanding -nostdlib `
    "-Wl,--no-entry" "-Wl,--export-dynamic" "-Wl,--export-memory" `
    "-Wl,--initial-memory=2097152" "-Wl,--max-memory=2097152" `
    "$root\src\tetris.c" -o "$root\web\tetris.wasm"
Write-Host "ok -> web/tetris.wasm"
