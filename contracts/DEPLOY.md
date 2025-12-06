# Deploying `UnoLobbyV2` (Foundry)

This document explains how to run tests and deploy the `UnoLobbyV2` contract locally (Anvil) and to testnets.

Prerequisites
- Foundry (forge/cast) and Anvil installed
- `forge` available in PATH
- `.env` file in repository root with `PRIVATE_KEY`, `DEV_WALLET`, and RPC URLs

Files
- `script/Deploy.s.sol` — Foundry script that reads `DEV_WALLET` from env and deploys the contract
- `scripts/deploy-testnet.sh` — helper shell script to run deploys

Steps

1) Local testing with Anvil

```bash
# Start Anvil (new terminal)
anvil --host 0.0.0.0 --port 8545

# Run tests
cd contracts
forge test
```

The test suite already contains basic ERC20 and ETH lobby tests.

2) Deploy locally (Anvil)

```bash
# Ensure anvil is running
# Use the first anvil private key or your PRIVATE_KEY (for local only)
PRIVATE_KEY=0xac0974... # example from Anvil
DEV_WALLET=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --private-key $PRIVATE_KEY --broadcast
```

3) Deploy to a testnet (Sepolia / Base Sepolia)

- Fill `.env` with `PRIVATE_KEY`, `DEV_WALLET`, and the appropriate RPC URLs (Alchemy/Infura)
- Use the helper script:

```bash
# from repo root
chmod +x scripts/deploy-testnet.sh
# Deploy to Sepolia
./scripts/deploy-testnet.sh sepolia
# Deploy to Base Sepolia
./scripts/deploy-testnet.sh base-sepolia
```

4) After deploy
- Copy the deployed contract address from forge output into `.env` (CONTRACT_ADDRESS_SEPOLIA or CONTRACT_ADDRESS_BASE_SEPOLIA)
- Update backend/frontend configs to use the deployed address and RPC if needed

Notes / best practices
- Never commit `.env` with real private keys or API keys.
- For automated CI, store PRIVATE_KEY and RPC keys as protected secrets and pass them as environment variables to the runner.
- Consider minting/using test ERC20 tokens on the testnet or deploy mocks via Foundry if needed for integration tests.

Troubleshooting
- If `forge script` fails to connect: verify Anvil/rpc URL and that the PRIVATE_KEY is correct for the account with funds.
- If tests fail: run `forge test -vvvv` for verbose output.

