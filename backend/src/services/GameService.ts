import { GameEngine, GameState, Player } from '../game/engine'
import { gameEscrowService } from './GameEscrowService'

/**
 * GameService - manages game lobbies and active games with escrow
 */
export interface LobbyData {
  id: string
  creator: string
  creatorId: string // Wallet ID of lobby creator for permission checks
  isPublic: boolean
  password?: string
  betAmount: number
  currency: 'ARS' | 'ETH' | 'USDT' | 'USDC' // Tipo de moneda para la apuesta
  network?: 'ETH' | 'BASE' // Red blockchain (solo para crypto)
  maxPlayers: number
  players: Player[]
  createdAt: Date
  status: 'waiting' | 'started' | 'finished' | 'cancelled' // Estado del lobby
  gameId?: string // Game ID when status is 'started'
  escrowId?: string // Escrow entry ID when game starts
}

export class GameService {
  private games: Map<string, GameEngine> = new Map()
  private lobbies: Map<string, LobbyData> = new Map()

  /**
   * Create a new lobby
   */
  createLobby(
    creator: string,
    betAmount: number,
    isPublic: boolean,
    maxPlayers: number = 2,
    password?: string,
    currency: 'ARS' | 'ETH' | 'USDT' | 'USDC' = 'ARS',
    network?: 'ETH' | 'BASE'
  ): LobbyData {
    const lobbyId = `lobby_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

    const lobby: LobbyData = {
      id: lobbyId,
      creator,
      creatorId: creator, // Store wallet ID for permission checks
      isPublic,
      password,
      betAmount,
      currency,
      network,
      maxPlayers,
      players: [{ id: creator, name: creator, hand: [], hasCalledUno: false, isChallenged: false }],
      createdAt: new Date(),
      status: 'waiting',
    }

    this.lobbies.set(lobbyId, lobby)
    return lobby
  }

  /**
   * Join an existing lobby
   */
  joinLobby(lobbyId: string, playerId: string, password?: string): { success: boolean; error?: string } {
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby) return { success: false, error: 'Lobby not found' }

    if (!lobby.isPublic && lobby.password !== password) {
      return { success: false, error: 'Invalid password' }
    }

    if (lobby.players.length >= 10) {
      return { success: false, error: 'Lobby is full' }
    }

    if (lobby.players.some((p) => p.id === playerId)) {
      return { success: false, error: 'Player already in lobby' }
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

  /**
   * Start a game from a lobby with escrow
   * Validates balance and creates escrow entries for all players
   */
  startGameWithEscrow(
    lobbyId: string,
    playerBalances: Map<string, number> // playerId -> balance
  ): { success: boolean; gameId?: string; escrowIds?: string[]; error?: string } {
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby) return { success: false, error: 'Lobby not found' }

    if (lobby.players.length < 2) {
      return { success: false, error: 'Not enough players' }
    }

    // Validar que todos los jugadores tengan suficiente balance
    const escrowIds: string[] = []
    for (const player of lobby.players) {
      const balance = playerBalances.get(player.id) || 0
      if (balance < lobby.betAmount) {
        return {
          success: false,
          error: `Jugador ${player.id} no tiene suficiente balance para la apuesta`,
        }
      }

      // Crear escrow para cada jugador
      try {
        const escrow = gameEscrowService.createEscrow(
          `game_${Date.now()}`,
          player.id,
          lobby.betAmount
        )
        escrowIds.push(escrow.id)
      } catch (err) {
        return {
          success: false,
          error: `Error creando escrow: ${(err as Error).message}`,
        }
      }
    }

    // Crear el juego
    const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const engine = new GameEngine(gameId, lobby.players, lobby.betAmount, lobby.currency, lobby.network)

    this.games.set(gameId, engine)
    
    // Update lobby status to started (NO borrar el lobby, lo mantenemos para referencia)
    lobby.status = 'started'
    lobby.gameId = gameId

    console.log(
      `🎮 Juego iniciado con escrow - GameID: ${gameId}, Jugadores: ${lobby.players.length}`
    )

    return { success: true, gameId, escrowIds }
  }

  /**
   * Start a game from a lobby (sin escrow, para compatibilidad)
   */
  startGame(lobbyId: string): { success: boolean; gameId?: string; error?: string } {
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby) return { success: false, error: 'Lobby not found' }

    if (lobby.players.length < 2) {
      return { success: false, error: 'Not enough players' }
    }

    const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const engine = new GameEngine(gameId, lobby.players, lobby.betAmount, lobby.currency, lobby.network)

    this.games.set(gameId, engine)
    
    // Update lobby status to started (NO borrar el lobby, lo mantenemos para referencia)
    lobby.status = 'started'
    lobby.gameId = gameId

    return { success: true, gameId }
  }

  /**
   * Cancel a lobby (only creator can cancel, only when waiting)
   */
  cancelLobby(lobbyId: string, requesterId: string): { success: boolean; error?: string } {
    const lobby = this.lobbies.get(lobbyId)
    if (!lobby) return { success: false, error: 'Lobby not found' }

    // Only creator can cancel
    if (lobby.creatorId !== requesterId) {
      return { success: false, error: 'Only the lobby creator can cancel' }
    }

    // Remove the lobby
    this.lobbies.delete(lobbyId)
    return { success: true }
  }

  /**
   * Get game state
   */
  getGameState(gameId: string): GameState | null {
    const engine = this.games.get(gameId)
    return engine ? engine.getState() : null
  }

  /**
   * Get game engine (for internal operations like timeout checking)
   */
  getGameEngine(gameId: string): any {
    return this.games.get(gameId) || null
  }

  /**
   * Play a card in game
   */
  playCard(gameId: string, playerIndex: number, cardId: string, chosenColor?: any) {
    const engine = this.games.get(gameId)
    if (!engine) return { valid: false, error: 'Game not found' }

    return engine.playCard(playerIndex, cardId, chosenColor)
  }

  /**
   * Draw a card in game
   */
  drawCard(gameId: string, playerIndex: number) {
    const engine = this.games.get(gameId)
    if (!engine) return { valid: false, error: 'Game not found' }

    return engine.drawCard(playerIndex)
  }

  /**
   * Call UNO
   */
  callUno(gameId: string, playerIndex: number) {
    const engine = this.games.get(gameId)
    if (!engine) return { valid: false, error: 'Game not found' }

    return engine.callUno(playerIndex)
  }

  /**
   * Choose color for WILD or WILD_DRAW_FOUR
   */
  chooseColor(gameId: string, playerIndex: number, color: string) {
    const engine = this.games.get(gameId)
    if (!engine) return { valid: false, error: 'Game not found' }

    // Validate color is valid
    const validColors = ['RED', 'BLUE', 'GREEN', 'YELLOW']
    if (!validColors.includes(color)) {
      return { valid: false, error: 'Invalid color' }
    }

    return engine.chooseColor(playerIndex, color as any)
  }

  /**
   * List all lobbies (public and private) - excluding finished games
   */
  getAllLobbies(): LobbyData[] {
    return Array.from(this.lobbies.values()).filter((l) => l.status !== 'finished' && l.status !== 'cancelled')
  }

  /**
   * List all public lobbies - excluding finished games
   */
  getPublicLobbies(): LobbyData[] {
    return Array.from(this.lobbies.values()).filter((l) => l.isPublic && l.status !== 'finished' && l.status !== 'cancelled')
  }

  /**
   * List all private lobbies - excluding finished games
   */
  getPrivateLobbies(): LobbyData[] {
    return Array.from(this.lobbies.values()).filter((l) => !l.isPublic && l.status !== 'finished' && l.status !== 'cancelled')
  }

  /**
   * List all free lobbies (betAmount === 0) - excluding finished games
   */
  getFreeLobbies(): LobbyData[] {
    return Array.from(this.lobbies.values()).filter((l) => l.betAmount === 0 && l.status !== 'finished')
  }

  /**
   * List all paid lobbies (betAmount > 0)
   */
  getPaidLobbies(): LobbyData[] {
    return Array.from(this.lobbies.values()).filter((l) => l.betAmount > 0)
  }

  /**
   * Get leaderboard (top N by total wins + points)
   */
  getLeaderboard(limit: number = 50) {
    // This would typically come from UserService
    return []
  }

  /**
   * Finish a game and distribute pot to winners
   * Releases escrow to winners and returns to losers
   */
  finishGameWithEscrow(
    gameId: string,
    winnerId: string,
    allPlayerIds: string[]
  ): { success: boolean; distribution?: any; error?: string } {
    const engine = this.games.get(gameId)
    if (!engine) return { success: false, error: 'Game not found' }

    try {
      // Obtener información del juego
      const gameState = engine.getState()
      const betAmount = gameState.bet || 0
      const totalPot = gameState.pot || betAmount * allPlayerIds.length

      // Calcular premios
      const winners = [
        {
          userId: winnerId,
          prizeAmount: totalPot, // Winner gets entire pot
        },
      ]

      // Distribuir pot
      const distribution = gameEscrowService.distributePot(gameId, winners)

      // Marcar el lobby como 'finished' en lugar de solo remover el juego
      this.markLobbyAsFinished(gameId)

      // Remover juego
      this.games.delete(gameId)

      console.log(
        `✅ Juego finalizado con distribución de escrow - GameID: ${gameId}, Ganador: ${winnerId}`
      )

      return { success: true, distribution }
    } catch (err) {
      return { success: false, error: `Error finishing game: ${(err as Error).message}` }
    }
  }

  /**
   * Mark lobby as finished when game ends
   */
  private markLobbyAsFinished(gameId: string): void {
    for (const [lobbyId, lobby] of this.lobbies.entries()) {
      if (lobby.gameId === gameId) {
        lobby.status = 'finished'
        console.log(`🏁 Lobby ${lobbyId} marcado como terminado`)
        break
      }
    }
  }

  /**
   * Public method to force mark lobby as finished (when escrow fails)
   */
  forceMarkLobbyAsFinished(gameId: string): void {
    this.markLobbyAsFinished(gameId)
    // Also delete the game from memory
    this.games.delete(gameId)
  }

  /**
   * Cancel a game and return all escrow
   */
  cancelGameWithEscrow(gameId: string): { success: boolean; returned?: any; error?: string } {
    const engine = this.games.get(gameId)
    if (!engine) return { success: false, error: 'Game not found' }

    try {
      const result = gameEscrowService.cancelGame(gameId)
      this.games.delete(gameId)

      console.log(`❌ Juego cancelado - GameID: ${gameId}`)

      return { success: true, returned: result }
    } catch (err) {
      return { success: false, error: `Error cancelling game: ${(err as Error).message}` }
    }
  }

  /**
   * Get lobby details
   */
  getLobby(lobbyId: string): LobbyData | null {
    return this.lobbies.get(lobbyId) || null
  }
}
