import WebSocket from 'ws'
import { GameService } from '../services/GameService'

/**
 * WebSocket message types
 */
export enum WSMessageType {
  JOIN_GAME = 'JOIN_GAME',
  PLAY_CARD = 'PLAY_CARD',
  DRAW_CARD = 'DRAW_CARD',
  CHOOSE_COLOR = 'CHOOSE_COLOR',
  CALL_UNO = 'CALL_UNO',
  CHALLENGE_UNO = 'CHALLENGE_UNO',
  CHALLENGE_WILD_DRAW_FOUR = 'CHALLENGE_WILD_DRAW_FOUR',
  LEAVE_GAME = 'LEAVE_GAME',
  GAME_STATE = 'GAME_STATE',
  ERROR = 'ERROR',
}

export interface WSMessage {
  type: WSMessageType
  gameId?: string
  playerIndex?: number
  payload?: any
}

/**
 * WebSocket connection handler for a game room
 */
export class GameWebSocketHandler {
  private gameService: GameService
  private gameId: string
  private clients: Map<number, WebSocket> = new Map() // playerIndex -> WebSocket

  constructor(gameService: GameService, gameId: string) {
    this.gameService = gameService
    this.gameId = gameId
  }

  /**
   * Register a player's WebSocket connection
   */
  addClient(playerIndex: number, ws: WebSocket): void {
    this.clients.set(playerIndex, ws)

    // Send current game state to new client
    const gameState = this.gameService.getGameState(this.gameId)
    if (gameState && gameState.discardPile.length > 0) {
      // Import getPlayableCards to calculate playable cards
      const { getPlayableCards } = require('../game/cards')

      // Add playable cards to the game state
      const currentPlayer = gameState.players[gameState.currentPlayerIndex]
      const topCard = gameState.discardPile[gameState.discardPile.length - 1]
      const playableCardIds = topCard && currentPlayer
        ? getPlayableCards(currentPlayer.hand, topCard, gameState.currentWildColor, gameState.pendingDrawCount, gameState.pendingDrawType) 
        : []

      this.sendToClient(playerIndex, {
        type: WSMessageType.GAME_STATE,
        gameId: this.gameId,
        payload: {
          ...gameState,
          playableCardIds,
        },
      })
    }

    // Broadcast updated state to all
    this.broadcastGameState()
  }

  /**
   * Handle incoming message from a player
   */
  handleMessage(playerIndex: number, message: WSMessage): void {
    switch (message.type) {
      case WSMessageType.PLAY_CARD:
        this.handlePlayCard(playerIndex, message.payload)
        break
      case WSMessageType.DRAW_CARD:
        this.handleDrawCard(playerIndex)
        break
      case WSMessageType.CHOOSE_COLOR:
        this.handleChooseColor(playerIndex, message.payload)
        break
      case WSMessageType.CALL_UNO:
        this.handleCallUno(playerIndex)
        break
      case WSMessageType.CHALLENGE_UNO:
        this.handleChallengeUno(playerIndex, message.payload)
        break
      case WSMessageType.CHALLENGE_WILD_DRAW_FOUR:
        this.handleChallengeWildDrawFour(playerIndex, message.payload)
        break
      default:
        this.sendError(playerIndex, 'Unknown message type')
    }
  }

  /**
   * Handle PLAY_CARD message
   */
  private handlePlayCard(playerIndex: number, payload: { cardId: string; chosenColor?: string }): void {
    const result = this.gameService.playCard(this.gameId, playerIndex, payload.cardId, payload.chosenColor)

    if (!result.valid) {
      this.sendError(playerIndex, result.error || 'Invalid move')
      return
    }

    this.broadcastGameState()
  }

  /**
   * Handle DRAW_CARD message
   */
  private handleDrawCard(playerIndex: number): void {
    const result = this.gameService.drawCard(this.gameId, playerIndex)

    if (!result.valid) {
      this.sendError(playerIndex, result.error || 'Cannot draw card')
      return
    }

    this.broadcastGameState()
  }

  /**
   * Handle CHOOSE_COLOR message
   * Used when WILD or WILD_DRAW_FOUR is played and color needs to be selected
   */
  private handleChooseColor(playerIndex: number, payload: { color: string }): void {
    const result = this.gameService.chooseColor(this.gameId, playerIndex, payload.color)

    if (!result.valid) {
      this.sendError(playerIndex, result.error || 'Cannot choose color')
      return
    }

    this.broadcastGameState()
  }

  /**
   * Handle CALL_UNO message
   */
  private handleCallUno(playerIndex: number): void {
    const result = this.gameService.callUno(this.gameId, playerIndex)

    if (!result.valid) {
      this.sendError(playerIndex, result.error || 'Cannot call UNO')
      return
    }

    this.broadcastGameState()
  }

