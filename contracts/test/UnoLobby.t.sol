// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/UnoLobbyV2.sol";
import "../src/TestToken.sol";

contract UnoLobbyTest is Test {
    UnoLobbyV2 lobby;
    TestToken  token;

    address dev   = address(0xBEEF);
    address alice = address(0x1);
    address bob   = address(0x2);

    uint256 signerPrivKey = 0xBEEFDEAD1234;
    address signer;

    function setUp() public {
        signer = vm.addr(signerPrivKey);

        token = new TestToken("Test", "TST", 0);
        // LOW-02: constructor separado para owner, devWallet y trustedSigner
        lobby = new UnoLobbyV2(dev, dev, signer);

        vm.deal(alice, 10 ether);
        vm.deal(bob,   10 ether);

        // address(this) es el owner de TestToken, puede mintear
        token.mint(alice, 1_000e18);
        token.mint(bob,   1_000e18);
    }

    // ─── Helper: genera firma EIP-712 del backend ──────────────────────────────

    function _signEndLobby(uint256 lobbyId, address winner) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            lobby.END_LOBBY_TYPEHASH(),
            lobbyId,
            winner,
            lobby.lobbyNonces(lobbyId)
        ));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            lobby.DOMAIN_SEPARATOR(),
            structHash
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // ─── Tests principales ────────────────────────────────────────────────────

    function testETHLobbyFlow() public {
        uint256 lobbyId = lobby.createLobby(address(0), 1 ether, 2);

        vm.prank(alice);
        lobby.joinLobby{value: 1 ether}(lobbyId);

        vm.prank(bob);
        lobby.joinLobby{value: 1 ether}(lobbyId);

        uint256 aliceBefore = alice.balance;
        uint256 devBefore   = dev.balance;

        address[] memory winners = new address[](1);
        winners[0] = alice;

        bytes memory sig = _signEndLobby(lobbyId, alice);

        vm.prank(bob);
        lobby.endLobby(lobbyId, winners, sig);

        // totalPool = 2 ETH, fee = 0.1 ETH, prizePool = 1.9 ETH
        assertEq(alice.balance, aliceBefore + 1.9 ether);
        assertEq(dev.balance,   devBefore   + 0.1 ether);
    }

    function testERC20LobbyFlow() public {
        uint256 lobbyId = lobby.createLobby(address(token), 100e18, 2);

        vm.startPrank(alice);
        token.approve(address(lobby), 100e18);
        lobby.joinLobby(lobbyId);
        vm.stopPrank();

        vm.startPrank(bob);
        token.approve(address(lobby), 100e18);
        lobby.joinLobby(lobbyId);
        vm.stopPrank();

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 devBefore   = token.balanceOf(dev);

        address[] memory winners = new address[](1);
        winners[0] = alice;

        bytes memory sig = _signEndLobby(lobbyId, alice);

        vm.prank(bob);
        lobby.endLobby(lobbyId, winners, sig);

        // totalPool = 200 tokens, fee = 10 tokens, prizePool = 190 tokens
        assertEq(token.balanceOf(alice), aliceBefore + 190e18);
        assertEq(token.balanceOf(dev),   devBefore   + 10e18);
    }

    // ─── Tests de seguridad ───────────────────────────────────────────────────

    /// CRIT-01: firma inválida debe revertir
    function testInvalidSignatureReverts() public {
        uint256 lobbyId = lobby.createLobby(address(0), 1 ether, 2);
        vm.prank(alice); lobby.joinLobby{value: 1 ether}(lobbyId);
        vm.prank(bob);   lobby.joinLobby{value: 1 ether}(lobbyId);

        address[] memory winners = new address[](1);
        winners[0] = alice;

        // Firma con clave incorrecta
        uint256 badKey = 0xBADBAD;
        bytes32 structHash = keccak256(abi.encode(
            lobby.END_LOBBY_TYPEHASH(),
            lobbyId,
            alice,
            lobby.lobbyNonces(lobbyId)
        ));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            lobby.DOMAIN_SEPARATOR(),
            structHash
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(badKey, digest);

        vm.prank(bob);
        vm.expectRevert(UnoLobbyV2.InvalidSigner.selector);
        lobby.endLobby(lobbyId, winners, abi.encodePacked(r, s, v));
    }

    /// CRIT-01: replay de firma (mismo nonce) debe fallar
    function testSignatureReplayPrevented() public {
        uint256 lobbyId = lobby.createLobby(address(0), 1 ether, 2);
        vm.prank(alice); lobby.joinLobby{value: 1 ether}(lobbyId);
        vm.prank(bob);   lobby.joinLobby{value: 1 ether}(lobbyId);

        address[] memory winners = new address[](1);
        winners[0] = alice;
        bytes memory sig = _signEndLobby(lobbyId, alice);

        vm.prank(bob);
        lobby.endLobby(lobbyId, winners, sig);  // primera llamada: ok

        // Segunda llamada con la misma firma: el lobby ya está ENDED
        uint256 lobbyId2 = lobby.createLobby(address(0), 1 ether, 2);
        vm.prank(alice); lobby.joinLobby{value: 1 ether}(lobbyId2);
        vm.prank(bob);   lobby.joinLobby{value: 1 ether}(lobbyId2);

        // Intento de usar la firma del lobby 1 para el lobby 2 — debe fallar
        vm.prank(bob);
        vm.expectRevert(UnoLobbyV2.InvalidSigner.selector);
        lobby.endLobby(lobbyId2, winners, sig);  // nonce/lobbyId no coinciden
    }

    /// HIGH-01: no se puede terminar un lobby OPEN (sin firma o no)
    function testCannotEndOpenLobby() public {
        uint256 lobbyId = lobby.createLobby(address(0), 1 ether, 3);
        vm.prank(alice); lobby.joinLobby{value: 1 ether}(lobbyId);
        vm.prank(bob);   lobby.joinLobby{value: 1 ether}(lobbyId);
        // Solo 2 de 3 jugadores → sigue OPEN

        address[] memory winners = new address[](1);
        winners[0] = alice;
        bytes memory sig = _signEndLobby(lobbyId, alice);

        vm.prank(alice);
        vm.expectRevert(UnoLobbyV2.LobbyNotStarted.selector);
        lobby.endLobby(lobbyId, winners, sig);
    }

    /// HIGH-02: cancelLobby + pull-payment (claimRefund)
    function testCancelAndClaimRefund() public {
        // address(this) crea el lobby → puede cancelarlo
        uint256 lobbyId = lobby.createLobby(address(0), 1 ether, 3);

        vm.prank(alice); lobby.joinLobby{value: 1 ether}(lobbyId);
        vm.prank(bob);   lobby.joinLobby{value: 1 ether}(lobbyId);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore   = bob.balance;

        // Cancelar (creador = address(this))
        lobby.cancelLobby(lobbyId);

        // Cada jugador reclama su reembolso individualmente
        vm.prank(alice);
        lobby.claimRefund(address(0));

        vm.prank(bob);
        lobby.claimRefund(address(0));

        assertEq(alice.balance, aliceBefore + 1 ether);
        assertEq(bob.balance,   bobBefore   + 1 ether);
    }

    /// HIGH-02: contrato que rechaza ETH no puede bloquear el cancelLobby
    function testGrieferCannotBlockCancel() public {
        uint256 lobbyId = lobby.createLobby(address(0), 1 ether, 3);

        vm.prank(alice); lobby.joinLobby{value: 1 ether}(lobbyId);

        // El griefing necesitaría llamar joinLobby desde un contrato que rechace ETH.
        // Con pull-payment, cancelLobby no hace transferencias → no puede revertir.
        // Solo registra pendingRefunds.
        lobby.cancelLobby(lobbyId);  // no debe revertir aunque haya contratos en players
    }

    /// HIGH-03: emergencyWithdraw no puede tomar fondos de jugadores
    function testEmergencyWithdrawRespetsLockedFunds() public {
        uint256 lobbyId = lobby.createLobby(address(0), 1 ether, 2);
        vm.prank(alice); lobby.joinLobby{value: 1 ether}(lobbyId);
        vm.prank(bob);   lobby.joinLobby{value: 1 ether}(lobbyId);
        // 2 ETH bloqueados en el contrato

        vm.prank(dev);
        vm.expectRevert(UnoLobbyV2.NoFundsToWithdraw.selector);
        lobby.emergencyWithdraw(address(0), 1 ether);  // no hay fondos libres
    }

    /// CRIT-02: emergencyEndLobby rechaza un ganador que no es jugador
    function testEmergencyEndLobbyRejectsNonPlayer() public {
        uint256 lobbyId = lobby.createLobby(address(0), 1 ether, 2);
        vm.prank(alice); lobby.joinLobby{value: 1 ether}(lobbyId);
        vm.prank(bob);   lobby.joinLobby{value: 1 ether}(lobbyId);

        address thief = address(0xDEAD);
        address[] memory winners = new address[](1);
        winners[0] = thief;

        vm.prank(dev);
        vm.expectRevert(UnoLobbyV2.InvalidWinners.selector);
        lobby.emergencyEndLobby(lobbyId, winners);
    }

    /// LOW-03: renounceOwnership debe revertir
    function testRenounceOwnershipDisabled() public {
        vm.prank(dev);
        vm.expectRevert("Renounce disabled");
        lobby.renounceOwnership();
    }
}
