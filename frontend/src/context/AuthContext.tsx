import React, { createContext, useContext, useState, useEffect } from 'react'
import { TransactionResult } from '@lemoncash/mini-app-sdk'
import { isWebView } from '../lemon-mini-app-sdk'
import { authenticate as mockAuthenticate } from '../mocks/lemonSDK'

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

export interface User {
  walletId: string
  address: string
  username: string
  balance: number
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
  updateBalance: (amount: number) => void
  addWin: (points: number) => void
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
        setUser(JSON.parse(savedUser))
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

      // Step 2: Call SIWE authenticate with nonce from Lemon SDK
      console.log(
        isWebViewMode
          ? '🔵 Usando Lemon SDK real (WebView)'
          : '🟡 Usando Mock SDK (Desarrollo local)'
      )

      const result = await mockAuthenticate({
        nonce,
        chainId: 80002, // Polygon Amoy
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

  const updateBalance = (amount: number) => {
    if (user) {
      const updated = { ...user, balance: amount }
      setUser(updated)
      localStorage.setItem('lemon_user', JSON.stringify(updated))
    }
  }

  const addWin = (points: number) => {
    if (user) {
      const updated = {
        ...user,
        wins: user.wins + 1,
        points: user.points + points,
      }
      setUser(updated)
      localStorage.setItem('lemon_user', JSON.stringify(updated))
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
