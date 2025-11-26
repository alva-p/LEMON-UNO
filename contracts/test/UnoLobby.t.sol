// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/UnoLobbyV2.sol";
import "../src/TestToken.sol";

contract UnoLobbyTest is Test {
    UnoLobbyV2 lobby;
    TestToken token;
    address dev = address(0xBEEF);
    address alice = address(0x1);
    address bob = address(0x2);

    function setUp() public {
        // Deploy token and lobby
        token = new TestToken("Test", "TST", 0);
        lobby = new UnoLobbyV2(dev);

        // Give players some funds
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);

        // Mint tokens to players
        token.mint(alice, 1_000e18);
        token.mint(bob, 1_000e18);
    }

    function testETHLobbyFlow() public {
        // Create lobby: ETH, entry 1 ether, 2 players
        uint256 lobbyId = lobby.createLobby(address(0), 1 ether, 2);

        // Alice joins (send 1 ETH)
        vm.prank(alice);
        lobby.joinLobby{value: 1 ether}(lobbyId);

        // Bob joins
        vm.prank(bob);
        lobby.joinLobby{value: 1 ether}(lobbyId);

        // Record balances
        uint256 aliceBefore = alice.balance;
        uint256 devBefore = dev.balance;

        // End lobby: winner is Alice
        address[] memory winners = new address[](1);
        winners[0] = alice;

        vm.prank(bob); // any player can call
        lobby.endLobby(lobbyId, winners);

        // totalPool = 2 ETH, fee = 0.1 ETH, prizePool = 1.9 ETH
        assertEq(alice.balance, aliceBefore + 1.9 ether);
        assertEq(dev.balance, devBefore + 0.1 ether);
    }

    function testERC20LobbyFlow() public {
        // Create lobby: ERC20, entry 100 tokens, 2 players
        uint256 lobbyId = lobby.createLobby(address(token), 100e18, 2);

        // Alice approve and join
        vm.startPrank(alice);
        token.approve(address(lobby), 100e18);
        lobby.joinLobby(lobbyId);
        vm.stopPrank();

        // Bob approve and join
        vm.startPrank(bob);
        token.approve(address(lobby), 100e18);
        lobby.joinLobby(lobbyId);
        vm.stopPrank();

        // Record balances
        uint256 aliceBefore = token.balanceOf(alice);
        uint256 devBefore = token.balanceOf(dev);

        // End lobby: winner Alice
        address[] memory winners = new address[](1);
        winners[0] = alice;

        vm.prank(bob);
        lobby.endLobby(lobbyId, winners);

        // totalPool = 200 tokens, fee = 10 tokens, prizePool = 190 tokens
        assertEq(token.balanceOf(alice), aliceBefore + 190e18);
        assertEq(token.balanceOf(dev), devBefore + 10e18);
    }
}
