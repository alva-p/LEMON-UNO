// Card types and colors for UNO
export enum CardColor {
  RED = 'RED',
  BLUE = 'BLUE',
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
}

export enum CardType {
  // Numbers 0-9 (4 per color)
  NUMBER = 'NUMBER',
  // Action cards
  DRAW_TWO = 'DRAW_TWO',
  REVERSE = 'REVERSE',
  SKIP = 'SKIP',
  // Wild cards
  WILD = 'WILD',
  WILD_DRAW_FOUR = 'WILD_DRAW_FOUR',
}

export interface Card {
  id: string
  type: CardType
  color?: CardColor // undefined for wild cards
  number?: number // 0-9 for number cards
}

export enum GamePhase {
  WAITING_FOR_PLAYERS = 'WAITING_FOR_PLAYERS',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
}

export interface Player {
  id: string // wallet address
  name: string
  hand: Card[]
  hasCalledUno: boolean
  isChallenged: boolean // for illegal wild draw four
}

export interface GameState {
  id: string // game/room id
  phase: GamePhase
  players: Player[]
  currentPlayerIndex: number
  direction: 1 | -1 // 1 = left, -1 = right (for REVERSE)
  deck: Card[]
  discardPile: Card[]
  currentWildColor?: CardColor // set when WILD is played
  createdAt: Date
  startedAt?: Date
  finishedAt?: Date
  winner?: string
  bet: number // Monto de la apuesta
  currency: 'ARS' | 'ETH' | 'USDT' | 'USDC' // Tipo de moneda
  network?: 'ETH' | 'BASE' // Red blockchain (solo para crypto)
  pot: number // total bet * players
  pendingDrawCount: number // Cards to draw if no +2/+4 played (0 if none pending)
  pendingDrawType?: 'DRAW_TWO' | 'WILD_DRAW_FOUR' // Type of card that created pending
  cardPlayedThisTurn: boolean // Track if player already played a card this turn
  turnStartTime: number // Timestamp when current turn started (for timeout)
}

// Initialize deck with all 108 cards
export function createDeck(): Card[] {
  const deck: Card[] = []
  let id = 0

  // Number cards (0-9) for each color: 19 per color
  for (const color of Object.values(CardColor)) {
    // 0: 1 per color, 1-9: 2 per color
    deck.push({ id: `${id++}`, type: CardType.NUMBER, color, number: 0 })
    for (let num = 1; num <= 9; num++) {
      deck.push({ id: `${id++}`, type: CardType.NUMBER, color, number: num })
      deck.push({ id: `${id++}`, type: CardType.NUMBER, color, number: num })
    }
  }

  // Action cards: 2 per color per action (8 total per action = 2 * 4 colors)
  for (const color of Object.values(CardColor)) {
    deck.push({ id: `${id++}`, type: CardType.DRAW_TWO, color })
    deck.push({ id: `${id++}`, type: CardType.DRAW_TWO, color })
    deck.push({ id: `${id++}`, type: CardType.REVERSE, color })
    deck.push({ id: `${id++}`, type: CardType.REVERSE, color })
    deck.push({ id: `${id++}`, type: CardType.SKIP, color })
    deck.push({ id: `${id++}`, type: CardType.SKIP, color })
  }

  // Wild cards (4 total)
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `${id++}`, type: CardType.WILD })
  }

  // Wild Draw Four (4 total)
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `${id++}`, type: CardType.WILD_DRAW_FOUR })
  }

  return deck.sort(() => Math.random() - 0.5) // shuffle
}

// Shuffle Fisher-Yates
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Draw cards from deck, reshuffle discard if needed
export function drawCards(deck: Card[], discardPile: Card[], count: number): { cards: Card[]; newDeck: Card[] } {
  let currentDeck = [...deck]
  const drawn: Card[] = []

  for (let i = 0; i < count; i++) {
    if (currentDeck.length === 0) {
      // Reshuffle discard pile (keep top card out)
      if (discardPile.length <= 1) {
        // Not enough cards, game issue (shouldn't happen in normal play)
        break
      }
      currentDeck = shuffle(discardPile.slice(0, -1))
      discardPile.splice(0, discardPile.length - 1) // keep only top card in discard
    }
    const card = currentDeck.pop()
    if (card) drawn.push(card)
  }

  return { cards: drawn, newDeck: currentDeck }
}

