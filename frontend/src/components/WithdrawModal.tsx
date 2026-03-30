/**
 * Withdraw Modal - Retirar crypto al wallet Lemon Cash,
 * o retirar fichas ARS sandbox (operación local de práctica).
 */
import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { withdraw, ChainId, TokenName, TransactionResult } from '../lemon-mini-app-sdk'

type Chain = 'BASE' | 'ETH_SEPOLIA' | 'POLYGON_AMOY'

function getChainId(chain: Chain): ChainId {
  if (chain === 'BASE') return ChainId.BASE
  if (chain === 'ETH_SEPOLIA') return ChainId.ETH_SEPOLIA
  return ChainId.POLYGON_AMOY
}

interface WithdrawModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user, updateBalance } = useAuth()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'ARS' | 'ETH' | 'USDT' | 'USDC'>('ARS')
  const [chain, setChain] = useState<Chain>('BASE')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  React.useEffect(() => {
    if (!isOpen) {
      setSuccess(false)
      setError('')
      setAmount('')
    }
  }, [isOpen])

  const getLimits = () => {
    switch (currency) {
      case 'ARS':   return { min: 100, max: 100000 }
      case 'ETH':   return { min: 0.001, max: 10 }
      case 'USDT':
      case 'USDC':  return { min: 1, max: 10000 }
      default:      return { min: 100, max: 100000 }
    }
  }

  const getQuickAmounts = () => {
    switch (currency) {
      case 'ARS':   return [500, 1000, 5000, 10000]
      case 'ETH':   return [0.01, 0.05, 0.1, 0.5]
      case 'USDT':
      case 'USDC':  return [10, 50, 100, 500]
      default:      return [500, 1000, 5000, 10000]
    }
  }

  const limits = getLimits()

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAmount(currency === 'ARS' ? value.replace(/[^0-9]/g, '') : value.replace(/[^0-9.]/g, ''))
  }

  const handleWithdraw = async () => {
    setError('')

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Ingresa una cantidad válida')
      return
    }
    if (numAmount < limits.min) {
      setError(`El mínimo para retirar es ${limits.min} ${currency}`)
      return
    }
    if (numAmount > limits.max) {
      setError(`El máximo para retirar es ${limits.max.toLocaleString()} ${currency}`)
      return
    }

    const userBalance = user?.balances?.[currency] ?? (currency === 'ARS' ? user?.balance ?? 0 : 0)
    if (numAmount > userBalance) {
      setError('Saldo insuficiente para este retiro')
      return
    }

    setLoading(true)

    try {
      if (currency === 'ARS') {
        // ARS es sandbox: operación local (no hay retiro real de fiat)
        updateBalance(userBalance - numAmount, 'ARS')
        setSuccess(true)
        setTimeout(() => { setSuccess(false); setAmount(''); onSuccess(); onClose() }, 1500)
        return
      }

      // Crypto: usa el SDK con chainId
      const tokenName = currency as TokenName
      const chainId = getChainId(chain)
      const result = await withdraw({ amount: amount.toString(), tokenName, chainId })

      if (result.result === TransactionResult.SUCCESS) {
        updateBalance(userBalance - numAmount, currency)
        setSuccess(true)
        setTimeout(() => { setSuccess(false); setAmount(''); onSuccess(); onClose() }, 1500)
      } else if (result.result === TransactionResult.FAILED) {
        setError(result.error?.message || 'Error al procesar el retiro')
      } else if (result.result === TransactionResult.CANCELLED) {
        setError('Retiro cancelado por el usuario')
      }
    } catch (err) {
      setError('Error al conectar con el servidor')
      console.error('Withdraw error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAmount = (quickAmount: number) => {
    setAmount(quickAmount.toString())
    setError('')
  }

  const handleMaxAmount = () => {
    if (user) {
      const userBalance = user?.balances?.[currency] ?? (currency === 'ARS' ? user?.balance ?? 0 : 0)
      setAmount(Math.min(userBalance, limits.max).toString())
      setError('')
    }
  }

  if (!isOpen) return null

  const userBalance = user?.balances?.[currency] ?? (currency === 'ARS' ? user?.balance ?? 0 : 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💸 Retirar Fondos</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {!success ? (
          <>
            <div className="modal-body">
              {/* Selector de moneda */}
              <div className="form-group">
                <label>Moneda</label>
                <div className="currency-selector-modal">
                  {(['ARS', 'USDT', 'USDC', 'ETH'] as const).map((c) => (
                    <button
                      key={c}
                      className={`currency-option-modal ${currency === c ? 'active' : ''}`}
                      onClick={() => { setCurrency(c); setAmount('') }}
                      disabled={loading}
                    >
                      {c === 'ARS' ? '🇦🇷 ARS' : c === 'ETH' ? '⟠ ETH' : `💵 ${c}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector de red para crypto */}
              {currency !== 'ARS' && (
                <div className="form-group">
                  <label>🌐 Red</label>
                  <div className="network-selector">
                    <button
                      className={`network-option ${chain === 'BASE' ? 'active' : ''}`}
                      onClick={() => setChain('BASE')}
                      disabled={loading}
                    >
                      Base
                    </button>
                    <button
                      className={`network-option ${chain === 'ETH_SEPOLIA' ? 'active' : ''}`}
                      onClick={() => setChain('ETH_SEPOLIA')}
                      disabled={loading}
                    >
                      Ethereum Sepolia
                    </button>
                    <button
                      className={`network-option ${chain === 'POLYGON_AMOY' ? 'active' : ''}`}
                      onClick={() => setChain('POLYGON_AMOY')}
                      disabled={loading}
                    >
                      Polygon Amoy
                    </button>
                  </div>
                </div>
              )}

              {currency === 'ARS' && (
                <div className="network-info">
                  <span className="network-badge">
                    ℹ️ ARS sandbox: el retiro descuenta tu saldo de práctica
                  </span>
                </div>
              )}

              {/* Balance actual */}
              <div className="balance-display">
                <label>Saldo Actual</label>
                <div className="balance-amount">
                  {currency === 'ARS' ? '$' : ''}{userBalance.toLocaleString()} {currency}
                </div>
              </div>

              {/* Input de monto */}
              <div className="form-group">
                <label htmlFor="withdraw-amount">Monto a Retirar</label>
                <div className="amount-input-wrapper">
                  <span className="currency-symbol">{currency === 'ARS' ? '$' : ''}</span>
                  <input
                    id="withdraw-amount"
                    type="text"
                    placeholder="0"
                    value={amount}
                    onChange={handleAmountChange}
                    disabled={loading}
                    className="amount-input"
                  />
                </div>
                <span className="currency-code">{currency}</span>
                <small className="input-hint">
                  Mínimo: {limits.min} | Máximo: {limits.max.toLocaleString()} {currency}
                </small>
              </div>

              {/* Montos rápidos */}
              <div className="quick-amounts">
                {getQuickAmounts().map((q) => (
                  <button
                    key={q}
                    className="quick-btn"
                    onClick={() => handleQuickAmount(q)}
                    disabled={loading}
                  >
                    {currency === 'ARS' ? '$' : ''}{q}{currency !== 'ARS' ? ` ${currency}` : ''}
                  </button>
                ))}
                <button className="quick-btn" onClick={handleMaxAmount} disabled={loading}>
                  Máx
                </button>
              </div>

              {error && <div className="error-alert">{error}</div>}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose} disabled={loading}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleWithdraw}
                disabled={loading || !amount}
              >
                {loading ? 'Procesando...' : '💸 Retirar'}
              </button>
            </div>
          </>
        ) : (
          <div className="success-state">
            <div className="success-icon">✓</div>
            <h3>¡Retiro exitoso!</h3>
            <p>
              {currency === 'ARS'
                ? 'Fichas ARS descontadas de tu saldo de práctica'
                : 'Tu dinero está en camino a tu billetera Lemon'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
