import React, { useEffect, useState, lazy, Suspense } from 'react'
import { isWebView } from './lemon-mini-app-sdk'
import { useAuth } from './context/AuthContext'
import { AuthScreen } from './screens/AuthScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { useGameWebSocket, GameScreen as GameScreenEnum } from './hooks/useGameWebSocket'
import { DeeplinkListener, DeeplinkAction } from './utils/deeplinks'
import { callSmartContract, TransactionResult, ChainId, ContractStandard } from './lemon-mini-app-sdk'
import { ethers } from 'ethers'

// Lazy load GameScreen para mejorar performance
const GameScreen = lazy(() => import('./screens/GameScreen').then(m => ({ default: m.GameScreen })))
const LeaderboardScreen = lazy(() => import('./screens/LeaderboardScreen').then(m => ({ default: m.LeaderboardScreen })))

function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;

  // 1) Producción / Vercel → DEBE ser https
  if (typeof envUrl === "string" && envUrl.startsWith("https://")) {
    return envUrl;
  }

  // 2) Localhost
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:3001";
  }

  // 3) Red local
  const host = window.location.hostname;
  if (
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host.startsWith("172.")
  ) {
    return `http://${host}:3001`;
  }

  // 4) Producción fallback seguro
  return "https://lemon-uno.onrender.com";
}



type Screen = 'lobby' | 'waiting' | 'game' | 'leaderboard'

