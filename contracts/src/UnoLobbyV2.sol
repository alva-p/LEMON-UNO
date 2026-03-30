// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title UnoLobbyV2
 * @notice Contrato para gestionar lobbies de UNO con pagos on-chain.
 * @dev El resultado del juego se verifica mediante firma EIP-712 del servidor
 *      (trustedSigner), lo que impide que cualquier jugador se declare ganador
 *      por su cuenta.
 *
 * Cambios de seguridad respecto a la versión anterior:
 *  - CRIT-01: endLobby requiere firma EIP-712 del backend
 *  - CRIT-02: emergencyEndLobby valida que el ganador sea un jugador + nonReentrant
 *  - HIGH-01: endLobby solo acepta estado STARTED (no OPEN)
 *  - HIGH-02: cancelLobby usa pull-payment (pendingRefunds + claimRefund)
 *  - HIGH-03: emergencyWithdraw no puede tocar fondos bloqueados de jugadores
 *  - MED-01/03: exactamente 1 ganador, mínimo 2 jugadores para finalizar
 *  - LOW-02: owner y devWallet son parámetros separados en el constructor
 *  - LOW-03: renounceOwnership deshabilitado
 *  - INFO-01: pragma fijo a 0.8.28
 *  - INFO-02: eliminada asignación redundante en emergencyEndLobby
 */
