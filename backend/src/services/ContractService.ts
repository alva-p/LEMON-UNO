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

function loadABI(name: string) {
  const projectRoot = path.resolve(__dirname, '../../')
  const abiPath = path.join(projectRoot, 'abi', `${name}.json`)
  const abiJson = fs.readFileSync(abiPath, 'utf8')
  return JSON.parse(abiJson).abi
}

/**
 * Carga la wallet admin desde:
 *  1. Foundry keystore  (KEYSTORE_PATH + KEYSTORE_PASSWORD)  ← recomendado prod
 *  2. Private key raw   (DEV_PRIVATE_KEY)                    ← solo dev
 */
async function loadWallet(
  provider: ethers.JsonRpcProvider,
): Promise<ethers.Wallet> {
  const keystorePath = process.env.KEYSTORE_PATH
  const keystorePassword = process.env.KEYSTORE_PASSWORD

  if (keystorePath && keystorePassword) {
    const expanded = keystorePath.startsWith('~')
      ? path.join(process.env.HOME ?? '', keystorePath.slice(1))
      : keystorePath

    const keystoreJson = fs.readFileSync(expanded, 'utf8')
    console.log(`[ContractService] Cargando wallet desde keystore: ${expanded}`)
    const decrypted = await ethers.Wallet.fromEncryptedJson(
      keystoreJson,
      keystorePassword,
    )
    console.log(`[ContractService] Wallet cargada: ${decrypted.address}`)
    return decrypted.connect(provider) as ethers.Wallet
  }

  const rawKey = process.env.DEV_PRIVATE_KEY
  if (rawKey) {
    console.warn(
      '[ContractService] Usando DEV_PRIVATE_KEY (solo para desarrollo). ' +
        'En producción usá KEYSTORE_PATH + KEYSTORE_PASSWORD.',
    )
    return new ethers.Wallet(rawKey, provider)
  }

  throw new Error(
    'No hay configuración de wallet. ' +
      'Configurá KEYSTORE_PATH + KEYSTORE_PASSWORD (producción) ' +
      'o DEV_PRIVATE_KEY (desarrollo).',
  )
}

export class ContractService {
  private provider?: ethers.JsonRpcProvider
  private wallet?: ethers.Wallet
  private unoLobbyV2?: ethers.Contract
  private enabled = false
  private network: 'ETH' | 'BASE'
  /** Resuelve cuando la inicialización async termina */
  private readonly ready: Promise<void>

  constructor(network: 'ETH' | 'BASE' = 'BASE') {
    this.network = network
    this.ready = this._initialize()
  }

  private async _initialize(): Promise<void> {
    try {
      const rpcUrl =
        this.network === 'ETH'
          ? process.env.SEPOLIA_ETH_RPC || process.env.ETH_SEPOLIA_RPC
          : process.env.BASE_SEPOLIA_RPC

      if (!rpcUrl) {
        console.warn(
          `[ContractService] RPC URL no configurada para network=${this.network}. On-chain DISABLED.`,
        )
        return
      }

      this.provider = new ethers.JsonRpcProvider(rpcUrl)

      // Cargar wallet (keystore o private key)
      try {
        this.wallet = await loadWallet(this.provider)
      } catch (err) {
        console.warn(`[ContractService] Wallet no disponible: ${(err as Error).message}. On-chain DISABLED.`)
        return
      }

      const contractAddress =
        this.network === 'ETH'
          ? process.env.UNO_LOBBY_V2_SEPOLIA_ADDRESS ||
            process.env.CONTRACT_ADDRESS_SEPOLIA
          : process.env.UNO_LOBBY_V2_BASE_ADDRESS ||
            process.env.CONTRACT_ADDRESS_BASE_SEPOLIA ||
            process.env.UNO_LOBBY_V2_ADDRESS

      if (!contractAddress) {
        console.warn(
          `[ContractService] Contract address no configurada para network=${this.network}. On-chain DISABLED.`,
        )
        return
      }

      let abi: any
      try {
        abi = loadABI('UnoLobbyV2')
      } catch (err) {
        console.error('[ContractService] No se pudo cargar ABI UnoLobbyV2:', err)
        return
      }

      this.unoLobbyV2 = new ethers.Contract(contractAddress, abi, this.wallet)
      this.enabled = true

      console.log(
        `[ContractService] On-chain ENABLED — network=${this.network}, contract=${contractAddress}, wallet=${this.wallet.address}`,
      )
    } catch (err) {
      console.error('[ContractService] Error de inicialización:', err)
      this.enabled = false
    }
  }

  /** Espera inicialización y valida que esté habilitado */
  private async ensureReady(): Promise<void> {
    await this.ready
    if (!this.enabled || !this.unoLobbyV2) {
      throw new Error(
        'On-chain no configurado (RPC / wallet / ABI / contract address faltante)',
      )
    }
  }

