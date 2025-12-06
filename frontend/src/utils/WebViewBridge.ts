/**
 * WebView Bridge - Comunicación con la app de Lemon Cash
 * Maneja el envío y recepción de mensajes entre el mini app y la app nativa
 */

export enum MessageAction {
  // Autenticación
  AUTHENTICATE = 'AUTHENTICATE',
  AUTHENTICATE_RESPONSE = 'AUTHENTICATE_RESPONSE',

  // Transacciones
  DEPOSIT = 'DEPOSIT',
  DEPOSIT_RESPONSE = 'DEPOSIT_RESPONSE',
  WITHDRAW = 'WITHDRAW',
  WITHDRAW_RESPONSE = 'WITHDRAW_RESPONSE',

  // Contratos inteligentes
  CALL_SMART_CONTRACT = 'CALL_SMART_CONTRACT',
  CALL_SMART_CONTRACT_RESPONSE = 'CALL_SMART_CONTRACT_RESPONSE',

  // Notificaciones
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
}

export interface WebViewMessage {
  action: MessageAction
  nonce?: string
  data?: any
  error?: {
    code: string
    message: string
  }
}

export interface PendingRequest {
  id: string
  action: MessageAction
  timestamp: number
  resolve: (value: any) => void
  reject: (reason?: any) => void
}

/**
 * WebViewBridge - Maneja toda la comunicación con Lemon Cash
 */
export class WebViewBridge {
  private isWebView = false
  private pendingRequests = new Map<string, PendingRequest>()
  private requestIdCounter = 0
  private messageListeners: Array<(msg: WebViewMessage) => void> = []
  private lastWebSocketErrorTime = 0

  constructor() {
    this.detectWebView()
    this.setupMessageListener()
  }

  /**
   * Detecta si la app está corriendo en WebView de Lemon Cash
   */
  private detectWebView(): void {
    // Comprobar si existe window.ReactNativeWebView (inyectado por Lemon Cash)
    this.isWebView = !!(
      typeof window !== 'undefined' &&
      (window as any).ReactNativeWebView &&
      typeof (window as any).ReactNativeWebView.postMessage === 'function'
    )

    console.log(`🌐 WebView detectado: ${this.isWebView ? 'SÍ' : 'NO'}`)
  }

  /**
   * Configura el listener para mensajes de la app nativa
   */
  private setupMessageListener(): void {
    // En WebView, la app nativa envía mensajes a través de eventos
    if (this.isWebView) {
      document.addEventListener('message', (event: any) => {
        try {
          const message: WebViewMessage = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (err) {
          console.error('Error parseando mensaje de WebView:', err)
        }
      })

      // Alternative para algunos navegadores
      if ((window as any).addEventListener) {
        (window as any).addEventListener('message', (event: any) => {
          try {
            const message: WebViewMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (err) {
            console.error('Error parseando mensaje (alternativo):', err)
          }
        })
      }

      console.log('✅ WebView message listener configurado')
    }
  }

  /**
   * Maneja mensajes recibidos de la app nativa
   */
  private handleMessage(message: WebViewMessage): void {
    console.log(`📨 Mensaje recibido: ${message.action}`, message.data)

    // Notificar a todos los listeners
    this.messageListeners.forEach((listener) => {
      try {
        listener(message)
      } catch (err) {
        console.error('Error en message listener:', err)
      }
    })

    // Si es una respuesta, resolver el request pendiente
    if (message.nonce && this.pendingRequests.has(message.nonce)) {
      const pending = this.pendingRequests.get(message.nonce)!

      if (message.error) {
        pending.reject(new Error(message.error.message))
      } else {
        pending.resolve(message.data)
      }

      this.pendingRequests.delete(message.nonce)
    }
  }

  /**
   * Envía un mensaje a la app nativa
   */
  private sendMessage(message: WebViewMessage): void {
    if (!this.isWebView) {
      console.warn('⚠️  WebView no disponible, mensaje no enviado:', message.action)
      return
    }

    try {
      const serialized = JSON.stringify(message)
      ;(window as any).ReactNativeWebView.postMessage(serialized)
      console.log(`📤 Mensaje enviado: ${message.action}`)
    } catch (err) {
      console.error('Error enviando mensaje a WebView:', err)
      throw err
    }
  }

  /**
   * Envía un mensaje y espera respuesta
   */
  async sendRequest(action: MessageAction, data?: any): Promise<any> {
    // Si no estamos en WebView, devolver null
    if (!this.isWebView) {
      console.warn(`⚠️  WebView no disponible para ${action}`)
      return null
    }

    const nonce = `req_${this.requestIdCounter++}_${Date.now()}`

    return new Promise((resolve, reject) => {
      // Timeout de 30 segundos
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(nonce)
        reject(new Error(`Timeout esperando respuesta para ${action}`))
      }, 30000)

      this.pendingRequests.set(nonce, {
        id: nonce,
        action,
        timestamp: Date.now(),
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (reason) => {
          clearTimeout(timeout)
          reject(reason)
        },
      })

      // Enviar el mensaje
      this.sendMessage({
        action,
        nonce,
        data,
      })
    })
  }

