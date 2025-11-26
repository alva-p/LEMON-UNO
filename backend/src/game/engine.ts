import { Card, CardColor, CardType, GameState, GamePhase, Player, createDeck, shuffle, drawCards, canPlayCard, canPlayWildDrawFour, getPlayableCards } from './cards'

export { Card, CardColor, CardType, GameState, GamePhase, Player, createDeck, shuffle, drawCards, canPlayCard, canPlayWildDrawFour, getPlayableCards }

export class GameEngine {
  private state: GameState

  constructor(gameId: string, players: Player[], betAmount: number) {
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
      pot: betAmount * players.length,
      pendingDrawCount: 0,
      cardPlayedThisTurn: false,
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
      case CardType.DRAW_TWO:
        // First player draws 2 and is skipped
        {
          const nextIdx = this.getNextPlayerIndex()
          const nextPlayer = this.state.players[nextIdx]
          const { cards, newDeck } = drawCards(this.state.deck, this.state.discardPile, 2)
          this.state.deck = newDeck
          nextPlayer.hand.push(...cards)
          this.skipNextPlayer()
        }
        break
      case CardType.SKIP:
        this.skipNextPlayer()
        break
      case CardType.REVERSE:
        this.state.direction = this.state.direction === 1 ? -1 : 1
        break
      case CardType.WILD:
      case CardType.WILD_DRAW_FOUR:
        // Should not reach here due to reshuffle above, but just in case:
        // No special action for WILD or +4 at game start
        break
    }
  }

  getState(): GameState {
    return this.state
  }

  playCard(playerIndex: number, cardId: string, chosenColor?: CardColor): { valid: boolean; error?: string } {
    const player = this.state.players[playerIndex]
    if (!player) return { valid: false, error: 'Invalid player' }

    if (this.state.currentPlayerIndex !== playerIndex) {
      return { valid: false, error: 'Not your turn' }
    }

    const cardIndex = player.hand.findIndex((c) => c.id === cardId)
    if (cardIndex === -1) return { valid: false, error: 'Card not in hand' }

    const card = player.hand[cardIndex]
    const topCard = this.state.discardPile[this.state.discardPile.length - 1]

    // If there's a pending draw accumulation, only +2 and +4 of the same type can be played
    if (this.state.pendingDrawCount > 0) {
      if (this.state.pendingDrawType === 'DRAW_TWO' && card.type !== CardType.DRAW_TWO) {
        return { valid: false, error: 'Must play +2 to continue accumulation, or draw accumulated cards' }
      }
      if (this.state.pendingDrawType === 'WILD_DRAW_FOUR' && card.type !== CardType.WILD_DRAW_FOUR) {
        return { valid: false, error: 'Must play +4 to continue accumulation, or draw accumulated cards' }
      }
    } else {
      // Normal mode: check if already played a card this turn
      if (this.state.cardPlayedThisTurn) {
        return { valid: false, error: 'You already played a card this turn. Draw a card or pass.' }
      }

      // Check if move is legal
      if (!canPlayCard(card, topCard, this.state.currentWildColor)) {
        return { valid: false, error: 'Invalid play' }
      }

      // Check WILD_DRAW_FOUR legality
      if (card.type === CardType.WILD_DRAW_FOUR && !canPlayWildDrawFour(player.hand, topCard)) {
        return { valid: false, error: 'Cannot play WILD_DRAW_FOUR: you have a matching color' }
      }
    }

    // Remove card from hand
    player.hand.splice(cardIndex, 1)
    this.state.discardPile.push(card)
    player.hasCalledUno = false

    // For WILD and WILD_DRAW_FOUR, color selection is required
    if (card.type === CardType.WILD || card.type === CardType.WILD_DRAW_FOUR) {
      if (!chosenColor) {
        // Put card back in hand if no color chosen
        player.hand.push(card)
        this.state.discardPile.pop()
        return { valid: false, error: 'Color selection is required for WILD cards' }
      }
    }

    this.state.currentWildColor = undefined

    // Check UNO (1 card left) - REMOVED as per user request
    // if (player.hand.length === 1) {
    //   player.hasCalledUno = true
    // }

    // Check win
    if (player.hand.length === 0) {
      this.state.phase = GamePhase.FINISHED
      this.state.finishedAt = new Date()
      this.state.winner = player.id
      return { valid: true }
    }

    // Mark that a card was played this turn (unless it's during accumulation)
    if (this.state.pendingDrawCount === 0) {
      this.state.cardPlayedThisTurn = true
    }

    // Handle card effect
    this.handleCardEffect(card, chosenColor)

    return { valid: true }
  }

  drawCard(playerIndex: number): { valid: boolean; error?: string; drawnCard?: Card } {
    const player = this.state.players[playerIndex]
    if (!player) return { valid: false, error: 'Invalid player' }

    if (this.state.currentPlayerIndex !== playerIndex) {
      return { valid: false, error: 'Not your turn' }
    }

    // If there's a pending draw accumulation, draw all accumulated cards
    const cardsToDrawCount = this.state.pendingDrawCount > 0 ? this.state.pendingDrawCount : 1
    const { cards, newDeck } = drawCards(this.state.deck, this.state.discardPile, cardsToDrawCount)
    this.state.deck = newDeck

    cards.forEach((card) => {
      player.hand.push(card)
    })

    // If there was an accumulation pending, reset it and advance turn
    if (this.state.pendingDrawCount > 0) {
      this.state.pendingDrawCount = 0
      this.state.pendingDrawType = undefined
      this.advanceToNextPlayer()
    } else if (cardsToDrawCount === 1) {
      // If we drew only 1 card, check if it's playable
      const drawnCard = cards[0]
      const topCard = this.state.discardPile[this.state.discardPile.length - 1]
      const isPlayable = canPlayCard(drawnCard, topCard, this.state.currentWildColor)
      
      if (!isPlayable) {
        // Auto-pass turn - card is not playable
        this.advanceToNextPlayer()
      } else {
        // Card is playable - reset flag so player can play it
        // but keep the same turn active
        this.state.cardPlayedThisTurn = false
      }
      
      return { valid: true, drawnCard }
    }

    return { valid: true }
  }

  private handleCardEffect(card: Card, chosenColor?: CardColor): void {
    switch (card.type) {
      case CardType.NUMBER:
        // Normal number card - just advance turn
        this.advanceToNextPlayer()
        break

      case CardType.SKIP:
        // Skip next player - advance 2 positions (skip 1, normal 1)
        this.advanceToNextPlayer() // Skip the next player
        this.advanceToNextPlayer() // Advance to the actual next player's turn
        break

      case CardType.REVERSE:
        // Change direction
        this.state.direction = this.state.direction === 1 ? -1 : 1
        
        if (this.state.players.length === 2) {
          // In 2-player, REVERSE is like SKIP - advance 2 positions
          this.advanceToNextPlayer() // Skip the next player
          this.advanceToNextPlayer() // Back to same player
        } else {
          // In 3+ player, just reverse direction and advance 1 position in new direction
          this.advanceToNextPlayer()
        }
        break

      case CardType.DRAW_TWO:
        // Set up accumulation
        // Next player will either play another +2/+4 of SAME TYPE or draw all accumulated cards
        this.state.pendingDrawCount = (this.state.pendingDrawCount || 0) + 2
        this.state.pendingDrawType = 'DRAW_TWO'
        // YES, advance turn to next player so they can decide
        this.advanceToNextPlayer()
        break

      case CardType.WILD:
        // WILD requires color selection - color is provided in playCard()
        if (chosenColor) {
          this.state.currentWildColor = chosenColor
        }
        // Advance turn to next player
        this.advanceToNextPlayer()
        break

      case CardType.WILD_DRAW_FOUR:
        // WILD_DRAW_FOUR requires color selection AND sets up accumulation
        this.state.pendingDrawCount = (this.state.pendingDrawCount || 0) + 4
        this.state.pendingDrawType = 'WILD_DRAW_FOUR'
        if (chosenColor) {
          this.state.currentWildColor = chosenColor
        }
        // Advance turn to next player
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
    this.state.cardPlayedThisTurn = false // Reset for new turn
    this.state.turnStartTime = Date.now() // Reset turn timer
  }

  chooseColor(playerIndex: number, color: CardColor): { valid: boolean; error?: string } {
    // This is called AFTER a WILD or WILD_DRAW_FOUR is played
    // It sets the color and advances the turn

    if (this.state.currentPlayerIndex !== playerIndex) {
      return { valid: false, error: 'Not your turn' }
    }

    const topCard = this.state.discardPile[this.state.discardPile.length - 1]
    if (topCard.type !== CardType.WILD && topCard.type !== CardType.WILD_DRAW_FOUR) {
      return { valid: false, error: 'Last card played was not WILD or WILD_DRAW_FOUR' }
    }

    // Set the chosen color
    this.state.currentWildColor = color

    // Advance to next player
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

  challengeUno(accuserIndex: number, targetIndex: number): { valid: boolean; error?: string } {
    const accuser = this.state.players[accuserIndex]
    const target = this.state.players[targetIndex]

    if (!accuser || !target) return { valid: false, error: 'Invalid player' }

    // If target did not call UNO when they should have, they draw 2 cards
    if (target.hand.length === 1 && !target.hasCalledUno) {
      const { cards, newDeck } = drawCards(this.state.deck, this.state.discardPile, 2)
      this.state.deck = newDeck
      target.hand.push(...cards)
      return { valid: true }
    }

    return { valid: false, error: 'Invalid challenge' }
  }

  challengeWildDrawFour(accuserIndex: number, targetIndex: number): { valid: boolean; error?: string } {
    const accuser = this.state.players[accuserIndex]
    const target = this.state.players[targetIndex]

    if (!accuser || !target) return { valid: false, error: 'Invalid player' }

    const topCard = this.state.discardPile[this.state.discardPile.length - 1]
    if (topCard.type !== CardType.WILD_DRAW_FOUR) {
      return { valid: false, error: 'Last card was not WILD_DRAW_FOUR' }
    }

    // Check if target legally could play WILD_DRAW_FOUR
    // (they should not have a card matching top card's color)
    const wasLegal = canPlayWildDrawFour(target.hand, topCard)

    if (wasLegal) {
      // Accuser was wrong, they draw 6
      const { cards, newDeck } = drawCards(this.state.deck, this.state.discardPile, 6)
      this.state.deck = newDeck
      accuser.hand.push(...cards)
    } else {
      // Target played illegally, they draw 4
      const { cards, newDeck } = drawCards(this.state.deck, this.state.discardPile, 4)
      this.state.deck = newDeck
      target.hand.push(...cards)
    }

    return { valid: true }
  }

  /**
   * Check if current turn has exceeded 15 seconds
   * If so, automatically draw a card and advance turn
   */
  checkTurnTimeout(): { timedOut: boolean } {
    const TURN_TIMEOUT_MS = 15000 // 15 seconds

    const currentTime = Date.now()
    const timeSinceStart = currentTime - this.state.turnStartTime
    
    if (timeSinceStart > TURN_TIMEOUT_MS) {
      // Force draw a card for current player
      const result = this.drawCard(this.state.currentPlayerIndex)
      if (result.valid) {
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