export const MiniApp: React.FC = () => {
  const { isAuthenticated, user, updateBalance } = useAuth()
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
  const { gameState, connected, error: wsError, playCard, drawCard, callUno, challengeUno } = useGameWebSocket(
    screen === 'game' ? (gameId || '') : '',
    playerIndex ?? 0
  )

  useEffect(() => {
    setWebview(isWebView())

    // Handle invite link query params (?lobbyId=...&password=...)
    const params = new URLSearchParams(window.location.search)
    const inviteLobbyId = params.get('lobbyId')
    if (inviteLobbyId) {
      const invitePassword = params.get('password') || undefined
      // Clean the URL so it doesn't re-trigger on refresh
      window.history.replaceState({}, '', window.location.pathname)
      // Join after auth is confirmed (slight delay)
      setTimeout(() => handleJoinGame(inviteLobbyId, invitePassword), 800)
    }

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

  const handleCreateGame = async (
    betAmount: number, 
    maxPlayers: number, 
    isPublic: boolean, 
    password?: string,
    currency: 'ARS' | 'ETH' | 'USDT' | 'USDC' = 'ARS',
    network?: 'ETH' | 'BASE' | 'SEPOLIA'
  ) => {
    try {
      // Crear lobby en backend (ahora maneja ETH on-chain automáticamente)
      const body: any = { betAmount, maxPlayers, isPublic, password, currency }
      if (currency !== 'ARS' && network) {
        // Map SEPOLIA to ETH for backend compatibility
        const backendNetwork = network === 'SEPOLIA' ? 'ETH' : network
        body.network = backendNetwork
      }

      const res = await fetch(`${getApiUrl()}/lobbies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-id': walletId,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Error al crear lobby')
      const data = await res.json()

      // Si es CRYPTO, el creador debe unirse on-chain (paga su apuesta)
      if (currency !== 'ARS' && data.lobby.contractLobbyId) {
        console.log('⛓️ Lobby CRYPTO creado. Uniendo creador on-chain...')
        await joinLobbyOnChain(data.lobby)
        console.log('✅ Creador unido on-chain. TxHash del lobby:', data.lobby.txHash)
      }

      // Para ARS, el backend retorna el lobby completo en data.lobby
      // Buscar el índice del creador en la lista de jugadores
      let idx = 0;
      if (data.lobby && data.lobby.players) {
        idx = data.lobby.players.findIndex((p: any) => p.id === walletId);
      }
      setPlayerIndex(idx >= 0 ? idx : 0);
      setGameId(data.lobby.id);
      setCurrentLobby(data.lobby);
      setLobbyPlayers(data.lobby.players || []);
      setScreen('waiting');

      console.log('✅ Lobby creado completamente:', data.lobby.id);
    } catch (err) {
      console.error('Error creating game:', err);
      alert(`Error al crear el juego: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    }
  }

  /**
   * Determina el chainId del SDK según la red del lobby
   */
  const getLobbyChainId = (network?: string): ChainId => {
    if (network === 'BASE') return ChainId.BASE
    if (network === 'ETH') return ChainId.ETH_SEPOLIA
    return ChainId.POLYGON_AMOY
  }

  /**
   * Obtiene la dirección del token ERC20 según currency y network
   */
  const getTokenAddress = (currency: string, network?: string): string => {
    if (currency === 'USDC') {
      return network === 'ETH'
        ? import.meta.env.VITE_SEPOLIA_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
        : import.meta.env.VITE_TEST_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
    }
    if (currency === 'USDT') {
      return network === 'ETH'
        ? import.meta.env.VITE_SEPOLIA_USDT_ADDRESS || '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0'
        : import.meta.env.VITE_TEST_USDT_ADDRESS || '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0'
    }
    return ''
  }

  /**
   * Join on-chain: llama a `joinLobby(contractLobbyId)` en UnoLobbyV2 via Lemon SDK.
   * Para ERC20 (USDC/USDT) hace un batch: approve + joinLobby.
   * Para ETH envía el valor nativo.
   */
  const joinLobbyOnChain = async (lobby: any): Promise<boolean> => {
    const contractLobbyId = lobby.contractLobbyId
    if (!contractLobbyId) return true // sin contrato on-chain → skip, continúa igual

    const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS_BASE_SEPOLIA
    if (!contractAddress) {
      console.warn('VITE_CONTRACT_ADDRESS_BASE_SEPOLIA no configurado. Saltando join on-chain.')
      return true
    }

    const chainId = getLobbyChainId(lobby.network)
    const betAmountStr = lobby.betAmount?.toString() ?? '0'

    try {
      let result

      if (lobby.currency === 'ETH') {
        // ETH nativo: joinLobby payable
        const valueWei = ethers.parseEther(betAmountStr).toString()
        result = await callSmartContract({
          contracts: [{
            contractAddress,
            functionName: 'joinLobby',
            functionParams: [contractLobbyId],
            value: valueWei,
            chainId,
          }],
          titleValues: { amount: betAmountStr, currency: 'ETH' },
          descriptionValues: { lobbyId: contractLobbyId },
        })
      } else if (lobby.currency === 'USDC' || lobby.currency === 'USDT') {
        // ERC20: approve (Permit2 vía SDK) + joinLobby en batch
        const tokenAddress = getTokenAddress(lobby.currency, lobby.network)
        const decimals = 6 // USDC/USDT usan 6 decimales
        const amountWei = (parseFloat(betAmountStr) * 10 ** decimals).toString()

        result = await callSmartContract({
          contracts: [
            {
              contractAddress: tokenAddress,
              functionName: 'approve',
              functionParams: [contractAddress, amountWei],
              value: '0',
              chainId,
              contractStandard: ContractStandard.ERC20,
            },
            {
              contractAddress,
              functionName: 'joinLobby',
              functionParams: [contractLobbyId],
              value: '0',
              chainId,
            },
          ],
          titleValues: { amount: betAmountStr, currency: lobby.currency },
          descriptionValues: { lobbyId: contractLobbyId },
        })
      } else {
        return true // ARS u otros → sin on-chain
      }

      if (result.result === TransactionResult.FAILED) {
        throw new Error(result.error?.message || 'Error en transacción on-chain')
      }
      if (result.result === TransactionResult.CANCELLED) {
        throw new Error('Transacción cancelada por el usuario')
      }

      console.log('✅ Join on-chain exitoso. TxHash:', result.data?.txHash)
      return true
    } catch (err) {
      console.error('Error en join on-chain:', err)
      throw err
    }
  }

  const handleJoinGame = async (lobbyId: string, password?: string) => {
    try {
      console.log(`🎮 Joining lobby ${lobbyId}...`)

      // Si el lobby es crypto con contractLobbyId → join on-chain primero
      const lobbyData = lobbies.find((l: any) => l.id === lobbyId)
      if (lobbyData?.currency !== 'ARS' && lobbyData?.contractLobbyId) {
        console.log(`⛓️ Lobby crypto con contractLobbyId=${lobbyData.contractLobbyId}. Join on-chain...`)
        await joinLobbyOnChain(lobbyData)
      }

      const res = await fetch(`${getApiUrl()}/lobbies/${lobbyId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-id': walletId,
        },
        body: JSON.stringify({ password }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(errorData.error || 'Error al unirse')
      }
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

  // Refresca el balance ARS sandbox desde el backend (lo llama el ganador al terminar)
  const refreshArsBalance = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/sandbox/ars/balance`, {
        headers: { 'x-wallet-id': walletId },
      })
      if (!res.ok) return
      const data = await res.json()
      updateBalance(data.balance, 'ARS')
      console.log('💰 Balance ARS actualizado:', data.balance)
    } catch (err) {
      console.error('Error refreshing ARS balance:', err)
    }
  }

  // Cuando el juego termina, refrescar balance ARS
  useEffect(() => {
    if (gameState?.winner && gameState?.currency === 'ARS') {
      refreshArsBalance()
    }
  }, [gameState?.winner])

  // ⏭ NUEVO: handler para pasar turno después de robar
  const handlePassTurn = async () => {
    if (!gameId || playerIndex === null) {
      console.warn('No gameId or playerIndex to pass turn')
      return
    }

    try {
      console.log('⏭ Passing turn for player', playerIndex, 'in game', gameId)

      // Ajustá la ruta si tu backend usa otro endpoint (por ejemplo /games/:id/pass)
      const res = await fetch(`${getApiUrl()}/games/${gameId}/pass-turn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-id': walletId,
        },
        body: JSON.stringify({ playerIndex }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.error('Error passing turn:', data)
        alert(data.error || 'Error al pasar el turno')
        return
      }

      // No hace falta setear gameState acá: el WebSocket enviará el nuevo estado
      console.log('✅ Turn passed successfully')
    } catch (err) {
      console.error('Network error passing turn:', err)
      alert('Error de red al pasar el turno')
    }
  }

  // Fetch current lobby details when in waiting screen
  useEffect(() => {
    if (screen !== 'waiting' || !gameId) {
      console.log(`⏭️ Skipping lobby fetch: screen=${screen}, gameId=${gameId}`)
      return
    }

    const leaveLobby = (reason: string) => {
      alert(reason)
      setScreen('lobby')
      setGameId(null)
      setCurrentLobby(null)
      setLobbyPlayers([])
    }

    const fetchLobbyDetails = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/lobbies/${gameId}`)

        // Lobby eliminado o no encontrado
        if (res.status === 404) {
          leaveLobby('El lobby ya no existe.')
          return
        }
        if (!res.ok) throw new Error('Error al obtener lobby')

        const data = await res.json()
        const lobby = data.lobby || data

        // Lobby cancelado por el creador
        if (lobby.status === 'cancelled') {
          leaveLobby('El lobby fue cancelado por el creador.')
          return
        }

        // Juego iniciado → pasar a game screen
        if (lobby.status === 'started' && lobby.gameId) {
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

  // Log cuando cambia lobbyPlayers
  useEffect(() => {
    console.log(`👥 Lobby players updated: ${lobbyPlayers.length}/${currentLobby?.maxPlayers || 2}`)
    if (screen === 'waiting') {
      console.log(`   Button disabled: ${lobbyPlayers.length < 2}`)
      if (lobbyPlayers.length >= 2) {
        console.log(`   🎬 Can now start game!`)
      }
    }
  }, [lobbyPlayers, currentLobby, screen])

  // Fetch lobbies - más frecuente en pantalla de lobby
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

  // Gate: permitir modo web si VITE_ENABLE_WEB=1
  // WebView Gate (corregido para producción real)
/* ============================================================
   🟢 WebView Gate corregido (permite ver en Vercel)
   ============================================================ */
if (!webview && webview !== null) {
  const host = window.location.hostname;

  const allowed =
    host === "localhost" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host.includes("vercel.app") ||
    host.endsWith("alva-p.xyz");

  if (!allowed) {
    return (
      <div className="card">
        <h2>Lemon UNO</h2>
        <p>📱 This app only works inside Lemon Cash</p>
        <p>Open it from the Lemon Cash Mini Apps section to play!</p>
      </div>
    );
  }
}


  // Esperar a que se determine si es WebView o no
if (webview === null) {
  return (
    <div className="screen">
      <p>Cargando...</p>
    </div>
  )
}

// Si todavía no está autenticado
if (!isAuthenticated) {
  return <AuthScreen />
}



  return (
    <div className="app">
      {screen === 'lobby' && (
        <LobbyScreen
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
          onNavigate={setScreen}
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
              <span className="stat-value">
                {currentLobby.currency === 'ARS' ? '$' : ''}{currentLobby.betAmount} {currentLobby.currency}
              </span>
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

          {/* Invite link for private lobbies */}
          {!currentLobby.isPublic && gameId && (
            <div className="invite-section">
              <p className="invite-label">🔒 Sala privada — compartí el link:</p>
              <button
                className="btn-copy-invite"
                onClick={() => {
                  const base = window.location.origin + window.location.pathname
                  const url = `${base}?lobbyId=${gameId}${currentLobby.password ? `&password=${encodeURIComponent(currentLobby.password)}` : ''}`
                  navigator.clipboard.writeText(url).then(() => {
                    alert('📋 Link copiado al portapapeles')
                  }).catch(() => {
                    prompt('Copiá este link:', url)
                  })
                }}
              >
                📋 Copiar link de invitación
              </button>
            </div>
          )}

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
            onPassTurn={handlePassTurn}
            onCallUno={callUno}
            onChallengeUno={challengeUno}
            connected={connected}
            onGameEnd={() => {
              setScreen('lobby')
              setGameId(null)
              setPlayerIndex(null)
            }}
            onLeaderboard={() => {
              setScreen('leaderboard')
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

      {/* Navigation - Solo mostrar en la pantalla principal (no en lobby ni waiting) */}
      {screen !== 'lobby' && screen !== 'waiting' && (
        <div className="bottom-nav">
          <button onClick={() => setScreen('lobby')}>
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
      )}

      {/* Mensaje de error eliminado por requerimiento */}
    </div>
  )
}