  /**
   * Registra un listener para mensajes
   */
  onMessage(callback: (message: WebViewMessage) => void): () => void {
    this.messageListeners.push(callback)
    // Devolver función para desuscribirse
    return () => {
      const index = this.messageListeners.indexOf(callback)
      if (index > -1) {
        this.messageListeners.splice(index, 1)
      }
    }
  }

  /**
   * Log error with throttling to prevent spam
   */
  private logError(message: string, ...args: any[]): void {
    const now = Date.now()
    if (now - this.lastWebSocketErrorTime > 5000) {
      console.error(message, ...args)
      this.lastWebSocketErrorTime = now
    }
  }

  /**
   * Solicita autenticación
   */
  async requestAuthenticate(nonce: string, chainId?: number): Promise<any> {
    return this.sendRequest(MessageAction.AUTHENTICATE, {
      nonce,
      chainId,
    })
  }

  /**
   * Solicita depósito
   */
  async requestDeposit(amount: string, tokenName: string): Promise<any> {
    return this.sendRequest(MessageAction.DEPOSIT, {
      amount,
      tokenName,
    })
  }

  /**
   * Solicita retiro
   */
  async requestWithdraw(amount: string, tokenName: string): Promise<any> {
    return this.sendRequest(MessageAction.WITHDRAW, {
      amount,
      tokenName,
    })
  }

  /**
   * Solicita interacción con contrato inteligente
   */
  async requestCallSmartContract(
    contracts: any[],
    titleValues?: Record<string, string>,
    descriptionValues?: Record<string, string>
  ): Promise<any> {
    return this.sendRequest(MessageAction.CALL_SMART_CONTRACT, {
      contracts,
      titleValues,
      descriptionValues,
    })
  }

  /**
   * Obtiene estadísticas de requests pendientes
   */
  getPendingRequestsStats() {
    return {
      count: this.pendingRequests.size,
      oldest: Array.from(this.pendingRequests.values()).sort(
        (a, b) => a.timestamp - b.timestamp
      )[0],
    }
  }

  /**
   * Limpia requests expirados
   */
  cleanupExpiredRequests(timeoutMs: number = 60000): number {
    let cleaned = 0
    const now = Date.now()

    this.pendingRequests.forEach((request, nonce) => {
      if (now - request.timestamp > timeoutMs) {
        request.reject(new Error(`Request expirado: ${request.action}`))
        this.pendingRequests.delete(nonce)
        cleaned++
      }
    })

    if (cleaned > 0) {
      console.log(`🧹 Limpiados ${cleaned} requests expirados`)
    }

    return cleaned
  }

  /**
   * Reseta el estado del bridge
   */
  reset(): void {
    this.pendingRequests.clear()
    this.messageListeners = []
    this.requestIdCounter = 0
    console.log('🔄 WebViewBridge reseteado')
  }
}

// Instancia singleton del bridge
export const webViewBridge = new WebViewBridge()
