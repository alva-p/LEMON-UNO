/**
 * Game Screen - Play UNO with enhanced mobile UX
 */
import React, { useState, useEffect } from 'react'

export interface GameScreenProps {
  gameState: any
  playerIndex: number
  onPlayCard: (cardId: string, chosenColor?: string) => void
  onDrawCard: () => void
  connected: boolean
  onGameEnd?: () => void
}

export const GameScreen: React.FC<GameScreenProps> = ({
  gameState,
  playerIndex,
  onPlayCard,
  onDrawCard,
  connected,
  onGameEnd,
}) => {
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [lastPlayedCardId, setLastPlayedCardId] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(15000) // in milliseconds

  // Update timer based on gameState
  useEffect(() => {
    if (gameState?.timeRemaining !== undefined) {
      setTimeRemaining(gameState.timeRemaining)
    }
  }, [gameState?.timeRemaining])

  // Visual timer countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 100))
    }, 100)
    return () => clearInterval(interval)
  }, [])

  if (!gameState) {
    return (
      <div className="game-screen-container">
        <div className="loading-state">
          <div className="spinner-large"></div>
          <p>Iniciando juego...</p>
        </div>
      </div>
    )
  }

  const player = gameState.players[playerIndex]
  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const topCard = gameState.discardPile[gameState.discardPile.length - 1]
  const isMyTurn = gameState.currentPlayerIndex === playerIndex
  const otherPlayers = gameState.players.filter((_: any, idx: number) => idx !== playerIndex)
  const playableCardIds = gameState.playableCardIds || []

  const getCardColor = (card: any) => {
    if (card.color === 'RED') return '#ff4444'
    if (card.color === 'BLUE') return '#4444ff'
    if (card.color === 'GREEN') return '#44ff44'
    if (card.color === 'YELLOW') return '#ffff44'
    return '#888888'
  }

  const getCardEmoji = (card: any) => {
    if (card.type === 'NUMBER') return card.number
    if (card.type === 'SKIP') return '⏭️'
    if (card.type === 'REVERSE') return '🔄'
    if (card.type === 'DRAW_TWO') return '+2'
    if (card.type === 'WILD') return 'W'
    if (card.type === 'WILD_DRAW_FOUR') return '+4'
    return '?'
  }

  const isCardPlayable = (cardId: string): boolean => {
    return playableCardIds.includes(cardId)
  }

  const handlePlayCard = (cardId: string) => {
    const card = player.hand.find((c: any) => c.id === cardId)
    if (!card) return

    // If it's a WILD, show color picker
    if (card.type === 'WILD' || card.type === 'WILD_DRAW_FOUR') {
      setLastPlayedCardId(cardId)
      setShowColorPicker(true)
      return
    }

    setLastPlayedCardId(cardId)
    onPlayCard(cardId)
  }

  const handleColorSelect = (color: string) => {
    if (lastPlayedCardId) {
      onPlayCard(lastPlayedCardId, color)
      setShowColorPicker(false)
      setLastPlayedCardId(null)
    }
  }

  return (
    <div className="game-screen-container">
      {/* Connection Status */}
      <div className={`connection-indicator ${connected ? 'online' : 'offline'}`}>
        {connected ? '🟢 Conectado' : '🔴 Desconectado'}
      </div>

      {/* Game Header */}
      <div className="game-header">
        <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
          <span className="indicator-dot"></span>
          <span className="indicator-text">
            {isMyTurn ? '🎮 TU TURNO' : `🎯 ${currentPlayer.name}`}
          </span>
        </div>
        
        {/* Turn Timer */}
        <div className={`turn-timer ${timeRemaining < 5000 ? 'warning' : ''}`}>
          <div className="timer-circle">
            <svg viewBox="0 0 36 36" className="progress-ring">
              <circle
                className="progress-ring-circle"
                stroke="currentColor"
                fill="transparent"
                r="15.915"
                cx="18"
                cy="18"
                style={{
                  strokeDasharray: `${(timeRemaining / 15000) * 100}% 100%`,
                }}
              />
            </svg>
            <span className="timer-text">{Math.ceil(timeRemaining / 1000)}s</span>
          </div>
        </div>
      </div>

      {/* Game Board */}
      <div className="game-board">
        {/* Discard Pile (Center) */}
        <div className="play-area">
          <div className="pile-section">
            <div className="pile-label">Descartadas</div>
            {topCard && (
              <div
                className="card-large"
                style={{
                  backgroundColor: gameState.currentWildColor 
                    ? (gameState.currentWildColor === 'RED' ? '#ff4444' : 
                       gameState.currentWildColor === 'BLUE' ? '#4444ff' :
                       gameState.currentWildColor === 'GREEN' ? '#44ff44' : '#ffff44')
                    : getCardColor(topCard),
                  color: (topCard.color === 'YELLOW' || gameState.currentWildColor === 'YELLOW') ? '#000' : '#fff',
                }}
              >
                <span className="card-value">{getCardEmoji(topCard)}</span>
              </div>
            )}
          </div>

          {/* Deck */}
          <div className="deck-section">
            <div className="deck-label">Mazo</div>
            <button
              className={`deck-button ${isMyTurn ? 'active' : ''}`}
              onClick={onDrawCard}
              disabled={!isMyTurn}
              title={isMyTurn ? 'Robar carta' : 'No es tu turno'}
            >
              <span className="deck-count">{gameState.deck.length}</span>
              <span className="deck-icon">🃏</span>
            </button>
          </div>
        </div>


      </div>

      {/* My Hand */}
      <div className="my-hand-section">
        <div className="hand-header">
          <h3>Mi Mano</h3>
          <span className="card-count">{player.hand.length} cartas</span>
          {!isMyTurn && <span className="waiting-indicator">⏳ Esperando...</span>}
        </div>

        {player.hand.length === 0 ? (
          <div className="hand-empty">
            <div className="win-message">🎉 ¡Ganaste! 🎉</div>
          </div>
        ) : (
          <div className="cards-hand">
            {player.hand.map((card: any) => {
              const isPlayable = isCardPlayable(card.id)
              // WILD and WILD_DRAW_FOUR are always clickable (they require color selection)
              const isClickable = isPlayable || (card.type === 'WILD' || card.type === 'WILD_DRAW_FOUR')
              return (
                <button
                  key={card.id}
                  className={`card-hand ${isMyTurn && isPlayable ? 'playable' : isMyTurn && isClickable ? 'clickable' : isMyTurn ? 'not-playable' : 'disabled'}`}
                  style={{
                    backgroundColor: getCardColor(card),
                    color: card.color === 'YELLOW' ? '#000' : '#fff',
                  }}
                  onClick={() => isMyTurn && isClickable && handlePlayCard(card.id)}
                  disabled={!isMyTurn || !isClickable}
                  title={
                    !isMyTurn 
                      ? 'No es tu turno'
                      : isPlayable
                      ? 'Jugar esta carta'
                      : (card.type === 'WILD' || card.type === 'WILD_DRAW_FOUR')
                      ? 'Jugar esta carta y elegir color'
                      : 'Esta carta no se puede jugar'
                  }
                >
                  <span className="card-emoji">{getCardEmoji(card)}</span>
                  {card.type === 'NUMBER' && <span className="card-number">{card.number}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Action Bar */}
      {/* UNO button removed as per user request */}

      {/* Color Picker Modal */}
      {showColorPicker && (
        <div className="modal-overlay">
          <div className="modal-content color-picker">
            <h3>Elige un color</h3>
            <div className="color-options">
              <button 
                className="color-btn red" 
                onClick={() => handleColorSelect('RED')}
              >
                🔴 Rojo
              </button>
              <button 
                className="color-btn blue" 
                onClick={() => handleColorSelect('BLUE')}
              >
                🔵 Azul
              </button>
              <button 
                className="color-btn green" 
                onClick={() => handleColorSelect('GREEN')}
              >
                🟢 Verde
              </button>
              <button 
                className="color-btn yellow" 
                onClick={() => handleColorSelect('YELLOW')}
              >
                🟡 Amarillo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameState.winner && (
        <div className="modal-overlay">
          <div className="modal-content game-over">
            <div className="modal-icon">🏆</div>
            <h2>¡Juego Terminado!</h2>
            <p className="winner-name">
              {gameState.players[gameState.players.findIndex((p: any) => p.id === gameState.winner)]?.name} ganó
            </p>
            <p className="bet-info">
              Apuesta: ${gameState.betAmount} ARS
            </p>
            <button 
              className="btn-play-again"
              onClick={() => onGameEnd?.()}
            >
              Volver al Home
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
