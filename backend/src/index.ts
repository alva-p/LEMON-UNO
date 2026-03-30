import express, { Request, Response, NextFunction } from 'express'
import http from 'http'
import WebSocket from 'ws'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { createPublicClient, http as viemHttp } from 'viem'
import { baseSepolia } from 'viem/chains'
import { GameService } from './services/GameService'
import { UserService } from './services/UserService'
import { TransactionService } from './services/TransactionService'
import { NonceService } from './services/NonceService'
import { GameWebSocketHandler, WSMessage } from './api/websocket'
import { getPlayableCards } from './game/cards'
import { ContractService } from './services/ContractService'
import 'dotenv/config'

// DB y stats
import { testDbConnection, pool } from './db'
import { getMatchStatsForWallet, saveMatchResult } from './matchStats'

// Persistencia
import { loadState, startAutosave } from './services/StateStore'

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// Enable CORS for all routes
const allowedOrigins = [
  process.env.FRONTEND_URL,                 // producción (Vercel)
  'https://lemon-uno.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
].filter(Boolean) as string[]

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (curl, Postman, WebView de Lemon Cash)
      if (!origin) return callback(null, true)
      // Permitir cualquier IP local (192.168.x.x, 10.x.x.x, 172.x.x.x)
      if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)) {
        return callback(null, true)
      }
      // Permitir cualquier subdominio de vercel.app (previews)
      if (/\.vercel\.app$/.test(origin)) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      callback(new Error(`CORS: origin ${origin} not allowed`))
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-wallet-id'],
  }),
)


// ============ RATE LIMITING ============

/** General: 100 req/min por IP */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

/** Endpoints críticos: 10 req/min por IP */
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests on this endpoint, please slow down.' },
})

/** Auth: 20 req/min por IP */
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
})

app.use(generalLimiter)

// ============ ADMIN KEY MIDDLEWARE ============

const ADMIN_KEY = process.env.ADMIN_KEY

function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_KEY) {
    // Si no está configurado, bloquear siempre
    return res.status(403).json({ error: 'Admin endpoints disabled' })
  }
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid or missing x-admin-key' })
  }
  next()
}

// ============ MIDDLEWARE ============
app.use(express.json())

// Services
const gameService = new GameService()
const userService = new UserService()
const transactionService = new TransactionService(userService)
const nonceService = new NonceService()
const contractService = new ContractService('BASE')

// Restaurar estado previo si existe
const savedState = loadState()
if (savedState) {
  gameService.loadPersistedState(savedState)
}

// Autosave cada 30s + al cerrar el proceso
startAutosave(() => ({
  ...gameService.getPersistedState(),
  savedAt: new Date().toISOString(),
}))

// Variable to throttle /lobbies log
let lastLobbiesLogTime = 0

// Viem client for SIWE verification (Base Sepolia en testnet, Base mainnet en prod)
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: viemHttp(),
})

// Map of game handlers
const gameHandlers: Map<string, GameWebSocketHandler> = new Map()

// ============ ON-CHAIN EVENT LISTENER ============
// Cuando un lobby on-chain se llena, busca el lobby backend correspondiente
// y arranca el juego automáticamente.
contractService['ready'].then(() => {
  contractService.onLobbyStarted(async (contractLobbyId, playerCount) => {
    const allLobbies = gameService.getAllLobbies()
    const lobby = allLobbies.find(
      (l) => l.contractLobbyId === contractLobbyId && l.status === 'waiting',
    )

    if (!lobby) {
      console.warn(`[WS] LobbyStarted para contractLobbyId=${contractLobbyId} sin lobby backend asociado`)
      return
    }

    // Rellenar jugadores desde on-chain si hacen falta
    try {
      const onChainPlayers = await contractService.getLobbyPlayers(contractLobbyId)
      for (const addr of onChainPlayers) {
        gameService.joinLobby(lobby.id, addr)
      }
    } catch (err) {
      console.error('[WS] Error leyendo jugadores on-chain:', err)
    }

    const result = gameService.startGame(lobby.id)
    if (result.success) {
      console.log(`🎮 Juego iniciado por evento on-chain — gameId=${result.gameId}, lobbyId=${lobby.id}`)
    } else {
      console.error(`[WS] startGame falló para lobby ${lobby.id}: ${result.error}`)
    }
  })
})

