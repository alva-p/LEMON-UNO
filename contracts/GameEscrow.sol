// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title GameEscrow
 * @dev Escrow para apuestas del juego UNO.
 *
 * Cambios de seguridad:
 *  - CRIT-03: settleGame valida que _winner sea un jugador de la partida
 *  - HIGH-04: createGame rechaza gameId duplicados
 *  - INFO-03: mecanismo de reembolso por timeout (24 h) si el admin no settle
 *  - LOW (admin): transferencia de admin en dos pasos para rotación de clave
 *  - Reentrancy guard inline (CEI + lock) en settleGame y claimExpiredRefund
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract GameEscrow {
    address public admin;
    address public pendingAdmin;  // rotación en dos pasos
    IERC20  public usdc;

    uint256 public constant GAME_TIMEOUT = 24 hours;

    struct Game {
        bytes32  gameId;
        address[] players;
        uint256  betAmount;
        uint256  totalPot;
        uint256  feeAmount;
        address  winner;
        bool     settled;
        uint256  createdAt;  // para el mecanismo de timeout
    }

    mapping(bytes32 => Game) public games;
    mapping(bytes32 => mapping(address => bool)) public refundClaimed;  // anti-doble-claim

    bool private _locked;

    // ─── Events ───────────────────────────────────────────────────────────────
    event GameCreated(bytes32 indexed gameId, address[] players, uint256 betAmount);
    event GameSettled(bytes32 indexed gameId, address winner, uint256 payout);
    event RefundClaimed(bytes32 indexed gameId, address indexed player, uint256 amount);
    event AdminTransferInitiated(address indexed current, address indexed pending);
    event AdminTransferAccepted(address indexed newAdmin);

    modifier nonReentrant() {
        require(!_locked, "Reentrancy");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address _usdc) {
        admin = msg.sender;
        usdc  = IERC20(_usdc);
    }

    // ─── Funciones del admin ──────────────────────────────────────────────────

    /**
     * @dev Inicia la transferencia de admin (paso 1 de 2).
     */
    function transferAdmin(address _newAdmin) external {
        require(msg.sender == admin, "Only admin");
        require(_newAdmin != address(0), "Invalid address");
        pendingAdmin = _newAdmin;
        emit AdminTransferInitiated(admin, _newAdmin);
    }

    /**
     * @dev Acepta la transferencia de admin (paso 2 de 2).
     */
    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Not pending admin");
        emit AdminTransferAccepted(msg.sender);
        admin        = msg.sender;
        pendingAdmin = address(0);
    }

    // ─── Lógica del juego ─────────────────────────────────────────────────────

    /**
     * @dev Crea una partida y bloquea los fondos de todos los jugadores.
     *      HIGH-04: rechaza si el gameId ya existe.
     */
    function createGame(
        bytes32 _gameId,
        address[] memory _players,
        uint256 _betAmount
    ) external {
        require(_players.length >= 2 && _players.length <= 10, "Invalid player count");
        require(_betAmount >= 100 * 1e18 && _betAmount <= 100000 * 1e18, "Invalid bet amount");

        // HIGH-04: evitar sobreescritura de partidas existentes
        require(games[_gameId].totalPot == 0, "Game already exists");

        Game storage game = games[_gameId];
        game.gameId    = _gameId;
        game.players   = _players;
        game.betAmount = _betAmount;
        game.totalPot  = _betAmount * _players.length;
        game.feeAmount = (game.totalPot * 5) / 100;
        game.createdAt = block.timestamp;

        for (uint256 i = 0; i < _players.length; i++) {
            require(
                usdc.transferFrom(_players[i], address(this), _betAmount),
                "Transfer failed"
            );
        }

        emit GameCreated(_gameId, _players, _betAmount);
    }

    /**
     * @dev Liquida la partida y paga al ganador.
     *      CRIT-03: verifica que _winner sea un jugador de la partida.
     */
    function settleGame(bytes32 _gameId, address _winner) external nonReentrant {
        require(msg.sender == admin, "Only admin can settle");

        Game storage game = games[_gameId];
        require(!game.settled,        "Game already settled");
        require(game.totalPot > 0,    "Invalid game");

        // CRIT-03: _winner debe ser uno de los jugadores registrados
        bool isPlayer = false;
        for (uint256 i = 0; i < game.players.length; i++) {
            if (game.players[i] == _winner) { isPlayer = true; break; }
        }
        require(isPlayer, "Winner is not a player");

        // Checks-Effects-Interactions
        game.settled = true;
        game.winner  = _winner;

        uint256 payout = game.totalPot - game.feeAmount;

        require(usdc.transfer(_winner, payout),         "Payout failed");
        require(usdc.transfer(admin, game.feeAmount),   "Fee transfer failed");

        emit GameSettled(_gameId, _winner, payout);
    }

    /**
     * @dev INFO-03: si el admin no liquida en 24 h, cada jugador puede
     *      reclamar su apuesta de vuelta individualmente.
     */
    function claimExpiredRefund(bytes32 _gameId) external nonReentrant {
        Game storage game = games[_gameId];

        require(game.totalPot > 0,                             "Invalid game");
        require(!game.settled,                                 "Game already settled");
        require(block.timestamp >= game.createdAt + GAME_TIMEOUT, "Game not expired yet");
        require(!refundClaimed[_gameId][msg.sender],           "Already claimed");

        // Verificar que el caller sea jugador
        bool isPlayer = false;
        for (uint256 i = 0; i < game.players.length; i++) {
            if (game.players[i] == msg.sender) { isPlayer = true; break; }
        }
        require(isPlayer, "Not a player");

        refundClaimed[_gameId][msg.sender] = true;

        require(usdc.transfer(msg.sender, game.betAmount), "Refund failed");

        emit RefundClaimed(_gameId, msg.sender, game.betAmount);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function getGame(bytes32 _gameId) external view returns (Game memory) {
        return games[_gameId];
    }
}
