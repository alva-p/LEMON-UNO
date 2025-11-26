/**
 * Auth Screen - SIWE Login with Nonce
 */
import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export const AuthScreen: React.FC = () => {
  const { login, isLoading, error } = useAuth()
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSignIn = async () => {
    try {
      setLocalError(null)
      await login()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setLocalError(message)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-container">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo">🎴</div>
          <h1>UNO CASH</h1>
          <p className="auth-subtitle">Juega • Apuesta • Gana</p>
        </div>

        {/* Welcome Message */}
        <div className="auth-welcome">
          <h2>Bienvenido</h2>
          <p>Conecta tu wallet de Lemon Cash para jugar</p>
        </div>

        {/* Error Message */}
        {(error || localError) && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            <span>{error || localError}</span>
          </div>
        )}

        {/* Sign In Section */}
        <div className="auth-form">
          <button
            onClick={handleSignIn}
            disabled={isLoading}
            className="btn-signin primary"
          >
            {isLoading ? (
              <>
                <span className="spinner-mini"></span>
                <span>Conectando...</span>
              </>
            ) : (
              <>
                <span>🔐</span>
                <span>Firmar & Entrar con SIWE</span>
              </>
            )}
          </button>
        </div>

        {/* Info Box */}
        <div className="auth-info">
          <h3>¿Cómo funciona?</h3>
          <ul>
            <li>
              <span className="step">1</span>
              <span>Solicita un nonce único al backend</span>
            </li>
            <li>
              <span className="step">2</span>
              <span>Firma el nonce con tu wallet (SIWE)</span>
            </li>
            <li>
              <span className="step">3</span>
              <span>Backend verifica la firma (anti-replay)</span>
            </li>
            <li>
              <span className="step">4</span>
              <span>¡Listo! Comienza a jugar</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className="auth-footer">
          <p className="footer-text">
            🔒 Autenticación segura con Sign In With Ethereum (SIWE)
          </p>
        </div>
      </div>
    </div>
  )
}
