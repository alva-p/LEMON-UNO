import {
  Card,
  CardColor,
  CardType,
  GameState,
  GamePhase,
  Player,
  createDeck,
  shuffle,
  drawCards,
  canPlayCard,
  canPlayWildDrawFour,
  getPlayableCards,
} from './cards'

import { saveMatchResult } from '../matchStats' // path correcto desde src/game/engine.ts

export {
  Card,
  CardColor,
  CardType,
  GameState,
  GamePhase,
  Player,
  createDeck,
  shuffle,
  drawCards,
  canPlayCard,
  canPlayWildDrawFour,
  getPlayableCards,
}

export class GameEngine {
  private state: GameState

  constructor(
    gameId: string,
    players: Player[],
    betAmount: number,
    currency: 'ARS' | 'ETH' | 'USDT' | 'USDC' = 'ARS',
    network?: 'ETH' | 'BASE',
  ) {
    const deck = shuffle(createDeck())

    // Deal 7 cards to each player
    const playerHands: Card[] = []
    for (let i = 0; i < players.length; i++) {
      playerHands.push(...deck.splice(0, 7))
    }
    for (let i = 0; i < players.length; i++) {
      players[i].hand = playerHands.slice(i * 7, (i + 1) * 7)
    }

    // Start discard pile with first card from deck
    let firstCard = deck.pop()!
    const discardPile: Card[] = [firstCard]

    this.state = {
      id: gameId,
      phase: GamePhase.IN_PROGRESS,
      players,
      currentPlayerIndex: 0,
      direction: 1,
      deck,
      discardPile,
      createdAt: new Date(),
      startedAt: new Date(),
      bet: betAmount,
      currency,
      network,
      pot: betAmount * players.length,
      pendingDrawCount: 0,
      pendingDrawType: undefined,
      cardPlayedThisTurn: false,
      hasDrawnThisTurn: false,
      turnStartTime: Date.now(),
    }

    // Handle initial action card
    this.handleInitialCard()
  }

  private handleInitialCard(): void {
    let topCard = this.state.discardPile[this.state.discardPile.length - 1]

    // If initial card is WILD or +4, reshuffle and pick a different one
    let count = 0
    while (
      (topCard.type === CardType.WILD || topCard.type === CardType.WILD_DRAW_FOUR) &&
      count < 10
    ) {
      this.state.discardPile.pop()
      this.state.deck.push(topCard)
      this.state.deck = shuffle(this.state.deck)
      const newCard = this.state.deck.pop()!
      this.state.discardPile.push(newCard)
      topCard = newCard
      count++
    }

    // Now handle the actual card that's on top
    switch (topCard.type) {
      case CardType.DRAW_TWO: {
        // First player draws 2 and is skipped
        const nextIdx = this.getNextPlayerIndex()
        const nextPlayer = this.state.players[nextIdx]
        const { cards, newDeck } = drawCards(this.state.deck, this.state.discardPile, 2)
        this.state.deck = newDeck
        nextPlayer.hand.push(...cards)
        this.skipNextPlayer()
        break
      }
      case CardType.SKIP:
        this.skipNextPlayer()
        break
      case CardType.REVERSE:
        this.state.direction = this.state.direction === 1 ? -1 : 1
        break
      case CardType.WILD:
      case CardType.WILD_DRAW_FOUR:
        // No special action at game start (ya los evitamos arriba)
        break
    }
  }

  getState(): GameState {
    return this.state
  }

