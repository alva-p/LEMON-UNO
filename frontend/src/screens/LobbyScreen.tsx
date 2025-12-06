// Vite env types for TypeScript
declare global {
  interface ImportMetaEnv {
    VITE_TEST_USDT_ADDRESS: string;
    VITE_TEST_USDC_ADDRESS: string;
    VITE_ETH_ADDRESS: string;
    VITE_SEPOLIA_USDT_ADDRESS: string;
    VITE_SEPOLIA_USDC_ADDRESS: string;
  }
  interface ImportMeta {
    env: ImportMetaEnv;
  }
}
/**
 * Lobby Screen - Create or join a game with enhanced UX
 */
import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { DepositModal } from '../components/DepositModal'
import { WithdrawModal } from '../components/WithdrawModal'

function getApiUrl(): string {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:3001'
  }
  return `http://${window.location.hostname}:3001`
}

interface Lobby {
  id: string
  betAmount: number
  currency: 'ARS' | 'ETH' | 'USDT' | 'USDC'
  network?: 'ETH' | 'BASE' | 'SEPOLIA'
  maxPlayers: number
  players: any[]
  isPublic: boolean
  createdAt: string
}

export interface LobbyScreenProps {
  onCreateGame: (
    betAmount: number,
    maxPlayers: number,
    isPublic: boolean,
    password?: string,
    currency?: 'ARS' | 'ETH' | 'USDT' | 'USDC',
    network?: 'ETH' | 'BASE' | 'SEPOLIA'
  ) => void
  onJoinGame: (lobbyId: string, password?: string) => void
  onNavigate?: (screen: 'leaderboard') => void
  lobbies?: Lobby[]
  loading?: boolean
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  onCreateGame,
  onJoinGame,
  onNavigate,
  lobbies = [],
  loading = false,
}) => {
  const { user, faucetArs } = useAuth()
  const [tab, setTab] = useState<'public' | 'private' | 'create'>('public')
  const [betAmount, setBetAmount] = useState(100)
  const [maxPlayers, setMaxPlayers] = useState(2)
  const [password, setPassword] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [currency, setCurrency] = useState<'ARS' | 'ETH' | 'USDT' | 'USDC'>('ARS')
  const [network, setNetwork] = useState<'ETH' | 'BASE' | 'SEPOLIA'>('BASE')
  const [isFaucetLoading, setIsFaucetLoading] = useState(false)

  // Quick bets según moneda
  const getQuickBets = () => {
    switch (currency) {
      case 'ARS':
        return [100, 250, 500, 1000, 5000]
      case 'ETH':
        return [0.001, 0.01, 0.05, 0.1, 0.5]
      case 'USDT':
      case 'USDC':
        return [1, 5, 10, 50, 100]
      default:
        return [100, 250, 500, 1000, 5000]
    }
  }

  // Límites según moneda
  const getBetLimits = () => {
    switch (currency) {
      case 'ARS':
        // ARS permite 0 (lobbys free) y hasta 100000
        return { min: 0, max: 100000 }
      case 'ETH':
        return { min: 0.001, max: 10 }
      case 'USDT':
      case 'USDC':
        return { min: 1, max: 10000 }
      default:
        return { min: 0, max: 100000 }
    }
  }

  const quickBets = getQuickBets()
  const betLimits = getBetLimits()

  // Separate lobbies into public and private
  const publicLobbies = lobbies.filter(l => l.isPublic)
  const privateLobbies = lobbies.filter(l => !l.isPublic)

  const handleCreate = async () => {
    const limits = betLimits;
    const numBetAmount = Number(betAmount);

    console.log('🎮 Crear Lobby - Debug:', {
      currency,
      betAmount,
      betAmountType: typeof betAmount,
      numBetAmount,
      limits,
      comparison: {
        'betAmount < limits.min': numBetAmount < limits.min,
        'betAmount > limits.max': numBetAmount > limits.max,
        calculation: `${numBetAmount} < ${limits.min} = ${numBetAmount < limits.min}`
      }
    });

    // Para permitir lobbys free en ARS, sólo invalidamos negativos
    if (isNaN(numBetAmount) || numBetAmount < 0) {
      alert('Por favor ingresa una apuesta válida (>= 0)');
      return;
    }

    if (numBetAmount < limits.min || numBetAmount > limits.max) {
      alert(`La apuesta debe estar entre ${limits.min} y ${limits.max.toLocaleString()} ${currency}`);
      return;
    }

    // Validar que el usuario tenga saldo suficiente en la moneda seleccionada
    const userBalance = user?.balances?.[currency] ?? (currency === 'ARS' ? user?.balance ?? 0 : 0);
    if (numBetAmount > 0 && userBalance < numBetAmount) {
      alert(`No tienes suficiente saldo en ${currency}. Saldo actual: ${userBalance.toLocaleString()}`);
      return;
    }

    // Validar network para crypto
    if (currency !== 'ARS' && !network) {
      alert('Debes seleccionar una red para crypto');
      return;
    }

    const apiUrl = getApiUrl();

    // ETH → usa onCreateGame (flujo on-chain que ya tenías)
    if (currency === 'ETH') {
      console.log('🔗 Creando lobby con ETH via onCreateGame...');
      onCreateGame(numBetAmount, maxPlayers, !isPrivate, password || undefined, currency, network);
      return;
    }

    // ARS → usar endpoint /lobbies (GameService, ARS_SANDBOX, público/privado, password)
if (currency === 'ARS') {
  try {
    const res = await fetch(`${apiUrl}/lobbies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-id': user?.walletId || 'anon',
      },
      body: JSON.stringify({
        betAmount: numBetAmount,
        isPublic: !isPrivate,
        password: isPrivate ? password : undefined,
        maxPlayers,
        currency: 'ARS',
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Error creando el lobby ARS')
      return
    }

    const newLobby = data.lobby
    const newLobbyId = newLobby?.id as string | undefined

    alert(`Lobby ARS creado! ID: ${newLobbyId || 'N/A'}`)

    // 👉 Auto-join del creador al lobby recién creado
    if (newLobbyId) {
      onJoinGame(newLobbyId, isPrivate ? password : undefined)
    }

    // Opcional: resetear formulario (por si vuelve a la pantalla de creación)
    setBetAmount(100)
    setPassword('')
    setIsPrivate(false)
    setCurrency('ARS')
    setNetwork('BASE')
    setSelectedAmount(null)
    setTab('public')

    return
  } catch (err) {
    console.error(err)
    alert('Error de red al crear el lobby ARS')
    return
  }
}


    // USDT / USDC → mantener flujo /lobby/create con token address (a futuro on-chain)
    try {
      // Mapear currency a address usando import.meta.env (Vite)
      let token = ''
      if (currency === 'USDT') {
        if (network === 'SEPOLIA') {
          token = import.meta.env.VITE_SEPOLIA_USDT_ADDRESS || '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0';
        } else {
          token = import.meta.env.VITE_TEST_USDT_ADDRESS || 'USDT';
        }
      } else if (currency === 'USDC') {
        if (network === 'SEPOLIA') {
          token = import.meta.env.VITE_SEPOLIA_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
        } else {
          token = import.meta.env.VITE_TEST_USDC_ADDRESS || 'USDC';
        }
      } else {
        token = currency; // fallback
      }

      const entryFee = numBetAmount.toString();
      const payload: any = {
        token,
        entryFee,
        maxPlayers,
      };

      // En este bloque currency es 'USDT' | 'USDC', así que siempre mandamos network
      payload.network = network;
      if (isPrivate) payload.password = password;

      const res = await fetch(`${apiUrl}/lobby/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-id': user?.walletId || 'anon',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error creando el lobby');
        return;
      }

      alert(`Lobby creado! ID: ${data.lobbyId || data.lobby?.id || 'N/A'}`);
      // En este bloque sólo estamos en USDT / USDC, así que reseteamos a 1 directo
      setBetAmount(1);
      setPassword('');
      setIsPrivate(false);
      setCurrency('ARS');
      setNetwork('BASE');
      setSelectedAmount(null);
      setTab('public');
    } catch (err: any) {
      alert('Error de red al crear el lobby');
      console.error(err);
    }
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

  const handleFaucetClick = async () => {
    if (!user) {
      alert('Debes iniciar sesión para recibir fichas ARS')
      return
    }
    try {
      setIsFaucetLoading(true)
      await faucetArs(1000)
    } catch (err: any) {
      alert(
        err instanceof Error
          ? err.message
          : 'Error al recibir fichas de práctica ARS'
      )
    } finally {
      setIsFaucetLoading(false)
    }
  }

  return (
    <div className="lobby-screen">
      {/* Header con Balance y acciones */}
      <div className="lobby-header">
        <div className="logo-section">
          <div className="uno-logo">₿ 🃏 ⟠ </div>
          <h1>Chain Table</h1>
          <p className="subtitle">Juega • Apuesta • Gana</p>
        </div>
        {/* Balance y acciones */}
        <div className="header-balance-section">
          <div className="balance-display-compact">
            <span className="balance-label">Saldo:</span>
            <span className="balance-value">
              ${(user?.balances?.ARS ?? user?.balance ?? 0).toLocaleString()} ARS
            </span>
            {(user?.balances?.ETH ?? 0) > 0 && (
              <span className="balance-value crypto-balance">
                {user?.balances.ETH.toFixed(4)} ETH
              </span>
            )}
            {(user?.balances?.USDT ?? 0) > 0 && (
              <span className="balance-value crypto-balance">
                {user?.balances.USDT.toFixed(2)} USDT
              </span>
            )}
            {(user?.balances?.USDC ?? 0) > 0 && (
              <span className="balance-value crypto-balance">
                {user?.balances.USDC.toFixed(2)} USDC
              </span>
            )}
          </div>
          <div className="header-actions">
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
            <button
              className="btn-faucet-header"
              onClick={handleFaucetClick}
              disabled={isFaucetLoading || !user}
            >
              {isFaucetLoading ? '⏳ Fichas...' : '🎁 Fichas ARS'}
            </button>
            {onNavigate && (
              <button
                className="btn-ranking-header"
                onClick={() => onNavigate('leaderboard')}
              >
                🏆 Ranking
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="lobby-tabs">
        <button
          className={`tab-btn ${tab === 'public' ? 'active' : ''}`}
          onClick={() => setTab('public')}
        >
          <span className="icon">🔓</span>
          Públicos
        </button>
        <button
          className={`tab-btn ${tab === 'private' ? 'active' : ''}`}
          onClick={() => setTab('private')}
        >
          <span className="icon">🔒</span>
          Privados
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
        {/* públicos */}
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
                <p>¡Crea uno e invita a tus amigos!</p>
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
                        <span className="bet-currency">
                          {lobby.currency}
                          {lobby.network ? ` (${lobby.network})` : ''}
                        </span>
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

        {/* privados */}
        {tab === 'private' && (
          <div className="private-games">
            <div className="content-header">
              <h2>Juegos Privados</h2>
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
                    <div className="card-badge">🔒</div>

                    <div className="card-content">
                      <div className="bet-section">
                        <span className="bet-label">Apuesta</span>
                        <span className="bet-value">${lobby.betAmount}</span>
                        <span className="bet-currency">
                          {lobby.currency}
                          {lobby.network ? ` (${lobby.network})` : ''}
                        </span>
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

        {/* crear */}
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
                      {currency === 'ARS' ? '$' : ''}{bet} {currency !== 'ARS' ? currency : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Currency Selector */}
              <div className="form-group">
                <label className="form-label">💱 Tipo de Moneda</label>
                <div className="currency-selector">
                  <button
                    className={`currency-option ${currency === 'ARS' ? 'active' : ''}`}
                    onClick={() => {
                      setCurrency('ARS')
                      setBetAmount(100)
                      setSelectedAmount(null)
                    }}
                  >
                    🇦🇷 ARS (Fiat)
                  </button>
                  <button
                    className={`currency-option ${currency === 'USDT' ? 'active' : ''}`}
                    onClick={() => {
                      setCurrency('USDT')
                      setBetAmount(1)
                      setSelectedAmount(null)
                    }}
                  >
                    💵 USDT
                  </button>
                  <button
                    className={`currency-option ${currency === 'USDC' ? 'active' : ''}`}
                    onClick={() => {
                      setCurrency('USDC')
                      setBetAmount(1)
                      setSelectedAmount(null)
                    }}
                  >
                    💵 USDC
                  </button>
                  <button
                    className={`currency-option ${currency === 'ETH' ? 'active' : ''}`}
                    onClick={() => {
                      setCurrency('ETH')
                      setBetAmount(0.001)
                      setSelectedAmount(null)
                    }}
                  >
                    ⟠ ETH
                  </button>
                </div>
              </div>

              {/* Network Selector (for ETH, USDT, USDC) */}
              {(currency === 'ETH' || currency === 'USDT' || currency === 'USDC') && (
                <div className="form-group">
                  <label className="form-label">🌐 Red Blockchain</label>
                  <div className="network-selector">
                    {currency === 'ETH' && (
                      <>
                        <button
                          className={`network-option ${network === 'SEPOLIA' ? 'active' : ''}`}
                          onClick={() => setNetwork('SEPOLIA')}
                        >
                          Sepolia
                        </button>
                        <button
                          className={`network-option ${network === 'BASE' ? 'active' : ''}`}
                          onClick={() => setNetwork('BASE')}
                        >
                          Base
                        </button>
                      </>
                    )}
                    {(currency === 'USDT' || currency === 'USDC') && (
                      <>
                        <button
                          className={`network-option ${network === 'BASE' ? 'active' : ''}`}
                          onClick={() => setNetwork('BASE')}
                        >
                          Base (L2)
                        </button>
                        <button
                          className={`network-option ${network === 'SEPOLIA' ? 'active' : ''}`}
                          onClick={() => setNetwork('SEPOLIA')}
                        >
                          Sepolia (Testnet)
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Info: USDT/USDC red seleccionada */}
              {(currency === 'USDT' || currency === 'USDC') && (
                <div className="network-info">
                  <span className="network-badge">
                    🌐 Red: {network === 'BASE' ? 'Base (L2)' : 'Sepolia (Testnet)'}
                  </span>
                </div>
              )}

              {/* Custom Bet Input */}
              <div className="form-group">
                <label className="form-label">Apuesta Personalizada</label>
                <div className="custom-input-group">
                  <span className="currency">{currency === 'ARS' ? '$' : ''}</span>
                  <input
                    type="number"
                    min={betLimits.min}
                    max={betLimits.max}
                    step={currency === 'ETH' ? '0.001' : currency === 'ARS' ? '1' : '0.1'}
                    value={betAmount}
                    onChange={(e) => {
                      setBetAmount(Number(e.target.value))
                      setSelectedAmount(null)
                    }}
                    placeholder={betLimits.min.toString()}
                    className="custom-input"
                  />
                  <span className="unit">{currency}</span>
                </div>
                <small className="input-hint">
                  Min {betLimits.min} • Max {betLimits.max.toLocaleString()} {currency}
                </small>
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
                disabled={loading || betAmount < betLimits.min}
              >
                {loading ? '⏳ Creando...' : '🎮 CREAR LOBBY'}
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
