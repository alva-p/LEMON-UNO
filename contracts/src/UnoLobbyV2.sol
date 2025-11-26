// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title UnoLobbyV2
 * @notice Contrato mejorado para gestionar lobbies de UNO con pagos
 * @dev Versión simplificada: solo un modo de payout (winner takes prizePool after fee)
 */
contract UnoLobbyV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum LobbyState { OPEN, STARTED, ENDED, CANCELLED }

    struct Lobby {
        address creator;
        address token; // address(0) para ETH nativo
        uint256 entryFee;
        uint16 maxPlayers;
        LobbyState state;
        address[] players;
        uint256 createdAt;
    }

    uint256 public lobbyCount;
    address public devWallet;
    uint256 public constant FEE_PERCENTAGE = 5; // 5% fee

    mapping(uint256 => Lobby) public lobbies;

    event LobbyCreated(
        uint256 indexed lobbyId,
        address indexed creator,
        address token,
        uint256 entryFee,
        uint16 maxPlayers
    );

    event PlayerJoined(uint256 indexed lobbyId, address indexed player);

    event LobbyStarted(uint256 indexed lobbyId, uint256 playerCount);

    event LobbyEnded(
        uint256 indexed lobbyId,
        address indexed endedBy,
        address[] winners
    );

    event Payout(
        uint256 indexed lobbyId,
        address indexed to,
        uint256 amount
    );

    event FeeTaken(
        uint256 indexed lobbyId,
        address indexed devWallet,
        uint256 amount
    );

    event LobbyCancelled(
        uint256 indexed lobbyId,
        address indexed cancelledBy,
        uint256 refundedPlayers
    );

    event DevWalletUpdated(address indexed oldWallet, address indexed newWallet);

    event EmergencyWithdrawal(address indexed token, uint256 amount, address indexed to);

    error InvalidEntryFee();
    error InvalidMaxPlayers();
    error LobbyNotOpen();
    error LobbyNotEnded();
    error AlreadyJoined();
    error LobbyFull();
    error NotAPlayer();
    error InvalidWinners();
    error InvalidDevWallet();
    error NoFundsToWithdraw();

    constructor(address _devWallet) Ownable() {
        if (_devWallet == address(0)) revert InvalidDevWallet();
        devWallet = _devWallet;
    }

    function createLobby(
        address token,
        uint256 entryFee,
        uint16 maxPlayers
    ) external returns (uint256) {
        if (entryFee == 0) revert InvalidEntryFee();
        if (maxPlayers < 2 || maxPlayers > 8) revert InvalidMaxPlayers();

        uint256 lobbyId = ++lobbyCount;

        Lobby storage lobby = lobbies[lobbyId];
        lobby.creator = msg.sender;
        lobby.token = token;
        lobby.entryFee = entryFee;
        lobby.maxPlayers = maxPlayers;
        lobby.state = LobbyState.OPEN;
        lobby.createdAt = block.timestamp;

        emit LobbyCreated(
            lobbyId,
            msg.sender,
            token,
            entryFee,
            maxPlayers
        );

        return lobbyId;
    }

    function joinLobby(uint256 lobbyId) external payable nonReentrant {
        Lobby storage lobby = lobbies[lobbyId];

        if (lobby.state != LobbyState.OPEN) revert LobbyNotOpen();
        if (lobby.players.length >= lobby.maxPlayers) revert LobbyFull();

        for (uint i = 0; i < lobby.players.length; i++) {
            if (lobby.players[i] == msg.sender) revert AlreadyJoined();
        }

        if (lobby.token == address(0)) {
            if (msg.value != lobby.entryFee) revert InvalidEntryFee();
        } else {
            IERC20(lobby.token).safeTransferFrom(
                msg.sender,
                address(this),
                lobby.entryFee
            );
        }

        lobby.players.push(msg.sender);

        emit PlayerJoined(lobbyId, msg.sender);

        if (lobby.players.length == lobby.maxPlayers) {
            lobby.state = LobbyState.STARTED;
            emit LobbyStarted(lobbyId, lobby.players.length);
        }
    }

    function endLobby(uint256 lobbyId, address[] calldata winners) external nonReentrant {
        Lobby storage lobby = lobbies[lobbyId];

        if (lobby.state != LobbyState.STARTED && lobby.state != LobbyState.OPEN) {
            revert LobbyNotEnded();
        }

        bool isPlayer = false;
        for (uint i = 0; i < lobby.players.length; i++) {
            if (lobby.players[i] == msg.sender) {
                isPlayer = true;
                break;
            }
        }
        if (!isPlayer) revert NotAPlayer();

        if (winners.length == 0 || winners.length > 3) revert InvalidWinners();
        for (uint i = 0; i < winners.length; i++) {
            bool found = false;
            for (uint j = 0; j < lobby.players.length; j++) {
                if (lobby.players[j] == winners[i]) {
                    found = true;
                    break;
                }
            }
            if (!found) revert InvalidWinners();
        }

        lobby.state = LobbyState.ENDED;

        uint256 totalPool = lobby.entryFee * lobby.players.length;
        uint256 fee = (totalPool * FEE_PERCENTAGE) / 100;
        uint256 prizePool = totalPool - fee;

        if (fee > 0) {
            _transfer(lobby.token, devWallet, fee);
            emit FeeTaken(lobbyId, devWallet, fee);
        }

        _transfer(lobby.token, winners[0], prizePool);
        emit Payout(lobbyId, winners[0], prizePool);

        emit LobbyEnded(lobbyId, msg.sender, winners);
    }

    function cancelLobby(uint256 lobbyId) external nonReentrant {
        Lobby storage lobby = lobbies[lobbyId];

        if (lobby.state != LobbyState.OPEN) revert LobbyNotOpen();
        if (msg.sender != lobby.creator && msg.sender != owner()) {
            revert("Only creator or owner can cancel");
        }

        lobby.state = LobbyState.CANCELLED;

        uint256 refundedCount = lobby.players.length;

        if (refundedCount > 0) {
            uint256 totalRefund = lobby.entryFee * refundedCount;

            uint256 contractBalance;
            if (lobby.token == address(0)) {
                contractBalance = address(this).balance;
            } else {
                contractBalance = IERC20(lobby.token).balanceOf(address(this));
            }

            require(contractBalance >= totalRefund, "Insufficient contract balance for refunds");

            for (uint i = 0; i < lobby.players.length; i++) {
                address player = lobby.players[i];
                _transfer(lobby.token, player, lobby.entryFee);
                emit Payout(lobbyId, player, lobby.entryFee);
            }
        }

        emit LobbyCancelled(lobbyId, msg.sender, refundedCount);
    }

    function setDevWallet(address _newDevWallet) external onlyOwner {
        if (_newDevWallet == address(0)) revert InvalidDevWallet();
        address oldWallet = devWallet;
        devWallet = _newDevWallet;
        emit DevWalletUpdated(oldWallet, _newDevWallet);
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert NoFundsToWithdraw();

        uint256 balance;
        if (token == address(0)) {
            balance = address(this).balance;
        } else {
            balance = IERC20(token).balanceOf(address(this));
        }

        if (balance < amount) revert NoFundsToWithdraw();

        _transfer(token, owner(), amount);
        emit EmergencyWithdrawal(token, amount, owner());
    }

    function emergencyEndLobby(uint256 lobbyId, address[] calldata winners) external onlyOwner {
        Lobby storage lobby = lobbies[lobbyId];

        if (lobby.state == LobbyState.ENDED || lobby.state == LobbyState.CANCELLED) {
            revert("Lobby already finished");
        }

        lobby.state = LobbyState.STARTED;
        lobby.state = LobbyState.ENDED;

        uint256 totalPool = lobby.entryFee * lobby.players.length;
        uint256 fee = (totalPool * FEE_PERCENTAGE) / 100;
        uint256 prizePool = totalPool - fee;

        if (fee > 0) {
            _transfer(lobby.token, devWallet, fee);
            emit FeeTaken(lobbyId, devWallet, fee);
        }

        _transfer(lobby.token, winners[0], prizePool);
        emit Payout(lobbyId, winners[0], prizePool);

        emit LobbyEnded(lobbyId, msg.sender, winners);
    }

    function getLobbyPlayers(uint256 lobbyId) external view returns (address[] memory) {
        return lobbies[lobbyId].players;
    }

    function getLobbyInfo(uint256 lobbyId) external view returns (
        address creator,
        address token,
        uint256 entryFee,
        uint16 maxPlayers,
        LobbyState state,
        address[] memory players,
        uint256 createdAt
    ) {
        Lobby storage lobby = lobbies[lobbyId];
        return (
            lobby.creator,
            lobby.token,
            lobby.entryFee,
            lobby.maxPlayers,
            lobby.state,
            lobby.players,
            lobby.createdAt
        );
    }

    function isPlayerInLobby(uint256 lobbyId, address player) external view returns (bool) {
        Lobby storage lobby = lobbies[lobbyId];
        for (uint i = 0; i < lobby.players.length; i++) {
            if (lobby.players[i] == player) return true;
        }
        return false;
    }

    function _transfer(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    receive() external payable {}
}