  playCard(
    playerIndex: number,
    cardId: string,
    chosenColor?: CardColor,
  ): { valid: boolean; error?: string } {
    const player = this.state.players[playerIndex]
    if (!player) return { valid: false, error: 'Invalid player' }

    if (this.state.currentPlayerIndex !== playerIndex) {
      return { valid: false, error: 'Not your turn' }
    }

    const cardIndex = player.hand.findIndex((c) => c.id === cardId)
    if (cardIndex === -1) return { valid: false, error: 'Card not in hand' }

    const card = player.hand[cardIndex]
    const topCard = this.state.discardPile[this.state.discardPile.length - 1]

    // ========== MODO ACUMULACIÓN ==========
    // Si hay acumulación pendiente, solo se puede apilar el mismo tipo de castigo.
    if (this.state.pendingDrawCount > 0) {
      if (this.state.pendingDrawType === 'DRAW_TWO' && card.type !== CardType.DRAW_TWO) {
        return {
          valid: false,
          error: 'Must play +2 to continue accumulation, or draw accumulated cards',
        }
      }
      if (
        this.state.pendingDrawType === 'WILD_DRAW_FOUR' &&
        card.type !== CardType.WILD_DRAW_FOUR
      ) {
        return {
          valid: false,
          error: 'Must play +4 to continue accumulation, or draw accumulated cards',
        }
      }
      // En este modo no checamos color, solo tipo de castigo (+2/+4).
    } else {
      // ========== MODO NORMAL (SIN ACUMULACIÓN) ==========

      // Solo 1 carta jugada por turno en modo normal
      if (this.state.cardPlayedThisTurn) {
        return {
          valid: false,
          error: 'You already played a card this turn. Draw a card or pass.',
        }
      }

      // Reglas estándar de UNO: color / número / símbolo / wild
      if (!canPlayCard(card, topCard, this.state.currentWildColor)) {
        return { valid: false, error: 'Invalid play' }
      }

      // Validación adicional para +4: solo si es legal según helper
      if (
        card.type === CardType.WILD_DRAW_FOUR &&
        !canPlayWildDrawFour(player.hand, topCard)
      ) {
        return {
          valid: false,
          error: 'Cannot play WILD_DRAW_FOUR: you have a matching color',
        }
      }

      /**
       * IMPORTANTE:
       * Ya NO tenemos la regla que prohibía jugar WILD o WILD_DRAW_FOUR
       * sobre un DRAW_TWO cuando no hay acumulación pendiente.
       *
       * Resultado:
       *  - Si la carta de arriba es +2 azul y pendingDrawCount === 0:
       *      ✅ Se puede jugar cualquier carta azul válida (número, SKIP, REVERSE, +2, etc.)
       *      ✅ Se puede jugar un +4 válido.
       */
    }

    // Remove card from hand
    player.hand.splice(cardIndex, 1)
    this.state.discardPile.push(card)
    player.hasCalledUno = false

    // Para WILD y WILD_DRAW_FOUR, se exige elegir color
    if (card.type === CardType.WILD || card.type === CardType.WILD_DRAW_FOUR) {
      if (!chosenColor) {
        // Si no elige color, revertimos la jugada
        player.hand.push(card)
        this.state.discardPile.pop()
        return { valid: false, error: 'Color selection is required for WILD cards' }
      }
    }

    // Al jugar cualquier carta, se resetea el color previo del wild;
    // handleCardEffect seteará el nuevo si corresponde.
    this.state.currentWildColor = undefined

    // ===== WIN CHECK =====
    if (player.hand.length === 0) {
      this.state.phase = GamePhase.FINISHED
      const finishedAt = new Date()
      this.state.finishedAt = finishedAt
      this.state.winner = player.id

      // Guardar resultado de la partida en la base (fire-and-forget)
      saveMatchResult({
        gameId: this.state.id, // en la DB está como UUID; más adelante podemos mapearlo
        winnerWallet: player.id,
        pot: this.state.pot,
        betAmount: this.state.bet,
        currency: this.state.currency,
        network: this.state.network,
        players: this.state.players.map((p) => p.id),
        createdAt: this.state.createdAt,
        startedAt: this.state.startedAt,
        finishedAt,
      })
        .then(() => {
          console.log('[DB] Game result saved OK', {
            gameId: this.state.id,
            winner: player.id,
          })
        })
        .catch((err) => {
          console.error('[DB] Failed to save game result:', err)
        })

      return { valid: true }
    }

    // Marcar que ya jugó una carta en este turno (solo si no hay acumulación)
    if (this.state.pendingDrawCount === 0) {
      this.state.cardPlayedThisTurn = true
    }

    // Aplicar efecto de la carta
    this.handleCardEffect(card, chosenColor)

    return { valid: true }
  }

