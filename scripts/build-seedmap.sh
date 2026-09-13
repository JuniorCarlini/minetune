#!/usr/bin/env bash
# =============================================================================
# Compila o gerador do mapa de seeds do site: cubiomes (C) -> WebAssembly.
#
# Usa o fork de xpple porque o cubiomes original parou na 1.21.4 e o fork já
# acompanha as versões 26.x. O commit fica fixo: o mapa só muda quando alguém
# atualiza de propósito e confere o resultado contra um servidor de verdade.
#
# Sem emcc instalado, compila dentro da imagem oficial do Emscripten.
# Saída: build/seedmap/cubiomes.{js,wasm}, copiados por scripts/build-site.mjs.
#
# Uso: bash scripts/build-seedmap.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CUBIOMES_REPO=https://github.com/xpple/cubiomes.git
CUBIOMES_COMMIT=5815e4f790e4800d02857c5640eccb82cef7cb6b
EMSDK_IMAGE=emscripten/emsdk:6.0.9

SRC="$ROOT/.cache/cubiomes"
OUT="$ROOT/build/seedmap"

if [[ "$(git -C "$SRC" rev-parse HEAD 2>/dev/null || true)" != "$CUBIOMES_COMMIT" ]]; then
  echo "baixando cubiomes @ ${CUBIOMES_COMMIT:0:7}"
  rm -rf "$SRC"
  mkdir -p "$SRC"
  git -C "$SRC" init -q
  git -C "$SRC" fetch -q --depth 1 "$CUBIOMES_REPO" "$CUBIOMES_COMMIT"
  git -C "$SRC" checkout -q FETCH_HEAD
fi
mkdir -p "$OUT"

# Os testes do cubiomes têm main() próprio e ficam de fora.
# STACK_SIZE maior: a busca do spawn e das estruturas usa arrays grandes na pilha.
BUILD='find .cache/cubiomes -name "*.c" ! -iname "*test*" ! -path "*/test*/*" -print0 | sort -z | xargs -0 \
  emcc -O3 -DNDEBUG -w -I.cache/cubiomes site/seedmap/seedmap.c \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createCubiomes -sENVIRONMENT=worker \
    -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=5MB -sWASM_BIGINT=1 -sFILESYSTEM=0 \
    -sEXPORTED_FUNCTIONS=_malloc,_free \
    -sEXPORTED_RUNTIME_METHODS=HEAP32,HEAPU8,UTF8ToString,stringToNewUTF8 \
    -o build/seedmap/cubiomes.js'

if command -v emcc >/dev/null 2>&1; then
  (cd "$ROOT" && sh -c "$BUILD")
else
  docker run --rm -v "$ROOT:/work" -w /work "$EMSDK_IMAGE" sh -c "$BUILD && chown -R $(id -u):$(id -g) build/seedmap"
fi

ls -l "$OUT"