// Check if a card can be played on the discard pile
export function canPlayCard(card: Card, topCard: Card, currentWildColor?: CardColor): boolean {
  // Wild cards can always be played
  if (card.type === CardType.WILD || card.type === CardType.WILD_DRAW_FOUR) {
    return true
  }

  // If a wild was just played, check color only
  if (currentWildColor) {
    return card.color === currentWildColor
  }

  // For numbered cards: match by color OR number
  if (card.type === CardType.NUMBER && topCard.type === CardType.NUMBER) {
    return card.color === topCard.color || card.number === topCard.number
  }

  // For action cards (+2, REVERSE, SKIP): match by color OR same type
  // Examples:
  // - Red +2 on Red 5 ✅ (color match)
  // - Red +2 on Blue +2 ✅ (same type)
  // - Red REVERSE on Red 3 ✅ (color match)
  // - Red REVERSE on Blue REVERSE ✅ (same type)
  if (
    (card.type === CardType.DRAW_TWO || card.type === CardType.REVERSE || card.type === CardType.SKIP) &&
    (topCard.type === CardType.DRAW_TWO || topCard.type === CardType.REVERSE || topCard.type === CardType.SKIP)
  ) {
    // If both are action cards, match by color or same type
    return card.color === topCard.color || card.type === topCard.type
  }

  // Action card on number: only color match
  if (
    (card.type === CardType.DRAW_TWO || card.type === CardType.REVERSE || card.type === CardType.SKIP) &&
    topCard.type === CardType.NUMBER
  ) {
    return card.color === topCard.color
  }

  // Number on action: only color match
  if (
    card.type === CardType.NUMBER &&
    (topCard.type === CardType.DRAW_TWO || topCard.type === CardType.REVERSE || topCard.type === CardType.SKIP)
  ) {
    return card.color === topCard.color
  }

  return false
}

/**
 * Get all playable cards from a hand
 * Returns array of card IDs that can be played
 * 
 * Rules:
 * - If pendingDrawCount > 0 and pendingDrawType is DRAW_TWO: only +2 can be played
 * - If pendingDrawCount > 0 and pendingDrawType is WILD_DRAW_FOUR: only +4 can be played
 * - If no pending draw: normal UNO rules apply, but only 1 card can be played per turn
 * - WILD and +4 can always be played regardless
 */
export function getPlayableCards(hand: Card[], topCard: Card, currentWildColor?: CardColor, pendingDrawCount: number = 0, pendingDrawType?: 'DRAW_TWO' | 'WILD_DRAW_FOUR'): string[] {
  // If there's a pending draw accumulation in progress
  if (pendingDrawCount > 0) {
    if (pendingDrawType === 'DRAW_TWO') {
      // Only +2 can be played to continue the accumulation
      return hand
        .filter((card) => card.type === CardType.DRAW_TWO)
        .map((card) => card.id)
    } else if (pendingDrawType === 'WILD_DRAW_FOUR') {
      // Only +4 can be played to continue the accumulation
      return hand
        .filter((card) => card.type === CardType.WILD_DRAW_FOUR)
        .map((card) => card.id)
    }
  }

  // Normal mode: return all playable cards (including WILD and +4 which can always be played)
  return hand
    .filter((card) => {
      if (!canPlayCard(card, topCard, currentWildColor)) return false
      // Check +4 legality if it's a +4
      if (card.type === CardType.WILD_DRAW_FOUR && !canPlayWildDrawFour(hand, topCard)) {
        return false
      }
      return true
    })
    .map((card) => card.id)
}

// Check if WILD_DRAW_FOUR is legal
// According to standard UNO rules, +4 is always playable (challenge system may come later)
export function canPlayWildDrawFour(hand: Card[], topCard: Card): boolean {
  // For now, +4 is always playable
  // A challenge system can be implemented later if needed
  return true
}
