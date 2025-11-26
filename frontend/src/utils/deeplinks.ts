/**
 * Deeplink Handler - Maneja URLs profundas de Lemon Cash
 * Permite acceder a la mini app desde fuentes externas (webs, QR codes, otros apps)
 */

export enum DeeplinkAction {
  SHOW_DETAIL = 'SHOW_DETAIL',      // lemoncash://app/mini-apps/detail/:id
  LAUNCH_WEBVIEW = 'LAUNCH_WEBVIEW', // lemoncash://app/mini-apps/webview/:id
  UNKNOWN = 'UNKNOWN',
}

export interface DeeplinkData {
  action: DeeplinkAction
  miniAppId: string
  params?: Record<string, string>
  raw: string
  timestamp: Date
}

/**
 * Parseador de deeplinks de Lemon Cash
 */
export class DeeplinkParser {
  private static readonly DEEPLINK_SCHEMES = ['lemoncash://', 'lemon://']
  private static readonly DETAIL_PATTERN = /^lemoncash:\/\/app\/mini-apps\/detail\/([a-zA-Z0-9_-]+)(?:\?(.*))?$/
  private static readonly WEBVIEW_PATTERN = /^lemoncash:\/\/app\/mini-apps\/webview\/([a-zA-Z0-9_-]+)(?:\?(.*))?$/

  /**
   * Verifica si una URL es un deeplink válido de Lemon Cash
   */
  static isDeeplink(url: string): boolean {
    if (!url || typeof url !== 'string') return false
    return this.DEEPLINK_SCHEMES.some((scheme) => url.startsWith(scheme))
  }

  /**
   * Parsea un deeplink y extrae la información
   */
  static parse(url: string): DeeplinkData | null {
    if (!url || typeof url !== 'string') {
      console.warn('⚠️  URL inválida para deeplink:', url)
      return null
    }

    // Normalizar URL
    const normalized = url.trim()

    // Verificar patrón de detail
    const detailMatch = normalized.match(this.DETAIL_PATTERN)
    if (detailMatch) {
      return {
        action: DeeplinkAction.SHOW_DETAIL,
        miniAppId: detailMatch[1],
        params: this.parseQueryString(detailMatch[2]),
        raw: normalized,
        timestamp: new Date(),
      }
    }

    // Verificar patrón de webview
    const webviewMatch = normalized.match(this.WEBVIEW_PATTERN)
    if (webviewMatch) {
      return {
        action: DeeplinkAction.LAUNCH_WEBVIEW,
        miniAppId: webviewMatch[1],
        params: this.parseQueryString(webviewMatch[2]),
        raw: normalized,
        timestamp: new Date(),
      }
    }

    console.warn('⚠️  Deeplink no reconocido:', normalized)
    return {
      action: DeeplinkAction.UNKNOWN,
      miniAppId: '',
      raw: normalized,
      timestamp: new Date(),
    }
  }

  /**
   * Parsea query string a objeto
   */
  private static parseQueryString(queryString?: string): Record<string, string> {
    if (!queryString) return {}

    const params: Record<string, string> = {}
    const searchParams = new URLSearchParams(queryString)

    searchParams.forEach((value, key) => {
      params[key] = value
    })

    return params
  }

  /**
   * Genera un deeplink para detail page
   */
  static generateDetailLink(miniAppId: string, params?: Record<string, string>): string {
    let url = `lemoncash://app/mini-apps/detail/${miniAppId}`

    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString()
      url += `?${queryString}`
    }