// ============ REST API ============

/**
 * Rankings de jugadores (usa player_stats / players)
 * GET /rankings?limit=10
 * (Este endpoint queda como estaba, basado en player_stats)
 */
app.get('/rankings', async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 10
  try {
    const result = await pool.query(
      `SELECT p.username, p.wallet_address, ps.games_won, ps.games_played,
              ps.total_won_ars, ps.total_won_eth, ps.total_won_usdt, ps.total_won_usdc
       FROM player_stats ps
       JOIN players p ON p.id = ps.player_id
       ORDER BY ps.games_won DESC, ps.games_played DESC
       LIMIT $1`,
      [limit],
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching rankings:', err)
    res.status(500).json({ error: 'Error fetching rankings' })
  }
})

/**
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

/**
 * DEBUG: insertar una partida de ejemplo en la BD
 * POST /debug/seed-game
 */
app.post('/debug/seed-game', requireAdminKey, async (req: Request, res: Response) => {
  try {
    const players = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ]

    const now = new Date()

    await saveMatchResult({
      gameId: '11111111-1111-1111-1111-111111111111', // UUID válido
      winnerWallet: players[0],
      pot: 1000,
      betAmount: 500,
      currency: 'ARS',
      network: undefined,
      players,
      createdAt: now,
      startedAt: now,
      finishedAt: now,
    })

    res.json({ ok: true, message: 'Demo game inserted', players })
  } catch (err) {
    console.error('Error in /debug/seed-game:', err)
    res.status(500).json({ error: 'Failed to seed demo game' })
  }
})

/**
 * Faucet ARS sandbox
 * POST /sandbox/ars/faucet
 * Headers: { "x-wallet-id": string }
 * Body: { amount?: number }
 * Devuelve: { balance: number }
 */
app.post('/sandbox/ars/faucet', (req: Request, res: Response) => {
  let walletId = (req.headers['x-wallet-id'] as string) || 'anon'

  const { amount } = req.body ?? {}
  const creditAmount =
    typeof amount === 'number' && amount > 0
      ? amount
      : 1000 // por defecto, 1000 "fichas" ARS de práctica

  try {
    gameService.creditArsSandbox(walletId, creditAmount)
    const newBalance = gameService.getArsSandboxBalance(walletId)

    console.log(`💧 Faucet ARS → ${walletId} +${creditAmount}. Nuevo saldo: ${newBalance}`)

    res.json({ balance: newBalance })
  } catch (err) {
    console.error('Error en faucet ARS:', err)
    res.status(500).json({ error: 'No se pudieron asignar fichas ARS' })
  }
})

/**
 * Consultar balance ARS sandbox
 * GET /sandbox/ars/balance
 * Headers: { "x-wallet-id": string }
 */
app.get('/sandbox/ars/balance', (req: Request, res: Response) => {
  const walletId = (req.headers['x-wallet-id'] as string) || 'anon'
  const balance = gameService.getArsSandboxBalance(walletId)
  res.json({ balance })
})

/**
 * Ver comisiones acumuladas de la casa (solo para admin/debug)
 * GET /admin/house-fees
 */
app.get('/admin/house-fees', requireAdminKey, (_req: Request, res: Response) => {
  res.json({ houseFeeBalance: gameService.getHouseFeeBalance() })
})

/**
 * Generate a new SIWE nonce
 * POST /auth/nonce
 * Body: {}
 * Returns: { nonce: string }
 */
