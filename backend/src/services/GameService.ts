import { GameEngine, Player } from '../game/engine'
import { gameEscrowService } from './GameEscrowService'

export type EconomyMode = 'ARS_SANDBOX' | 'CRYPTO'

export interface LobbyData {
  id: string
  creator: string
  creatorId: string
  isPublic: boolean
  password?: string
  betAmount: number
  currency: 'ARS' | 'ETH' | 'USDT' | 'USDC'
  network?: 'ETH' | 'BASE'
  maxPlayers: number
  players: Player[]
  createdAt: Date
  status: 'waiting' | 'started' | 'finished' | 'cancelled'
  contractLobbyId?: bigint
  txHash?: string
  economyMode: EconomyMode
  isTest: boolean
  gameId?: string
}

/** Porcentaje de comisión de la casa (5% — igual que FEE_PERCENTAGE en UnoLobbyV2.sol) */
const HOUSE_FEE_PCT = 0.05

export class GameService {
  private lobbies: Map<string, LobbyData> = new Map()
  private games: Map<string, GameEngine> = new Map()
  private arsBalances: Map<string, number> = new Map()
  /** Acumula comisiones ARS cobradas */
  private houseFeeBalance: number = 0

  // ============================
  // ARS SANDBOX BALANCES
  // ============================

  getArsSandboxBalance(playerId: string): number {
    return this.arsBalances.get(playerId) ?? 0
  }

  getHouseFeeBalance(): number {
    return this.houseFeeBalance
  }

  creditArsSandbox(playerId: string, amount: number): void {
    const current = this.getArsSandboxBalance(playerId)
    this.arsBalances.set(playerId, current + amount)
  }

  debitArsSandbox(playerId: string, amount: number): void {
    const current = this.getArsSandboxBalance(playerId)
    if (current < amount) throw new Error('Saldo ARS insuficiente')
    this.arsBalances.set(playerId, current - amount)
  }

  // ============================
  // LOBBIES
  // ============================

