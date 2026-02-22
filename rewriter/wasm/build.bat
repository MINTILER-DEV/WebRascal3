@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
set "OUT_DIR=%ROOT_DIR%\wasm\pkg"
set "INPUT_RAW=%ROOT_DIR%\target\wasm32-unknown-unknown\release\wasm.wasm"

pushd "%ROOT_DIR%" >nul || exit /b 1

cargo build -p wasm --target wasm32-unknown-unknown --release || goto :error

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%" || goto :error

wasm-bindgen --target web --out-dir "%OUT_DIR%" "%INPUT_RAW%" || goto :error

where wasm-snip >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  wasm-snip --snip-rust-fmt-code --snip-rust-panicking-code --output "%OUT_DIR%\webrascal.snip.wasm" "%OUT_DIR%\wasm_bg.wasm" || goto :error
  set "INPUT_WASM=%OUT_DIR%\webrascal.snip.wasm"
) else (
  set "INPUT_WASM=%OUT_DIR%\wasm_bg.wasm"
)

where wasm-opt >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  wasm-opt -Oz -o "%OUT_DIR%\webrascal.wasm.wasm" "%INPUT_WASM%" || goto :error
) else (
  copy /Y "%INPUT_WASM%" "%OUT_DIR%\webrascal.wasm.wasm" >nul || goto :error
)

echo built %OUT_DIR%\webrascal.wasm.wasm
popd >nul
exit /b 0

:error
set "EXIT_CODE=%ERRORLEVEL%"
popd >nul
exit /b %EXIT_CODE%