app.post('/auth/nonce', authLimiter, (req: Request, res: Response) => {
  try {
    const nonce = nonceService.generateNonce()
    res.json({ nonce })
  } catch (err) {
    console.error('Nonce generation error:', err)
    res.status(500).json({ error: 'Failed to generate nonce' })
  }
})

/**
 * SIWE Authentication - Verify signed message
 * POST /auth/verify
 * Body: { wallet: string, signature: string, message: string, nonce: string }
 */
app.post('/auth/verify', authLimiter, async (req: Request, res: Response) => {
  try {
    const { wallet, signature, message, nonce } = req.body

    // Validate input
    if (!wallet || !signature || !message || !nonce) {
      return res
        .status(400)
        .json({ error: 'Missing wallet, signature, message, or nonce' })
    }

    if (!wallet.startsWith('0x') || wallet.length !== 42) {
      return res.status(400).json({ error: 'Invalid Ethereum address' })
    }

    // Validate nonce
    const nonceValidation = nonceService.validateNonce(nonce)
    if (!nonceValidation.valid) {
      return res.status(401).json({ error: nonceValidation.error })
    }

    // Check that nonce is in the signed message
    if (!message.includes(nonce)) {
      return res.status(401).json({ error: 'Nonce mismatch in signed message' })
    }

    // Mock signature for development (signature = 0x + 'ab' repeated)
    const isMockSignature = signature === '0x' + 'ab'.repeat(65)

    if (isMockSignature) {
      // En desarrollo, aceptar firmas mock
      console.log('✅ Mock signature detectada - aceptando en desarrollo')
      nonceService.markNonceAsUsed(nonce)
      const user = userService.getOrCreateUser(wallet, `User_${wallet.slice(2, 8)}`)
      return res.json({
        verified: true,
        user: {
          address: user.id,
          username: user.username,
          balance: user.balance,
          totalWins: user.totalWins,
          totalPoints: user.totalPoints,
        },
      })
    }

    // Verify SIWE signature using viem (supports ERC-6492 for contract wallets)
    let isValidSignature = false
    try {
      isValidSignature = await publicClient.verifySiweMessage({
        message: message,
        signature: signature as `0x${string}`,
        address: wallet as `0x${string}`,
      })
    } catch (err) {
      console.error('SIWE verification error:', err)
      return res.status(401).json({ error: 'Signature verification failed' })
    }

    if (!isValidSignature) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    // Mark nonce as used (prevents replay attacks)
    nonceService.markNonceAsUsed(nonce)

    // Get or create user
    const user = userService.getOrCreateUser(wallet, `User_${wallet.slice(2, 8)}`)

    // Return user data
    res.json({
      verified: true,
      user: {
        address: user.id,
        username: user.username,
        balance: user.balance,
        totalWins: user.totalWins,
        totalPoints: user.totalPoints,
      },
    })
  } catch (err) {
    console.error('Auth verify error:', err)
    res.status(500).json({ error: 'Server error during authentication' })
  }
})

/**
 * Create a new lobby on-chain (contrato directo)
 * POST /lobby/create
 */
