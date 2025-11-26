// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GameEscrow
 * @dev Escrow smart contract for UNO game betting on Polygon.
 * Holds funds during game, releases to winner after verification.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract GameEscrow {
    address public admin;
    IERC20 public usdc; // USDC token on Polygon

    struct Game {
        bytes32 gameId;
        address[] players;
        uint256 betAmount;
        uint256 totalPot;
        uint256 feeAmount;
        address winner;
        bool settled;
    }

    mapping(bytes32 => Game) public games;

    event GameCreated(bytes32 indexed gameId, address[] players, uint256 betAmount);
    event GameSettled(bytes32 indexed gameId, address winner, uint256 payout);

    constructor(address _usdc) {
        admin = msg.sender;
        usdc = IERC20(_usdc);
    }

    /**
     * @dev Create a new game and lock funds from all players
     */
    function createGame(
        bytes32 _gameId,
        address[] memory _players,
        uint256 _betAmount
    ) external {
        require(_players.length >= 2 && _players.length <= 10, "Invalid player count");
        require(_betAmount >= 100 * 1e18 && _betAmount <= 100000 * 1e18, "Invalid bet amount");

        Game storage game = games[_gameId];
        game.gameId = _gameId;
        game.players = _players;
        game.betAmount = _betAmount;
        game.totalPot = _betAmount * _players.length;
        game.feeAmount = (game.totalPot * 5) / 100; // 5% fee

        // Transfer funds from each player to this contract
        for (uint256 i = 0; i < _players.length; i++) {
            require(usdc.transferFrom(_players[i], address(this), _betAmount), "Transfer failed");
        }

        emit GameCreated(_gameId, _players, _betAmount);
    }

    /**
     * @dev Settle game and pay winner (called by backend after verification)
     */
    function settleGame(bytes32 _gameId, address _winner) external {
        require(msg.sender == admin, "Only admin can settle");

        Game storage game = games[_gameId];
        require(!game.settled, "Game already settled");
        require(game.totalPot > 0, "Invalid game");

        game.settled = true;
        game.winner = _winner;

        uint256 payout = game.totalPot - game.feeAmount;

        // Transfer to winner
        require(usdc.transfer(_winner, payout), "Payout failed");

        // Fee to admin
        require(usdc.transfer(admin, game.feeAmount), "Fee transfer failed");

        emit GameSettled(_gameId, _winner, payout);
    }

    /**
     * @dev Get game details
     */
    function getGame(bytes32 _gameId) external view returns (Game memory) {
        return games[_gameId];
    }
}