  /**
   * Handle CHALLENGE_UNO message
   * Acusador detectó que un jugador tiene 1 carta y no gritó UNO
   */
  private handleChallengeUno(playerIndex: number, payload: { targetIndex: number }): void {
    if (payload?.targetIndex === undefined) {
      this.sendError(playerIndex, 'targetIndex required')
      return
    }
    const result = this.gameService.challengeUno(this.gameId, playerIndex, payload.targetIndex)
    if (!result.valid) {
      this.sendError(playerIndex, result.error || 'Cannot challenge UNO')
      return
    }
    this.broadcastGameState()
  }

  /**
   * Handle CHALLENGE_WILD_DRAW_FOUR message
   * El jugador actual desafía al que acaba de jugar +4
   */
  private handleChallengeWildDrawFour(playerIndex: number, payload: { targetIndex: number }): void {
    if (payload?.targetIndex === undefined) {
      this.sendError(playerIndex, 'targetIndex required')
      return
    }
    const result = this.gameService.challengeWildDrawFour(this.gameId, playerIndex, payload.targetIndex)
    if (!result.valid) {
      this.sendError(playerIndex, result.error || 'Cannot challenge Wild Draw Four')
      return
    }
    this.broadcastGameState()
  }

  /**
   * Broadcast current game state to all connected players
   * Public so it can be called from external timer intervals
   */
  broadcastGameState(): void {
    // Make it async internally but don't change the signature to avoid changing all callers
    this.doBroadcastGameState().catch(err => console.error('Error broadcasting game state:', err))
  }

  private async doBroadcastGameState(): Promise<void> {
    const gameState = this.gameService.getGameState(this.gameId)
    if (!gameState || gameState.discardPile.length === 0) return

    // Check for turn timeout and auto-draw if needed
    const engine = this.gameService.getGameEngine(this.gameId)
    if (engine) {
      const { timedOut } = engine.checkTurnTimeout()
      if (timedOut) {
        // State was already modified by checkTurnTimeout, get updated state
        const updatedState = this.gameService.getGameState(this.gameId)
        if (updatedState) {
          await this.doBroadcastGameStateWithData(updatedState)
        }
        return
      }
    }

    await this.doBroadcastGameStateWithData(gameState)
  }

  private async doBroadcastGameStateWithData(gameState: any): Promise<void> {
    // Check if game has ended and finish it
    if (gameState.winner && !gameState.finished) {
      console.log(`🏆 Juego terminado! Ganador: ${gameState.winner}`)

      const pot = gameState.pot || gameState.bet * gameState.players.length
      const houseFee = gameState.currency === 'ARS' && pot > 0
        ? Math.floor(pot * 0.05) : 0
      gameState.houseFee = houseFee
      gameState.winnerPrize = pot - houseFee

      // Intentar finalizar con escrow primero
      const result = await this.gameService.finishGameWithEscrow(this.gameId, gameState.winner, gameState.players)
      
      if (result.success) {
        console.log('✅ Escrow distribuido y lobby marcado como terminado')
        gameState.finished = true
      } else {
        // Si falla el escrow (no existe), marcar el lobby como finished de todas formas
        console.log(`⚠️ Error en escrow (${result.error}), marcando lobby como finished de todas formas`)
        this.gameService.forceMarkLobbyAsFinished(this.gameId)
        gameState.finished = true
      }
    }

    // Import getPlayableCards to calculate playable cards
    const { getPlayableCards } = require('../game/cards')

    // Add playable cards to the game state
    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    const topCard = gameState.discardPile[gameState.discardPile.length - 1]
    const playableCardIds = topCard && currentPlayer
      ? getPlayableCards(currentPlayer.hand, topCard, gameState.currentWildColor, gameState.pendingDrawCount, gameState.pendingDrawType) 
      : []

    // Get time remaining for current turn
    const engine = this.gameService.getGameEngine(this.gameId)
    const timeRemaining = engine ? engine.getTimeRemainingMs() : 15000

    const message: WSMessage = {
      type: WSMessageType.GAME_STATE,
      gameId: this.gameId,
      payload: {
        ...gameState,
        playableCardIds, // Include playable card IDs
        timeRemaining, // Time remaining in milliseconds
      },
    }

    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message))
      }
    })
  }

  /**
   * Send message to specific client
   */
  private sendToClient(playerIndex: number, message: WSMessage): void {
    const ws = this.clients.get(playerIndex)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  /**
   * Send error to specific client
   */
  private sendError(playerIndex: number, error: string): void {
    this.sendToClient(playerIndex, {
      type: WSMessageType.ERROR,
      payload: { error },
    })
  }

  /**
   * Remove a player's connection
   */
  removeClient(playerIndex: number): void {
    this.clients.delete(playerIndex)
  }
}
