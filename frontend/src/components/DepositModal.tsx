/**
 * Deposit Modal - Permite depositar dinero en el juego
 */
import React, { useState } from 'react'
import { deposit, TokenName } from '../lemon-mini-app-sdk'
import { useAuth } from '../context/AuthContext'

export interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user, updateBalance } = useAuth()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'ARS' | 'ETH' | 'USDT' | 'USDC'>('ARS')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Reset success state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setSuccess(false)
      setError(null)
    }
  }, [isOpen])

  // Límites según la moneda
  const getLimits = () => {
    switch (currency) {
      case 'ARS':
        return { min: 100, max: 100000 }
      case 'ETH':
        return { min: 0.001, max: 10 }
      case 'USDT':
      case 'USDC':
        return { min: 1, max: 10000 }
      default:
        return { min: 100, max: 100000 }
    }
  }

  const limits = getLimits()

  // Quick amounts según moneda
  const getQuickAmounts = () => {
    switch (currency) {
      case 'ARS':
        return [500, 1000, 5000, 10000]
      case 'ETH':
        return [0.01, 0.05, 0.1, 0.5]
      case 'USDT':
      case 'USDC':
        return [10, 50, 100, 500]
      default:
        return [500, 1000, 5000, 10000]
    }
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Permitir decimales para crypto
    if (currency === 'ARS') {
      setAmount(value.replace(/[^0-9]/g, ''))
    } else {
      // Para crypto, permitir decimales
      setAmount(value.replace(/[^0-9.]/g, ''))
    }
  }

  const handleQuickAmount = (quickAmount: number) => {
    setAmount(quickAmount.toString())
    setError(null)
  }

  const handleDeposit = async () => {
    try {
      setError(null)
      setSuccess(false)

      const depositAmount = parseFloat(amount)

      // Validaciones
      if (!amount || isNaN(depositAmount)) {
        setError('Por favor ingresa un monto válido')
        return
      }

      if (depositAmount < limits.min) {
        setError(`Depósito mínimo: ${limits.min} ${currency}`)
        return
      }

      if (depositAmount > limits.max) {
        setError(`Depósito máximo: ${limits.max} ${currency}`)
        return
      }

      setIsLoading(true)

      // Llamar SDK para depositar
      let result
      if (currency === 'ARS') {
        // Para ARS (fiat), usar mock
        const { deposit: mockDeposit } = await import('../mocks/lemonSDK')
        result = await mockDeposit(amount.toString(), currency)
      } else {
        // Para crypto, usar SDK real
        result = await deposit({ amount: amount.toString(), tokenName: currency as TokenName })
      }

      if (result.result === 'FAILED') {
        throw new Error(result.error?.message || 'Error en depósito')
      }

      if (result.result === 'CANCELLED') {
        setError('Depósito cancelado por el usuario')
        return
      }

      // Éxito: actualizar balance según la moneda
      const currentBalance = user?.balances?.[currency] ?? (currency === 'ARS' ? user?.balance ?? 0 : 0)
      const newBalance = currentBalance + depositAmount
      updateBalance(newBalance, currency)

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
                  <p>Depositaste: <strong>{amount} {currency}</strong></p>
                  {currency === 'ARS' && <p>Nuevo saldo: <strong>${user?.balance} ARS</strong></p>}
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

                {/* Currency Selector */}
                <div className="form-group">
                  <label>💱 Selecciona Moneda</label>
                  <div className="currency-selector-modal">
                    <button
                      className={`currency-option-modal ${currency === 'ARS' ? 'active' : ''}`}
                      onClick={() => { setCurrency('ARS'); setAmount(''); setError(null); }}
                      disabled={isLoading}
                    >
                      🇦🇷 ARS
                    </button>
                    <button
                      className={`currency-option-modal ${currency === 'USDT' ? 'active' : ''}`}
                      onClick={() => { setCurrency('USDT'); setAmount(''); setError(null); }}
                      disabled={isLoading}
                    >
                      💵 USDT
                    </button>
                    <button
                      className={`currency-option-modal ${currency === 'USDC' ? 'active' : ''}`}
                      onClick={() => { setCurrency('USDC'); setAmount(''); setError(null); }}
                      disabled={isLoading}
                    >
                      💵 USDC
                    </button>
                    <button
                      className={`currency-option-modal ${currency === 'ETH' ? 'active' : ''}`}
                      onClick={() => { setCurrency('ETH'); setAmount(''); setError(null); }}
                      disabled={isLoading}
                    >
                      ⟠ ETH
                    </button>
                  </div>
                </div>

                {/* Network Info */}
                {currency === 'ETH' && (
                  <div className="network-info">
                    <span className="network-badge">🌐 Redes disponibles: Ethereum y Base</span>
                  </div>
                )}
                {(currency === 'USDT' || currency === 'USDC') && (
                  <div className="network-info">
                    <span className="network-badge">🌐 Red: Base (L2)</span>
                  </div>
                )}

                {/* Amount Input */}
                <div className="form-group">
                  <label htmlFor="deposit-amount">Monto a Depositar</label>
                  <div className="amount-input-wrapper">
                    <span className="currency-symbol">{currency === 'ARS' ? '$' : ''}</span>
                    <input
                      id="deposit-amount"
                      type="text"
                      placeholder="0"
                      value={amount}
                      onChange={handleAmountChange}
                      disabled={isLoading}
                      className="amount-input"
                    />
                  </div>
                  <span className="currency-code">{currency}</span>
                  <small className="input-hint">
                    Mínimo: {limits.min} | Máximo: {limits.max.toLocaleString()} {currency}
                  </small>
                </div>

                {/* Quick Amount Buttons */}
                <div className="quick-amounts">
                  {getQuickAmounts().map((quickAmount) => (
                    <button
                      key={quickAmount}
                      className="quick-btn"
                      onClick={() => handleQuickAmount(quickAmount)}
                      disabled={isLoading}
                    >
                      {currency === 'ARS' ? '$' : ''}{quickAmount} {currency !== 'ARS' ? currency : ''}
                    </button>
                  ))}
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
                        <span>Depositar {amount || '0'} {currency}</span>
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
