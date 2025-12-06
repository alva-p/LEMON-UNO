/**
 * Deeplink Generator - Genera links profundos y códigos QR
 * Permite compartir acceso directo a la mini app
 */

import { DeeplinkParser } from './deeplinks'

export interface ShareableLink {
  deeplink: string
  webUrl: string
  qrData: string // Base64 encoded QR code
  shortUrl?: string
}

/**
 * Generador de deeplinks compartibles
 */
export class DeeplinkGenerator {
  // Mini App ID de Lemon UNO (obtener del equipo de Lemon Cash)
  private static readonly MINI_APP_ID = 'lemon-uno'

  // URL base del sitio web para fallback
  private static readonly WEB_BASE_URL = 'https://lemon-uno.com'

  /**
   * Genera un deeplink para invitar a un juego
   */
  static generateGameInviteLink(gameId: string, betAmount?: number): string {
    const params: Record<string, string> = {
      gameId,
    }

    if (betAmount) {
      params.bet = betAmount.toString()
    }

    return DeeplinkParser.generateWebviewLink(this.MINI_APP_ID, params)
  }

  /**
   * Genera un deeplink para enviar a lobby específico
   */
  static generateLobbyLink(lobbyId: string): string {
    return DeeplinkParser.generateWebviewLink(this.MINI_APP_ID, {
      lobbyId,
    })
  }

  /**
   * Genera un deeplink para el profile de un usuario
   */
  static generateProfileLink(userId: string): string {
    return DeeplinkParser.generateDetailLink(this.MINI_APP_ID, {
      userId,
      page: 'profile',
    })
  }

  /**
   * Genera un deeplink para tournament
   */
  static generateTournamentLink(tournamentId: string): string {
    return DeeplinkParser.generateWebviewLink(this.MINI_APP_ID, {
      tournamentId,
    })
  }

  /**
   * Genera un deeplink simple para abrir la app
   */
  static generateAppLink(): string {
    return DeeplinkParser.generateWebviewLink(this.MINI_APP_ID)
  }

  /**
   * Genera URL web compatible (fallback para devices sin Lemon Cash app)
   */
  static generateWebUrl(params?: Record<string, string>): string {
    let url = this.WEB_BASE_URL

    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString()
      url += `?${queryString}`
    }

    return url
  }

  /**
   * Genera un QR code en formato SVG o Data URL
   * Nota: Esta es una implementación básica que genera un placeholder
   * Para QR codes reales, usar una librería como `qrcode.react`
   */
  static generateQRCodeData(deeplink: string): string {
    // En producción, usar qrcode.react o qrcode.js
    // Este es un placeholder que muestra el URL en formato texto

    // Simulación: En producción esto generaría una imagen QR
    console.log(`📱 QR Code para: ${deeplink}`)

    // Retornar data URL de un SVG simple (para desarrollo)
    const encoded = encodeURIComponent(deeplink)
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`
  }

  /**
   * Comparte un deeplink
   */
  static async shareDeeplink(
    deeplink: string,
    title: string = 'Juega Chain Table',
    text: string = '¡Únete a mi juego en Chain Table!'
  ): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.share) {
      console.warn('⚠️  Share API no disponible en este navegador')
      return false
    }

    try {
      await navigator.share({
        title,
        text: `${text}\n\n${deeplink}`,
      })
      return true
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.log('Share cancelado por usuario')
      } else {
        console.error('Error compartiendo:', err)
      }
      return false
    }
  }

  /**
   * Copia un deeplink al portapapeles
   */
  static async copyToClipboard(deeplink: string): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      console.warn('⚠️  Clipboard API no disponible')
      return false
    }

    try {
      await navigator.clipboard.writeText(deeplink)
      console.log('✅ Deeplink copiado al portapapeles')
      return true
    } catch (err) {
      console.error('Error copiando al portapapeles:', err)
      return false
    }
  }

  /**
   * Abre un deeplink en la app de Lemon Cash
   */
  static openInLemonCash(deeplink: string): void {
    if (typeof window !== 'undefined') {
      window.location.href = deeplink
    }
  }

  /**
   * Genera un objeto con todos los links compartibles
   */
  static generateShareableLink(
    type: 'game' | 'lobby' | 'profile' | 'tournament' | 'app',
    id?: string,
    additionalParams?: Record<string, string>
  ): ShareableLink {
    let deeplink = ''
    let params: Record<string, string> = additionalParams || {}

    switch (type) {
      case 'game':
        deeplink = this.generateGameInviteLink(id || '', undefined)
        break
      case 'lobby':
        deeplink = this.generateLobbyLink(id || '')
        break
      case 'profile':
        deeplink = this.generateProfileLink(id || '')
        break
      case 'tournament':
        deeplink = this.generateTournamentLink(id || '')
        break
      case 'app':
      default:
        deeplink = this.generateAppLink()
    }

    return {
      deeplink,
      webUrl: this.generateWebUrl(params),
      qrData: this.generateQRCodeData(deeplink),
    }
  }

  /**
   * Obtiene información del mini app
   */
  static getAppInfo() {
    return {
      miniAppId: this.MINI_APP_ID,
      name: 'Lemon UNO',
      description: 'Juega UNO con apuestas reales en Lemon Cash',
      webBaseUrl: this.WEB_BASE_URL,
    }
  }
}

/**
 * Utilidades para HTML
 */
export class DeeplinkHTML {
  /**
   * Genera un elemento <a> con deeplink
   */
  static createDeeplinkElement(
    deeplink: string,
    text: string = 'Abrir en Lemon UNO',
    className?: string
  ): HTMLAnchorElement {
    const link = document.createElement('a')
    link.href = deeplink
    link.textContent = text

    if (className) {
      link.className = className
    }

    // Atributos de accesibilidad
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')

    return link
  }

  /**
   * Inserta un botón de deeplink en un elemento
   */
  static insertDeeplinkButton(
    containerId: string,
    deeplink: string,
    buttonText: string = 'Jugar en Lemon UNO'
  ): boolean {
    const container = document.getElementById(containerId)
    if (!container) {
      console.warn(`⚠️  Elemento con ID ${containerId} no encontrado`)
      return false
    }

    const button = document.createElement('button')
    button.textContent = buttonText
    button.style.cursor = 'pointer'
    button.onclick = () => DeeplinkGenerator.openInLemonCash(deeplink)

    container.appendChild(button)
    return true
  }

  /**
   * Genera HTML para QR code
   */
  static createQRCodeImage(deeplink: string, size: number = 300): HTMLImageElement {
    const img = document.createElement('img')
    img.src = DeeplinkGenerator.generateQRCodeData(deeplink)
    img.alt = 'QR Code para abrir en Lemon UNO'
    img.width = size
    img.height = size
    img.style.border = '2px solid #000'
    img.style.borderRadius = '8px'

    return img
  }
}
