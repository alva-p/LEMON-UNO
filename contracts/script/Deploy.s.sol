// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/UnoLobbyV2.sol";

contract DeployUnoLobby is Script {
    function run() external {
        // Replace with your real dev wallet before broadcasting
        address dev = vm.envAddress("DEV_WALLET");
        vm.startBroadcast();
        new UnoLobbyV2(dev);
        vm.stopBroadcast();
    }
}
