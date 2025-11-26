import { ethers } from 'ethers'

export interface SignMessage {
  message: string
  nonce: string
  timestamp: number
}

/**
 * Generate a SIWE (Sign In With Ethereum) message for authentication
 */
export const generateSignMessage = (address: string): SignMessage => {
  const nonce = Math.random().toString(36).substring(2, 15)
  const timestamp = Date.now()

  return {
    message: `Sign this message to authenticate with UNO CASH\n\nWallet: ${address}\nNonce: ${nonce}\nTimestamp: ${timestamp}`,
    nonce,
    timestamp,
  }
}

/**
 * Sign a message with the user's wallet
 * In WebView, this would be done via Lemon SDK
 * In dev/testing, uses ethers.js
 */
export const signMessage = async (
  message: string,
  address: string
): Promise<string> => {
  // In production WebView, Lemon SDK would handle this
  // For now, we'll return a mock signature for development
  try {
    // This would normally be done through the Lemon SDK
    // For testing purposes, we'll create a simple hash
    const messageHash = ethers.id(message)
    console.log('Message to sign:', message)
    console.log('Message hash:', messageHash)

    // In WebView, Lemon would handle the actual signing
    // Return a mock signature for development
    return messageHash
  } catch (err) {
    console.error('Error signing message:', err)
    throw err
  }
}

/**
 * Verify a signature (backend would do this normally)
 */
export const verifySignature = (
  message: string,
  signature: string,
  address: string
): boolean => {
  try {
    const recovered = ethers.recoverAddress(
      ethers.id(message),
      signature
    )
    return recovered.toLowerCase() === address.toLowerCase()
  } catch (err) {
    console.error('Error verifying signature:', err)
    return false
  }
}

/**
 * Lemon SDK Deposit (only works in WebView)
 * Initiates a deposit transaction through Lemon Cash
 */
export const deposit = async (amount: number): Promise<string> => {
  try {
    const lemonSDK = (window as any).LemonCash

    if (!lemonSDK || !lemonSDK.deposit) {
      throw new Error('Lemon Cash SDK not available. Open this app in Lemon Cash.')
    }

    const result = await lemonSDK.deposit(amount, 'ARS')
    return result.transactionHash || result.id
  } catch (err) {
    console.error('Deposit error:', err)
    throw err
  }
}

/**
 * Lemon SDK Withdraw (only works in WebView)
 * Initiates a withdrawal through Lemon Cash
 */
export const withdraw = async (amount: number): Promise<string> => {
  try {
    const lemonSDK = (window as any).LemonCash

    if (!lemonSDK || !lemonSDK.withdraw) {
      throw new Error('Lemon Cash SDK not available. Open this app in Lemon Cash.')
    }

    const result = await lemonSDK.withdraw(amount, 'ARS')
    return result.transactionHash || result.id
  } catch (err) {
    console.error('Withdraw error:', err)
    throw err
  }
}

/**
 * Lemon SDK Smart Contract Call (only works in WebView)
 * Executes a smart contract function through Lemon Cash
 */
export const callSmartContract = async (
  contractAddress: string,
  functionName: string,
  params: any[]
): Promise<string> => {
  try {
    const lemonSDK = (window as any).LemonCash

    if (!lemonSDK || !lemonSDK.callSmartContract) {
      throw new Error('Lemon Cash SDK not available. Open this app in Lemon Cash.')
    }

    const result = await lemonSDK.callSmartContract({
      contractAddress,
      functionName,
      params,
    })

    return result.transactionHash || result.id
  } catch (err) {
    console.error('Smart contract call error:', err)
    throw err
  }
}

/**
 * Development utility: Mock authentication (when not in WebView)
 */
export const mockAuthenticate = async (address: string) => {
  console.log('🔐 Mock authentication for address:', address)
  return {
    walletId: `wallet_${address.substring(0, 8)}`,
    address,
    username: `User_${address.substring(0, 6)}`,
    balance: 5000, // Mock balance
    wins: Math.floor(Math.random() * 20),
    points: Math.floor(Math.random() * 500),
  }
}
