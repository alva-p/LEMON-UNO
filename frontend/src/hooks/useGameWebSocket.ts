/**
 * WebSocket client for UNO game
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export enum GameScreen {
  LOBBY = 'LOBBY',
  WAITING = 'WAITING',
  GAME = 'GAME',
  LEADERBOARD = 'LEADERBOARD',
}

export interface GameState {
  id: string
  phase: string
  players: any[]
  currentPlayerIndex: number
  direction: number
  deck: any[]
  discardPile: any[]
  currentWildColor?: string
  winner?: string
  bet: number
  pot: number
}

export function useGameWebSocket(gameId: string, playerIndex: number) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!gameId || playerIndex === undefined) {
      console.log(`⏭️ WebSocket: Skipping connection (gameId=${gameId}, playerIndex=${playerIndex})`)
      return
    }

    // Prefer explicit VITE_WS_URL; else derive from VITE_API_URL or hostname
    const viteWs = (import.meta.env.VITE_WS_URL as string | undefined) || ''
    let wsUrl = viteWs
    if (!wsUrl) {
      const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) || ''
      if (apiUrl) {
        // Convert http(s)://host to ws(s)://host
        try {
          const url = new URL(apiUrl)
          const wsProto = url.protocol === 'https:' ? 'wss:' : 'ws:'
          wsUrl = `${wsProto}//${url.host}`
        } catch {
          // Fallback to hostname
          const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          const host = window.location.hostname === 'localhost' ? '127.0.0.1:3001' : `${window.location.hostname}:3001`
          wsUrl = `${proto}//${host}`
        }
      } else {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = window.location.hostname === 'localhost' ? '127.0.0.1:3001' : `${window.location.hostname}:3001`
        wsUrl = `${proto}//${host}`
      }
    }

    wsUrl = `${wsUrl}?gameId=${gameId}&playerIndex=${playerIndex}`

    console.log(`🔌 WebSocket: Connecting to ${wsUrl}`)
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setConnected(true)
      setError(null)
      console.log(`✅ WebSocket connected`)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'GAME_STATE') {
          setGameState(message.payload)
        } else if (message.type === 'ERROR') {
          setError(message.payload?.error || 'Unknown error')
        }
      } catch (err) {
        console.error('WebSocket message error:', err)
      }
    }

    ws.onerror = () => {
      setError('Connection error')
      setConnected(false)
      console.log(`❌ WebSocket error`)
    }

    ws.onclose = () => {
      setConnected(false)
      console.log(`🔌 WebSocket closed`)
    }

    wsRef.current = ws

    return () => {
      ws.close()
    }
  }, [gameId, playerIndex])

  const sendMessage = useCallback(
    (type: string, payload?: any) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type, gameId, playerIndex, payload }))
      }
    },
    [gameId, playerIndex]
  )

  const playCard = useCallback(
    (cardId: string, chosenColor?: string) => {
      sendMessage('PLAY_CARD', { cardId, chosenColor })
    },
    [sendMessage]
  )

  const drawCard = useCallback(() => {
    sendMessage('DRAW_CARD')
  }, [sendMessage])

  const callUno = useCallback(() => {
    sendMessage('CALL_UNO')
  }, [sendMessage])

  return {
    gameState,
    connected,
    error,
    playCard,
    drawCard,
    callUno,
  }
}
