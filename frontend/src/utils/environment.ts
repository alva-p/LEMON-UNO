/**
 * Environment Detection - Determina el entorno de ejecución
 */

export enum Environment {
  WEBVIEW = 'WEBVIEW',
  BROWSER = 'BROWSER',
  DEVELOPMENT = 'DEVELOPMENT',
}

/**
 * Obtiene el entorno actual
 */
export function getEnvironment(): Environment {
  if (isWebView()) {
    return Environment.WEBVIEW
  }

  // En development si estamos en localhost
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return Environment.DEVELOPMENT
  }

  return Environment.BROWSER
}

/**
 * Verifica si estamos en WebView de Lemon Cash
 * Replacement para isWebView() del SDK real
 */
export function isWebView(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  // Detectar WebView real o simulado
  return ua.includes('lemon') || ua.includes('webview') || !!(
    (window as any).ReactNativeWebView &&
    typeof (window as any).ReactNativeWebView.postMessage === 'function'
  )
}

/**
 * Verifica si estamos en modo desarrollo
 */
export function isDevelopment(): boolean {
  return getEnvironment() === Environment.DEVELOPMENT
}

/**
 * Obtiene información de entorno para debugging
 */
export function getEnvironmentInfo() {
  const env = getEnvironment()
  return {
    environment: env,
    isWebView: webViewBridge.getIsWebView(),
    isDevelopment: isDevelopment(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    timestamp: new Date().toISOString(),
  }
}

/**
 * Log información de entorno (útil para debugging)
 */
export function logEnvironmentInfo(): void {
  const info = getEnvironmentInfo()
  console.group('🌍 Environment Info')
  console.log('Environment:', info.environment)
  console.log('Is WebView:', info.isWebView)
  console.log('Is Development:', info.isDevelopment)
  console.log('URL:', info.url)
  console.log('Timestamp:', info.timestamp)
  console.groupEnd()
}
