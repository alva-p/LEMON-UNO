import express, { Request, Response } from 'express'
import http from 'http'
import WebSocket from 'ws'
import cors from 'cors'
import { createPublicClient, http as viemHttp, parseEther } from 'viem'
import { polygonAmoy } from 'viem/chains'
import { GameService } from './services/GameService'
import { UserService } from './services/UserService'
import { TransactionService } from './services/TransactionService'
import { NonceService } from './services/NonceService'
import { GameWebSocketHandler, WSMessage, WSMessageType } from './api/websocket'
import { getPlayableCards } from './game/cards'

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-wallet-id'],
}))

// Middleware
app.use(express.json())

// Services
const gameService = new GameService()
const userService = new UserService()
const transactionService = new TransactionService(userService)
const nonceService = new NonceService()

// Viem client for SIWE verification
const publicClient = createPublicClient({
  chain: polygonAmoy,
  transport: viemHttp(),
})

// Map of game handlers
const gameHandlers: Map<string, GameWebSocketHandler> = new Map()

app.use(express.json())

// ============ REST API ============

/**
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

/**
 * Generate a new SIWE nonce
 * POST /auth/nonce
 * Body: {}
 * Returns: { nonce: string }
 */
app.post('/auth/nonce', (req: Request, res: Response) => {
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
app.post('/auth/verify', async (req: Request, res: Response) => {
  try {
    const { wallet, signature, message, nonce } = req.body

    // Validate input
    if (!wallet || !signature || !message || !nonce) {
      return res.status(400).json({ error: 'Missing wallet, signature, message, or nonce' })
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
 * Create a new lobby
 * POST /lobbies
 * Body: { betAmount: number, isPublic: boolean, password?: string, maxPlayers?: number, currency?: 'ARS' | 'ETH' | 'USDT' | 'USDC', network?: 'ETH' | 'BASE' }
 */
app.post('/lobbies', (req: Request, res: Response) => {
  const walletId = (req.headers['x-wallet-id'] as string) || 'anon'
  const { betAmount, isPublic, password, maxPlayers = 2, currency = 'ARS', network } = req.body

  // Validate currency first
  const validCurrencies = ['ARS', 'ETH', 'USDT', 'USDC']
  if (!validCurrencies.includes(currency)) {
    return res.status(400).json({ error: 'Invalid currency. Must be ARS, ETH, USDT, or USDC' })
  }

  // Validate bet amount based on currency
  let minBet = 100
  let maxBet = 100000
  
  switch (currency) {
    case 'ARS':
      minBet = 100
      maxBet = 100000
      break
    case 'ETH':
      minBet = 0.001
      maxBet = 10
      break
    case 'USDT':
    case 'USDC':
      minBet = 1
      maxBet = 10000
      break
  }

  if (!betAmount || betAmount < minBet || betAmount > maxBet) {
    return res.status(400).json({ 
      error: `Invalid bet amount for ${currency}. Min: ${minBet}, Max: ${maxBet}` 
    })
  }

  // Validate network for crypto
  if (currency !== 'ARS') {
    const validNetworks = ['ETH', 'BASE']
    if (!network || !validNetworks.includes(network)) {
      return res.status(400).json({ error: 'Network required for crypto. Must be ETH or BASE' })
    }
  }

  const lobby = gameService.createLobby(walletId, betAmount, isPublic, maxPlayers, password, currency, network)
  console.log(`🎮 New lobby created: ${lobby.id}`)
  console.log(`   Creator: ${walletId}, Bet: ${betAmount} ${currency}${network ? ` (${network})` : ''}, Public: ${isPublic}`)
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
    }
  })
})

/**
 * Get all lobbies (public and private)
 * GET /lobbies
 */
app.get('/lobbies', (req: Request, res: Response) => {
  const lobbies = gameService.getAllLobbies()
  console.log(`📋 GET /lobbies - Found ${lobbies.length} lobbies`)
  lobbies.forEach(l => {
    console.log(`   - ${l.id} (creator: ${l.creator}, bet: $${l.betAmount}, players: ${l.players.length})`)
  })
  // Format response to match frontend expectations
  res.json({ lobbies })
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
    console.log(`📋 Lobbies disponibles:`, Array.from(gameService.getAllLobbies().map(l => l.id)))
    return res.status(404).json({ error: 'Lobby not found' })
  }
  
  console.log(`✅ Lobby encontrado con ${lobby.players.length} jugadores`)
  res.json({ lobby })
})

/**
 * Join lobby
 * POST /lobbies/:lobbyId/join
 * Body: { password?: string }
 */
app.post('/lobbies/:lobbyId/join', (req: Request, res: Response) => {
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
  res.json({ lobby })
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
  
  // Only creator can start the game
  if (!lobby) {
    console.log(`❌ Lobby not found: ${lobbyId}`)
    return res.status(404).json({ error: 'Lobby not found' })
  }
  
  if (lobby.creatorId !== walletId) {
    console.log(`❌ Only creator can start. Creator: ${lobby.creatorId}, Requester: ${walletId}`)
    return res.status(403).json({ error: 'Only the lobby creator can start the game' })
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
 * Get points leaderboard
 * GET /leaderboards/points?limit=50
 */
app.get('/leaderboards/points', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50
  const leaderboard = userService.getPointsLeaderboard(limit)
  
  // Format response with rank
  const formattedLeaderboard = leaderboard.map((user, index) => ({
    rank: index + 1,
    userId: user.id,
    username: user.username,
    points: user.totalPoints,
    wins: user.totalWins,
    losses: user.totalLosses,
  }))
  
  res.json(formattedLeaderboard)
})

/**
 * Get money leaderboard
 * GET /leaderboards/money?limit=50
 */
app.get('/leaderboards/money', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50
  const leaderboard = userService.getMoneyLeaderboard(limit)
  
  // Format response with rank
  const formattedLeaderboard = leaderboard.map((user, index) => ({
    rank: index + 1,
    userId: user.id,
    username: user.username,
    earnings: user.totalEarnings,
    wins: user.totalWins,
    losses: user.totalLosses,
  }))
  
  res.json(formattedLeaderboard)
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
  
  // Add playable cards for the current player
  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const topCard = gameState.discardPile[gameState.discardPile.length - 1]
  const playableCardIds = topCard && currentPlayer
    ? getPlayableCards(currentPlayer.hand, topCard, gameState.currentWildColor, gameState.pendingDrawCount, gameState.pendingDrawType) 
    : []
  
  res.json({
    ...gameState,
    playableCardIds, // IDs of cards that can be played
  })
})

/**
 * Get leaderboard
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
    }))
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
}, 1000) // Update every 1 second

wss.on('connection', (ws: WebSocket, req) => {
  const gameId = new URL(req.url!, `http://${req.headers.host}`).searchParams.get('gameId')
  const playerIdStr = new URL(req.url!, `http://${req.headers.host}`).searchParams.get('playerIndex')

  if (!gameId || !playerIdStr) {
    ws.close(1000, 'Missing gameId or playerIndex')
    return
  }

  const playerIndex = parseInt(playerIdStr)

  // Get or create game handler
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

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`🎮 Lemon UNO Server running on port ${PORT}`)
  console.log(`   HTTP: http://localhost:${PORT}`)
  console.log(`   WebSocket: ws://localhost:${PORT}`)
})

