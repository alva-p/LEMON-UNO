/**
 * Lobby Screen - Create or join a game with enhanced UX
 */
import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { DepositModal } from '../components/DepositModal'
import { WithdrawModal } from '../components/WithdrawModal'

function getApiUrl(): string {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:3000'
  }
  return `http://${window.location.hostname}:3000`
}

interface Lobby {
  id: string
  betAmount: number
  maxPlayers: number
  players: any[]
  isPublic: boolean
  createdAt: string
}

export interface LobbyScreenProps {
  onCreateGame: (betAmount: number, maxPlayers: number, isPublic: boolean, password?: string) => void
  onJoinGame: (lobbyId: string, password?: string) => void
  lobbies?: Lobby[]
  loading?: boolean
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  onCreateGame,
  onJoinGame,
  lobbies = [],
  loading = false,
}) => {
  const { user } = useAuth()
  const [tab, setTab] = useState<'public' | 'private' | 'create'>('public')
  const [betAmount, setBetAmount] = useState(500)
  const [maxPlayers, setMaxPlayers] = useState(2)
  const [password, setPassword] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const quickBets = [100, 250, 500, 1000, 5000]

  // Separate lobbies into public and private
  const publicLobbies = lobbies.filter(l => l.isPublic)
  const privateLobbies = lobbies.filter(l => !l.isPublic)

  const handleCreate = () => {
    if (betAmount < 100 || betAmount > 100000) {
      alert('La apuesta debe estar entre 100 y 100.000 ARS')
      return
    }
    onCreateGame(betAmount, maxPlayers, !isPrivate, isPrivate ? password : undefined)
    setBetAmount(500)
    setPassword('')
    setIsPrivate(false)
    setTab('public')
  }

  const handleJoin = (lobbyId: string, isPublic: boolean) => {
    if (!isPublic) {
      const pwd = prompt('Ingresa contraseña:')
      if (pwd !== null) {
        onJoinGame(lobbyId, pwd)
      }
    } else {
      onJoinGame(lobbyId)
    }
  }

  return (
    <div className="lobby-screen">
      {/* Header con Balance y Deposit */}
      <div className="lobby-header">
        <div className="logo-section">
          <div className="uno-logo">🎴</div>
          <h1>UNO CASH</h1>
          <p className="subtitle">Juega • Apuesta • Gana</p>
        </div>
        {/* Balance y Deposit Button */}
        <div className="header-balance-section">
          <div className="balance-display-compact">
            <span className="balance-label">Saldo:</span>
            <span className="balance-value">${user?.balance.toLocaleString()} ARS</span>
          </div>
          <button
            className="btn-deposit-header"
            onClick={() => setShowDepositModal(true)}
          >
            💳 Depositar
          </button>
          <button
            className="btn-withdraw-header"
            onClick={() => setShowWithdrawModal(true)}
          >
            💸 Retirar
          </button>
        </div>
      </div>

      {/* Quick Play Button - REMOVED */}

      {/* Tabs */}
      <div className="lobby-tabs">
        <button
          className={`tab-btn ${tab === 'public' ? 'active' : ''}`}
          onClick={() => setTab('public')}
        >
          <span className="icon">🔓</span>
          Públicos (Gratis)
        </button>
        <button
          className={`tab-btn ${tab === 'private' ? 'active' : ''}`}
          onClick={() => setTab('private')}
        >
          <span className="icon">🔒</span>
          Privados (Pago)
        </button>
        <button
          className={`tab-btn ${tab === 'create' ? 'active' : ''}`}
          onClick={() => setTab('create')}
        >
          <span className="icon">➕</span>
          Crear
        </button>
      </div>

      {/* Content */}
      <div className="lobby-content">
        {tab === 'public' && (
          <div className="public-games">
            <div className="content-header">
              <h2>Juegos Disponibles</h2>
              {loading && <div className="mini-spinner"></div>}
            </div>

            {lobbies.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎪</div>
                <h3>No hay juegos disponibles</h3>
                <p>¡Crea uno y invita a tus amigos!</p>
              </div>
            ) : (
              <div className="games-grid">
                {lobbies.map((lobby) => (
                  <div key={lobby.id} className="game-card">
                    <div className="card-badge">
                      {lobby.isPublic ? '🔓' : '🔒'}
                    </div>

                    <div className="card-content">
                      <div className="bet-section">
                        <span className="bet-label">Apuesta</span>
                        <span className="bet-value">${lobby.betAmount}</span>
                        <span className="bet-currency">ARS</span>
                      </div>

                      <div className="players-section">
                        <span className="players-count">{lobby.players?.length || 0}</span>
                        <span className="players-max">/{lobby.maxPlayers}</span>
                        <span className="players-label">jugadores</span>
                      </div>

                      <div className="difficulty">
                        {lobby.players?.length === 1 && <span className="diff easy">👤</span>}
                        {lobby.players?.length === 2 && <span className="diff medium">👥</span>}
                        {lobby.players?.length >= 3 && <span className="diff hard">👨‍👩‍👧‍👦</span>}
                      </div>
                    </div>

                    <button
                      className="card-action btn-join"
                      onClick={() => handleJoin(lobby.id, lobby.isPublic)}
                      disabled={loading}
                    >
                      UNIRSE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'private' && (
          <div className="private-games">
            <div className="content-header">
              <h2>Juegos Privados (Con Apuesta)</h2>
              {loading && <div className="mini-spinner"></div>}
            </div>

            {privateLobbies.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎪</div>
                <h3>No hay juegos privados disponibles</h3>
                <p>¡Crea uno desde la pestaña "Crear"!</p>
              </div>
            ) : (
              <div className="games-grid">
                {privateLobbies.map((lobby) => (
                  <div key={lobby.id} className="game-card">
                    <div className="card-badge">
                      🔒
                    </div>

                    <div className="card-content">
                      <div className="bet-section">
                        <span className="bet-label">Apuesta</span>
                        <span className="bet-value">${lobby.betAmount}</span>
                        <span className="bet-currency">ARS</span>
                      </div>

                      <div className="players-section">
                        <span className="players-count">{lobby.players?.length || 0}</span>
                        <span className="players-max">/{lobby.maxPlayers}</span>
                        <span className="players-label">jugadores</span>
                      </div>

                      <div className="difficulty">
                        {lobby.players?.length === 1 && <span className="diff easy">👤</span>}
                        {lobby.players?.length === 2 && <span className="diff medium">👥</span>}
                        {lobby.players?.length >= 3 && <span className="diff hard">👨‍👩‍👧‍👦</span>}
                      </div>
                    </div>

                    <button
                      className="card-action btn-join"
                      onClick={() => handleJoin(lobby.id, lobby.isPublic)}
                      disabled={loading}
                    >
                      UNIRSE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'create' && (
          <div className="create-game">
            <div className="content-header">
              <h2>Crear Nuevo Juego</h2>
            </div>

            <div className="form-section">
              {/* Quick Bet Selector */}
              <div className="form-group">
                <label className="form-label">Apuesta Rápida</label>
                <div className="quick-bets">
                  {quickBets.map((bet) => (
                    <button
                      key={bet}
                      className={`quick-bet ${selectedAmount === bet ? 'selected' : ''}`}
                      onClick={() => {
                        setBetAmount(bet)
                        setSelectedAmount(bet)
                      }}
                    >
                      ${bet}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Bet Input */}
              <div className="form-group">
                <label className="form-label">Apuesta Personalizada</label>
                <div className="custom-input-group">
                  <span className="currency">$</span>
                  <input
                    type="number"
                    min="100"
                    max="100000"
                    value={betAmount}
                    onChange={(e) => {
                      setBetAmount(Number(e.target.value))
                      setSelectedAmount(null)
                    }}
                    placeholder="500"
                    className="custom-input"
                  />
                  <span className="unit">ARS</span>
                </div>
                <small className="input-hint">Min $100 • Max $100.000</small>
              </div>

              {/* Players Selector */}
              <div className="form-group">
                <label className="form-label">Máximo de Jugadores</label>
                <div className="players-selector">
                  {[2, 3, 4, 6, 8, 10].map((num) => (
                    <button
                      key={num}
                      className={`player-btn ${maxPlayers === num ? 'active' : ''}`}
                      onClick={() => setMaxPlayers(num)}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Privacy Toggle */}
              <div className="form-group">
                <label className="form-label">Privacidad</label>
                <div className="privacy-toggle">
                  <button
                    className={`privacy-btn ${!isPrivate ? 'active' : ''}`}
                    onClick={() => setIsPrivate(false)}
                  >
                    🔓 Público
                  </button>
                  <button
                    className={`privacy-btn ${isPrivate ? 'active' : ''}`}
                    onClick={() => setIsPrivate(true)}
                  >
                    🔒 Privado
                  </button>
                </div>
              </div>

              {/* Password Input */}
              {isPrivate && (
                <div className="form-group">
                  <label className="form-label">Contraseña</label>
                  <input
                    type="password"
                    placeholder="Crea una contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="password-input"
                  />
                </div>
              )}

              {/* Summary */}
              <div className="game-summary">
                <div className="summary-item">
                  <span className="summary-label">Apuesta Total</span>
                  <span className="summary-value">${betAmount}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Jugadores</span>
                  <span className="summary-value">Hasta {maxPlayers}</span>
                </div>
              </div>

              {/* Create Button */}
              <button
                className="btn-create-game"
                onClick={handleCreate}
                disabled={loading || betAmount < 100}
              >
                {loading ? '⏳ Creando...' : '🎮 CREAR JUEGO'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Deposit Modal */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        onSuccess={() => {
          // Modal se cierra automáticamente, balance se actualiza en AuthContext
        }}
      />

      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onSuccess={() => {
          // Modal se cierra automáticamente, balance se actualiza en AuthContext
        }}
      />
    </div>
  )
}
