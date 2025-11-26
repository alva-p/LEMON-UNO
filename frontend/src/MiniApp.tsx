import React, { useEffect, useState, lazy, Suspense } from 'react'
import { isWebView } from './lemon-mini-app-sdk'
import { useAuth } from './context/AuthContext'
import { AuthScreen } from './screens/AuthScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { useGameWebSocket, GameScreen as GameScreenEnum } from './hooks/useGameWebSocket'
import { DeeplinkListener, DeeplinkAction } from './utils/deeplinks'

// Lazy load GameScreen para mejorar performance
const GameScreen = lazy(() => import('./screens/GameScreen').then(m => ({ default: m.GameScreen })))
const LeaderboardScreen = lazy(() => import('./screens/LeaderboardScreen').then(m => ({ default: m.LeaderboardScreen })))

/**
 * Get the correct API URL based on environment
 */
function getApiUrl(): string {
  // En desarrollo, usar la IP local si no estamos en localhost
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:3000'
  }
  // Si accedemos por IP (desde celular), reemplazar puerto 5173 con 3000
  return `http://${window.location.hostname}:3000`
}

type Screen = 'lobby' | 'waiting' | 'game' | 'leaderboard'

export const MiniApp: React.FC = () => {
  const { isAuthenticated, user } = useAuth()
  const [screen, setScreen] = useState<Screen>('lobby')
  const [gameId, setGameId] = useState<string | null>(null)
  const [playerIndex, setPlayerIndex] = useState<number | null>(null)
  const [lobbies, setLobbies] = useState<any[]>([])
  const [loadingLobbies, setLoadingLobbies] = useState(true)
  const [webview, setWebview] = useState<boolean | null>(null)
  const [currentLobby, setCurrentLobby] = useState<any | null>(null)
  const [lobbyPlayers, setLobbyPlayers] = useState<any[]>([])

  const walletId = user?.address || `wallet_${Math.random().toString(36).slice(2, 11)}`

  // Solo conectarse al WebSocket cuando estamos en game screen, no en waiting
  const { gameState, connected, error: wsError, playCard, drawCard, callUno } = useGameWebSocket(
    screen === 'game' ? (gameId || '') : '',
    playerIndex ?? 0
  )

  useEffect(() => {
    setWebview(isWebView())

    // Setup deeplink listeners
    const unsubscribeLaunch = DeeplinkListener.on(DeeplinkAction.LAUNCH_WEBVIEW, (data) => {
      console.log('🔗 Deeplink LAUNCH_WEBVIEW recibido:', data)

      // Manejar parámetros específicos del deeplink
      if (data.params?.gameId) {
        // Unirse a un juego específico
        handleJoinGame(data.params.gameId, data.params.password)
      } else if (data.params?.lobbyId) {
        // Unirse a un lobby específico
        handleJoinGame(data.params.lobbyId, data.params.password)
      } else if (data.params?.userId) {
        // Ver perfil de usuario
        console.log('Viendo perfil:', data.params.userId)
      } else if (data.params?.tournamentId) {
        // Ver torneo
        console.log('Viendo torneo:', data.params.tournamentId)
      } else {
        // Abrir app normalmente
        setScreen('lobby')
      }
    })

    const unsubscribeDetail = DeeplinkListener.on(DeeplinkAction.SHOW_DETAIL, (data) => {
      console.log('🔗 Deeplink SHOW_DETAIL recibido:', data)
      // Mostrar detail page
      if (data.params?.userId) {
        console.log('Mostrando detail de usuario:', data.params.userId)
      }
    })

    return () => {
      unsubscribeLaunch()
      unsubscribeDetail()
    }
  }, [])

  const handleCreateGame = async (betAmount: number, maxPlayers: number, isPublic: boolean, password?: string) => {
    try {
      const res = await fetch(`${getApiUrl()}/lobbies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-id': walletId,
        },
        body: JSON.stringify({ betAmount, maxPlayers, isPublic, password }),
      })

      if (!res.ok) throw new Error('Error al crear lobby')
      const data = await res.json()
      setGameId(data.lobby.id)
      setCurrentLobby(data.lobby)
      setLobbyPlayers(data.lobby.players || [])
      setScreen('waiting')
    } catch (err) {
      console.error('Error creating game:', err)
      alert('Error al crear el juego')
    }
  }

  const handleJoinGame = async (lobbyId: string, password?: string) => {
    try {
      console.log(`🎮 Joining lobby ${lobbyId}...`)
      const res = await fetch(`${getApiUrl()}/lobbies/${lobbyId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-id': walletId,
        },
        body: JSON.stringify({ password }),
      })

      if (!res.ok) throw new Error('Error al unirse')
      const data = await res.json()
      console.log(`✅ Joined successfully. Lobby:`, data.lobby)
      console.log(`   📊 Players in lobby: ${data.lobby.players?.length || 0}/${data.lobby.maxPlayers}`)
      const idx = data.lobby.players.findIndex((p: any) => p.id === walletId)
      console.log(`   🎯 Your player index: ${idx}`)
      setPlayerIndex(idx >= 0 ? idx : 0)
      setGameId(lobbyId)
      setCurrentLobby(data.lobby)
      setLobbyPlayers(data.lobby.players || [])
      setScreen('waiting')
      console.log(`👉 Switched to waiting screen. LobbyID: ${lobbyId}`)
    } catch (err) {
      console.error('Error joining game:', err)
      alert('Error al unirse al juego')
    }
  }

  const handleStartGame = async (lobbyId: string) => {
    try {
      console.log(`🎬 handleStartGame called for lobbyId: ${lobbyId}`)
      console.log(`   Current lobbyPlayers.length: ${lobbyPlayers.length}`)
      
      if (lobbyPlayers.length < 2) {
        console.warn(`⚠️ NOT ENOUGH PLAYERS! Aborting start. Only ${lobbyPlayers.length} players`)
        alert(`No hay suficientes jugadores. Se necesitan 2, hay ${lobbyPlayers.length}`)
        return
      }
      
      const res = await fetch(`${getApiUrl()}/lobbies/${lobbyId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-id': walletId,
        },
      })

      if (!res.ok) throw new Error('Error al iniciar')
      const data = await res.json()
      console.log(`✅ Game started successfully. GameId: ${data.gameId}`)
      setGameId(data.gameId)
      setScreen('game')
    } catch (err) {
      console.error('Error starting game:', err)
      alert('Error al iniciar el juego')
    }
  }

  const handleCancelLobby = async (lobbyId: string) => {
    try {
      const res = await fetch(`${getApiUrl()}/lobbies/${lobbyId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-id': walletId,
        },
      })

      if (!res.ok) throw new Error('Error al cancelar')
      setScreen('lobby')
      setGameId(null)
      setCurrentLobby(null)
      setLobbyPlayers([])
    } catch (err) {
      console.error('Error cancelling lobby:', err)
      alert('Error al cancelar el lobby')
    }
  }

  // Fetch current lobby details when in waiting screen
  useEffect(() => {
    if (screen !== 'waiting' || !gameId) {
      console.log(`⏭️ Skipping lobby fetch: screen=${screen}, gameId=${gameId}`)
      return
    }

    const fetchLobbyDetails = async () => {
      try {
        console.log(`🔄 Fetching lobby ${gameId}...`)
        const res = await fetch(`${getApiUrl()}/lobbies/${gameId}`)
        if (!res.ok) throw new Error('Lobby not found')
        const data = await res.json()
        const lobby = data.lobby || data
        console.log(`✅ Lobby fetched:`, lobby)
        console.log(`   📊 Players: ${lobby.players?.length || 0} / ${lobby.maxPlayers}`)
        console.log(`   ⏱️ Status: ${lobby.status}`)
        
        // Si el juego ya comenzó, cambiar a game screen con el gameId correcto
        if (lobby.status === 'started' && lobby.gameId) {
          console.log(`🎮 Game has started! Changing to game screen with gameId=${lobby.gameId}`)
          setGameId(lobby.gameId)
          setScreen('game')
          return
        }
        
        setCurrentLobby(lobby)
        setLobbyPlayers(lobby.players || [])
      } catch (err) {
        console.error('Error fetching lobby details:', err)
      }
    }

    fetchLobbyDetails()
    const interval = setInterval(fetchLobbyDetails, 2000) // Refresh every 2s

    return () => clearInterval(interval)
  }, [screen, gameId])

  // Log when lobbyPlayers changes
  useEffect(() => {
    console.log(`👥 Lobby players updated: ${lobbyPlayers.length}/${currentLobby?.maxPlayers || 2}`)
    if (screen === 'waiting') {
      console.log(`   Button disabled: ${lobbyPlayers.length < 2}`)
      if (lobbyPlayers.length >= 2) {
        console.log(`   🎬 Can now start game!`)
      }
    }
  }, [lobbyPlayers, currentLobby, screen])

  // Fetch lobbies - more frequently when on lobby screen
  useEffect(() => {
    const fetchLobbies = async () => {
      try {
        setLoadingLobbies(true)
        const res = await fetch(`${getApiUrl()}/lobbies`)
        if (!res.ok) throw new Error('Error al cargar lobbies')
        const data = await res.json()
        setLobbies(data.lobbies || [])
      } catch (err) {
        console.error('Error fetching lobbies:', err)
      } finally {
        setLoadingLobbies(false)
      }
    }

    fetchLobbies()
    // Refresh more frequently (2s) when on lobby screen, less frequently (10s) otherwise
    const interval = setInterval(fetchLobbies, screen === 'lobby' ? 2000 : 10000)

    return () => clearInterval(interval)
  }, [screen])

  if (!webview && webview !== null) {
    // En desarrollo, permitir acceso aunque no sea WebView
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname.includes('192.168')
    if (!isDevelopment) {
      return (
        <div className="card">
          <h2>Lemon UNO</h2>
          <p>📱 This app only works inside Lemon Cash</p>
          <p>Open it from the Lemon Cash Mini Apps section to play!</p>
        </div>
      )
    }
  }

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return <AuthScreen />
  }

  return (
    <div className="app">
      {screen === 'lobby' && (
        <LobbyScreen
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
          lobbies={lobbies}
          loading={loadingLobbies}
        />
      )}

      {screen === 'waiting' && (
        currentLobby ? (
        <div className="waiting-screen">
          <div className="waiting-header">
            <h2>🎮 Esperando Jugadores</h2>
            <p className="lobby-tag">Lobby #{currentLobby.id.slice(-8)}</p>
          </div>

          <div className="lobby-info">
            <div className="lobby-stat">
              <span className="stat-label">Apuesta</span>
              <span className="stat-value">${currentLobby.betAmount} ARS</span>
            </div>
            <div className="lobby-stat">
              <span className="stat-label">Privacidad</span>
              <span className="stat-value">{currentLobby.isPublic ? '🔓 Público' : '🔒 Privado'}</span>
            </div>
            <div className="lobby-stat">
              <span className="stat-label">Capacidad</span>
              <span className="stat-value">{lobbyPlayers.length}/{currentLobby.maxPlayers}</span>
            </div>
          </div>

          <div className="players-list">
            <h3>Jugadores en el Lobby</h3>
            <div className="players-grid">
              {lobbyPlayers.map((player, idx) => (
                <div key={idx} className="player-card">
                  <div className="player-avatar">{player.name?.charAt(0).toUpperCase() || '👤'}</div>
                  <div className="player-name">{player.name || 'Jugador'}</div>
                  <div className="player-status">
                    {player.id === walletId && <span className="your-badge">Tú</span>}
                  </div>
                </div>
              ))}

              {lobbyPlayers.length < currentLobby.maxPlayers && (
                <div className="player-card empty">
                  <div className="player-avatar">+</div>
                  <div className="player-name">Esperando...</div>
                </div>
              )}
            </div>
          </div>

          <div className="waiting-actions">
            {currentLobby.creatorId === walletId ? (
              <>
                <button
                  className="btn-start"
                  onClick={() => {
                    if (gameId) {
                      handleStartGame(gameId)
                    }
                  }}
                  disabled={lobbyPlayers.length < 2}
                >
                  {lobbyPlayers.length < 2
                    ? `⏳ Esperando ${2 - lobbyPlayers.length} jugador${2 - lobbyPlayers.length > 1 ? 'es' : ''} más...`
                    : '🚀 INICIAR JUEGO'}
                </button>
                <button 
                  className="btn-cancel" 
                  onClick={() => {
                    if (gameId) {
                      handleCancelLobby(gameId)
                    }
                  }}
                >
                  ❌ Cancelar Lobby
                </button>
              </>
            ) : (
              <button className="btn-cancel" onClick={() => setScreen('lobby')}>
                ← Volver a Lobbies
              </button>
            )}
          </div>
        </div>
        ) : (
          <div className="waiting-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <div className="spinner"></div>
            <p style={{ color: '#fff', marginTop: '20px' }}>Cargando lobby...</p>
          </div>
        )
      )}

      {screen === 'game' && gameState && (
        <Suspense fallback={
          <div className="screen">
            <div className="spinner"></div>
            <p>Cargando juego...</p>
          </div>
        }>
          <GameScreen
            gameState={gameState}
            playerIndex={playerIndex ?? 0}
            onPlayCard={playCard}
            onDrawCard={drawCard}
            connected={connected}
            onGameEnd={() => {
              setScreen('lobby')
              setGameId(null)
              setPlayerIndex(null)
            }}
          />
        </Suspense>
      )}

      {screen === 'leaderboard' && (
        <Suspense fallback={
          <div className="screen">
            <div className="spinner"></div>
            <p>Cargando rankings...</p>
          </div>
        }>
          <LeaderboardScreen walletId={walletId} />
        </Suspense>
      )}

      {/* Navigation */}
      <div className="bottom-nav">
        <button className={screen === 'lobby' ? 'active' : ''} onClick={() => setScreen('lobby')}>
          🎮 Lobby
        </button>
        <button
          className={screen === 'game' ? 'active' : ''}
          onClick={() => setScreen('game')}
          disabled={!gameId}
        >
          🃏 Game
        </button>
        <button className={screen === 'leaderboard' ? 'active' : ''} onClick={() => setScreen('leaderboard')}>
          🏆 Ranking
        </button>
      </div>

      {wsError && <div className="error-banner">{wsError}</div>}
    </div>
  )
}
