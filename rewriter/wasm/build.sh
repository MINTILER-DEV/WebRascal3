#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="wasm/pkg"
INPUT_RAW="target/wasm32-unknown-unknown/release/wasm.wasm"

cd "${ROOT_DIR}"

cargo build -p wasm --target wasm32-unknown-unknown --release
mkdir -p "${OUT_DIR}"

wasm-bindgen \
  --target web \
  --out-dir "${OUT_DIR}" \
  "${INPUT_RAW}"

if command -v wasm-snip >/dev/null 2>&1; then
  wasm-snip \
    --snip-rust-fmt-code \
    --snip-rust-panicking-code \
    --output "${OUT_DIR}/webrascal.snip.wasm" \
    "${OUT_DIR}/wasm_bg.wasm"
  INPUT_WASM="${OUT_DIR}/webrascal.snip.wasm"
else
  INPUT_WASM="${OUT_DIR}/wasm_bg.wasm"
fi

if command -v wasm-opt >/dev/null 2>&1; then
  wasm-opt -Oz -o "${OUT_DIR}/webrascal.wasm.wasm" "${INPUT_WASM}"
else
  cp "${INPUT_WASM}" "${OUT_DIR}/webrascal.wasm.wasm"
fi

echo "built ${OUT_DIR}/webrascal.wasm.wasm"
