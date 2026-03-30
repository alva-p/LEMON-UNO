/**
 * Deposit Modal - Depositar crypto desde Lemon Cash al mini app,
 * o recargar fichas ARS sandbox via faucet del backend.
 */
import React, { useState } from 'react'
import { deposit, ChainId, TokenName, TransactionResult } from '../lemon-mini-app-sdk'
import { useAuth } from '../context/AuthContext'

function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL
  if (typeof envUrl === 'string' && envUrl.startsWith('https://')) return envUrl
  if (window.location.hostname === 'localhost') return 'http://localhost:3001'
  const host = window.location.hostname
  if (host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.'))
    return `http://${host}:3001`
  return 'https://api.alva-p.xyz'
}

type Chain = 'BASE' | 'ETH_SEPOLIA' | 'POLYGON_AMOY'

function getChainId(chain: Chain): ChainId {
  if (chain === 'BASE') return ChainId.BASE
  if (chain === 'ETH_SEPOLIA') return ChainId.ETH_SEPOLIA
  return ChainId.POLYGON_AMOY
}

export interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user, updateBalance, faucetArs } = useAuth()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'ARS' | 'ETH' | 'USDT' | 'USDC'>('ARS')
  const [chain, setChain] = useState<Chain>('BASE')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  React.useEffect(() => {
    if (!isOpen) {
      setSuccess(false)
      setError(null)
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

  const handleQuickAmount = (quickAmount: number) => {
    setAmount(quickAmount.toString())
    setError(null)
  }

  const handleDeposit = async () => {
    try {
      setError(null)
      setSuccess(false)

      const depositAmount = parseFloat(amount)
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

      if (currency === 'ARS') {
        // ARS es sandbox: usa el faucet del backend
        await faucetArs(depositAmount)
      } else {
        // Crypto: llama al SDK con chainId
        const tokenName = currency as TokenName
        const chainId = getChainId(chain)
        const result = await deposit({ amount: amount.toString(), tokenName, chainId })

        if (result.result === TransactionResult.FAILED) {
          throw new Error(result.error?.message || 'Error en depósito')
        }
        if (result.result === TransactionResult.CANCELLED) {
          setError('Depósito cancelado')
          return
        }

        // Actualizar balance local optimistamente
        const currentBalance = user?.balances?.[currency] ?? 0
        updateBalance(currentBalance + depositAmount, currency)
      }

      setSuccess(true)
      setAmount('')
      setTimeout(() => {
        onClose()
        onSuccess?.()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-container">
        <div className="modal-content">
          <div className="modal-header">
            <h2>💰 Depositar Dinero</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">
            {success ? (
              <div className="success-state">
                <div className="success-icon">✅</div>
                <h3>¡Depósito Exitoso!</h3>
                <p>Tu saldo ha sido actualizado</p>
              </div>
            ) : (
              <>
                {/* Balance actual */}
                <div className="balance-display">
                  <label>Saldo Actual</label>
                  <div className="balance-amount">
                    {currency === 'ARS'
                      ? `$${(user?.balances?.ARS ?? user?.balance ?? 0).toLocaleString()} ARS`
                      : `${(user?.balances?.[currency] ?? 0)} ${currency}`}
                  </div>
                </div>

                {/* Selector de moneda */}
                <div className="form-group">
                  <label>💱 Selecciona Moneda</label>
                  <div className="currency-selector-modal">
                    {(['ARS', 'USDT', 'USDC', 'ETH'] as const).map((c) => (
                      <button
                        key={c}
                        className={`currency-option-modal ${currency === c ? 'active' : ''}`}
                        onClick={() => { setCurrency(c); setAmount(''); setError(null) }}
                        disabled={isLoading}
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
                        disabled={isLoading}
                      >
                        Base
                      </button>
                      <button
                        className={`network-option ${chain === 'ETH_SEPOLIA' ? 'active' : ''}`}
                        onClick={() => setChain('ETH_SEPOLIA')}
                        disabled={isLoading}
                      >
                        Ethereum Sepolia
                      </button>
                      <button
                        className={`network-option ${chain === 'POLYGON_AMOY' ? 'active' : ''}`}
                        onClick={() => setChain('POLYGON_AMOY')}
                        disabled={isLoading}
                      >
                        Polygon Amoy
                      </button>
                    </div>
                    {currency === 'ARS' && (
                      <p className="modal-info-text">
                        ℹ️ Las fichas ARS son de práctica y se recargan desde el servidor.
                      </p>
                    )}
                  </div>
                )}

                {/* Input de monto */}
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

                {/* Montos rápidos */}
                <div className="quick-amounts">
                  {getQuickAmounts().map((q) => (
                    <button
                      key={q}
                      className="quick-btn"
                      onClick={() => handleQuickAmount(q)}
                      disabled={isLoading}
                    >
                      {currency === 'ARS' ? '$' : ''}{q}{currency !== 'ARS' ? ` ${currency}` : ''}
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="error-alert">
                    <span>⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                <div className="modal-actions">
                  <button className="btn-secondary" onClick={onClose} disabled={isLoading}>
                    Cancelar
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleDeposit}
                    disabled={isLoading || !amount}
                  >
                    {isLoading ? (
                      <><span className="spinner-mini"></span><span>Depositando...</span></>
                    ) : (
                      <><span>💳</span><span>Depositar {amount || '0'} {currency}</span></>
                    )}
                  </button>
                </div>

                <div className="modal-info">
                  {currency === 'ARS'
                    ? <p>ℹ️ Las fichas ARS son de práctica. En producción usarás tu cuenta Lemon.</p>
                    : <p>ℹ️ El depósito se procesará desde tu billetera Lemon Cash.</p>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