    return url
  }

  /**
   * Genera un deeplink para webview
   */
  static generateWebviewLink(miniAppId: string, params?: Record<string, string>): string {
    let url = `lemoncash://app/mini-apps/webview/${miniAppId}`

    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString()
      url += `?${queryString}`
    }

    return url
  }

  /**
   * Abre un deeplink en el navegador o app nativa
   */
  static openDeeplink(url: string): boolean {
    if (!this.isDeeplink(url)) {
      console.warn('⚠️  No es un deeplink válido:', url)
      return false
    }

    try {
      // En navegador web
      if (typeof window !== 'undefined') {
        window.location.href = url
        return true
      }
    } catch (err) {
      console.error('Error abriendo deeplink:', err)
      return false
    }

    return false
  }

  /**
   * Validación de mini-app-id
   */
  static isValidMiniAppId(id: string): boolean {
    if (!id || typeof id !== 'string') return false
    // Mini app ID debe ser alfanumérico con guiones y guiones bajos
    return /^[a-zA-Z0-9_-]+$/.test(id)
  }

  /**
   * Log de información de deeplink (para debugging)
   */
  static logDeeplinkInfo(data: DeeplinkData): void {
    console.group('🔗 Deeplink Info')
    console.log('Action:', data.action)
    console.log('Mini App ID:', data.miniAppId)
    console.log('Params:', data.params)
    console.log('Raw URL:', data.raw)
    console.log('Timestamp:', data.timestamp.toISOString())
    console.groupEnd()
  }
}

/**
 * Hook de React para manejar deeplinks en la app
 * Escucha cambios en la URL y procesa deeplinks
 */
export class DeeplinkListener {
  private static listeners: Map<DeeplinkAction, Array<(data: DeeplinkData) => void>> = new Map()
  private static isInitialized = false

  /**
   * Inicializa el listener de deeplinks
   */
  static initialize(): void {
    if (this.isInitialized) return

    // Listener para cuando la URL cambia
    if (typeof window !== 'undefined') {
      // Comprobar la URL actual al cargar
      this.checkCurrentUrl()

      // Escuchar cambios de hash (para navegación en client-side)
      window.addEventListener('hashchange', () => {
        this.checkCurrentUrl()
      })

      // En una app real con routing, se escucharía el cambio de ruta
      console.log('✅ Deeplink listener inicializado')
    }

    this.isInitialized = true
  }

  /**
   * Comprueba la URL actual y procesa si es un deeplink
   */
  private static checkCurrentUrl(): void {
    const url = typeof window !== 'undefined' ? window.location.href : ''

    // Si viene del deeplink (URL contiene parámetro special)
    const params = new URLSearchParams(window.location.search)
    const deeplinkParam = params.get('deeplink')

    if (deeplinkParam) {
      const data = DeeplinkParser.parse(deeplinkParam)
      if (data) {
        this.handleDeeplink(data)
      }
    }
  }

  /**
   * Registra un listener para un action específico
   */
  static on(action: DeeplinkAction, callback: (data: DeeplinkData) => void): () => void {
    if (!this.listeners.has(action)) {
      this.listeners.set(action, [])
    }

    this.listeners.get(action)!.push(callback)

    // Devolver función para desuscribirse
    return () => {
      const callbacks = this.listeners.get(action)
      if (callbacks) {
        const index = callbacks.indexOf(callback)
        if (index > -1) {
          callbacks.splice(index, 1)
        }
      }
    }
  }

  /**
   * Procesa un deeplink recibido
   */
  private static handleDeeplink(data: DeeplinkData): void {
    DeeplinkParser.logDeeplinkInfo(data)

    // Notificar listeners registrados
    const callbacks = this.listeners.get(data.action)
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data)
        } catch (err) {
          console.error('Error en deeplink listener:', err)
        }
      })
    }

    // Notificar listeners generales
    const generalCallbacks = this.listeners.get(DeeplinkAction.UNKNOWN)
    if (generalCallbacks) {
      generalCallbacks.forEach((callback) => {
        try {
          callback(data)
        } catch (err) {
          console.error('Error en deeplink listener general:', err)
        }
      })
    }
  }

  /**
   * Procesa un deeplink manualmente
   */
  static processDeeplink(url: string): boolean {
    const data = DeeplinkParser.parse(url)
    if (!data) return false

    this.handleDeeplink(data)
    return true
  }

  /**
   * Reset de listeners (útil para testing)
   */
  static reset(): void {
    this.listeners.clear()
    this.isInitialized = false
  }

  /**
   * Get estado de inicialización
   */
  static getIsInitialized(): boolean {
    return this.isInitialized
  }
}

// Inicializar automáticamente
if (typeof window !== 'undefined') {
  DeeplinkListener.initialize()
}
