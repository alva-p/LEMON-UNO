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
  hasDrawnThisTurn: boolean   // para controlar "solo 1 robo por turno"
  turnStartTime: number // Timestamp when current turn started (for timeout)

  // Opcionales útiles si los usás en el front
  playableCardIds?: string[]
  timeRemaining?: number
}

// ============================
// DECK / UTILIDADES
// ============================

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
export function drawCards(
  deck: Card[],
  discardPile: Card[],
  count: number
): { cards: Card[]; newDeck: Card[] } {
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

// ============================
// REGLAS DE JUGABILIDAD
// ============================

// Check if a card can be played on the discard pile
export function canPlayCard(
  card: Card,
  topCard: Card,
  currentWildColor?: CardColor
): boolean {
  // 1) +4 siempre se puede intentar jugar
  //    (la legalidad más fina se puede controlar con canPlayWildDrawFour)
  if (card.type === CardType.WILD_DRAW_FOUR) {
    return true
  }

  // 2) WILD normal:
  //    - NO se puede jugar directamente sobre un +4
  //    - En cualquier otro caso, sí se puede
  if (card.type === CardType.WILD) {
    if (topCard.type === CardType.WILD_DRAW_FOUR) {
      return false
    }
    return true
  }

  // 3) Si la última carta fue un WILD/+4 con color elegido,
  //    solo se evalúa color
  if (currentWildColor) {
    return card.color === currentWildColor
  }

  // 4) Para cartas NUMÉRICAS: color O número
  if (card.type === CardType.NUMBER && topCard.type === CardType.NUMBER) {
    return card.color === topCard.color || card.number === topCard.number
  }

  // 5) Para cartas de acción (+2, REVERSE, SKIP) entre sí:
  //    color O mismo tipo
  if (
    (card.type === CardType.DRAW_TWO ||
      card.type === CardType.REVERSE ||
      card.type === CardType.SKIP) &&
    (topCard.type === CardType.DRAW_TWO ||
      topCard.type === CardType.REVERSE ||
      topCard.type === CardType.SKIP)
  ) {
    return card.color === topCard.color || card.type === topCard.type
  }

  // 6) Acción sobre número: solo color
  if (
    (card.type === CardType.DRAW_TWO ||
      card.type === CardType.REVERSE ||
      card.type === CardType.SKIP) &&
    topCard.type === CardType.NUMBER
  ) {
    return card.color === topCard.color
  }

  // 7) Número sobre acción: solo color
  if (
    card.type === CardType.NUMBER &&
    (topCard.type === CardType.DRAW_TWO ||
      topCard.type === CardType.REVERSE ||
      topCard.type === CardType.SKIP)
  ) {
    return card.color === topCard.color
  }

  return false
}

/**
 * Get all playable cards from a hand
 * Returns array of card IDs that can be played
 *
 * Reglas:
 * - Si pendingDrawCount > 0 y pendingDrawType === DRAW_TWO        → solo +2
 * - Si pendingDrawCount > 0 y pendingDrawType === WILD_DRAW_FOUR  → solo +4
 * - Si NO hay acumulación:
 *    - Reglas normales UNO (canPlayCard)
 *    - Regla extra: si la carta de arriba es +2, NO permitir WILD ni +4
 *    - Regla de +4 avanzada opcional vía canPlayWildDrawFour
 */
export function getPlayableCards(
  hand: Card[],
  topCard: Card,
  currentWildColor?: CardColor,
  pendingDrawCount: number = 0,
  pendingDrawType?: 'DRAW_TWO' | 'WILD_DRAW_FOUR'
): string[] {
  // 1) Acumulación en progreso
  if (pendingDrawCount > 0) {
    if (pendingDrawType === 'DRAW_TWO') {
      // Solo +2
      return hand
        .filter((card) => card.type === CardType.DRAW_TWO)
        .map((card) => card.id)
    } else if (pendingDrawType === 'WILD_DRAW_FOUR') {
      // Solo +4
      return hand
        .filter((card) => card.type === CardType.WILD_DRAW_FOUR)
        .map((card) => card.id)
    }
  }

  // 2) Modo normal: reglas estándar + regla extra de +2 vs WILD/+4
  return hand
    .filter((card) => {
      // Primero: debe ser jugable según las reglas base
      if (!canPlayCard(card, topCard, currentWildColor)) {
        return false
      }

      // Regla EXTRA:
      // Si la carta de arriba es +2, NO permitir que se juegue WILD ni WILD_DRAW_FOUR.
      if (
        topCard.type === CardType.DRAW_TWO &&
        (card.type === CardType.WILD || card.type === CardType.WILD_DRAW_FOUR)
      ) {
        return false
      }

      // Regla opcional: si algún día querés validar +4 más en serio
      if (
        card.type === CardType.WILD_DRAW_FOUR &&
        !canPlayWildDrawFour(hand, topCard)
      ) {
        return false
      }

      return true
    })
    .map((card) => card.id)
}

// Check if WILD_DRAW_FOUR is legal
// Por ahora, +4 siempre es legal (la validación avanzada/challenge puede ir acá)
export function canPlayWildDrawFour(hand: Card[], topCard: Card): boolean {
  return true
}
