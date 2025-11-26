#!/bin/bash
# Quick test script for the UNO backend API

BASE_URL="http://localhost:3000"
WALLET="0x1234567890abcdef1234567890abcdef12345678"

# Health check
echo "=== Health Check ==="
curl -s $BASE_URL/health | jq .

# Create public lobby
echo -e "\n=== Create Public Lobby ==="
LOBBY=$(curl -s -X POST $BASE_URL/lobbies \
  -H "Content-Type: application/json" \
  -H "x-wallet-id: $WALLET" \
  -d '{"betAmount": 1000, "isPublic": true}')
echo $LOBBY | jq .
LOBBY_ID=$(echo $LOBBY | jq -r '.id')

# Get public lobbies
echo -e "\n=== Get Public Lobbies ==="
curl -s $BASE_URL/lobbies | jq .

# Get leaderboard
echo -e "\n=== Get Leaderboard ==="
curl -s "$BASE_URL/leaderboard?limit=10" | jq .

echo -e "\n=== Tests complete ==="
