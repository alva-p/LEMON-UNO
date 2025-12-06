// Local shim for `@lemoncash/mini-app-sdk` used for local development/demo.
// In production WebView, delegates to the real SDK.
// In development, uses mocks for testing.

import {
  authenticate as realAuthenticate,
  deposit as realDeposit,
  withdraw as realWithdraw,
  callSmartContract as realCallSmartContract,
  isWebView as realIsWebView,
} from '@lemoncash/mini-app-sdk'

import {
  authenticate as mockAuthenticate,
  deposit as mockDeposit,
  withdraw as mockWithdraw,
  callSmartContract as mockCallSmartContract,
  isWebView as mockIsWebView,
  getMockWallets,
  resetMock,
} from './mocks/lemonSDK'

// ========================================
// General Types
// ========================================

export type MiniAppError = {
  message: string
  code: string
}

export type Address = `0x${string}`
export type Hex = `0x${string}`

// ========================================
// Transaction Result
// ========================================

export enum TransactionResult {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// ========================================
// Chain IDs
// ========================================

export enum ChainId {
  // Mainnet
  ARBITRUM_ONE = 42161,
  BASE = 8453,
  ETH = 1,
  OP_MAINNET = 10,
  POLYGON = 137,

  // Testnet
  ARBITRUM_SEPOLIA = 421614,
  ETH_HOODI = 560048,
  ETH_SEPOLIA = 11155111,
  POLYGON_AMOY = 80002,
}

// ========================================
// Token Names
// ========================================

export enum TokenName {
  ETH = 'ETH',
  POL = 'POL',
  USDC = 'USDC',
  USDT = 'USDT',
}

// ========================================
// Contract Standards
// ========================================

export enum ContractStandard {
  ERC20 = 'ERC20',
}

// ========================================
// SDK Functions - Delegue a Mock SDK
// ========================================

export function isWebView(): boolean {
  return realIsWebView()
}

export async function authenticate(opts?: { nonce?: string; chainId?: ChainId }): Promise<any> {
  if (realIsWebView()) {
    return realAuthenticate(opts)
  } else {
    return mockAuthenticate(opts)
  }
}

export async function deposit(options: { amount: string; tokenName: TokenName; chainId?: ChainId }): Promise<any> {
  if (realIsWebView()) {
    return realDeposit(options)
  } else {
    return mockDeposit(options.amount, options.tokenName)
  }
}

export async function withdraw(options: { amount: string; tokenName: TokenName }): Promise<any> {
  if (realIsWebView()) {
    return realWithdraw(options)
  } else {
    return mockWithdraw(options.amount, options.tokenName)
  }
}

export async function callSmartContract(input: any): Promise<any> {
  if (realIsWebView()) {
    return realCallSmartContract(input)
  } else {
    return mockCallSmartContract(input)
  }
}

export default {
  isWebView,
  authenticate,
  deposit,
  withdraw,
  callSmartContract,
  TransactionResult,
  ChainId,
  TokenName,
  getMockWallets,
  resetMock,
}
