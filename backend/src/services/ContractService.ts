// backend/src/services/ContractService.ts

// Silenciar el warning de ENS que tira ethers en redes que no soportan ENS
const originalConsoleWarn = console.warn
console.warn = function (msg, ...args) {
  if (typeof msg === 'string' && msg.includes('network does not support ENS')) {
    return
  }
  originalConsoleWarn.apply(console, [msg, ...args])
}

import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Carga un ABI desde backend/abi/<name>.json
 * Usamos ../../abi para subir desde dist/services → backend/abi
 */
// filepath: /home/alva/Proyectos/LemonCash/LEMON-UNO/backend/src/services/ContractService.ts
function loadABI(name: string) {
  // Siempre busca el ABI en backend/abi/
  const projectRoot = path.resolve(__dirname, '../../');
  const abiPath = path.join(projectRoot, 'abi', `${name}.json`);
  const abiJson = fs.readFileSync(abiPath, 'utf8');
  return JSON.parse(abiJson).abi;
}

export class ContractService {
  private provider?: ethers.JsonRpcProvider
  private wallet?: ethers.Wallet
  private unoLobbyV2?: ethers.Contract
  private enabled = false
  private network: 'ETH' | 'BASE'

  constructor(network: 'ETH' | 'BASE' = 'BASE') {
    this.network = network

    try {
      // 1) RPC según red
      const rpcUrl =
        network === 'ETH'
          ? process.env.SEPOLIA_ETH_RPC || process.env.ETH_SEPOLIA_RPC
          : process.env.BASE_SEPOLIA_RPC

      if (!rpcUrl) {
        console.warn(
          `[ContractService] RPC URL not configured for network=${network}. On-chain integration DISABLED.`,
        )
        return
      }

      const privateKey = process.env.DEV_PRIVATE_KEY
      if (!privateKey) {
        console.warn(
          '[ContractService] DEV_PRIVATE_KEY not configured. On-chain integration DISABLED.',
        )
        return
      }

      this.provider = new ethers.JsonRpcProvider(rpcUrl)
      this.wallet = new ethers.Wallet(privateKey, this.provider)

      // 2) Dirección de contrato según red
      const contractAddress =
        network === 'ETH'
          ? process.env.UNO_LOBBY_V2_SEPOLIA_ADDRESS ||
            process.env.CONTRACT_ADDRESS_SEPOLIA
          : process.env.UNO_LOBBY_V2_BASE_ADDRESS ||
            process.env.CONTRACT_ADDRESS_BASE_SEPOLIA ||
            process.env.UNO_LOBBY_V2_ADDRESS

      if (!contractAddress) {
        console.warn(
          `[ContractService] Contract address not configured for network=${network}. On-chain integration DISABLED.`,
        )
        return
      }

      // 3) Cargar ABI
      let abi: any
      try {
        abi = loadABI('UnoLobbyV2')
      } catch (err) {
        console.error(
          '[ContractService] Failed to load ABI for UnoLobbyV2 from backend/abi:',
          err,
        )
        return
      }

      this.unoLobbyV2 = new ethers.Contract(contractAddress, abi, this.wallet)
      this.enabled = true

      console.log(
        `[ContractService] On-chain integration ENABLED. Network=${network}, contract=${contractAddress}`,
      )
    } catch (err) {
      console.error(
        '[ContractService] Failed to initialize on-chain integration:',
        err,
      )
      this.enabled = false
    }
  }

  private ensureEnabled() {
    if (!this.enabled || !this.unoLobbyV2) {
      throw new Error(
        'On-chain contract integration is not configured (RPC/PK/ABI/address missing)',
      )
    }
  }

  /**
   * Crear lobby on-chain.
   * token: address del token o address especial según tu contrato
   * entryFee: en wei (bigint)
   */
  async createLobby(token: string, entryFee: bigint, maxPlayers: number) {
    this.ensureEnabled()

    console.log('[ContractService] createLobby on-chain', {
      token,
      entryFee: entryFee.toString(),
      maxPlayers,
      network: this.network,
    })

    const tx = await this.unoLobbyV2!.createLobby(token, entryFee, maxPlayers)
    const receipt = await tx.wait()

    // En ethers v6, los logs ya vienen decodificados cuando vienen del contrato
    const event = (receipt.logs as any[]).find(
      (log) => log.fragment && log.fragment.name === 'LobbyCreated',
    )

    if (event) {
      const lobbyId = event.args.lobbyId
      console.log('[ContractService] LobbyCreated event', {
        lobbyId: lobbyId.toString?.() ?? String(lobbyId),
        txHash: receipt.hash,
      })

      return {
        lobbyId: lobbyId.toString?.() ?? String(lobbyId),
        txHash: receipt.hash,
      }
    }

    console.warn(
      '[ContractService] LobbyCreated event not found in tx receipt. Returning null.',
    )
    return null
  }

  /**
   * Finalizar lobby on-chain.
   */
  async endLobby(lobbyId: bigint, winners: string[]) {
    this.ensureEnabled()

    console.log('[ContractService] endLobby on-chain', {
      lobbyId: lobbyId.toString(),
      winners,
      network: this.network,
    })

    const tx = await this.unoLobbyV2!.endLobby(lobbyId, winners)
    const receipt = await tx.wait()
    return receipt
  }
}
