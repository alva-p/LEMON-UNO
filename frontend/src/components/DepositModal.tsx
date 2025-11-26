/**
 * Deposit Modal - Permite depositar dinero en el juego
 */
import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user, updateBalance } = useAuth()
  const [amount, setAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const MIN_DEPOSIT = 100
  const MAX_DEPOSIT = 100000

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '')
    setAmount(value)
  }

  const handleQuickAmount = (quickAmount: number) => {
    setAmount(quickAmount.toString())
    setError(null)
  }

  const handleDeposit = async () => {
    try {
      setError(null)
      setSuccess(false)

      const depositAmount = parseInt(amount)

      // Validaciones
      if (!amount || isNaN(depositAmount)) {
        setError('Por favor ingresa un monto válido')
        return
      }

      if (depositAmount < MIN_DEPOSIT) {
        setError(`Depósito mínimo: $${MIN_DEPOSIT} ARS`)
        return
      }

      if (depositAmount > MAX_DEPOSIT) {
        setError(`Depósito máximo: $${MAX_DEPOSIT} ARS`)
        return
      }

      setIsLoading(true)

      // Llamar SDK para depositar
      const { deposit } = await import('../mocks/lemonSDK')
      const result = await deposit(amount.toString(), 'ARS')

      if (result.result === 'FAILED') {
        throw new Error(result.error?.message || 'Error en depósito')
      }

      if (result.result === 'CANCELLED') {
        setError('Depósito cancelado por el usuario')
        return
      }

      // Éxito: actualizar balance
      const newBalance = (user?.balance || 0) + depositAmount
      updateBalance(newBalance)

      setSuccess(true)
      setAmount('')

      // Cerrar modal en 1.5s
      setTimeout(() => {
        onClose()
        onSuccess?.()
      }, 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div className="modal-overlay" onClick={onClose} />

      {/* Modal */}
      <div className="modal-container">
        <div className="modal-content">
          {/* Header */}
          <div className="modal-header">
            <h2>💰 Depositar Dinero</h2>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="modal-body">
            {success ? (
              // Success State
              <div className="success-state">
                <div className="success-icon">✅</div>
                <h3>¡Depósito Exitoso!</h3>
                <p>Tu saldo ha sido actualizado</p>
                <div className="success-details">
                  <p>Depositaste: <strong>${amount} ARS</strong></p>
                  <p>Nuevo saldo: <strong>${user?.balance} ARS</strong></p>
                </div>
              </div>
            ) : (
              <>
                {/* Current Balance */}
                <div className="balance-display">
                  <label>Saldo Actual</label>
                  <div className="balance-amount">
                    ${user?.balance.toLocaleString()} ARS
                  </div>
                </div>

                {/* Amount Input */}
                <div className="form-group">
                  <label htmlFor="deposit-amount">Monto a Depositar</label>
                  <div className="amount-input-wrapper">
                    <span className="currency-symbol">$</span>
                    <input
                      id="deposit-amount"
                      type="text"
                      placeholder="0"
                      value={amount}
                      onChange={handleAmountChange}
                      disabled={isLoading}
                      className="amount-input"
                    />
                    <span className="currency-code">ARS</span>
                  </div>
                  <small className="input-hint">
                    Mínimo: ${MIN_DEPOSIT} | Máximo: ${MAX_DEPOSIT.toLocaleString()}
                  </small>
                </div>

                {/* Quick Amount Buttons */}
                <div className="quick-amounts">
                  <button
                    className="quick-btn"
                    onClick={() => handleQuickAmount(500)}
                    disabled={isLoading}
                  >
                    $500
                  </button>
                  <button
                    className="quick-btn"
                    onClick={() => handleQuickAmount(1000)}
                    disabled={isLoading}
                  >
                    $1.000
                  </button>
                  <button
                    className="quick-btn"
                    onClick={() => handleQuickAmount(5000)}
                    disabled={isLoading}
                  >
                    $5.000
                  </button>
                  <button
                    className="quick-btn"
                    onClick={() => handleQuickAmount(10000)}
                    disabled={isLoading}
                  >
                    $10.000
                  </button>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="error-alert">
                    <span>⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="modal-actions">
                  <button
                    className="btn-secondary"
                    onClick={onClose}
                    disabled={isLoading}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleDeposit}
                    disabled={isLoading || !amount}
                  >
                    {isLoading ? (
                      <>
                        <span className="spinner-mini"></span>
                        <span>Depositando...</span>
                      </>
                    ) : (
                      <>
                        <span>💳</span>
                        <span>Depositar ${amount || '0'} ARS</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Info */}
                <div className="modal-info">
                  <p>ℹ️ En modo desarrollo, los depósitos son simulados.</p>
                  <p>En producción, usarás tu wallet real de Lemon Cash.</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