contract UnoLobbyV2 is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    enum LobbyState { OPEN, STARTED, ENDED, CANCELLED }

    struct Lobby {
        address creator;
        address token;      // address(0) para ETH nativo
        uint256 entryFee;
        uint16  maxPlayers;
        LobbyState state;
        address[] players;
        uint256 createdAt;
    }

    /// @notice Type hash para la declaración de ganador firmada por el backend.
    bytes32 public constant END_LOBBY_TYPEHASH = keccak256(
        "EndLobby(uint256 lobbyId,address winner,uint256 nonce)"
    );

    uint256 public lobbyCount;
    address public devWallet;
    address public trustedSigner;         // Clave del backend que firma resultados
    uint256 public constant FEE_PERCENTAGE = 5;

    mapping(uint256 => Lobby)   public lobbies;
    mapping(uint256 => uint256) public lobbyNonces;                        // anti-replay por lobby
    mapping(address => uint256) public lockedFunds;                        // token → fondos comprometidos con jugadores
    mapping(address => mapping(address => uint256)) public pendingRefunds; // token → jugador → reembolso pendiente

    // ─── Events ───────────────────────────────────────────────────────────────
    event LobbyCreated(uint256 indexed lobbyId, address indexed creator, address token, uint256 entryFee, uint16 maxPlayers);
    event PlayerJoined(uint256 indexed lobbyId, address indexed player);
    event LobbyStarted(uint256 indexed lobbyId, uint256 playerCount);
    event LobbyEnded(uint256 indexed lobbyId, address indexed endedBy, address[] winners);
    event Payout(uint256 indexed lobbyId, address indexed to, uint256 amount);
    event FeeTaken(uint256 indexed lobbyId, address indexed devWallet, uint256 amount);
    event LobbyCancelled(uint256 indexed lobbyId, address indexed cancelledBy, uint256 refundedPlayers);
    event RefundClaimed(address indexed player, address indexed token, uint256 amount);
    event DevWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event EmergencyWithdrawal(address indexed token, uint256 amount, address indexed to);

    // ─── Errors ───────────────────────────────────────────────────────────────
    error InvalidEntryFee();
    error InvalidMaxPlayers();
    error LobbyNotOpen();
    error LobbyNotStarted();
    error AlreadyJoined();
    error LobbyFull();
    error InvalidWinners();
    error InvalidDevWallet();
    error InvalidSigner();
    error NoFundsToWithdraw();
    error NoRefundPending();
    error NotEnoughPlayers();

    /**
     * @param _owner         Owner/admin del contrato (usar multisig en producción).
     * @param _devWallet     Dirección que recibe el 5% de comisión.
     * @param _trustedSigner Hot-wallet del backend que firma los resultados.
     */
    constructor(address _owner, address _devWallet, address _trustedSigner)
        Ownable(_owner)
        EIP712("UnoLobbyV2", "1")
    {
        if (_devWallet == address(0))    revert InvalidDevWallet();
        if (_trustedSigner == address(0)) revert InvalidSigner();
        devWallet     = _devWallet;
        trustedSigner = _trustedSigner;
    }

    // ─── Funciones de jugadores ───────────────────────────────────────────────

    function createLobby(address token, uint256 entryFee, uint16 maxPlayers)
        external returns (uint256)
    {
        if (entryFee == 0)                     revert InvalidEntryFee();
        if (maxPlayers < 2 || maxPlayers > 8) revert InvalidMaxPlayers();

        uint256 lobbyId = ++lobbyCount;
        Lobby storage lobby = lobbies[lobbyId];
        lobby.creator    = msg.sender;
        lobby.token      = token;
        lobby.entryFee   = entryFee;
        lobby.maxPlayers = maxPlayers;
        lobby.state      = LobbyState.OPEN;
        lobby.createdAt  = block.timestamp;

        emit LobbyCreated(lobbyId, msg.sender, token, entryFee, maxPlayers);
        return lobbyId;
    }

    function joinLobby(uint256 lobbyId) external payable nonReentrant {
        Lobby storage lobby = lobbies[lobbyId];

        if (lobby.state != LobbyState.OPEN)             revert LobbyNotOpen();
        if (lobby.players.length >= lobby.maxPlayers)   revert LobbyFull();

        for (uint i = 0; i < lobby.players.length; i++) {
            if (lobby.players[i] == msg.sender) revert AlreadyJoined();
        }

        if (lobby.token == address(0)) {
            if (msg.value != lobby.entryFee) revert InvalidEntryFee();
        } else {
            IERC20(lobby.token).safeTransferFrom(msg.sender, address(this), lobby.entryFee);
        }

        lobby.players.push(msg.sender);
        lockedFunds[lobby.token] += lobby.entryFee;  // rastrear fondos comprometidos

        emit PlayerJoined(lobbyId, msg.sender);

        if (lobby.players.length == lobby.maxPlayers) {
            lobby.state = LobbyState.STARTED;
            emit LobbyStarted(lobbyId, lobby.players.length);
        }
    }

    /**
     * @notice Declara el ganador y distribuye los fondos.
     * @dev Requiere firma EIP-712 del trustedSigner (backend) para el par
     *      (lobbyId, winner, nonce). Esto previene que cualquier jugador se
     *      declare ganador por su cuenta (CRIT-01).
     *
     * El backend debe firmar: EndLobby(uint256 lobbyId, address winner, uint256 nonce)
     * usando la clave de trustedSigner antes de que el frontend llame esta función.
     *
     * @param lobbyId  ID del lobby a cerrar.
     * @param winners  Array con exactamente 1 dirección ganadora (debe ser jugador).
     * @param signature Firma EIP-712 del backend.
     */
    function endLobby(
        uint256 lobbyId,
        address[] calldata winners,
        bytes calldata signature
    ) external nonReentrant {
        Lobby storage lobby = lobbies[lobbyId];

        // HIGH-01: solo lobbies en estado STARTED
        if (lobby.state != LobbyState.STARTED) revert LobbyNotStarted();

        // MED-03: mínimo 2 jugadores para que tenga sentido el payout
        if (lobby.players.length < 2) revert NotEnoughPlayers();

        // MED-01: exactamente 1 ganador (solo winners[0] recibe fondos)
        if (winners.length != 1) revert InvalidWinners();

        // El ganador debe ser un jugador registrado en el lobby
        bool found = false;
        for (uint j = 0; j < lobby.players.length; j++) {
            if (lobby.players[j] == winners[0]) { found = true; break; }
        }
        if (!found) revert InvalidWinners();

        // CRIT-01: verificar firma del backend
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            END_LOBBY_TYPEHASH,
            lobbyId,
            winners[0],
            lobbyNonces[lobbyId]
        )));
        if (ECDSA.recover(digest, signature) != trustedSigner) revert InvalidSigner();

        lobbyNonces[lobbyId]++;
        lobby.state = LobbyState.ENDED;

        uint256 totalPool = lobby.entryFee * lobby.players.length;
        uint256 fee       = (totalPool * FEE_PERCENTAGE) / 100;
        uint256 prizePool = totalPool - fee;

        lockedFunds[lobby.token] -= totalPool;  // liberar fondos bloqueados

        // Checks-Effects-Interactions: estado ya actualizado, ahora transferir
        if (fee > 0) {
            _transfer(lobby.token, devWallet, fee);
            emit FeeTaken(lobbyId, devWallet, fee);
        }

        _transfer(lobby.token, winners[0], prizePool);
        emit Payout(lobbyId, winners[0], prizePool);
        emit LobbyEnded(lobbyId, msg.sender, winners);
    }

    /**
     * @notice Cancela un lobby abierto y registra reembolsos pendientes.
     * @dev HIGH-02: usa pull-payment para evitar DoS por un jugador con
     *      contrato que rechaza ETH. Los jugadores reclaman con claimRefund().
     */
    function cancelLobby(uint256 lobbyId) external nonReentrant {
        Lobby storage lobby = lobbies[lobbyId];

        if (lobby.state != LobbyState.OPEN) revert LobbyNotOpen();
        if (msg.sender != lobby.creator && msg.sender != owner()) {
            revert("Only creator or owner can cancel");
        }

        lobby.state = LobbyState.CANCELLED;

        uint256 count = lobby.players.length;
        for (uint i = 0; i < count; i++) {
            // Registrar reembolso; lockedFunds se reduce cuando el jugador reclama
            pendingRefunds[lobby.token][lobby.players[i]] += lobby.entryFee;
        }

        emit LobbyCancelled(lobbyId, msg.sender, count);
    }

    /**
     * @notice Reclama el reembolso pendiente para un token dado.
     * @dev Los fondos quedan en el contrato hasta que el jugador los reclame.
     */
    function claimRefund(address token) external nonReentrant {
        uint256 amount = pendingRefunds[token][msg.sender];
        if (amount == 0) revert NoRefundPending();

        pendingRefunds[token][msg.sender] = 0;
        lockedFunds[token] -= amount;  // ahora liberar del tracking

        _transfer(token, msg.sender, amount);
        emit RefundClaimed(msg.sender, token, amount);
    }

    // ─── Funciones del owner ──────────────────────────────────────────────────

    function setDevWallet(address _newDevWallet) external onlyOwner {
        if (_newDevWallet == address(0)) revert InvalidDevWallet();
        address old = devWallet;
        devWallet = _newDevWallet;
        emit DevWalletUpdated(old, _newDevWallet);
    }

    function setTrustedSigner(address _newSigner) external onlyOwner {
        if (_newSigner == address(0)) revert InvalidSigner();
        address old = trustedSigner;
        trustedSigner = _newSigner;
        emit TrustedSignerUpdated(old, _newSigner);
    }

    /**
     * @notice Retiro de emergencia — solo puede tomar fondos no comprometidos.
     * @dev HIGH-03: respeta lockedFunds para proteger los fondos de jugadores
     *      en lobbies activos y reembolsos pendientes.
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert NoFundsToWithdraw();

        uint256 balance = token == address(0)
            ? address(this).balance
            : IERC20(token).balanceOf(address(this));

        // Solo puede retirar fondos que no están comprometidos con jugadores
        if (balance - lockedFunds[token] < amount) revert NoFundsToWithdraw();

        _transfer(token, owner(), amount);
        emit EmergencyWithdrawal(token, amount, owner());
    }

    /**
     * @notice Cierre de emergencia de un lobby por el owner.
     * @dev CRIT-02: nonReentrant + winners[0] debe ser un jugador del lobby.
     *      INFO-02: eliminada la asignación redundante a STARTED.
     */
    function emergencyEndLobby(uint256 lobbyId, address[] calldata winners)
        external onlyOwner nonReentrant
    {
        Lobby storage lobby = lobbies[lobbyId];

        if (lobby.state == LobbyState.ENDED || lobby.state == LobbyState.CANCELLED) {
            revert("Lobby already finished");
        }

        // CRIT-02: validar exactamente 1 ganador y que sea jugador del lobby
        if (winners.length != 1) revert InvalidWinners();
        bool found = false;
        for (uint i = 0; i < lobby.players.length; i++) {
            if (lobby.players[i] == winners[0]) { found = true; break; }
        }
        if (!found) revert InvalidWinners();

        lobby.state = LobbyState.ENDED;

        uint256 totalPool = lobby.entryFee * lobby.players.length;
        uint256 fee       = (totalPool * FEE_PERCENTAGE) / 100;
        uint256 prizePool = totalPool - fee;

        lockedFunds[lobby.token] -= totalPool;

        if (fee > 0) {
            _transfer(lobby.token, devWallet, fee);
            emit FeeTaken(lobbyId, devWallet, fee);
        }

        _transfer(lobby.token, winners[0], prizePool);
        emit Payout(lobbyId, winners[0], prizePool);
        emit LobbyEnded(lobbyId, msg.sender, winners);
    }

    /**
     * @notice Renunciar al ownership está deshabilitado.
     * @dev LOW-03: si el owner renunciase, los fondos bloqueados quedarían
     *      sin posibilidad de rescate por emergencyEndLobby.
     */
    function renounceOwnership() public override onlyOwner {
        revert("Renounce disabled");
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    /// @notice Expone el domain separator EIP-712 para uso en tests y front-end.
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getLobbyPlayers(uint256 lobbyId) external view returns (address[] memory) {
        return lobbies[lobbyId].players;
    }

    function getLobbyInfo(uint256 lobbyId) external view returns (
        address creator,
        address token,
        uint256 entryFee,
        uint16  maxPlayers,
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

    // ─── Internos ─────────────────────────────────────────────────────────────

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
