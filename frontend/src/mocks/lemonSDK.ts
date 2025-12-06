/**
 * Mock de @lemoncash/mini-app-sdk para desarrollo local
 * Simula el comportamiento real cuando no estás en WebView
 * En WebView real, delega a webViewBridge para comunicación nativa
 */

import { webViewBridge, MessageAction } from '../utils/WebViewBridge'
import { isWebView as isInWebView } from '../utils/environment'

export enum TransactionResult {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum ChainId {
  ETHEREUM = 1,
  SEPOLIA = 11155111,
  POLYGON = 137,
  POLYGON_AMOY = 80002,
}

export interface AuthenticateData {
  nonce?: string
  chainId?: number
}

export interface AuthenticateResponse {
  result: TransactionResult
  data?: {
    wallet: string
    signature: string
    message: string
  }
  error?: {
    message: string
    code: string
  }
}

// Mock de carteras para desarrollo
const MOCK_WALLETS = [
  {
    address: '0x1Ed17b06961B9B8DE78Ee924BcDaBC003aaE1867',
    name: 'Dev Wallet 1',
  },
  {
    address: '0x2aEb1aB4d3d5A2Fe3bC8D1e5F9c3D7B1A9E5F2c4',
    name: 'Dev Wallet 2',
  },
  {
    address: '0x3B9cD5f2E8a7C9D1B4f5E8a2C6D9e1F3a5B8C2d4',
    name: 'Dev Wallet 3',
  },
]

// Variable global para tracking de wallets asignadas
let assignedWallets = new Set<string>()
let walletAssignmentCounter = 0

/**
 * Mock de isWebView - detecta si está corriendo en WebView
 */
export function isWebView(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  // Simular WebView: busca "lemon" o "webview" en user agent
  return ua.includes('lemon') || ua.includes('webview')
}

/**
 * Mock de authenticate - simula SIWE
 * Genera un mensaje SIWE válido con el nonce proporcionado
 */
export async function authenticate(
  options?: AuthenticateData
): Promise<AuthenticateResponse> {
  // Si estamos en WebView real, delegar a la app nativa
  if (isInWebView()) {
    try {
      const response = await webViewBridge.requestAuthenticate(
        options?.nonce || 'default_nonce',
        options?.chainId
      )
      return {
        result: TransactionResult.SUCCESS,
        data: response,
      }
    } catch (err) {
      return {
        result: TransactionResult.FAILED,
        error: {
          message: (err as Error).message || 'Error en autenticación de WebView',
          code: 'WEBVIEW_AUTH_FAILED',
        },
      }
    }
  }

  // Mock para desarrollo - PERMITIR SIEMPRE EN DESARROLLO
  return new Promise((resolve) => {
    setTimeout(() => {
      // Obtener o generar wallet única para esta pestaña/ventana
      // Usar sessionStorage para que sea único por pestaña
      let sessionId = typeof window !== 'undefined' 
        ? window.sessionStorage.getItem('mock_session_id')
        : null
      
      if (!sessionId) {
        // Generar ID único para esta sesión/pestaña
        sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11)
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('mock_session_id', sessionId)
        }
      }

      // Obtener contador de llamadas para esta sesión
      let callCount = typeof window !== 'undefined' 
        ? parseInt(window.sessionStorage.getItem(`mock_call_count_${sessionId}`) || '0')
        : 0

      // Asignar wallet usando contador rotativo para testing multi-jugador
      const walletIndex = (walletAssignmentCounter + callCount) % MOCK_WALLETS.length
      const wallet = MOCK_WALLETS[walletIndex].address
      walletAssignmentCounter++
      callCount++

      // Marcar como asignada y guardar contador
      assignedWallets.add(wallet)
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(`mock_call_count_${sessionId}`, callCount.toString())
      }

      // Construye el mensaje SIWE siguiendo el estándar EIP-4361
      const message = generateSIWEMessage(wallet, options?.nonce, options?.chainId)

      // Genera una firma mock válida (64 bytes = 128 hex chars + 0x + v)
      const mockSignature = '0x' + 'ab'.repeat(65)

      console.log('✅ Mock authenticate exitoso')
      console.log('  Session ID:', sessionId)
      console.log('  Call Count:', callCount - 1)  // Since we incremented after
      console.log('  Wallet:', wallet)
      console.log('  Nonce:', options?.nonce?.slice(0, 8) + '...')

      resolve({
        result: TransactionResult.SUCCESS,
        data: {
          wallet,
          signature: mockSignature,
          message,
        },
      })
    }, 800) // Simula latencia de red
  })
}

/**
 * Genera un mensaje SIWE válido con el nonce
 */
