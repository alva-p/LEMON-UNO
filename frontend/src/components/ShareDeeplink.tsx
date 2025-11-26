/**
 * Componente para compartir deeplinks
 * Permite a usuarios compartir invitaciones de juegos
 */

import React, { useState } from 'react'
import { DeeplinkGenerator } from '../utils/deeplinkGenerator'

interface ShareDeeplinkProps {
  type: 'game' | 'lobby' | 'profile' | 'tournament' | 'app'
  id?: string
  title?: string
  description?: string
  buttonText?: string
  onSuccess?: () => void
  onError?: (error: string) => void
}

export const ShareDeeplink: React.FC<ShareDeeplinkProps> = ({
  type,
  id,
  title = 'Comparte el link',
  description,
  buttonText = '🔗 Compartir',
  onSuccess,
  onError,
}) => {
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showOptions, setShowOptions] = useState(false)

  const generateLink = () => {
    try {
      return DeeplinkGenerator.generateShareableLink(type, id)
    } catch (err) {
      if (onError) {
        onError((err as Error).message)
      }
      return null
    }
  }

  const handleShare = async () => {
    setLoading(true)

    try {
      const link = generateLink()
      if (!link) {
        if (onError) onError('Error generando link')
        return
      }

      const success = await DeeplinkGenerator.shareDeeplink(
        link.deeplink,
        title,
        description || 'Únete a mi juego'
      )

      if (success) {
        if (onSuccess) onSuccess()
      } else {
        setShowOptions(true) // Mostrar opciones alternativas
      }
    } catch (err) {
      if (onError) onError((err as Error).message)
      setShowOptions(true)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      const link = generateLink()
      if (!link) {
        if (onError) onError('Error generando link')
        return
      }

      const success = await DeeplinkGenerator.copyToClipboard(link.deeplink)
      if (success) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        if (onSuccess) onSuccess()
      }
    } catch (err) {
      if (onError) onError((err as Error).message)
    }
  }

  const link = generateLink()

  return (
    <div className="share-deeplink">
      <button className="btn-share" onClick={handleShare} disabled={loading}>
        {loading ? '⏳ Compartiendo...' : buttonText}
      </button>

      {showOptions && link && (
        <div className="share-options">
          <h4>{title}</h4>

          <div className="option-copy">
            <input
              type="text"
              value={link.deeplink}
              readOnly
              className="deeplink-input"
              title="Deeplink de Lemon Cash"
            />
            <button className="btn-copy" onClick={handleCopyLink}>
              {copied ? '✅ Copiado' : '📋 Copiar'}
            </button>
          </div>

          <div className="option-qr">
            <p>O escanea este código QR:</p>
            <img src={link.qrData} alt="QR Code" className="qr-code" />
          </div>

          <div className="option-web">
            <p>O visita este link (sin app):</p>
            <a href={link.webUrl} target="_blank" rel="noopener noreferrer" className="web-link">
              {link.webUrl}
            </a>
          </div>

          <button className="btn-close" onClick={() => setShowOptions(false)}>
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Estilos para el componente ShareDeeplink
 */
export const shareDeeplinkStyles = `
.share-deeplink {
  position: relative;
  display: inline-block;
}

.btn-share {
  padding: 10px 20px;
  background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.btn-share:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 212, 255, 0.3);
}

.btn-share:active {
  transform: scale(0.95);
}

.btn-share:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.share-options {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 12px;
  background: linear-gradient(135deg, #1a1f3a 0%, #252a45 100%);
  border: 2px solid rgba(0, 212, 255, 0.3);
  border-radius: 12px;
  padding: 20px;
  width: 320px;
  z-index: 1000;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  animation: slideUp 0.3s ease;
}

.share-options h4 {
  margin: 0 0 16px 0;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.option-copy {
  margin-bottom: 16px;
  display: flex;
  gap: 8px;
}

.deeplink-input {
  flex: 1;
  padding: 8px 12px;
  background: rgba(0, 212, 255, 0.1);
  border: 1px solid rgba(0, 212, 255, 0.3);
  border-radius: 6px;
  color: #00d4ff;
  font-size: 12px;
  font-family: monospace;
}

.deeplink-input:focus {
  outline: none;
  border-color: #00d4ff;
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.2);
}

.btn-copy {
  padding: 8px 12px;
  background: rgba(0, 255, 0, 0.2);
  color: #00ff00;
  border: 1px solid rgba(0, 255, 0, 0.4);
  border-radius: 6px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.btn-copy:hover {
  background: rgba(0, 255, 0, 0.3);
  box-shadow: 0 0 8px rgba(0, 255, 0, 0.2);
}

.option-qr {
  text-align: center;
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.option-qr p {
  margin: 0 0 8px 0;
  color: #999;
  font-size: 12px;
}

.qr-code {
  width: 200px;
  height: 200px;
  border: 2px solid rgba(0, 212, 255, 0.3);
  border-radius: 8px;
  background: white;
  padding: 8px;
}

.option-web {
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.option-web p {
  margin: 0 0 8px 0;
  color: #999;
  font-size: 12px;
}

.web-link {
  color: #00d4ff;
  text-decoration: none;
  font-size: 11px;
  word-break: break-all;
  display: block;
  padding: 6px;
  background: rgba(0, 212, 255, 0.1);
  border-radius: 4px;
  border: 1px solid rgba(0, 212, 255, 0.2);
}

.web-link:hover {
  background: rgba(0, 212, 255, 0.15);
  border-color: rgba(0, 212, 255, 0.4);
}

.btn-close {
  width: 100%;
  padding: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #999;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ccc;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 480px) {
  .share-options {
    position: fixed;
    top: 50%;
    left: 50%;
    right: auto;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 320px;
  }
}
`