app.post('/lobby/create', strictLimiter, async (req: Request, res: Response) => {
  try {
    const { token, entryFee, maxPlayers } = req.body
    if (!token || !entryFee || !maxPlayers) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Autenticar sesión con billetera MOCK (desarrollo)
    const MOCK_WALLETS = [
      '0x1Ed17b06961B9B8DE78Ee924BcDaBC003aaE1867',
      '0x2aEb1aB4d3d5A2Fe3bC8D1e5F9c3D7B1A9E5F2c4',
      '0x3B9cD5f2E8a7C9D1B4f5E8a2C6D9e1F3a5B8C2d4',
    ]
    let walletId = req.headers['x-wallet-id'] as string
    if (!walletId || walletId === 'anon') {
      walletId = MOCK_WALLETS[0]
    }
    if (!MOCK_WALLETS.includes(walletId)) {
      return res.status(401).json({
        error: 'La dirección de la sesión no es una billetera MOCK válida.',
      })
    }

    // Rama fiat ARS: usar GameService (sandbox, sin contrato)
    if (token === 'ARS') {
      try {
        const gameLobby = await gameService.createLobby(
          walletId,
          Number(entryFee),
          true,
          maxPlayers,
          undefined,
          'ARS',
        )
        return res.json({
          lobby: {
            ...gameLobby,
            contractLobbyId: gameLobby.contractLobbyId?.toString(),
          },
        })
      } catch (err) {
        console.error('Error creando lobby ARS (contract route):', err)
        return res.status(500).json({ error: (err as Error).message })
      }
    }

    // Crypto: crear lobby on-chain via ContractService
    const entryFeeBigInt = BigInt(entryFee)
    const lobbyId = await contractService.createLobby(token, entryFeeBigInt, maxPlayers)
    if (!lobbyId) {
      return res.status(500).json({ error: 'Lobby creation failed' })
    }
    res.json({ lobbyId })
  } catch (err: any) {
    if (err.message && err.message.includes('insufficient funds')) {
      return res.status(400).json({
        error: 'Fondos insuficientes para crear el lobby. Verifica tu balance y gas.',
      })
    }
    res.status(500).json({ error: err.message || 'Internal error' })
  }
})

/**
 * Create a new lobby (API principal usada por la mini-app)
 * POST /lobbies
 */