function generateSIWEMessage(
  wallet: string,
  nonce?: string,
  chainId: number = 80002
): string {
  const timestamp = new Date().toISOString()
  const uri = 'http://localhost:5174'
  const appName = 'lemon-uno'

  // Mensaje SIWE siguiendo EIP-4361
  return `web3-miniapps-svc wants you to sign in with your Ethereum account:
${wallet}

Sign in with Ethereum to the app ${appName}.

URI: ${uri}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce || 'default_nonce_12345'}
Issued At: ${timestamp}`
}

/**
 * Mock de deposit
 */
export async function deposit(
  amount: string,
  tokenName?: string
): Promise<{
  result: TransactionResult
  data?: { txHash: string }
  error?: { message: string; code: string }
}> {
  // Si estamos en WebView real, delegar a la app nativa
  if (isInWebView()) {
    try {
      const response = await webViewBridge.requestDeposit(amount, tokenName || 'USDC')
      return {
        result: TransactionResult.SUCCESS,
        data: response,
      }
    } catch (err) {
      return {
        result: TransactionResult.FAILED,
        error: {
          message: (err as Error).message || 'Error en depósito de WebView',
          code: 'WEBVIEW_DEPOSIT_FAILED',
        },
      }
    }
  }

  // Mock para desarrollo
  return new Promise((resolve) => {
    setTimeout(() => {
      const depositAmount = parseFloat(amount)
      const currency = tokenName || 'ARS'

      // Validaciones
      if (isNaN(depositAmount) || depositAmount <= 0) {
        resolve({
          result: TransactionResult.FAILED,
          error: {
            message: 'Monto debe ser mayor a 0',
            code: 'INVALID_AMOUNT',
          },
        })
        return
      }

      // Límites según moneda
      let minDeposit = 100
      let maxDeposit = 100000
      let currencyLabel = 'ARS'

      switch (currency) {
        case 'ETH':
          minDeposit = 0.001
          maxDeposit = 10
          currencyLabel = 'ETH'
          break
        case 'USDT':
        case 'USDC':
          minDeposit = 1
          maxDeposit = 10000
          currencyLabel = currency
          break
        case 'ARS':
        default:
          minDeposit = 100
          maxDeposit = 100000
          currencyLabel = 'ARS'
          break
      }

      if (depositAmount < minDeposit) {
        resolve({
          result: TransactionResult.FAILED,
          error: {
            message: `Depósito mínimo: ${minDeposit} ${currencyLabel}`,
            code: 'MINIMUM_DEPOSIT',
          },
        })
        return
      }

      if (depositAmount > maxDeposit) {
        resolve({
          result: TransactionResult.FAILED,
          error: {
            message: `Depósito máximo: ${maxDeposit} ${currencyLabel}`,
            code: 'MAXIMUM_DEPOSIT',
          },
        })
        return
      }

      const mockTxHash = '0x' + Math.random().toString(16).slice(2).padStart(40, '0')
      console.log('✅ Mock deposit:', depositAmount, 'ARS')
      console.log('   txHash:', mockTxHash)

      resolve({
        result: TransactionResult.SUCCESS,
        data: {
          txHash: mockTxHash,
        },
      })
    }, 1200)
  })
}

/**
 * Mock de withdraw
 */
export async function withdraw(
  amount: string,
  tokenName?: string
): Promise<{
  result: TransactionResult
  data?: { txHash: string }
  error?: { message: string; code: string }
}> {
  // Si estamos en WebView real, delegar a la app nativa
  if (isInWebView()) {
    try {
      const response = await webViewBridge.requestWithdraw(amount, tokenName || 'USDC')
      return {
        result: TransactionResult.SUCCESS,
        data: response,
      }
    } catch (err) {
      return {
        result: TransactionResult.FAILED,
        error: {
          message: (err as Error).message || 'Error en retiro de WebView',
          code: 'WEBVIEW_WITHDRAW_FAILED',
        },
      }
    }
  }

  // Mock para desarrollo
  return new Promise((resolve) => {
    setTimeout(() => {
      const withdrawAmount = parseFloat(amount)

      // Validaciones
      if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        resolve({
          result: TransactionResult.FAILED,
          error: {
            message: 'Monto debe ser mayor a 0',
            code: 'INVALID_AMOUNT',
          },
        })
        return
      }

      if (withdrawAmount < 50) {
        resolve({
          result: TransactionResult.FAILED,
          error: {
            message: 'Retiro mínimo: $50 ARS',
            code: 'MINIMUM_WITHDRAW',
          },
        })
        return
      }

      if (withdrawAmount > 50000) {
        resolve({
          result: TransactionResult.FAILED,
          error: {
            message: 'Retiro máximo: $50,000 ARS',
            code: 'MAXIMUM_WITHDRAW',
          },
        })
        return
      }

      const mockTxHash = '0x' + Math.random().toString(16).slice(2).padStart(40, '0')
      console.log('✅ Mock withdraw:', withdrawAmount, 'ARS', 'Token:', tokenName || 'USDC')
      console.log('   txHash:', mockTxHash)

      resolve({
        result: TransactionResult.SUCCESS,
        data: {
          txHash: mockTxHash,
        },
      })
    }, 1200)
  })
}

