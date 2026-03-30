// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "../src/UnoLobbyV2.sol";

/**
 * Deploy UnoLobbyV2 en cualquier red.
 *
 * Variables de entorno requeridas:
 *   DEV_WALLET      → address que recibe el 5% de fee (y sirve de default para owner/signer)
 *
 * Variables opcionales (si no se setean, usan DEV_WALLET):
 *   OWNER_WALLET    → owner/admin del contrato (en prod: multisig)
 *   TRUSTED_SIGNER  → hot-wallet del backend que firma resultados (en prod: separada)
 *
 * Uso testnet (todo en una sola wallet):
 *   forge script script/Deploy.s.sol \
 *     --rpc-url $BASE_SEPOLIA_RPC \
 *     --account dev-wallet \          ← cast keystore
 *     --broadcast --verify
 *
 * Uso prod (wallets separadas):
 *   OWNER_WALLET=0x... TRUSTED_SIGNER=0x... forge script script/Deploy.s.sol \
 *     --rpc-url $BASE_MAINNET_RPC \
 *     --account deployer \
 *     --broadcast --verify
 */
contract DeployUnoLobby is Script {
    function run() external {
        address devWallet     = vm.envAddress("DEV_WALLET");
        address owner         = vm.envOr("OWNER_WALLET",   devWallet);
        address trustedSigner = vm.envOr("TRUSTED_SIGNER", devWallet);

        vm.startBroadcast();
        UnoLobbyV2 lobby = new UnoLobbyV2(owner, devWallet, trustedSigner);
        vm.stopBroadcast();

        console.log("=== UnoLobbyV2 deployed ===");
        console.log("Address:       ", address(lobby));
        console.log("Owner:         ", owner);
        console.log("DevWallet:     ", devWallet);
        console.log("TrustedSigner: ", trustedSigner);
        console.log("");
        console.log("Agregar al .env:");
        console.log("UNO_LOBBY_V2_BASE_ADDRESS=", address(lobby));
    }
}
