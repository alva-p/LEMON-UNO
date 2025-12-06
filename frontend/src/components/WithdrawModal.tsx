import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { withdraw, TokenName } from '../lemon-mini-app-sdk';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user, updateBalance } = useAuth();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'ETH' | 'USDT' | 'USDC'>('ARS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Reset success state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setSuccess(false);
      setError('');
    }
  }, [isOpen]);

  // Límites según moneda
  const getLimits = () => {
    switch (currency) {
      case 'ARS':
        return { min: 100, max: 100000 };
      case 'ETH':
        return { min: 0.001, max: 10 };
      case 'USDT':
      case 'USDC':
        return { min: 1, max: 10000 };
      default:
        return { min: 100, max: 100000 };
    }
  };

  const limits = getLimits();

  // Quick amounts según moneda
  const getQuickAmounts = () => {
    switch (currency) {
      case 'ARS':
        return [500, 1000, 5000, 10000];
      case 'ETH':
        return [0.01, 0.05, 0.1, 0.5];
      case 'USDT':
      case 'USDC':
        return [10, 50, 100, 500];
      default:
        return [500, 1000, 5000, 10000];
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Permitir decimales para crypto
    if (currency === 'ARS') {
      setAmount(value.replace(/[^0-9]/g, ''));
    } else {
      setAmount(value.replace(/[^0-9.]/g, ''));
    }
  };

  const handleWithdraw = async () => {
    setError('');

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Ingresa una cantidad válida');
      return;
    }

    if (numAmount < limits.min) {
      setError(`El mínimo para retirar es ${limits.min} ${currency}`);
      return;
    }

    if (numAmount > limits.max) {
      setError(`El máximo para retirar es ${limits.max.toLocaleString()} ${currency}`);
      return;
    }

    const userBalance = user?.balances?.[currency] ?? (currency === 'ARS' ? user?.balance ?? 0 : 0);
    if (numAmount > userBalance) {
      setError('Saldo insuficiente para este retiro');
      return;
    }

    setLoading(true);

    try {
      let result
      if (currency === 'ARS') {
        // Para ARS (fiat), usar mock
        const { withdraw: mockWithdraw } = await import('../mocks/lemonSDK')
        result = await mockWithdraw(amount.toString(), currency)
      } else {
        // Para crypto, usar SDK real
        result = await withdraw({ amount: amount.toString(), tokenName: currency as TokenName })
      }

      if (result.result === 'SUCCESS') {
        // Deduct amount from balance
        const newBalance = userBalance - numAmount;
        updateBalance(newBalance, currency);
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setAmount('');
          onSuccess();
          onClose();
        }, 1500);
      } else if (result.result === 'FAILED') {
        setError(result.error?.message || 'Error al procesar el retiro');
      } else if (result.result === 'CANCELLED') {
        setError('Retiro cancelado por el usuario');
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
      console.error('Withdraw error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAmount = (quickAmount: number) => {
    setAmount(quickAmount.toString());
    setError('');
  };

  const handleMaxAmount = () => {
    if (user) {
      const userBalance = user?.balances?.[currency] ?? (currency === 'ARS' ? user?.balance ?? 0 : 0);
      const withdrawAmount = Math.min(userBalance, limits.max);
      setAmount(withdrawAmount.toString());
      setError('');
    }
  };

  if (!isOpen) return null;

  const userBalance = user?.balances?.[currency] ?? (currency === 'ARS' ? user?.balance ?? 0 : 0);

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
              {/* Currency Selector */}
              <div className="form-group">
                <label>Moneda</label>
                <div className="currency-selector-modal">
                  <button
                    className={`currency-option-modal ${currency === 'ARS' ? 'active' : ''}`}
                    onClick={() => {
                      setCurrency('ARS');
                      setAmount('');
                    }}
                    disabled={loading}
                  >
                    🇦🇷 ARS
                  </button>
                  <button
                    className={`currency-option-modal ${currency === 'USDT' ? 'active' : ''}`}
                    onClick={() => {
                      setCurrency('USDT');
                      setAmount('');
                    }}
                    disabled={loading}
                  >
                    💵 USDT
                  </button>
                  <button
                    className={`currency-option-modal ${currency === 'USDC' ? 'active' : ''}`}
                    onClick={() => {
                      setCurrency('USDC');
                      setAmount('');
                    }}
                    disabled={loading}
                  >
                    💵 USDC
                  </button>
                  <button
                    className={`currency-option-modal ${currency === 'ETH' ? 'active' : ''}`}
                    onClick={() => {
                      setCurrency('ETH');
                      setAmount('');
                    }}
                    disabled={loading}
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

              {/* Balance Display */}
              <div className="balance-display">
                <label>Saldo Actual</label>
                <div className="balance-amount">
                  {currency === 'ARS' ? '$' : ''}{userBalance.toLocaleString()} {currency}
                </div>
              </div>

              {/* Amount Input */}
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

              {/* Quick Amounts */}
              <div className="quick-amounts">
                {getQuickAmounts().map((quickAmount) => (
                  <button
                    key={quickAmount}
                    className="quick-btn"
                    onClick={() => handleQuickAmount(quickAmount)}
                    disabled={loading}
                  >
                    {currency === 'ARS' ? '$' : ''}{quickAmount} {currency !== 'ARS' ? currency : ''}
                  </button>
                ))}
                <button
                  className="quick-btn"
                  onClick={handleMaxAmount}
                  disabled={loading}
                >
                  Máx
                </button>
              </div>

              {error && <div className="error-alert">{error}</div>}
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={onClose}
                disabled={loading}
              >
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
            <p>Tu dinero está en camino a tu billetera Lemon</p>
          </div>
        )}
      </div>
    </div>
  );
};