/**
 * Smart contract interaction parameters
 */
export interface ContractCall {
  contractAddress: string
  functionName: string
  functionParams: (string | number)[]
  value: string
  contractStandard?: string
  chainId?: number
}

export interface CallSmartContractInput {
  contracts: ContractCall[]
  titleValues?: Record<string, string>
  descriptionValues?: Record<string, string>
}

/**
 * Mock de callSmartContract - Interactúa con contratos inteligentes
 * Soporta transacciones simples y por lotes (batch)
 */
export async function callSmartContract(
  input: CallSmartContractInput
): Promise<{
  result: TransactionResult
  data?: { txHash: string }
  error?: { message: string; code: string }
}> {
  // Si estamos en WebView real, delegar a la app nativa
  if (isInWebView()) {
    try {
      const response = await webViewBridge.requestCallSmartContract(
        input.contracts,
        input.titleValues,
        input.descriptionValues
      )
      return {
        result: TransactionResult.SUCCESS,
        data: response,
      }
    } catch (err) {
      return {
        result: TransactionResult.FAILED,
        error: {
          message: (err as Error).message || 'Error en llamada de contrato de WebView',
          code: 'WEBVIEW_CONTRACT_CALL_FAILED',
        },
      }
    }
  }

  // Mock para desarrollo
  return new Promise((resolve) => {
    setTimeout(() => {
      // Validaciones
      if (!input.contracts || input.contracts.length === 0) {
        resolve({
          result: TransactionResult.FAILED,
          error: {
            message: 'Al menos un contrato debe ser especificado',
            code: 'INVALID_CONTRACTS',
          },
        })
        return
      }

      // Validar cada contrato
      for (const contract of input.contracts) {
        if (!contract.contractAddress || !contract.contractAddress.startsWith('0x')) {
          resolve({
            result: TransactionResult.FAILED,
            error: {
              message: 'Dirección de contrato inválida',
              code: 'INVALID_CONTRACT_ADDRESS',
            },
          })
          return
        }

        if (!contract.functionName || contract.functionName.trim().length === 0) {
          resolve({
            result: TransactionResult.FAILED,
            error: {
              message: 'Nombre de función requerido',
              code: 'INVALID_FUNCTION_NAME',
            },
          })
          return
        }

        if (!Array.isArray(contract.functionParams)) {
          resolve({
            result: TransactionResult.FAILED,
            error: {
              message: 'Parámetros de función deben ser un array',
              code: 'INVALID_PARAMS',
            },
          })
          return
        }

        if (contract.value && isNaN(Number(contract.value))) {
          resolve({
            result: TransactionResult.FAILED,
            error: {
              message: 'Valor debe ser un número',
              code: 'INVALID_VALUE',
            },
          })
          return
        }
      }

      // Generar tx hash con formato válido
      const mockTxHash = '0x' + Math.random().toString(16).slice(2).padStart(40, '0')

      // Logging
      console.log('✅ Mock smart contract call(s):')
      input.contracts.forEach((contract, index) => {
        console.log(
          `   [${index + 1}] ${contract.functionName} @ ${contract.contractAddress.slice(
            0,
            10
          )}...`
        )
        console.log(`       Params:`, contract.functionParams)
        console.log(`       Value: ${contract.value} wei`)
      })

      // Si hay múltiples contratos, es batch
      if (input.contracts.length > 1) {
        console.log(`   📦 Batch transaction: ${input.contracts.length} calls`)
      }

      // Log de valores interpolados
      if (input.titleValues) {
        console.log('   Title values:', input.titleValues)
      }
      if (input.descriptionValues) {
        console.log('   Description values:', input.descriptionValues)
      }

      console.log('   txHash:', mockTxHash)

      resolve({
        result: TransactionResult.SUCCESS,
        data: {
          txHash: mockTxHash,
        },
      })
    }, 1500)
  })
}

/**
 * Retorna lista de wallets mock para testing
 */
export function getMockWallets() {
  return MOCK_WALLETS
}

/**
 * Resetea el estado mock
 */
export function resetMock() {
  assignedWallets.clear()
  walletAssignmentCounter = 0
  // Limpiar todas las wallets mock guardadas
  if (typeof window !== 'undefined') {
    const keys = Object.keys(window.localStorage).filter(key => key.startsWith('mock_wallet_'))
    keys.forEach(key => window.localStorage.removeItem(key))
    window.sessionStorage.removeItem('mock_session_id')
  }
}
