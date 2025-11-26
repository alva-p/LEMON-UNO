# Foundry scaffold for LEMON-UNO

This folder contains a minimal Foundry setup to test `UnoLobbyV2` locally.

Quick start (requires Foundry):

1. Install Foundry: https://book.getfoundry.sh/getting-started/installation

2. From this `contracts/` folder run:

```bash
forge install
forge test
```

Run the deploy script (example using an env var):

```bash
export DEV_WALLET=0xYourDevWalletHere
forge script script/Deploy.s.sol --broadcast --rpc-url <RPC_URL>
```

Notes:
- Tests use a small `TestToken` ERC20 for ERC20 flows.
- `foundry.toml` sets `solc_version = 0.8.19`. If your local Foundry supports a newer compiler, you may bump the pragma in `src/`.