app.post('/lobbies', strictLimiter, async (req: Request, res: Response) => {
  const walletId = (req.headers['x-wallet-id'] as string) || 'anon'
  const { betAmount, isPublic, password, maxPlayers = 2, currency = 'ARS', network } = req.body

  // Validar moneda
  const validCurrencies = ['ARS', 'ETH', 'USDT', 'USDC']
  if (!validCurrencies.includes(currency)) {
    return res
      .status(400)
      .json({ error: 'Invalid currency. Must be ARS, ETH, USDT, or USDC' })
  }

  // Validar monto de apuesta:
  if (currency === 'ARS') {
    if (betAmount == null || betAmount < 0) {
      return res
        .status(400)
        .json({ error: 'Invalid bet amount for ARS. Must be >= 0' })
    }
  } else {
    let minBet = 0
    let maxBet = 0
    if (currency === 'ETH') {
      minBet = 0.001
      maxBet = 10
    }
    if (currency === 'USDT' || currency === 'USDC') {
      minBet = 1
      maxBet = 10000
    }

    if (!betAmount || betAmount < minBet || betAmount > maxBet) {
      return res.status(400).json({
        error: `Invalid bet amount for ${currency}. Min: ${minBet}, Max: ${maxBet}`,
      })
    }
  }

  // Para ARS no se requiere network ni contrato (sandbox)
  if (currency === 'ARS') {
    try {
      const lobby = await gameService.createLobby(
        walletId,
        betAmount,
        isPublic,
        maxPlayers,
        password,
        currency,
      )
      console.log(`🎮 Nuevo lobby ARS creado: ${lobby.id}`)
      return res.json({
        lobby: {
          ...lobby,
          contractLobbyId: lobby.contractLobbyId?.toString(),
        },
      })
    } catch (err) {
      console.error('Error creando lobby ARS:', err)
      return res.status(500).json({ error: (err as Error).message })
    }
  }

  // Para crypto, validar network
  const validNetworks = ['ETH', 'BASE']
  if (!network || !validNetworks.includes(network)) {
    return res
      .status(400)
      .json({ error: 'Network required for crypto. Must be ETH or BASE' })
  }

  try {
    const lobby = await gameService.createLobby(
      walletId,
      betAmount,
      isPublic,
      maxPlayers,
      password,
      currency,
      network,
    )

    // Crear lobby on-chain y guardar el contractLobbyId
    const { ethers } = await import('ethers')
    const tokenAddress = currency === 'ETH'
      ? ethers.ZeroAddress
      : ethers.ZeroAddress // TODO: mapear USDT/USDC a sus addresses en Base

    const entryFeeWei = currency === 'ETH'
      ? BigInt(Math.round(betAmount * 1e18))
      : BigInt(Math.round(betAmount * 1e6)) // USDT/USDC tienen 6 decimales

    try {
      const onChainResult = await contractService.createLobby(tokenAddress, entryFeeWei, maxPlayers)
      if (onChainResult) {
        lobby.contractLobbyId = BigInt(onChainResult.lobbyId)
        lobby.txHash = onChainResult.txHash
        console.log(`⛓️  On-chain lobby creado: contractLobbyId=${onChainResult.lobbyId}, tx=${onChainResult.txHash}`)
      }
    } catch (onChainErr) {
      // No bloquear la creación del lobby backend si falla on-chain
      console.error('⚠️  Error creando lobby on-chain (lobby backend creado igual):', onChainErr)
    }

    console.log(`🎮 New lobby created: ${lobby.id}`)
    console.log(
      `   Creator: ${walletId}, Bet: ${betAmount} ${currency}${
        network ? ` (${network})` : ''
      }, Public: ${isPublic}`,
    )
    res.json({
      lobby: {
        id: lobby.id,
        creator: lobby.creator,
        creatorId: lobby.creatorId,
        betAmount: lobby.betAmount,
        currency: lobby.currency,
        network: lobby.network,
        isPublic: lobby.isPublic,
        maxPlayers: lobby.maxPlayers,
        players: lobby.players,
        createdAt: lobby.createdAt,
        contractLobbyId: lobby.contractLobbyId?.toString(),
        txHash: lobby.txHash,
      },
    })
  } catch (err) {
    console.error('Error creating lobby:', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

/**
 * Get all lobbies (public and private)
 * GET /lobbies
 */
app.get('/lobbies', (req: Request, res: Response) => {
  const lobbies = gameService.getAllLobbies()
  const now = Date.now()

  if (now - lastLobbiesLogTime > 5000) {
    console.log(`📋 GET /lobbies - Found ${lobbies.length} lobbies`)
    lobbies.forEach((l) => {
      console.log(
        `   - ${l.id} (creator: ${l.creator}, bet: $${l.betAmount}, players: ${l.players.length})`,
      )
    })
    lastLobbiesLogTime = now
  }

  const formattedLobbies = lobbies.map((lobby) => ({
    ...lobby,
    contractLobbyId: lobby.contractLobbyId?.toString(),
  }))
  res.json({ lobbies: formattedLobbies })
})

/**
 * Get lobby details
 * GET /lobbies/:lobbyId
 */
app.get('/lobbies/:lobbyId', (req: Request, res: Response) => {
  const lobbyId = req.params.lobbyId
  console.log(`🔍 GET lobby ${lobbyId}`)

  const lobby = gameService.getLobby(lobbyId)
  if (!lobby) {
    console.log(`❌ Lobby no encontrado: ${lobbyId}`)
    console.log(
      `📋 Lobbies disponibles:`,
      Array.from(gameService.getAllLobbies().map((l) => l.id)),
    )
    return res.status(404).json({ error: 'Lobby not found' })
  }

  console.log(`✅ Lobby encontrado con ${lobby.players.length} jugadores`)
  const formattedLobby = {
    ...lobby,
    contractLobbyId: lobby.contractLobbyId?.toString(),
  }
  res.json({ lobby: formattedLobby })
})

/**
 * Join lobby
 * POST /lobbies/:lobbyId/join
 */
app.post('/lobbies/:lobbyId/join', strictLimiter, (req: Request, res: Response) => {
  const walletId = (req.headers['x-wallet-id'] as string) || 'anon'
  const { password } = req.body
  const lobbyId = req.params.lobbyId

  console.log(`👤 Jugador ${walletId} intenta unirse a lobby ${lobbyId}`)

  const result = gameService.joinLobby(lobbyId, walletId, password)
  if (!result.success) {
    console.log(`❌ Join failed: ${result.error}`)
    return res.status(400).json({ error: result.error })
  }

  const lobby = gameService.getLobby(lobbyId)
  console.log(`✅ Join exitoso. Lobby ahora tiene ${lobby?.players.length} jugadores`)

  // Auto-arrancar cuando el lobby está lleno
  // Para CRYPTO: el arranque lo dispara el evento LobbyStarted on-chain
  if (lobby && lobby.players.length >= lobby.maxPlayers && lobby.status === 'waiting' && lobby.economyMode !== 'CRYPTO') {
    const startResult = gameService.startGame(lobbyId)
    if (startResult.success) {
      console.log(`🎮 Juego iniciado automáticamente — gameId=${startResult.gameId}`)
    }
  }

  const updatedLobby = gameService.getLobby(lobbyId)
  const formattedLobby = updatedLobby
    ? { ...updatedLobby, contractLobbyId: updatedLobby.contractLobbyId?.toString() }
    : null
  res.json({ lobby: formattedLobby })
})

/**
 * Start game from lobby
 * POST /lobbies/:lobbyId/start
 */
app.post('/lobbies/:lobbyId/start', (req: Request, res: Response) => {
  const walletId = (req.headers['x-wallet-id'] as string) || 'anon'
  const lobbyId = req.params.lobbyId

  console.log(`🎬 POST /lobbies/${lobbyId}/start requested by ${walletId}`)

  const lobby = gameService.getLobby(lobbyId)

  if (!lobby) {
    console.log(`❌ Lobby not found: ${lobbyId}`)
    return res.status(404).json({ error: 'Lobby not found' })
  }

  if (lobby.creatorId !== walletId) {
    console.log(
      `❌ Only creator can start. Creator: ${lobby.creatorId}, Requester: ${walletId}`,
    )
    return res
      .status(403)
      .json({ error: 'Only the lobby creator can start the game' })
  }

  console.log(`🚀 Starting game from lobby ${lobbyId}`)
  const result = gameService.startGame(lobbyId)
  if (!result.success) {
    console.log(`❌ Start game failed: ${result.error}`)
    return res.status(400).json({ error: result.error })
  }

  console.log(`✅ Game started: gameId=${result.gameId}`)
  const gameState = gameService.getGameState(result.gameId!)
  res.json({ gameId: result.gameId, gameState })
})

/**
 * Cancel lobby (only creator, only when waiting)
 * POST /lobbies/:lobbyId/cancel
 */
app.post('/lobbies/:lobbyId/cancel', (req: Request, res: Response) => {
  const walletId = (req.headers['x-wallet-id'] as string) || 'anon'

  const result = gameService.cancelLobby(req.params.lobbyId, walletId)
  if (!result.success) {
    return res.status(400).json({ error: result.error })
  }

  res.json({ success: true, message: 'Lobby cancelled' })
})

/**
 * Get points leaderboard (DB)
 * GET /leaderboards/points?limit=50
 *
 * Basado en:
 *  - match_players
 *  - matches
 *  - players (para username, si existe)
 */
app.get('/leaderboards/points', async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50

  try {
    const result = await pool.query(
      `
      SELECT
        LOWER(mp.wallet_address) AS wallet,
        COALESCE(
          p.username,
          'Player_' || SUBSTRING(LOWER(mp.wallet_address) FROM 3 FOR 6)
        ) AS username,
        COUNT(*) AS games_played,
        COUNT(*) FILTER (WHERE mp.is_winner) AS wins
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.id
      LEFT JOIN players p ON LOWER(p.wallet_address) = LOWER(mp.wallet_address)
      GROUP BY wallet, username
      ORDER BY wins DESC, games_played DESC
      LIMIT $1
      `,
      [limit],
    )

    const rows = result.rows

    const leaderboard = rows.map((row: any, index: number) => {
      const gamesPlayed = Number(row.games_played) || 0
      const wins = Number(row.wins) || 0
      const losses = gamesPlayed - wins

      return {
        rank: index + 1,
        userId: row.wallet,
        username: row.username,
        wins,
        points: wins, // Por ahora, puntos = partidas ganadas
        losses,
      }
    })

    res.json(leaderboard)
  } catch (err) {
    console.error('Error fetching points leaderboard:', err)
    res.status(500).json({ error: 'Error fetching points leaderboard' })
  }
})

/**
 * Get money leaderboard (DB)
 * GET /leaderboards/money?limit=50
 *
 * Basado en:
 *  - match_players (prize)
 *  - matches
 *  - players (para username)
 */
app.get('/leaderboards/money', async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50

  try {
    const result = await pool.query(
      `
      SELECT
        LOWER(p.wallet_address) AS wallet,
        COALESCE(p.username, 'Player_' || SUBSTRING(LOWER(p.wallet_address) FROM 3 FOR 6)) AS username,
        COALESCE(ps.games_won, 0) AS wins,
        COALESCE(ps.games_played, 0) AS games_played,
        COALESCE(ps.total_won_ars, 0)   AS earnings_ars,
        COALESCE(ps.total_won_eth, 0)   AS earnings_eth,
        COALESCE(ps.total_won_usdt, 0)  AS earnings_usdt,
        COALESCE(ps.total_won_usdc, 0)  AS earnings_usdc,
        (COALESCE(ps.total_won_ars,0) + COALESCE(ps.total_won_eth,0) + COALESCE(ps.total_won_usdt,0) + COALESCE(ps.total_won_usdc,0)) AS total_earnings
      FROM players p
      LEFT JOIN player_stats ps ON ps.player_id = p.id
      ORDER BY total_earnings DESC NULLS LAST, wins DESC, username ASC
      LIMIT $1
      `,
      [limit],
    )

    const rows = result.rows

    const leaderboard = rows.map((row: any, index: number) => {
      const wins = Number(row.wins) || 0
      const gamesPlayed = Number(row.games_played) || 0
      const losses = Math.max(gamesPlayed - wins, 0)
      const earningsARS = Number(row.earnings_ars) || 0
      const earningsETH = Number(row.earnings_eth) || 0
      const earningsUSDT = Number(row.earnings_usdt) || 0
      const earningsUSDC = Number(row.earnings_usdc) || 0
      const earnings = earningsARS + earningsETH + earningsUSDT + earningsUSDC
      return {
        rank: index + 1,
        userId: row.wallet,
        username: row.username,
        wins,
        losses,
        earnings,
        earningsARS,
        earningsETH,
        earningsUSDT,
        earningsUSDC,
      }
    })

    res.json(leaderboard)
  } catch (err) {
    console.error('Error fetching money leaderboard:', err)
    res.status(500).json({ error: 'Error fetching money leaderboard' })
  }
})

/**
 * Player match stats (DB)
 * GET /stats/:walletId
 */
app.get('/stats/:walletId', async (req: Request, res: Response) => {
  const { walletId } = req.params

  try {
    const stats = await getMatchStatsForWallet(walletId)

    if (!stats) {
      return res.status(404).json({ error: 'No stats found for this wallet yet' })
    }

    return res.json(stats)
  } catch (err) {
    console.error('Error fetching match stats:', err)
    return res.status(500).json({ error: 'Error fetching match stats' })
  }
})

/**
 * Get game state
 * GET /games/:gameId
 */
app.get('/games/:gameId', (req: Request, res: Response) => {
  const gameState = gameService.getGameState(req.params.gameId)
  if (!gameState || gameState.discardPile.length === 0) {
    return res.status(404).json({ error: 'Game not found' })
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const topCard = gameState.discardPile[gameState.discardPile.length - 1]
  const playableCardIds =
    topCard && currentPlayer
      ? getPlayableCards(
          currentPlayer.hand,
          topCard,
          gameState.currentWildColor,
          gameState.pendingDrawCount,
          gameState.pendingDrawType,
        )
      : []

  res.json({
    ...gameState,
    playableCardIds,
  })
})

/**
 * Nuevo: pasar turno
 * POST /games/:gameId/pass-turn
 */
app.post('/games/:gameId/pass-turn', (req: Request, res: Response) => {
  const { gameId } = req.params
  const { playerIndex } = req.body

  if (typeof playerIndex !== 'number') {
    return res.status(400).json({ error: 'playerIndex is required and must be a number' })
  }

  const gameState = gameService.getGameState(gameId)
  if (!gameState) {
    return res.status(404).json({ error: 'Game not found' })
  }

  if (gameState.currentPlayerIndex !== playerIndex) {
    return res.status(400).json({ error: 'Not your turn' })
  }

  const result = gameService.passTurn(gameId, playerIndex)

  if (!result.success) {
    return res.status(400).json({ error: result.error })
  }

  const updatedState = gameService.getGameState(gameId)

  return res.json({
    success: true,
    gameState: updatedState,
  })
})

/**
 * Get leaderboard (in-memory, legacy)
 * GET /leaderboard?limit=50
 */
app.get('/leaderboard', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50
  const leaderboard = userService.getLeaderboard(limit)
  res.json(
    leaderboard.map((user, idx) => ({
      rank: idx + 1,
      username: user.username,
      wins: user.totalWins,
      points: user.totalPoints,
      balance: user.balance,
    })),
  )
})

/**
 * Get user profile
 * GET /users/:walletId
 */
app.get('/users/:walletId', (req: Request, res: Response) => {
  const user = userService.getUser(req.params.walletId)
  if (!user) {
    return res.status(404).json({ error: 'User not found' })
  }
  res.json(user)
})

// ============ WEBSOCKET ============

// Periodically broadcast game state updates for timers
setInterval(() => {
  gameHandlers.forEach((handler) => {
    handler.broadcastGameState()
  })
}, 1000)

wss.on('connection', (ws: WebSocket, req) => {
  const gameId = new URL(req.url!, `http://${req.headers.host}`).searchParams.get('gameId')
  const playerIdStr = new URL(req.url!, `http://${req.headers.host}`).searchParams.get(
    'playerIndex',
  )

  if (!gameId || !playerIdStr) {
    ws.close(1000, 'Missing gameId or playerIndex')
    return
  }

  const playerIndex = parseInt(playerIdStr)

  let handler = gameHandlers.get(gameId)
  if (!handler) {
    handler = new GameWebSocketHandler(gameService, gameId)
    gameHandlers.set(gameId, handler)
  }

  handler.addClient(playerIndex, ws)

  ws.on('message', (data) => {
    try {
      const message: WSMessage = JSON.parse(data.toString())
      handler!.handleMessage(playerIndex, message)
    } catch (err) {
      console.error('WebSocket message error:', err)
    }
  })

  ws.on('close', () => {
    handler!.removeClient(playerIndex)
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err)
  })
})

// ============ START SERVER ============

const PORT = parseInt(process.env.PORT || '3001', 10)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Lemon UNO Server running on port ${PORT}`)
  console.log(`   HTTP: http://localhost:${PORT}`)
  console.log(`   HTTP: http://0.0.0.0:${PORT}`)
  console.log(`   WebSocket: ws://localhost:${PORT}`)

  // Check de conexión a la DB al arrancar
  testDbConnection()
    .then(() => {
      console.log('✅ Database connection OK')
    })
    .catch((err) => {
      console.error('❌ Database connection failed:', err)
    })
})