  drawCard(playerIndex: number): {
    valid: boolean
    error?: string
    drawnCard?: Card
  } {
    const player = this.state.players[playerIndex]
    if (!player) return { valid: false, error: 'Invalid player' }

    if (this.state.currentPlayerIndex !== playerIndex) {
      return { valid: false, error: 'Not your turn' }
    }

    // Regla: solo se puede robar 1 carta por turno si NO hay acumulación
    if (this.state.pendingDrawCount === 0 && this.state.hasDrawnThisTurn) {
      return { valid: false, error: 'You already drew a card this turn' }
    }

    // Si hay acumulación, se roba TODO lo pendiente; si no, se roba 1
    const cardsToDrawCount =
      this.state.pendingDrawCount > 0 ? this.state.pendingDrawCount : 1

    const { cards, newDeck } = drawCards(
      this.state.deck,
      this.state.discardPile,
      cardsToDrawCount,
    )
    this.state.deck = newDeck

    cards.forEach((card) => {
      player.hand.push(card)
    })

    // CASO 1: había acumulación (+2 / +4 apilados) → roba todo y pasa turno sí o sí
    if (this.state.pendingDrawCount > 0) {
      this.state.pendingDrawCount = 0
      this.state.pendingDrawType = undefined
      this.advanceToNextPlayer()
      return { valid: true }
    }

    // CASO 2: se robó 1 sola carta “normal”
    // El jugador puede:
    //   - Jugar esta carta (si es jugable)
    //   - Jugar otra carta de la mano
    //   - O usar "Pasar turno" (passTurn)
    this.state.hasDrawnThisTurn = true
    const drawnCard = cards[0]

    return { valid: true, drawnCard }
  }

  private handleCardEffect(card: Card, chosenColor?: CardColor): void {
    switch (card.type) {
      case CardType.NUMBER:
        this.advanceToNextPlayer()
        break

      case CardType.SKIP:
        // Skip next player - advance 2 positions
        this.advanceToNextPlayer()
        this.advanceToNextPlayer()
        break

      case CardType.REVERSE:
        // Change direction
        this.state.direction = this.state.direction === 1 ? -1 : 1

        if (this.state.players.length === 2) {
          // In 2-player, REVERSE is like SKIP
          this.advanceToNextPlayer()
          this.advanceToNextPlayer()
        } else {
          this.advanceToNextPlayer()
        }
        break

      case CardType.DRAW_TWO:
        this.state.pendingDrawCount = (this.state.pendingDrawCount || 0) + 2
        this.state.pendingDrawType = 'DRAW_TWO'
        this.advanceToNextPlayer()
        break

      case CardType.WILD:
        if (chosenColor) {
          this.state.currentWildColor = chosenColor
        }
        this.advanceToNextPlayer()
        break

      case CardType.WILD_DRAW_FOUR:
        this.state.pendingDrawCount = (this.state.pendingDrawCount || 0) + 4
        this.state.pendingDrawType = 'WILD_DRAW_FOUR'
        if (chosenColor) {
          this.state.currentWildColor = chosenColor
        }
        this.advanceToNextPlayer()
        break
    }
  }

  private getNextPlayerIndex(): number {
    const len = this.state.players.length
    return (this.state.currentPlayerIndex + this.state.direction + len) % len
  }

  private skipNextPlayer(): void {
    this.state.currentPlayerIndex = this.getNextPlayerIndex()
  }

  private advanceToNextPlayer(): void {
    this.state.currentPlayerIndex = this.getNextPlayerIndex()
    this.state.cardPlayedThisTurn = false
    this.state.hasDrawnThisTurn = false
    this.state.turnStartTime = Date.now()
  }

  /**
   * Nuevo: Pasar turno
   * Solo es válido si:
   * - Es tu turno
   * - Ya robaste una carta (hasDrawnThisTurn = true)
   * - No jugaste ninguna carta aún (cardPlayedThisTurn = false)
   */
  passTurn(playerIndex: number): { valid: boolean; error?: string } {
    if (this.state.currentPlayerIndex !== playerIndex) {
      return { valid: false, error: 'Not your turn' }
    }

    if (!this.state.hasDrawnThisTurn) {
      return {
        valid: false,
        error: 'You must draw a card before passing your turn',
      }
    }

    if (this.state.cardPlayedThisTurn) {
      return {
        valid: false,
        error: 'You already played a card this turn',
      }
    }

    // Pasar turno sin jugar carta
    this.advanceToNextPlayer()
    return { valid: true }
  }

  chooseColor(playerIndex: number, color: CardColor): { valid: boolean; error?: string } {
    if (this.state.currentPlayerIndex !== playerIndex) {
      return { valid: false, error: 'Not your turn' }
    }

    const topCard = this.state.discardPile[this.state.discardPile.length - 1]
    if (topCard.type !== CardType.WILD && topCard.type !== CardType.WILD_DRAW_FOUR) {
      return { valid: false, error: 'Last card played was not WILD or WILD_DRAW_FOUR' }
    }

    this.state.currentWildColor = color
    this.advanceToNextPlayer()
    return { valid: true }
  }

