/**
 * Persistencia de estado mínima en disco (JSON).
 *
 * Guarda: lobbies activos + balances ARS sandbox.
 * Se carga al arrancar el servidor y se guarda cada SAVE_INTERVAL_MS.
 *
 * Para producción con alta carga, reemplazar por Redis.
 */
import fs from 'fs'
import path from 'path'
import { LobbyData } from './GameService'

const STATE_FILE = path.resolve(
  process.env.STATE_FILE_PATH ?? path.join(__dirname, '../../data/state.json'),
)
const SAVE_INTERVAL_MS = 30_000 // cada 30 segundos

export interface PersistedState {
  lobbies: LobbyData[]
  arsBalances: Record<string, number>
  houseFeeBalance: number
  savedAt: string
}

function ensureDir() {
  const dir = path.dirname(STATE_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function loadState(): PersistedState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null
    const raw = fs.readFileSync(STATE_FILE, 'utf8')
    const state = JSON.parse(raw) as PersistedState

    // Convertir contractLobbyId de string a bigint (JSON no soporta bigint)
    state.lobbies = state.lobbies.map((l) => ({
      ...l,
      contractLobbyId: l.contractLobbyId != null ? BigInt(l.contractLobbyId as any) : undefined,
      createdAt: new Date(l.createdAt),
    }))

    console.log(`[StateStore] Estado cargado desde ${STATE_FILE} (${state.lobbies.length} lobbies, guardado: ${state.savedAt})`)
    return state
  } catch (err) {
    console.error('[StateStore] Error cargando estado:', err)
    return null
  }
}

export function saveState(state: PersistedState): void {
  try {
    ensureDir()
    // bigint no es serializable con JSON.stringify por defecto
    const serializable = {
      ...state,
      lobbies: state.lobbies.map((l) => ({
        ...l,
        contractLobbyId: l.contractLobbyId?.toString(),
      })),
      savedAt: new Date().toISOString(),
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(serializable, null, 2), 'utf8')
  } catch (err) {
    console.error('[StateStore] Error guardando estado:', err)
  }
}

/**
 * Inicia el guardado periódico del estado.
 * Llama a getState() cada SAVE_INTERVAL_MS y persiste el resultado.
 */
export function startAutosave(getState: () => PersistedState): () => void {
  const timer = setInterval(() => saveState(getState()), SAVE_INTERVAL_MS)
  // Guardar también al cerrar el proceso
  const onExit = (signal: string) => {
    saveState(getState())
    process.exit(signal === 'SIGINT' ? 130 : 0)
  }
  process.on('SIGTERM', () => onExit('SIGTERM'))
  process.on('SIGINT', () => onExit('SIGINT'))

  return () => {
    clearInterval(timer)
    process.off('SIGTERM', onExit)
    process.off('SIGINT', onExit)
  }
}
