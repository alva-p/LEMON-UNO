/**
 * Script standalone para testear endLobby on-chain con firma EIP-712.
 * Uso: cd backend && npx ts-node ../scripts/end-lobby-test.ts
 */
import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const LOBBY_ID = 1n
const CONTRACT = process.env.UNO_LOBBY_V2_BASE_ADDRESS!
const RPC = process.env.BASE_SEPOLIA_RPC!

// Candidates - el script prueba cuál está en el lobby
const CANDIDATES = [
  '0x09326f91bC06e15cd623292bd302EfbA2bDF580f', // dev-wallet
  '0xf7eB8BF19173d22e10837035f25C11C2f7959192', // lemon2
  '0xD82631E74F7c42d306B1f3CDa51251f834c07238', // lemon3
]

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC)
  const network = await provider.getNetwork()
  console.log(`Red: chainId=${network.chainId}`)

  // Cargar wallet desde keystore
  const keystorePath = process.env.KEYSTORE_PATH!.replace('~', process.env.HOME ?? '')
  const keystorePassword = process.env.KEYSTORE_PASSWORD!
  const keystoreJson = fs.readFileSync(keystorePath.trim(), 'utf8')
  const wallet = (await ethers.Wallet.fromEncryptedJson(keystoreJson, keystorePassword.trim())).connect(provider)
  console.log(`Wallet (trustedSigner): ${wallet.address}`)

  // Cargar ABI
  const abiPath = path.resolve(__dirname, '../../abi/UnoLobbyV2.json')
  const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8')).abi
  const contract = new ethers.Contract(CONTRACT, abi, wallet)

  // Info del lobby
  const nonce: bigint = await contract.lobbyNonces(LOBBY_ID)
  const balance = await provider.getBalance(CONTRACT)
  console.log(`\nLobby ${LOBBY_ID}:`)
  console.log(`  Nonce: ${nonce}`)
  console.log(`  Balance contrato: ${ethers.formatEther(balance)} ETH`)

  // Intentar cada candidato como ganador
  // El contrato acepta solo si la dirección está en players[]
  const domain = {
    name: 'UnoLobbyV2',
    version: '1',
    chainId: network.chainId,
    verifyingContract: CONTRACT,
  }
  const types = {
    EndLobby: [
      { name: 'lobbyId', type: 'uint256' },
      { name: 'winner',  type: 'address' },
      { name: 'nonce',   type: 'uint256' },
    ],
  }

  for (const winner of CANDIDATES) {
    console.log(`\nIntentando endLobby con winner=${winner}...`)
    const value = { lobbyId: LOBBY_ID, winner, nonce }
    const signature = await wallet.signTypedData(domain, types, value)

    try {
      // Estimar gas primero para detectar revert barato
      await contract.endLobby.estimateGas(LOBBY_ID, [winner], signature)
      console.log('  ✓ Gas estimado OK, enviando TX...')
      const tx = await contract.endLobby(LOBBY_ID, [winner], signature)
      console.log(`  TX hash: ${tx.hash}`)
      const receipt = await tx.wait()
      console.log(`  Status: ${receipt.status === 1 ? '✅ SUCCESS' : '❌ FAILED'}`)

      const feeEvent = (receipt.logs as any[]).find((l) => l.fragment?.name === 'FeeTaken')
      const endEvent = (receipt.logs as any[]).find((l) => l.fragment?.name === 'LobbyEnded')
      if (endEvent) {
        const amount = endEvent.args.amount ?? endEvent.args.prize ?? endEvent.args[2]
        console.log(`  LobbyEnded: winner=${endEvent.args.winner ?? endEvent.args[1]}${amount != null ? `, amount=${ethers.formatEther(amount)} ETH` : ''}`)
      }
      if (feeEvent) {
        const amount = feeEvent.args.amount ?? feeEvent.args[2]
        console.log(`  FeeTaken:${amount != null ? ` amount=${ethers.formatEther(amount)} ETH` : ''} → ${feeEvent.args.devWallet ?? feeEvent.args[1]}`)
      }

      const balanceAfter = await provider.getBalance(CONTRACT)
      console.log(`  Balance contrato después: ${ethers.formatEther(balanceAfter)} ETH`)
      return
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      if (msg.includes('WinnerNotInLobby') || msg.includes('revert')) {
        console.log(`  ✗ Revert: ${msg.slice(0, 120)}`)
      } else {
        console.error('  Error inesperado:', msg)
        throw err
      }
    }
  }

  console.log('\n❌ Ningún candidato es un jugador válido del lobby.')
}

main().catch(console.error)