  callUno(playerIndex: number): { valid: boolean; error?: string } {
    const player = this.state.players[playerIndex]
    if (!player) return { valid: false, error: 'Invalid player' }

    if (player.hand.length !== 1) {
      return { valid: false, error: 'You must have exactly 1 card to call UNO' }
    }

    player.hasCalledUno = true
    return { valid: true }
  }

  challengeUno(
    accuserIndex: number,
    targetIndex: number,
  ): {
    valid: boolean
    error?: string
  } {
    const accuser = this.state.players[accuserIndex]
    const target = this.state.players[targetIndex]

    if (!accuser || !target) return { valid: false, error: 'Invalid player' }

    if (target.hand.length === 1 && !target.hasCalledUno) {
      const { cards, newDeck } = drawCards(this.state.deck, this.state.discardPile, 2)
      this.state.deck = newDeck
      target.hand.push(...cards)
      return { valid: true }
    }

    return { valid: false, error: 'Invalid challenge' }
  }

  challengeWildDrawFour(
    accuserIndex: number,
    targetIndex: number,
  ): { valid: boolean; error?: string; challengeResult?: 'success' | 'failed' } {
    const accuser = this.state.players[accuserIndex]
    const target = this.state.players[targetIndex]

    if (!accuser || !target) return { valid: false, error: 'Invalid player' }

    const topCard = this.state.discardPile[this.state.discardPile.length - 1]
    if (topCard.type !== CardType.WILD_DRAW_FOUR) {
      return { valid: false, error: 'Last card was not WILD_DRAW_FOUR' }
    }

    // Usar la carta que estaba ANTES del +4 para chequear si fue legal
    const previousTopCard = this.state.discardPile[this.state.discardPile.length - 2]
    const wasLegal = previousTopCard
      ? canPlayWildDrawFour(target.hand, previousTopCard)
      : true

    // Limpiar pendingDraw — la resolución del challenge lo reemplaza
    this.state.pendingDrawCount = 0
    this.state.pendingDrawType = undefined

    if (wasLegal) {
      // Desafío fallido: el +4 era legal → el acusador roba 6 y pierde su turno
      const { cards, newDeck } = drawCards(this.state.deck, this.state.discardPile, 6)
      this.state.deck = newDeck
      accuser.hand.push(...cards)
      this.advanceToNextPlayer()
      return { valid: true, challengeResult: 'failed' }
    } else {
      // Desafío exitoso: el +4 era ilegal → el que jugó (+4) roba 4; acusador continúa su turno
      const { cards, newDeck } = drawCards(this.state.deck, this.state.discardPile, 4)
      this.state.deck = newDeck
      target.hand.push(...cards)
      return { valid: true, challengeResult: 'success' }
    }
  }

  /**
   * Check if current turn has exceeded 15 seconds
   * If so, automatically draw or pass respecting "1 draw per turn"
   */
  checkTurnTimeout(): { timedOut: boolean } {
    const TURN_TIMEOUT_MS = 15000
    const currentTime = Date.now()
    const timeSinceStart = currentTime - this.state.turnStartTime

    if (timeSinceStart > TURN_TIMEOUT_MS) {
      const currentPlayer = this.state.currentPlayerIndex

      // Si hay acumulación, mantiene comportamiento: roba todo y pasa
      if (this.state.pendingDrawCount > 0) {
        const result = this.drawCard(currentPlayer)
        if (result.valid) return { timedOut: true }
        return { timedOut: false }
      }

      // Sin acumulación:
      if (!this.state.hasDrawnThisTurn) {
        // Aún no robó → le robamos 1 carta
        const result = this.drawCard(currentPlayer)
        if (result.valid) return { timedOut: true }
      } else {
        // Ya robó y se quedó sin jugar → solo pasamos el turno
        this.advanceToNextPlayer()
        return { timedOut: true }
      }
    }

    return { timedOut: false }
  }

  /**
   * Get time remaining for current turn (in milliseconds)
   * Returns 0 if time is up
   */
  getTimeRemainingMs(): number {
    const TURN_TIMEOUT_MS = 15000
    const currentTime = Date.now()
    const timeSinceStart = currentTime - this.state.turnStartTime
    const timeRemaining = TURN_TIMEOUT_MS - timeSinceStart
    return Math.max(0, timeRemaining)
  }
}