  async createLobby(
    creator: string,
    betAmount: number,
    isPublic: boolean,
    maxPlayers: number = 2,
    password?: string,
    currency: 'ARS' | 'ETH' | 'USDT' | 'USDC' = 'ARS',
    network?: 'ETH' | 'BASE',
    isTest: boolean = true,
  ): Promise<LobbyData> {
    // Un solo lobby "waiting" por creador
    for (const l of this.lobbies.values()) {
      if (l.creatorId === creator && l.status === 'waiting') {
        throw new Error('Ya tienes un lobby activo')
      }
    }

    const economyMode: EconomyMode = currency === 'ARS' ? 'ARS_SANDBOX' : 'CRYPTO'

    if (economyMode === 'CRYPTO' && !network) {
      throw new Error('Network is required for crypto lobbies')
    }

    const resolvedNetwork = economyMode === 'ARS_SANDBOX' ? undefined : network

    if (currency === 'ARS' && betAmount < 0) {
      throw new Error('La apuesta no puede ser negativa')
    }

    const lobbyId = `lobby_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

    const lobby: LobbyData = {
      id: lobbyId,
      creator,
      creatorId: creator,
      isPublic,
      password,
      betAmount,
      currency,
      network: resolvedNetwork,
      maxPlayers,
      players: [{
        id: creator,
        name: creator,
        hand: [],
        hasCalledUno: false,
        isChallenged: false,
      }],
      createdAt: new Date(),
      status: 'waiting',
      economyMode,
      isTest,
    }

    this.lobbies.set(lobbyId, lobby)
    return lobby
  }

  joinLobby(
    lobbyId: string,
    playerId: string,
    password?: string,
  ): { success: boolean; error?: string } {
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby) return { success: false, error: 'Lobby not found' }

    if (lobby.status !== 'waiting') {
      return { success: false, error: 'Lobby is not open' }
    }

    if (!lobby.isPublic && lobby.password !== password) {
      return { success: false, error: 'Invalid password' }
    }

    if (lobby.players.length >= lobby.maxPlayers) {
      return { success: false, error: 'Lobby is full' }
    }

    if (lobby.players.some((p) => p.id === playerId)) {
      console.log(`ℹ️ Player ${playerId} ya está en el lobby ${lobbyId}, join idempotente.`)
      return { success: true }
    }

    // Validación de saldo ARS sandbox antes de unirse
    if (lobby.currency === 'ARS' && lobby.betAmount > 0) {
      const balance = this.getArsSandboxBalance(playerId)
      if (balance < lobby.betAmount) {
        return {
          success: false,
          error: 'Saldo ARS insuficiente para unirse al lobby',
        }
      }
    }

    lobby.players.push({
      id: playerId,
      name: playerId,
      hand: [],
      hasCalledUno: false,
      isChallenged: false,
    })

    return { success: true }
  }

  cancelLobby(
    lobbyId: string,
    requesterId: string,
  ): { success: boolean; error?: string } {
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby) return { success: false, error: 'Lobby not found' }

    if (lobby.creatorId !== requesterId) {
      return { success: false, error: 'Only the lobby creator can cancel' }
    }

    if (lobby.status !== 'waiting') {
      return { success: false, error: 'Lobby already started or finished' }
    }

    lobby.status = 'cancelled'
    return { success: true }
  }

  getLobby(lobbyId: string): LobbyData | null {
    return this.lobbies.get(lobbyId) ?? null
  }

  getAllLobbies(): LobbyData[] {
    return Array.from(this.lobbies.values()).filter(
      (l) => l.status === 'waiting' || l.status === 'started',
    )
  }

  getPublicLobbies(): LobbyData[] {
    return Array.from(this.lobbies.values()).filter(
      (l) => l.isPublic && l.status !== 'finished' && l.status !== 'cancelled',
    )
  }

  getPrivateLobbies(): LobbyData[] {
    return Array.from(this.lobbies.values()).filter(
      (l) => !l.isPublic && l.status !== 'finished' && l.status !== 'cancelled',
    )
  }

  getFreeLobbies(): LobbyData[] {
    return Array.from(this.lobbies.values()).filter(
      (l) => l.betAmount === 0 && l.status !== 'finished',
    )
  }

  getPaidLobbies(): LobbyData[] {
    return Array.from(this.lobbies.values()).filter((l) => l.betAmount > 0)
  }

  // ============================
  // JUEGOS (CREACIÓN / ESTADO)
  // ============================

  startGame(lobbyId: string): { success: boolean; gameId?: string; error?: string } {
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby) return { success: false, error: 'Lobby not found' }

    if (lobby.status !== 'waiting') {
      return { success: false, error: 'Lobby is not open' }
    }

    if (lobby.players.length < 2) {
      return { success: false, error: 'Not enough players' }
    }

    const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const engine = new GameEngine(
      gameId,
      lobby.players,
      lobby.betAmount,
      lobby.currency,
      lobby.network,
    )

    this.games.set(gameId, engine)
    lobby.status = 'started'
    lobby.gameId = gameId

    console.log(
      `🎮 Juego iniciado (sin escrow) - GameID: ${gameId}, Jugadores: ${lobby.players.length}, Moneda: ${lobby.currency}`,
    )

    return { success: true, gameId }
  }

  startGameWithEscrow(
    lobbyId: string,
    playerBalances?: Map<string, number>,
  ): { success: boolean; gameId?: string; escrowIds?: string[]; error?: string } {
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby) return { success: false, error: 'Lobby not found' }

    if (lobby.status !== 'waiting') {
      return { success: false, error: 'Lobby is not open' }
    }

    if (lobby.players.length < 2) {
      return { success: false, error: 'Not enough players' }
    }

    const escrowIds: string[] = []
    const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

    const getBalance = (playerId: string): number => {
      if (lobby.currency === 'ARS') {
        return this.getArsSandboxBalance(playerId)
      }
      return playerBalances?.get(playerId) ?? 0
    }

    try {
      for (const player of lobby.players) {
        const balance = getBalance(player.id)
        if (balance < lobby.betAmount) {
          return {
            success: false,
            error: `Jugador ${player.id} no tiene suficiente balance para la apuesta`,
          }
        }

        if (lobby.currency === 'ARS' && lobby.betAmount > 0) {
          this.debitArsSandbox(player.id, lobby.betAmount)
        }

        const escrow = gameEscrowService.createEscrow(
          gameId,
          player.id,
          lobby.betAmount,
        )
        escrowIds.push(escrow.id)
      }
    } catch (err) {
      return {
        success: false,
        error: `Error creando escrow: ${(err as Error).message}`,
      }
    }

    const engine = new GameEngine(
      gameId,
      lobby.players,
      lobby.betAmount,
      lobby.currency,
      lobby.network,
    )

    this.games.set(gameId, engine)
    lobby.status = 'started'
    lobby.gameId = gameId

    console.log(
      `🎮 Juego iniciado con escrow - GameID: ${gameId}, Jugadores: ${lobby.players.length}, Moneda: ${lobby.currency}`,
    )

    return { success: true, gameId, escrowIds }
  }

  getGameState(gameId: string): any {
    const engine = this.games.get(gameId)
    return engine ? engine.getState() : null
  }

  getGameEngine(gameId: string): GameEngine | null {
    return this.games.get(gameId) ?? null
  }

  // ============================
  // ACCIONES DE JUEGO
  // ============================

  playCard(gameId: string, playerIndex: number, cardId: string, chosenColor?: any) {
    const engine = this.games.get(gameId)
    if (!engine) return { valid: false, error: 'Game not found' }

    return engine.playCard(playerIndex, cardId, chosenColor)
  }

  drawCard(gameId: string, playerIndex: number) {
    const engine = this.games.get(gameId)
    if (!engine) return { valid: false, error: 'Game not found' }

    return engine.drawCard(playerIndex)
  }

  callUno(gameId: string, playerIndex: number) {
    const engine = this.games.get(gameId)
    if (!engine) return { valid: false, error: 'Game not found' }

    return engine.callUno(playerIndex)
  }

  challengeUno(gameId: string, accuserIndex: number, targetIndex: number) {
    const engine = this.games.get(gameId)
    if (!engine) return { valid: false, error: 'Game not found' }

    return engine.challengeUno(accuserIndex, targetIndex)
  }

  challengeWildDrawFour(gameId: string, accuserIndex: number, targetIndex: number) {
    const engine = this.games.get(gameId)
    if (!engine) return { valid: false, error: 'Game not found' }

    return engine.challengeWildDrawFour(accuserIndex, targetIndex)
  }

  chooseColor(gameId: string, playerIndex: number, color: string) {
    const engine = this.games.get(gameId)
    if (!engine) return { valid: false, error: 'Game not found' }

    const validColors = ['RED', 'BLUE', 'GREEN', 'YELLOW']
    if (!validColors.includes(color)) {
      return { valid: false, error: 'Invalid color' }
    }

    return engine.chooseColor(gameId ? gameId as any : playerIndex as any, color as any)
  }

  /**
   * NUEVO: pasar turno después de robar (botón "Pass Turn")
   */
  passTurn(gameId: string, playerIndex: number): { success: boolean; error?: string } {
    const engine = this.games.get(gameId)
    if (!engine) {
      return { success: false, error: 'Game not found' }
    }

    const result = engine.passTurn(playerIndex)
    if (!result.valid) {
      return { success: false, error: result.error }
    }

    return { success: true }
  }

  // ============================
  // FIN DE JUEGO + ESCROW
  // ============================

  async finishGameWithEscrow(
    gameId: string,
    winnerId: string,
    allPlayerIds: string[],
  ): Promise<{ success: boolean; distribution?: any; error?: string }> {
    const engine = this.games.get(gameId)
    if (!engine) return { success: false, error: 'Game not found' }

    try {
      const gameState = engine.getState()
      const betAmount = (gameState as any).bet || 0
      const totalPot = (gameState as any).pot || betAmount * allPlayerIds.length

      // Aplicar comisión de la casa solo a partidas ARS con apuesta > 0
      const isArs = (gameState as any).currency === 'ARS'
      const houseFee = isArs && totalPot > 0 ? Math.floor(totalPot * HOUSE_FEE_PCT) : 0
      const winnerPrize = totalPot - houseFee

      if (houseFee > 0) {
        this.houseFeeBalance += houseFee
        console.log(`💰 House fee: $${houseFee} ARS (3% de $${totalPot}). Acumulado: $${this.houseFeeBalance}`)
      }

      // Acreditar premio neto al ganador en ARS sandbox
      if (isArs && winnerPrize > 0) {
        this.creditArsSandbox(winnerId, winnerPrize)
        console.log(`🏆 Premio acreditado: $${winnerPrize} ARS → ${winnerId}`)
      }

      const winners = [
        {
          userId: winnerId,
          prizeAmount: winnerPrize,
        },
      ]

      // El guardado en BD ya lo hace el GameEngine (saveMatchResult).
      // Aquí solo distribuimos escrow + cerramos lobby.
      const distribution = gameEscrowService.distributePot(gameId, winners)

      // Liquidar on-chain para partidas crypto (fire-and-forget)
      const lobby = this.getLobbyByGameId(gameId)
      if (lobby) {
        this.settleOnChain(lobby, winnerId)
      }

      this.markLobbyAsFinished(gameId)
      this.games.delete(gameId)

      console.log(
        `✅ Juego finalizado con distribución de escrow - GameID: ${gameId}, Ganador: ${winnerId}`,
      )

      return { success: true, distribution }
    } catch (err) {
      return {
        success: false,
        error: `Error finishing game: ${(err as Error).message}`,
      }
    }
  }

  private getLobbyByGameId(gameId: string): LobbyData | undefined {
    for (const lobby of this.lobbies.values()) {
      if (lobby.gameId === gameId) return lobby
    }
    return undefined
  }

  /**
   * Llama a endLobby on-chain para liquidar el pozo en partidas crypto.
   * Fire-and-forget: errores se loggean pero no bloquean el flujo.
   */
  private async settleOnChain(lobby: LobbyData, winnerId: string): Promise<void> {
    if (!lobby.contractLobbyId || lobby.currency === 'ARS') return
    const network = lobby.network
    if (!network) return

    try {
      const { ContractService } = await import('./ContractService')
      const contractService = new ContractService(network)
      await contractService.endLobby(lobby.contractLobbyId, [winnerId])
      console.log(`✅ On-chain settlement OK — lobby ${lobby.id}, winner ${winnerId}`)
    } catch (err) {
      console.error(`❌ On-chain settlement failed for lobby ${lobby.id}:`, err)
    }
  }

  private markLobbyAsFinished(gameId: string): void {
    for (const [lobbyId, lobby] of this.lobbies.entries()) {
      if (lobby.gameId === gameId) {
        lobby.status = 'finished'
        console.log(`🏁 Lobby ${lobbyId} marcado como terminado`)
        break
      }
    }
  }

  forceMarkLobbyAsFinished(gameId: string): void {
    this.markLobbyAsFinished(gameId)
    this.games.delete(gameId)
  }

  // ============================
  // PERSISTENCIA
  // ============================

  /** Devuelve el estado serializable para persistir en disco */
  getPersistedState() {
    return {
      lobbies: Array.from(this.lobbies.values()),
      arsBalances: Object.fromEntries(this.arsBalances),
      houseFeeBalance: this.houseFeeBalance,
    }
  }

  /** Carga estado previo desde disco al arrancar el servidor */
  loadPersistedState(state: {
    lobbies: LobbyData[]
    arsBalances: Record<string, number>
    houseFeeBalance: number
  }) {
    // Solo restaurar lobbies que no estén terminados/cancelados
    for (const lobby of state.lobbies) {
      if (lobby.status !== 'finished' && lobby.status !== 'cancelled') {
        this.lobbies.set(lobby.id, lobby)
      }
    }
    for (const [id, balance] of Object.entries(state.arsBalances)) {
      this.arsBalances.set(id, balance)
    }
    this.houseFeeBalance = state.houseFeeBalance
    console.log(`[GameService] Estado restaurado: ${this.lobbies.size} lobbies, ${this.arsBalances.size} balances ARS`)
  }

  cancelGameWithEscrow(gameId: string): { success: boolean; returned?: any; error?: string } {
    const engine = this.games.get(gameId)
    if (!engine) return { success: false, error: 'Game not found' }

    try {
      const result = gameEscrowService.cancelGame(gameId)
      this.games.delete(gameId)

      console.log(`❌ Juego cancelado - GameID: ${gameId}`)

      return { success: true, returned: result }
    } catch (err) {
      return {
        success: false,
        error: `Error cancelling game: ${(err as Error).message}`,
      }
    }
  }
}
