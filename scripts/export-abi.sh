#!/usr/bin/env bash
# Compila los contratos y copia el ABI de UnoLobbyV2 al directorio /abi
# que usa el backend para inicializar ContractService.
#
# Uso: ./scripts/export-abi.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building contracts..."
forge build --root "$ROOT/contracts"

mkdir -p "$ROOT/abi"
cp "$ROOT/contracts/out/UnoLobbyV2.sol/UnoLobbyV2.json" "$ROOT/abi/UnoLobbyV2.json"

echo "✓ ABI exportado a abi/UnoLobbyV2.json"
