import React, { createContext, useContext, useState, useEffect } from 'react'
import { TransactionResult } from '@lemoncash/mini-app-sdk'
import { isWebView } from '../lemon-mini-app-sdk'
import { authenticate, ChainId } from '../lemon-mini-app-sdk'

/**
 * Get the correct API URL based on environment
 */
function getApiUrl(): string {
  // Use 127.0.0.1 for localhost to ensure it works
  if (window.location.hostname === 'localhost') {
    return 'http://127.0.0.1:3001'
  }
  return `http://${window.location.hostname}:3001`
}

export interface User {
  walletId: string
  address: string
  username: string
  balance: number // ARS balance (mantener por compatibilidad)
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

  // Check WebView on mount
  useEffect(() => {
    const webViewStatus = isWebView()
    setIsWebViewMode(webViewStatus)

    // Try to restore session from localStorage
    const savedUser = localStorage.getItem('lemon_user')
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser)
        // Migrar formato antiguo al nuevo con balances multi-moneda
        if (!parsed.balances) {
          parsed.balances = {
            ARS: parsed.balance || 0,
            ETH: 0,
            USDT: 0,
            USDC: 0,
          }
        }
        setUser(parsed)
      } catch (err) {
        console.error('Failed to restore user session:', err)
      }
    }

    setIsLoading(false)
  }, [])

  /**
   * Get nonce from backend
   */
  const getNonce = async (): Promise<string> => {
    const res = await fetch(`${getApiUrl()}/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) {
      throw new Error('Failed to get nonce from backend')
    }

    const data = await res.json()
    return data.nonce
  }

  /**
   * Main login flow:
   * 1. Get nonce from backend
   * 2. Call SIWE authenticate with nonce
   * 3. Verify signature on backend
   */
  const login = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Step 1: Get nonce from backend
      const nonce = await getNonce()
      console.log('📝 Nonce obtenido:', nonce.slice(0, 8) + '...')

      const result = await authenticate({
        nonce,
        chainId: ChainId.POLYGON_AMOY,
      })

      if (result.result === TransactionResult.FAILED) {
        throw new Error(`Autenticación fallida: ${result.error?.message}`)
      }

      if (result.result === TransactionResult.CANCELLED) {
        throw new Error('Autenticación cancelada por el usuario')
      }

      const { wallet, signature, message } = result.data!

      // Step 3: Verify signature on backend
      const verifyRes = await fetch(`${getApiUrl()}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, signature, message, nonce }),
      })

      if (!verifyRes.ok) {
        const errorData = await verifyRes.json()
        throw new Error(errorData.error || 'Verificación de firma fallida')
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
          USDC: 0,
        },
        wins: verifyData.user.totalWins || 0,
        points: verifyData.user.totalPoints || 0,
      }

      setUser(newUser)
      localStorage.setItem('lemon_user', JSON.stringify(newUser))
      console.log('✅ Autenticación exitosa:', newUser.username)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(message)
      console.error('Auth error:', message)
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

  const updateBalance = (
    amount: number,
    currency: 'ARS' | 'ETH' | 'USDT' | 'USDC' = 'ARS'
  ) => {
    if (user) {
      const updated: User = {
        ...user,
        balance: currency === 'ARS' ? amount : user.balance,
        balances: {
          ...user.balances,
          [currency]: amount,
        },
      }
      setUser(updated)
      localStorage.setItem('lemon_user', JSON.stringify(updated))
    }
  }

  const addWin = (points: number) => {
    if (user) {
      const updated: User = {
        ...user,
        wins: user.wins + 1,
        points: user.points + points,
      }
      setUser(updated)
      localStorage.setItem('lemon_user', JSON.stringify(updated))
    }
  }

  /**
   * Faucet ARS: pide fichas de práctica al backend y sincroniza el saldo ARS
   */
  const faucetArs = async (amount: number = 1000): Promise<void> => {
    if (!user) {
      throw new Error('Debes iniciar sesión para recibir fichas ARS')
    }

    try {
      const res = await fetch(`${getApiUrl()}/sandbox/ars/faucet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-id': user.walletId,
        },
        body: JSON.stringify({ amount }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al solicitar fichas ARS')
      }

      const data = await res.json()
      const newBalance = data.balance as number

      // Actualizar el contexto con el saldo devuelto por el backend
      updateBalance(newBalance, 'ARS')
      console.log(`💧 Faucet ARS aplicado. Nuevo saldo ARS: ${newBalance}`)
    } catch (err) {
      console.error('Faucet ARS error:', err)
      throw err
    }
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
        faucetArs,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
