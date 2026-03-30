/**
 * Game Screen - Play UNO with enhanced mobile UX
 */
import React, { useState, useEffect, useRef } from 'react'
import { sounds } from '../utils/sounds'

export interface GameScreenProps {
  gameState: any
  playerIndex: number
  onPlayCard: (cardId: string, chosenColor?: string) => void
  onDrawCard: () => void
  onPassTurn: () => void
  onCallUno: () => void
  onChallengeUno: (targetIndex: number) => void
  connected: boolean
  onGameEnd?: () => void
  onLeaderboard?: () => void
}

export const GameScreen: React.FC<GameScreenProps> = ({
  gameState,
  playerIndex,
  onPlayCard,
  onDrawCard,
  onPassTurn,
  onCallUno,
  onChallengeUno,
  connected,
  onGameEnd,
  onLeaderboard,
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [lastPlayedCardId, setLastPlayedCardId] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(15000)
  const [discardAnimKey, setDiscardAnimKey] = useState(0)
  const [winSoundPlayed, setWinSoundPlayed] = useState(false)
  const prevTopCardIdRef = useRef<string | null>(null)
  const prevPendingRef = useRef(0)

  // Update timer based on gameState
  useEffect(() => {
    if (gameState?.timeRemaining !== undefined) {
      setTimeRemaining(gameState.timeRemaining)
    }
  }, [gameState?.timeRemaining])

  // Visual timer countdown (solo UI)
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 100))
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // Animate discard pile when top card changes
  const topCardId = gameState?.discardPile?.[gameState.discardPile.length - 1]?.id
  useEffect(() => {
    if (topCardId && topCardId !== prevTopCardIdRef.current) {
      prevTopCardIdRef.current = topCardId
      setDiscardAnimKey((k) => k + 1)
    }
  }, [topCardId])

  // Sound: penalty accumulation
  const pendingCount = gameState?.pendingDrawCount ?? 0
  useEffect(() => {
    if (pendingCount > prevPendingRef.current) {
      sounds.penalty()
    }
    prevPendingRef.current = pendingCount
  }, [pendingCount])

  // Sound: win / lose
  useEffect(() => {
    if (gameState?.winner && !winSoundPlayed) {
      setWinSoundPlayed(true)
      const myId = gameState.players?.[playerIndex]?.id
      if (myId && gameState.winner === myId) sounds.win()
      else sounds.lose()
    }
  }, [gameState?.winner])

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
  const playableCardIds: string[] = gameState.playableCardIds || []
  const hasDrawnThisTurn: boolean = gameState.hasDrawnThisTurn || false
  const cardPlayedThisTurn: boolean = gameState.cardPlayedThisTurn || false

  // NUEVO: info de acumulación desde el estado del juego
  const pendingDrawCount: number = gameState.pendingDrawCount || 0
  const pendingDrawType: 'DRAW_TWO' | 'WILD_DRAW_FOUR' | undefined =
    gameState.pendingDrawType || undefined

  const canPassTurn = isMyTurn && hasDrawnThisTurn && !cardPlayedThisTurn

  // UNO: el jugador local tiene 1 carta y aún no gritó UNO
  const shouldShowUnoButton = player.hand.length === 1 && !player.hasCalledUno

  // Oponentes atrapables: tienen 1 carta y no llamaron UNO
  const catchableOpponents = gameState.players
    .map((p: any, idx: number) => ({ ...p, idx }))
    .filter((p: any) => p.idx !== playerIndex && p.hand.length === 1 && !p.hasCalledUno)

  const getCardColor = (card: any) => {
    if (card.color === 'RED') return '#ff4444'
    if (card.color === 'BLUE') return '#4444ff'
    if (card.color === 'GREEN') return '#44ff44'
    if (card.color === 'YELLOW') return '#ffff44'
    return '#888888'
  }

  const getCardEmoji = (card: any) => {
    if (card.type === 'NUMBER') return card.number
    if (card.type === 'SKIP') return '⊘'
    if (card.type === 'REVERSE') return '🔄'
    if (card.type === 'DRAW_TWO') return '+2'
    if (card.type === 'WILD')
      return (
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.95rem', margin: '0 1px' }}>🔴</span>
            <span style={{ fontSize: '0.95rem', margin: '0 1px' }}>🟢</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.95rem', margin: '0 1px' }}>🔵</span>
            <span style={{ fontSize: '0.95rem', margin: '0 1px' }}>🟡</span>
          </div>
        </span>
      )
    if (card.type === 'WILD_DRAW_FOUR') return '+4'
    return '?'
  }

  /**
   * Custom playable logic para el highlight:
   *
   * - Si HAY acumulación:
   *     · pendingDrawType === 'DRAW_TWO'       → solo +2
   *     · pendingDrawType === 'WILD_DRAW_FOUR' → solo +4
   *   (espejamos lo que exige el engine).
   *
   * - Si NO hay acumulación (pendingDrawCount === 0):
   *     · No forzamos nada especial cuando la carta de arriba es +2.
   *       Usamos directamente playableCardIds del backend.
   *     · Mantenemos solo la ayuda visual de NO resaltar WILD simple
   *       encima de un +4.
   */
  const isCardPlayable = (cardId: string): boolean => {
    const card = player.hand.find((c: any) => c.id === cardId)
    if (!card) return false

    // 1) Hay acumulación activa: copiamos las reglas del engine
    if (pendingDrawCount > 0) {
      if (pendingDrawType === 'DRAW_TWO' && card.type !== 'DRAW_TWO') return false
      if (pendingDrawType === 'WILD_DRAW_FOUR' && card.type !== 'WILD_DRAW_FOUR') return false
      return playableCardIds.includes(cardId)
    }

    // 2) Sin acumulación:
    //    - No resaltamos WILD normal sobre un +4 (solo ayuda visual)
    if (topCard?.type === 'WILD_DRAW_FOUR' && card.type === 'WILD') {
      return false
    }

    // 3) Caso general: confiamos en el engine
    return playableCardIds.includes(cardId)
  }

  const iWon = gameState.winner != null && gameState.winner === player?.id

  const handlePlayCard = (cardId: string) => {
    const card = player.hand.find((c: any) => c.id === cardId)
    if (!card) return

    sounds.playCard()

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

  const handleDrawCard = () => {
    sounds.drawCard()
    onDrawCard()
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
            {isMyTurn
              ? '🎮 TU TURNO'
              : `🎯 ${currentPlayer.name?.slice(0, 15)}${
                  currentPlayer.name?.length > 15 ? '...' : ''
                }`}
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

      {/* Opponents Panel */}
      <div className="opponents-strip">
        {gameState.players
          .map((p: any, idx: number) => ({ ...p, idx }))
          .filter((p: any) => p.idx !== playerIndex)
          .map((opp: any) => {
            const isOppTurn = gameState.currentPlayerIndex === opp.idx
            const hasUno = opp.hand.length === 1
            return (
              <div
                key={opp.idx}
                className={`opponent-card${isOppTurn ? ' opp-active' : ''}${hasUno ? ' opp-uno-alert' : ''}`}
              >
                <div className="opp-name">{opp.name?.slice(0, 10) || `J${opp.idx + 1}`}</div>
                <div className="opp-cards-count">
                  <span>🃏</span>
                  <span className="opp-card-num">{opp.hand.length}</span>
                </div>
                {hasUno && (
                  <div className={`opp-uno-badge ${opp.hasCalledUno ? 'called' : 'uncalled'}`}>
                    {opp.hasCalledUno ? 'UNO' : '⚠️ UNO'}
                  </div>
                )}
                {isOppTurn && <div className="opp-turn-label">TURNO</div>}
              </div>
            )
          })}
      </div>

      {/* Game Board */}
      <div className="game-board">
        {/* Discard Pile (Center) */}
        <div className="play-area">
          <div className="pile-section">
            <div className="pile-label">Descartadas</div>
            {topCard && (
              <div
                key={discardAnimKey}
                className="card-large card-animating"
                style={{
                  backgroundColor: gameState.currentWildColor
                    ? gameState.currentWildColor === 'RED'
                      ? '#ff4444'
                      : gameState.currentWildColor === 'BLUE'
                      ? '#4444ff'
                      : gameState.currentWildColor === 'GREEN'
                      ? '#44ff44'
                      : '#ffff44'
                    : getCardColor(topCard),
                  color:
                    topCard.color === 'YELLOW' || gameState.currentWildColor === 'YELLOW'
                      ? '#000'
                      : '#fff',
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
              className={`deck-button ${
                isMyTurn && !hasDrawnThisTurn ? 'active' : ''
              }`}
              onClick={handleDrawCard}
              disabled={!isMyTurn || hasDrawnThisTurn}
              title={
                !isMyTurn
                  ? 'No es tu turno'
                  : hasDrawnThisTurn
                  ? 'Ya robaste una carta este turno'
                  : 'Robar carta'
              }
            >
              <span className="deck-count">{gameState.deck.length}</span>
              <span className="deck-icon">🃏</span>
            </button>
          </div>
        </div>
      </div>

      {/* Penalización acumulada (+2 o +4) */}
      {pendingDrawCount > 0 && (
        <div className={`penalty-banner${pendingDrawType === 'DRAW_TWO' ? ' penalty-draw-two' : ''}`}>
          <span className="penalty-icon">⚡</span>
          <span className="penalty-text">
            +{pendingDrawCount} acumulados
            {isMyTurn
              ? ` — jugá ${pendingDrawType === 'DRAW_TWO' ? '+2' : '+4'} o robás todo`
              : ` — ${currentPlayer.name?.slice(0, 10)} debe tirar ${pendingDrawType === 'DRAW_TWO' ? '+2' : '+4'} o robar`}
          </span>
        </div>
      )}

      {/* Barra de acciones UNO / Desafíos */}
      <div className="uno-actions-bar">
        {/* Botón UNO propio */}
        {shouldShowUnoButton && (
          <button className="btn-uno" onClick={() => { sounds.uno(); onCallUno() }}>
            🟡 ¡UNO!
          </button>
        )}

        {/* Atrapar oponentes que no gritaron UNO */}
        {catchableOpponents.map((opp: any) => (
          <button
            key={opp.idx}
            className="btn-catch-uno"
            onClick={() => onChallengeUno(opp.idx)}
          >
            🎯 ¡Atrapar a {opp.name?.slice(0, 8) || `J${opp.idx + 1}`}!
          </button>
        ))}

      </div>

      {/* Pass Turn Button – entre tablero y mi mano */}
      <div className="pass-turn-bar">
        <button
          className="btn-pass-turn"
          onClick={onPassTurn}
          disabled={!canPassTurn}
          title={
            !isMyTurn
              ? 'No es tu turno'
              : !hasDrawnThisTurn
              ? 'Debes robar una carta antes de pasar'
              : cardPlayedThisTurn
              ? 'Ya jugaste una carta este turno'
              : 'Pasar turno sin jugar carta'
          }
        >
          ⏭ Pasar turno
        </button>
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
              const playable = isCardPlayable(card.id)
              const isClickable =
                playable || card.type === 'WILD' || card.type === 'WILD_DRAW_FOUR'
              return (
                <button
                  key={card.id}
                  className={`card-hand ${
                    isMyTurn && playable
                      ? 'playable'
                      : isMyTurn && isClickable
                      ? 'clickable'
                      : isMyTurn
                      ? 'not-playable'
                      : 'disabled'
                  }`}
                  style={{
                    backgroundColor: getCardColor(card),
                    color: card.color === 'YELLOW' ? '#000' : '#fff',
                  }}
                  onClick={() => isMyTurn && isClickable && handlePlayCard(card.id)}
                  disabled={!isMyTurn || !isClickable}
                  title={
                    !isMyTurn
                      ? 'No es tu turno'
                      : playable
                      ? 'Jugar esta carta'
                      : card.type === 'WILD' || card.type === 'WILD_DRAW_FOUR'
                      ? 'Jugar esta carta y elegir color'
                      : 'Esta carta no se puede jugar'
                  }
                >
                  <span className="card-emoji">{getCardEmoji(card)}</span>
                  {card.type === 'NUMBER' && (
                    <span className="card-number">{card.number}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Color Picker Modal */}
      {showColorPicker && (
        <div className="modal-overlay">
          <div className="modal-content color-picker">
            <h3>Elige un color</h3>
            <div className="color-options">
              <button className="color-btn red" onClick={() => handleColorSelect('RED')}>
                🔴 Rojo
              </button>
              <button className="color-btn blue" onClick={() => handleColorSelect('BLUE')}>
                🔵 Azul
              </button>
              <button className="color-btn green" onClick={() => handleColorSelect('GREEN')}>
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
            <div className="modal-icon">{iWon ? '🏆' : '💸'}</div>
            <h2 className={iWon ? 'win-title' : 'lose-title'}>
              {iWon ? '¡GANASTE!' : '¡PERDISTE!'}
            </h2>

            <p className="winner-name">
              {gameState.players.find((p: any) => p.id === gameState.winner)?.name} ganó
            </p>

            {/* Final standings */}
            {(() => {
              const bet = gameState.betAmount || 0
              const pot = gameState.pot || bet * gameState.players.length
              const houseFee = gameState.houseFee ?? (gameState.currency === 'ARS' ? Math.floor(pot * 0.03) : 0)
              const winnerPrize = gameState.winnerPrize ?? (pot - houseFee)
              const cur = gameState.currency === 'ARS' ? '$' : ''
              const sym = gameState.currency !== 'ARS' ? ` ${gameState.currency}` : ''
              const netWin = winnerPrize - bet   // ganancia neta del ganador
              const netLose = -bet               // pérdida de cada perdedor
              const hasBet = bet > 0

              return (
                <div className="final-standings">
                  {[...gameState.players]
                    .map((p: any, idx: number) => ({ ...p, idx }))
                    .sort((a: any, b: any) =>
                      a.id === gameState.winner ? -1 : b.id === gameState.winner ? 1 : a.hand.length - b.hand.length
                    )
                    .map((p: any, rank: number) => {
                      const isWinner = p.id === gameState.winner
                      return (
                        <div
                          key={p.idx}
                          className={`standing-row${isWinner ? ' winner-row' : ''}`}
                        >
                          <span className="standing-rank">
                            {rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'}
                          </span>
                          <span className="standing-name">
                            {p.name?.slice(0, 12)}
                            {p.idx === playerIndex ? ' (vos)' : ''}
                          </span>
                          <span className="standing-cards">
                            {isWinner ? 0 : p.hand.length} 🃏
                          </span>
                          {hasBet && (
                            <span className={`standing-prize ${isWinner ? 'prize-win' : 'prize-lose'}`}>
                              {isWinner
                                ? `+${cur}${netWin}${sym}`
                                : `${cur}${netLose}${sym}`}
                            </span>
                          )}
                        </div>
                      )
                    })}
                </div>
              )
            })()}

            {(() => {
              const bet2 = gameState.betAmount || 0
              const pot2 = gameState.pot || bet2 * gameState.players.length
              const fee2 = gameState.houseFee ?? (gameState.currency === 'ARS' ? Math.floor(pot2 * 0.03) : 0)
              const prize2 = gameState.winnerPrize ?? (pot2 - fee2)
              const cur2 = gameState.currency === 'ARS' ? '$' : ''
              const sym2 = gameState.currency !== 'ARS' ? ` ${gameState.currency}` : ''
              return (
                <div className="prize-details">
                  <p className="pot-info">
                    Pozo: {cur2}{pot2}{sym2}
                    {gameState.network && ` · ${gameState.network}`}
                    {fee2 > 0 && ` · fee 3%: ${cur2}${fee2}${sym2}`}
                  </p>
                  {iWon && (
                    <p className="winner-prize">
                      🎁 Premio: {cur2}{prize2}{sym2}
                    </p>
                  )}
                </div>
              )
            })()}

            <div className="game-over-actions">
              <button className="btn-play-again" onClick={() => onGameEnd?.()}>
                ← Volver al Home
              </button>
              {onLeaderboard && (
                <button className="btn-leaderboard" onClick={() => onLeaderboard()}>
                  🏆 Ver Rankings
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
