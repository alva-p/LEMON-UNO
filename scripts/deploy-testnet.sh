#!/usr/bin/env bash
# deploy-testnet.sh
# Simple helper to deploy `UnoLobbyV2` via Foundry scripts using env vars from .env
# Usage: ./scripts/deploy-testnet.sh <network>
#  networks: anvil | sepolia | base-sepolia

set -euo pipefail
SCRIPT_DIR=$(dirname "$0")/..
ROOT=$(cd "$SCRIPT_DIR" && pwd)
cd "$ROOT/contracts"

# Load .env if present
if [ -f "$ROOT/.env" ]; then
  # shellcheck disable=SC1090
  source "$ROOT/.env"
else
  echo "Warning: .env file not found in repo root. Ensure env vars are exported in your shell."
fi

NETWORK=${1:-anvil}

case "$NETWORK" in
  anvil)
    RPC_URL="http://localhost:8545"
    ;;
  sepolia)
    RPC_URL=${ETH_SEPOLIA_RPC:-${RPC_URL_SEPOLIA:-}}
    ;;
  base-sepolia)
    RPC_URL=${BASE_SEPOLIA_RPC:-${RPC_URL_BASE_SEPOLIA:-}}
    ;;
  *)
    echo "Unknown network: $NETWORK"
    exit 1
    ;;
esac

if [ -z "${PRIVATE_KEY:-}" ]; then
  echo "Error: PRIVATE_KEY not set in environment or .env"
  exit 1
fi

if [ -z "${DEV_WALLET:-}" ]; then
  echo "Error: DEV_WALLET not set in environment or .env"
  exit 1
fi

if [ -z "$RPC_URL" ]; then
  echo "Error: RPC_URL for $NETWORK not configured. Check your .env or pass RPC via env vars."
  exit 1
fi

echo "Deploying UnoLobbyV2 to $NETWORK (rpc=$RPC_URL)"

# Run forge script (script uses vm.envAddress("DEV_WALLET") to read DEV_WALLET)
# This will broadcast a transaction using PRIVATE_KEY
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --broadcast

echo "Done. Check forge output for deployed address. Update .env CONTRACT_ADDRESS_* if needed."
