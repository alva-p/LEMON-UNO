#!/usr/bin/env bash
# Test del flujo on-chain completo en Base Sepolia
# Uso: ./scripts/test-contract.sh

set -e

CONTRACT=0x08d677A4BF59B80cA31BFe3c9AEa32059092bBC6
RPC=$BASE_SEPOLIA_RPC
ACCOUNT=dev-wallet
ENTRY_FEE=1000000000000000  # 0.001 ETH en wei

if [ -z "$RPC" ]; then
  echo "ERROR: BASE_SEPOLIA_RPC no está exportado. Ejecutá:"
  echo "  export BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/TU_KEY"
  exit 1
fi

echo "=== 1. Creando lobby on-chain ==="
TX=$(cast send $CONTRACT "createLobby(address,uint256,uint16)" \
  0x0000000000000000000000000000000000000000 $ENTRY_FEE 2 \
  --account $ACCOUNT --rpc-url $RPC --json | jq -r '.transactionHash')
echo "TX createLobby: $TX"

echo ""
echo "=== 2. Leyendo lobbyId creado ==="
LOBBY_ID=$(cast call $CONTRACT "lobbyCount()(uint256)" --rpc-url $RPC)
echo "Lobby ID: $LOBBY_ID"

echo ""
echo "=== 3. Wallet 1 (dev-wallet) se une al lobby ==="
cast send $CONTRACT "joinLobby(uint256)" $LOBBY_ID \
  --value ${ENTRY_FEE}wei --account $ACCOUNT --rpc-url $RPC
echo "Wallet 1 unida"

echo ""
echo "Ahora necesitás una segunda wallet para continuar."
echo "Si ya tenés una segunda private key, ejecutá:"
echo ""
echo "  cast send $CONTRACT \"joinLobby(uint256)\" $LOBBY_ID --value ${ENTRY_FEE}wei --private-key TU_SEGUNDA_KEY --rpc-url $RPC"
echo ""
echo "Lobby ID para el siguiente paso: $LOBBY_ID"
