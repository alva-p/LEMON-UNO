#!/usr/bin/env bash
set -e

export BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/I62oP3aM8aVhfpkb1dgKi
CONTRACT=0x08d677A4BF59B80cA31BFe3c9AEa32059092bBC6
CREATOR=0x09326f91bC06e15cd623292bd302EfbA2bDF580f
LEMON2=0xf7eB8BF19173d22e10837035f25C11C2f7959192
LEMON3=0xD82631E74F7c42d306B1f3CDa51251f834c07238
BACKEND=http://localhost:3001
KS_PASS=${KEYSTORE_PASSWORD:-Antoniaesloca}
# cast 1.5.x usa ETH_PASSWORD como ruta a un archivo con la password
_PASS_FILE=$(mktemp)
echo -n "$KS_PASS" > "$_PASS_FILE"
export ETH_PASSWORD="$_PASS_FILE"
trap 'rm -f "$_PASS_FILE"' EXIT

echo "=== 1. Crear lobby crypto via backend ==="
LOBBY_RESP=$(curl -sf -X POST $BACKEND/lobbies -H "Content-Type: application/json" -H "x-wallet-id: $CREATOR" -d '{"betAmount":0.001,"isPublic":true,"maxPlayers":2,"currency":"ETH","network":"BASE"}')
echo "$LOBBY_RESP" | jq '{id:.lobby.id,contractLobbyId:.lobby.contractLobbyId,txHash:.lobby.txHash}'

LOBBY_ID=$(echo "$LOBBY_RESP" | jq -r '.lobby.id')
CONTRACT_LOBBY_ID=$(echo "$LOBBY_RESP" | jq -r '.lobby.contractLobbyId')

if [ -z "$CONTRACT_LOBBY_ID" ] || [ "$CONTRACT_LOBBY_ID" = "null" ]; then
  echo "ERROR: no se obtuvo contractLobbyId"; exit 1
fi
echo "lobbyId=$LOBBY_ID  contractLobbyId=$CONTRACT_LOBBY_ID"

echo ""
echo "=== 2. lemon2 se une on-chain ==="
cast send $CONTRACT "joinLobby(uint256)" $CONTRACT_LOBBY_ID --value 0.001ether --account lemon2 --rpc-url $BASE_SEPOLIA_RPC > /dev/null
echo "  TX confirmada"

echo "=== 2b. Notificar backend que lemon2 se unió ==="
curl -sf -X POST $BACKEND/lobbies/$LOBBY_ID/join -H "Content-Type: application/json" -H "x-wallet-id: $LEMON2" -d '{}' | jq '{status:.lobby.status,players:(.lobby.players|length),gameId:.lobby.gameId}'

echo ""
echo "=== 3. lemon3 se une on-chain (dispara LobbyStarted) ==="
cast send $CONTRACT "joinLobby(uint256)" $CONTRACT_LOBBY_ID --value 0.001ether --account lemon3 --rpc-url $BASE_SEPOLIA_RPC > /dev/null
echo "  TX confirmada"

echo "=== 3b. Notificar backend que lemon3 se unió (auto-arranca juego) ==="
FINAL=$(curl -sf -X POST $BACKEND/lobbies/$LOBBY_ID/join -H "Content-Type: application/json" -H "x-wallet-id: $LEMON3" -d '{}')
echo "$FINAL" | jq '{status:.lobby.status,players:(.lobby.players|length),gameId:.lobby.gameId}'

GAME_ID=$(echo "$FINAL" | jq -r '.lobby.gameId')

# Esperar a que el evento LobbyStarted on-chain sea procesado por el backend
if [ -z "$GAME_ID" ] || [ "$GAME_ID" = "null" ]; then
  echo "  (esperando evento LobbyStarted on-chain...)"
  sleep 5
  GAME_ID=$(curl -sf $BACKEND/lobbies/$LOBBY_ID | jq -r '.lobby.gameId')
fi

echo ""
echo "=== 4. Estado del juego ==="
if [ -z "$GAME_ID" ] || [ "$GAME_ID" = "null" ]; then
  echo "ERROR: juego no arrancó"
  exit 1
fi
curl -sf $BACKEND/games/$GAME_ID | jq '{gameId:.gameId,currentPlayer:.currentPlayerIndex,topCard:.discardPile[-1]}'
echo ""
echo "✅ Flujo completo OK — gameId=$GAME_ID"
