import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { withdraw } from '../mocks/lemonSDK';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user, updateBalance } = useAuth();
  const [amount, setAmount] = useState('');
  const [tokenName, setTokenName] = useState('USDC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const tokens = ['USDC', 'USDT', 'ETH'];
  const minAmount = 50;
  const maxAmount = 50000;

  const handleWithdraw = async () => {
    setError('');

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Ingresa una cantidad válida');
      return;
    }

    if (numAmount < minAmount) {
      setError(`El mínimo para retirar es $${minAmount} ARS`);
      return;
    }

    if (numAmount > maxAmount) {
      setError(`El máximo para retirar es $${maxAmount} ARS`);
      return;
    }

    if (user && numAmount > user.balance) {
      setError('Saldo insuficiente para este retiro');
      return;
    }

    setLoading(true);

    try {
      const result = await withdraw(amount.toString(), tokenName);

      if (result.result === 'SUCCESS') {
        // Deduct amount from balance
        if (user) {
          updateBalance(user.balance - numAmount);
        }
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setAmount('');
          setTokenName('USDC');
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
      const withdrawAmount = Math.min(user.balance, maxAmount);
      setAmount(withdrawAmount.toString());
      setError('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💸 Retirar Fondos</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {!success ? (
          <>
            <div className="modal-body">
              <div className="form-group">
                <label>Cantidad (ARS)</label>
                <div className="amount-input-wrapper">
                  <span className="currency-symbol">$</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setError('');
                    }}
                    disabled={loading}
                    min={minAmount}
                    max={maxAmount}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Red/Token</label>
                <select
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  disabled={loading}
                >
                  {tokens.map((token) => (
                    <option key={token} value={token}>
                      {token}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-info">
                <div className="info-row">
                  <span>Saldo disponible:</span>
                  <span className="info-value">${user?.balance?.toFixed(2) || '0.00'} ARS</span>
                </div>
                <div className="info-row">
                  <span>Comisión:</span>
                  <span className="info-value">$0 (sin comisión)</span>
                </div>
              </div>

              <div className="quick-amounts">
                <button
                  className="quick-btn"
                  onClick={() => handleQuickAmount(100)}
                  disabled={loading}
                >
                  $100
                </button>
                <button
                  className="quick-btn"
                  onClick={() => handleQuickAmount(500)}
                  disabled={loading}
                >
                  $500
                </button>
                <button
                  className="quick-btn"
                  onClick={() => handleQuickAmount(1000)}
                  disabled={loading}
                >
                  $1k
                </button>
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