  /**
   * Crear lobby on-chain.
   */
  async createLobby(token: string, entryFee: bigint, maxPlayers: number) {
    await this.ensureReady()

    console.log('[ContractService] createLobby', {
      token,
      entryFee: entryFee.toString(),
      maxPlayers,
      network: this.network,
    })

    const tx = await this.unoLobbyV2!.createLobby(token, entryFee, maxPlayers)
    const receipt = await tx.wait()

    const event = (receipt.logs as any[]).find(
      (log) => log.fragment?.name === 'LobbyCreated',
    )

    if (event) {
      const lobbyId = event.args.lobbyId
      console.log('[ContractService] LobbyCreated →', {
        lobbyId: lobbyId.toString?.() ?? String(lobbyId),
        txHash: receipt.hash,
      })
      return {
        lobbyId: lobbyId.toString?.() ?? String(lobbyId),
        txHash: receipt.hash,
      }
    }

    console.warn('[ContractService] LobbyCreated event no encontrado.')
    return null
  }

  /**
   * Finalizar lobby on-chain vía endLobby con firma EIP-712.
   *
   * La misma wallet (trustedSigner) que firma el resultado también paga el gas.
   * Esto reemplaza el uso de emergencyEndLobby — ahora el backend actúa como
   * árbitro firmante en lugar de explotar privilegios de owner.
   *
   * Flujo:
   *  1. Lee el nonce actual del lobby desde el contrato
   *  2. Firma EndLobby(lobbyId, winner, nonce) con EIP-712
   *  3. Llama endLobby(lobbyId, [winner], signature)
   */
  async endLobby(lobbyId: bigint, winners: string[]) {
    await this.ensureReady()

    if (!winners[0]) throw new Error('Se requiere al menos un ganador')

    const winner = winners[0]
    const contractAddress = await this.unoLobbyV2!.getAddress()

    // 1. Leer nonce actual del lobby (protección anti-replay en el contrato)
    const nonce: bigint = await this.unoLobbyV2!.lobbyNonces(lobbyId)

    // 2. Construir y firmar el mensaje EIP-712
    const network = await this.provider!.getNetwork()
    const domain = {
      name:              'UnoLobbyV2',
      version:           '1',
      chainId:           network.chainId,
      verifyingContract: contractAddress,
    }
    const types = {
      EndLobby: [
        { name: 'lobbyId', type: 'uint256' },
        { name: 'winner',  type: 'address' },
        { name: 'nonce',   type: 'uint256' },
      ],
    }
    const value = { lobbyId, winner, nonce }

    const signature = await this.wallet!.signTypedData(domain, types, value)

    console.log('[ContractService] endLobby', {
      lobbyId:  lobbyId.toString(),
      winner,
      nonce:    nonce.toString(),
      network:  this.network,
      signer:   this.wallet!.address,
    })

    // 3. Llamar endLobby en el contrato con la firma
    const tx = await this.unoLobbyV2!.endLobby(lobbyId, [winner], signature)
    const receipt = await tx.wait()

    const feeEvent = (receipt.logs as any[]).find(
      (log) => log.fragment?.name === 'FeeTaken',
    )
    if (feeEvent) {
      console.log('[ContractService] FeeTaken →', {
        lobbyId:   feeEvent.args.lobbyId?.toString(),
        devWallet: feeEvent.args.devWallet,
        amount:    feeEvent.args.amount?.toString(),
      })
    }

    return receipt
  }

  /**
   * Devuelve la lista de jugadores en un lobby on-chain.
   * Lee los eventos PlayerJoined para evitar el problema de decodificación
   * del array dinámico en el struct.
   */
  async getLobbyPlayers(lobbyId: bigint): Promise<string[]> {
    await this.ensureReady()
    const players = await this.unoLobbyV2!.getLobbyPlayers(lobbyId)
    return players as string[]
  }

  /**
   * Suscribe un callback al evento LobbyStarted.
   * El callback recibe (lobbyId, playerCount).
   * Devuelve una función para cancelar la suscripción.
   */
  onLobbyStarted(
    callback: (lobbyId: bigint, playerCount: bigint) => void,
  ): () => void {
    if (!this.unoLobbyV2) return () => {}

    const handler = (lobbyId: bigint, playerCount: bigint) => {
      console.log(`[ContractService] LobbyStarted — lobbyId=${lobbyId}, players=${playerCount}`)
      callback(lobbyId, playerCount)
    }

    this.unoLobbyV2.on('LobbyStarted', handler)
    return () => { this.unoLobbyV2?.off('LobbyStarted', handler) }
  }

  /**
   * Cierre de emergencia (onlyOwner) — usar solo si endLobby falla
   * o el juego queda en estado inconsistente.
   */
  async emergencyEndLobby(lobbyId: bigint, winners: string[]) {
    await this.ensureReady()

    console.log('[ContractService] emergencyEndLobby (fallback)', {
      lobbyId: lobbyId.toString(),
      winners,
    })

    const tx = await this.unoLobbyV2!.emergencyEndLobby(lobbyId, winners)
    return tx.wait()
  }
}
