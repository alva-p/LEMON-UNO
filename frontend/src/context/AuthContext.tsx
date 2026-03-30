import React, { createContext, useContext, useState, useEffect } from 'react'
import { TransactionResult } from '@lemoncash/mini-app-sdk'
import { isWebView } from '../lemon-mini-app-sdk'
import { authenticate, ChainId } from '../lemon-mini-app-sdk'

/* ============================================================
   🔧 API URL – versión unificada y segura
   ============================================================ */
function getApiUrl(): string {
  const host = window.location.hostname
  const envUrl = import.meta.env.VITE_API_URL

  // Producción con Vercel o dominio propio → SIEMPRE HTTPS
  if (typeof envUrl === 'string' && envUrl.startsWith('https://')) {
    return envUrl
  }

  // Localhost → usar HTTP local
  if (host === 'localhost') return 'http://localhost:3001'

  // LAN → HTTP
  if (
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.')
  ) {
    return `http://${host}:3001`
  }

  // Fallback seguro
  return 'https://api.alva-p.xyz'
}

export interface User {
  walletId: string
  address: string
  username: string
  balance: number
  balances: {
    ARS: number
    ETH: number
    USDT: number
    USDC: number
  }
  wins: number
  points: number
}

export interface AuthContextType {
  user: User | null
  isWebView: boolean
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: () => Promise<void>
  logout: () => void
  updateBalance: (amount: number, currency?: 'ARS' | 'ETH' | 'USDT' | 'USDC') => void
  addWin: (points: number) => void
  faucetArs: (amount?: number) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isWebViewMode, setIsWebViewMode] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* ============================================================
     🔄 Restaurar sesión + detectar Webview
     ============================================================ */
  useEffect(() => {
    const init = async () => {
      const webViewMode = isWebView()
      setIsWebViewMode(webViewMode)

      // ── DEV PLAYER OVERRIDE ──────────────────────────────────────
      // Tab 1: http://localhost:5173?player=alice
      // Tab 2: http://localhost:5173?player=bob
      if (!webViewMode) {
        const params = new URLSearchParams(window.location.search)
        const nameFromUrl = params.get('player')
        if (nameFromUrl) sessionStorage.setItem('dev_player', nameFromUrl)
        const devName = nameFromUrl || sessionStorage.getItem('dev_player')

        if (devName) {
          const mockWalletId = `dev_${devName}`

          // Acreditar saldo ARS en el backend para que pueda unirse a lobbies
          try {
            await fetch(`${getApiUrl()}/sandbox/ars/faucet`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-wallet-id': mockWalletId },
              body: JSON.stringify({ amount: 5000 }),
            })
          } catch { /* ignorar si el backend no está disponible aún */ }

          setUser({
            walletId: mockWalletId,
            address: mockWalletId,
            username: devName,
            balance: 5000,
            balances: { ARS: 5000, ETH: 0, USDT: 0, USDC: 0 },
            wins: 0,
            points: 0,
          })
          setIsLoading(false)
          return
        }
      }
      // ────────────────────────────────────────────────────────────

      const saved = localStorage.getItem('lemon_user')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (!parsed.balances) {
            parsed.balances = {
              ARS: parsed.balance || 0,
              ETH: 0,
              USDT: 0,
              USDC: 0
            }
          }
          setUser(parsed)
        } catch {}
      }

      setIsLoading(false)
    }

    init()
  }, [])

  /* ============================================================
     🔐 Obtener Nonce del Backend
     ============================================================ */
  const getNonce = async (): Promise<string> => {
    const res = await fetch(`${getApiUrl()}/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    if (!res.ok) throw new Error('No se pudo obtener nonce')

    const data = await res.json()
    return data.nonce
  }

  /* ============================================================
     🔐 Login completo (SIWE)
     ============================================================ */
  const login = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const nonce = await getNonce()
      console.log('Nonce:', nonce)

      const result = await authenticate({
        nonce,
        chainId: ChainId.POLYGON_AMOY
      })

      if (result.result === TransactionResult.FAILED) {
        throw new Error(result.error?.message || 'Error en SIWE')
      }

      if (result.result === TransactionResult.CANCELLED) {
        throw new Error('Operación cancelada')
      }

      const { wallet, signature, message } = result.data!

      // Verificación en backend
      const verifyRes = await fetch(`${getApiUrl()}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, signature, message, nonce })
      })

      if (!verifyRes.ok) {
        const e = await verifyRes.json().catch(() => ({}))
        throw new Error(e.error || 'Firma inválida')
      }

      const verifyData = await verifyRes.json()

      const newUser: User = {
        walletId: verifyData.user.address,
        address: verifyData.user.address,
        username: verifyData.user.username,
        balance: verifyData.user.balance || 0,
        balances: {
          ARS: verifyData.user.balance || 0,
          ETH: 0,
          USDT: 0,
          USDC: 0
        },
        wins: verifyData.user.totalWins || 0,
        points: verifyData.user.totalPoints || 0
      }

      setUser(newUser)
      localStorage.setItem('lemon_user', JSON.stringify(newUser))

      console.log('LOGIN OK →', newUser.username)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      console.error('Auth error:', msg)
      setError(msg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    setError(null)
    localStorage.removeItem('lemon_user')
  }

  /* ============================================================
     ⚡ Actualizar Balance
     ============================================================ */
  const updateBalance = (amount: number, currency = 'ARS') => {
    if (!user) return
    const updated: User = {
      ...user,
      balance: currency === 'ARS' ? amount : user.balance,
      balances: {
        ...user.balances,
        [currency]: amount
      }
    }
    setUser(updated)
    localStorage.setItem('lemon_user', JSON.stringify(updated))
  }

  const addWin = (points: number) => {
    if (!user) return
    const updated: User = {
      ...user,
      wins: user.wins + 1,
      points: user.points + points
    }
    setUser(updated)
    localStorage.setItem('lemon_user', JSON.stringify(updated))
  }

  /* ============================================================
     💧 Faucet ARS
     ============================================================ */
  const faucetArs = async (amount = 1000): Promise<void> => {
    if (!user) throw new Error('Debes iniciar sesión')

    const res = await fetch(`${getApiUrl()}/sandbox/ars/faucet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-id': user.walletId
      },
      body: JSON.stringify({ amount })
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Faucet error')
    }

    const data = await res.json()
    updateBalance(data.balance, 'ARS')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isWebView: isWebViewMode,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        logout,
        updateBalance,
        addWin,
        faucetArs
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
