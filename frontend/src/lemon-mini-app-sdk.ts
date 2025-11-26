// Local shim for `@lemoncash/mini-app-sdk` used for local development/demo.
// Replace this with the real SDK import when you install the official package.

import {
  authenticate as mockAuthenticate,
  isWebView as mockIsWebView,
  deposit as mockDeposit,
  callSmartContract as mockCallSmartContract,
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
  return mockIsWebView()
}

export async function authenticate(opts?: { nonce?: string; chainId?: ChainId }): Promise<any> {
  return mockAuthenticate({
    nonce: opts?.nonce,
    chainId: opts?.chainId,
  })
}

export async function deposit(options: { amount: string; tokenName: TokenName; chainId?: ChainId }): Promise<any> {
  return mockDeposit({
    amount: options.amount,
    tokenName: options.tokenName,
    chainId: options.chainId,
  })
}

export async function callSmartContract(input: any): Promise<any> {
  return mockCallSmartContract(input)
}

export default {
  isWebView,
  authenticate,
  deposit,
  callSmartContract,
  TransactionResult,
  ChainId,
  TokenName,
  getMockWallets,
  resetMock,
}
